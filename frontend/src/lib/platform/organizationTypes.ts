/** Types d'organisation (alignés sur CabinetSignupRequest / Organization maître). */
export {
  ORGANIZATION_TYPE_OPTIONS,
  type OrganizationType,
} from '@/lib/organizationSignup';

import { ORGANIZATION_TYPE_OPTIONS, type OrganizationType } from '@/lib/organizationSignup';

const LABEL_BY_VALUE = Object.fromEntries(
  ORGANIZATION_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<OrganizationType, string>;

export function getOrganizationTypeLabel(
  type?: string | null,
  typeOther?: string | null
): string {
  if (!type) return '—';
  if (type === 'other' && typeOther?.trim()) return typeOther.trim();
  return LABEL_BY_VALUE[type as OrganizationType] || type;
}
