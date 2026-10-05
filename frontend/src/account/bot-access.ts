// Bot page (bot.html, osvalt16's original page) on byhnex.com: the server bot is for subscribers.
// With an active subscription, the access code is fetched from the API and entered in the page's own sign-in form;
// otherwise a banner leads to the subscription page. The page's script itself is not modified.
import { api, ApiError } from './api'

const CODE_KEY = 'byhnex-bot-code-v1'

const CSS = `.bx-bot{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:0 0 16px;padding:13px 16px;border:1px solid #383149;border-radius:10px;
background:radial-gradient(ellipse at 0 100%,#28213c 0,transparent 70%),#121722;color:#c4cddd;font:12px/1.6 Manrope,'Segoe UI',sans-serif}
.bx-bot.on{border-color:#28483d;background:linear-gradient(120deg,#13241f,#121822)}
.bx-bot b{color:#e8e6f4}.bx-bot span{flex:1;min-width:220px}
.bx-bot a,.bx-bot button{background:#b7a0ef;color:#171025;border:1px solid #c2b0f2;border-radius:6px;padding:8px 12px;font:600 11px Manrope,'Segoe UI',sans-serif;cursor:pointer;text-decoration:none}
.bx-bot.on a{background:none;color:#b7a0ef;border-color:#3d3351}`

interface BotAccess {
  token: string
  url: string
  expiresAt: string
}

let banner: HTMLElement | null = null

function show(html: string, active = false): HTMLElement {
  if (!banner) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    banner = document.createElement('div')
    banner.setAttribute('role', 'status')
    const anchor = document.querySelector('#login-box')?.closest('section') ?? document.querySelector('main')?.firstElementChild
    if (anchor?.parentElement) anchor.parentElement.insertBefore(banner, anchor)
    else document.body.prepend(banner)
  }
  banner.className = 'bx-bot' + (active ? ' on' : '')
  banner.innerHTML = html
  return banner
}

function readCode(): string | null {
  try {
    return JSON.parse(localStorage.getItem(CODE_KEY) ?? 'null') as string | null
  } catch {
    return null
  }
}

/** Enters the code through the page's own form, exactly as if the person had typed it. */
function signInBot(token: string): void {
  if (readCode() === token) return
  const form = document.querySelector<HTMLFormElement>('#login-box')
  const input = document.querySelector<HTMLInputElement>('#code')
  if (!form || !input) return
  input.value = token
  form.requestSubmit()
}

async function refresh(): Promise<void> {
  try {
    const access = await api<BotAccess>('POST', '/bot/token')
    const until = new Date(access.expiresAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    show(`<span><b>Abonnement actif</b> jusqu’au ${until}. Ton bot tourne sur le serveur Byhnex, 24 h/24.</span><a href="abonnement.html">Prolonger</a>`, true)
    signInBot(access.token)
  } catch (e) {
    if (!(e instanceof ApiError)) return
    if (e.status === 401) {
      show('<span><b>Bot serveur réservé aux abonnés</b> · 1 USDC pour 30 jours, payé sur Solana. Connecte-toi pour commencer.</span><button type="button" data-login>Se connecter</button><a href="abonnement.html">Voir l’offre</a>')
        .querySelector('[data-login]')
        ?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('byhnex:open-account', { detail: 'login' })))
    } else if (e.code === 'SUBSCRIPTION_REQUIRED') {
      show('<span><b>Abonnement requis</b> pour faire tourner ton bot sur le serveur · 1 USDC pour 30 jours, paiement unique sans renouvellement automatique.</span><a href="abonnement.html">S’abonner</a>')
    } else if (e.code === 'BOT_NOT_CONFIGURED') {
      show('<span><b>Ton abonnement est actif.</b> Le serveur du bot est en cours d’installation : il sera disponible ici très bientôt.</span>', true)
    }
  }
}

export function startBotAccess(): void {
  if (!/\/bot(\.html)?$/.test(location.pathname)) return
  window.addEventListener('byhnex:account', () => void refresh())
  void refresh()
}
