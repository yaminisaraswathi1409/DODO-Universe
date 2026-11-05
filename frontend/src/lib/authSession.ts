/**
 * Token store for the real signed access/refresh tokens issued by the backend.
 *
 * Dependency-free on purpose (no imports) so it can be used from api.ts, the
 * central fetch layer (authFetch.ts) and unit-style checks without cycles.
 *
 * NEVER store or send a user id / supabase_uid as a token: the backend rejects them.
 */

export const ACCESS_TOKEN_KEY = 'uop_access_token';
export const REFRESH_TOKEN_KEY = 'uop_refresh_token';
export const TOKEN_EXPIRES_AT_KEY = 'uop_token_expires_at';

// Keys used by older builds that stored a raw user id / ad-hoc token. Always purged.
const LEGACY_TOKEN_KEYS = ['uop_token'];

export interface TokenPair {
  access_token: string;
  refresh_token?: string;
  /** Access token lifetime in seconds (as returned by the backend). */
  expires_in?: number;
}

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export function getAccessToken(): string {
  if (!hasStorage()) return '';
  return (localStorage.getItem(ACCESS_TOKEN_KEY) || '').trim();
}

export function getRefreshToken(): string {
  if (!hasStorage()) return '';
  return (localStorage.getItem(REFRESH_TOKEN_KEY) || '').trim();
}

/** Epoch milliseconds when the access token expires, or 0 if unknown. */
export function getTokenExpiresAt(): number {
  if (!hasStorage()) return 0;
  const n = Number(localStorage.getItem(TOKEN_EXPIRES_AT_KEY) || 0);
  return Number.isFinite(n) ? n : 0;
}

/** True when a real token pair is present (access OR refresh token). */
export function hasStoredTokens(): boolean {
  return getAccessToken() !== '' || getRefreshToken() !== '';
}

export function storeTokens(pair: TokenPair): void {
  if (!hasStorage()) return;
  for (const k of LEGACY_TOKEN_KEYS) localStorage.removeItem(k);
  if (pair.access_token) localStorage.setItem(ACCESS_TOKEN_KEY, pair.access_token);
  if (pair.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, pair.refresh_token);
  if (typeof pair.expires_in === 'number' && pair.expires_in > 0) {
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + pair.expires_in * 1000));
  }
}

export function clearTokens(): void {
  if (!hasStorage()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  for (const k of LEGACY_TOKEN_KEYS) localStorage.removeItem(k);
}

const USER_PROFILE_KEYS = ['uop_user', 'uop_user_profile', 'uop_user_id', 'uop_phone'];

/** Remove tokens AND every cached user-profile key. */
export function clearAllSessionStorage(): void {
  if (!hasStorage()) return;
  clearTokens();
  for (const k of USER_PROFILE_KEYS) localStorage.removeItem(k);
}

/** Remove only cached profile keys (used to drop legacy token-less sessions). Keeps uop_phone. */
export function purgeLegacyProfile(): void {
  if (!hasStorage()) return;
  for (const k of ['uop_user', 'uop_user_profile', 'uop_user_id']) localStorage.removeItem(k);
}
