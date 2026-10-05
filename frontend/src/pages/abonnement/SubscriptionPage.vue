<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { encode } from 'uqr'
import { ApiError } from '@/account/api'
import { encodeSignature, paymentTransaction } from './solana'
import { subscriptionApi, type Offer, type Payment, type Subscription } from './subscriptionApi'
import { connect, isUserRejection, mobileWalletLinks, signAndSend, watchWallets, type SolanaWallet } from './wallets'

type Step = 'idle' | 'connect' | 'intent' | 'sign' | 'confirm'

const state = ref<'loading' | 'signed-out' | 'ready' | 'error'>('loading')
const offer = ref<Offer | null>(null)
const subscription = ref<Subscription | null>(null)
const payment = ref<Payment | null>(null)
const history = ref<Payment[]>([])
const wallets = shallowRef<SolanaWallet[]>([])
const step = ref<Step>('idle')
const busyWallet = ref('')
const error = ref('')
const notice = ref('')
const success = ref(false)
const now = ref(Date.now())
let pollTimer: number | undefined
let clockTimer: number | undefined
let stopWatching: (() => void) | undefined

const STEPS: Record<Step, string> = {
  idle: '',
  connect: 'Connexion au wallet…',
  intent: 'Préparation du paiement…',
  sign: 'Validez le paiement dans votre wallet.',
  confirm: 'Paiement envoyé. Vérification sur la blockchain Solana…',
}

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
const walletLinks = mobileWalletLinks(location.href.split('#')[0] ?? location.href)
const active = computed(() => !!subscription.value?.active)
// QR code drawn as one SVG path (one square per dark module).
const qr = computed(() => {
  if (payment.value?.method !== 'qr' || payment.value.status !== 'pending') return null
  const { data, size } = encode(payment.value.solanaPayUrl, { border: 2 })
  const d = data.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : ''))).join('')
  return { d, size }
})
const remaining = computed(() => {
  if (!payment.value) return ''
  const s = Math.max(0, Math.round((Date.parse(payment.value.expiresAt) - now.value) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const daysLeft = computed(() => (subscription.value ? Math.max(0, Math.ceil((Date.parse(subscription.value.expiresAt) - now.value) / 86400000)) : 0))

const date = (iso: string, time = false): string =>
  new Date(iso).toLocaleString('fr-FR', time ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' })
const short = (address: string | null): string => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : '—')
const STATUS: Record<Payment['status'], string> = { pending: 'En attente', processing: 'En cours de finalisation', confirmed: 'Confirmé', expired: 'Expiré' }

function fail(e: unknown): void {
  step.value = 'idle'
  busyWallet.value = ''
  if (isUserRejection(e)) error.value = 'Paiement annulé dans le wallet. Aucun montant n’a été débité.'
  else if (e instanceof ApiError && e.status === 401) state.value = 'signed-out'
  else error.value = e instanceof Error ? e.message : 'Une erreur est survenue. Réessayez.'
}

async function load(): Promise<void> {
  try {
    const me = await subscriptionApi.me()
    offer.value = me.offer
    subscription.value = me.subscription
    state.value = 'ready'
    if (me.pendingPayment && !payment.value) {
      payment.value = me.pendingPayment
      poll()
    }
    history.value = (await subscriptionApi.history()).payments
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) state.value = 'signed-out'
    else {
      state.value = 'error'
      error.value = e instanceof Error ? e.message : 'Le serveur ne répond pas.'
    }
  }
}

function settle(next: Payment, sub?: Subscription | null): void {
  payment.value = next
  if (sub !== undefined) subscription.value = sub
  if (next.status === 'confirmed') {
    clearTimeout(pollTimer)
    step.value = 'idle'
    busyWallet.value = ''
    success.value = true
    notice.value = ''
    void subscriptionApi.history().then((h) => (history.value = h.payments))
  } else if (next.status === 'expired') {
    clearTimeout(pollTimer)
    step.value = 'idle'
    busyWallet.value = ''
    error.value = 'La demande de paiement a expiré sans paiement reçu. Vous pouvez relancer un paiement.'
  }
}

/** The server checks the blockchain on each poll; it also finds QR code payments through their reference. */
function poll(): void {
  clearTimeout(pollTimer)
  const current = payment.value
  if (!current || current.status === 'confirmed' || current.status === 'expired') return
  pollTimer = window.setTimeout(async () => {
    try {
      const r = await subscriptionApi.payment(current.id)
      settle(r.payment, r.subscription)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return fail(e)
    }
    if (payment.value?.id === current.id) poll()
  }, 4000)
}

async function payWithWallet(w: SolanaWallet): Promise<void> {
  error.value = ''
  notice.value = ''
  success.value = false
  busyWallet.value = w.name
  try {
    step.value = 'connect'
    const account = await connect(w)
    step.value = 'intent'
    const { payment: intent } = await subscriptionApi.createIntent('wallet', account.address)
    payment.value = intent
    const blockhash = intent.blockhash?.blockhash ?? (await subscriptionApi.blockhash()).blockhash.blockhash
    const transaction = paymentTransaction({
      payer: account.address,
      recipient: intent.recipient,
      mint: intent.tokenMint,
      amountAtomic: intent.amountAtomic,
      decimals: intent.decimals,
      memo: intent.memo,
      reference: intent.reference,
      blockhash,
    })
    step.value = 'sign'
    const signature = encodeSignature(await signAndSend(w, account, transaction))
    step.value = 'confirm'
    try {
      const r = await subscriptionApi.verify(intent.id, signature)
      if (r.payment) settle(r.payment, r.subscription)
      if (r.pending) notice.value = r.pending.message
    } catch (e) {
      // Sent but not checked yet (Solana or the API busy): polling finds it through the payment reference.
      if (e instanceof ApiError && e.status >= 500) notice.value = e.message
      else throw e
    }
    poll()
  } catch (e) {
    fail(e)
  }
}

async function payWithQr(): Promise<void> {
  error.value = ''
  notice.value = ''
  success.value = false
  try {
    step.value = 'intent'
    const { payment: intent } = await subscriptionApi.createIntent('qr')
    payment.value = intent
    step.value = 'idle'
    poll()
  } catch (e) {
    fail(e)
  }
}

function cancelQr(): void {
  clearTimeout(pollTimer)
  payment.value = null
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    notice.value = 'Copié.'
  } catch {
    notice.value = text
  }
}

function openAccount(): void {
  window.dispatchEvent(new CustomEvent('byhnex:open-account', { detail: 'login' }))
}

function onAccount(): void {
  state.value = 'loading'
  payment.value = null
  void load()
}

onMounted(() => {
  stopWatching = watchWallets((list) => (wallets.value = list))
  clockTimer = window.setInterval(() => (now.value = Date.now()), 1000)
  window.addEventListener('byhnex:account', onAccount)
  void load()
})
onBeforeUnmount(() => {
  stopWatching?.()
  clearTimeout(pollTimer)
  clearInterval(clockTimer)
  window.removeEventListener('byhnex:account', onAccount)
})
</script>

<template>
  <header class="bn-topbar"><div><a class="bn-mobile-brand" href="index.html">byhnex.</a><span>Workspace</span><b>/</b>Abonnement au bot</div><div class="bn-topbar-right"><a class="bn-button" href="bot.html">Ouvrir le bot ↗</a></div></header>
  <div class="bn-content sub">
    <section class="sub-hero">
      <div>
        <p class="bn-eyebrow">BOT DE TRADING · SERVEUR 24 H/24</p>
        <h1>Ton bot tourne <span>sans toi</span>.</h1>
        <p class="bn-intro">Accès au bot serveur Byhnex pendant 30 jours : il suit tes stratégies sur les clôtures de bougies, même navigateur fermé. Argent fictif uniquement, aucune clé d’exchange.</p>
      </div>
      <div class="sub-price" aria-label="Prix">
        <strong>{{ offer?.price ?? '1.00' }} <small>USDC</small></strong>
        <span>{{ offer?.durationDays ?? 30 }} jours · réseau Solana</span>
        <em>Paiement unique. Aucun renouvellement automatique.</em>
      </div>
    </section>

    <p v-if="state === 'loading'" class="sub-card sub-muted">Chargement…</p>

    <section v-else-if="state === 'signed-out'" class="sub-card">
      <h2>Connecte-toi pour t’abonner</h2>
      <p class="sub-muted">L’abonnement est rattaché à ton compte Byhnex : il te suit sur tous tes appareils.</p>
      <button class="bn-primary" type="button" @click="openAccount">Se connecter ou créer un compte</button>
    </section>

    <section v-else-if="state === 'error'" class="sub-card">
      <p class="sub-error" role="alert">{{ error }}</p>
      <button class="bn-button" type="button" @click="onAccount">Réessayer</button>
    </section>

    <template v-else>
      <section class="sub-card sub-status" :class="{ on: active }" aria-live="polite">
        <template v-if="active && subscription">
          <h2><i class="dot" /> Abonnement actif</h2>
          <p>Jusqu’au <b>{{ date(subscription.expiresAt, true) }}</b> · {{ daysLeft }} jour{{ daysLeft > 1 ? 's' : '' }} restant{{ daysLeft > 1 ? 's' : '' }}.</p>
          <p class="sub-muted">Payer à nouveau ajoute 30 jours après cette date : aucun jour n’est perdu.</p>
          <a class="bn-primary" href="bot.html">Ouvrir mon bot →</a>
        </template>
        <template v-else-if="subscription">
          <h2>Abonnement terminé</h2>
          <p class="sub-muted">Terminé le {{ date(subscription.expiresAt, true) }}. Ton bot est en pause : renouvelle pour le relancer.</p>
        </template>
        <template v-else>
          <h2>Pas encore d’abonnement</h2>
          <p class="sub-muted">Une fois le paiement confirmé sur Solana, l’accès est ouvert immédiatement.</p>
        </template>
      </section>

      <p v-if="success" class="sub-card sub-success" role="status">Paiement confirmé sur Solana. Ton bot est débloqué jusqu’au {{ subscription ? date(subscription.expiresAt, true) : '' }}. <a href="bot.html">Ouvrir le bot →</a></p>

      <section v-if="offer && !offer.available" class="sub-card">
        <h2>Paiements bientôt ouverts</h2>
        <p class="sub-muted">Le paiement en USDC sera disponible ici très prochainement.</p>
      </section>

      <section v-else class="sub-card">
        <h2>{{ active ? 'Prolonger de 30 jours' : 'S’abonner' }} · {{ offer?.price }} USDC</h2>

        <div v-if="payment && payment.method === 'qr' && payment.status === 'pending'" class="sub-qr">
          <svg v-if="qr" class="qr" role="img" aria-label="QR code Solana Pay" :viewBox="`0 0 ${qr.size} ${qr.size}`" shape-rendering="crispEdges"><rect :width="qr.size" :height="qr.size" fill="#fff" /><path :d="qr.d" fill="#0b0e17" /></svg>
          <div>
            <p><b>Scanne avec ton wallet Solana</b> (Phantom, Solflare, Backpack, Trust, Coinbase Wallet…).</p>
            <p class="sub-muted">Le montant ({{ payment.amount.replace(/0+$/, '').replace(/\.$/, '') }} USDC), le destinataire et la référence sont déjà remplis. Ne les modifie pas.</p>
            <p class="sub-muted">Expire dans <b>{{ remaining }}</b> · vérification automatique toutes les 4 s.</p>
            <a v-if="isMobile" class="bn-primary" :href="payment.solanaPayUrl">Ouvrir dans mon wallet</a>
            <button class="bn-button" type="button" @click="copy(payment.recipient)">Copier l’adresse</button>
            <button class="bn-button" type="button" @click="cancelQr">Choisir un autre moyen</button>
          </div>
        </div>

        <template v-else>
          <p class="sub-muted">Choisis le wallet qui détient tes USDC (réseau Solana). Il faut aussi quelques centimes de SOL pour les frais du réseau.</p>
          <div v-if="wallets.length" class="sub-wallets">
            <button v-for="w in wallets" :key="w.name" type="button" class="sub-wallet" :disabled="step !== 'idle'" @click="payWithWallet(w)">
              <img :src="w.icon" alt="" width="28" height="28" />
              <span>{{ w.name }}</span>
              <small v-if="busyWallet === w.name">{{ STEPS[step] }}</small>
            </button>
          </div>
          <p v-else class="sub-muted">Aucun wallet Solana détecté dans ce navigateur.
            <template v-if="isMobile">Ouvre cette page dans l’application de ton wallet :
              <a v-for="l in walletLinks" :key="l.name" class="sub-link" :href="l.href">{{ l.name }}</a>
            </template>
            <template v-else>Installe Phantom, Solflare ou Backpack, ou paie depuis ton téléphone avec le QR code.</template>
          </p>
          <button class="bn-button" type="button" :disabled="step !== 'idle'" @click="payWithQr">Payer avec un QR code (Solana Pay)</button>
        </template>

        <p v-if="step !== 'idle' && !busyWallet" class="sub-muted">{{ STEPS[step] }}</p>
        <p v-if="payment && payment.status === 'processing'" class="sub-muted" role="status">Transaction reçue, en cours de finalisation sur Solana (quelques secondes).</p>
        <p v-if="notice" class="sub-muted" role="status">{{ notice }}</p>
        <p v-if="error" class="sub-error" role="alert">{{ error }}</p>
      </section>

      <section v-if="history.length" class="sub-card">
        <h2>Historique des paiements</h2>
        <div class="sub-table">
          <table>
            <thead><tr><th>Date</th><th>Montant</th><th>Wallet</th><th>Statut</th><th>Transaction</th></tr></thead>
            <tbody>
              <tr v-for="p in history" :key="p.id">
                <td>{{ date(p.confirmedAt ?? p.createdAt, true) }}</td>
                <td>{{ p.amount.replace(/0+$/, '').replace(/\.$/, '') }} {{ p.token }}</td>
                <td>{{ short(p.walletAddress) }}</td>
                <td>{{ STATUS[p.status] }}</td>
                <td><a v-if="p.explorerUrl" :href="p.explorerUrl" target="_blank" rel="noopener noreferrer">{{ short(p.transactionSignature) }} ↗</a><span v-else>—</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <section class="sub-legal">
      <h2>À lire avant de payer</h2>
      <ul>
        <li><b>Paiement unique. Aucun renouvellement automatique.</b> Rien n’est prélevé à la fin des 30 jours : ton bot se met simplement en pause.</li>
        <li>Les paiements en crypto sont <b>irréversibles</b>. Vérifie dans ton wallet : {{ offer?.price ?? '1.00' }} USDC sur le réseau Solana, vers le wallet de Byhnex.</li>
        <li>Byhnex ne te demandera <b>jamais</b> ta phrase de récupération, ta clé privée ni un fichier de wallet. Tu valides le paiement uniquement dans ton wallet.</li>
        <li>Le bot utilise de l’<b>argent fictif</b> : aucune clé d’exchange, aucun ordre réel. Ses résultats ne préjugent pas des performances futures et ne constituent pas un conseil en investissement.</li>
        <li>Le trading de crypto-actifs comporte un risque élevé de perte en capital. N’investis que ce que tu peux te permettre de perdre.</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.sub{max-width:980px}
.sub-hero{display:flex;justify-content:space-between;gap:28px;align-items:flex-end;margin-bottom:26px}
.sub-hero h1{font:600 36px/1.18 'Segoe UI',sans-serif;letter-spacing:-1.2px;margin:0 0 14px;color:var(--bn-text)}
.sub-hero h1 span{color:#99a6bd}
.sub-price{flex-shrink:0;border:1px solid #383149;border-radius:12px;padding:18px 22px;background:radial-gradient(ellipse at 0 100%,#28213c 0,transparent 70%),#121722;display:flex;flex-direction:column;gap:6px;min-width:220px}
.sub-price strong{font:600 34px/1 'Segoe UI',sans-serif;color:#e8e6f4}
.sub-price strong small{font-size:14px;color:#b7a0ef}
.sub-price span{font-size:11px;color:#9aa5bb}
.sub-price em{font-style:normal;font-size:10px;color:#c5a46e}
.sub-card{border:1px solid #2a3040;border-radius:10px;background:#121822;padding:20px 22px;margin:0 0 16px;font-size:12px;line-height:1.8;color:#c4cddd}
.sub-card h2{font-size:15px;font-weight:600;margin:0 0 8px;color:#dce2ed;display:flex;align-items:center;gap:8px}
.sub-card .bn-primary,.sub-card .bn-button{margin:10px 10px 0 0;cursor:pointer;font-family:inherit}
.sub-card button:disabled{opacity:.55;cursor:wait}
.sub-status.on{border-color:#28483d;background:linear-gradient(120deg,#13241f,#121822)}
.dot{width:8px;height:8px;border-radius:50%;background:#47c7ab;display:inline-block}
.sub-muted{color:#8a97ac}
.sub-error{color:#f08a8a}
.sub-success{border-color:#28483d;color:#9fe3cf}
.sub-success a,.sub-link,.sub-table a{color:#b7a0ef}
.sub-link{margin-left:10px}
.sub-wallets{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin:12px 0 4px}
.sub-wallet{display:flex;align-items:center;gap:10px;flex-wrap:wrap;text-align:left;border:1px solid #343c50;border-radius:8px;background:#19202e;color:#dce2ed;padding:11px 12px;font:600 12px Manrope,'Segoe UI',sans-serif;cursor:pointer}
.sub-wallet:hover:not(:disabled){border-color:#615477;background:#1f2536}
.sub-wallet img{border-radius:6px}
.sub-wallet small{flex-basis:100%;font-weight:500;font-size:10px;color:#b7a0ef}
.sub-qr{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap}
.qr{width:220px;height:220px;border-radius:10px;flex-shrink:0;display:block}
.sub-qr>div:last-child{flex:1;min-width:220px}
.sub-table{overflow-x:auto}
.sub-table table{width:100%;border-collapse:collapse;font-size:11px}
.sub-table th{text-align:left;color:#96a5be;font-weight:500;padding:8px;border-bottom:1px solid #252f42;white-space:nowrap}
.sub-table td{padding:8px;border-bottom:1px solid #1d2535;white-space:nowrap}
.sub-legal{margin-top:24px;font-size:11px;line-height:1.85;color:#8090aa}
.sub-legal h2{font-size:12px;font-weight:600;color:#b9c5dc;margin:0 0 6px}
.sub-legal ul{margin:0;padding-left:18px}
.sub-legal b{color:#c4cddd}
@media (max-width:760px){
  .sub-hero{flex-direction:column;align-items:stretch}
  .sub-hero h1{font-size:28px}
  .qr{width:180px;height:180px}
}
</style>
