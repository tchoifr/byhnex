// Subscription endpoints of the Byhnex API (/api/subscription/…, /api/bot/token).
import { api } from '@/account/api'

export type PaymentStatus = 'pending' | 'processing' | 'confirmed' | 'expired'

export interface Payment {
  id: string
  status: PaymentStatus
  method: 'wallet' | 'qr'
  network: string
  token: string
  tokenMint: string
  decimals: number
  amount: string
  amountAtomic: string
  recipient: string
  walletAddress: string | null
  memo: string
  reference: string
  createdAt: string
  expiresAt: string
  confirmedAt: string | null
  transactionSignature: string | null
  explorerUrl: string | null
  failureReason: string | null
  solanaPayUrl: string
  blockhash?: { blockhash: string; lastValidBlockHeight: number }
}

export interface Subscription {
  status: 'active' | 'expired'
  active: boolean
  startsAt: string
  expiresAt: string
}

export interface Offer {
  available: boolean
  price: string
  token: string
  network: string
  durationDays: number
}

export interface VerifyResult {
  payment: Payment | null
  subscription?: Subscription | null
  pending?: { code: string; message: string }
}

export const subscriptionApi = {
  me: () => api<{ subscription: Subscription | null; pendingPayment: Payment | null; offer: Offer }>('GET', '/subscription/me'),
  createIntent: (method: 'wallet' | 'qr', walletAddress?: string) => api<{ payment: Payment }>('POST', '/subscription/payment-intent', { method, walletAddress }),
  verify: (paymentId: string, signature: string) => api<VerifyResult>('POST', '/subscription/payment/verify', { paymentId, signature }),
  payment: (id: string) => api<{ payment: Payment; subscription: Subscription | null }>('GET', '/subscription/payment/' + id),
  history: () => api<{ payments: Payment[] }>('GET', '/subscription/payments'),
  blockhash: () => api<{ blockhash: { blockhash: string; lastValidBlockHeight: number } }>('GET', '/subscription/blockhash'),
  botToken: () => api<{ token: string; url: string; expiresAt: string }>('POST', '/bot/token'),
}
