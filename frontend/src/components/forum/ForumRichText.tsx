'use client';

import { Fragment, type RefObject, useRef } from 'react';

const UNDERLINE_PATTERN = /\[u\]([\s\S]*?)\[\/u\]/gi;

export function stripForumFormatting(value: string): string {
  return String(value || '').replace(UNDERLINE_PATTERN, '$1');
}

export function ForumFormattedText({
  value,
  className = '',
}: {
  value: string;
  className?: string;
}) {
  const source = String(value || '');
  const chunks: Array<{ text: string; underlined: boolean }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(UNDERLINE_PATTERN.source, 'gi');

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) {
      chunks.push({ text: source.slice(cursor, match.index), underlined: false });
    }
    chunks.push({ text: match[1], underlined: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) {
    chunks.push({ text: source.slice(cursor), underlined: false });
  }

  return (
    <div
      className={`whitespace-pre-wrap break-words text-justify [text-align-last:left] ${className}`}
    >
      {chunks.map((chunk, index) => (
        <Fragment key={`${index}-${chunk.text.length}`}>
          {chunk.underlined ? <u>{chunk.text}</u> : chunk.text}
        </Fragment>
      ))}
    </div>
  );
}

interface ForumTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClass?: string;
  textareaRef?: RefObject<HTMLTextAreaElement>;
}

export function ForumTextEditor({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  minHeightClass = 'min-h-[110px]',
  textareaRef,
}: ForumTextEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef || internalRef;

  const underlineSelection = () => {
    const textarea = ref.current;
    if (!textarea || disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || 'texte souligné';
    const replacement = `[u]${selected}[/u]`;
    onChange(`${value.slice(0, start)}${replacement}${value.slice(end)}`);

    window.setTimeout(() => {
      textarea.focus();
      const selectionStart = start + 3;
      textarea.setSelectionRange(selectionStart, selectionStart + selected.length);
    }, 0);
  };

  return (
    <div className="overflow-hidden rounded-md border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-orange-500">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-2 py-1">
        <button
          type="button"
          onClick={underlineSelection}
          disabled={disabled}
          className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-gray-300 bg-white px-2 text-sm font-semibold underline text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          title="Souligner le texte sélectionné"
          aria-label="Souligner le texte sélectionné"
        >
          S
        </button>
        <span className="text-[11px] text-gray-500">
          Sélectionnez du texte puis cliquez sur S pour le souligner.
        </span>
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full resize-y border-0 px-3 py-2 text-sm leading-relaxed outline-none ${minHeightClass}`}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
