/** Rough token count used for estimates before the server reports real numbers. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x2e80) tokens += 1;
    else if (/[A-Za-z0-9]/.test(char)) tokens += 0.26;
    else if (/\s/.test(char)) tokens += 0.05;
    else tokens += 0.12;
  }
  return Math.max(1, Math.round(tokens));
}

export function estimatePromptTokens(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
): number {
  let total = systemPrompt.trim() ? estimateTokens(systemPrompt) + 4 : 0;
  for (const message of messages) {
    total += estimateTokens(message.content) + 4;
  }
  return total;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 2)}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

export function formatExact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString();
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatRate(tokensPerSecond: number | null | undefined): string {
  if (!tokensPerSecond || !Number.isFinite(tokensPerSecond)) return '—';
  return `${tokensPerSecond.toFixed(1)} tok/s`;
}

export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function dayBucket(timestamp: number): string {
  const now = new Date();
  const then = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const days = Math.round((startOfToday - startOfThen) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  if (days < 30) return 'This month';
  return 'Older';
}

export const cn = (...values: Array<string | false | null | undefined>): string =>
  values.filter(Boolean).join(' ');

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
