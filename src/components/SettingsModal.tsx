import { useEffect, useState } from 'react';
import type { ConnectionState, OllamaModel, Settings } from '../types';
import { CONTEXT_CHOICES, DEFAULT_SETTINGS } from '../lib/defaults';
import { bridge } from '../lib/bridge';
import { cn } from '../lib/format';
import { CloseIcon, RefreshIcon, WifiOffIcon, WifiIcon } from './icons';

interface Props {
  open: boolean;
  settings: Settings;
  models: OllamaModel[];
  connection: ConnectionState;
  onClose: () => void;
  onSave: (settings: Settings) => void;
}

const KEEP_ALIVE = [
  { value: '0', label: 'Unload immediately' },
  { value: '30s', label: '30 seconds' },
  { value: '5m', label: '5 minutes' },
  { value: '10m', label: '10 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '-1', label: 'Keep loaded forever' },
];

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </span>
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function SettingsModal({ open, settings, models, connection, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const agentModels = models.filter((model) => model.capabilities?.includes('tools'));

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setTest(null);
    setTesting(false);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const testConnection = async () => {
    setTesting(true);
    setTest(null);
    const result = await bridge.listModels(draft.baseUrl);
    if (result.ok) {
      const version = await bridge.getVersion(draft.baseUrl);
      setTest({
        ok: true,
        message: `Connected${version.ok && version.version ? ` · Ollama ${version.version}` : ''} · ${result.models?.length ?? 0} model${(result.models?.length ?? 0) === 1 ? '' : 's'}`,
      });
    } else {
      setTest({ ok: false, message: result.error || 'Connection failed.' });
    }
    setTesting(false);
  };

  const save = () => {
    const baseUrl = (draft.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(baseUrl)) {
      setTest({ ok: false, message: 'Base URL must start with http:// or https://' });
      return;
    }
    onSave({ ...draft, baseUrl });
  };

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-head">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p className="dialog-copy">Connection, defaults and how the app behaves.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="dialog-body">
          <section className="settings-section">
            <h3>Connection</h3>
            <label className="field">
              <span className="field-label">
                <span>Ollama base URL</span>
              </span>
              <input
                className="input"
                value={draft.baseUrl}
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                placeholder="http://127.0.0.1:11434"
                spellCheck={false}
              />
              <span className="field-hint">Requests are made from the app, so no browser CORS setup is needed.</span>
            </label>
            <div className="test-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={testConnection} disabled={testing}>
                <RefreshIcon size={13} className={testing ? 'spin' : undefined} /> Test connection
              </button>
              <span className={cn('test-result', test ? (test.ok ? 'ok' : 'fail') : undefined)}>
                {test ? (
                  <>
                    {test.ok ? <WifiIcon size={13} /> : <WifiOffIcon size={13} />}
                    {test.message}
                  </>
                ) : connection.state === 'online' ? (
                  `Current: connected${connection.version ? ` · Ollama ${connection.version}` : ''}`
                ) : (
                  connection.error || 'Not connected'
                )}
              </span>
            </div>
          </section>

          <section className="settings-section">
            <h3>Appearance</h3>
            <div className="appearance-row">
              <div className="toggle-copy">
                <span className="toggle-label">Theme</span>
                <span className="toggle-desc">Dark, light, or follow the system.</span>
              </div>
              <div className="segmented theme-seg" role="group" aria-label="Theme">
                {(['system', 'dark', 'light'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn('seg-btn', draft.theme === value && 'is-active')}
                    onClick={() => setDraft({ ...draft, theme: value })}
                  >
                    {value === 'system' ? 'System' : value === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Defaults</h3>
            <div className="settings-grid">
              <label className="field">
                <span className="field-label">
                  <span>Default model</span>
                </span>
                <select
                  className="select"
                  value={draft.defaultModel ?? ''}
                  onChange={(event) => setDraft({ ...draft, defaultModel: event.target.value || null })}
                >
                  <option value="">Auto (first available)</option>
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">
                  <span>Keep model loaded</span>
                </span>
                <select
                  className="select"
                  value={draft.keepAlive}
                  onChange={(event) => setDraft({ ...draft, keepAlive: event.target.value })}
                >
                  {KEEP_ALIVE.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">
                  <span>Default context window</span>
                </span>
                <select
                  className="select"
                  value={draft.params.num_ctx}
                  onChange={(event) =>
                    setDraft({ ...draft, params: { ...draft.params, num_ctx: Number(event.target.value) } })
                  }
                >
                  {CONTEXT_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice.toLocaleString()} tokens
                    </option>
                  ))}
                </select>
                <span className="field-hint">Applied to new chats; each chat can override it.</span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3>Coding agent</h3>
            <label className="field">
              <span className="field-label">
                <span>Linked coding model</span>
              </span>
              <select
                className="select"
                value={draft.agentModel ?? ''}
                onChange={(event) => setDraft({ ...draft, agentModel: event.target.value || null })}
              >
                <option value="">Auto (first tool-capable model)</option>
                {agentModels.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {agentModels.length > 0
                  ? 'A tool-capable model used for project sessions. You can also switch it in the Code workspace.'
                  : 'No tool-capable models found. Pull one with ollama pull qwen2.5-coder:7b.'}
              </span>
            </label>
            <Toggle
              label="Auto-run coding commands"
              description="New coding sessions run shell commands without asking first. File edits still require approval, and each session can override this."
              checked={draft.agentAutoAcceptCommands}
              onChange={(value) => setDraft({ ...draft, agentAutoAcceptCommands: value })}
            />
          </section>

          <section className="settings-section">
            <h3>Interface</h3>
            <Toggle
              label="Show reasoning blocks"
              description="Display thinking output from models that support it."
              checked={draft.showThinking}
              onChange={(value) => setDraft({ ...draft, showThinking: value })}
            />
            <Toggle
              label="Follow stream automatically"
              description="Keep the transcript pinned to the newest tokens."
              checked={draft.autoScroll}
              onChange={(value) => setDraft({ ...draft, autoScroll: value })}
            />
            <Toggle
              label="Enter sends the message"
              description="When off, use Ctrl/Cmd+Enter to send."
              checked={draft.enterToSend}
              onChange={(value) => setDraft({ ...draft, enterToSend: value })}
            />
          </section>

          <p className="settings-footnote">
            BTR-Ollama 1.0 · conversations and settings stay in this app's data folder.
          </p>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
