import { useState, type ReactNode } from 'react';
import type { Conversation, OllamaModel, OllamaShowInfo, Params } from '../types';
import { CONTEXT_CHOICES } from '../lib/defaults';
import { cn, estimateTokens, formatBytes, formatCount, formatDuration } from '../lib/format';
import { SYSTEM_PRESETS } from '../lib/presets';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import {
  ActivityIcon,
  AlertIcon,
  ChevronRightIcon,
  CloseIcon,
  CpuIcon,
  DiceIcon,
  MessageIcon,
  RefreshIcon,
  SlidersIcon,
} from './icons';

interface ContextMetrics {
  used: number;
  measured: boolean;
  systemTokens: number;
  windowSize: number;
  percent: number;
  remaining: number;
  streaming: boolean;
}

interface UsageTotals {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgTokensPerSecond: number;
}

interface Props {
  conversation: Conversation;
  model?: OllamaModel;
  modelInfo: OllamaShowInfo | null;
  modelInfoLoading: boolean;
  context: ContextMetrics;
  usage: UsageTotals;
  onParams: (patch: Partial<Params>) => void;
  onResetParams: () => void;
  onSystemPrompt: (value: string) => void;
  onThink: (value: boolean | null) => void;
  onClearContext: () => void;
  onRefreshInfo: () => void;
  onClose: () => void;
}

function Section({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn('inspector-section', open && 'is-open')}>
      <button type="button" className="section-head" onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
        <ChevronRightIcon size={13} className="section-chevron" />
        <span className="section-icon">{icon}</span>
        <span className="section-title">{title}</span>
        {badge && <span className="section-badge">{badge}</span>}
      </button>
      <div className="section-body-wrap">
        <div className="section-body">{children}</div>
      </div>
    </section>
  );
}

function Gauge({ percent, used, windowSize }: { percent: number; used: number; windowSize: number }) {
  const animated = useAnimatedNumber(percent, 520);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const capped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (capped / 100) * circumference;
  const tone = capped >= 90 ? 'danger' : capped >= 70 ? 'warn' : 'ok';
  return (
    <div className="gauge">
      <svg viewBox="0 0 100 100" width="104" height="104" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className="gauge-track" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={cn('gauge-value', tone)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="gauge-center">
        <strong>{Math.round(animated)}%</strong>
        <span>
          {formatCount(used)} / {formatCount(windowSize)}
        </span>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <span className="field-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function KeyValue({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong className={mono ? 'mono' : undefined}>{value}</strong>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  if (!values.length) return <div className="sparkline empty">No runs yet</div>;
  return (
    <div className="sparkline">
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          style={{ height: `${Math.max(10, (value / max) * 100)}%` }}
          title={`${value.toFixed(1)} tok/s`}
        />
      ))}
    </div>
  );
}

export function Inspector({
  conversation,
  model,
  modelInfo,
  modelInfoLoading,
  context,
  usage,
  onParams,
  onResetParams,
  onSystemPrompt,
  onThink,
  onClearContext,
  onRefreshInfo,
  onClose,
}: Props) {
  const params = conversation.params;
  const capabilities = model?.capabilities ?? modelInfo?.capabilities ?? [];
  const thinkSupported = capabilities.includes('thinking');
  const presetMatch = SYSTEM_PRESETS.find((preset) => preset.prompt === conversation.systemPrompt);
  const presetValue = presetMatch ? presetMatch.id : 'custom';

  const rawMax = modelInfo?.model_info?.['general.context_length'];
  const maxCtx = model?.details?.context_length ?? (typeof rawMax === 'number' ? rawMax : undefined);
  const arch = modelInfo?.model_info?.['general.architecture'];

  const ctxChoices = CONTEXT_CHOICES.includes(params.num_ctx)
    ? CONTEXT_CHOICES
    : [...CONTEXT_CHOICES, params.num_ctx].sort((a, b) => a - b);

  const rates = conversation.messages
    .filter((message) => message.stats && message.stats.tokensPerSecond > 0)
    .slice(-14)
    .map((message) => message.stats!.tokensPerSecond);

  const lastStats = [...conversation.messages].reverse().find((message) => message.stats)?.stats;

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div>
          <h2>Inspector</h2>
          <p>Context, sampling and usage telemetry</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} title="Hide inspector">
          <CloseIcon size={15} />
        </button>
      </div>

      <div className="inspector-scroll">
        <Section title="System prompt" icon={<MessageIcon size={14} />} badge={`${formatCount(estimateTokens(conversation.systemPrompt))} tok`}>
          <textarea
            className="prompt-editor"
            value={conversation.systemPrompt}
            onChange={(event) => onSystemPrompt(event.target.value)}
            placeholder="Describe the role, tone and constraints for this conversation…"
            rows={7}
            spellCheck
          />
          <div className="prompt-meta">
            <select
              className="preset-select"
              value={presetValue}
              onChange={(event) => {
                const preset = SYSTEM_PRESETS.find((item) => item.id === event.target.value);
                if (preset) onSystemPrompt(preset.prompt);
              }}
              title="Load a preset"
            >
              {presetValue === 'custom' && (
                <option value="custom" disabled>
                  Custom prompt
                </option>
              )}
              {SYSTEM_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <span className="prompt-count">{conversation.systemPrompt.length} chars</span>
          </div>
        </Section>

        <Section title="Context" icon={<ActivityIcon size={14} />} badge={`${Math.round(context.percent)}%`}>
          <div className="gauge-row">
            <Gauge percent={context.percent} used={context.used} windowSize={context.windowSize} />
            <div className="gauge-legend">
              <div>
                <span className="legend-dot accent" />
                <span>Used</span>
                <strong>{formatCount(context.used)}</strong>
              </div>
              <div>
                <span className="legend-dot dim" />
                <span>Free</span>
                <strong>{formatCount(context.remaining)}</strong>
              </div>
              <div>
                <span className="legend-dot dim" />
                <span>Window</span>
                <strong>{formatCount(context.windowSize)}</strong>
              </div>
            </div>
          </div>

          <div className="status-line">
            <span className={cn('status-pill', context.measured && !context.streaming ? 'is-measured' : 'is-estimated')}>
              {context.streaming ? 'live estimate' : context.measured ? 'measured' : 'estimate'}
            </span>
            {context.percent >= 85 && (
              <span className="warn-text">
                <AlertIcon size={12} /> near limit
              </span>
            )}
          </div>

          <div className="kv-list">
            <KeyValue label="System prompt" value={`≈ ${formatCount(context.systemTokens)}`} />
            <KeyValue label="Conversation" value={`≈ ${formatCount(Math.max(context.used - context.systemTokens, 0))}`} />
            <KeyValue label="Remaining" value={formatCount(context.remaining)} />
          </div>

          {context.percent >= 85 && (
            <p className="info-note">Context is nearly full. Raise num_ctx or start a fresh chat to keep quality up.</p>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm full"
            onClick={onClearContext}
            disabled={conversation.messages.length === 0 || context.streaming}
          >
            Clear context
          </button>
        </Section>

        <Section title="Sampling" icon={<SlidersIcon size={14} />} badge={`${params.temperature.toFixed(2)} temp`}>
          {thinkSupported && (
            <div className="field">
              <div className="field-label">
                <span>Thinking mode</span>
              </div>
              <div className="segmented">
                {[
                  { label: 'Auto', value: null },
                  { label: 'On', value: true },
                  { label: 'Off', value: false },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={cn('seg-btn', (conversation.think ?? null) === option.value && 'is-active')}
                    onClick={() => onThink(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Slider
            label="temperature"
            value={params.temperature}
            min={0}
            max={2}
            step={0.05}
            display={params.temperature.toFixed(2)}
            onChange={(value) => onParams({ temperature: value })}
          />
          <Slider
            label="top_p"
            value={params.top_p}
            min={0}
            max={1}
            step={0.01}
            display={params.top_p.toFixed(2)}
            onChange={(value) => onParams({ top_p: value })}
          />
          <Slider
            label="top_k"
            value={params.top_k}
            min={1}
            max={200}
            step={1}
            display={String(params.top_k)}
            onChange={(value) => onParams({ top_k: value })}
          />
          <Slider
            label="repeat_penalty"
            value={params.repeat_penalty}
            min={0.8}
            max={2}
            step={0.01}
            display={params.repeat_penalty.toFixed(2)}
            onChange={(value) => onParams({ repeat_penalty: value })}
          />

          <div className="field">
            <div className="field-label">
              <span>num_ctx</span>
              <span className="field-value">{formatCount(params.num_ctx)}</span>
            </div>
            <select
              className="select"
              value={params.num_ctx}
              onChange={(event) => onParams({ num_ctx: Number(event.target.value) })}
              title={maxCtx ? `Model maximum: ${maxCtx.toLocaleString()}` : 'Context window'}
            >
              {ctxChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice.toLocaleString()} tokens
                </option>
              ))}
            </select>
            {maxCtx && <span className="field-hint">model supports up to {maxCtx.toLocaleString()}</span>}
          </div>

          <div className="field">
            <div className="field-label">
              <span>num_predict</span>
              <span className="field-value">{params.num_predict === -1 ? 'until done' : params.num_predict}</span>
            </div>
            <input
              type="number"
              className="input"
              value={params.num_predict}
              min={-1}
              step={16}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === '') {
                  onParams({ num_predict: -1 });
                  return;
                }
                const next = Number(raw);
                onParams({ num_predict: Number.isFinite(next) && next >= -1 ? Math.round(next) : -1 });
              }}
            />
            <span className="field-hint">−1 generates until the model stops</span>
          </div>

          <div className="field">
            <div className="field-label">
              <span>seed</span>
              <span className="field-value">{params.seed ?? 'random'}</span>
            </div>
            <div className="field-inline">
              <input
                type="number"
                className="input"
                placeholder="random"
                value={params.seed ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  onParams({ seed: value === '' ? null : Math.max(0, Math.round(Number(value))) });
                }}
              />
              <button
                type="button"
                className="icon-btn"
                title="Randomize seed"
                onClick={() => onParams({ seed: Math.floor(Math.random() * 1_000_000) })}
              >
                <DiceIcon size={15} />
              </button>
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              <span>stop sequences</span>
              <span className="field-value">{params.stop.filter(Boolean).length || 'none'}</span>
            </div>
            <textarea
              className="small-editor"
              rows={2}
              placeholder={'One sequence per line\n###'}
              value={params.stop.join('\n')}
              onChange={(event) => onParams({ stop: event.target.value.split('\n').slice(0, 8) })}
              spellCheck={false}
            />
          </div>

          <button type="button" className="btn btn-ghost btn-sm full" onClick={onResetParams}>
            Reset to defaults
          </button>
        </Section>

        <Section title="Model" icon={<CpuIcon size={14} />} badge={model?.details?.parameter_size ?? '—'}>
          {model ? (
            <>
              <div className="model-facts">
                <span className="model-facts-name">{model.name}</span>
                <div className="tag-row">
                  {capabilities.map((capability) => (
                    <span className="tag" key={capability}>
                      {capability}
                    </span>
                  ))}
                </div>
              </div>
              <div className="kv-list">
                <KeyValue label="Family" value={model.details?.family ?? '—'} />
                {arch != null && <KeyValue label="Architecture" value={String(arch)} />}
                <KeyValue label="Parameters" value={model.details?.parameter_size ?? '—'} />
                <KeyValue label="Quantization" value={model.details?.quantization_level ?? '—'} />
                <KeyValue label="Max context" value={maxCtx ? maxCtx.toLocaleString() : '—'} />
                <KeyValue label="Embedding" value={model.details?.embedding_length?.toLocaleString() ?? '—'} />
                <KeyValue label="Size on disk" value={formatBytes(model.size)} />
                {model.modified_at && (
                  <KeyValue label="Modified" value={new Date(model.modified_at).toLocaleDateString()} />
                )}
              </div>
              <div className="inspector-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={onRefreshInfo} disabled={modelInfoLoading}>
                  <RefreshIcon size={13} className={modelInfoLoading ? 'spin' : undefined} /> Refresh info
                </button>
              </div>
            </>
          ) : (
            <p className="info-note">No model selected. Pick one from the header to see its details.</p>
          )}
        </Section>

        <Section title="Usage" icon={<ActivityIcon size={14} />} badge={`${usage.requests} run${usage.requests === 1 ? '' : 's'}`}>
          <div className="usage-hero">
            <div>
              <div className="usage-label">Average decode</div>
              <div className="usage-rate">
                {usage.avgTokensPerSecond ? usage.avgTokensPerSecond.toFixed(1) : '—'} <span>tok/s</span>
              </div>
            </div>
            <Sparkline values={rates} />
          </div>

          <div className="stat-grid">
            <div>
              <span>Prompt</span>
              <strong>{formatCount(usage.promptTokens)}</strong>
            </div>
            <div>
              <span>Completion</span>
              <strong>{formatCount(usage.completionTokens)}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatCount(usage.totalTokens)}</strong>
            </div>
            <div>
              <span>Requests</span>
              <strong>{usage.requests}</strong>
            </div>
          </div>

          {lastStats ? (
            <div className="kv-list">
              <KeyValue label="Time to first token" value={formatDuration(lastStats.ttftMs)} />
              <KeyValue label="Prompt eval" value={formatDuration(lastStats.promptDurationMs)} />
              <KeyValue label="Decode" value={formatDuration(lastStats.evalDurationMs)} />
              <KeyValue label="Model load" value={formatDuration(lastStats.loadDurationMs)} />
              <KeyValue label="Last total" value={formatDuration(lastStats.totalDurationMs)} />
              <KeyValue label="Last request" value={`${formatCount(lastStats.promptTokens)} in · ${formatCount(lastStats.completionTokens)} out`} />
            </div>
          ) : (
            <p className="info-note">Send a message to collect token counts and timings from Ollama.</p>
          )}

          <p className="inspector-note">Token counts and durations reported by the Ollama server. Defaults shown for context are estimates.</p>
        </Section>
      </div>
    </aside>
  );
}

