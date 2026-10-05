import test from 'node:test';
import assert from 'node:assert/strict';
import {SYNC_KEYS, fingerprint, snapshot, fingerprints, hasData, merge, apply} from './sync-core.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m};
};

test('fingerprint is stable and distinguishes values', () => {
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
  assert.equal(fingerprint(null), null);
});

test('snapshot reads only the synced keys', () => {
  const s = snapshot(memory({'cryptonite-v1': '{"a":1}', 'byhnex-fx-cache': 'x'}));
  assert.deepEqual(Object.keys(s), SYNC_KEYS);
  assert.equal(s['cryptonite-v1'], '{"a":1}');
  assert.equal(s['byhnex-devise'], null);
});

test('merge takes the side that changed since the last sync', () => {
  const base = fingerprints({'cryptonite-v1': 'v1', 'byhnex-devise': 'EUR'});
  const r = merge({base, local: {'cryptonite-v1': 'v2', 'byhnex-devise': 'EUR'}, server: {'cryptonite-v1': 'v1', 'byhnex-devise': 'USD'}});
  assert.equal(r.result['cryptonite-v1'], 'v2');
  assert.equal(r.result['byhnex-devise'], 'USD');
  assert.equal(r.pushNeeded, true); assert.equal(r.localChanged, true); assert.deepEqual(r.conflicts, []);
});

test('merge keeps the device value when both sides changed the same key', () => {
  const base = fingerprints({'byhnex-favorites': '[]'});
  const r = merge({base, local: {'byhnex-favorites': '["a"]'}, server: {'byhnex-favorites': '["b"]'}});
  assert.equal(r.result['byhnex-favorites'], '["a"]');
  assert.deepEqual(r.conflicts, ['byhnex-favorites']);
});

test('merge on a new device prefers the account and reports overlaps', () => {
  const r = merge({local: {'cryptonite-v1': 'device', 'byhnex-devise': 'EUR'}, server: {'cryptonite-v1': 'account'}});
  assert.equal(r.result['cryptonite-v1'], 'account');
  assert.equal(r.result['byhnex-devise'], 'EUR');
  assert.deepEqual(r.conflicts, ['cryptonite-v1']);
  assert.equal(r.pushNeeded, true);
});

test('merge reports nothing to do when both sides match', () => {
  const data = {'cryptonite-v1': 'same'};
  const r = merge({base: fingerprints(data), local: data, server: data});
  assert.equal(r.pushNeeded, false); assert.equal(r.localChanged, false);
});

test('a removed key on the device is removed on the account', () => {
  const base = fingerprints({'byhnex-reserve-eur': '100'});
  const r = merge({base, local: {}, server: {'byhnex-reserve-eur': '100'}});
  assert.equal(r.result['byhnex-reserve-eur'], null); assert.equal(r.pushNeeded, true);
});

test('apply writes and removes keys, hasData detects content', () => {
  const s = memory({'byhnex-devise': 'EUR', 'byhnex-fx-cache': 'keep'});
  apply(s, {'cryptonite-v1': 'x'});
  assert.equal(s.getItem('cryptonite-v1'), 'x'); assert.equal(s.getItem('byhnex-devise'), null); assert.equal(s.getItem('byhnex-fx-cache'), 'keep');
  assert.equal(hasData({}), false); assert.equal(hasData({'byhnex-devise': 'EUR'}), true);
});
