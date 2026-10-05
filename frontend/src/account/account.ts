// Byhnex account on byhnex.com: sign-in and automatic sync of the site's browser data with /api.
// Loaded on every page (migrated or not) until the sidebar itself moves to Vue; it only uses the DOM.
import { accountCss } from './account-styles'
import { accountApi, ApiError, type AccountUser, type ServerData } from './api'
import { apply, fingerprints, hasData, isSyncKey, merge, snapshot, type Fingerprints, type SyncData } from './sync-core'

type Status = 'idle' | 'ok' | 'syncing' | 'pending' | 'error'
interface SyncMeta {
  email?: string
  version?: number
  base?: Fingerprints
  syncedAt?: number
}

const META_KEY = 'byhnex-sync-meta'
const RELOAD_KEY = 'byhnex-sync-reloaded'

let user: AccountUser | null = null
let status: Status = 'idle'
let statusText = ''
let syncing = false
let again = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
let applying = false
let retries = 0
let lastVisibleSync = 0
let dialog: HTMLDialogElement
let pill: HTMLButtonElement
let tab: 'login' | 'register' = 'login'
let choice: ServerData | null = null

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function readMeta(): SyncMeta {
  try {
    return (JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as SyncMeta | null) ?? {}
  } catch {
    return {}
  }
}

function writeMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    /* Storage unavailable: the next visit syncs from scratch. */
  }
}

// ---------- Sync ----------
function setStatus(next: Status, text = ''): void {
  status = next
  statusText = text
  renderButton()
  updateDialog()
}

function updateDialog(): void {
  if (!dialog?.open) return
  const err = dialog.querySelector('.bx-error')
  const live = dialog.querySelector('.bx-status span:last-child')
  if (err) err.textContent = status === 'error' ? statusText : ''
  if (live) live.textContent = subtitle()
  dialog.querySelectorAll<HTMLButtonElement>('.bx-primary, [data-keep]').forEach((b) => {
    b.disabled = status === 'syncing'
  })
}

function writeLocal(data: SyncData): void {
  applying = true
  try {
    apply(localStorage, data)
  } finally {
    applying = false
  }
}

async function sync({ onLoad = false } = {}): Promise<void> {
  if (!user) return
  if (syncing) {
    again = true
    return
  }
  syncing = true
  setStatus('syncing')
  try {
    const meta = readMeta()
    const server = await accountApi.readData()
    const m = merge({ base: meta.base ?? {}, local: snapshot(localStorage), server: server.data ?? {} })
    let version = server.version
    if (m.pushNeeded) version = (await accountApi.writeData(version, m.result)).version
    writeMeta({ email: user.email, version, base: fingerprints(m.result), syncedAt: Date.now() })
    retries = 0
    if (m.localChanged) {
      writeLocal(m.result)
      if (onLoad) reloadOnce()
      else showBanner()
    }
    setStatus('ok')
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && retries++ < 3) again = true
    else if (e instanceof ApiError && e.status === 401) signedOut()
    else setStatus('error', message(e))
  } finally {
    syncing = false
    if (again) {
      again = false
      setTimeout(() => void sync({ onLoad }), 400)
    }
  }
}

function schedulePush(): void {
  if (!user) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = undefined
    void sync()
  }, 2500)
  setStatus('pending')
}

function reloadOnce(): void {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  if (Date.now() - last < 15000) {
    showBanner()
    return
  }
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  location.reload()
}

function watchStorage(): void {
  // Pages write to localStorage directly; every write to a synced key schedules a push.
  const proto = Storage.prototype
  // The original methods are kept unbound on purpose: they are called below with .call(this) on each Storage.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const rawSet = proto.setItem
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const rawRemove = proto.removeItem
  proto.setItem = function (this: Storage, k: string, v: string) {
    rawSet.call(this, k, v)
    if (this === window.localStorage && !applying && isSyncKey(k)) schedulePush()
  }
  proto.removeItem = function (this: Storage, k: string) {
    rawRemove.call(this, k)
    if (this === window.localStorage && !applying && isSyncKey(k)) schedulePush()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastVisibleSync > 30000) {
      lastVisibleSync = Date.now()
      void sync()
    }
  })
  window.addEventListener('online', () => void sync())
  // A pending change is pushed on the next visit if the tab closes first: the device copy stays the reference.
}

// ---------- Session ----------
async function signedIn(u: AccountUser, { firstTime = false } = {}): Promise<void> {
  user = u
  if (!firstTime) return sync({ onLoad: true })
  const server = await accountApi.readData()
  const local = snapshot(localStorage)
  const overlap = merge({ local, server: server.data ?? {} }).conflicts.length > 0
  if (hasData(server.data) && hasData(local) && overlap) {
    renderChoice(server)
    return
  }
  writeMeta({ email: u.email })
  await sync({ onLoad: true })
  closeDialog()
}

function signedOut(): void {
  user = null
  writeMeta({})
  clearTimeout(pushTimer)
  setStatus('idle')
}

async function keep(which: 'account' | 'device', server: ServerData): Promise<void> {
  if (!user) return
  try {
    setStatus('syncing')
    if (which === 'account') {
      writeLocal(server.data ?? {})
      writeMeta({ email: user.email, version: server.version, base: fingerprints(server.data ?? {}), syncedAt: Date.now() })
      location.reload()
    } else {
      const data = snapshot(localStorage)
      const r = await accountApi.writeData(server.version, data)
      writeMeta({ email: user.email, version: r.version, base: fingerprints(data), syncedAt: Date.now() })
      setStatus('ok')
      closeDialog()
    }
  } catch (e) {
    setStatus('error', message(e))
  }
}

// ---------- Interface ----------
function subtitle(): string {
  if (!user) return 'Sauvegarde locale · Se connecter'
  if (status === 'syncing') return 'Synchronisation…'
  if (status === 'pending') return 'Modifications à envoyer…'
  if (status === 'error') return 'Synchro en échec'
  const at = readMeta().syncedAt
  if (!at) return 'Compte connecté'
  const min = Math.round((Date.now() - at) / 60000)
  return 'Synchronisé ' + (min < 1 ? 'à l’instant' : 'il y a ' + (min < 60 ? `${min} min` : `${Math.round(min / 60)} h`))
}

function renderButton(): void {
  const host = document.querySelector<HTMLElement>('.bn-user')
  const title = user ? user.email : 'Mon compte'
  const initial = (user?.email?.[0] ?? 'B').toUpperCase()
  const dot = user ? status : 'idle'
  if (host) {
    host.classList.add('bx-account')
    host.innerHTML = `<span>${esc(initial)}</span><div>${esc(title)}<small>${esc(subtitle())}</small></div><i class="bx-dot ${dot}"></i>`
    host.title = user ? 'Compte Byhnex · ' + subtitle() : 'Se connecter pour sauvegarder vos données sur tous vos appareils'
  }
  const hostVisible = !!host && getComputedStyle(host).display !== 'none' && host.getClientRects().length > 0
  pill.hidden = hostVisible
  pill.innerHTML = `<i class="bx-dot ${dot}" style="width:7px;height:7px;display:inline-block"></i>${esc(user ? 'Compte' : 'Se connecter')}`
  pill.setAttribute('aria-label', user ? 'Compte Byhnex, ' + subtitle() : 'Se connecter à Byhnex')
}

function closeDialog(): void {
  if (dialog?.open) dialog.close()
  choice = null
}

function openDialog(nextTab?: 'login' | 'register'): void {
  if (nextTab) tab = nextTab
  renderDialog()
  if (!dialog.open) dialog.showModal()
  dialog.querySelector('input')?.focus()
}

function renderChoice(server: ServerData): void {
  choice = server
  setStatus('idle')
  openDialog()
}

function renderDialog(): void {
  if (!dialog) return
  const busy = status === 'syncing'
  if (choice) {
    dialog.innerHTML = `<div class="bx-body"><div class="bx-head"><h2>Quelles données garder ?</h2></div>
      <p class="bx-note" style="font-size:12px;color:#c4cede">Ce navigateur contient déjà des données différentes de celles de votre compte (portefeuille, cycles, dessins…).</p>
      <button class="bx-primary" data-keep="account" ${busy ? 'disabled' : ''}>Garder celles du compte</button>
      <button class="bx-ghost" data-keep="device" ${busy ? 'disabled' : ''}>Remplacer le compte par celles de cet appareil</button>
      <p class="bx-error" role="alert">${esc(status === 'error' ? statusText : '')}</p></div>`
    return
  }
  if (user) {
    const meta = readMeta()
    dialog.innerHTML = `<div class="bx-body"><div class="bx-head"><h2>Mon compte</h2><button class="bx-close" data-close aria-label="Fermer">✕</button></div>
      <div class="bx-status"><span>${esc(user.email)}</span><span>${esc(subtitle())}</span></div>
      <p class="bx-note">Portefeuille, cycles, scénarios, dessins, favoris et préférences sont sauvegardés sur votre compte et retrouvés sur tous vos appareils.${meta.version ? ` Version ${meta.version}.` : ''}</p>
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
        <button class="bx-ghost bx-danger" data-delete>Supprimer définitivement</button></div></details></div>`
    return
  }
  const register = tab === 'register'
  dialog.innerHTML = `<form novalidate><div class="bx-head"><h2>${register ? 'Créer un compte' : 'Se connecter'}</h2><button type="button" class="bx-close" data-close aria-label="Fermer">✕</button></div>
    <div class="bx-tabs" role="tablist"><button type="button" role="tab" data-tab="login" aria-selected="${!register}">Connexion</button><button type="button" role="tab" data-tab="register" aria-selected="${register}">Nouveau compte</button></div>
    <p class="bx-note">Retrouvez votre portefeuille virtuel, vos cycles, scénarios et dessins sur tous vos appareils.</p>
    <label>Adresse e-mail<input type="email" id="bx-email" autocomplete="email" required></label>
    <label>Mot de passe${register ? ' (10 caractères minimum)' : ''}<input type="password" id="bx-password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="${register ? 10 : 1}"></label>
    <p class="bx-error" role="alert">${esc(status === 'error' ? statusText : '')}</p>
    <button class="bx-primary" ${busy ? 'disabled' : ''}>${register ? 'Créer mon compte' : 'Se connecter'}</button>
    ${register ? '<p class="bx-note">Les données déjà présentes dans ce navigateur seront envoyées sur votre nouveau compte.</p>' : ''}</form>`
}

const field = (selector: string) => dialog.querySelector<HTMLInputElement>(selector)?.value ?? ''

async function onDialogClick(e: MouseEvent): Promise<void> {
  const t = (e.target as Element | null)?.closest<HTMLButtonElement>('button')
  if (!t) return
  try {
    if (t.dataset.close !== undefined) {
      closeDialog()
      setStatus(user ? 'ok' : 'idle')
    } else if (t.dataset.tab === 'login' || t.dataset.tab === 'register') {
      const email = field('#bx-email')
      tab = t.dataset.tab
      setStatus('idle')
      openDialog()
      const input = dialog.querySelector<HTMLInputElement>('#bx-email')
      if (input) input.value = email
    } else if ((t.dataset.keep === 'account' || t.dataset.keep === 'device') && choice) await keep(t.dataset.keep, choice)
    else if (t.dataset.sync !== undefined) await sync()
    else if (t.dataset.logout !== undefined) {
      await accountApi.logout().catch(() => undefined)
      signedOut()
      closeDialog()
    } else if (t.dataset.password !== undefined) {
      await accountApi.changePassword(field('#bx-current'), field('#bx-next'))
      setStatus('ok')
      t.textContent = 'Mot de passe modifié ✓'
    } else if (t.dataset.delete !== undefined) {
      await accountApi.deleteAccount(field('#bx-delete'))
      signedOut()
      closeDialog()
    }
    if (user && dialog.open && t.dataset.sync !== undefined) renderDialog()
  } catch (err) {
    setStatus('error', message(err))
  }
}

async function onSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault()
  const email = field('#bx-email').trim()
  const password = field('#bx-password')
  if (!email || !password) {
    setStatus('error', 'Saisissez votre adresse e-mail et votre mot de passe.')
    return
  }
  setStatus('syncing')
  try {
    const r = tab === 'register' ? await accountApi.register(email, password) : await accountApi.login(email, password)
    await signedIn(r.user, { firstTime: true })
  } catch (err) {
    setStatus('error', message(err))
  }
}

function showBanner(): void {
  if (document.querySelector('.bx-banner')) return
  const b = document.createElement('div')
  b.className = 'bx-banner'
  b.setAttribute('role', 'status')
  b.textContent = 'Données mises à jour depuis un autre appareil.'
  const reload = document.createElement('button')
  reload.type = 'button'
  reload.textContent = 'Recharger'
  reload.onclick = () => location.reload()
  b.append(reload)
  document.body.append(b)
}

export async function startAccount(): Promise<void> {
  const style = document.createElement('style')
  style.textContent = accountCss
  document.head.append(style)
  pill = document.createElement('button')
  pill.type = 'button'
  pill.className = 'bx-pill'
  pill.hidden = true
  dialog = document.createElement('dialog')
  dialog.className = 'bx-dialog'
  dialog.setAttribute('aria-label', 'Compte Byhnex')
  dialog.addEventListener('click', (e) => void onDialogClick(e))
  dialog.addEventListener('submit', (e) => void onSubmit(e))
  dialog.addEventListener('close', () => {
    if (choice) openDialog()
  })
  document.body.append(pill, dialog)
  pill.onclick = () => openDialog()
  const host = document.querySelector<HTMLElement>('.bn-user')
  if (host) {
    host.setAttribute('role', 'button')
    host.tabIndex = 0
    host.addEventListener('click', () => openDialog())
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openDialog()
      }
    })
  }
  new ResizeObserver(renderButton).observe(document.body)
  setInterval(renderButton, 60000)
  watchStorage()
  renderButton()
  try {
    const me = await accountApi.me()
    await signedIn(me.user)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) signedOut()
    else setStatus('error', message(e))
  }
}
