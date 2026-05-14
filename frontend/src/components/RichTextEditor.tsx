'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Si true : pas d’édition (lecture seule). */
  readOnly?: boolean;
};

const LINE_HEIGHTS = [
  { label: 'Simple', value: 1.15 },
  { label: '1,35', value: 1.35 },
  { label: '1,5', value: 1.5 },
  { label: '1,65', value: 1.65 },
  { label: 'Double', value: 2 },
  { label: '2,5', value: 2.5 },
] as const;

function execCmd(command: string, commandValue?: string) {
  try {
    document.execCommand(command, false, commandValue);
  } catch {
    /* navigateurs restreints */
  }
}

/** Place le caret dans l’éditeur si la sélection est ailleurs (sinon insert*List ne fait rien). */
function ensureSelectionInsideEditor(el: HTMLDivElement) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const anchor = sel.anchorNode;
  const inside =
    anchor != null &&
    (el === anchor ||
      (anchor.nodeType === Node.ELEMENT_NODE && el.contains(anchor as globalThis.Node)) ||
      (anchor.nodeType === Node.TEXT_NODE &&
        anchor.parentElement != null &&
        el.contains(anchor.parentElement)));
  if (inside) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function RichTextEditor({ value, onChange, placeholder, className = '', readOnly = false }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  /** HTML dernier émis au parent — évite de réécrire innerHTML à chaque frappe (gel + curseur). */
  const lastEmittedHtml = useRef<string | null>(null);
  const [lineHeight, setLineHeight] = useState<number>(1.65);
  const [textColor, setTextColor] = useState('#111827');
  const [hiliteColor, setHiliteColor] = useState('#fef08a');

  const pushChange = useCallback(() => {
    if (readOnly || !ref.current) return;
    const html = ref.current.innerHTML;
    lastEmittedHtml.current = html;
    onChange(html);
  }, [onChange, readOnly]);

  useEffect(() => {
    if (!ref.current) return;
    const incoming = value || '';
    if (lastEmittedHtml.current !== null && incoming === lastEmittedHtml.current) {
      return;
    }
    if (ref.current.innerHTML !== incoming) {
      ref.current.innerHTML = incoming;
    }
    lastEmittedHtml.current = incoming;
  }, [value]);

  useEffect(() => {
    if (readOnly) lastEmittedHtml.current = null;
  }, [readOnly]);

  const handleInput = () => {
    pushChange();
  };

  const preventToolbarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const run = (command: string, commandValue?: string) => {
    if (readOnly || !ref.current) return;
    ensureSelectionInsideEditor(ref.current);
    execCmd(command, commandValue);
    pushChange();
  };

  const applyTextColor = (hex: string) => {
    setTextColor(hex);
    run('foreColor', hex);
  };

  const applyHilite = (hex: string) => {
    setHiliteColor(hex);
    const useHilite =
      typeof document.queryCommandSupported === 'function' && document.queryCommandSupported('hiliteColor');
    run(useHilite ? 'hiliteColor' : 'backColor', hex);
  };

  const toolBtn =
    'rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white ${readOnly ? 'opacity-95' : ''} ${className}`}>
      <div
        className={`shrink-0 space-y-1.5 border-b border-gray-200 bg-gray-50 px-2 py-2 ${readOnly ? 'pointer-events-none opacity-50' : ''}`}
        aria-hidden={readOnly}
      >
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('bold')}>
            Gras
          </button>
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('italic')}>
            Italique
          </button>
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('underline')}>
            Souligné
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-gray-300" aria-hidden />
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('insertUnorderedList')}>
            Liste
          </button>
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('insertOrderedList')}>
            Numérotée
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-gray-300" aria-hidden />
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('justifyLeft')} title="Aligner à gauche">
            Gauche
          </button>
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('justifyCenter')} title="Centrer">
            Centre
          </button>
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('justifyRight')} title="Aligner à droite">
            Droite
          </button>
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('justifyFull')} title="Justifier">
            Justifier
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-gray-300" aria-hidden />
          <button type="button" className={toolBtn} onMouseDown={preventToolbarMouseDown} onClick={() => run('removeFormat')}>
            Effacer mise en forme
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
          <label className="inline-flex items-center gap-1.5 font-medium">
            Interligne
            <select
              className="h-8 max-w-[9rem] rounded border border-gray-300 bg-white px-1.5 text-xs"
              value={lineHeight}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setLineHeight(Number(e.target.value))}
              disabled={readOnly}
            >
              {LINE_HEIGHTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 font-medium">
            Couleur du texte
            <input
              type="color"
              value={textColor}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => applyTextColor(e.target.value)}
              className="h-8 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0"
              title="Couleur du texte"
              disabled={readOnly}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 font-medium">
            Surlignage
            <input
              type="color"
              value={hiliteColor}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => applyHilite(e.target.value)}
              className="h-8 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0"
              title="Couleur de surlignage"
              disabled={readOnly}
            />
          </label>
        </div>
      </div>

      {/* Fond « bureau » + page type document */}
      <div className="min-h-0 flex-1 overflow-auto bg-stone-100/90 p-3 sm:p-5 max-h-[min(65dvh,560px)]">
        <div
          ref={ref}
          className={`rich-text-editor-page mx-auto w-full max-w-[48rem] min-h-[18rem] border border-gray-200/80 bg-white px-6 py-8 text-[15px] text-gray-900 shadow-sm sm:px-12 sm:py-12 ${
            readOnly ? 'bg-gray-50 text-gray-800' : ''
          } focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:ring-offset-0 [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2`}
          style={{ lineHeight }}
          contentEditable={!readOnly}
          onInput={handleInput}
          data-placeholder={placeholder}
          suppressContentEditableWarning
          aria-readonly={readOnly}
          spellCheck
        />
      </div>
    </div>
  );
}
