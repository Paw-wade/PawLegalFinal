import api from '@/lib/api';

export const ORGANIZATION_TYPE_OPTIONS = [
  { value: 'law_firm', label: "Cabinet d'avocats" },
  { value: 'consulting', label: 'Cabinet de conseil / accompagnement' },
  { value: 'association', label: 'Association / ONG' },
  { value: 'institutional', label: 'Structure institutionnelle' },
  { value: 'other', label: 'Autre' },
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPE_OPTIONS)[number]['value'];

export const TEAM_SIZE_OPTIONS = [
  { value: '1-5', label: '1 à 5 personnes' },
  { value: '6-20', label: '6 à 20 personnes' },
  { value: '21+', label: 'Plus de 20 personnes' },
] as const;

export type OrganizationSignupPayload = {
  organizationType: OrganizationType;
  organizationTypeOther?: string;
  structureName: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  city?: string;
  barreau?: string;
  siret?: string;
  teamSize?: string;
  practiceArea?: string;
  desiredSlug?: string;
  desiredDomains?: string;
  message?: string;
  gdprConsent: 'true';
  website?: string;
};

export function submitOrganizationSignup(data: OrganizationSignupPayload) {
  return api.post<{ success: boolean; message?: string; requestId?: string }>(
    '/public/organization-signup',
    data
  );
}
