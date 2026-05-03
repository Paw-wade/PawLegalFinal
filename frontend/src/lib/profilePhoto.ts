import { getNextPublicApiOrigin } from './publicApiUrl';

/** URL absolue pour afficher une photo stockée sur le backend (/uploads/...) */
export function getProfilePhotoAbsoluteUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const trimmed = relativePath.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const origin = getNextPublicApiOrigin();
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${origin}${path}`;
}

/** URL affichable pour l’avatar d’un utilisateur (champ `profilePhoto` API + URLs legacy éventuelles). */
export function getUserAvatarDisplayUrl(
  user: { profilePhoto?: string; avatarUrl?: string; photoUrl?: string } | null | undefined
): string | null {
  if (!user) return null;
  const fromProfile = getProfilePhotoAbsoluteUrl(user.profilePhoto);
  if (fromProfile) return fromProfile;
  const legacy = user.avatarUrl || user.photoUrl;
  if (!legacy || typeof legacy !== 'string') return null;
  const s = legacy.trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return getProfilePhotoAbsoluteUrl(s);
}

/**
 * Lit les champs profil dans le DOM (autofill navigateur + pickers date natifs DateInput).
 * Les ids des inputs date natifs doivent être `{id}-native-date` (voir DateInput).
 */
export function mergeProfileFormValuesFromDom<T extends Record<string, string>>(
  formData: T,
  options: { includeSejour?: boolean; includeAccountFields?: boolean } = {}
): T {
  const out = { ...formData } as Record<string, string>;
  const read = (id: string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    const v = el?.value;
    return typeof v === 'string' ? v : '';
  };
  const readNativeDate = (baseId: string) => {
    const el = document.getElementById(`${baseId}-native-date`) as HTMLInputElement | null;
    return el?.value || '';
  };

  const textFields = [
    'numeroEtranger',
    'lieuNaissance',
    'nationalite',
    'adressePostale',
    'ville',
    'codePostal',
    'pays',
  ];
  if (options.includeSejour !== false) {
    textFields.push('typeTitre');
  }

  if (options.includeAccountFields) {
    textFields.push('firstName', 'lastName', 'email', 'phone', 'numeroTitre');
  }

  for (const f of textFields) {
    const v = read(f);
    if (v !== '') out[f] = v;
  }

  const sexeEl = document.getElementById('sexe') as HTMLSelectElement | null;
  if (sexeEl && sexeEl.value !== '') {
    out.sexe = sexeEl.value;
  }

  for (const d of ['dateNaissance', 'dateDelivrance', 'dateExpiration']) {
    const native = readNativeDate(d);
    if (native) out[d] = native;
  }

  return out as T;
}
