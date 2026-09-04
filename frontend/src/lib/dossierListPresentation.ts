import { getStatutLabelWithEtapes } from '@/lib/dossierUtils';

export function getDossierTransmittedPartners(dossier: any) {
  if (!Array.isArray(dossier?.transmittedTo) || dossier.transmittedTo.length === 0) return [];
  return dossier.transmittedTo.map((t: any) => {
    const partenaire = t.partenaire || t.user;
    const typeOrganisme = partenaire?.partenaireInfo?.typeOrganisme;
    const typeLabel =
      typeOrganisme === 'consulat'
        ? 'Consulat'
        : typeOrganisme === 'association'
          ? 'Association'
          : 'Avocat';
    const fullName = [partenaire?.firstName, partenaire?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || partenaire?.email || '-';
    const nomOrganisme = partenaire?.partenaireInfo?.nomOrganisme || partenaire?.organisationName;
    return { typeLabel, fullName, nomOrganisme };
  });
}

export function getDossierTransmissionSummary(partners: Array<{ fullName: string }>) {
  if (!partners.length) return 'Aucune';
  const first = partners[0]?.fullName || '-';
  return partners.length > 1 ? `${first} +${partners.length - 1}` : first;
}

export function getDossierDisplayTitle(dossier: any, strictPrivacyMode = false) {
  const raw = typeof dossier?.titre === 'string' && dossier.titre ? dossier.titre : 'Sans titre';
  return strictPrivacyMode ? 'Dossier masqué' : raw;
}

export function getDossierClientDisplayName(dossier: any, strictPrivacyMode = false) {
  const raw =
    dossier.user && typeof dossier.user === 'object'
      ? [dossier.user.firstName, dossier.user.lastName].filter(Boolean).join(' ') || dossier.user.email || '-'
      : [dossier.clientPrenom, dossier.clientNom].filter(Boolean).join(' ') || dossier.clientEmail || 'Non renseigné';
  return strictPrivacyMode ? 'Titulaire masqué' : raw;
}

export function getDossierCustomStatutLabel(dossier: any) {
  return getStatutLabelWithEtapes(dossier?.statut, dossier?.etapesSupplementaires);
}
