import { useMemo, useState } from 'react';
import type { AgentSession, ConnectionState, Conversation } from '../types';
import { cn, dayBucket, formatRelative } from '../lib/format';
import { projectBasename } from '../lib/agent';
import {
  CloseIcon,
  CodeIcon,
  FolderIcon,
  Logo,
  MessageIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  SunIcon,
  TrashIcon,
} from './icons';

interface Props {
  mode: 'chat' | 'code';
  conversations: Conversation[];
  activeId: string | null;
  streamingId: string | null;
  agentSessions: AgentSession[];
  activeAgentId: string | null;
  agentBusyId: string | null;
  connection: ConnectionState;
  platform: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onModeChange: (mode: 'chat' | 'code') => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (conversation: Conversation) => void;
  onNewAgent: () => void;
  onSelectAgent: (id: string) => void;
  onDeleteAgent: (session: AgentSession) => void;
  onOpenSettings: () => void;
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Earlier this week', 'This month', 'Older'];

export function Sidebar({
  mode,
  conversations,
  activeId,
  streamingId,
  agentSessions,
  activeAgentId,
  agentBusyId,
  connection,
  platform,
  theme,
  onToggleTheme,
  onModeChange,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onNewAgent,
  onSelectAgent,
  onDeleteAgent,
  onOpenSettings,
}: Props) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = conversations.filter((conversation) => conversation.title.toLowerCase().includes(q));
    const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
    const buckets = new Map<string, Conversation[]>();
    for (const conversation of sorted) {
      const label = dayBucket(conversation.updatedAt);
      const bucket = buckets.get(label);
      if (bucket) bucket.push(conversation);
      else buckets.set(label, [conversation]);
    }
    return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
      label,
      items: buckets.get(label) ?? [],
    }));
  }, [conversations, query]);

  const codeSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...agentSessions]
      .filter((session) => `${session.title} ${session.projectPath}`.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [agentSessions, query]);

  const switchMode = (next: 'chat' | 'code') => {
    setQuery('');
    onModeChange(next);
  };

  const commitRename = (id: string, value: string) => {
    const title = value.trim();
    if (title) onRename(id, title);
    setRenamingId(null);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={36} />
        <div className="brand-text">
          <span className="brand-name">BTR-Ollama</span>
          <span className="brand-sub">Local chat for Ollama</span>
        </div>
      </div>

      <div className="mode-switch" role="tablist" aria-label="Workspace mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'chat'}
          className={cn('mode-btn', mode === 'chat' && 'is-active')}
          onClick={() => switchMode('chat')}
        >
          <MessageIcon size={14} />
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'code'}
          className={cn('mode-btn', mode === 'code' && 'is-active')}
          onClick={() => switchMode('code')}
        >
          <CodeIcon size={14} />
          Code
        </button>
      </div>

      {mode === 'chat' ? (
        <button
          type="button"
          className="new-chat-btn"
          onClick={() => {
            setQuery('');
            onNew();
          }}
        >
          <PlusIcon size={16} />
          <span>New chat</span>
          <kbd>{platform === 'darwin' ? '⌘' : 'Ctrl'} N</kbd>
        </button>
      ) : (
        <button
          type="button"
          className="new-chat-btn"
          onClick={() => {
            setQuery('');
            onNewAgent();
          }}
        >
          <FolderIcon size={16} />
          <span>New coding task</span>
        </button>
      )}

      <div className="search-field">
        <SearchIcon size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === 'chat' ? 'Search conversations' : 'Search coding sessions'}
          aria-label={mode === 'chat' ? 'Search chats' : 'Search coding sessions'}
        />
        {query && (
          <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      <nav className="chat-list" aria-label={mode === 'chat' ? 'Conversations' : 'Coding sessions'}>
        {mode === 'chat' ? (
          <>
            {groups.length === 0 && (
              <div className="chat-list-empty">
                {query ? 'No chats match that search.' : 'No conversations yet.'}
              </div>
            )}
            {groups.map((group) => (
              <div className="chat-group" key={group.label}>
                <div className="chat-group-label">{group.label}</div>
                {group.items.map((conversation) => {
                  const isActive = conversation.id === activeId;
                  const isStreaming = conversation.id === streamingId;
                  return (
                    <div
                      key={conversation.id}
                      className={cn('chat-item', isActive && 'is-active', isStreaming && 'is-streaming')}
                    >
                      {renamingId === conversation.id ? (
                        <input
                          className="chat-rename"
                          defaultValue={conversation.title}
                          autoFocus
                          onBlur={(event) => commitRename(conversation.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitRename(conversation.id, event.currentTarget.value);
                            if (event.key === 'Escape') setRenamingId(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="chat-item-main"
                          onClick={() => onSelect(conversation.id)}
                          onDoubleClick={() => setRenamingId(conversation.id)}
                        >
                          <span className="chat-title">{conversation.title}</span>
                          <span className="chat-meta">
                            {conversation.messages.length}{' '}
                            {conversation.messages.length === 1 ? 'message' : 'messages'} ·{' '}
                            {formatRelative(conversation.updatedAt)}
                          </span>
                        </button>
                      )}
                      <div className="chat-item-actions">
                        <button
                          type="button"
                          className="mini-btn"
                          title="Rename chat"
                          onClick={() => setRenamingId(conversation.id)}
                        >
                          <PencilIcon size={13} />
                        </button>
                        <button
                          type="button"
                          className="mini-btn danger"
                          title="Delete chat"
                          onClick={() => onDelete(conversation)}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                      {isStreaming && <span className="chat-live-dot" aria-label="Generating" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        ) : (
          <>
            {codeSessions.length === 0 && (
              <div className="chat-list-empty">
                {query ? 'No coding sessions match that search.' : 'No coding sessions yet.'}
              </div>
            )}
            {codeSessions.length > 0 && (
              <div className="chat-group">
                <div className="chat-group-label">Project sessions</div>
                {codeSessions.map((session) => {
                  const isActive = session.id === activeAgentId;
                  const isBusy = session.id === agentBusyId;
                  return (
                    <div
                      key={session.id}
                      className={cn('chat-item', isActive && 'is-active', isBusy && 'is-streaming')}
                    >
                      <button
                        type="button"
                        className="chat-item-main"
                        onClick={() => {
                          setQuery('');
                          onSelectAgent(session.id);
                        }}
                      >
                        <span className="chat-title">{session.title}</span>
                        <span className="chat-meta">
                          {projectBasename(session.projectPath)} · {formatRelative(session.updatedAt)}
                        </span>
                      </button>
                      <div className="chat-item-actions">
                        <button
                          type="button"
                          className="mini-btn danger"
                          title="Delete coding session"
                          onClick={() => onDeleteAgent(session)}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                      {isBusy && <span className="chat-live-dot" aria-label="Agent working" />}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={cn('conn-chip', connection.state)}
          onClick={onOpenSettings}
          title={connection.error || 'Connection settings'}
        >
          <span className="conn-dot" />
          <span className="conn-text">
            {connection.state === 'online'
              ? `Ollama${connection.version ? ` ${connection.version}` : ''}`
              : connection.state === 'connecting'
                ? 'Connecting…'
                : 'Offline'}
          </span>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>
        <button type="button" className="icon-btn" onClick={onOpenSettings} title="Settings (Ctrl+,)">
          <SlidersIcon size={16} />
        </button>
      </div>
    </aside>
  );
}
