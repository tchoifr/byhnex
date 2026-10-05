// Builds the USDC payment transaction (Solana legacy format) without a heavy SDK: noble/scure only, audited and
// dependency-free. The wallet signs and sends it; the server then checks it on chain before granting anything.
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { base58 } from '@scure/base'

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
export const SYSTEM_PROGRAM = '11111111111111111111111111111111'
export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111'

export interface AccountMeta {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

export interface Instruction {
  programId: string
  keys: AccountMeta[]
  data: Uint8Array
}

export interface PaymentRequest {
  payer: string
  recipient: string
  mint: string
  amountAtomic: string
  decimals: number
  memo: string
  reference: string
  blockhash: string
}

const encoder = new TextEncoder()

export function publicKey(address: string): Uint8Array {
  const bytes = base58.decode(address)
  if (bytes.length !== 32) throw new Error(`Adresse Solana invalide : ${address}`)
  return bytes
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes, true)
    return true
  } catch {
    return false
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Program derived address, as findProgramAddressSync: highest bump whose hash is off the ed25519 curve. */
export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const program = publicKey(programId)
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(concat([...seeds, Uint8Array.of(bump), program, encoder.encode('ProgramDerivedAddress')]))
    if (!isOnCurve(hash)) return base58.encode(hash)
  }
  throw new Error('Adresse dérivée introuvable.')
}

/** Associated token account of a wallet for a mint (where wallets keep their USDC). */
export function associatedTokenAddress(owner: string, mint: string): string {
  return findProgramAddress([publicKey(owner), publicKey(TOKEN_PROGRAM), publicKey(mint)], ASSOCIATED_TOKEN_PROGRAM)
}

function u64(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, value, true)
  return out
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

function compactU16(value: number): Uint8Array {
  const out: number[] = []
  let rest = value
  for (;;) {
    const byte = rest & 0x7f
    rest >>= 7
    if (rest === 0) {
      out.push(byte)
      return Uint8Array.from(out)
    }
    out.push(byte | 0x80)
  }
}

/** The instructions of a subscription payment, in the order Solana Pay wallets use. */
export function paymentInstructions(p: PaymentRequest): Instruction[] {
  const source = associatedTokenAddress(p.payer, p.mint)
  const destination = associatedTokenAddress(p.recipient, p.mint)
  const ro = (pubkey: string, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false })
  const rw = (pubkey: string, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true })
  return [
    // A small priority fee (≈ 0.0000016 SOL) so the payment lands quickly even when the network is busy.
    { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat([Uint8Array.of(2), u32(80_000)]) },
    { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat([Uint8Array.of(3), u64(20_000n)]) },
    // Creates the platform's USDC account only if it does not exist yet (no-op otherwise).
    {
      programId: ASSOCIATED_TOKEN_PROGRAM,
      keys: [rw(p.payer, true), rw(destination), ro(p.recipient), ro(p.mint), ro(SYSTEM_PROGRAM), ro(TOKEN_PROGRAM)],
      data: Uint8Array.of(1),
    },
    { programId: MEMO_PROGRAM, keys: [], data: encoder.encode(p.memo) },
    // transferChecked: the amount, the mint and its decimals are all checked by the token program.
    {
      programId: TOKEN_PROGRAM,
      keys: [rw(source), ro(p.mint), rw(destination), ro(p.payer, true), ro(p.reference)],
      data: concat([Uint8Array.of(12), u64(BigInt(p.amountAtomic)), Uint8Array.of(p.decimals)]),
    },
  ]
}

/** Unsigned legacy transaction: the fee payer signs first, then the other signers, as the runtime expects. */
export function serializeTransaction(feePayer: string, blockhash: string, instructions: Instruction[]): Uint8Array {
  const metas = new Map<string, AccountMeta>([[feePayer, { pubkey: feePayer, isSigner: true, isWritable: true }]])
  const add = (m: AccountMeta): void => {
    const known = metas.get(m.pubkey)
    metas.set(m.pubkey, known ? { ...known, isSigner: known.isSigner || m.isSigner, isWritable: known.isWritable || m.isWritable } : { ...m })
  }
  for (const ix of instructions) {
    ix.keys.forEach(add)
    add({ pubkey: ix.programId, isSigner: false, isWritable: false })
  }
  const rank = (m: AccountMeta): number => (m.pubkey === feePayer ? -1 : (m.isSigner ? 0 : 2) + (m.isWritable ? 0 : 1))
  const keys = [...metas.values()].sort((a, b) => rank(a) - rank(b))
  const index = new Map(keys.map((k, i) => [k.pubkey, i]))
  const signers = keys.filter((k) => k.isSigner)
  const header = Uint8Array.of(
    signers.length,
    signers.filter((k) => !k.isWritable).length,
    keys.filter((k) => !k.isSigner && !k.isWritable).length,
  )
  const message = concat([
    header,
    compactU16(keys.length),
    ...keys.map((k) => publicKey(k.pubkey)),
    publicKey(blockhash),
    compactU16(instructions.length),
    ...instructions.map((ix) =>
      concat([
        Uint8Array.of(index.get(ix.programId) ?? 0),
        compactU16(ix.keys.length),
        Uint8Array.from(ix.keys.map((k) => index.get(k.pubkey) ?? 0)),
        compactU16(ix.data.length),
        ix.data,
      ]),
    ),
  ])
  return concat([compactU16(signers.length), new Uint8Array(64 * signers.length), message])
}

export function paymentTransaction(p: PaymentRequest): Uint8Array {
  return serializeTransaction(p.payer, p.blockhash, paymentInstructions(p))
}

export function encodeSignature(signature: Uint8Array): string {
  return base58.encode(signature)
}
