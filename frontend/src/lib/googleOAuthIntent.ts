/** Cookie court pour distinguer inscription vs connexion avec le seul provider `google`. */
export const GOOGLE_OAUTH_INTENT_COOKIE = 'google_oauth_intent';
const MAX_AGE_SEC = 600;

export function setGoogleSignupIntent(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${GOOGLE_OAUTH_INTENT_COOKIE}=signup; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`;
}

export function clearGoogleSignupIntentClient(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${GOOGLE_OAUTH_INTENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
