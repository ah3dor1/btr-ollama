import type { ConnectionState, Conversation, OllamaModel } from '../types';
import { cn, estimateTokens, formatCount } from '../lib/format';
import { DownloadIcon, PanelRightIcon } from './icons';
import { ModelPicker } from './ModelPicker';

interface Props {
  conversation: Conversation;
  models: OllamaModel[];
  baseUrl: string;
  modelsLoading: boolean;
  connection: ConnectionState;
  context: { used: number; percent: number; windowSize: number };
  inspectorOpen: boolean;
  onModelChange: (name: string) => void;
  onRefreshModels: () => void;
  onToggleInspector: () => void;
  onExport: () => void;
}

export function ChatHeader({
  conversation,
  models,
  baseUrl,
  modelsLoading,
  connection,
  context,
  inspectorOpen,
  onModelChange,
  onRefreshModels,
  onToggleInspector,
  onExport,
}: Props) {
  const gaugeTone = context.percent >= 90 ? 'danger' : context.percent >= 70 ? 'warn' : 'ok';
  return (
    <header className="chat-header">
      <div className="chat-heading">
        <h1 title={conversation.title}>{conversation.title}</h1>
        <div className="chat-subline">
          <span>{conversation.messages.length} messages</span>
          <span className="sep">·</span>
          <span>
            {conversation.systemPrompt.trim()
              ? `system ~${formatCount(estimateTokens(conversation.systemPrompt))} tok`
              : 'no system prompt'}
          </span>
          <span className="sep">·</span>
          <span className={cn('conn-inline', connection.state)}>
            {connection.state === 'online' ? 'connected' : connection.state === 'connecting' ? 'connecting' : 'offline'}
          </span>
        </div>
      </div>

      <div className="chat-actions">
        <div
          className="header-context"
          title={`Context: ${formatCount(context.used)} of ${formatCount(context.windowSize)} tokens`}
        >
          <span className="header-context-bar">
            <span className={gaugeTone} style={{ width: `${Math.max(context.percent, context.used > 0 ? 2 : 0)}%` }} />
          </span>
          <span className="header-context-label">{Math.round(context.percent)}% ctx</span>
        </div>

        <ModelPicker
          models={models}
          baseUrl={baseUrl}
          value={conversation.model}
          onChange={onModelChange}
          onRefresh={onRefreshModels}
          loading={modelsLoading}
        />

        <button type="button" className="icon-btn" title="Export conversation as Markdown" onClick={onExport}>
          <DownloadIcon size={16} />
        </button>
        <button
          type="button"
          className={cn('icon-btn', inspectorOpen && 'is-active')}
          title="Toggle inspector"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
        >
          <PanelRightIcon size={16} />
        </button>
      </div>
    </header>
  );
}
