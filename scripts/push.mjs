// Notifications push vers l'appli Byhnex installee sur les telephones (Web Push).
// Les telephones s'inscrivent en un clic aupres du serveur Cloudflare (worker/byhnex-push.js),
// qui garde les abonnements et les cles VAPID. Le robot les recupere, envoie, puis retire
// les abonnements expires. Les messages sont chiffres de bout en bout robot -> telephone.
import { createHash } from 'node:crypto';

export const robotAuth = token => 'Bearer ' + createHash('sha256').update('byhnex-robot:' + token).digest('base64url');

export async function pushAll(serverUrl, token, payload, {webpush, fetchImpl = fetch} = {}) {
  webpush = webpush || (await import('web-push')).default;
  const base = serverUrl.replace(/\/+$/, '');
  const r = await fetchImpl(base + '/robot/bundle', { headers: { Authorization: robotAuth(token) } });
  if (!r.ok) throw new Error('serveur push HTTP ' + r.status);
  const { vapid, subs } = await r.json();
  webpush.setVapidDetails('https://osvalt16.github.io/byhnex/', vapid.pub, vapid.priv);
  const gone = [];
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint);
      else console.error('ECHEC push:', e.statusCode || e.message);
    }
  }
  if (gone.length) {
    await fetchImpl(base + '/robot/prune', { method: 'POST', headers: { Authorization: robotAuth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoints: gone }) });
  }
  console.log(`push « ${payload.title} » : ${sent}/${subs.length} telephones, ${gone.length} abonnement(s) expire(s) retire(s)`);
  return { sent, total: subs.length, gone: gone.length };
}
