// Solana wallets installed in the browser, through the Wallet Standard (Phantom, Solflare, Backpack, Coinbase Wallet,
// Trust, OKX, Bitget, Glow… and the in-app browsers of their mobile apps). The site never sees a private key:
// the wallet shows the transaction, the person approves it there, and the wallet sends it.
import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount } from '@wallet-standard/base'

export const CHAIN = 'solana:mainnet'

interface ConnectFeature {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>
}
interface DisconnectFeature {
  disconnect(): Promise<void>
}
interface SignAndSendFeature {
  signAndSendTransaction(
    ...inputs: { account: WalletAccount; chain: string; transaction: Uint8Array; options?: { commitment?: string; preflightCommitment?: string } }[]
  ): Promise<readonly { signature: Uint8Array }[]>
}

export interface SolanaWallet {
  name: string
  icon: string
  wallet: Wallet
}

function feature<T>(wallet: Wallet, name: string): T | null {
  return ((wallet.features as Record<string, unknown>)[name] as T | undefined) ?? null
}

function usable(wallet: Wallet): boolean {
  return wallet.chains.includes(CHAIN) && !!feature(wallet, 'standard:connect') && !!feature(wallet, 'solana:signAndSendTransaction')
}

/** Wallets available now, kept up to date as extensions register (they may load after the page). */
export function watchWallets(onChange: (wallets: SolanaWallet[]) => void): () => void {
  const registry = getWallets()
  const emit = (): void => {
    const seen = new Set<string>()
    onChange(
      registry
        .get()
        .filter(usable)
        .filter((w) => !seen.has(w.name) && !!seen.add(w.name))
        .map((wallet) => ({ name: wallet.name, icon: wallet.icon, wallet })),
    )
  }
  emit()
  const offRegister = registry.on('register', emit)
  const offUnregister = registry.on('unregister', emit)
  return () => {
    offRegister()
    offUnregister()
  }
}

export async function connect(w: SolanaWallet): Promise<WalletAccount> {
  const connectFeature = feature<ConnectFeature>(w.wallet, 'standard:connect')
  if (!connectFeature) throw new Error(`${w.name} ne permet pas de se connecter.`)
  const { accounts } = await connectFeature.connect()
  const account = accounts.find((a) => a.chains.includes(CHAIN)) ?? accounts[0]
  if (!account) throw new Error(`Aucun compte Solana ouvert dans ${w.name}.`)
  return account
}

export async function disconnect(w: SolanaWallet): Promise<void> {
  await feature<DisconnectFeature>(w.wallet, 'standard:disconnect')?.disconnect()
}

/** Asks the wallet to sign and send the transaction; returns the raw signature. */
export async function signAndSend(w: SolanaWallet, account: WalletAccount, transaction: Uint8Array): Promise<Uint8Array> {
  const send = feature<SignAndSendFeature>(w.wallet, 'solana:signAndSendTransaction')
  if (!send) throw new Error(`${w.name} ne peut pas envoyer de transaction.`)
  const [result] = await send.signAndSendTransaction({ account, chain: CHAIN, transaction, options: { commitment: 'confirmed', preflightCommitment: 'confirmed' } })
  if (!result) throw new Error('Le wallet n’a pas renvoyé de signature.')
  return result.signature
}

/** Rejections in the wallet itself (closing the window, clicking "Cancel"). */
export function isUserRejection(error: unknown): boolean {
  const e = error as { code?: number; name?: string; message?: string } | null
  return e?.code === 4001 || /reject|denied|cancel|declin|refus|annul/i.test(`${e?.name ?? ''} ${e?.message ?? ''}`)
}

/** Links that reopen this page inside a mobile wallet's browser, where the wallet is available. */
export function mobileWalletLinks(pageUrl: string): { name: string; href: string }[] {
  const url = encodeURIComponent(pageUrl)
  const ref = encodeURIComponent(new URL(pageUrl).origin)
  return [
    { name: 'Phantom', href: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { name: 'Solflare', href: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
    { name: 'Backpack', href: `https://backpack.app/ul/v1/browse/${url}?ref=${ref}` },
  ]
}
