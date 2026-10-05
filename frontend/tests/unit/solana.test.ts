import { base58 } from '@scure/base'
import { describe, expect, it } from 'vitest'
import {
  associatedTokenAddress,
  MEMO_PROGRAM,
  paymentInstructions,
  paymentTransaction,
  publicKey,
  serializeTransaction,
  TOKEN_PROGRAM,
} from '@/pages/abonnement/solana'
import { mobileWalletLinks } from '@/pages/abonnement/wallets'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const PAYER = 'GkRNvZURAUAaw2skoXThmbydufAMm8HoTG9ZmLUraAJS'
const PLATFORM = '41zCUJsKk6cMB94DDtm99qWmyMZfp4GkAhhuz4xTwePu'
const REFERENCE = '9GJVrER6TNmyD2kVyREFRMdz1ArK27Tz6iJxUFWwBQzd'
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N'
const request = { payer: PAYER, recipient: PLATFORM, mint: USDC, amountAtomic: '1000000', decimals: 6, memo: 'SUB_0b6f6a52-5a59-4b5e-9d8c-1d1e1f2a3b4c', reference: REFERENCE, blockhash: BLOCKHASH }

/** Minimal reader of the legacy wire format, to check what the builder wrote. */
function parse(tx: Uint8Array) {
  let i = 0
  const u16 = (): number => {
    let value = 0
    for (let shift = 0; ; shift += 7) {
      const byte = tx[i++] ?? 0
      value |= (byte & 0x7f) << shift
      if (!(byte & 0x80)) return value
    }
  }
  const signatures = u16()
  i += 64 * signatures
  const header = [...tx.slice(i, i + 3)]
  i += 3
  const keys = Array.from({ length: u16() }, () => base58.encode(tx.slice(i, (i += 32))))
  const blockhash = base58.encode(tx.slice(i, (i += 32)))
  const instructions = Array.from({ length: u16() }, () => {
    const program = keys[tx[i++] ?? 0]
    const accounts = Array.from({ length: u16() }, () => keys[tx[i++] ?? 0])
    const length = u16()
    return { program, accounts, data: tx.slice(i, (i += length)) }
  })
  return { signatures, header, keys, blockhash, instructions, rest: tx.length - i }
}

describe('Solana payment transaction', () => {
  it('derives the same associated token account as Solana', () => {
    // Real USDC account of this wallet on mainnet (source of the transaction in the backend fixture).
    expect(associatedTokenAddress(PAYER, USDC)).toBe('1p1xy3szSNA5j2J6Xe76jGu51r43uBpjYnWHt24ouNK')
  })

  it('writes a legacy transaction the payer alone signs', () => {
    const tx = parse(paymentTransaction(request))
    expect(tx.rest).toBe(0)
    expect(tx.signatures).toBe(1)
    // Payer; source and platform USDC accounts; then 8 read-only: platform, mint, reference and the 5 programs.
    expect(tx.header).toEqual([1, 0, 8])
    expect(tx.keys).toHaveLength(11)
    expect(tx.keys[0]).toBe(PAYER)
    expect(tx.blockhash).toBe(BLOCKHASH)
    expect(new Set(tx.keys).size).toBe(tx.keys.length)
  })

  it('memo then transferChecked of exactly the price, with the reference attached', () => {
    const tx = parse(paymentTransaction(request))
    const memo = tx.instructions.find((ix) => ix.program === MEMO_PROGRAM)
    expect(new TextDecoder().decode(memo?.data)).toBe(request.memo)
    const transfer = tx.instructions.at(-1)
    expect(transfer?.program).toBe(TOKEN_PROGRAM)
    expect(transfer?.accounts).toEqual([associatedTokenAddress(PAYER, USDC), USDC, associatedTokenAddress(PLATFORM, USDC), PAYER, REFERENCE])
    expect([...(transfer?.data ?? [])]).toEqual([12, 0x40, 0x42, 0x0f, 0, 0, 0, 0, 0, 6])
  })

  it('merges repeated accounts and keeps signer and writable flags', () => {
    const tx = parse(serializeTransaction(PAYER, BLOCKHASH, paymentInstructions(request)))
    expect(tx.keys.filter((k) => k === PAYER)).toHaveLength(1)
    const reference = tx.keys.indexOf(REFERENCE)
    expect(reference).toBeGreaterThan(tx.keys.length - 1 - tx.header[2]!)
  })

  it('refuses malformed addresses', () => {
    expect(() => publicKey('pas-une-adresse')).toThrow()
    expect(() => paymentTransaction({ ...request, recipient: 'abc' })).toThrow()
  })

  it('opens the page in mobile wallet browsers', () => {
    const links = mobileWalletLinks('https://byhnex.com/abonnement.html')
    expect(links.map((l) => l.name)).toEqual(['Phantom', 'Solflare', 'Backpack'])
    expect(links[0]?.href).toBe('https://phantom.app/ul/browse/https%3A%2F%2Fbyhnex.com%2Fabonnement.html?ref=https%3A%2F%2Fbyhnex.com')
  })
})
