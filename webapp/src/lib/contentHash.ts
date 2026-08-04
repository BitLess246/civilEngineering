// ─────────────────────────────────────────────────────────────────────────
// CONTENT FINGERPRINTING — "has this document actually changed?"
//
// Extracted from `engine/soils/remoteStore.ts` when the project store needed
// the same answer. The rule is payload-agnostic, so it has one home; the
// alternative was a second copy that would drift from the first exactly when
// it mattered, which is the failure this file exists to prevent.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Stable JSON — keys sorted at every level, so two structurally equal values
 * hash the same regardless of the order their fields happened to be set.
 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`
}

/**
 * Content fingerprint (FNV-1a over the stable JSON, with the length appended).
 *
 * Change is detected by CONTENT, not by timestamp. A local store stamps
 * `savedAt` from the wall clock, so two saves inside one millisecond are
 * indistinguishable — and a genuine edit that collided with the previous stamp
 * would never be uploaded. Silent data loss is the one outcome a sync cannot
 * accept, and a hash removes the clock from the question entirely. It also
 * means a no-op save does not cause a pointless upload.
 *
 * Not cryptographic, and does not need to be: it detects accidental sameness,
 * not adversarial collisions. The length suffix is cheap insurance against the
 * 32-bit hash space, since a wrong "unchanged" is the expensive direction.
 */
export function contentHash(value: unknown): string {
  const s = stableStringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0') + ':' + s.length
}
