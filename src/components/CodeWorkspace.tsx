import { useEffect, useRef, useState } from 'react';
import type {
  AgentApprovalRequest,
  AgentMessage,
  AgentQuestionRequest,
  AgentSession,
  AgentToolCall,
  ConnectionState,
  OllamaModel,
} from '../types';
import {
  AGENT_INTERACTIVE_TOOLS,
  AGENT_READ_TOOLS,
  projectBasename,
  toolCallLabel,
} from '../lib/agent';
import { cn, formatTime } from '../lib/format';
import { Markdown } from './Markdown';
import { ModelPicker } from './ModelPicker';
import {
  AlertIcon,
  ArrowUpIcon,
  CheckIcon,
  CloseIcon,
  CodeIcon,
  FileTextIcon,
  FolderIcon,
  MessageIcon,
  PencilIcon,
  SearchIcon,
  ShieldIcon,
  StopIcon,
  TerminalIcon,
} from './icons';

interface Props {
  session: AgentSession | null;
  linkedModel: string;
  models: OllamaModel[];
  baseUrl: string;
  modelsLoading: boolean;
  connection: ConnectionState;
  draft: string;
  busy: boolean;
  approval: AgentApprovalRequest | null;
  question: AgentQuestionRequest | null;
  autoAcceptCommands: boolean;
  onChangeDraft: (value: string) => void;
  onSend: (text?: string) => void;
  onStop: () => void;
  onUsePrompt: (text: string) => void;
  onModelChange: (name: string) => void;
  onNewProject: () => void;
  onRefreshModels: () => void;
  onOpenSettings: () => void;
  onResolveApproval: (approved: boolean) => void;
  onResolveQuestion: (answer: string | null) => void;
  onSetAutoAcceptCommands: (enabled: boolean) => void;
}

const STARTERS = [
  {
    title: 'Map the project',
    prompt: 'Explore this project and explain its architecture, main entry points, and how to run it.',
  },
  {
    title: 'Find the risk',
    prompt: 'Review this project for the most important bug or maintenance risk. Inspect the relevant files and explain what you found.',
  },
  {
    title: 'Run the checks',
    prompt: 'Find the test or build command for this project, run it, and fix the first failure you can reproduce.',
  },
];

const TOOL_ICONS = {
  ask_user: MessageIcon,
  list_files: FolderIcon,
  read_file: FileTextIcon,
  search_files: SearchIcon,
  write_file: PencilIcon,
  replace_in_file: PencilIcon,
  run_command: TerminalIcon,
  git_diff: CodeIcon,
} as const;

function statusLabel(message: AgentMessage): string {
  if (message.toolStatus === 'pending') return 'needs approval';
  if (message.toolStatus === 'waiting') return 'waiting for you';
  if (message.toolStatus === 'running') return 'running';
  if (message.toolStatus === 'denied') return 'denied';
  if (message.toolStatus === 'error') return 'failed';
  return 'done';
}

function toolArgumentPreview(call: AgentToolCall): string {
  const args = call.arguments || {};
  if (call.name === 'run_command') return String(args.command ?? '');
  if (call.name === 'ask_user') return String(args.question ?? '');
  if (call.name === 'search_files') {
    return `${String(args.query ?? '')}${args.path ? ` in ${String(args.path)}` : ''}`;
  }
  if (call.name === 'write_file') {
    const content = typeof args.content === 'string' ? args.content : '';
    const lines = content ? content.split(/\r?\n/).length : 0;
    return `${String(args.path ?? '')} · ${lines} line${lines === 1 ? '' : 's'}`;
  }
  if (call.name === 'replace_in_file') return String(args.path ?? '');
  if (call.name === 'read_file') {
    const range =
      args.start_line || args.end_line
        ? ` · lines ${args.start_line ?? 1}-${args.end_line ?? 'end'}`
        : '';
    return `${String(args.path ?? '')}${range}`;
  }
  if (call.name === 'list_files') return String(args.path ?? '.');
  return String(args.path ?? '');
}

function toolDetails(message: AgentMessage): string {
  const call: AgentToolCall = {
    name: message.toolName || 'tool',
    arguments: message.toolArguments || {},
  };
  const args = call.arguments || {};
  if (message.toolResult || message.toolError) {
    return [message.toolError ? `Error: ${message.toolError}` : '', message.toolResult || '']
      .filter(Boolean)
      .join('\n\n');
  }
  if (call.name === 'write_file' && typeof args.content === 'string') {
    return `Path: ${String(args.path ?? '')}\n\n${args.content}`;
  }
  if (call.name === 'replace_in_file') {
    return [
      `Path: ${String(args.path ?? '')}`,
      '',
      'Replace:',
      String(args.old_text ?? ''),
      '',
      'With:',
      String(args.new_text ?? ''),
    ].join('\n');
  }
  if (call.name === 'ask_user') {
    return [
      String(args.question ?? ''),
      ...(Array.isArray(args.options) ? ['', 'Suggested replies:', ...args.options.map(String)] : []),
    ].join('\n');
  }
  return JSON.stringify(args, null, 2);
}

function QuestionPrompt({
  question,
  options,
  onResolve,
}: {
  question: string;
  options: string[];
  onResolve: (answer: string | null) => void;
}) {
  const [answer, setAnswer] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (answer.trim()) onResolve(answer.trim());
  };

  return (
    <div className="agent-question">
      <div className="agent-question-copy">
        <MessageIcon size={16} />
        <div>
          <strong>The agent needs your input</strong>
          <p>{question}</p>
        </div>
      </div>
      {options.length > 0 && (
        <div className="agent-question-options">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="agent-question-option"
              onClick={() => onResolve(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        className="agent-question-input"
        rows={3}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Type your answer, then send it to continue the task…"
        aria-label="Answer the agent's question"
      />
      <div className="agent-question-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onResolve(null)}>
          Skip
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={!answer.trim()}
        >
          <ArrowUpIcon size={13} />
          Send answer
        </button>
      </div>
    </div>
  );
}

export function CodeWorkspace({
  session,
  linkedModel,
  models,
  baseUrl,
  modelsLoading,
  connection,
  draft,
  busy,
  approval,
  question,
  autoAcceptCommands,
  onChangeDraft,
  onSend,
  onStop,
  onUsePrompt,
  onModelChange,
  onNewProject,
  onRefreshModels,
  onOpenSettings,
  onResolveApproval,
  onResolveQuestion,
  onSetAutoAcceptCommands,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastSession = useRef<string | null>(null);
  const lastMessageCount = useRef(0);

  const canSend = Boolean(session && linkedModel && draft.trim() && !busy);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [draft]);

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, session?.id]);

  useEffect(() => {
    const count = session?.messages.length ?? 0;
    const changedSession = lastSession.current !== session?.id;
    lastSession.current = session?.id ?? null;
    if (changedSession) {
      lastMessageCount.current = count;
      endRef.current?.scrollIntoView({ block: 'end' });
      return;
    }
    if (count !== lastMessageCount.current) {
      lastMessageCount.current = count;
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [session?.id, session?.messages.length, busy]);

  const noModel = !linkedModel;
  const modelAvailable = !noModel && models.some((model) => model.name === linkedModel);

  return (
    <main className="main code-main">
      <header className="code-header">
        <div className="code-heading">
          <div className="code-kicker">
            <CodeIcon size={14} />
            <span>Coding agent</span>
            {busy && (
              <span className="code-running">
                <span className="pulse-dot" /> working
              </span>
            )}
          </div>
          <h1>{session?.title ?? 'Code workspace'}</h1>
          <div className="code-project" title={session?.projectPath}>
            <FolderIcon size={13} />
            <span>{session?.projectPath ?? 'No project folder linked'}</span>
          </div>
        </div>

        <div className="code-actions">
          <div className="code-model">
            <ModelPicker
              models={models}
              baseUrl={baseUrl}
              value={linkedModel}
              onChange={onModelChange}
              onRefresh={onRefreshModels}
              loading={modelsLoading}
            />
            {!modelAvailable && (
              <button type="button" className="code-model-link" onClick={onOpenSettings}>
                Link model
              </button>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm code-new-project" onClick={onNewProject}>
            <FolderIcon size={14} />
            New project
          </button>
        </div>
      </header>

      {!session ? (
        <div className="code-scroll code-scroll-empty">
          <section className="code-empty">
            <div className="code-empty-icon">
              <CodeIcon size={28} />
            </div>
            <p className="code-empty-kicker">Local coding agent</p>
            <h1>Work in a real project folder.</h1>
            <p className="code-empty-lede">
              Link a tool-capable Ollama model and give the agent a directory. It can inspect files,
              search code, make edits, and run commands while you stay in control of every change.
            </p>

            <div className="code-capabilities">
              <div className="code-capability">
                <SearchIcon size={15} />
                <span>
                  <strong>Reads and searches</strong>
                  run automatically inside the project.
                </span>
              </div>
              <div className="code-capability">
                <PencilIcon size={15} />
                <span>
                  <strong>File edits</strong>
                  wait for your explicit approval.
                </span>
              </div>
              <div className="code-capability">
                <TerminalIcon size={15} />
                <span>
                  <strong>Shell commands</strong>
                  ask first by default, or auto-run when you enable it.
                </span>
              </div>
            </div>

            <div className="code-empty-actions">
              <button type="button" className="btn btn-primary code-open-project" onClick={onNewProject}>
                <FolderIcon size={15} />
                Choose project folder
              </button>
              {connection.state === 'offline' && (
                <span className="code-inline-warning">
                  <AlertIcon size={14} /> Ollama is offline
                </span>
              )}
            </div>

            {models.length === 0 ? (
              <p className="code-model-note">
                No tool-capable models found. Pull one with{' '}
                <code>ollama pull qwen2.5-coder:7b</code>, then refresh.
              </p>
            ) : (
              <p className="code-model-note">
                {models.length} tool-capable model{models.length === 1 ? '' : 's'} available
                {linkedModel ? ` · ${linkedModel} linked` : ' · choose one above'}.
              </p>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="code-scroll" ref={scrollRef}>
            {connection.state === 'offline' && (
              <div className="code-offline">
                <AlertIcon size={16} />
                <span>{connection.error || 'Ollama is offline. Start it and refresh the model list.'}</span>
                <button type="button" className="mini-btn" onClick={onRefreshModels}>
                  Retry
                </button>
              </div>
            )}

            <div className="code-thread">
              {session.messages.length === 0 ? (
                <section className="code-start">
                  <p className="code-empty-kicker">Project linked</p>
                  <h2>What should we build?</h2>
                  <p>
                    The agent starts in <strong>{projectBasename(session.projectPath)}</strong>. It asks a
                    few setup questions first, then inspects the project before making changes. File edits
                    always ask; shell commands can ask or run automatically.
                  </p>
                  <div className="code-starters">
                    {STARTERS.map((starter, index) => (
                      <button
                        key={starter.title}
                        type="button"
                        className="code-starter"
                        onClick={() => {
                          onUsePrompt(starter.prompt);
                          textareaRef.current?.focus();
                        }}
                      >
                        <span className="code-starter-num">0{index + 1}</span>
                        <span className="code-starter-copy">
                          <strong>{starter.title}</strong>
                          <span>{starter.prompt}</span>
                        </span>
                        <ArrowUpIcon size={14} className="code-starter-arrow" />
                      </button>
                    ))}
                  </div>
                  <div className="code-guardrails">
                    <ShieldIcon size={15} />
                    <span>
                      Automatic: reading, searching, and diffs. File writes require approval; commands
                      follow the session setting.
                    </span>
                  </div>
                </section>
              ) : (
                session.messages.map((message) => {
                  if (message.role === 'user') {
                    return (
                      <div className="code-msg code-msg-user" key={message.id}>
                        <div className="code-user-bubble">{message.content}</div>
                        <span className="code-time">{formatTime(message.createdAt)}</span>
                      </div>
                    );
                  }

                  if (message.role === 'assistant') {
                    return (
                      <article className="code-msg code-assistant" key={message.id}>
                        <div className="code-assistant-head">
                          <span className="code-avatar">
                            <CodeIcon size={14} />
                          </span>
                          <span className="code-model-name">{message.model || session.model}</span>
                          <span className="code-time">{formatTime(message.createdAt)}</span>
                        </div>
                        {message.content && <Markdown content={message.content} />}
                        {message.error && (
                          <div className="code-message-error">
                            <AlertIcon size={14} />
                            <span>{message.error}</span>
                          </div>
                        )}
                        {!message.content && !message.error && message.toolCalls?.length ? (
                          <p className="code-tool-intent">Working through the project…</p>
                        ) : null}
                      </article>
                    );
                  }

                  const call: AgentToolCall = {
                    name: message.toolName || 'tool',
                    arguments: message.toolArguments || {},
                  };
                  const Icon =
                    TOOL_ICONS[call.name as keyof typeof TOOL_ICONS] ?? CodeIcon;
                  const pending = approval?.messageId === message.id;
                  const asking = question?.messageId === message.id;
                  const detail = toolDetails(message);
                  const mutating =
                    !AGENT_READ_TOOLS.has(call.name) && !AGENT_INTERACTIVE_TOOLS.has(call.name);
                  const status = message.toolStatus ?? 'done';
                  const questionOptions = Array.isArray(call.arguments.options)
                    ? call.arguments.options.map(String).filter(Boolean).slice(0, 4)
                    : [];

                  return (
                    <div className={cn('agent-tool', `is-${status}`)} key={message.id}>
                      <div className="agent-tool-head">
                        <span className="agent-tool-icon">
                          <Icon size={14} />
                        </span>
                        <span className="agent-tool-title">{toolCallLabel(call.name)}</span>
                        <code className="agent-tool-summary">{toolArgumentPreview(call)}</code>
                        <span className={cn('agent-tool-status', `is-${status}`)}>
                          {statusLabel(message)}
                        </span>
                      </div>

                      {asking && (
                        <QuestionPrompt
                          key={message.id}
                          question={String(call.arguments.question ?? '')}
                          options={questionOptions}
                          onResolve={onResolveQuestion}
                        />
                      )}

                      {pending && (
                        <div className="tool-approval">
                          <div className="tool-approval-copy">
                            <ShieldIcon size={16} />
                            <div>
                              <strong>Approve {toolCallLabel(call.name).toLowerCase()}?</strong>
                              <span>
                                {call.name === 'run_command'
                                  ? 'The command runs inside the project folder. Review it before allowing it.'
                                  : 'This changes files in the linked project. Review the change before allowing it.'}
                              </span>
                            </div>
                          </div>
                          <div className="tool-approval-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => onResolveApproval(false)}
                            >
                              <CloseIcon size={13} />
                              Deny
                            </button>
                            {call.name === 'run_command' && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => onSetAutoAcceptCommands(true)}
                                title="Approve this command and auto-run later commands in this session"
                              >
                                <TerminalIcon size={13} />
                                Always allow
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => onResolveApproval(true)}
                            >
                              <CheckIcon size={13} />
                              Allow once
                            </button>
                          </div>
                        </div>
                      )}

                      {detail && (
                        <details className="agent-tool-details" open={status === 'error' || pending}>
                          <summary>{pending ? 'Review request' : 'Details'}</summary>
                          <pre>{detail}</pre>
                        </details>
                      )}

                      {mutating && status === 'pending' && !pending && (
                        <p className="code-tool-intent">Waiting for approval…</p>
                      )}
                      {status === 'waiting' && !asking && (
                        <p className="code-tool-intent">Waiting for your answer…</p>
                      )}
                      {status === 'running' && <p className="code-tool-intent">Running…</p>}
                    </div>
                  );
                })
              )}
              {busy && !question && (
                <div className="code-waiting">
                  <span className="pulse-dot" />
                  <span>The agent is working through the project…</span>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="code-composer-wrap">
            <div className="code-composer">
              <textarea
                ref={textareaRef}
                className="code-composer-input"
                rows={1}
                value={draft}
                onChange={(event) => onChangeDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                  if (event.metaKey || event.ctrlKey || !event.shiftKey) {
                    event.preventDefault();
                    if (canSend) onSend();
                  }
                }}
                placeholder={
                  noModel
                    ? 'Link a tool-capable model to start…'
                    : busy
                      ? question
                        ? 'Answer the question above to continue…'
                        : 'The agent is working…'
                      : `Ask ${linkedModel} to work in this project…`
                }
                aria-label="Coding task"
                disabled={!session || noModel}
                spellCheck
              />
              <div className="code-composer-bar">
                <div className="code-composer-meta">
                  <span>{linkedModel || 'No model linked'}</span>
                  <span className="sep">·</span>
                  <button
                    type="button"
                    className={cn('code-command-mode', autoAcceptCommands && 'is-auto')}
                    onClick={() => onSetAutoAcceptCommands(!autoAcceptCommands)}
                    aria-pressed={autoAcceptCommands}
                    title={
                      autoAcceptCommands
                        ? 'Shell commands run automatically. Click to ask first.'
                        : 'Shell commands ask for approval. Click to auto-run them.'
                    }
                  >
                    <TerminalIcon size={11} />
                    {autoAcceptCommands ? 'Commands auto-run' : 'Commands ask first'}
                  </button>
                  <span className="sep">·</span>
                  <span>{autoAcceptCommands ? 'File edits still ask first' : 'All actions ask first'}</span>
                </div>
                {busy ? (
                  <button type="button" className="code-send is-stop" onClick={onStop} title="Stop agent">
                    <StopIcon size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="code-send"
                    onClick={() => onSend()}
                    disabled={!canSend}
                    title="Send task"
                  >
                    <ArrowUpIcon size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
