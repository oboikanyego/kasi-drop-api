import assert from 'node:assert/strict';
import test from 'node:test';
import {
  csrfHeaderName,
  missingCsrfHeader,
  readCookie,
  sessionCookieOptions,
  sessionToken,
} from '../src/session-cookie.js';

test('reads one cookie from a Cookie header', () => {
  assert.equal(readCookie('a=1; kasi_session=abc.def; b=2', 'kasi_session'), 'abc.def');
  assert.equal(readCookie('kasi_session_old=x', 'kasi_session'), undefined);
  assert.equal(readCookie(undefined, 'kasi_session'), undefined);
  assert.equal(readCookie('kasi_session=%E0%A4%A', 'kasi_session'), undefined);
});
test('a Bearer header wins over the session cookie', () => {
  const headers = { authorization: 'Bearer from-header', cookie: 'kasi_session=from-cookie' };
  assert.deepEqual(sessionToken({ method: 'GET', headers }), {
    token: 'from-header',
    viaCookie: false,
  });
  assert.deepEqual(
    sessionToken({ method: 'GET', headers: { cookie: 'kasi_session=from-cookie' } }),
    {
      token: 'from-cookie',
      viaCookie: true,
    },
  );
  assert.equal(sessionToken({ method: 'GET', headers: {} }), null);
  assert.equal(sessionToken({ method: 'GET', headers: { authorization: 'Bearer ' } }), null);
});
test('only cookie-authenticated requests that change data need the CSRF header', () => {
  const bare = { headers: {} };
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
    assert.equal(missingCsrfHeader({ ...bare, method }, true), true, method);
  for (const method of ['GET', 'HEAD', 'OPTIONS'])
    assert.equal(missingCsrfHeader({ ...bare, method }, true), false, method);
  assert.equal(
    missingCsrfHeader({ method: 'POST', headers: { [csrfHeaderName]: '1' } }, true),
    false,
  );
  // Bearer tokens cannot be attached by another site, so they need no CSRF header.
  assert.equal(missingCsrfHeader({ ...bare, method: 'POST' }, false), false);
});
test('the session cookie is httpOnly, SameSite=Lax and limited to the API', () => {
  assert.deepEqual(sessionCookieOptions(true), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api',
  });
  assert.equal(sessionCookieOptions(false).secure, false);
});
