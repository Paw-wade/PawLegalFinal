/** Agenda admin : échéances dossier, jalons datés, tâches - fenêtre glissante + retards. */

export const DEFAULT_AGENDA_HORIZON_DAYS = 15;

export type AdminDossierAgendaBucket = 'overdue' | 'upcoming';

export interface AdminDossierAgendaItem {
  bucket: AdminDossierAgendaBucket;
  /** Début du jour (local) de l’échéance, pour tri et affichage. */
  eventDayMs: number;
  kind: 'dossier_echeance' | 'etape' | 'tache' | 'doc_preparation';
  kindLabel: string;
  actionLabel: string;
  dossierId: string;
  dossierRef: string;
  dossierTitle: string;
}

function parseToStartOfLocalDay(value: unknown): number | null {
  if (value == null || value === '') return null;
  const d = new Date(value as string | Date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isDossierExcludedFromAgenda(d: any): boolean {
  if (!d) return true;
  if (d.estCloture) return true;
  if (d.estArchive) return true;
  const s = String(d.statut || '');
  if (
    s === 'annule' ||
    s === 'refuse' ||
    s === 'cloture' ||
    s === 'decision_favorable' ||
    s === 'decision_defavorable' ||
    s === 'gain_cause' ||
    s === 'rejet'
  ) {
    return true;
  }
  return false;
}

function taskIsOpen(task: any): boolean {
  if (!task) return false;
  if (task.archived) return false;
  if (task.effectue) return false;
  if (task.statut === 'termine' || task.statut === 'annule') return false;
  return true;
}

/**
 * @param horizonDays Nombre de jours calendaires à partir d’aujourd’hui (inclus).
 */
export function collectAdminDossierAgendaItems(
  dossiers: any[],
  dossierTasksByDossierId: Record<string, any[]>,
  dossierDraftsByDossierId: Record<string, any[]> = {},
  horizonDays: number = DEFAULT_AGENDA_HORIZON_DAYS
): AdminDossierAgendaItem[] {
  const safeHorizon = Math.max(1, Math.min(60, Math.floor(horizonDays) || DEFAULT_AGENDA_HORIZON_DAYS));
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lastDate = new Date(now);
  lastDate.setDate(lastDate.getDate() + (safeHorizon - 1));
  const windowLastDay0 = new Date(
    lastDate.getFullYear(),
    lastDate.getMonth(),
    lastDate.getDate()
  ).getTime();

  const items: AdminDossierAgendaItem[] = [];

  const classify = (dayMs: number): AdminDossierAgendaBucket | null => {
    if (dayMs < today0) return 'overdue';
    if (dayMs <= windowLastDay0) return 'upcoming';
    return null;
  };

  for (const d of dossiers || []) {
    if (isDossierExcludedFromAgenda(d)) continue;
    const dossierId = String(d._id || d.id || '');
    if (!dossierId) continue;
    const dossierRef = String(d.numero || '').trim() || dossierId.slice(-8);
    const dossierTitle = String(d.titre || d.numero || 'Dossier').trim() || 'Dossier';

    const de = parseToStartOfLocalDay(d.dateEcheance);
    if (de != null) {
      const bucket = classify(de);
      if (bucket) {
        items.push({
          bucket,
          eventDayMs: de,
          kind: 'dossier_echeance',
          kindLabel: 'Échéance dossier',
          actionLabel: 'Échéance globale du dossier',
          dossierId,
          dossierRef,
          dossierTitle,
        });
      }
    }

    const steps = Array.isArray(d.etapesSupplementaires) ? d.etapesSupplementaires : [];
    steps.forEach((e: any, idx: number) => {
      const ed = parseToStartOfLocalDay(e?.date);
      if (ed == null) return;
      const bucket = classify(ed);
      if (!bucket) return;
      const label = String(e?.label || e?.id || `Étape ${idx + 1}`).trim() || `Étape ${idx + 1}`;
      items.push({
        bucket,
        eventDayMs: ed,
        kind: 'etape',
        kindLabel: 'Jalon',
        actionLabel: label,
        dossierId,
        dossierRef,
        dossierTitle,
      });
    });

    const tasks = dossierTasksByDossierId[dossierId] || [];
    for (const task of tasks) {
      if (!taskIsOpen(task)) continue;
      const td = parseToStartOfLocalDay(task.dateEcheance);
      if (td == null) continue;
      const bucket = classify(td);
      if (!bucket) continue;
      const titre = String(task.titre || '').trim() || 'Tâche sans titre';
      items.push({
        bucket,
        eventDayMs: td,
        kind: 'tache',
        kindLabel: 'Tâche',
        actionLabel: titre,
        dossierId,
        dossierRef,
        dossierTitle,
      });
    }

    const prepDocs = dossierDraftsByDossierId[dossierId] || [];
    for (const doc of prepDocs) {
      if (doc?.completedAt) continue;
      const dd = parseToStartOfLocalDay(doc?.dueDate);
      if (dd == null) continue;
      const bucket = classify(dd);
      if (!bucket) continue;
      const title = String(doc?.title || '').trim() || 'Document en préparation';
      items.push({
        bucket,
        eventDayMs: dd,
        kind: 'doc_preparation',
        kindLabel: 'Doc préparation',
        actionLabel: title,
        dossierId,
        dossierRef,
        dossierTitle,
      });
    }
  }

  items.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === 'overdue' ? -1 : 1;
    if (a.eventDayMs !== b.eventDayMs) return a.eventDayMs - b.eventDayMs;
    const ka = `${a.dossierId}-${a.kind}-${a.actionLabel}`;
    const kb = `${b.dossierId}-${b.kind}-${b.actionLabel}`;
    return ka.localeCompare(kb);
  });

  return items;
}

/** jsPDF (Helvetica) : éviter les caractères hors Latin-1 pour un rendu fiable. */
export function stripForPdf(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\xff]/g, '?');
}

export async function downloadAdminDossierAgendaPdf(
  items: AdminDossierAgendaItem[],
  horizonDays: number = DEFAULT_AGENDA_HORIZON_DAYS
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const maxW = 182;
  let y = 16;
  const pageH = doc.internal.pageSize.getHeight();
  const lineGap = 4.5;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageH - 14) {
      doc.addPage();
      y = 16;
    }
  };

  doc.setFontSize(15);
  newPageIfNeeded(12);
  doc.text(stripForPdf('Ada Papers - Agenda dossiers (echeances & jalons)'), margin, y);
  y += 8;

  doc.setFontSize(9);
  const gen = new Date().toLocaleString('fr-FR');
  newPageIfNeeded(8);
  doc.text(
    stripForPdf(
      `Genere le ${gen} - Fenetre : ${horizonDays} jours a partir d'aujourd'hui (inclus) + retards ouverts`
    ),
    margin,
    y
  );
  y += 10;

  const writeBlock = (title: string, rows: AdminDossierAgendaItem[]) => {
    doc.setFontSize(11);
    newPageIfNeeded(10);
    doc.text(stripForPdf(title), margin, y);
    y += 7;
    doc.setFontSize(9);
    if (rows.length === 0) {
      newPageIfNeeded(lineGap);
      doc.text(stripForPdf('(aucun)'), margin, y);
      y += lineGap + 3;
      return;
    }
    for (const it of rows) {
      const dateStr = new Date(it.eventDayMs).toLocaleDateString('fr-FR');
      const line = `${dateStr}  [${it.kindLabel}]  ${it.dossierRef} - ${it.dossierTitle} - ${it.actionLabel}`;
      const wrapped = doc.splitTextToSize(stripForPdf(line), maxW);
      newPageIfNeeded(wrapped.length * lineGap + 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * lineGap + 1;
    }
    y += 4;
  };

  const overdue = items.filter((i) => i.bucket === 'overdue');
  const upcoming = items.filter((i) => i.bucket === 'upcoming');
  writeBlock('Retards (actions a traiter)', overdue);
  writeBlock(`A venir dans les ${horizonDays} prochains jours`, upcoming);

  const safeName = `agenda-dossiers-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(safeName);
}
