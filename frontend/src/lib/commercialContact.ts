import api from '@/lib/api';

export const COMMERCIAL_SUBJECT_OPTIONS = [
  { value: 'demo', label: 'Démonstration de la plateforme' },
  { value: 'pricing', label: 'Tarifs & offre commerciale' },
  { value: 'partnership', label: 'Partenariat' },
  { value: 'other', label: 'Autre demande' },
] as const;

export type CommercialSubject = (typeof COMMERCIAL_SUBJECT_OPTIONS)[number]['value'];

export type CommercialContactPayload = {
  name: string;
  email: string;
  phone?: string;
  organization?: string;
  subject: CommercialSubject;
  message: string;
  gdprConsent: 'true';
  website?: string;
};

export function submitCommercialContact(data: CommercialContactPayload) {
  return api.post<{ success: boolean; message?: string }>('/public/commercial-contact', data);
}
