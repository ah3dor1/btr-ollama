import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HubModel, ModelHubProvider, ModelPullEvent, OllamaModel } from '../types';
import { bridge } from '../lib/bridge';
import { uid } from '../lib/defaults';
import { cn, formatBytes, formatCount } from '../lib/format';
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  CpuIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshIcon,
  SearchIcon,
  StopIcon,
  WifiOffIcon,
} from './icons';

interface Props {
  models: OllamaModel[];
  baseUrl: string;
  value: string;
  onChange: (name: string) => void;
  onRefresh: () => void;
  loading?: boolean;
}

type Tab = 'installed' | 'online';

const HUB_LABEL: Record<ModelHubProvider, string> = {
  ollama: 'ollama.com',
  huggingface: 'Hugging Face',
};

const installTarget = (model: HubModel) =>
  model.provider === 'ollama' ? model.name : `hf.co/${model.name}`;

const installCommand = (model: HubModel) =>
  model.provider === 'ollama' ? `ollama pull ${model.name}` : `ollama run ${installTarget(model)}`;

const modelKeyOf = (model: HubModel) => `${model.provider}:${model.id}`;

interface ActivePull {
  id: string;
  key: string;
  target: string;
  status: string;
  completed: number;
  total: number;
  error: string | null;
}

export function ModelPicker({ models, baseUrl, value, onChange, onRefresh, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('installed');
  const [query, setQuery] = useState('');
  const [hubQuery, setHubQuery] = useState('');
  const [provider, setProvider] = useState<ModelHubProvider>('ollama');
  const [hubResults, setHubResults] = useState<HubModel[]>([]);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pull, setPull] = useState<ActivePull | null>(null);
  const [installed, setInstalled] = useState<Record<string, true>>({});
  const root = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  const activePull = useRef<{ id: string; key: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setTab('installed');
    setCopied(null);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((model) => model.name.toLowerCase().includes(q)) : models;
  }, [models, query]);

  const active = models.find((model) => model.name === value);

  const installedNames = useMemo(
    () => models.map((model) => model.name.toLowerCase()),
    [models],
  );

  const isInstalled = useCallback(
    (model: HubModel) => {
      if (installed[modelKeyOf(model)]) return true;
      const target = installTarget(model).toLowerCase();
      return installedNames.some((name) => name === target || name.startsWith(`${target}:`));
    },
    [installed, installedNames],
  );

  const runSearch = useCallback(async (source: ModelHubProvider, term: string) => {
    const seq = searchSeq.current + 1;
    searchSeq.current = seq;
    setHubLoading(true);
    setHubError(null);
    try {
      const result = await bridge.searchModels(source, term);
      if (searchSeq.current !== seq) return;
      if (result.ok) {
        setHubResults(result.results ?? []);
      } else {
        setHubResults([]);
        setHubError(result.error || 'Search failed.');
      }
    } catch (error) {
      if (searchSeq.current !== seq) return;
      setHubResults([]);
      setHubError(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      if (searchSeq.current === seq) setHubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== 'online') return;
    const timer = window.setTimeout(
      () => void runSearch(provider, hubQuery),
      hubQuery.trim() ? 320 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [open, tab, provider, hubQuery, runSearch]);

  useEffect(
    () =>
      bridge.onModelPull((event: ModelPullEvent) => {
        const current = activePull.current;
        if (!current || current.id !== event.pullId) return;

        if (event.error) {
          activePull.current = null;
          const cancelled = /cancelled/i.test(event.error);
          setPull((state) =>
            !state || state.id !== event.pullId
              ? state
              : cancelled
                ? null
                : { ...state, status: '', error: event.error ?? 'Install failed.' },
          );
          return;
        }

        if (event.done) {
          activePull.current = null;
          setInstalled((prev) => ({ ...prev, [current.key]: true }));
          setPull((state) =>
            state && state.id === event.pullId
              ? { ...state, status: 'Installed', completed: state.total, error: null }
              : state,
          );
          onRefresh();
          window.setTimeout(() => {
            setPull((state) => (state && state.id === event.pullId ? null : state));
          }, 1400);
          return;
        }

        setPull((state) =>
          state && state.id === event.pullId
            ? {
                ...state,
                status: event.status || state.status,
                completed: typeof event.completed === 'number' ? event.completed : state.completed,
                total: typeof event.total === 'number' ? event.total : state.total,
              }
            : state,
        );
      }),
    [onRefresh],
  );

  const install = async (model: HubModel) => {
    if (pull && !pull.error) return;
    const id = uid();
    const key = modelKeyOf(model);
    activePull.current = { id, key };
    setPull({ id, key, target: installTarget(model), status: 'Starting install', completed: 0, total: 0, error: null });
    try {
      const result = await bridge.pullModel({
        pullId: id,
        baseUrl,
        model: installTarget(model),
      });
      if (!result.ok) {
        activePull.current = null;
        setPull((state) =>
          state && state.id === id
            ? { ...state, status: '', error: result.error || 'Could not start the install.' }
            : state,
        );
      }
    } catch (error) {
      activePull.current = null;
      setPull((state) =>
        state && state.id === id
          ? {
              ...state,
              status: '',
              error: error instanceof Error ? error.message : 'Could not start the install.',
            }
          : state,
      );
    }
  };

  const cancelInstall = () => {
    const current = activePull.current;
    if (!current) return;
    activePull.current = null;
    void bridge.abortPull(current.id);
    setPull(null);
  };

  const copyPull = async (model: HubModel) => {
    try {
      await navigator.clipboard.writeText(installCommand(model));
      setCopied(model.id);
      window.setTimeout(() => setCopied((current) => (current === model.id ? null : current)), 1600);
    } catch {
      /* The clipboard can be unavailable in some desktop environments. */
    }
  };

  const installing = Boolean(pull && !pull.error);

  return (
    <div className="model-picker" ref={root}>
      <button
        type="button"
        className={cn('model-trigger', open && 'is-open')}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch model"
      >
        <CpuIcon size={15} />
        <span className="model-trigger-name">{value || 'Select model'}</span>
        <ChevronDownIcon size={14} className="model-trigger-chevron" />
      </button>

      {open && (
        <div className={cn('model-popover', tab === 'online' && 'is-online')}>
          <div className="model-tabs" role="tablist" aria-label="Model source">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'installed'}
              className={cn('model-tab', tab === 'installed' && 'is-active')}
              onClick={() => setTab('installed')}
            >
              Installed
              <span className="model-tab-count">{models.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'online'}
              className={cn('model-tab', tab === 'online' && 'is-active')}
              onClick={() => setTab('online')}
            >
              Online
            </button>
          </div>

          {tab === 'installed' ? (
            <>
              <div className="model-search">
                <SearchIcon size={14} />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter models"
                  aria-label="Filter models"
                />
              </div>
              <div className="model-list" role="listbox">
                {filtered.length === 0 && (
                  <div className="model-empty">
                    {models.length === 0
                      ? 'No models on this host. Install one from the Online tab.'
                      : 'No matching models.'}
                  </div>
                )}
                {filtered.map((model) => (
                  <button
                    type="button"
                    key={model.name}
                    role="option"
                    aria-selected={model.name === value}
                    className={cn('model-item', model.name === value && 'is-selected')}
                    onClick={() => {
                      onChange(model.name);
                      setOpen(false);
                    }}
                  >
                    <span className="model-item-main">
                      <span className="model-name">{model.name}</span>
                      <span className="model-meta">
                        {[
                          model.details?.parameter_size,
                          model.details?.quantization_level,
                          model.size ? formatBytes(model.size) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="model-tags">
                      {model.capabilities?.includes('thinking') && <span className="tag">think</span>}
                      {model.capabilities?.includes('vision') && <span className="tag">vision</span>}
                      {model.capabilities?.includes('tools') && <span className="tag">tools</span>}
                    </span>
                  </button>
                ))}
              </div>
              <div className="model-footer">
                <span>
                  {models.length} model{models.length === 1 ? '' : 's'}
                  {active?.details?.context_length
                    ? ` · max ctx ${active.details.context_length.toLocaleString()}`
                    : ''}
                </span>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRefresh();
                  }}
                  disabled={loading}
                >
                  <RefreshIcon size={13} className={loading ? 'spin' : undefined} /> Refresh
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="model-search">
                <SearchIcon size={14} />
                <input
                  autoFocus
                  value={hubQuery}
                  onChange={(event) => setHubQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void runSearch(provider, hubQuery);
                    }
                  }}
                  placeholder={
                    provider === 'ollama'
                      ? 'Search ollama.com'
                      : 'Search Hugging Face GGUF models'
                  }
                  aria-label="Search online models"
                  spellCheck={false}
                />
              </div>

              <div className="hub-source-row">
                <div className="segmented hub-seg" role="group" aria-label="Model source">
                  <button
                    type="button"
                    className={cn('seg-btn', provider === 'ollama' && 'is-active')}
                    onClick={() => setProvider('ollama')}
                  >
                    Ollama
                  </button>
                  <button
                    type="button"
                    className={cn('seg-btn', provider === 'huggingface' && 'is-active')}
                    onClick={() => setProvider('huggingface')}
                  >
                    Hugging Face
                  </button>
                </div>
                <span className="hub-source-note">Requires internet</span>
              </div>

              <div className="hub-list">
                {hubLoading && hubResults.length === 0 && (
                  <div className="model-empty">Searching {HUB_LABEL[provider]}…</div>
                )}
                {!hubLoading && hubError && (
                  <div className="model-empty model-error">
                    <WifiOffIcon size={14} />
                    <span>{hubError}</span>
                  </div>
                )}
                {!hubLoading && !hubError && hubResults.length === 0 && (
                  <div className="model-empty">
                    {hubQuery.trim()
                      ? `No models match “${hubQuery.trim()}” on ${HUB_LABEL[provider]}.`
                      : `Nothing found on ${HUB_LABEL[provider]}. Try a model name.`}
                  </div>
                )}
                {hubResults.map((model) => {
                  const key = modelKeyOf(model);
                  const pulling = pull?.key === key ? pull : null;
                  const progress =
                    pulling && pulling.total > 0
                      ? Math.min(100, Math.round((pulling.completed / pulling.total) * 100))
                      : null;
                  const isModelInstalled = isInstalled(model);
                  const meta =
                    model.provider === 'huggingface'
                      ? [
                          model.downloads != null ? `${formatCount(model.downloads)} downloads` : null,
                          model.likes != null ? `${formatCount(model.likes)} likes` : null,
                          ...(model.tags ?? []).slice(0, 2),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : (model.tags ?? []).join(' · ') || 'ollama.com';
                  return (
                    <div className="hub-item" key={key}>
                      <button
                        type="button"
                        className="hub-main"
                        onClick={() => void bridge.openExternal(model.url)}
                        title={`Open ${model.url}`}
                      >
                        <span className="hub-top">
                          <span className="model-name">{model.name}</span>
                          <ExternalLinkIcon size={12} className="hub-open" />
                        </span>
                        <span className="model-meta">{meta}</span>
                        {model.description && <span className="hub-desc">{model.description}</span>}
                        {pulling && !pulling.error && (
                          <>
                            <span className="hub-progress">
                              <span
                                className={cn(
                                  'hub-progress-bar',
                                  progress == null && 'is-indeterminate',
                                )}
                                style={progress != null ? { width: `${Math.max(progress, 2)}%` } : undefined}
                              />
                            </span>
                            <span className="hub-pull-status">
                              {progress != null
                                ? `${pulling.status || 'Downloading'} · ${formatBytes(pulling.completed)} / ${formatBytes(pulling.total)}`
                                : pulling.status || 'Downloading'}
                            </span>
                          </>
                        )}
                        {pulling?.error && (
                          <span className="hub-pull-status is-error">{pulling.error}</span>
                        )}
                      </button>

                      <div className="hub-actions">
                        {pulling ? (
                          pulling.error ? (
                            <button
                              type="button"
                              className="hub-install is-error"
                              onClick={() => void install(model)}
                              title={pulling.error}
                            >
                              <RefreshIcon size={12} /> Retry
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="hub-install is-busy"
                              onClick={cancelInstall}
                              title="Cancel install"
                            >
                              <StopIcon size={11} /> {progress != null ? `${progress}%` : 'Cancel'}
                            </button>
                          )
                        ) : isModelInstalled ? (
                          <span className="hub-installed">
                            <CheckIcon size={12} /> Installed
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="hub-install"
                            onClick={() => void install(model)}
                            disabled={installing}
                            title={`Install ${installTarget(model)} with Ollama`}
                          >
                            <DownloadIcon size={12} /> Install
                          </button>
                        )}
                        <button
                          type="button"
                          className="hub-copy"
                          onClick={() => void copyPull(model)}
                          title={`Copy “${installCommand(model)}”`}
                          aria-label={`Copy command for ${model.name}`}
                        >
                          {copied === model.id ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="model-footer">
                <span>
                  {pull && !pull.error
                    ? `Installing ${pull.target}…`
                    : hubLoading
                      ? 'Searching…'
                      : `${hubResults.length} result${hubResults.length === 1 ? '' : 's'} · ${HUB_LABEL[provider]}`}
                </span>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => void runSearch(provider, hubQuery)}
                  disabled={hubLoading || installing}
                >
                  <RefreshIcon size={13} className={hubLoading ? 'spin' : undefined} /> Search
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
