// Byhnex push server (Cloudflare Worker, free plan).
// - Phones subscribe with one tap: the page posts its push subscription here, stored in KV.
// - VAPID keys are created here on first use and never leave the server except to the robot.
// - Every 5 minutes the cron starts the GitHub robot, which computes the signals and sends the pushes
//   (signal maths stays out of the Worker: the free plan only allows ~10 ms of CPU per run).
// Bindings: SUBS (KV). Secrets: DISPATCH_TOKEN (GitHub token, Actions read/write on the repo).

const REPO = 'osvalt16/byhnex';
const ORIGINS = ['https://osvalt16.github.io', 'http://localhost:5173'];
const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com|push\.services\.mozilla\.com)\//;
const MAX_SUBS = 5000;

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async text => b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (request, body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...cors(request)}});

export async function vapidKeys(env) {
  const stored = await env.SUBS.get('vapid', 'json');
  if (stored && stored.pub && stored.priv) return stored;
  const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign']);
  const keys = {pub: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), priv: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d};
  await env.SUBS.put('vapid', JSON.stringify(keys));
  return keys;
}

export function validSubscription(s) {
  return !!s && typeof s.endpoint === 'string' && s.endpoint.length < 1000 && PUSH_HOSTS.test(s.endpoint)
    && !!s.keys && typeof s.keys.p256dh === 'string' && s.keys.p256dh.length < 200 && typeof s.keys.auth === 'string' && s.keys.auth.length < 100;
}

async function robotAllowed(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return !!env.DISPATCH_TOKEN && auth === 'Bearer ' + await sha256('byhnex-robot:' + env.DISPATCH_TOKEN);
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 4000) throw new Error('trop long');
  return JSON.parse(text);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(request)});
    try {
      if (request.method === 'GET' && url.pathname === '/vapid') return json(request, {publicKey: (await vapidKeys(env)).pub});

      if (request.method === 'POST' && url.pathname === '/subscribe') {
        const {subscription: s} = await readBody(request);
        if (!validSubscription(s)) return json(request, {error: 'abonnement invalide'}, 400);
        const key = 'sub:' + await sha256(s.endpoint);
        if (!(await env.SUBS.get(key))) {
          const count = (await env.SUBS.list({prefix: 'sub:', limit: MAX_SUBS})).keys.length;
          if (count >= MAX_SUBS) return json(request, {error: 'serveur plein'}, 503);
        }
        await env.SUBS.put(key, JSON.stringify({endpoint: s.endpoint, keys: {p256dh: s.keys.p256dh, auth: s.keys.auth}, at: Date.now()}));
        return json(request, {ok: true});
      }

      if (request.method === 'POST' && url.pathname === '/unsubscribe') {
        const {endpoint} = await readBody(request);
        if (typeof endpoint === 'string') await env.SUBS.delete('sub:' + await sha256(endpoint));
        return json(request, {ok: true});
      }

      if (url.pathname.startsWith('/robot/')) {
        if (!(await robotAllowed(request, env))) return json(request, {error: 'interdit'}, 403);
        if (request.method === 'GET' && url.pathname === '/robot/bundle') {
          const subs = [];
          let cursor;
          do {
            const page = await env.SUBS.list({prefix: 'sub:', cursor});
            for (const k of page.keys) { const v = await env.SUBS.get(k.name, 'json'); if (v) subs.push(v); }
            cursor = page.list_complete ? null : page.cursor;
          } while (cursor);
          return json(request, {vapid: await vapidKeys(env), subs});
        }
        if (request.method === 'POST' && url.pathname === '/robot/prune') {
          const {endpoints = []} = await readBody(request);
          for (const e of endpoints.slice(0, 200)) if (typeof e === 'string') await env.SUBS.delete('sub:' + await sha256(e));
          return json(request, {ok: true, removed: Math.min(endpoints.length, 200)});
        }
      }
      return json(request, {error: 'introuvable'}, 404);
    } catch (e) {
      return json(request, {error: 'requête invalide'}, 400);
    }
  },

  // Starts the GitHub robot on a reliable 5-minute rhythm (GitHub's own scheduler is irregular).
  async scheduled(event, env, ctx) {
    if (!env.DISPATCH_TOKEN) return;
    ctx.waitUntil(fetch(`https://api.github.com/repos/${REPO}/actions/workflows/robot-signaux.yml/dispatches`, {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + env.DISPATCH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'byhnex-push', 'X-GitHub-Api-Version': '2022-11-28'},
      body: JSON.stringify({ref: 'main'}),
    }));
  },
};
