// Pure helpers for syncing the site's browser data with a Byhnex account.
// Must match SYNC_KEYS in api/src/app.php.
export const SYNC_KEYS = [
  'cryptonite-v1', 'crypto-portfolio-v1', 'byhnex-reserve-eur', 'byhnex-favorites',
  'byhnex-devise', 'byhnex-bot-prefs-v1', 'byhnex-bot-mode-v1'
];

// FNV-1a: a short fingerprint of each value at the last sync, so the base copy costs no storage.
export function fingerprint(value) {
  if (value === null || value === undefined) return null;
  let h = 0x811c9dc5;
  const s = String(value);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + ':' + s.length;
}

export function snapshot(storage) {
  return Object.fromEntries(SYNC_KEYS.map(k => [k, storage.getItem(k)]));
}

export function fingerprints(data) {
  return Object.fromEntries(SYNC_KEYS.map(k => [k, fingerprint(data?.[k] ?? null)]));
}

export function hasData(data) {
  return SYNC_KEYS.some(k => data?.[k] !== null && data?.[k] !== undefined);
}

// Three-way merge per key. base holds fingerprints from the last sync (empty on a new device).
// A key changed on one side only takes that side; changed on both, the device wins (latest action).
export function merge({base = {}, local, server}) {
  const result = {}, conflicts = [];
  let pushNeeded = false, localChanged = false;
  for (const k of SYNC_KEYS) {
    const l = local?.[k] ?? null, s = server?.[k] ?? null, b = base[k];
    const lf = fingerprint(l), sf = fingerprint(s);
    let value;
    if (lf === sf) value = l;
    else if (b === undefined) { value = s ?? l; if (s !== null && l !== null) conflicts.push(k); }
    else if (lf === b) value = s;
    else if (sf === b) value = l;
    else { value = l; conflicts.push(k); }
    result[k] = value;
    if (fingerprint(value) !== sf) pushNeeded = true;
    if (fingerprint(value) !== lf) localChanged = true;
  }
  return {result, pushNeeded, localChanged, conflicts};
}

export function apply(storage, data) {
  for (const k of SYNC_KEYS) {
    const v = data?.[k] ?? null;
    if (v === null) storage.removeItem(k); else storage.setItem(k, v);
  }
}
