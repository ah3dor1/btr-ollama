import type { AgentSession, Conversation, Message, Params, Settings, StoreData, ThemeMode } from '../types';
import { isThemeMode } from './theme';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const DEFAULT_PARAMS: Params = {
  temperature: 0.8,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
  seed: null,
  num_ctx: 8192,
  num_predict: -1,
  stop: [],
};

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://127.0.0.1:11434',
  theme: 'dark',
  introSeen: false,
  keepAlive: '10m',
  defaultModel: null,
  agentModel: null,
  agentAutoAcceptCommands: false,
  showThinking: true,
  autoScroll: true,
  enterToSend: true,
  params: DEFAULT_PARAMS,
};

export const CONTEXT_CHOICES = [2048, 4096, 8192, 16384, 32768, 65536, 131072];

export function createConversation(model: string, settings: Settings, systemPrompt = ''): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: 'New chat',
    model,
    systemPrompt,
    params: { ...DEFAULT_PARAMS, ...settings.params },
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > 54 ? `${clean.slice(0, 54).trimEnd()}…` : clean;
}

export function conversationTotals(messages: Message[]) {
  let promptTokens = 0;
  let completionTokens = 0;
  let requests = 0;
  let weightedTps = 0;
  let tpsWeight = 0;
  for (const message of messages) {
    if (!message.stats) continue;
    requests += 1;
    promptTokens += message.stats.promptTokens;
    completionTokens += message.stats.completionTokens;
    if (message.stats.tokensPerSecond > 0) {
      weightedTps += message.stats.tokensPerSecond * message.stats.completionTokens;
      tpsWeight += message.stats.completionTokens;
    }
  }
  return {
    requests,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    avgTokensPerSecond: tpsWeight > 0 ? weightedTps / tpsWeight : 0,
  };
}

export function lastContext(messages: Message[]): { tokens: number; measured: boolean } {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const stats = messages[i].stats;
    if (stats) return { tokens: stats.promptTokens + stats.completionTokens, measured: true };
  }
  return { tokens: 0, measured: false };
}

export function normalizeStore(raw: StoreData | null | undefined): StoreData {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, settings: DEFAULT_SETTINGS, conversations: [], agentSessions: [] };
  }
  const storedTheme = (raw.settings && raw.settings.theme) as ThemeMode | undefined;
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {}),
      theme: isThemeMode(storedTheme) ? storedTheme : DEFAULT_SETTINGS.theme,
      introSeen: Boolean(raw.settings && raw.settings.introSeen),
      params: { ...DEFAULT_PARAMS, ...((raw.settings && raw.settings.params) || {}) },
    },
    conversations: Array.isArray(raw.conversations) ? raw.conversations : [],
    agentSessions: Array.isArray(raw.agentSessions)
      ? (raw.agentSessions as AgentSession[]).map((session) => ({
          ...session,
          autoAcceptCommands: Boolean(session.autoAcceptCommands),
          messages: Array.isArray(session.messages)
            ? session.messages.map((message) =>
                message.role === 'tool' && message.toolStatus === 'waiting'
                  ? {
                      ...message,
                      toolStatus: 'error' as const,
                      toolError: 'This question was interrupted. Send a new message to continue.',
                    }
                  : message,
              )
            : [],
        }))
      : [],
  };
}
