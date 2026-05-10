'use client';

import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Components } from 'react-markdown';
import type { Schema } from 'hast-util-sanitize';

const LEXIA_SPAN_CLASSES = new Set(['lexia-verified', 'lexia-hypothesis', 'lexia-caution', 'lexia-emphasis']);

const lexiaSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), 'u', 'mark'])],
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    u: [...(defaultSchema.attributes?.u ?? [])],
    mark: [...(defaultSchema.attributes?.mark ?? []), 'className'],
  },
};

type LexiaMarkdownProps = {
  content: string;
};

function isBlockCode(className: string | undefined, children: ReactNode): boolean {
  if (typeof className === 'string' && /\blanguage-[\w-]+\b/.test(className)) return true;
  const text = String(children).replace(/\n$/, '');
  return text.includes('\n');
}

function filterLexiaClass(className: string | undefined, allowed: Set<string>): string | undefined {
  const ok = String(className || '')
    .split(/\s+/)
    .filter((c) => allowed.has(c));
  return ok.length ? ok.join(' ') : undefined;
}

const mdComponents: Components = {
  h1: ({ children }) => <h2 className="lexia-md-h lexia-md-h1">{children}</h2>,
  h2: ({ children }) => <h2 className="lexia-md-h lexia-md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="lexia-md-h lexia-md-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="lexia-md-h lexia-md-h4">{children}</h4>,
  h5: ({ children }) => <h5 className="lexia-md-h lexia-md-h5">{children}</h5>,
  h6: ({ children }) => <h6 className="lexia-md-h lexia-md-h6">{children}</h6>,
  p: ({ children }) => <p className="lexia-md-p">{children}</p>,
  ul: ({ children }) => <ul className="lexia-md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="lexia-md-ol">{children}</ol>,
  li: ({ children }) => <li className="lexia-md-li">{children}</li>,
  blockquote: ({ children }) => <blockquote className="lexia-md-blockquote">{children}</blockquote>,
  hr: () => <hr className="lexia-md-hr" />,
  a: ({ href, children }) => (
    <a href={href ?? undefined} className="lexia-md-a" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="lexia-md-table-wrap">
      <table className="lexia-md-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="lexia-md-thead">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="lexia-md-tr">{children}</tr>,
  th: ({ children }) => <th className="lexia-md-th">{children}</th>,
  td: ({ children }) => <td className="lexia-md-td">{children}</td>,
  pre: ({ children }) => <pre className="lexia-md-pre">{children}</pre>,
  code: ({ className, children }) => {
    if (isBlockCode(className, children)) {
      return (
        <code className={className ? `lexia-md-code-block ${className}` : 'lexia-md-code-block'}>
          {children}
        </code>
      );
    }
    return <code className="lexia-md-code-inline">{children}</code>;
  },
  span: ({ className, children }) => {
    const cn = filterLexiaClass(className, LEXIA_SPAN_CLASSES);
    return <span className={cn}>{children}</span>;
  },
  u: ({ children }) => <u className="lexia-md-u">{children}</u>,
  mark: ({ className, children }) => {
    const cn = filterLexiaClass(className, new Set(['lexia-emphasis']));
    return <mark className={cn ? `lexia-md-mark ${cn}` : 'lexia-md-mark'}>{children}</mark>;
  },
};

export function LexiaMarkdown({ content }: LexiaMarkdownProps) {
  return (
    <div className="lexia-md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, lexiaSanitizeSchema]]}
        components={mdComponents}
        skipHtml={false}
      >
        {content}
      </Markdown>
    </div>
  );
}
