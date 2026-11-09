import { useEffect, useRef, useState } from 'react';
import type { ConnectionState, Conversation, Message } from '../types';
import { estimateTokens, formatCount, formatDuration, formatTime } from '../lib/format';
import { EmptyState } from './EmptyState';
import { Markdown } from './Markdown';
import {
  ActivityIcon,
  AlertIcon,
  ArrowDownIcon,
  CopyIcon,
  Logo,
  RefreshIcon,
  TrashIcon,
  WifiOffIcon,
} from './icons';

interface Props {
  conversation: Conversation;
  connection: ConnectionState;
  streamingMessageId: string | null;
  showThinking: boolean;
  autoScroll: boolean;
  onCopy: (text: string, label?: string) => void;
  onRegenerate: () => void;
  onTruncate: (messageId: string) => void;
  onUsePrompt: (text: string) => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}

interface RowProps {
  message: Message;
  isStreaming: boolean;
  showThinking: boolean;
  canRegenerate: boolean;
  onCopy: (text: string, label?: string) => void;
  onRegenerate: () => void;
  onTruncate: (messageId: string) => void;
}

function statsTitle(message: Message): string {
  const stats = message.stats;
  if (!stats) return '';
  return [
    `Prompt tokens: ${stats.promptTokens}`,
    `Completion tokens: ${stats.completionTokens}`,
    `Time to first token: ${formatDuration(stats.ttftMs)}`,
    `Prompt eval: ${formatDuration(stats.promptDurationMs)}`,
    `Decode: ${formatDuration(stats.evalDurationMs)}`,
    `Model load: ${formatDuration(stats.loadDurationMs)}`,
    `Total: ${formatDuration(stats.totalDurationMs)}`,
  ].join('\n');
}

function MessageRow({ message, isStreaming, showThinking, canRegenerate, onCopy, onRegenerate, onTruncate }: RowProps) {
  if (message.role === 'user') {
    return (
      <article className="row row-user">
        <div className="user-bubble">
          {message.content ? <div className="user-text">{message.content}</div> : null}
          {message.images?.length ? (
            <div className="user-images">
              {message.images.map((image) => (
                <img
                  key={image.id}
                  src={`data:${image.mime};base64,${image.data}`}
                  alt={image.name}
                  title={image.name}
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="row-copy"
            title="Copy message"
            onClick={() => onCopy(message.content, 'Message copied.')}
          >
            <CopyIcon size={13} />
          </button>
        </div>
        <div className="user-time">{formatTime(message.createdAt)}</div>
      </article>
    );
  }

  return (
    <article className="row row-assistant">
      <div className="assistant-head">
        <Logo size={22} />
        <span className="assistant-model">{message.model || 'assistant'}</span>
        <span className="assistant-time">{formatTime(message.createdAt)}</span>
        {message.stopped && <span className="tag tag-amber">stopped</span>}
        {message.stats && <span className="tag">{formatCount(message.stats.completionTokens)} tok</span>}
      </div>

      {message.thinking && showThinking && (
        <details className="thinking" open={isStreaming}>
          <summary>
            <ActivityIcon size={13} />
            <span>Reasoning</span>
            <span className="thinking-count">{formatCount(estimateTokens(message.thinking))} tok</span>
          </summary>
          <div className="thinking-body">{message.thinking}</div>
        </details>
      )}

      {message.content ? (
        <Markdown content={message.content} streaming={isStreaming} />
      ) : isStreaming ? (
        <div className="waiting">
          <span className="pulse-dot" />
          <span>Waiting for the first token…</span>
        </div>
      ) : null}

      {message.error && (
        <div className="msg-error">
          <AlertIcon size={14} />
          <span>{message.error}</span>
        </div>
      )}

      {isStreaming && (
        <div className="stream-status">
          <span className="pulse-dot" />
          <span>generating · ≈{formatCount(estimateTokens(message.content))} tok</span>
        </div>
      )}

      {!isStreaming && (message.content || message.error) && (
        <div className="assistant-foot">
          {message.stats ? (
            <div className="msg-stats" title={statsTitle(message)}>
              <span>{formatCount(message.stats.promptTokens)} in</span>
              <span className="dot" />
              <span>{formatCount(message.stats.completionTokens)} out</span>
              <span className="dot" />
              <span>{message.stats.tokensPerSecond.toFixed(1)} tok/s</span>
              <span className="dot" />
              <span>{formatDuration(message.stats.totalDurationMs)}</span>
            </div>
          ) : (
            <div className="msg-stats muted">{message.stopped ? 'stopped early' : 'no token data'}</div>
          )}
          <div className="msg-actions">
            <button
              type="button"
              title="Copy response"
              onClick={() => onCopy(message.content, 'Response copied.')}
              disabled={!message.content}
            >
              <CopyIcon size={13} />
            </button>
            {canRegenerate && (
              <button type="button" title="Regenerate response" onClick={onRegenerate}>
                <RefreshIcon size={13} />
              </button>
            )}
            <button type="button" title="Delete this message and everything after" onClick={() => onTruncate(message.id)}>
              <TrashIcon size={13} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function MessageList({
  conversation,
  connection,
  streamingMessageId,
  showThinking,
  autoScroll,
  onCopy,
  onRegenerate,
  onTruncate,
  onUsePrompt,
  onOpenSettings,
  onRetry,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const lastAssistantId = [...conversation.messages].reverse().find((message) => message.role === 'assistant')?.id;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !autoScroll || !stick.current) return;
    element.scrollTop = element.scrollHeight;
  }, [conversation.messages, autoScroll]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    stick.current = true;
    setAtBottom(true);
  }, [conversation.id]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
    stick.current = nearBottom;
    setAtBottom(nearBottom);
  };

  const scrollToBottom = () => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    stick.current = true;
    setAtBottom(true);
  };

  return (
    <div className="messages-pane">
      {connection.state === 'offline' && (
        <div className="offline-banner">
          <WifiOffIcon size={16} />
          <div className="offline-copy">
            <strong>Ollama unreachable</strong>
            <span>{connection.error || 'Check that "ollama serve" is running.'}</span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
            Settings
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      <div className="messages-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="messages">
          {conversation.messages.length === 0 ? (
            <EmptyState
              model={conversation.model}
              online={connection.state === 'online'}
              error={connection.error}
              onUsePrompt={onUsePrompt}
              onOpenSettings={onOpenSettings}
              onRetry={onRetry}
            />
          ) : (
            conversation.messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isStreaming={message.id === streamingMessageId}
                showThinking={showThinking}
                canRegenerate={message.id === lastAssistantId && !streamingMessageId}
                onCopy={onCopy}
                onRegenerate={onRegenerate}
                onTruncate={onTruncate}
              />
            ))
          )}
          <div className="messages-tail" />
        </div>
      </div>

      {!atBottom && (
        <button type="button" className="jump-btn" onClick={scrollToBottom} title="Scroll to latest">
          <ArrowDownIcon size={16} />
        </button>
      )}
    </div>
  );
}

