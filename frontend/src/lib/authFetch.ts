/**
 * Central authenticated fetch layer.
 *
 * `installAuthFetch(apiBase)` wraps `window.fetch` ONLY for URLs under the API base URL, so
 * the access token is never sent to any other origin. For those requests it:
 *   - strips any caller-supplied `Authorization` / `X-User-ID` header and sets
 *     `Authorization: Bearer <stored access token>` (if there is one),
 *   - on 401 performs ONE single-flight refresh with the stored refresh token, retries the
 *     original request ONCE, and otherwise clears the session and redirects to /login,
 *   - never loops on 403 (suspended / insufficient permission): it is returned untouched.
 *
 * The auth endpoints themselves (request-otp, signup, verify-otp, refresh) are passed
 * through unchanged.
 */
import {
  clearAllSessionStorage,
  getAccessToken,
  getRefreshToken,
  hasStoredTokens,
  storeTokens,
} from './authSession';

type FetchFn = typeof fetch;

const PASS_THROUGH_PATHS = ['/auth/request-otp', '/auth/signup', '/auth/refresh', '/users/verify-otp'];
const AUTH_PAGES = ['/login', '/signup', '/verify-otp', '/complete-profile', '/verify-face', '/admin/login'];
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/order'];

let installed = false;
let refreshInFlight: Promise<boolean> | null = null;
let redirecting = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  return (input as Request).url;
}

/** Path after the API base (starting with "/"), or null if the URL is not under the API base. */
export function apiPathOf(url: string, apiBase: string): string | null {
  const base = apiBase.replace(/\/+$/, '');
  if (!url.startsWith(base)) return null;
  const rest = url.slice(base.length);
  if (rest !== '' && rest[0] !== '/' && rest[0] !== '?' && rest[0] !== '#') return null;
  return '/' + rest.replace(/^\/+/, '').split(/[?#]/)[0];
}

/** Redirect to /login unless we're on an auth page, or an anonymous visitor on a public page. */
function redirectToLogin(hadSession: boolean): void {
  if (typeof window === 'undefined' || redirecting) return;
  const path = window.location.pathname || '/';
  if (AUTH_PAGES.some((p) => path === p || path.startsWith(p + '/'))) return;
  const onProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
  if (!hadSession && !onProtected) return;
  redirecting = true;
  window.location.assign('/login');
}

/** Refresh the token pair once (shared by all concurrent 401s). Resolves true on success. */
export function refreshTokens(rawFetch: FetchFn, apiBase: string): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);
  refreshInFlight = (async () => {
    try {
      const res = await rawFetch(`${apiBase.replace(/\/+$/, '')}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        // 401 invalid/expired, 403 suspended -> session is dead. Anything else is transient.
        if (res.status === 401 || res.status === 403) clearAllSessionStorage();
        return false;
      }
      const json = await res.json().catch(() => null);
      const d = json?.data;
      if (!d?.access_token) return false;
      storeTokens({ access_token: d.access_token, refresh_token: d.refresh_token, expires_in: d.expires_in });
      if (d.user && typeof window !== 'undefined') {
        const userJson = JSON.stringify(d.user);
        localStorage.setItem('uop_user', userJson);
        localStorage.setItem('uop_user_profile', userJson);
      }
      return true;
    } catch {
      return false; // network error: keep the session, caller gets the original 401
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function installAuthFetch(apiBase: string): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  const rawFetch: FetchFn = window.fetch.bind(window);

  const authFetch: FetchFn = async (input, init) => {
    const url = requestUrl(input);
    const path = apiPathOf(url, apiBase);
    if (path === null || PASS_THROUGH_PATHS.includes(path)) {
      return rawFetch(input, init);
    }

    // Keep a pristine clone of Request inputs so the request can be replayed once.
    const replayable = typeof Request !== 'undefined' && input instanceof Request ? input.clone() : null;

    const send = (token: string): Promise<Response> => {
      const headers = new Headers(init?.headers ?? (replayable ? replayable.headers : undefined));
      headers.delete('X-User-ID');
      headers.delete('Authorization');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (replayable) return rawFetch(new Request(replayable.clone(), { headers }));
      return rawFetch(input, { ...init, headers });
    };

    const hadSession = hasStoredTokens() || !!localStorage.getItem('uop_user');
    const usedToken = getAccessToken();
    const res = await send(usedToken);
    if (res.status !== 401) return res;

    // 401: missing/invalid/expired token. Another tab may already have refreshed.
    const current = getAccessToken();
    if (current && current !== usedToken) {
      const retry = await send(current);
      if (retry.status === 401) {
        clearAllSessionStorage();
        redirectToLogin(hadSession);
      }
      return retry;
    }

    if (!getRefreshToken()) {
      // No real session (e.g. legacy browser with only a cached profile): treat as logged out.
      clearAllSessionStorage();
      redirectToLogin(hadSession);
      return res;
    }

    const refreshed = await refreshTokens(rawFetch, apiBase);
    if (!refreshed) {
      if (!getRefreshToken()) redirectToLogin(hadSession); // refresh rejected -> session cleared
      return res; // transient refresh failure: surface the original 401, keep the session
    }
    const retry = await send(getAccessToken());
    if (retry.status === 401) {
      clearAllSessionStorage();
      redirectToLogin(hadSession);
    }
    return retry;
  };

  window.fetch = authFetch;
}

/** Test hook: reset module state. */
export function __resetAuthFetchForTests(): void {
  installed = false;
  refreshInFlight = null;
  redirecting = false;
}
