import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePushCode} from './push.mjs';

const sample = {s: {endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: {p256dh: 'BP', auth: 'au'}}, pub: 'BPUB', priv: 'PRIV'};

test('the phone code is read as base64url or plain JSON', () => {
  assert.deepEqual(parsePushCode(Buffer.from(JSON.stringify(sample)).toString('base64url')), sample);
  assert.deepEqual(parsePushCode('  ' + JSON.stringify(sample) + '\n'), sample);
});

test('an incomplete code is refused', () => {
  assert.throws(() => parsePushCode(JSON.stringify({...sample, priv: ''})), /incomplet/);
});
