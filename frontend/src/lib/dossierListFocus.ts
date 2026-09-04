import { dossierListCardId, normalizeDossierId } from '@/lib/dossierAccess';

export type DossierListScope = 'admin' | 'client' | 'partenaire';

const STORAGE_KEY = 'pawlegal:dossier-list-focus';
const FOCUS_TTL_MS = 30 * 60 * 1000;

type FocusPayload = {
  scope: DossierListScope;
  dossierId: string;
  at: number;
};

function readPayload(): FocusPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FocusPayload;
    if (!parsed?.scope || !parsed?.dossierId || !parsed?.at) return null;
    if (Date.now() - parsed.at > FOCUS_TTL_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      scope: parsed.scope,
      dossierId: normalizeDossierId(parsed.dossierId),
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

/** Mémorise le dossier à recentrer (plié) au retour sur la liste. */
export function rememberDossierListFocus(scope: DossierListScope, dossierId: string): void {
  if (typeof window === 'undefined') return;
  const id = normalizeDossierId(dossierId);
  if (!id) return;
  try {
    const payload: FocusPayload = { scope, dossierId: id, at: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

/** Lit le focus sans le consommer. */
export function peekDossierListFocus(scope: DossierListScope): string | null {
  const payload = readPayload();
  if (!payload || payload.scope !== scope || !payload.dossierId) return null;
  return payload.dossierId;
}

/** Efface le focus mémorisé. */
export function clearDossierListFocus(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Lit et consomme le focus pour un espace donné. */
export function consumeDossierListFocus(scope: DossierListScope): string | null {
  const id = peekDossierListFocus(scope);
  if (!id) return null;
  clearDossierListFocus();
  return id;
}

/** Lien « retour liste » avec focus sur la carte pliée. */
export function dossierListFocusHref(scope: DossierListScope, dossierId: string): string {
  const id = normalizeDossierId(dossierId);
  const base = `/${scope}/dossiers`;
  return id ? `${base}?focus=${encodeURIComponent(id)}` : base;
}

/**
 * Scroll vers la carte dossier (pliée) + léger highlight.
 * Retourne true si l’élément a été trouvé.
 */
export function scrollToDossierListCard(
  scope: DossierListScope,
  dossierId: string,
  options?: { behavior?: ScrollBehavior; highlightMs?: number }
): boolean {
  if (typeof document === 'undefined') return false;
  const id = normalizeDossierId(dossierId);
  if (!id) return false;
  const el = document.getElementById(dossierListCardId(scope, id));
  if (!el) return false;

  el.scrollIntoView({
    behavior: options?.behavior ?? 'smooth',
    block: 'start',
  });

  const highlightMs = options?.highlightMs ?? 1800;
  el.classList.add('ring-2', 'ring-primary/45', 'ring-offset-2');
  window.setTimeout(() => {
    el.classList.remove('ring-2', 'ring-primary/45', 'ring-offset-2');
  }, highlightMs);

  return true;
}

/**
 * Résout l’id à recentrer : query ?focus= prioritaire, sinon sessionStorage (peek).
 * Ne consomme pas le storage - appeler clearDossierListFocus après un scroll réussi.
 */
export function resolveDossierListFocusId(
  scope: DossierListScope,
  searchParams: { get: (key: string) => string | null } | null | undefined
): { dossierId: string; fromQuery: boolean } | null {
  const fromQuery = normalizeDossierId(searchParams?.get('focus') || '');
  if (fromQuery) {
    return { dossierId: fromQuery, fromQuery: true };
  }
  const fromStorage = peekDossierListFocus(scope);
  if (fromStorage) {
    return { dossierId: fromStorage, fromQuery: false };
  }
  return null;
}
