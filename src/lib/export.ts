import { conversationTotals } from './defaults';
import { formatDuration } from './format';
import type { Conversation } from '../types';

export function conversationToMarkdown(conversation: Conversation): string {
  const totals = conversationTotals(conversation.messages);
  const params = conversation.params;
  const lines: string[] = [
    `# ${conversation.title}`,
    '',
    `- **Model:** \`${conversation.model || 'none'}\``,
    `- **Exported:** ${new Date().toLocaleString()}`,
    `- **Messages:** ${conversation.messages.length}`,
    `- **Tokens:** ${totals.promptTokens.toLocaleString()} prompt / ${totals.completionTokens.toLocaleString()} completion`,
    `- **Sampling:** temperature ${params.temperature} · top_p ${params.top_p} · top_k ${params.top_k} · repeat_penalty ${params.repeat_penalty} · num_ctx ${params.num_ctx}`,
    '',
  ];

  if (conversation.systemPrompt.trim()) {
    lines.push('## System prompt', '', '```text', conversation.systemPrompt.trim(), '```', '');
  }

  lines.push('---', '');

  conversation.messages.forEach((message) => {
    lines.push(`## ${message.role === 'user' ? 'User' : 'Assistant'}`, '');
    if (message.thinking) {
      lines.push('<details>', '<summary>Reasoning</summary>', '', message.thinking, '', '</details>', '');
    }
    lines.push(message.content || '_(empty)_', '');
    if (message.stats) {
      lines.push(
        `> ${message.stats.promptTokens} prompt · ${message.stats.completionTokens} completion · ${message.stats.tokensPerSecond.toFixed(1)} tok/s · ${formatDuration(message.stats.totalDurationMs)}`,
        '',
      );
    }
    if (message.stopped) lines.push('> _Generation stopped by user._', '');
    if (message.error) lines.push(`> **Error:** ${message.error}`, '');
  });

  return `${lines.join('\n').trimEnd()}\n`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const date = new Date().toISOString().slice(0, 10);
  return `btr-ollama-${slug || 'chat'}-${date}.md`;
}
