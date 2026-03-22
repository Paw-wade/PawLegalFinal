'use client';

import React, { useEffect, useRef } from 'react';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Si true : pas d’édition (lecture seule). */
  readOnly?: boolean;
};

export function RichTextEditor({ value, onChange, placeholder, className = '', readOnly = false }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const handleInput = () => {
    if (readOnly || !ref.current) return;
    onChange(ref.current.innerHTML);
  };

  const exec = (command: string, value?: string) => {
    if (readOnly) return;
    ref.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  };

  const preventFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className={`border border-gray-200 rounded-lg bg-white ${readOnly ? 'opacity-95' : ''} ${className}`}>
      <div
        className={`flex flex-wrap items-center gap-1 border-b border-gray-200 px-2 py-1 bg-gray-50 ${readOnly ? 'pointer-events-none opacity-50' : ''}`}
        aria-hidden={readOnly}
      >
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={preventFocus}
          onClick={() => exec('bold')}
          disabled={readOnly}
        >
          Gras
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={preventFocus}
          onClick={() => exec('italic')}
          disabled={readOnly}
        >
          Italique
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={preventFocus}
          onClick={() => exec('underline')}
          disabled={readOnly}
        >
          Souligné
        </button>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={preventFocus}
          onClick={() => exec('insertUnorderedList')}
          disabled={readOnly}
        >
          Liste
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded"
          onMouseDown={preventFocus}
          onClick={() => exec('insertOrderedList')}
          disabled={readOnly}
        >
          Liste numérotée
        </button>
      </div>
      <div
        ref={ref}
        className={`min-h-[160px] max-h-[420px] overflow-auto px-3 py-2 text-sm focus:outline-none prose prose-sm max-w-none ${readOnly ? 'bg-gray-50 text-gray-800' : ''}`}
        contentEditable={!readOnly}
        onInput={handleInput}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        aria-readonly={readOnly}
      />
    </div>
  );
}

