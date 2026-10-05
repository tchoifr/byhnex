// End-to-end tests of the PHP API. Needs a running server: API_URL=http://127.0.0.1:8080/api node --test prod/api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL || 'http://127.0.0.1:8080/api', ORIGIN = new URL(API).origin;
const email = `test-${Date.now()}@example.com`, password = 'motdepasse-solide-1';

function client() {
  let cookie = '';
  return async (method, path, body, {headers = {}, csrf = true} = {}) => {
    const h = {...headers};
    if (cookie) h.Cookie = cookie;
    if (method !== 'GET') { h['Content-Type'] = 'application/json'; if (csrf) h['X-Requested-With'] = 'byhnex'; }
    const r = await fetch(API + path, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)});
    const set = r.headers.get('set-cookie');
    if (set) { const m = set.match(/byhnex_session=([^;]*)/); if (m) cookie = m[1] ? 'byhnex_session=' + m[1] : ''; }
    return {status: r.status, body: await r.json().catch(() => null), setCookie: set};
  };
}

test('health reports the database', async () => {
  const r = await client()('GET', '/health');
  assert.equal(r.status, 200); assert.equal(r.body.ok, true);
});

test('unknown routes answer 404 in JSON', async () => {
  const r = await client()('GET', '/nope');
  assert.equal(r.status, 404); assert.equal(r.body.error.code, 'not_found');
});

test('full account lifecycle', async () => {
  const a = client(), b = client();
  // Writes need the custom header and an allowed origin.
  assert.equal((await a('POST', '/auth/register', {email, password}, {csrf: false})).status, 403);
  assert.equal((await a('POST', '/auth/register', {email, password}, {headers: {Origin: 'https://evil.example'}})).status, 403);
  assert.equal((await a('POST', '/auth/register', {email, password: 'court'})).status, 422);
  assert.equal((await a('POST', '/auth/register', {email: 'pas-un-email', password})).status, 422);

  const reg = await a('POST', '/auth/register', {email: email.toUpperCase(), password}, {headers: {Origin: ORIGIN}});
  assert.equal(reg.status, 201); assert.equal(reg.body.user.email, email);
  assert.match(reg.setCookie, /HttpOnly/i); assert.match(reg.setCookie, /SameSite=Lax/i); assert.match(reg.setCookie, /path=\/api/i);
  assert.equal((await a('POST', '/auth/register', {email, password})).status, 409);
  assert.equal((await a('GET', '/auth/me')).body.user.email, email);
  assert.equal((await b('GET', '/auth/me')).status, 401);

  // Data: empty, then versioned writes with conflict detection.
  assert.deepEqual((await a('GET', '/data')).body, {version: 0, updatedAt: null, data: null});
  const put1 = await a('PUT', '/data', {baseVersion: 0, data: {'cryptonite-v1': '{"x":1}', 'byhnex-devise': 'EUR'}});
  assert.equal(put1.status, 200); assert.equal(put1.body.version, 1);
  const stale = await a('PUT', '/data', {baseVersion: 0, data: {'byhnex-devise': 'USD'}});
  assert.equal(stale.status, 409); assert.equal(stale.body.server.version, 1); assert.equal(stale.body.server.data['byhnex-devise'], 'EUR');
  assert.equal((await a('PUT', '/data', {baseVersion: 1, data: {'secret-key': 'x'}})).status, 422);
  assert.equal((await a('PUT', '/data', {baseVersion: 1, data: {'byhnex-devise': 12}})).status, 422);
  assert.equal((await a('PUT', '/data', {baseVersion: 1, data: {}})).body.version, 2);
  assert.deepEqual((await a('GET', '/data')).body.data, {});

  // Login from a second device sees the same data; wrong passwords are refused.
  assert.equal((await b('POST', '/auth/login', {email, password: 'mauvais-mot-de-passe'})).status, 401);
  assert.equal((await b('POST', '/auth/login', {email, password})).status, 200);
  assert.equal((await b('GET', '/data')).body.version, 2);

  // Password change signs out the other sessions.
  assert.equal((await a('POST', '/auth/password', {currentPassword: 'faux', newPassword: 'nouveau-mot-de-passe'})).status, 401);
  assert.equal((await a('POST', '/auth/password', {currentPassword: password, newPassword: 'nouveau-mot-de-passe'})).status, 200);
  assert.equal((await b('GET', '/auth/me')).status, 401);
  assert.equal((await a('GET', '/auth/me')).status, 200);

  // Logout, then account deletion removes everything.
  assert.equal((await a('POST', '/auth/logout')).status, 200);
  assert.equal((await a('GET', '/auth/me')).status, 401);
  assert.equal((await a('POST', '/auth/login', {email, password: 'nouveau-mot-de-passe'})).status, 200);
  assert.equal((await a('DELETE', '/account', {password: 'faux'})).status, 401);
  assert.equal((await a('DELETE', '/account', {password: 'nouveau-mot-de-passe'})).status, 200);
  assert.equal((await a('POST', '/auth/login', {email, password: 'nouveau-mot-de-passe'})).status, 401);
});

test('repeated failed logins are throttled', async () => {
  const c = client(), target = `throttle-${Date.now()}@example.com`;
  let last;
  for (let i = 0; i < 9; i++) last = await c('POST', '/auth/login', {email: target, password: 'mauvais-mot-de-passe'});
  assert.equal(last.status, 429); assert.equal(last.body.error.code, 'too_many_attempts');
});
