// Byhnex account on byhnex.com: sign-in and automatic sync of the site's browser data with /api.
// Added to every page by prod/build-prod.mjs; inactive anywhere else (GitHub Pages copy, local files).
import {SYNC_KEYS, snapshot, fingerprints, hasData, merge, apply} from './sync-core.js?v=__VERSION__';

const ENABLED = /(^|\.)byhnex\.com$/.test(location.hostname) && !document.body.classList.contains('embed');
const META_KEY = 'byhnex-sync-meta', RELOAD_KEY = 'byhnex-sync-reloaded';
let user = null, status = 'idle', statusText = '', syncing = false, again = false, pushTimer = 0, applying = false, retries = 0, lastVisibleSync = 0;

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; } };
const writeMeta = m => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch {} };

async function api(method, path, body) {
  const headers = method === 'GET' ? {} : {'Content-Type': 'application/json', 'X-Requested-With': 'byhnex'};
  const r = await fetch('/api' + path, {method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body)});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = Error(j.error?.message || 'Le serveur ne répond pas (' + r.status + '). Réessayez.');
    Object.assign(e, {status: r.status, code: j.error?.code, server: j.server});
    throw e;
  }
  return j;
}

// ---------- Sync ----------
function setStatus(next, text = '') { status = next; statusText = text; renderButton(); updateDialog(); }

function updateDialog() {
  if (!dialog?.open) return;
  const err = dialog.querySelector('.bx-error'), live = dialog.querySelector('.bx-status span:last-child');
  if (err) err.textContent = status === 'error' ? statusText : '';
  if (live) live.textContent = subtitle();
  dialog.querySelectorAll('.bx-primary, [data-keep]').forEach(b => { b.disabled = status === 'syncing'; });
}

function writeLocal(data) {
  applying = true;
  try { apply(localStorage, data); } finally { applying = false; }
}

async function sync({onLoad = false} = {}) {
  if (!user) return;
  if (syncing) { again = true; return; }
  syncing = true; setStatus('syncing');
  try {
    const meta = readMeta(), server = await api('GET', '/data');
    const m = merge({base: meta.base || {}, local: snapshot(localStorage), server: server.data || {}});
    let version = server.version;
    if (m.pushNeeded) version = (await api('PUT', '/data', {baseVersion: version, data: m.result})).version;
    writeMeta({email: user.email, version, base: fingerprints(m.result), syncedAt: Date.now()});
    retries = 0;
    if (m.localChanged) {
      writeLocal(m.result);
      onLoad ? reloadOnce() : showBanner();
    }
    setStatus('ok');
  } catch (e) {
    if (e.status === 409 && retries++ < 3) again = true;
    else if (e.status === 401) signedOut();
    else setStatus('error', e.message);
  } finally {
    syncing = false;
    if (again) { again = false; setTimeout(() => sync({onLoad}), 400); }
  }
}

function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = 0; sync(); }, 2500);
  setStatus('pending');
}

function reloadOnce() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 15000) { showBanner(); return; }
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  location.reload();
}

function watchStorage() {
  const proto = Storage.prototype, rawSet = proto.setItem, rawRemove = proto.removeItem;
  proto.setItem = function (k, v) { rawSet.call(this, k, v); if (this === window.localStorage && !applying && SYNC_KEYS.includes(k)) schedulePush(); };
  proto.removeItem = function (k) { rawRemove.call(this, k); if (this === window.localStorage && !applying && SYNC_KEYS.includes(k)) schedulePush(); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastVisibleSync > 30000) { lastVisibleSync = Date.now(); sync(); }
  });
  window.addEventListener('online', () => sync());
  // A pending change is pushed on the next visit if the tab closes first: the device copy stays the reference.
}

// ---------- Session ----------
async function signedIn(u, {firstTime = false} = {}) {
  user = u;
  if (!firstTime) return sync({onLoad: true});
  const server = await api('GET', '/data'), local = snapshot(localStorage);
  const overlap = merge({local, server: server.data || {}}).conflicts.length > 0;
  if (hasData(server.data) && hasData(local) && overlap) { renderChoice(server); return; }
  writeMeta({email: u.email});
  await sync({onLoad: true});
  closeDialog();
}

function signedOut() {
  user = null; writeMeta({}); clearTimeout(pushTimer); setStatus('idle');
}

async function keep(which, server) {
  try {
    setStatus('syncing');
    if (which === 'account') {
      writeLocal(server.data || {});
      writeMeta({email: user.email, version: server.version, base: fingerprints(server.data || {}), syncedAt: Date.now()});
      location.reload();
    } else {
      const data = snapshot(localStorage), r = await api('PUT', '/data', {baseVersion: server.version, data});
      writeMeta({email: user.email, version: r.version, base: fingerprints(data), syncedAt: Date.now()});
      setStatus('ok'); closeDialog();
    }
  } catch (e) { setStatus('error', e.message); }
}

// ---------- Interface ----------
const css = `
.bx-account{cursor:pointer;border-radius:8px}
.bx-account:hover{background:rgba(255,255,255,.03)}
.bx-account:focus-visible,.bx-pill:focus-visible,.bx-dialog button:focus-visible,.bx-dialog input:focus-visible{outline:2px solid #48d6bc;outline-offset:2px}
.bx-account small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bx-account>div{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bx-dot{width:7px!important;height:7px!important;border-radius:50%;margin-left:auto;flex:none;background:#5f6b82!important}
.bx-dot.ok{background:#47c7ab!important}.bx-dot.syncing,.bx-dot.pending{background:#d9b45a!important}.bx-dot.error{background:#f23645!important}
.bx-pill{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:170;display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:20px;border:1px solid #2a3344;background:#121722;color:#e9edf6;font:600 12px 'Inter','Segoe UI',sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.bx-pill[hidden]{display:none}
.bx-dialog{width:400px;max-width:calc(100vw - 32px);border:1px solid #2a3344;border-radius:12px;background:#121722;color:#e9edf6;padding:0;font:13px/1.5 'Inter','Segoe UI',sans-serif}
.bx-dialog::backdrop{background:rgba(4,6,13,.7);backdrop-filter:blur(3px)}
.bx-dialog form,.bx-body{display:flex;flex-direction:column;gap:14px;padding:22px}
.bx-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.bx-head h2{margin:0;font:600 17px 'Space Grotesk','Segoe UI',sans-serif}
.bx-close{background:none;border:0;color:#8590a6;font-size:18px;cursor:pointer;padding:4px}
.bx-tabs{display:flex;gap:3px;background:#0b0e17;border:1px solid #242b3a;border-radius:8px;padding:3px}
.bx-tabs button{flex:1;border:0;background:none;color:#8590a6;padding:8px;border-radius:6px;font-weight:600;font-size:12px;font-family:inherit;cursor:pointer}
.bx-tabs button[aria-selected="true"]{background:#1b3035;color:#48d6bc}
.bx-dialog label{display:flex;flex-direction:column;gap:6px;font-size:11px;color:#a7b0bd}
.bx-dialog input{background:#0b0e17;border:1px solid #2a3344;border-radius:6px;padding:10px;color:#e9edf6;font-size:13px;font-family:inherit}
.bx-primary{border:0;border-radius:7px;padding:11px;background:#48d6bc;color:#06201b;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer}
.bx-primary:disabled{opacity:.5;cursor:wait}
.bx-ghost{border:1px solid #2a3344;border-radius:7px;padding:10px;background:#0b0e17;color:#e9edf6;font-weight:600;font-size:12px;font-family:inherit;cursor:pointer}
.bx-danger{color:#ff8b98}
.bx-note{margin:0;font-size:11px;color:#8590a6}
.bx-error{margin:0;font-size:12px;color:#ff8b98}.bx-error:empty{display:none}
.bx-status{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:12px;border:1px solid #242b3a;border-radius:8px;background:#0b0e17}
.bx-dialog details{border-top:1px solid #242b3a;padding-top:12px}
.bx-dialog summary{cursor:pointer;font-size:12px;color:#a7b0bd}
.bx-dialog details>div{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.bx-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:190;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:8px;background:#1b3035;border:1px solid #2f6f62;color:#cdf2e9;font:12px 'Inter','Segoe UI',sans-serif;max-width:calc(100vw - 32px)}
.bx-banner button{border:0;border-radius:6px;padding:6px 10px;background:#48d6bc;color:#06201b;font-weight:700;font-size:11px;font-family:inherit;cursor:pointer}
@media (prefers-reduced-motion:no-preference){.bx-dot.syncing{animation:bx-pulse 1s infinite alternate}}
@keyframes bx-pulse{to{opacity:.35}}`;

let dialog, pill, tab = 'login', choice = null;

function subtitle() {
  if (!user) return 'Sauvegarde locale · Se connecter';
  if (status === 'syncing') return 'Synchronisation…';
  if (status === 'pending') return 'Modifications à envoyer…';
  if (status === 'error') return 'Synchro en échec';
  const at = readMeta().syncedAt;
  if (!at) return 'Compte connecté';
  const min = Math.round((Date.now() - at) / 60000);
  return 'Synchronisé ' + (min < 1 ? 'à l’instant' : 'il y a ' + (min < 60 ? min + ' min' : Math.round(min / 60) + ' h'));
}

function renderButton() {
  const host = document.querySelector('.bn-user');
  const title = user ? user.email : 'Mon compte', initial = (user?.email?.[0] || 'B').toUpperCase(), dot = user ? status : 'idle';
  if (host) {
    host.classList.add('bx-account');
    host.innerHTML = `<span>${esc(initial)}</span><div>${esc(title)}<small>${esc(subtitle())}</small></div><i class="bx-dot ${dot}"></i>`;
    host.title = user ? 'Compte Byhnex · ' + subtitle() : 'Se connecter pour sauvegarder vos données sur tous vos appareils';
  }
  const hostVisible = host && getComputedStyle(host).display !== 'none' && host.getClientRects().length > 0;
  pill.hidden = !!hostVisible;
  pill.innerHTML = `<i class="bx-dot ${dot}" style="width:7px;height:7px;display:inline-block"></i>${esc(user ? 'Compte' : 'Se connecter')}`;
  pill.setAttribute('aria-label', user ? 'Compte Byhnex, ' + subtitle() : 'Se connecter à Byhnex');
}

function closeDialog() { if (dialog?.open) dialog.close(); choice = null; }

function openDialog(nextTab) {
  if (nextTab) tab = nextTab;
  renderDialog();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('input')?.focus();
}

function renderChoice(server) { choice = server; setStatus('idle'); openDialog(); }

function renderDialog() {
  if (!dialog) return;
  const busy = status === 'syncing';
  if (choice) {
    dialog.innerHTML = `<div class="bx-body"><div class="bx-head"><h2>Quelles données garder ?</h2></div>
      <p class="bx-note" style="font-size:12px;color:#c4cede">Ce navigateur contient déjà des données différentes de celles de votre compte (portefeuille, cycles, dessins…).</p>
      <button class="bx-primary" data-keep="account" ${busy ? 'disabled' : ''}>Garder celles du compte</button>
      <button class="bx-ghost" data-keep="device" ${busy ? 'disabled' : ''}>Remplacer le compte par celles de cet appareil</button>
      <p class="bx-error" role="alert">${esc(status === 'error' ? statusText : '')}</p></div>`;
    return;
  }
  if (user) {
    const meta = readMeta();
    dialog.innerHTML = `<div class="bx-body"><div class="bx-head"><h2>Mon compte</h2><button class="bx-close" data-close aria-label="Fermer">✕</button></div>
      <div class="bx-status"><span>${esc(user.email)}</span><span>${esc(subtitle())}</span></div>
      <p class="bx-note">Portefeuille, cycles, scénarios, dessins, favoris et préférences sont sauvegardés sur votre compte et retrouvés sur tous vos appareils.${meta.version ? ' Version ' + meta.version + '.' : ''}</p>
      <p class="bx-error" role="alert">${esc(status === 'error' ? statusText : '')}</p>
      <button class="bx-primary" data-sync ${busy ? 'disabled' : ''}>Synchroniser maintenant</button>
      <button class="bx-ghost" data-logout>Se déconnecter</button>
      <p class="bx-note">Après déconnexion, vos données restent aussi dans ce navigateur.</p>
      <details><summary>Changer de mot de passe</summary><div>
        <label>Mot de passe actuel<input type="password" id="bx-current" autocomplete="current-password"></label>
        <label>Nouveau mot de passe (10 caractères minimum)<input type="password" id="bx-next" autocomplete="new-password" minlength="10"></label>
        <button class="bx-ghost" data-password>Enregistrer le nouveau mot de passe</button></div></details>
      <details><summary class="bx-danger">Supprimer mon compte</summary><div>
        <p class="bx-note">Le compte et ses données sauvegardées sont effacés définitivement. Les données de ce navigateur ne sont pas touchées.</p>
        <label>Mot de passe<input type="password" id="bx-delete" autocomplete="current-password"></label>
        <button class="bx-ghost bx-danger" data-delete>Supprimer définitivement</button></div></details></div>`;
    return;
  }
  const register = tab === 'register';
  dialog.innerHTML = `<form novalidate><div class="bx-head"><h2>${register ? 'Créer un compte' : 'Se connecter'}</h2><button type="button" class="bx-close" data-close aria-label="Fermer">✕</button></div>
    <div class="bx-tabs" role="tablist"><button type="button" role="tab" data-tab="login" aria-selected="${!register}">Connexion</button><button type="button" role="tab" data-tab="register" aria-selected="${register}">Nouveau compte</button></div>
    <p class="bx-note">Retrouvez votre portefeuille virtuel, vos cycles, scénarios et dessins sur tous vos appareils.</p>
    <label>Adresse e-mail<input type="email" id="bx-email" autocomplete="email" required></label>
    <label>Mot de passe${register ? ' (10 caractères minimum)' : ''}<input type="password" id="bx-password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="${register ? 10 : 1}"></label>
    <p class="bx-error" role="alert">${esc(status === 'error' ? statusText : '')}</p>
    <button class="bx-primary" ${busy ? 'disabled' : ''}>${register ? 'Créer mon compte' : 'Se connecter'}</button>
    ${register ? '<p class="bx-note">Les données déjà présentes dans ce navigateur seront envoyées sur votre nouveau compte.</p>' : ''}</form>`;
}

async function onDialogClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  try {
    if (t.dataset.close !== undefined) { closeDialog(); setStatus(user ? 'ok' : 'idle'); }
    else if (t.dataset.tab) { const email = dialog.querySelector('#bx-email')?.value || ''; tab = t.dataset.tab; setStatus('idle'); openDialog(); dialog.querySelector('#bx-email').value = email; }
    else if (t.dataset.keep) await keep(t.dataset.keep, choice);
    else if (t.dataset.sync !== undefined) await sync();
    else if (t.dataset.logout !== undefined) { await api('POST', '/auth/logout').catch(() => {}); signedOut(); closeDialog(); }
    else if (t.dataset.password !== undefined) {
      await api('POST', '/auth/password', {currentPassword: dialog.querySelector('#bx-current').value, newPassword: dialog.querySelector('#bx-next').value});
      setStatus('ok'); t.textContent = 'Mot de passe modifié ✓';
    } else if (t.dataset.delete !== undefined) {
      await api('DELETE', '/account', {password: dialog.querySelector('#bx-delete').value});
      signedOut(); closeDialog();
    }
    if (user && dialog.open && (t.dataset.sync !== undefined)) renderDialog();
  } catch (err) { setStatus('error', err.message); }
}

async function onSubmit(e) {
  e.preventDefault();
  const email = dialog.querySelector('#bx-email').value.trim(), password = dialog.querySelector('#bx-password').value;
  if (!email || !password) { setStatus('error', 'Saisissez votre adresse e-mail et votre mot de passe.'); return; }
  setStatus('syncing');
  try {
    const r = await api('POST', tab === 'register' ? '/auth/register' : '/auth/login', {email, password});
    await signedIn(r.user, {firstTime: true});
  } catch (err) { setStatus('error', err.message); }
}

function showBanner() {
  if (document.querySelector('.bx-banner')) return;
  const b = document.createElement('div');
  b.className = 'bx-banner'; b.setAttribute('role', 'status');
  b.innerHTML = 'Données mises à jour depuis un autre appareil.<button type="button">Recharger</button>';
  b.querySelector('button').onclick = () => location.reload();
  document.body.append(b);
}

async function start() {
  const style = document.createElement('style');
  style.textContent = css; document.head.append(style);
  pill = document.createElement('button');
  pill.type = 'button'; pill.className = 'bx-pill'; pill.hidden = true;
  dialog = document.createElement('dialog');
  dialog.className = 'bx-dialog'; dialog.setAttribute('aria-label', 'Compte Byhnex');
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('submit', onSubmit);
  dialog.addEventListener('close', () => { if (choice) openDialog(); });
  document.body.append(pill, dialog);
  pill.onclick = () => openDialog();
  const host = document.querySelector('.bn-user');
  if (host) {
    host.setAttribute('role', 'button'); host.tabIndex = 0;
    host.addEventListener('click', () => openDialog());
    host.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDialog(); } });
  }
  new ResizeObserver(renderButton).observe(document.body);
  setInterval(renderButton, 60000);
  watchStorage();
  renderButton();
  try {
    const me = await api('GET', '/auth/me');
    await signedIn(me.user);
  } catch (e) {
    if (e.status !== 401) setStatus('error', e.message); else signedOut();
  }
}

if (ENABLED) start();
