import { describe, expect, it } from 'vitest'
import { SYNC_KEYS, apply, fingerprint, fingerprints, hasData, merge, snapshot, type StorageLike } from '@/account/sync-core'

function memory(init: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(init))
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  }
}

describe('sync-core', () => {
  it('fingerprints are stable and distinguish values', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'))
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'))
    expect(fingerprint(null)).toBeNull()
  })

  it('snapshot reads only the synced keys', () => {
    const s = snapshot(memory({ 'cryptonite-v1': '{"a":1}', 'byhnex-fx-cache': 'x' }))
    expect(Object.keys(s)).toEqual([...SYNC_KEYS])
    expect(s['cryptonite-v1']).toBe('{"a":1}')
    expect(s['byhnex-devise']).toBeNull()
  })

  it('merge takes the side that changed since the last sync', () => {
    const base = fingerprints({ 'cryptonite-v1': 'v1', 'byhnex-devise': 'EUR' })
    const r = merge({ base, local: { 'cryptonite-v1': 'v2', 'byhnex-devise': 'EUR' }, server: { 'cryptonite-v1': 'v1', 'byhnex-devise': 'USD' } })
    expect(r.result['cryptonite-v1']).toBe('v2')
    expect(r.result['byhnex-devise']).toBe('USD')
    expect(r).toMatchObject({ pushNeeded: true, localChanged: true, conflicts: [] })
  })

  it('merge keeps the device value when both sides changed the same key', () => {
    const base = fingerprints({ 'byhnex-favorites': '[]' })
    const r = merge({ base, local: { 'byhnex-favorites': '["a"]' }, server: { 'byhnex-favorites': '["b"]' } })
    expect(r.result['byhnex-favorites']).toBe('["a"]')
    expect(r.conflicts).toEqual(['byhnex-favorites'])
  })

  it('merge on a new device prefers the account and reports overlaps', () => {
    const r = merge({ local: { 'cryptonite-v1': 'device', 'byhnex-devise': 'EUR' }, server: { 'cryptonite-v1': 'account' } })
    expect(r.result['cryptonite-v1']).toBe('account')
    expect(r.result['byhnex-devise']).toBe('EUR')
    expect(r.conflicts).toEqual(['cryptonite-v1'])
    expect(r.pushNeeded).toBe(true)
  })

  it('merge reports nothing to do when both sides match', () => {
    const data = { 'cryptonite-v1': 'same' }
    expect(merge({ base: fingerprints(data), local: data, server: data })).toMatchObject({ pushNeeded: false, localChanged: false })
  })

  it('a key removed on the device is removed on the account', () => {
    const r = merge({ base: fingerprints({ 'byhnex-reserve-eur': '100' }), local: {}, server: { 'byhnex-reserve-eur': '100' } })
    expect(r.result['byhnex-reserve-eur']).toBeNull()
    expect(r.pushNeeded).toBe(true)
  })

  it('apply writes and removes keys; hasData detects content', () => {
    const s = memory({ 'byhnex-devise': 'EUR', 'byhnex-fx-cache': 'keep' })
    apply(s, { 'cryptonite-v1': 'x' })
    expect(s.getItem('cryptonite-v1')).toBe('x')
    expect(s.getItem('byhnex-devise')).toBeNull()
    expect(s.getItem('byhnex-fx-cache')).toBe('keep')
    expect(hasData({})).toBe(false)
    expect(hasData({ 'byhnex-devise': 'EUR' })).toBe(true)
  })
})
