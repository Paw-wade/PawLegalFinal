import { normalizeMontantTarificationFixe } from '@/lib/montantTarification';
import type { TarifFormuleId } from '@/data/tarificationConfig';

export const TARIFICATION_INSTALLMENT_MIN_AMOUNT = 100;

const FORMULE_REFERENCE_AMOUNT: Record<TarifFormuleId, number> = {
  premium: 150,
  standard: 250,
};

export function getTarificationReferenceAmount(dossier: any): number {
  const fixedAmount = normalizeMontantTarificationFixe(dossier?.montantTarificationFixe);
  if (fixedAmount > 0) return fixedAmount;

  const prestations = Array.isArray(dossier?.tarificationPrestations) ? dossier.tarificationPrestations : [];
  const prestationsDue = prestations
    .filter((p: any) => String(p?.statut || 'a_regler') === 'a_regler')
    .reduce((acc: number, p: any) => acc + normalizeMontantTarificationFixe(p?.montant), 0);
  if (prestationsDue > 0) return prestationsDue;

  const formuleId = dossier?.formuleTarifaire as TarifFormuleId | undefined;
  if (formuleId && FORMULE_REFERENCE_AMOUNT[formuleId]) return FORMULE_REFERENCE_AMOUNT[formuleId];

  return 0;
}

export function isTarificationInstallmentEligible(dossier: any): boolean {
  if (!dossier || dossier?.fraisExoneres) return false;
  return getTarificationReferenceAmount(dossier) > TARIFICATION_INSTALLMENT_MIN_AMOUNT;
}

export function isTarificationInstallmentAuthorized(dossier: any): boolean {
  const echeances = getTarificationEcheances(dossier);
  if (echeances.length >= 2) return true;
  return !!dossier?.tarificationPaiementEnPlusieursFoisAutorise;
}

export type TarificationEcheance = {
  _id?: string;
  label?: string;
  montant: number;
  dateEcheance: string;
  statut?: 'a_regler' | 'reglee';
};

export function getTarificationEcheances(dossier: any): TarificationEcheance[] {
  if (!Array.isArray(dossier?.tarificationEcheances)) return [];
  return dossier.tarificationEcheances
    .map((row: any) => ({
      _id: row?._id ? String(row._id) : undefined,
      label: String(row?.label || '').trim() || undefined,
      montant: normalizeMontantTarificationFixe(row?.montant),
      dateEcheance: row?.dateEcheance ? String(row.dateEcheance) : '',
      statut: String(row?.statut || 'a_regler') === 'reglee' ? 'reglee' : 'a_regler',
    }))
    .filter((row) => row.montant > 0 && row.dateEcheance);
}

export function getTarificationEcheancesTotal(dossier: any): number {
  return getTarificationEcheances(dossier).reduce((sum, row) => sum + row.montant, 0);
}
