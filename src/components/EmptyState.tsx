import { WifiOffIcon, ArrowUpRightIcon } from './icons';

interface Props {
  model: string;
  online: boolean;
  error?: string;
  onUsePrompt: (text: string) => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}

const STARTERS = [
  {
    title: 'Explore a codebase',
    blurb: 'Paste a folder tree and the key files. Ask where to start reading.',
    text: 'Help me understand a codebase. I will paste the folder structure and key files; explain how the pieces fit together and where to start reading.',
  },
  {
    title: 'Debug an error',
    blurb: 'Bring the stack trace. Work out the cause before changing code.',
    text: 'I am hitting an error. Ask me for the stack trace and relevant code, then walk me through the most likely root cause.',
  },
  {
    title: 'Write the docs',
    blurb: 'Turn a finished feature into an overview, an example and the gotchas.',
    text: 'Draft developer documentation for the following feature, with a short overview, usage example and gotchas.\n\nFeature:',
  },
  {
    title: 'Compare options',
    blurb: 'Describe the constraints. Get a recommendation with trade-offs attached.',
    text: 'Compare two technical approaches for my use case. I will describe the constraints; give a recommendation with clear trade-offs.',
  },
];

export function EmptyState({ model, online, error, onUsePrompt, onOpenSettings, onRetry }: Props) {
  return (
    <div className="empty-state">
      <header className="empty-head">
        <p className="empty-overline">
          <span className={online ? 'empty-live' : 'empty-live is-offline'} />
          {online ? (
            <>
              <span className="mono">{model || 'No model selected'}</span>
              <span>is ready</span>
            </>
          ) : (
            <span>Ollama is not answering</span>
          )}
        </p>
        <h1>Where do we start?</h1>
        <p className="empty-lede">
          {online
            ? 'Ask anything below, or borrow a thread from the list.'
            : 'Start the daemon, then try the connection again.'}
        </p>
      </header>

      {!online && (
        <div className="empty-offline">
          <WifiOffIcon size={16} />
          <div>
            <strong>No local connection</strong>
            <span>{error || 'Run “ollama serve”, then retry.'}</span>
          </div>
          <div className="empty-offline-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
              Settings
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="starter-list" aria-label="Prompt starters">
        {STARTERS.map((starter, index) => (
          <button
            type="button"
            className="starter-row"
            key={starter.title}
            onClick={() => onUsePrompt(starter.text)}
          >
            <span className="starter-num">{String(index + 1).padStart(2, '0')}</span>
            <span className="starter-body">
              <span className="starter-title">{starter.title}</span>
              <span className="starter-text">{starter.blurb}</span>
            </span>
            <ArrowUpRightIcon size={16} className="starter-arrow" />
          </button>
        ))}
      </div>

      <p className="empty-foot">Enter sends. Shift+Enter adds a line.</p>
    </div>
  );
}
