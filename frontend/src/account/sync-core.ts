// Pure helpers for syncing the site's browser data with a Byhnex account.
// SYNC_KEYS must match App\Sync\SyncKeys::KEYS in the backend (checked by a backend test).
export const SYNC_KEYS = [
  'cryptonite-v1', 'crypto-portfolio-v1', 'byhnex-reserve-eur', 'byhnex-favorites',
  'byhnex-devise', 'byhnex-bot-prefs-v1', 'byhnex-bot-mode-v1',
] as const

export type SyncKey = (typeof SYNC_KEYS)[number]
/** Raw localStorage values per key; null when the key is absent. */
export type SyncData = Partial<Record<SyncKey, string | null>>
export type Fingerprints = Partial<Record<SyncKey, string | null>>

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function isSyncKey(key: string): key is SyncKey {
  return (SYNC_KEYS as readonly string[]).includes(key)
}

/** FNV-1a: a short fingerprint of each value at the last sync, so the base copy costs no storage. */
export function fingerprint(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  let h = 0x811c9dc5
  const s = String(value)
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36) + ':' + s.length
}

export function snapshot(storage: Pick<StorageLike, 'getItem'>): Record<SyncKey, string | null> {
  return Object.fromEntries(SYNC_KEYS.map((k) => [k, storage.getItem(k)])) as Record<SyncKey, string | null>
}

export function fingerprints(data: SyncData | null | undefined): Fingerprints {
  return Object.fromEntries(SYNC_KEYS.map((k) => [k, fingerprint(data?.[k] ?? null)]))
}

export function hasData(data: SyncData | null | undefined): boolean {
  return SYNC_KEYS.some((k) => data?.[k] !== null && data?.[k] !== undefined)
}

export interface MergeResult {
  result: Record<SyncKey, string | null>
  pushNeeded: boolean
  localChanged: boolean
  conflicts: SyncKey[]
}

/**
 * Three-way merge per key. base holds fingerprints from the last sync (empty on a new device).
 * A key changed on one side only takes that side; changed on both, the device wins (latest action).
 */
export function merge({ base = {}, local, server }: { base?: Fingerprints; local: SyncData; server: SyncData }): MergeResult {
  const result = {} as Record<SyncKey, string | null>
  const conflicts: SyncKey[] = []
  let pushNeeded = false
  let localChanged = false
  for (const k of SYNC_KEYS) {
    const l = local[k] ?? null
    const s = server[k] ?? null
    const b = base[k]
    const lf = fingerprint(l)
    const sf = fingerprint(s)
    let value: string | null
    if (lf === sf) value = l
    else if (b === undefined) {
      value = s ?? l
      if (s !== null && l !== null) conflicts.push(k)
    } else if (lf === b) value = s
    else if (sf === b) value = l
    else {
      value = l
      conflicts.push(k)
    }
    result[k] = value
    if (fingerprint(value) !== sf) pushNeeded = true
    if (fingerprint(value) !== lf) localChanged = true
  }
  return { result, pushNeeded, localChanged, conflicts }
}

export function apply(storage: StorageLike, data: SyncData | null | undefined): void {
  for (const k of SYNC_KEYS) {
    const v = data?.[k] ?? null
    if (v === null) storage.removeItem(k)
    else storage.setItem(k, v)
  }
}
