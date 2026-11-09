import { useEffect, useRef } from 'react';
import { cn } from '../lib/format';
import { ArrowUpIcon, StopIcon } from './icons';

interface Props {
  value: string;
  estimate: number;
  modelName: string;
  streaming: boolean;
  busy: boolean;
  enterToSend: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function Composer({
  value,
  estimate,
  modelName,
  streaming,
  busy,
  enterToSend,
  onChange,
  onSend,
  onStop,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy;

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  return (
    <div className="composer-wrap">
      <div className={cn('composer', streaming && 'is-streaming')}>
        <textarea
          ref={textareaRef}
          className="composer-input"
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            if (enterToSend || event.metaKey || event.ctrlKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={modelName ? `Message ${modelName}…` : 'Select a model to begin…'}
          aria-label="Message"
          spellCheck
        />
        <div className="composer-bar">
          <div className="composer-meta">
            {busy && !streaming ? (
              <span className="composer-busy">Another chat is generating…</span>
            ) : streaming ? (
              <span className="composer-busy is-live">
                <span className="pulse-dot" /> generating
              </span>
            ) : (
              <>
                <span>{enterToSend ? 'Enter to send' : 'Ctrl+Enter to send'}</span>
                <span className="sep">·</span>
                <span>Shift+Enter for newline</span>
                {value.trim() && (
                  <>
                    <span className="sep">·</span>
                    <span className="mono">≈ {estimate.toLocaleString()} tok</span>
                  </>
                )}
              </>
            )}
          </div>
          {streaming ? (
            <button type="button" className="send-btn stop" onClick={onStop} title="Stop generating">
              <StopIcon size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              onClick={onSend}
              disabled={!canSend}
              title={busy ? 'Wait for the current response' : 'Send message'}
            >
              <ArrowUpIcon size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
