// Notifications push vers l'appli Byhnex installee sur le telephone (Web Push).
// Le secret BYHNEX_PUSH est cree par la page Signaux sur le telephone : abonnement
// du navigateur + paire de cles VAPID generee sur l'appareil. Rien d'autre n'est stocke.
// Les messages sont chiffres de bout en bout entre le robot et le telephone.

export function parsePushCode(code) {
  const raw = code.trim();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64url').toString('utf8');
  const c = JSON.parse(json);
  if (!c?.s?.endpoint || !c?.s?.keys?.p256dh || !c?.s?.keys?.auth || !c.pub || !c.priv) throw new Error('code BYHNEX_PUSH incomplet');
  return c;
}

export async function sendPush(code, payload) {
  const {default: webpush} = await import('web-push');
  const c = parsePushCode(code);
  webpush.setVapidDetails('https://osvalt16.github.io/byhnex/', c.pub, c.priv);
  try {
    const r = await webpush.sendNotification(c.s, JSON.stringify(payload), {TTL: 6 * 3600, urgency: 'high'});
    console.log('push envoye:', payload.title, 'HTTP', r.statusCode);
    return true;
  } catch (e) {
    const gone = e.statusCode === 404 || e.statusCode === 410;
    console.error('ECHEC push:', payload.title, e.statusCode || e.message, gone ? '(abonnement expire : reactive les notifications dans l’appli puis remplace le secret BYHNEX_PUSH)' : '');
    return false;
  }
}
