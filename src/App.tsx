import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentApprovalRequest,
  AgentMessage,
  AgentQuestionRequest,
  AgentSession,
  AgentToolCall,
  AgentToolResult,
  ChatEvent,
  ConnectionState,
  Conversation,
  ImageAttachment,
  Message,
  MessageStats,
  OllamaModel,
  OllamaShowInfo,
  Params,
  Settings,
} from './types';
import { bridge } from './lib/bridge';
import {
  DEFAULT_PARAMS,
  DEFAULT_SETTINGS,
  createConversation,
  conversationTotals,
  normalizeStore,
  titleFromText,
  uid,
} from './lib/defaults';
import { clamp, cn, estimatePromptTokens, estimateTokens } from './lib/format';
import { conversationToMarkdown, slugify } from './lib/export';
import { readImageAttachments } from './lib/attachments';
import {
  AGENT_BRIEF_INSTRUCTION,
  AGENT_BRIEF_TOOLS,
  AGENT_MAX_STEPS,
  AGENT_READ_TOOLS,
  AGENT_TOOLS,
  buildAgentApiMessages,
} from './lib/agent';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { Inspector } from './components/Inspector';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Toasts, type ToastItem, type ToastTone } from './components/Toasts';
import { Intro } from './components/Intro';
import { CodeWorkspace } from './components/CodeWorkspace';
import { Logo } from './components/icons';
import { applyTheme, resolveTheme } from './lib/theme';

interface ActiveStream {
  requestId: string;
  conversationId: string;
  messageId: string;
  startedAt: number;
  firstTokenAt: number | null;
  content: string;
  thinking: string;
  frame: number | null;
}

interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => void;
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    resolveTheme(DEFAULT_SETTINGS.theme),
  );
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>({ state: 'connecting' });
  const [modelInfo, setModelInfo] = useState<OllamaShowInfo | null>(null);
  const [modelInfoLoading, setModelInfoLoading] = useState(false);
  const [modelInfoNonce, setModelInfoNonce] = useState(0);
  const [streamMeta, setStreamMeta] = useState<{ conversationId: string; messageId: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [draftImages, setDraftImages] = useState<ImageAttachment[]>([]);
  const [showInspector, setShowInspector] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [mode, setMode] = useState<'chat' | 'code'>('chat');
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState('');
  const [agentRun, setAgentRun] = useState<{ sessionId: string; requestId: string } | null>(null);
  const [approval, setApproval] = useState<AgentApprovalRequest | null>(null);
  const [agentQuestion, setAgentQuestion] = useState<AgentQuestionRequest | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0] ?? null;
  const activeRef = useRef<Conversation | null>(null);
  activeRef.current = activeConversation;
  const activeAgent = agentSessions.find((session) => session.id === activeAgentId) ?? agentSessions[0] ?? null;
  const activeAgentRef = useRef<AgentSession | null>(null);
  activeAgentRef.current = activeAgent;
  const agentSessionsRef = useRef<AgentSession[]>([]);
  agentSessionsRef.current = agentSessions;
  const streamRef = useRef<ActiveStream | null>(null);
  const creatingChat = useRef(false);
  const agentBusyRef = useRef(false);
  const agentRequestRef = useRef<string | null>(null);
  const agentStopRef = useRef(false);
  const approvalResolver = useRef<((approved: boolean) => void) | null>(null);
  const questionResolver = useRef<((answer: string | null) => void) | null>(null);
  const autoAcceptSessionsRef = useRef<Record<string, boolean>>({});
  const agentModels = useMemo(
    () => models.filter((model) => model.capabilities?.includes('tools')),
    [models],
  );
  const selectedModel = useMemo(
    () => models.find((model) => model.name === activeConversation?.model),
    [models, activeConversation?.model],
  );
  const modelCapabilities = selectedModel?.capabilities ?? modelInfo?.capabilities ?? [];
  const visionSupported = modelCapabilities.includes('vision');

  useEffect(() => {
    setDraftImages([]);
  }, [activeConversation?.id]);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = uid();
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3600);
  }, []);

  /* ---------------------------------------------------------------- */
  /* connection                                                        */
  /* ---------------------------------------------------------------- */

  const connect = useCallback(async (baseUrl: string) => {
    setConnection((prev) => ({ ...prev, state: 'connecting', error: undefined }));
    setModelsLoading(true);
    const [list, version] = await Promise.all([bridge.listModels(baseUrl), bridge.getVersion(baseUrl)]);
    setModelsLoading(false);
    if (list.ok) {
      setModels(list.models ?? []);
      setConnection({ state: 'online', version: version.ok ? version.version : undefined });
    } else {
      setModels([]);
      setConnection({ state: 'offline', error: list.error });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await bridge.loadStore().catch(() => null);
      if (cancelled) return;

      const data = normalizeStore(stored);

      setSettings(data.settings);
      setConversations(data.conversations);
      setAgentSessions(data.agentSessions);
      const mostRecent = [...data.conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setActiveId(mostRecent?.id ?? null);
      const mostRecentAgent = [...data.agentSessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setActiveAgentId(mostRecentAgent?.id ?? null);
      setHydrated(true);
      setIntroOpen(!data.settings.introSeen);
      await connect(data.settings.baseUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [connect]);

  useEffect(() => {
    if (!hydrated) return;
    if (conversations.length > 0) {
      creatingChat.current = false;
      return;
    }
    if (creatingChat.current) return;
    creatingChat.current = true;
    const model = settings.defaultModel ?? models[0]?.name ?? '';
    const conversation = createConversation(model, settings);
    setConversations([conversation]);
    setActiveId(conversation.id);
  }, [hydrated, conversations.length, models, settings]);

  useEffect(() => {
    if (!hydrated || !activeId) return;
    if (!conversations.some((conversation) => conversation.id === activeId)) {
      setActiveId(conversations[0]?.id ?? null);
    }
  }, [hydrated, activeId, conversations]);

  useEffect(() => {
    if (!models.length) return;
    setConversations((prev) => {
      let changed = false;
      const next = prev.map((conversation) => {
        if (conversation.model && models.some((model) => model.name === conversation.model)) return conversation;
        if (conversation.messages.length > 0) return conversation;
        const preferred =
          settings.defaultModel && models.some((model) => model.name === settings.defaultModel)
            ? settings.defaultModel
            : models[0].name;
        if (conversation.model === preferred) return conversation;
        changed = true;
        return { ...conversation, model: preferred };
      });
      return changed ? next : prev;
    });
  }, [models, settings.defaultModel]);

  useEffect(() => {
    if (!hydrated || agentModels.length === 0) return;
    setAgentSessions((prev) => {
      let changed = false;
      const next = prev.map((session) => {
        if (session.model && agentModels.some((model) => model.name === session.model)) return session;
        if (session.messages.length > 0) return session;
        const preferred =
          settings.agentModel && agentModels.some((model) => model.name === settings.agentModel)
            ? settings.agentModel
            : agentModels[0].name;
        if (session.model === preferred) return session;
        changed = true;
        return { ...session, model: preferred };
      });
      return changed ? next : prev;
    });
  }, [hydrated, agentModels, settings.agentModel]);

  useEffect(() => {
    const model = activeConversation?.model;
    if (!model) {
      setModelInfo(null);
      return;
    }
    let cancelled = false;
    setModelInfoLoading(true);
    bridge
      .showModel(settings.baseUrl, model)
      .then((result) => {
        if (cancelled) return;
        setModelInfo(result.ok ? result.info ?? null : null);
        setModelInfoLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setModelInfo(null);
        setModelInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConversation?.model, settings.baseUrl, modelInfoNonce]);

  /* ---------------------------------------------------------------- */
  /* persistence                                                       */
  /* ---------------------------------------------------------------- */

  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      bridge.saveStore({ settings, conversations, agentSessions }).catch(() => {});
    }, 320);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [hydrated, settings, conversations, agentSessions]);

  /* ---------------------------------------------------------------- */
  /* appearance                                                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    setResolvedTheme(applyTheme(settings.theme));
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setResolvedTheme(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings.theme]);

  /* ---------------------------------------------------------------- */
  /* streaming                                                         */
  /* ---------------------------------------------------------------- */

  const flushStream = useCallback(() => {
    const active = streamRef.current;
    if (!active) return;
    active.frame = null;
    const { content, thinking, conversationId, messageId } = active;
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === messageId ? { ...message, content, thinking: thinking || undefined } : message,
              ),
            }
          : conversation,
      ),
    );
  }, []);

  const scheduleFlush = useCallback(() => {
    const active = streamRef.current;
    if (!active || active.frame !== null) return;
    active.frame = requestAnimationFrame(flushStream);
  }, [flushStream]);

  const finishStream = useCallback(
    (event: ChatEvent) => {
      const active = streamRef.current;
      if (!active) return;
      if (active.frame !== null) cancelAnimationFrame(active.frame);

      const done = event.type === 'done' ? event.data : null;
      let stats: MessageStats | undefined;
      if (done) {
        const promptTokens = done.prompt_eval_count ?? 0;
        const completionTokens = done.eval_count ?? 0;
        const evalMs = (done.eval_duration ?? 0) / 1e6;
        const totalMs = (done.total_duration ?? 0) / 1e6 || performance.now() - active.startedAt;
        const decodeWindow = active.firstTokenAt ? performance.now() - active.firstTokenAt : totalMs;
        stats = {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          tokensPerSecond:
            evalMs > 0
              ? completionTokens / (evalMs / 1000)
              : decodeWindow > 0
                ? completionTokens / (decodeWindow / 1000)
                : 0,
          ttftMs: active.firstTokenAt ? Math.round(active.firstTokenAt - active.startedAt) : null,
          totalDurationMs: totalMs,
          loadDurationMs: (done.load_duration ?? 0) / 1e6,
          promptDurationMs: (done.prompt_eval_duration ?? 0) / 1e6,
          evalDurationMs: evalMs,
        };
      }

      const error = event.type === 'error' ? event.error : undefined;
      const stopped = event.type === 'aborted';
      const empty = !active.content.trim() && !active.thinking.trim();
      const emptyError =
        event.type === 'done' && empty
          ? 'The model returned an empty response. Try a different model or raise num_predict.'
          : undefined;

      const patch = {
        content: active.content,
        thinking: active.thinking || undefined,
        stats,
        error: error ?? emptyError,
        stopped,
      };

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== active.conversationId) return conversation;
          const exists = conversation.messages.some((message) => message.id === active.messageId);
          return {
            ...conversation,
            updatedAt: Date.now(),
            messages: exists
              ? conversation.messages.map((message) =>
                  message.id === active.messageId ? { ...message, ...patch } : message,
                )
              : [
                  ...conversation.messages,
                  {
                    id: active.messageId,
                    role: 'assistant' as const,
                    model: conversation.model,
                    createdAt: Date.now(),
                    ...patch,
                  },
                ],
          };
        }),
      );

      streamRef.current = null;
      setStreamMeta(null);

      if (error) toast(error, 'error');
      else if (done?.done_reason === 'length') toast('Output stopped at the num_predict limit.', 'info');
      else if (stopped) toast('Generation stopped.', 'info');
    },
    [toast],
  );

  const handlerRef = useRef<(event: ChatEvent) => void>(() => {});
  handlerRef.current = (event: ChatEvent) => {
    const active = streamRef.current;
    if (!active || event.requestId !== active.requestId) return;
    if (event.type === 'chunk') {
      const message = event.data.message;
      if (message?.content) {
        if (active.firstTokenAt === null) active.firstTokenAt = performance.now();
        active.content += message.content;
      }
      if (message?.thinking) {
        if (active.firstTokenAt === null) active.firstTokenAt = performance.now();
        active.thinking += message.thinking;
      }
      scheduleFlush();
      return;
    }
    finishStream(event);
  };

  useEffect(() => bridge.onChatEvent((event) => handlerRef.current(event)), []);

  const startCompletion = useCallback(
    async (conversation: Conversation, history: Message[]) => {
      const requestId = uid();
      const messageId = uid();
      const placeholder: Message = {
        id: messageId,
        role: 'assistant',
        content: '',
        model: conversation.model,
        createdAt: Date.now(),
      };

      streamRef.current = {
        requestId,
        conversationId: conversation.id,
        messageId,
        startedAt: performance.now(),
        firstTokenAt: null,
        content: '',
        thinking: '',
        frame: null,
      };
      setStreamMeta({ conversationId: conversation.id, messageId });
      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversation.id ? { ...item, messages: [...item.messages, placeholder] } : item,
        ),
      );

      const apiMessages = [
        ...(conversation.systemPrompt.trim()
          ? [{ role: 'system', content: conversation.systemPrompt.trim() }]
          : []),
        ...history
          .filter((message) => message.content.trim() || message.images?.length)
          .map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.images?.length ? { images: message.images.map((image) => image.data) } : {}),
          })),
      ];

      try {
        const result = await bridge.startChat({
          requestId,
          baseUrl: settings.baseUrl,
          model: conversation.model,
          messages: apiMessages,
          options: conversation.params,
          keepAlive: settings.keepAlive,
          think: conversation.think ?? null,
        });
        if (!result.ok) {
          const active = streamRef.current;
          if (active && active.requestId === requestId) {
            finishStream({ requestId, type: 'error', error: result.error || 'Could not start the request.' });
          }
        }
      } catch (error) {
        const active = streamRef.current;
        if (active && active.requestId === requestId) {
          finishStream({
            requestId,
            type: 'error',
            error: error instanceof Error ? error.message : 'Could not reach Ollama.',
          });
        }
      }
    },
    [settings.baseUrl, settings.keepAlive, finishStream],
  );

  const send = useCallback(
    (text?: string) => {
      const content = (text ?? draft).trim();
      const images = draftImages;
      const conversation = activeRef.current;
      if ((!content && images.length === 0) || !conversation) return;
      if (streamRef.current) {
        toast('A response is already generating.', 'info');
        return;
      }
      if (!conversation.model) {
        toast('Select a model first.', 'error');
        return;
      }
      if (connection.state === 'offline') {
        toast('Ollama is offline — retry the connection first.', 'error');
        return;
      }
      if (images.length > 0 && !visionSupported) {
        toast('This model does not support image input.', 'error');
        return;
      }
      const userMessage: Message = {
        id: uid(),
        role: 'user',
        content,
        ...(images.length > 0 ? { images } : {}),
        createdAt: Date.now(),
      };
      const history = [...conversation.messages, userMessage];
      const nextConversation: Conversation = {
        ...conversation,
        title:
          conversation.messages.length === 0
            ? titleFromText(content || images[0]?.name || 'Image')
            : conversation.title,
        messages: history,
        updatedAt: Date.now(),
      };
      setConversations((prev) => prev.map((item) => (item.id === nextConversation.id ? nextConversation : item)));
      setDraft('');
      setDraftImages([]);
      void startCompletion(nextConversation, history);
    },
    [draft, draftImages, visionSupported, connection.state, startCompletion, toast],
  );

  const regenerate = useCallback(() => {
    const conversation = activeRef.current;
    if (!conversation || streamRef.current) return;
    const messages = [...conversation.messages];
    while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') messages.pop();
    if (messages.length === 0) return;
    const next = { ...conversation, messages, updatedAt: Date.now() };
    setConversations((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    void startCompletion(next, messages);
  }, [startCompletion]);

  const stop = useCallback(() => {
    const active = streamRef.current;
    if (active) void bridge.abortChat(active.requestId);
  }, []);

  const newChat = useCallback(() => {
    if (streamRef.current) {
      toast('Stop the current response first.', 'info');
      return;
    }
    setMode('chat');
    const model =
      settings.defaultModel && models.some((item) => item.name === settings.defaultModel)
        ? settings.defaultModel
        : activeRef.current?.model || models[0]?.name || '';
    const conversation = createConversation(model, settings);
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    setDraft('');
    setDraftImages([]);
  }, [models, settings, toast]);

  const selectConversation = useCallback((id: string) => {
    setMode('chat');
    setActiveId(id);
    setDraft('');
    setDraftImages([]);
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((item) => (item.id === id ? { ...item, title } : item)));
  }, []);

  const stopIfStreaming = useCallback(
    (conversationId: string) => {
      const active = streamRef.current;
      if (active && active.conversationId === conversationId) {
        void bridge.abortChat(active.requestId);
      }
    },
    [],
  );

  const requestDeleteConversation = useCallback(
    (conversation: Conversation) => {
      setConfirmRequest({
        title: `Delete "${conversation.title}"?`,
        body: 'This removes the conversation from this machine. It cannot be undone.',
        confirmLabel: 'Delete chat',
        danger: true,
        action: () => {
          stopIfStreaming(conversation.id);
          setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
          setConfirmRequest(null);
          toast('Conversation deleted.', 'info');
        },
      });
    },
    [stopIfStreaming, toast],
  );

  const truncateFrom = useCallback(
    (messageId: string) => {
      const conversation = activeRef.current;
      if (!conversation) return;
      if (streamRef.current) {
        toast('Stop generation before editing the transcript.', 'info');
        return;
      }
      setConversations((prev) =>
        prev.map((item) => {
          if (item.id !== conversation.id) return item;
          const index = item.messages.findIndex((message) => message.id === messageId);
          if (index < 0) return item;
          return { ...item, messages: item.messages.slice(0, index), updatedAt: Date.now() };
        }),
      );
    },
    [toast],
  );

  const patchActive = useCallback((updater: (conversation: Conversation) => Conversation) => {
    const id = activeRef.current?.id;
    if (!id) return;
    setConversations((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  }, []);

  const updateParams = useCallback(
    (patch: Partial<Params>) => {
      patchActive((conversation) => ({
        ...conversation,
        params: { ...conversation.params, ...patch },
        updatedAt: Date.now(),
      }));
    },
    [patchActive],
  );

  const setSystemPrompt = useCallback(
    (value: string) => {
      patchActive((conversation) => ({ ...conversation, systemPrompt: value, updatedAt: Date.now() }));
    },
    [patchActive],
  );

  const setThink = useCallback(
    (value: boolean | null) => {
      patchActive((conversation) => ({ ...conversation, think: value, updatedAt: Date.now() }));
    },
    [patchActive],
  );

  const attachImages = useCallback(
    async (files: FileList) => {
      if (!visionSupported) {
        toast('This model does not support image input.', 'error');
        return;
      }
      const { images, errors } = await readImageAttachments(files, draftImages.length);
      if (images.length > 0) setDraftImages((prev) => [...prev, ...images]);
      errors.forEach((error) => toast(error, 'error'));
    },
    [draftImages.length, visionSupported, toast],
  );

  const removeDraftImage = useCallback((id: string) => {
    setDraftImages((prev) => prev.filter((image) => image.id !== id));
  }, []);

  const changeModel = useCallback(
    (name: string) => {
      const conversation = activeRef.current;
      if (!conversation) return;
      if (draftImages.length > 0) {
        setDraftImages([]);
        toast('Draft images cleared for the new model.', 'info');
      }
      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversation.id ? { ...item, model: name, think: null, updatedAt: Date.now() } : item,
        ),
      );
      setSettings((prev) => ({ ...prev, defaultModel: name }));
    },
    [draftImages.length, toast],
  );

  const requestClearContext = useCallback(() => {
    const conversation = activeRef.current;
    if (!conversation) return;
    setConfirmRequest({
      title: 'Clear this conversation?',
      body: 'Messages are removed. The system prompt and sampling settings are kept.',
      confirmLabel: 'Clear context',
      danger: true,
      action: () => {
        setConversations((prev) =>
          prev.map((item) => (item.id === conversation.id ? { ...item, messages: [], updatedAt: Date.now() } : item)),
        );
        setConfirmRequest(null);
        toast('Context cleared.', 'success');
      },
    });
  }, [toast]);

  const copy = useCallback(
    async (text: string, message = 'Copied to clipboard.') => {
      try {
        await navigator.clipboard.writeText(text);
        toast(message, 'success');
      } catch {
        toast('Clipboard is unavailable.', 'error');
      }
    },
    [toast],
  );

  const exportConversation = useCallback(async () => {
    const conversation = activeRef.current;
    if (!conversation) return;
    const result = await bridge.exportChat(slugify(conversation.title), conversationToMarkdown(conversation));
    if (result.ok) toast('Conversation exported.', 'success');
    else if (result.error) toast(result.error, 'error');
  }, [toast]);

  const saveSettings = useCallback(
    (next: Settings) => {
      setSettings(next);
      setShowSettings(false);
      void connect(next.baseUrl);
      toast('Settings saved.', 'success');
    },
    [connect, toast],
  );

  const retryConnection = useCallback(() => {
    void connect(settings.baseUrl);
  }, [connect, settings.baseUrl]);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => ({ ...prev, theme: resolvedTheme === 'dark' ? 'light' : 'dark' }));
  }, [resolvedTheme]);

  const enterWorkspace = useCallback(() => {
    setIntroOpen(false);
    setSettings((prev) => (prev.introSeen ? prev : { ...prev, introSeen: true }));
  }, []);

  /* ---------------------------------------------------------------- */
  /* coding agent                                                      */
  /* ---------------------------------------------------------------- */

  const patchAgentSession = useCallback(
    (sessionId: string, updater: (session: AgentSession) => AgentSession) => {
      setAgentSessions((prev) =>
        prev.map((session) => (session.id === sessionId ? updater(session) : session)),
      );
    },
    [],
  );

  const appendAgentMessage = useCallback(
    (sessionId: string, message: AgentMessage) => {
      patchAgentSession(sessionId, (session) => ({
        ...session,
        messages: [...session.messages, message],
        updatedAt: Date.now(),
      }));
    },
    [patchAgentSession],
  );

  const updateAgentMessage = useCallback(
    (sessionId: string, messageId: string, patch: Partial<AgentMessage>) => {
      patchAgentSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        ),
        updatedAt: Date.now(),
      }));
    },
    [patchAgentSession],
  );

  const settleApproval = useCallback((approved: boolean) => {
    const resolve = approvalResolver.current;
    approvalResolver.current = null;
    setApproval(null);
    resolve?.(approved);
  }, []);

  const askApproval = useCallback(
    (request: AgentApprovalRequest) =>
      new Promise<boolean>((resolve) => {
        approvalResolver.current = resolve;
        setMode('code');
        setActiveAgentId(request.sessionId);
        setApproval(request);
      }),
    [],
  );

  const settleQuestion = useCallback((answer: string | null) => {
    const resolve = questionResolver.current;
    questionResolver.current = null;
    setAgentQuestion(null);
    resolve?.(answer);
  }, []);

  const askQuestion = useCallback(
    (request: AgentQuestionRequest) =>
      new Promise<string | null>((resolve) => {
        questionResolver.current = resolve;
        setMode('code');
        setActiveAgentId(request.sessionId);
        setAgentQuestion(request);
      }),
    [],
  );

  const stopAgent = useCallback(() => {
    agentStopRef.current = true;
    if (agentRequestRef.current) void bridge.abortAgent(agentRequestRef.current);
    const resolveApproval = approvalResolver.current;
    approvalResolver.current = null;
    setApproval(null);
    resolveApproval?.(false);
    const resolveQuestion = questionResolver.current;
    questionResolver.current = null;
    setAgentQuestion(null);
    resolveQuestion?.(null);
  }, []);

  const newAgentProject = useCallback(async () => {
    if (agentBusyRef.current) {
      toast('Stop the current coding task first.', 'info');
      return;
    }
    setMode('code');
    try {
      const picked = await bridge.pickProject();
      if (!picked.ok || !picked.path) {
        if (picked.error) toast(picked.error, 'error');
        return;
      }
      const model =
        settings.agentModel && agentModels.some((item) => item.name === settings.agentModel)
          ? settings.agentModel
          : agentModels[0]?.name || '';
      const now = Date.now();
      const session: AgentSession = {
        id: uid(),
        title: 'New coding task',
        projectPath: picked.path,
        model,
        autoAcceptCommands: Boolean(settings.agentAutoAcceptCommands),
        briefed: false,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      setAgentSessions((prev) => [session, ...prev]);
      setActiveAgentId(session.id);
      setAgentDraft('');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not open that project folder.', 'error');
    }
  }, [agentModels, settings.agentModel, toast]);

  const selectAgentSession = useCallback((id: string) => {
    setMode('code');
    setActiveAgentId(id);
    setAgentDraft('');
  }, []);

  const linkAgentModel = useCallback(
    (name: string) => {
      setSettings((prev) => ({ ...prev, agentModel: name }));
      const session = activeAgentRef.current;
      if (session) {
        patchAgentSession(session.id, (item) => ({ ...item, model: name, updatedAt: Date.now() }));
      }
    },
    [patchAgentSession],
  );

  const setAgentAutoAcceptCommands = useCallback(
    (enabled: boolean) => {
      const session = activeAgentRef.current;
      if (!session) {
        setSettings((prev) => ({ ...prev, agentAutoAcceptCommands: enabled }));
        return;
      }
      autoAcceptSessionsRef.current[session.id] = enabled;
      patchAgentSession(session.id, (item) => ({
        ...item,
        autoAcceptCommands: enabled,
        updatedAt: Date.now(),
      }));
      if (enabled && approval?.sessionId === session.id && approval.call.name === 'run_command') {
        settleApproval(true);
      }
    },
    [approval, patchAgentSession, settleApproval],
  );

  const requestDeleteAgentSession = useCallback(
    (session: AgentSession) => {
      setConfirmRequest({
        title: `Delete "${session.title}"?`,
        body: `This removes the coding session from this machine. Files in ${session.projectPath} are not deleted.`,
        confirmLabel: 'Delete session',
        danger: true,
        action: () => {
          if (agentRun?.sessionId === session.id) stopAgent();
          const remaining = agentSessionsRef.current.filter((item) => item.id !== session.id);
          setAgentSessions(remaining);
          setActiveAgentId((current) => (current === session.id ? remaining[0]?.id ?? null : current));
          setConfirmRequest(null);
          toast('Coding session deleted.', 'info');
        },
      });
    },
    [agentRun?.sessionId, stopAgent, toast],
  );

  const sendAgentTask = useCallback(
    async (text?: string) => {
      const content = (text ?? agentDraft).trim();
      const session = activeAgentRef.current;
      if (!content || !session || agentBusyRef.current) return;
      if (!session.model || !agentModels.some((item) => item.name === session.model)) {
        toast('Link a tool-capable coding model first.', 'error');
        return;
      }
      if (connection.state === 'offline') {
        toast('Ollama is offline — retry the connection first.', 'error');
        return;
      }

      const userMessage: AgentMessage = {
        id: uid(),
        role: 'user',
        content,
        createdAt: Date.now(),
      };
      let history = [...session.messages, userMessage];
      const nextSession: AgentSession = {
        ...session,
        title: session.messages.length === 0 ? titleFromText(content) : session.title,
        messages: history,
        updatedAt: Date.now(),
      };
      setAgentSessions((prev) => prev.map((item) => (item.id === session.id ? nextSession : item)));
      setAgentDraft('');
      setMode('code');
      agentBusyRef.current = true;
      agentStopRef.current = false;
      setAgentRun({ sessionId: session.id, requestId: '' });

      let finished = false;
      let stopped = false;
      try {
        if (!session.briefed && session.messages.length === 0) {
          const briefRequestId = uid();
          agentRequestRef.current = briefRequestId;
          setAgentRun({ sessionId: session.id, requestId: briefRequestId });
          const briefSession: AgentSession = { ...session, messages: history };
          const briefMessages = buildAgentApiMessages(briefSession);
          briefMessages.splice(1, 0, { role: 'system', content: AGENT_BRIEF_INSTRUCTION });
          const briefResult = await bridge.agentChat({
            requestId: briefRequestId,
            baseUrl: settings.baseUrl,
            model: session.model,
            messages: briefMessages,
            tools: AGENT_BRIEF_TOOLS,
            options: {
              ...settings.params,
              temperature: 0.2,
              num_ctx: Math.max(16384, settings.params.num_ctx),
              num_predict: 1024,
            },
            keepAlive: settings.keepAlive,
          });
          if (!briefResult.ok) {
            if (briefResult.aborted || agentStopRef.current) {
              stopped = true;
              return;
            }
            const failure: AgentMessage = {
              id: uid(),
              role: 'assistant',
              content: '',
              createdAt: Date.now(),
              model: session.model,
              error: briefResult.error || 'The coding model could not prepare clarifying questions.',
            };
            appendAgentMessage(session.id, failure);
            history = [...history, failure];
            toast(failure.error || 'The coding model could not prepare clarifying questions.', 'error');
            return;
          }

          const briefText = briefResult.message?.content?.trim() ?? '';
          const briefCall = (briefResult.message?.tool_calls ?? []).find((call) => call.name === 'ask_user');
          const askedQuestion = briefCall ? String(briefCall.arguments?.question ?? '').trim() : '';
          const textQuestion = !askedQuestion && briefText.includes('?') ? briefText.slice(0, 2000) : '';
          const question = askedQuestion
            || textQuestion
            || 'Before I start, what should the finished result look like, and are there any constraints, existing patterns, or approaches I should use or avoid?';
          const briefOptions = briefCall && Array.isArray(briefCall.arguments?.options)
            ? briefCall.arguments.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 4)
            : [];
          const call: AgentToolCall = {
            name: 'ask_user',
            arguments: { question, ...(briefOptions.length ? { options: briefOptions } : {}) },
          };
          const assistant: AgentMessage = {
            id: uid(),
            role: 'assistant',
            content: briefCall ? briefText : '',
            createdAt: Date.now(),
            model: session.model,
            toolCalls: [call],
          };
          const toolMessage: AgentMessage = {
            id: uid(),
            role: 'tool',
            content: '',
            createdAt: Date.now(),
            toolName: 'ask_user',
            toolArguments: call.arguments,
            toolStatus: 'waiting',
          };
          appendAgentMessage(session.id, assistant);
          appendAgentMessage(session.id, toolMessage);

          const answer = await askQuestion({
            sessionId: session.id,
            messageId: toolMessage.id,
            question,
            options: briefOptions,
          });
          if (agentStopRef.current) {
            updateAgentMessage(session.id, toolMessage.id, {
              toolStatus: 'denied',
              toolError: 'Stopped by user.',
            });
            stopped = true;
            return;
          }
          const answerText = (answer ?? '').trim();
          const resultText = answerText
            ? `User answer:\n${answerText}`
            : 'The user skipped the question. Proceed with sensible defaults and state your assumptions clearly.';
          const answered: AgentMessage = {
            ...toolMessage,
            toolStatus: 'done',
            toolResult: resultText,
          };
          updateAgentMessage(session.id, toolMessage.id, {
            toolStatus: 'done',
            toolResult: resultText,
          });
          patchAgentSession(session.id, (item) => ({ ...item, briefed: true, updatedAt: Date.now() }));
          history = [...history, assistant, answered];
        }

        for (let step = 0; step < AGENT_MAX_STEPS; step += 1) {
          if (agentStopRef.current) {
            stopped = true;
            break;
          }
          const requestId = uid();
          agentRequestRef.current = requestId;
          setAgentRun({ sessionId: session.id, requestId });
          const apiSession: AgentSession = { ...session, messages: history };
          const result = await bridge.agentChat({
            requestId,
            baseUrl: settings.baseUrl,
            model: session.model,
            messages: buildAgentApiMessages(apiSession),
            tools: AGENT_TOOLS,
            options: {
              ...settings.params,
              temperature: 0.15,
              num_ctx: Math.max(32768, settings.params.num_ctx),
              num_predict: 8192,
            },
            keepAlive: settings.keepAlive,
          });

          if (!result.ok) {
            if (result.aborted || agentStopRef.current) {
              stopped = true;
              break;
            }
            const failure: AgentMessage = {
              id: uid(),
              role: 'assistant',
              content: '',
              createdAt: Date.now(),
              model: session.model,
              error: result.error || 'The coding model request failed.',
            };
            appendAgentMessage(session.id, failure);
            history = [...history, failure];
            toast(failure.error || 'The coding model request failed.', 'error');
            break;
          }

          const responseContent = result.message?.content?.trim() ?? '';
          const toolCalls = result.message?.tool_calls ?? [];
          const assistant: AgentMessage = {
            id: uid(),
            role: 'assistant',
            content: responseContent,
            createdAt: Date.now(),
            model: session.model,
            toolCalls: toolCalls.length ? toolCalls : undefined,
          };
          appendAgentMessage(session.id, assistant);
          history = [...history, assistant];

          if (toolCalls.length === 0) {
            finished = true;
            if (!responseContent) {
              const note: AgentMessage = {
                id: uid(),
                role: 'assistant',
                content: '',
                createdAt: Date.now(),
                model: session.model,
                error: 'The model returned no answer or tool calls. Try another tool-capable model.',
              };
              appendAgentMessage(session.id, note);
              history = [...history, note];
            }
            break;
          }

          for (const call of toolCalls) {
            if (agentStopRef.current) {
              stopped = true;
              break;
            }
            const known = AGENT_TOOLS.some((tool) => tool.function.name === call.name);
            const mutating = !AGENT_READ_TOOLS.has(call.name);
            const currentSession = agentSessionsRef.current.find((item) => item.id === session.id) ?? session;
            const autoCommand = call.name === 'run_command'
              && Boolean(
                autoAcceptSessionsRef.current[session.id]
                  ?? currentSession.autoAcceptCommands
                  ?? settings.agentAutoAcceptCommands,
              );
            const toolMessage: AgentMessage = {
              id: uid(),
              role: 'tool',
              content: '',
              createdAt: Date.now(),
              toolName: call.name,
              toolArguments: call.arguments,
              toolStatus: !known
                ? 'error'
                : call.name === 'ask_user'
                  ? 'waiting'
                  : mutating && !autoCommand
                    ? 'pending'
                    : 'running',
              toolError: known ? undefined : `Unknown tool: ${call.name}`,
            };
            appendAgentMessage(session.id, toolMessage);
            history = [...history, toolMessage];

            if (!known) continue;

            if (call.name === 'ask_user') {
              const question = String(call.arguments?.question ?? '').trim();
              if (!question) {
                const failed: AgentMessage = {
                  ...toolMessage,
                  toolStatus: 'error',
                  toolError: 'The model asked an empty question.',
                };
                updateAgentMessage(session.id, toolMessage.id, {
                  toolStatus: 'error',
                  toolError: failed.toolError,
                });
                history[history.length - 1] = failed;
                continue;
              }
              const rawOptions = Array.isArray(call.arguments?.options) ? call.arguments.options : [];
              const options = rawOptions
                .map((option) => String(option).trim())
                .filter(Boolean)
                .slice(0, 4);
              const answer = await askQuestion({
                sessionId: session.id,
                messageId: toolMessage.id,
                question,
                options,
              });
              if (agentStopRef.current) {
                updateAgentMessage(session.id, toolMessage.id, {
                  toolStatus: 'denied',
                  toolError: 'Stopped by user.',
                });
                stopped = true;
                break;
              }
              const answerText = (answer ?? '').trim();
              const resultText = answerText
                ? `User answer:\n${answerText}`
                : 'The user skipped the question. Proceed with sensible defaults and state your assumptions clearly.';
              const answered: AgentMessage = {
                ...toolMessage,
                toolStatus: 'done',
                toolResult: resultText,
              };
              updateAgentMessage(session.id, toolMessage.id, {
                toolStatus: 'done',
                toolResult: resultText,
              });
              history[history.length - 1] = answered;
              continue;
            }

            if (mutating && !autoCommand) {
              const approved = await askApproval({
                sessionId: session.id,
                messageId: toolMessage.id,
                call,
              });
              if (!approved || agentStopRef.current) {
                const denied: AgentMessage = {
                  ...toolMessage,
                  toolStatus: 'denied',
                  toolError: 'Denied by user.',
                };
                updateAgentMessage(session.id, toolMessage.id, {
                  toolStatus: 'denied',
                  toolError: 'Denied by user.',
                });
                history[history.length - 1] = denied;
                if (agentStopRef.current) {
                  stopped = true;
                  break;
                }
                continue;
              }
            }

            updateAgentMessage(session.id, toolMessage.id, { toolStatus: 'running' });
            let toolResult: AgentToolResult;
            try {
              toolResult = await bridge.runAgentTool({
                projectPath: session.projectPath,
                name: call.name,
                args: call.arguments,
              });
            } catch (error) {
              toolResult = {
                ok: false,
                error: error instanceof Error ? error.message : 'The tool failed.',
              };
            }
            const finalTool: AgentMessage = {
              ...toolMessage,
              toolStatus: toolResult.ok ? 'done' : 'error',
              toolResult: toolResult.output,
              toolError: toolResult.ok ? undefined : toolResult.error || 'The tool failed.',
            };
            updateAgentMessage(session.id, toolMessage.id, {
              toolStatus: finalTool.toolStatus,
              toolResult: finalTool.toolResult,
              toolError: finalTool.toolError,
            });
            history[history.length - 1] = finalTool;
            if (agentStopRef.current) {
              stopped = true;
              break;
            }
          }

          if (stopped) break;
        }

        if (!finished && !stopped) {
          const note: AgentMessage = {
            id: uid(),
            role: 'assistant',
            content: '',
            createdAt: Date.now(),
            model: session.model,
            error: `Stopped after ${AGENT_MAX_STEPS} model turns. Send a follow-up to keep going.`,
          };
          appendAgentMessage(session.id, note);
          toast('The agent reached its step limit.', 'info');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The coding agent stopped unexpectedly.';
        appendAgentMessage(session.id, {
          id: uid(),
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          model: session.model,
          error: message,
        });
        toast(message, 'error');
      } finally {
        agentBusyRef.current = false;
        agentRequestRef.current = null;
        setAgentRun(null);
        if (stopped) toast('Agent stopped.', 'info');
      }
    },
    [
      agentDraft,
      agentModels,
      appendAgentMessage,
      askApproval,
      askQuestion,
      connection.state,
      patchAgentSession,
      settings,
      toast,
      updateAgentMessage,
    ],
  );

  const zoomApp = useCallback(
    async (direction: 'in' | 'out' | 'reset') => {
      try {
        const result = await bridge.zoom(direction);
        if (result.ok) toast(`Zoom ${result.percent}%`, 'info');
      } catch {
        /* Zoom is only available in the desktop shell. */
      }
    },
    [toast],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.shiftKey && (event.code === 'Equal' || event.code === 'NumpadAdd')) {
        event.preventDefault();
        void zoomApp('in');
        return;
      }
      if (event.shiftKey && (event.code === 'Minus' || event.code === 'NumpadSubtract')) {
        event.preventDefault();
        void zoomApp('out');
        return;
      }
      if (event.shiftKey && (event.code === 'Digit0' || event.code === 'Numpad0')) {
        event.preventDefault();
        void zoomApp('reset');
        return;
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        newChat();
      } else if (event.key === ',') {
        event.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat, zoomApp]);

  /* ---------------------------------------------------------------- */
  /* derived telemetry                                                 */
  /* ---------------------------------------------------------------- */

  const contextMetrics = useMemo(() => {
    const conversation = activeConversation;
    const messages = conversation?.messages ?? [];
    const windowSize = conversation?.params.num_ctx || settings.params.num_ctx || 8192;
    const systemPrompt = conversation?.systemPrompt ?? '';

    let lastMeasuredIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].stats) {
        lastMeasuredIndex = index;
        break;
      }
    }

    let used = 0;
    let measured = false;
    let start = messages.length;
    if (lastMeasuredIndex >= 0) {
      const stats = messages[lastMeasuredIndex].stats as MessageStats;
      used = stats.promptTokens + stats.completionTokens;
      measured = true;
      start = lastMeasuredIndex + 1;
    } else {
      used = estimatePromptTokens(
        messages.map((message) => ({ role: message.role, content: message.content })),
        systemPrompt,
      );
    }

    let trailing = false;
    for (let index = start; index < messages.length; index += 1) {
      used += estimateTokens(messages[index].content) + 4;
      trailing = true;
    }

    used = Math.max(0, Math.round(used));
    const percent = windowSize > 0 ? clamp((used / windowSize) * 100, 0, 100) : 0;
    return {
      used,
      measured: measured && !trailing,
      systemTokens: estimateTokens(systemPrompt),
      windowSize,
      percent,
      remaining: Math.max(0, windowSize - used),
      streaming: Boolean(streamMeta && conversation && streamMeta.conversationId === conversation.id),
    };
  }, [activeConversation, settings.params.num_ctx, streamMeta]);

  const usage = useMemo(
    () => conversationTotals(activeConversation?.messages ?? []),
    [activeConversation?.messages],
  );

  const streamingMessageId =
    streamMeta && activeConversation && streamMeta.conversationId === activeConversation.id
      ? streamMeta.messageId
      : null;
  const streaming = Boolean(streamingMessageId);

  if (!hydrated || !activeConversation) {
    return (
      <div className="boot">
        <Logo size={48} />
        <div className="boot-text">BTR-Ollama</div>
        <div className="boot-sub">Loading your local workspace…</div>
      </div>
    );
  }

  return (
    <div className={cn('app', mode === 'chat' && showInspector && 'inspector-open')}>
      <Sidebar
        mode={mode}
        conversations={conversations}
        activeId={activeConversation.id}
        streamingId={streamMeta?.conversationId ?? null}
        agentSessions={agentSessions}
        activeAgentId={activeAgent?.id ?? null}
        agentBusyId={agentRun?.sessionId ?? null}
        connection={connection}
        platform={bridge.platform}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
        onModeChange={setMode}
        onSelect={selectConversation}
        onNew={newChat}
        onRename={renameConversation}
        onDelete={requestDeleteConversation}
        onNewAgent={newAgentProject}
        onSelectAgent={selectAgentSession}
        onDeleteAgent={requestDeleteAgentSession}
        onOpenSettings={() => setShowSettings(true)}
      />

      {mode === 'code' ? (
        <CodeWorkspace
          session={activeAgent}
          linkedModel={activeAgent?.model || settings.agentModel || ''}
          models={agentModels}
          baseUrl={settings.baseUrl}
          modelsLoading={modelsLoading}
          connection={connection}
          draft={agentDraft}
          busy={Boolean(agentRun && activeAgent && agentRun.sessionId === activeAgent.id)}
          approval={approval}
          question={agentQuestion}
          autoAcceptCommands={
            activeAgent
              ? (activeAgent.autoAcceptCommands ?? settings.agentAutoAcceptCommands)
              : settings.agentAutoAcceptCommands
          }
          onChangeDraft={setAgentDraft}
          onSend={sendAgentTask}
          onStop={stopAgent}
          onUsePrompt={setAgentDraft}
          onModelChange={linkAgentModel}
          onNewProject={newAgentProject}
          onRefreshModels={retryConnection}
          onOpenSettings={() => setShowSettings(true)}
          onResolveApproval={settleApproval}
          onResolveQuestion={settleQuestion}
          onSetAutoAcceptCommands={setAgentAutoAcceptCommands}
        />
      ) : (
        <>
          <main className="main">
            <ChatHeader
              conversation={activeConversation}
              models={models}
              baseUrl={settings.baseUrl}
              modelsLoading={modelsLoading}
              connection={connection}
              context={contextMetrics}
              inspectorOpen={showInspector}
              onModelChange={changeModel}
              onRefreshModels={retryConnection}
              onToggleInspector={() => setShowInspector((prev) => !prev)}
              onExport={exportConversation}
            />

            <MessageList
              conversation={activeConversation}
              connection={connection}
              streamingMessageId={streamingMessageId}
              showThinking={settings.showThinking}
              autoScroll={settings.autoScroll}
              onCopy={copy}
              onRegenerate={regenerate}
              onTruncate={truncateFrom}
              onUsePrompt={setDraft}
              onOpenSettings={() => setShowSettings(true)}
              onRetry={retryConnection}
            />

            <Composer
              value={draft}
              estimate={draft.trim() ? estimateTokens(draft) : 0}
              modelName={activeConversation.model}
              streaming={streaming}
              busy={Boolean(streamMeta)}
              enterToSend={settings.enterToSend}
              images={draftImages}
              visionSupported={visionSupported}
              onChange={setDraft}
              onAttach={attachImages}
              onRemoveImage={removeDraftImage}
              onSend={() => send()}
              onStop={stop}
            />
          </main>

          <div className={cn('inspector-shell', !showInspector && 'is-hidden')}>
            <Inspector
              conversation={activeConversation}
              model={selectedModel}
              modelInfo={modelInfo}
              modelInfoLoading={modelInfoLoading}
              context={contextMetrics}
              usage={usage}
              onParams={updateParams}
              onResetParams={() => updateParams({ ...DEFAULT_PARAMS })}
              onSystemPrompt={setSystemPrompt}
              onThink={setThink}
              onClearContext={requestClearContext}
              onRefreshInfo={() => {
                setModelInfoNonce((value) => value + 1);
                retryConnection();
              }}
              onClose={() => setShowInspector(false)}
            />
          </div>
        </>
      )}

      <SettingsModal
        open={showSettings}
        settings={settings}
        models={models}
        connection={connection}
        onClose={() => setShowSettings(false)}
        onSave={saveSettings}
      />

      <ConfirmDialog
        open={Boolean(confirmRequest)}
        title={confirmRequest?.title ?? ''}
        body={confirmRequest?.body}
        confirmLabel={confirmRequest?.confirmLabel ?? 'Confirm'}
        danger={confirmRequest?.danger}
        onConfirm={() => confirmRequest?.action()}
        onCancel={() => setConfirmRequest(null)}
      />

      <Toasts toasts={toasts} />

      {introOpen && <Intro onEnter={enterWorkspace} version={connection.version} />}
    </div>
  );
}
