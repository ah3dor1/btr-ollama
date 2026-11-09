import { useEffect, useRef } from 'react';
import type { ImageAttachment } from '../types';
import { cn, formatBytes } from '../lib/format';
import { ArrowUpIcon, CloseIcon, PaperclipIcon, StopIcon } from './icons';

interface Props {
  value: string;
  estimate: number;
  modelName: string;
  streaming: boolean;
  busy: boolean;
  enterToSend: boolean;
  images: ImageAttachment[];
  visionSupported: boolean;
  onChange: (value: string) => void;
  onAttach: (files: FileList) => void;
  onRemoveImage: (id: string) => void;
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
  images,
  visionSupported,
  onChange,
  onAttach,
  onRemoveImage,
  onSend,
  onStop,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = (value.trim().length > 0 || images.length > 0) && !busy;

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

        {images.length > 0 && (
          <div className="composer-attachments" aria-label="Attached images">
            {images.map((image) => (
              <div className="composer-attachment" key={image.id}>
                <img src={`data:${image.mime};base64,${image.data}`} alt="" />
                <span
                  className="composer-attachment-name"
                  title={`${image.name} · ${formatBytes(image.size)}`}
                >
                  {image.name}
                </span>
                <button
                  type="button"
                  className="composer-attachment-remove"
                  title={`Remove ${image.name}`}
                  onClick={() => onRemoveImage(image.id)}
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {visionSupported && (
          <div className="composer-tools">
            <input
              ref={fileInputRef}
              className="composer-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={(event) => {
                const files = event.target.files;
                if (files && files.length > 0) onAttach(files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="composer-tool"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              title="Attach images (vision models)"
            >
              <PaperclipIcon size={14} />
              <span>Attach</span>
            </button>
          </div>
        )}

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
                {images.length > 0 && (
                  <>
                    <span className="sep">·</span>
                    <span>
                      {images.length} image{images.length === 1 ? '' : 's'}
                    </span>
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
