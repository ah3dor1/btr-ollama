'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

const isMac = process.platform === 'darwin';

const DEFAULT_PARAMS = {
  temperature: 0.8,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
  seed: null,
  num_ctx: 8192,
  num_predict: -1,
  stop: [],
};

const DEFAULT_SETTINGS = {
  baseUrl: 'http://127.0.0.1:11434',
  theme: 'dark',
  introSeen: false,
  keepAlive: '10m',
  defaultModel: null,
  agentModel: null,
  agentAutoAcceptCommands: false,
  showThinking: true,
  autoScroll: true,
  enterToSend: true,
  params: DEFAULT_PARAMS,
};

const defaultStore = () => ({ version: 1, settings: DEFAULT_SETTINGS, conversations: [], agentSessions: [] });

let store = defaultStore();
let storeFile = '';
let mainWindow = null;
const inflight = new Map();
const agentInflight = new Map();
let idleTimer = null;

/* ------------------------------------------------------------------ */
/* store                                                              */
/* ------------------------------------------------------------------ */

function mergeStore(raw) {
  const base = defaultStore();
  if (!raw || typeof raw !== 'object') return base;
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    version: 1,
    settings: {
      ...base.settings,
      ...settings,
      params: { ...base.settings.params, ...(settings.params || {}) },
    },
    conversations: Array.isArray(raw.conversations) ? raw.conversations : [],
    agentSessions: Array.isArray(raw.agentSessions) ? raw.agentSessions : [],
  };
}

async function loadStore() {
  storeFile = path.join(app.getPath('userData'), 'btr-ollama-store.json');
  try {
    const raw = await fs.readFile(storeFile, 'utf8');
    store = mergeStore(JSON.parse(raw));
  } catch {
    store = defaultStore();
  }
}

async function persistStore() {
  if (!storeFile) return;
  const payload = JSON.stringify(store);
  const tmp = `${storeFile}.tmp`;
  try {
    await fs.writeFile(tmp, payload, 'utf8');
    await fs.rename(tmp, storeFile);
  } catch (err) {
    console.error('[BTR] failed to save store:', err);
  }
}

/* ------------------------------------------------------------------ */
/* ollama helpers                                                     */
/* ------------------------------------------------------------------ */

const normalizeBase = (value) =>
  String(value || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');

function describeNetworkError(err, baseUrl) {
  if (!err) return 'Unknown error';
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return `Ollama did not respond at ${baseUrl}. Is the daemon running?`;
  }
  const cause = err.cause && (err.cause.code || err.cause.message);
  if (cause === 'ECONNREFUSED' || /fetch failed/i.test(err.message || '')) {
    return `Could not reach Ollama at ${baseUrl}. Start it with "ollama serve".`;
  }
  return err.message || String(err);
}

async function ollamaJson(baseUrl, route, init) {
  const base = normalizeBase(baseUrl);
  const res = await fetch(`${base}${route}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new Error(`Ollama ${route} returned ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* online model search                                                */
/* ------------------------------------------------------------------ */

const HUB_TIMEOUT_MS = 12000;

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function fetchHubText(url, accept) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; BTR-Ollama/1.0)',
      accept,
    },
    signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.text();
}

function parseOllamaSearch(html) {
  const results = [];
  const seen = new Set();
  for (const block of String(html).split(/<li[\s>]/i).slice(1)) {
    const link = block.match(/href="\/library\/([^"\/?#]+)/i);
    if (!link) continue;
    const name = decodeEntities(link[1]).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const tags = [...block.matchAll(/class="[^"]*bg-(?:indigo|cyan)-50[^"]*"[^>]*>([^<]+)</gi)]
      .map((match) => stripHtml(match[1]))
      .filter(Boolean)
      .slice(0, 4);
    const description = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    results.push({
      id: name,
      provider: 'ollama',
      name,
      description: description ? stripHtml(description[1]).slice(0, 180) : '',
      tags,
      downloads: null,
      likes: null,
      url: `https://ollama.com/library/${encodeURIComponent(name)}`,
    });
    if (results.length >= 24) break;
  }
  return results;
}

function parseHuggingFaceModels(models) {
  return (Array.isArray(models) ? models : [])
    .map((model) => {
      const id = String(model.id || model.modelId || '').trim();
      if (!id) return null;
      const tags = Array.isArray(model.tags)
        ? model.tags
            .map((tag) => String(tag))
            .filter((tag) => tag && !/^(license|region|base_model|dataset|language):/i.test(tag))
            .slice(0, 4)
        : [];
      return {
        id,
        provider: 'huggingface',
        name: id,
        description: model.pipeline_tag ? String(model.pipeline_tag).replace(/-/g, ' ') : '',
        tags,
        downloads: typeof model.downloads === 'number' ? model.downloads : null,
        likes: typeof model.likes === 'number' ? model.likes : null,
        url: `https://huggingface.co/${id}`,
      };
    })
    .filter(Boolean);
}

async function searchHubModels(provider, query) {
  const term = String(query || '').trim().slice(0, 120);
  if (provider === 'huggingface') {
    const params = new URLSearchParams({
      search: term,
      limit: '20',
      sort: 'downloads',
      direction: '-1',
      filter: 'gguf',
    });
    const text = await fetchHubText(`https://huggingface.co/api/models?${params.toString()}`, 'application/json');
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('Hugging Face returned an unexpected response.');
    }
    return parseHuggingFaceModels(payload);
  }
  if (provider === 'ollama') {
    const html = await fetchHubText(
      `https://ollama.com/search?q=${encodeURIComponent(term)}`,
      'text/html,application/xhtml+xml',
    );
    return parseOllamaSearch(html);
  }
  throw new Error(`Unknown model source: ${provider}`);
}

/* ------------------------------------------------------------------ */
/* chat streaming                                                     */
/* ------------------------------------------------------------------ */

function cleanOptions(options) {
  const source = options && typeof options === 'object' ? options : {};
  const out = {};
  for (const key of ['temperature', 'top_p', 'top_k', 'repeat_penalty', 'seed', 'num_ctx', 'num_predict']) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  if (Array.isArray(source.stop)) {
    const stop = source.stop.map((s) => String(s)).filter(Boolean).slice(0, 8);
    if (stop.length) out.stop = stop;
  }
  return out;
}

async function streamChat(win, payload) {
  const {
    requestId,
    baseUrl,
    model,
    messages,
    options,
    keepAlive,
    think,
  } = payload;

  const send = (data) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('chat:event', { requestId, ...data });
    }
  };

  const controller = new AbortController();
  inflight.set(requestId, controller);

  const body = {
    model,
    messages: Array.isArray(messages) ? messages : [],
    stream: true,
    options: cleanOptions(options),
  };
  if (keepAlive) body.keep_alive = keepAlive;
  if (typeof think === 'boolean') body.think = think;

  let terminal = false;
  try {
    const res = await fetch(`${normalizeBase(baseUrl)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 600);
      } catch {
        /* ignore */
      }
      let parsed = null;
      try {
        parsed = JSON.parse(detail);
      } catch {
        /* not json */
      }
      const message = parsed && parsed.error ? parsed.error : `Ollama returned ${res.status}${detail ? ` — ${detail}` : ''}`;
      terminal = true;
      send({ type: 'error', error: message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          let chunk;
          try {
            chunk = JSON.parse(line);
          } catch {
            chunk = null;
          }
          if (chunk) {
            if (chunk.error) {
              terminal = true;
              send({ type: 'error', error: String(chunk.error) });
              return;
            }
            if (chunk.done) {
              terminal = true;
              send({ type: 'done', data: chunk });
            } else {
              send({ type: 'chunk', data: chunk });
            }
          }
        }
        newline = buffer.indexOf('\n');
      }
    }

    const rest = buffer.trim();
    if (rest) {
      try {
        const chunk = JSON.parse(rest);
        if (chunk.error) {
          terminal = true;
          send({ type: 'error', error: String(chunk.error) });
        } else if (chunk.done) {
          terminal = true;
          send({ type: 'done', data: chunk });
        }
      } catch {
        /* ignore trailing fragment */
      }
    }

    if (!terminal) send({ type: 'aborted', error: 'The stream closed before the response finished.' });
  } catch (err) {
    if (controller.signal.aborted) {
      if (!terminal) send({ type: 'aborted' });
    } else if (!terminal) {
      send({ type: 'error', error: describeNetworkError(err, normalizeBase(baseUrl)) });
    }
  } finally {
    inflight.delete(requestId);
  }
}

/* ------------------------------------------------------------------ */
/* coding agent                                                      */
/* ------------------------------------------------------------------ */

const AGENT_TOOL_NAMES = new Set([
  'ask_user',
  'list_files',
  'read_file',
  'search_files',
  'write_file',
  'replace_in_file',
  'run_command',
  'git_diff',
]);

const AGENT_IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'release',
  'target',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
]);

const AGENT_MAX_FILE_BYTES = 1024 * 1024;
const AGENT_MAX_TOOL_OUTPUT = 20000;

function agentInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

async function resolveAgentRoot(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Choose a project folder first.');
  if (!path.isAbsolute(value)) throw new Error('The project folder must be an absolute path.');
  let root;
  try {
    root = await fs.realpath(value);
  } catch {
    throw new Error('That project folder no longer exists.');
  }
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('The selected project path is not a folder.');
  return root;
}

async function resolveAgentPath(root, value, options = {}) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : '.';
  if (raw.includes('\0')) throw new Error('Invalid path.');
  const target = path.resolve(root, raw);
  if (!agentInside(root, target)) throw new Error('That path is outside the project folder.');
  if (!options.allowRoot && target === root) throw new Error('Expected a file path, not the project root.');

  let existing = target;
  for (;;) {
    if (fsSync.existsSync(existing)) break;
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const real = await fs.realpath(existing);
  if (!agentInside(root, real)) throw new Error('That path resolves outside the project folder.');
  return target;
}

function agentSensitiveName(name) {
  if (name === '.env') return true;
  if (name.startsWith('.env.')) return !/^\.env\.(example|sample|template)$/i.test(name);
  return /^(id_rsa|id_ed25519|credentials|secrets)\./i.test(name);
}

async function walkAgentFiles(root, start, maxDepth = 12, maxFiles = 4000) {
  const files = [];
  const stack = [{ dir: start, depth: 0 }];
  while (stack.length && files.length < maxFiles) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth >= maxDepth) continue;
        if (AGENT_IGNORED_DIRS.has(entry.name) || agentSensitiveName(entry.name)) continue;
        stack.push({ dir: full, depth: current.depth + 1 });
      } else if (entry.isFile()) {
        if (agentSensitiveName(entry.name) || entry.name === '.DS_Store') continue;
        files.push(full);
      }
    }
  }
  return files;
}

async function readAgentText(file) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error('File not found.');
  if (stat.size > AGENT_MAX_FILE_BYTES) throw new Error('File is too large to read (limit 1 MB).');
  const text = await fs.readFile(file, 'utf8');
  if (text.includes('\0')) throw new Error('File appears to be binary.');
  return text;
}

function formatAgentBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function capAgentOutput(value) {
  const text = String(value ?? '');
  if (text.length <= AGENT_MAX_TOOL_OUTPUT) return text;
  return `${text.slice(0, AGENT_MAX_TOOL_OUTPUT)}\n… [output truncated]`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findExecutable(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    try {
      if (fsSync.statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * On Linux, bubblewrap gives shell commands a read-only view of the machine
 * and makes only the selected project writable. Probe it once so a host with
 * user namespaces disabled falls back cleanly instead of failing every command.
 */
function findCommandSandbox() {
  if (process.platform !== 'linux') return null;
  const candidate = findExecutable('bwrap');
  if (!candidate) return null;
  try {
    const probe = spawnSync(candidate, ['--ro-bind', '/', '/', '--', '/bin/true'], {
      timeout: 2500,
      stdio: 'ignore',
    });
    return probe.status === 0 ? candidate : null;
  } catch {
    return null;
  }
}

const commandSandboxPath = findCommandSandbox();

function agentCommandEnv() {
  return {
    ...process.env,
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_EDITOR: 'true',
    GIT_SEQUENCE_EDITOR: 'true',
    GIT_TERMINAL_PROMPT: '0',
    CI: process.env.CI || '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    PIP_NO_INPUT: '1',
    PIP_NO_CACHE_DIR: '1',
    PYTHONUNBUFFERED: '1',
    DEBIAN_FRONTEND: 'noninteractive',
    npm_config_yes: 'true',
    npm_config_cache: '/tmp/btr-npm-cache',
    XDG_CACHE_HOME: '/tmp/btr-cache',
  };
}

function commandInvocation(root, cwd, command) {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command],
      sandboxed: false,
    };
  }

  const shell = fsSync.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
  const shellArgs = ['-lc', command];
  if (!commandSandboxPath) {
    return { command: shell, args: shellArgs, sandboxed: false };
  }

  const sandboxArgs = ['--ro-bind', '/', '/'];
  if (root !== '/tmp' && !root.startsWith(`${path.sep}tmp${path.sep}`)) {
    sandboxArgs.push('--tmpfs', '/tmp');
  }
  sandboxArgs.push(
    '--dev',
    '/dev',
    '--proc',
    '/proc',
    '--bind',
    root,
    root,
    '--chdir',
    cwd,
    '--die-with-parent',
    '--new-session',
    '--',
    shell,
    ...shellArgs,
  );
  return { command: commandSandboxPath, args: sandboxArgs, sandboxed: true };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs ?? 60000;
    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      resolve({ stdout: '', stderr: '', code: null, signal: null, timedOut: false, error: err.message });
      return;
    }

    const limit = 50000;
    let stdout = '';
    let stderr = '';
    let total = 0;
    let timedOut = false;
    let settled = false;

    const append = (target, chunk) => {
      const value = chunk.toString();
      total += value.length;
      if (total <= limit) return target + value;
      const room = Math.max(0, limit - (total - value.length));
      return target + value.slice(0, room);
    };

    child.stdout?.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      }
    }, timeoutMs);

    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal, timedOut, error });
    };

    child.on('error', (err) => finish(null, null, err.message));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

async function listAgentFiles(root, args) {
  const start = await resolveAgentPath(root, args.path, { allowRoot: true });
  const stat = await fs.stat(start).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error('Folder not found.');
  const depth = Math.min(4, Math.max(1, Number(args.depth) || 3));
  const files = await walkAgentFiles(root, start, depth, 260);
  const lines = [];
  for (const file of files) {
    const fileStat = await fs.stat(file).catch(() => null);
    if (!fileStat) continue;
    const rel = path.relative(root, file).split(path.sep).join('/');
    lines.push(`${rel} (${formatAgentBytes(fileStat.size)})`);
  }
  return {
    ok: true,
    output: capAgentOutput(
      [`Project: ${root}`, `Showing ${lines.length} file${lines.length === 1 ? '' : 's'}:`, '', ...lines].join('\n'),
    ),
    meta: { path: root, lines: lines.length },
  };
}

async function readAgentFile(root, args) {
  const file = await resolveAgentPath(root, args.path);
  const text = await readAgentText(file);
  const lines = text.split(/\r?\n/);
  const start = Math.max(1, Math.floor(Number(args.start_line) || 1));
  const requestedEnd = Math.floor(Number(args.end_line) || start + 399);
  const end = Math.min(lines.length, Math.max(start, requestedEnd), start + 399);
  const selected = lines.slice(start - 1, end);
  const rel = path.relative(root, file).split(path.sep).join('/');
  return {
    ok: true,
    output: capAgentOutput(
      `File: ${rel} (${lines.length} lines)\nShowing lines ${start}-${end}\n\n${selected.join('\n')}`,
    ),
    meta: { path: rel, lines: lines.length },
  };
}

async function searchAgentFiles(root, args) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('A search query is required.');
  if (query.length > 300) throw new Error('Search query is too long.');
  let matcher;
  try {
    matcher = new RegExp(args.regex ? query : escapeRegExp(query), 'i');
  } catch {
    throw new Error('That regular expression is not valid.');
  }
  const start = await resolveAgentPath(root, args.path, { allowRoot: true });
  const files = await walkAgentFiles(root, start, 16, 4000);
  const matches = [];
  for (const file of files) {
    if (matches.length >= 80) break;
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.size > 512 * 1024) continue;
    let text;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!matcher.test(lines[index])) continue;
      const rel = path.relative(root, file).split(path.sep).join('/');
      matches.push(`${rel}:${index + 1}: ${lines[index].trim().slice(0, 280)}`);
      if (matches.length >= 80) break;
    }
  }
  return {
    ok: true,
    output: capAgentOutput(
      matches.length
        ? `Found ${matches.length}${matches.length >= 80 ? '+' : ''} match${matches.length === 1 ? '' : 'es'}:\n\n${matches.join('\n')}`
        : 'No matches found.',
    ),
    meta: { lines: matches.length },
  };
}

async function writeAgentFile(root, args) {
  const content = typeof args.content === 'string' ? args.content : '';
  if (content.length > 250000) throw new Error('File content is too large (limit 250 KB).');
  const file = await resolveAgentPath(root, args.path);
  const existed = await fs.stat(file).catch(() => null);
  if (existed && !existed.isFile()) throw new Error('That path is not a file.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  const rel = path.relative(root, file).split(path.sep).join('/');
  const lines = content ? content.split(/\r?\n/).length : 0;
  return {
    ok: true,
    output: `${existed ? 'Updated' : 'Created'} ${rel} (${lines} line${lines === 1 ? '' : 's'}, ${formatAgentBytes(Buffer.byteLength(content))}).`,
    meta: { path: rel, bytes: Buffer.byteLength(content), lines },
  };
}

async function replaceAgentFile(root, args) {
  const oldText = typeof args.old_text === 'string' ? args.old_text : '';
  const newText = typeof args.new_text === 'string' ? args.new_text : '';
  if (!oldText) throw new Error('old_text is required.');
  if (oldText === newText) throw new Error('old_text and new_text are identical.');
  const file = await resolveAgentPath(root, args.path);
  const text = await readAgentText(file);
  const occurrences = text.split(oldText).length - 1;
  if (!occurrences) throw new Error('That exact text was not found in the file.');
  const replaceAll = Boolean(args.replace_all);
  const next = replaceAll ? text.split(oldText).join(newText) : text.replace(oldText, newText);
  await fs.writeFile(file, next, 'utf8');
  const rel = path.relative(root, file).split(path.sep).join('/');
  return {
    ok: true,
    output: `Replaced ${replaceAll ? occurrences : 1} of ${occurrences} occurrence${occurrences === 1 ? '' : 's'} in ${rel}.`,
    meta: { path: rel, lines: occurrences },
  };
}

async function commandAgentProject(root, args) {
  const command = typeof args.command === 'string' ? args.command.trim() : '';
  if (!command) throw new Error('A command is required.');
  if (command.length > 4000) throw new Error('Command is too long.');
  const cwd = await resolveAgentPath(root, args.cwd || '.', { allowRoot: true });
  const cwdStat = await fs.stat(cwd).catch(() => null);
  if (!cwdStat || !cwdStat.isDirectory()) throw new Error('Command working directory not found.');
  const timeoutSeconds = Math.min(600, Math.max(1, Number(args.timeout_seconds) || 180));
  const invocation = commandInvocation(root, cwd, command);
  const result = await runProcess(invocation.command, invocation.args, {
    cwd,
    timeoutMs: timeoutSeconds * 1000,
    env: agentCommandEnv(),
  });

  const parts = [];
  if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
  if (result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trimEnd()}`);
  if (result.timedOut) parts.push(`[timed out after ${timeoutSeconds}s]`);
  if (result.error) parts.push(`[error] ${result.error}`);
  if (result.code !== null && result.code !== 0) parts.push(`[exit code ${result.code}]`);
  const output = parts.join('\n\n') || '(no output)';
  const failed = Boolean(result.error) || result.timedOut || result.code !== 0;
  return {
    ok: !failed,
    output: capAgentOutput(output),
    error: result.error
      || (result.timedOut
        ? `Command timed out after ${timeoutSeconds}s.`
        : result.code !== null && result.code !== 0
          ? `Command exited with code ${result.code}.`
          : undefined),
    meta: { exitCode: result.code, timedOut: result.timedOut, sandboxed: invocation.sandboxed },
  };
}

async function gitAgentDiff(root, args) {
  const rel = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : null;
  if (rel) await resolveAgentPath(root, rel, { allowRoot: true });
  const statusArgs = ['status', '--short'];
  const diffArgs = ['diff', '--no-color'];
  if (rel) {
    statusArgs.push('--', rel);
    diffArgs.push('--', rel);
  }
  const [status, diff] = await Promise.all([
    runProcess('git', statusArgs, { cwd: root, timeoutMs: 15000 }),
    runProcess('git', diffArgs, { cwd: root, timeoutMs: 15000 }),
  ]);
  if (status.code !== 0 && diff.code !== 0) {
    return { ok: false, error: 'This folder is not a git repository, or git is unavailable.' };
  }
  const output = [
    status.stdout.trim() ? `Status:\n${status.stdout.trim()}` : 'Status: clean',
    diff.stdout.trim() ? `Diff:\n${diff.stdout.trim()}` : 'Diff: no uncommitted changes',
  ].join('\n\n');
  return { ok: true, output: capAgentOutput(output), meta: {} };
}

async function runAgentTool(payload) {
  const root = await resolveAgentRoot(payload?.projectPath);
  const name = typeof payload?.name === 'string' ? payload.name : '';
  if (!AGENT_TOOL_NAMES.has(name)) throw new Error(`Unknown tool: ${name || '(missing)'}`);
  const args = payload?.args && typeof payload.args === 'object' && !Array.isArray(payload.args) ? payload.args : {};
  switch (name) {
    case 'ask_user':
      throw new Error('Questions are handled by the coding workspace.');
    case 'list_files':
      return listAgentFiles(root, args);
    case 'read_file':
      return readAgentFile(root, args);
    case 'search_files':
      return searchAgentFiles(root, args);
    case 'write_file':
      return writeAgentFile(root, args);
    case 'replace_in_file':
      return replaceAgentFile(root, args);
    case 'run_command':
      return commandAgentProject(root, args);
    case 'git_diff':
      return gitAgentDiff(root, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function normalizeAgentToolCalls(value) {
  if (!Array.isArray(value)) return [];
  const calls = [];
  for (const item of value.slice(0, 8)) {
    const fn = item && typeof item === 'object' ? item.function || item : null;
    if (!fn || typeof fn.name !== 'string') continue;
    let args = fn.arguments;
    if (args === undefined && fn.parameters !== undefined) args = fn.parameters;
    if (args === undefined && fn.args !== undefined) args = fn.args;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    calls.push({
      name: fn.name,
      arguments: args && typeof args === 'object' && !Array.isArray(args) ? args : {},
    });
  }
  return calls;
}

function collectAgentTextCall(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectAgentTextCall(item, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.tool_calls)) {
    for (const item of value.tool_calls) collectAgentTextCall(item, output);
  }
  const fn = value.function && typeof value.function === 'object' ? value.function : null;
  const name = fn && typeof fn.name === 'string' ? fn.name : typeof value.name === 'string' ? value.name : null;
  const toolName = !name && typeof value.tool === 'string' ? value.tool : name;
  if (toolName && AGENT_TOOL_NAMES.has(toolName)) {
    output.push({
      function: {
        name: toolName,
        arguments: (fn && (fn.arguments ?? fn.parameters ?? fn.args)) ?? value.arguments ?? value.parameters ?? value.args ?? {},
      },
    });
  }
  if (Array.isArray(value.content)) {
    for (const item of value.content) collectAgentTextCall(item, output);
  }
}

function jsonSpans(text) {
  const spans = [];
  for (let start = 0; start < text.length; start += 1) {
    const opening = text[start];
    if (opening !== '{' && opening !== '[') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        depth += 1;
      } else if (char === '}' || char === ']') {
        depth -= 1;
        if (depth === 0) {
          spans.push({ start, end: index + 1, raw: text.slice(start, index + 1) });
          start = index;
          break;
        }
      }
    }
  }
  return spans;
}

/**
 * Some tool-capable coding models emit calls as JSON text rather than filling
 * Ollama's `tool_calls` field. Recover those calls without mistaking unrelated
 * JSON in a final answer for a tool request.
 */
function parseAgentTextToolCalls(content) {
  const text = String(content ?? '');
  if (!text.includes('{') && !text.includes('[')) return { calls: [], content: text };
  const recognized = [];
  const rawCalls = [];
  for (const span of jsonSpans(text)) {
    let value;
    try {
      value = JSON.parse(span.raw);
    } catch {
      continue;
    }
    const before = rawCalls.length;
    collectAgentTextCall(value, rawCalls);
    if (rawCalls.length > before) recognized.push(span);
  }
  const calls = normalizeAgentToolCalls(rawCalls).filter((call) => AGENT_TOOL_NAMES.has(call.name)).slice(0, 8);
  if (calls.length === 0) return { calls: [], content: text };

  let cleaned = text;
  for (const span of recognized.slice().sort((a, b) => b.start - a.start)) {
    cleaned = `${cleaned.slice(0, span.start)}${cleaned.slice(span.end)}`;
  }
  cleaned = cleaned
    .replace(/```(?:json)?/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { calls, content: cleaned };
}

async function requestAgentChat(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Invalid agent request.' };
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
  if (!requestId) return { ok: false, error: 'Missing request id.' };
  if (typeof payload.model !== 'string' || !payload.model.trim()) {
    return { ok: false, error: 'Link a tool-capable model before running the agent.' };
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return { ok: false, error: 'The agent has no messages to send.' };
  }
  if (agentInflight.has(requestId)) return { ok: false, error: 'That agent request is already running.' };

  const controller = new AbortController();
  agentInflight.set(requestId, controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10 * 60 * 1000);

  const body = {
    model: payload.model,
    messages: payload.messages.slice(-100),
    stream: false,
    tools: Array.isArray(payload.tools) ? payload.tools.slice(0, 24) : undefined,
    options: cleanOptions(payload.options),
    think: false,
  };
  if (payload.keepAlive) body.keep_alive = payload.keepAlive;

  try {
    const res = await fetch(`${normalizeBase(payload.baseUrl)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!res.ok) {
      const detail = data && data.error ? String(data.error) : raw.slice(0, 600);
      return { ok: false, error: `Ollama returned ${res.status}${detail ? ` — ${detail}` : ''}` };
    }
    if (!data || data.error) {
      return { ok: false, error: data && data.error ? String(data.error) : 'Ollama returned an empty response.' };
    }
    const message = data.message && typeof data.message === 'object' ? data.message : {};
    let content = typeof message.content === 'string' ? message.content : '';
    let toolCalls = normalizeAgentToolCalls(message.tool_calls);
    if (toolCalls.length === 0) {
      const fallback = parseAgentTextToolCalls(content);
      if (fallback.calls.length) {
        content = fallback.content;
        toolCalls = fallback.calls;
      }
    }
    return {
      ok: true,
      message: {
        content,
        tool_calls: toolCalls,
      },
    };
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        aborted: !timedOut,
        error: timedOut ? 'The model did not respond within 10 minutes.' : 'Stopped.',
      };
    }
    return { ok: false, error: describeNetworkError(err, normalizeBase(payload.baseUrl)) };
  } finally {
    clearTimeout(timer);
    agentInflight.delete(requestId);
  }
}

/* ------------------------------------------------------------------ */
/* window                                                             */
/* ------------------------------------------------------------------ */

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0810',
    title: 'BTR-Ollama',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.BTR_DEV_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  const devUrl = process.env.BTR_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const controller of inflight.values()) controller.abort();
    inflight.clear();
    for (const controller of agentInflight.values()) controller.abort();
    agentInflight.clear();
  });
}

/* ------------------------------------------------------------------ */
/* ipc                                                               */
/* ------------------------------------------------------------------ */

ipcMain.handle('store:load', async () => {
  if (!store) store = defaultStore();
  return store;
});

ipcMain.handle('store:save', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') return { ok: false };
  if (payload.settings) {
    store.settings = {
      ...DEFAULT_SETTINGS,
      ...payload.settings,
      params: { ...DEFAULT_PARAMS, ...(payload.settings.params || {}) },
    };
  }
  if (Array.isArray(payload.conversations)) store.conversations = payload.conversations;
  if (Array.isArray(payload.agentSessions)) store.agentSessions = payload.agentSessions;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    persistStore().catch((err) => console.error('[BTR] save failed', err));
  }, 250);
  return { ok: true };
});

ipcMain.handle('ollama:models', async (_event, baseUrl) => {
  try {
    const data = await ollamaJson(baseUrl, '/api/tags');
    return { ok: true, models: Array.isArray(data.models) ? data.models : [] };
  } catch (err) {
    return { ok: false, error: describeNetworkError(err, normalizeBase(baseUrl)) };
  }
});

ipcMain.handle('ollama:version', async (_event, baseUrl) => {
  try {
    const data = await ollamaJson(baseUrl, '/api/version');
    return { ok: true, version: data.version || '' };
  } catch (err) {
    return { ok: false, error: describeNetworkError(err, normalizeBase(baseUrl)) };
  }
});

ipcMain.handle('ollama:show', async (_event, { baseUrl, model }) => {
  try {
    const data = await ollamaJson(baseUrl, '/api/show', {
      method: 'POST',
      body: JSON.stringify({ model }),
    });
    return { ok: true, info: data };
  } catch (err) {
    return { ok: false, error: describeNetworkError(err, normalizeBase(baseUrl)) };
  }
});

ipcMain.handle('hub:search', async (_event, { provider, query }) => {
  try {
    return { ok: true, results: await searchHubModels(provider, query) };
  } catch (err) {
    const host = provider === 'huggingface' ? 'huggingface.co' : 'ollama.com';
    const message = err && (err.name === 'TimeoutError' || err.name === 'AbortError')
      ? `${host} did not respond in time. Check your internet connection and try again.`
      : /fetch failed|ENOTFOUND|EAI_AGAIN|ECONN|network/i.test(String(err && err.message))
        ? `Could not reach ${host}. Check your internet connection and try again.`
        : err && err.message
          ? err.message
          : `Could not search ${host}.`;
    return { ok: false, error: message };
  }
});

ipcMain.handle('chat:start', async (event, payload) => {
  if (!payload || !payload.requestId || !payload.model) {
    return { ok: false, error: 'A model must be selected before sending.' };
  }
  if (inflight.has(payload.requestId)) {
    return { ok: false, error: 'That request is already running.' };
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  streamChat(win, payload).catch((err) => console.error('[BTR] stream error', err));
  return { ok: true };
});

ipcMain.handle('chat:abort', async (_event, requestId) => {
  const controller = inflight.get(requestId);
  if (controller) controller.abort();
  return { ok: true };
});

ipcMain.handle('agent:pick-project', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose a project folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  try {
    const root = await resolveAgentRoot(result.filePaths[0]);
    return { ok: true, path: root, name: path.basename(root) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('agent:chat', async (_event, payload) => requestAgentChat(payload));

ipcMain.handle('agent:abort', async (_event, requestId) => {
  const controller = agentInflight.get(requestId);
  if (controller) controller.abort();
  return { ok: true };
});

ipcMain.handle('agent:tool', async (_event, payload) => {
  try {
    return await runAgentTool(payload);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('dialog:export', async (event, { name, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Export conversation',
    defaultPath: name || 'btr-ollama-chat.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    await fs.writeFile(result.filePath, content, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('shell:open', async (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('window:zoom', async (event, direction) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { ok: false, level: 0, percent: 100 };
  const contents = win.webContents;
  const current = contents.getZoomLevel();
  const delta = direction === 'out' ? -0.5 : direction === 'in' ? 0.5 : -current;
  const level = Math.min(4, Math.max(-3, Math.round((current + delta) * 2) / 2));
  contents.setZoomLevel(level);
  return { ok: true, level, percent: Math.round(Math.pow(1.2, level) * 100) };
});

/* ------------------------------------------------------------------ */
/* lifecycle                                                          */
/* ------------------------------------------------------------------ */

app.setName('BTR-Ollama');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await loadStore();
    if (!isMac) Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });

  app.on('before-quit', () => {
    clearTimeout(idleTimer);
    // Flush synchronously so the newest edits survive an immediate quit.
    try {
      if (storeFile) fsSync.writeFileSync(storeFile, JSON.stringify(store), 'utf8');
    } catch (err) {
      console.error('[BTR] final save failed', err);
    }
  });
}
