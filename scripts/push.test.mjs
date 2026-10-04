import test from 'node:test';
import assert from 'node:assert/strict';
import {pushAll, robotAuth} from './push.mjs';

test('the robot sends to every phone and prunes expired subscriptions', async () => {
  const subs = [{endpoint: 'https://fcm.googleapis.com/a', keys: {p256dh: 'p', auth: 'a'}}, {endpoint: 'https://fcm.googleapis.com/gone', keys: {p256dh: 'p', auth: 'a'}}];
  const calls = [], sentTo = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({url, init});
    assert.equal(init.headers.Authorization, robotAuth('tok'));
    return new Response(JSON.stringify(url.endsWith('/robot/bundle') ? {vapid: {pub: 'P', priv: 'Q'}, subs} : {ok: true}));
  };
  const webpush = {
    setVapidDetails(sub, pub, priv) { assert.equal(pub, 'P'); assert.equal(priv, 'Q'); },
    async sendNotification(s) { sentTo.push(s.endpoint); if (s.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), {statusCode: 410}); },
  };
  const r = await pushAll('https://push.example/', 'tok', {title: 'T', body: 'B'}, {webpush, fetchImpl});
  assert.deepEqual(r, {sent: 1, total: 2, gone: 1});
  assert.equal(sentTo.length, 2);
  assert.equal(calls[1].url, 'https://push.example/robot/prune');
  assert.deepEqual(JSON.parse(calls[1].init.body).endpoints, ['https://fcm.googleapis.com/gone']);
});

test('a robot without access gets a clear error', async () => {
  const fetchImpl = async () => new Response('{}', {status: 403});
  await assert.rejects(pushAll('https://push.example', 'bad', {title: 'T'}, {webpush: {}, fetchImpl}), /HTTP 403/);
});
