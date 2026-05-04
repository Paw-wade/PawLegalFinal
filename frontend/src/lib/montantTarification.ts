/**
 * Montant fixe cabinet tel que renvoyé par l’API / Mongo (number, chaîne, Decimal128, etc.).
 */
export function normalizeMontantTarificationFixe(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'object' && value !== null && typeof (value as { toString?: () => string }).toString === 'function') {
    const s = String((value as { toString: () => string }).toString())
      .replace(/\s/g, '')
      .replace(',', '.');
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const s = String(value)
    .replace(/\s/g, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Interprète une saisie libre (input) : espaces / insécables, €, formats 1 500,50 ou 1.500,50.
 * Chaîne vide après nettoyage → null. Sinon nombre ≥ 0, ou null si illisible.
 */
export function parseMontantSaisieFlexible(raw: string): number | null {
  let t = String(raw ?? '')
    .trim()
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s/g, '')
    .replace(/€|\$/g, '')
    .replace(/eur$/i, '');
  if (t === '') return null;

  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma !== -1 && lastComma > lastDot) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (lastDot !== -1 && lastDot > lastComma) {
    t = t.replace(/,/g, '');
  } else if (lastComma !== -1) {
    t = t.replace(',', '.');
  }

  // Un seul « . » sans virgule restante : 1.500 (milliers FR) vs 10.50 (décimal)
  if (!t.includes(',') && t.includes('.')) {
    const parts = t.split('.');
    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d{3}$/.test(parts[1])) {
      t = parts[0] + parts[1];
    }
  }

  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
