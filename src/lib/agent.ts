import type {
  AgentApiMessage,
  AgentSession,
  AgentToolDefinition,
  AgentToolCall,
} from '../types';

export const AGENT_READ_TOOLS = new Set(['list_files', 'read_file', 'search_files', 'git_diff']);
export const AGENT_INTERACTIVE_TOOLS = new Set(['ask_user']);

export const AGENT_MAX_STEPS = 16;

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List files and folders inside the project. Use this first to understand the layout. Skips dependency, build, and version-control directories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative folder path. Defaults to the project root.' },
          depth: { type: 'integer', minimum: 1, maximum: 4, description: 'How many levels to descend. Defaults to 3.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a UTF-8 text file from the project. Returns a bounded line range. Read the relevant file before changing it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          start_line: { type: 'integer', minimum: 1, description: 'First line to return (1-based).' },
          end_line: { type: 'integer', minimum: 1, description: 'Last line to return, inclusive.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description:
        'Search text across project files. Returns matching paths, line numbers, and line snippets. Prefer this over guessing where code lives.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal text or regular expression to search for.' },
          path: { type: 'string', description: 'Relative folder path to search. Defaults to the whole project.' },
          regex: { type: 'boolean', description: 'Treat query as a regular expression. Defaults to false.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description:
        'Ask the user one or more clarifying questions and pause until they answer. Use this at the start of a new task before inspecting or changing files when the scope, desired behavior, or constraints are not fully specified. Put every question into one message and offer short options when useful. Do not use this to ask permission for a tool call.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'A concise message with one to three numbered questions. The run pauses until the user replies.',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 4,
            description: 'Optional suggested answers shown as quick-reply buttons.',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create or replace an entire text file. The user must approve this action. Use replace_in_file for small edits to existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          content: { type: 'string', description: 'Complete file content.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_in_file',
      description:
        'Replace an exact block of text in a file. The user must approve this action. Read the file first and include enough surrounding text to make the match unique.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          old_text: { type: 'string', description: 'Exact text to find, including whitespace.' },
          new_text: { type: 'string', description: 'Replacement text.' },
          replace_all: { type: 'boolean', description: 'Replace every occurrence. Defaults to false.' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a shell command in the project root (or a subfolder of it). Use it for package installs, tests, builds, formatting, git add/commit, and short inspection commands. The app either asks for approval or auto-runs commands, depending on the session setting. Do not start long-running servers.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute.' },
          cwd: { type: 'string', description: 'Relative working directory. Defaults to the project root.' },
          timeout_seconds: {
            type: 'integer',
            minimum: 1,
            maximum: 600,
            description: 'Timeout in seconds. Defaults to 180.',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description:
        'Show git status and the current uncommitted diff. Use this to review changes before reporting back.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional relative path to limit the diff.' },
        },
      },
    },
  },
];

export const AGENT_BRIEF_TOOLS = AGENT_TOOLS.filter((tool) => tool.function.name === 'ask_user');

export const AGENT_BRIEF_INSTRUCTION = [
  'CLARIFICATION PHASE: Do not start the task yet.',
  'You have only the ask_user tool. Call ask_user now with one to three concrete questions that will let you complete the task correctly.',
  'Ask about the desired outcome, constraints, and any important preference or approach. Put every question in the question field.',
  'Do not create, edit, or run anything. Do not answer the task until the user replies.',
].join('\n');

export function projectBasename(projectPath: string): string {
  return projectPath.split(/[\\/]/).filter(Boolean).pop() || projectPath;
}

export function agentSystemPrompt(session: AgentSession): string {
  return [
    'You are BTR Code, a focused coding agent working inside a real project directory.',
    `Project root: ${session.projectPath}`,
    '',
    'Work like a careful senior engineer:',
    '- At the start of a new task, call ask_user with one to three useful clarifying questions before inspecting or changing anything. Wait for the answer. Do not re-ask questions the user already answered, and skip the question step when the user explicitly says to proceed without questions.',
    '- Inspect the project before editing. Use list_files, search_files, and read_file instead of guessing.',
    '- Make the smallest coherent change that solves the task. Do not rewrite unrelated code.',
    '- Use relative paths inside the project. Never read, write, or run commands against paths outside the project root.',
    '- Tool calls are how you act. The interface gates writes and commands; never claim you cannot access the filesystem and never ask the user to run a command you can run yourself.',
    '- Create new files and nested folders with write_file. Use run_command for package installs, tests, builds, formatting, and git add/commit.',
    '- File edits always ask for approval. Commands ask by default, but the user can enable auto-run for the session.',
    '- Python installs must stay in the project. Prefer a project-local virtual environment such as `.venv` before running pip.',
    '- Run relevant tests, type checks, or builds after changes when the project supports them. If a command fails, read its output and exit code, fix the cause, and retry when reasonable.',
    '- If git commit fails because user.name or user.email is missing, set them locally in that repository with git config (never --global) and retry.',
    '- Do not run destructive commands, deploy, publish, push, install global packages, or start long-running servers unless the user explicitly asks.',
    '- Do not claim a command ran or a file changed unless the tool returned that result.',
    '- When the task is complete, summarize what changed, what you verified, and anything still unresolved.',
    '',
    'You are connected to a local Ollama model. Tool results are real. Keep going until the task is done or you genuinely need user input.',
  ].join('\n');
}

export function toolCallSummary(call: AgentToolCall): string {
  const args = call.arguments || {};
  if (call.name === 'run_command') return String(args.command ?? '');
  if (call.name === 'ask_user') return String(args.question ?? '');
  if (call.name === 'search_files') return String(args.query ?? '');
  if (typeof args.path === 'string' && args.path.trim()) return args.path;
  return '';
}

export function toolCallLabel(name: string): string {
  switch (name) {
    case 'list_files':
      return 'List files';
    case 'read_file':
      return 'Read file';
    case 'search_files':
      return 'Search';
    case 'ask_user':
      return 'Ask you';
    case 'write_file':
      return 'Write file';
    case 'replace_in_file':
      return 'Edit file';
    case 'run_command':
      return 'Run command';
    case 'git_diff':
      return 'Review diff';
    default:
      return name || 'Tool';
  }
}

function bounded(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n… [${value.length - limit} characters truncated]`;
}

/**
 * Convert the visible session timeline into Ollama's tool-call message format.
 * Older tool outputs are shortened, while every assistant tool call keeps a
 * matching tool response so the conversation remains valid.
 */
export function buildAgentApiMessages(session: AgentSession): AgentApiMessage[] {
  const toolMessages = session.messages.filter((message) => message.role === 'tool');
  const keepFull = new Set(toolMessages.slice(-4).map((message) => message.id));

  return [
    { role: 'system', content: agentSystemPrompt(session) },
    ...session.messages.map((message): AgentApiMessage => {
      if (message.role === 'user') {
        return { role: 'user', content: bounded(message.content, 12000) };
      }

      if (message.role === 'assistant') {
        const api: AgentApiMessage = {
          role: 'assistant',
          content: bounded(message.content, 6000),
        };
        if (message.toolCalls?.length) {
          api.tool_calls = message.toolCalls.map((call) => ({
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          }));
        }
        return api;
      }

      let content = message.toolResult?.trim() || '';
      if (message.toolStatus === 'denied') {
        content = 'The user denied this tool call. Do not retry it unless the user asks.';
      } else if (message.toolStatus === 'error') {
        content = [
          message.toolResult?.trim(),
          `Tool error: ${message.toolError || 'The tool failed.'}`,
        ]
          .filter(Boolean)
          .join('\n\n');
      } else if (!content) {
        content = 'The tool returned no output.';
      }
      if (!keepFull.has(message.id)) {
        content = `[Earlier ${message.toolName || 'tool'} result omitted to conserve context. Re-run it if needed.]`;
      } else {
        content = bounded(content, 6000);
      }
      return {
        role: 'tool',
        content,
        tool_name: message.toolName || 'tool',
      };
    }),
  ];
}
