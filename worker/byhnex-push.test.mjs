import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker, {validSubscription} from './byhnex-push.js';

function kv() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({prefix = '', limit = 1000} = {}) { return {keys: [...m.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({name})), list_complete: true}; },
  };
}
const env = () => ({SUBS: kv(), DISPATCH_TOKEN: 'ghp_test'});
const call = (e, path, init = {}) => worker.fetch(new Request('https://w.example' + path, {headers: {Origin: 'https://osvalt16.github.io', 'Content-Type': 'application/json', ...(init.headers || {})}, ...init}), e);
const sub = {endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: {p256dh: 'BPkey', auth: 'authkey'}};
const robotAuth = 'Bearer ' + createHash('sha256').update('byhnex-robot:ghp_test').digest('base64url');

test('one tap: a phone subscription is stored, and CORS allows the site', async () => {
  const e = env();
  const r = await call(e, '/subscribe', {method: 'POST', body: JSON.stringify({subscription: sub})});
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://osvalt16.github.io');
  assert.equal([...e.SUBS.m.keys()].filter(k => k.startsWith('sub:')).length, 1);
  await call(e, '/subscribe', {method: 'POST', body: JSON.stringify({subscription: sub})});
  assert.equal([...e.SUBS.m.keys()].filter(k => k.startsWith('sub:')).length, 1, 'same phone stored once');
});

test('the VAPID public key is stable and the private key stays private', async () => {
  const e = env();
  const a = await (await call(e, '/vapid')).json(), b = await (await call(e, '/vapid')).json();
  assert.equal(a.publicKey, b.publicKey);
  assert.equal(Object.keys(a).join(), 'publicKey');
});

test('only the robot can read subscriptions and keys', async () => {
  const e = env();
  await call(e, '/subscribe', {method: 'POST', body: JSON.stringify({subscription: sub})});
  assert.equal((await call(e, '/robot/bundle')).status, 403);
  assert.equal((await call(e, '/robot/bundle', {headers: {Authorization: 'Bearer nope'}})).status, 403);
  const bundle = await (await call(e, '/robot/bundle', {headers: {Authorization: robotAuth}})).json();
  assert.equal(bundle.subs.length, 1);
  assert.ok(bundle.vapid.pub && bundle.vapid.priv);
  await call(e, '/robot/prune', {method: 'POST', headers: {Authorization: robotAuth}, body: JSON.stringify({endpoints: [sub.endpoint]})});
  assert.equal((await (await call(e, '/robot/bundle', {headers: {Authorization: robotAuth}})).json()).subs.length, 0);
});

test('unsubscribe removes the phone; junk is refused', async () => {
  const e = env();
  await call(e, '/subscribe', {method: 'POST', body: JSON.stringify({subscription: sub})});
  await call(e, '/unsubscribe', {method: 'POST', body: JSON.stringify({endpoint: sub.endpoint})});
  assert.equal([...e.SUBS.m.keys()].filter(k => k.startsWith('sub:')).length, 0);
  assert.equal(validSubscription({...sub, endpoint: 'https://evil.example/x'}), false);
  assert.equal((await call(e, '/subscribe', {method: 'POST', body: 'not json'})).status, 400);
  assert.equal((await call(e, '/subscribe', {method: 'POST', body: JSON.stringify({subscription: sub, pad: 'x'.repeat(5000)})})).status, 400);
});

test('the cron starts the GitHub robot', async () => {
  const calls = [], orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({url, init}); return new Response(null, {status: 204}); };
  try {
    const waits = [];
    await worker.scheduled({}, env(), {waitUntil: p => waits.push(p)});
    await Promise.all(waits);
  } finally { globalThis.fetch = orig; }
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /osvalt16\/byhnex\/actions\/workflows\/robot-signaux\.yml\/dispatches$/);
  assert.equal(JSON.parse(calls[0].init.body).ref, 'main');
});
