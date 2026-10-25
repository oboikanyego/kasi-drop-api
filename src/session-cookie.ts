/**
 * Browser sessions travel in an httpOnly cookie, so page scripts (and any XSS) can never read the
 * token. The UI reaches the API through a same-origin /api proxy, so the cookie is first-party.
 */
export const sessionCookieName = 'kasi_session';
export const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
/**
 * Cookie-authenticated requests that change data must send this header. Browsers only let a page
 * add custom headers to cross-site requests after a CORS preflight the API refuses, so together
 * with SameSite=Lax this stops cross-site request forgery.
 */
export const csrfHeaderName = 'x-kasidrop-csrf';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const sessionCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, secure, sameSite: 'lax', path: '/api' }) as const;

/** Read one cookie from a Cookie header without pulling in a parser dependency. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

type RequestLike = { method: string; headers: Record<string, string | string[] | undefined> };
/**
 * The session token for a request: a Bearer header (API clients, and UIs released before the
 * cookie) wins, otherwise the session cookie.
 */
export function sessionToken(req: RequestLike): { token: string; viaCookie: boolean } | null {
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' ? auth.replace(/^Bearer /i, '').trim() : '';
  if (bearer) return { token: bearer, viaCookie: false };
  const cookie = req.headers.cookie;
  const value = readCookie(typeof cookie === 'string' ? cookie : undefined, sessionCookieName);
  return value ? { token: value, viaCookie: true } : null;
}
/** Whether a cookie-authenticated request that changes data is missing the CSRF header. */
export const missingCsrfHeader = (req: RequestLike, viaCookie: boolean) =>
  viaCookie && !safeMethods.has(req.method.toUpperCase()) && !req.headers[csrfHeaderName];
