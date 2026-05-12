/**
 * Libellés pour les sources « base interne » Paw AI (fichiers XML du corpus).
 */

export type LexiaKnowledgeMetadata = {
  juridiction?: string;
  decisionNumber?: string;
  dateIso?: string;
  contentType?: string;
  ext?: string;
  source?: string;
};

/** Ex. CAA/DCA_21NC01540_20220428.xml */
export function parseDecisionRefFromKnowledgePath(file: string): {
  jurisdiction?: string;
  chamberPrefix?: string;
  decisionRef?: string;
  dateLabel?: string;
} {
  const norm = file.replace(/\\/g, '/').trim();
  if (!norm) return {};
  const segments = norm.split('/').filter(Boolean);
  const firstRaw = segments[0] || '';
  const first = firstRaw.toUpperCase().replace(/-/g, '');
  let jurisdiction: string | undefined;
  if (first === 'CAA') jurisdiction = 'CAA';
  else if (first === 'CE') jurisdiction = 'CE';
  else if (first === 'TA') jurisdiction = 'TA';
  else if (first === 'TC') jurisdiction = 'TC';
  else if (first.includes('CASS') || first === 'CASSATION') jurisdiction = 'Cassation';

  const base = segments[segments.length - 1] || norm;
  const m = base.match(/^([A-Za-z]{2,8})_(\d{2}[A-Z0-9]+)_(\d{8})\.xml$/i);
  if (!m) {
    return { jurisdiction };
  }
  const y = m[3].slice(0, 4);
  const mo = m[3].slice(4, 6);
  const d = m[3].slice(6, 8);
  return {
    jurisdiction,
    chamberPrefix: m[1].toUpperCase(),
    decisionRef: m[2].toUpperCase(),
    dateLabel: `${d}/${mo}/${y}`,
  };
}

function isoToFr(iso: string): string | null {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, mo, d] = t.split('-');
  return `${d}/${mo}/${y}`;
}

/**
 * Titre lisible : juridiction, n° de décision, date — priorité aux métadonnées index, sinon nom de fichier.
 */
export function formatKnowledgeSourceTitle(
  file: string,
  metadata?: LexiaKnowledgeMetadata | Record<string, unknown> | null
): string {
  const md = (metadata || {}) as LexiaKnowledgeMetadata;
  const mdJ = typeof md.juridiction === 'string' ? md.juridiction.trim() : '';
  const mdN = typeof md.decisionNumber === 'string' ? md.decisionNumber.trim() : '';
  const mdD = typeof md.dateIso === 'string' ? md.dateIso.trim() : '';

  const fromFile = parseDecisionRefFromKnowledgePath(file);

  const jur = mdJ || fromFile.jurisdiction || '';
  const num = (mdN || fromFile.decisionRef || '').replace(/\s+/g, ' ').trim();
  let dateStr = isoToFr(mdD) || fromFile.dateLabel || '';

  const parts: string[] = [];
  if (jur) parts.push(jur);
  if (num) parts.push(`n° ${num}`);
  if (dateStr) parts.push(dateStr);

  if (parts.length >= 2) {
    return parts.join(' · ');
  }
  if (num) {
    return jur ? `${jur} · n° ${num}` : `n° ${num}`;
  }
  if (jur && dateStr) {
    return `${jur} · ${dateStr}`;
  }
  if (jur) {
    return jur;
  }

  const norm = file.replace(/\\/g, '/');
  const base = norm.split('/').pop() || norm;
  const human = base
    .replace(/\.xml$/i, '')
    .replace(/_/g, ' ')
    .trim();
  return human || base;
}
