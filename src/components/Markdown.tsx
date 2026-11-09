import { memo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { bridge } from '../lib/bridge';
import { CheckIcon, CopyIcon } from './icons';

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  let language = '';
  const first = Array.isArray(children) ? children[0] : children;
  if (first && typeof first === 'object' && 'props' in first) {
    const className = (first as { props?: { className?: string } }).props?.className ?? '';
    const match = /language-([\w+#.-]+)/.exec(className);
    if (match) language = match[1];
  }

  const copy = async () => {
    const text = ref.current?.innerText ?? '';
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{language || 'code'}</span>
        <button type="button" className="code-copy" onClick={copy} aria-label="Copy code">
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return (
    <div className={`md${streaming ? ' is-streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a
              href={href ?? '#'}
              onClick={(event) => {
                event.preventDefault();
                if (href && /^https?:\/\//i.test(href)) bridge.openExternal(href);
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
