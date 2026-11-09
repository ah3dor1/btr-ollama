export type Role = 'user' | 'assistant';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ConnectionState {
  state: 'connecting' | 'online' | 'offline';
  version?: string;
  error?: string;
}

export interface MessageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensPerSecond: number;
  ttftMs: number | null;
  totalDurationMs: number;
  loadDurationMs: number;
  promptDurationMs: number;
  evalDurationMs: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  thinking?: string;
  model?: string;
  createdAt: number;
  stats?: MessageStats;
  error?: string;
  stopped?: boolean;
}

export interface Params {
  temperature: number;
  top_p: number;
  top_k: number;
  repeat_penalty: number;
  seed: number | null;
  num_ctx: number;
  num_predict: number;
  stop: string[];
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  params: Params;
  /** true/false forces thinking on or off; null leaves it to the model. */
  think?: boolean | null;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  baseUrl: string;
  theme: ThemeMode;
  introSeen: boolean;
  keepAlive: string;
  defaultModel: string | null;
  agentModel: string | null;
  agentAutoAcceptCommands: boolean;
  showThinking: boolean;
  autoScroll: boolean;
  enterToSend: boolean;
  params: Params;
}

export type AgentToolStatus = 'pending' | 'waiting' | 'running' | 'done' | 'error' | 'denied';

export interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: number;
  model?: string;
  toolCalls?: AgentToolCall[];
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolStatus?: AgentToolStatus;
  toolResult?: string;
  toolError?: string;
  error?: string;
}

export interface AgentSession {
  id: string;
  title: string;
  projectPath: string;
  model: string;
  /** Run shell commands without a per-command approval prompt. File edits still ask. */
  autoAcceptCommands?: boolean;
  /** The first task has completed its clarification question. */
  briefed?: boolean;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    type: 'function';
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  tool_name?: string;
}

export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AgentChatResult {
  ok: boolean;
  message?: { content: string; tool_calls?: AgentToolCall[] };
  error?: string;
  aborted?: boolean;
}

export interface AgentApprovalRequest {
  sessionId: string;
  messageId: string;
  call: AgentToolCall;
}

export interface AgentQuestionRequest {
  sessionId: string;
  messageId: string;
  question: string;
  options: string[];
}

export interface AgentToolResult {
  ok: boolean;
  output?: string;
  error?: string;
  meta?: {
    path?: string;
    bytes?: number;
    lines?: number;
    exitCode?: number | null;
    timedOut?: boolean;
    sandboxed?: boolean;
  };
}

export interface StoreData {
  version: number;
  settings: Settings;
  conversations: Conversation[];
  agentSessions: AgentSession[];
}

export interface OllamaModelDetails {
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
  context_length?: number;
  embedding_length?: number;
  format?: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest?: string;
  modified_at?: string;
  details?: OllamaModelDetails;
  capabilities?: string[];
}

export interface OllamaShowInfo {
  modelfile?: string;
  parameters?: string;
  template?: string;
  details?: OllamaModelDetails;
  model_info?: Record<string, unknown>;
  capabilities?: string[];
  license?: string;
}

export type ModelHubProvider = 'ollama' | 'huggingface';

export interface HubModel {
  id: string;
  provider: ModelHubProvider;
  name: string;
  description?: string;
  tags?: string[];
  downloads?: number | null;
  likes?: number | null;
  url: string;
}

export interface ModelPullEvent {
  pullId: string;
  model: string;
  status: string;
  completed?: number;
  total?: number;
  done?: boolean;
  error?: string;
}

export interface ChatChunk {
  model?: string;
  created_at?: string;
  message?: { role?: string; content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

export type ChatEvent =
  | { requestId: string; type: 'chunk'; data: ChatChunk }
  | { requestId: string; type: 'done'; data: ChatChunk }
  | { requestId: string; type: 'error'; error: string }
  | { requestId: string; type: 'aborted'; error?: string };

export interface BtrBridge {
  platform: string;
  loadStore: () => Promise<StoreData>;
  saveStore: (payload: {
    settings: Settings;
    conversations: Conversation[];
    agentSessions: AgentSession[];
  }) => Promise<{ ok: boolean }>;
  listModels: (baseUrl: string) => Promise<{ ok: boolean; models?: OllamaModel[]; error?: string }>;
  getVersion: (baseUrl: string) => Promise<{ ok: boolean; version?: string; error?: string }>;
  showModel: (baseUrl: string, model: string) => Promise<{ ok: boolean; info?: OllamaShowInfo; error?: string }>;
  searchModels: (
    provider: ModelHubProvider,
    query: string,
  ) => Promise<{ ok: boolean; results?: HubModel[]; error?: string }>;
  zoom: (direction: 'in' | 'out' | 'reset') => Promise<{ ok: boolean; level: number; percent: number }>;
  pullModel: (payload: {
    pullId: string;
    baseUrl: string;
    model: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  abortPull: (pullId: string) => Promise<{ ok: boolean }>;
  onModelPull: (callback: (event: ModelPullEvent) => void) => () => void;
  startChat: (payload: {
    requestId: string;
    baseUrl: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    options: Params;
    keepAlive: string;
    think: boolean | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  abortChat: (requestId: string) => Promise<{ ok: boolean }>;
  exportChat: (name: string, content: string) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ ok: boolean }>;
  pickProject: () => Promise<{
    ok: boolean;
    path?: string;
    name?: string;
    canceled?: boolean;
    error?: string;
  }>;
  agentChat: (payload: {
    requestId: string;
    baseUrl: string;
    model: string;
    messages: AgentApiMessage[];
    tools: AgentToolDefinition[];
    options: Params;
    keepAlive: string;
  }) => Promise<AgentChatResult>;
  abortAgent: (requestId: string) => Promise<{ ok: boolean }>;
  runAgentTool: (payload: {
    projectPath: string;
    name: string;
    args: Record<string, unknown>;
  }) => Promise<AgentToolResult>;
  onChatEvent: (callback: (event: ChatEvent) => void) => () => void;
}

declare global {
  interface Window {
    btr?: BtrBridge;
  }
}
