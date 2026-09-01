'use client';

import { useId, useState } from 'react';

interface Option { value: string; label: string }
interface Props {
  label: string;
  value: any;
  onChange: (v: any) => void;
  type?: string; // text, number, montant, percent, date, email, tel, password, textarea, select
  options?: Option[];
  required?: boolean;
  suffix?: string;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  autoComplete?: string;
  inputMode?: any;
  inputRef?: any;
}

/**
 * Champ à label flottant (outlined floating label).
 * - Au repos et vide : le label est affiché comme placeholder à l'intérieur du champ.
 * - Au focus ou si le champ contient une valeur : le label s'anime vers la bordure
 *   supérieure, avec un petit fond blanc derrière le texte (effet de bordure interrompue).
 */
export function FloatingField({ label, value, onChange, type = 'text', options, required, suffix, rows, placeholder, disabled, name, autoComplete, inputMode, inputRef }: Props) {
  const [focused, setFocused] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const id = useId();
  const isTextarea = type === 'textarea';
  const isSelect = type === 'select';
  const isPassword = type === 'password';
  const hasValue = value !== undefined && value !== null && String(value) !== '';
  // Les champs date affichent toujours un gabarit : on garde le label flottant.
  const floated = focused || hasValue || type === 'date';

  const controlBase =
    'peer block w-full rounded-md border bg-white text-sm text-foreground transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ' +
    (focused ? 'border-primary ring-1 ring-primary ' : 'border-gray-300 ');

  const labelBase =
    'pointer-events-none absolute left-2.5 z-10 bg-white px-1 transition-all duration-150 ';
  const labelFloated = `-top-2 text-[11px] ${focused ? 'text-primary' : 'text-gray-600'}`;
  const labelResting = isTextarea
    ? 'top-3 text-sm text-gray-400'
    : 'top-1/2 -translate-y-1/2 text-sm text-gray-400';

  const htmlType = isPassword ? (showPwd ? 'text' : 'password') : ['date', 'email', 'tel'].includes(type) ? type : 'text';

  return (
    <div className="relative">
      {isTextarea ? (
        <textarea
          id={id} ref={inputRef} name={name} disabled={disabled}
          value={value || ''}
          rows={rows || 3}
          placeholder={focused ? placeholder || '' : ''}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className={`${controlBase} px-3 pt-3 pb-2`}
        />
      ) : isSelect ? (
        <select
          id={id} ref={inputRef} name={name} disabled={disabled}
          value={value || ''}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className={`${controlBase} h-11 px-3`}
        >
          <option value=""></option>
          {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          id={id} ref={inputRef} name={name} disabled={disabled} autoComplete={autoComplete} inputMode={inputMode}
          type={htmlType}
          value={value || ''}
          placeholder={focused ? placeholder || '' : ''}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className={`${controlBase} h-11 px-3 ${suffix || isPassword ? 'pr-11' : ''}`}
        />
      )}

      <label htmlFor={id} className={`${labelBase} ${floated ? labelFloated : labelResting}`}>
        {label}{required ? ' *' : ''}
      </label>

      {isPassword && (
        <button type="button" tabIndex={-1} onClick={() => setShowPwd((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-muted-foreground hover:text-foreground">
          {showPwd ? '🙈' : '👁️'}
        </button>
      )}

      {suffix && !isTextarea && !isSelect && !isPassword && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}

export default FloatingField;
