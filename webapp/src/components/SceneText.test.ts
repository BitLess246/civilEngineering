// The bundled scene font is the ONLY thing keeping the 3D viewport off
// cdn.jsdelivr.net. A character the subset does not cover sends troika to the
// CDN, and a CDN that cannot be reached suspends that label forever — so the
// coverage of this file is a real invariant, not a nicety.
//
// We parse the TTF cmap out of the bytes Vite actually inlines, rather than
// trusting the pyftsubset command line recorded in a comment somewhere: the
// question is what the shipped font contains.

import { describe, it, expect } from 'vitest'
import { SCENE_FONT_REQUIRED } from './sceneFont'
import fontDataUrl from '../assets/fonts/DejaVuSans-scene.ttf?inline'

const FONT = (() => {
  const b64 = fontDataUrl.slice(fontDataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return new DataView(u8.buffer)
})()

const ascii = (v: DataView, at: number, len: number) =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(v.getUint8(at + i))).join('')

/** Code points a TrueType cmap maps to a non-zero glyph. Handles the two
 *  formats pyftsubset emits: 4 (BMP, segmented) and 12 (full range). */
function coveredCodePoints(v: DataView): Set<number> {
  const numTables = v.getUint16(4)
  let cmapOff = -1
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (ascii(v, rec, 4) === 'cmap') cmapOff = v.getUint32(rec + 8)
  }
  if (cmapOff < 0) throw new Error('no cmap table')

  // Prefer a Unicode subtable: (3,10) full repertoire, else (3,1) BMP.
  const nSub = v.getUint16(cmapOff + 2)
  let best = -1, bestScore = -1
  for (let i = 0; i < nSub; i++) {
    const rec = cmapOff + 4 + i * 8
    const plat = v.getUint16(rec), enc = v.getUint16(rec + 2)
    const score = plat === 3 && enc === 10 ? 3 : plat === 3 && enc === 1 ? 2 : plat === 0 ? 1 : 0
    if (score > bestScore) { bestScore = score; best = cmapOff + v.getUint32(rec + 4) }
  }

  const out = new Set<number>()
  const format = v.getUint16(best)
  if (format === 4) {
    const segX2 = v.getUint16(best + 6)
    const ends = best + 14, starts = ends + segX2 + 2
    const deltas = starts + segX2, ranges = deltas + segX2
    for (let s = 0; s < segX2 / 2; s++) {
      const end = v.getUint16(ends + s * 2)
      const start = v.getUint16(starts + s * 2)
      const delta = v.getInt16(deltas + s * 2)
      const rangeOff = v.getUint16(ranges + s * 2)
      if (start === 0xffff) continue
      for (let c = start; c <= end; c++) {
        let g: number
        if (rangeOff === 0) g = (c + delta) & 0xffff
        else {
          const gi = ranges + s * 2 + rangeOff + (c - start) * 2
          if (gi + 1 >= v.byteLength) continue
          g = v.getUint16(gi)
          if (g !== 0) g = (g + delta) & 0xffff
        }
        if (g !== 0) out.add(c)
      }
    }
  } else if (format === 12) {
    const nGroups = v.getUint32(best + 12)
    for (let i = 0; i < nGroups; i++) {
      const g = best + 16 + i * 12
      const start = v.getUint32(g), end = v.getUint32(g + 4)
      for (let c = start; c <= end; c++) out.add(c)
    }
  } else {
    throw new Error(`unsupported cmap format ${format}`)
  }
  return out
}

describe('bundled scene font', () => {
  const covered = coveredCodePoints(FONT)

  it('covers every character SceneText promises to render locally', () => {
    const missing = [...SCENE_FONT_REQUIRED].filter((ch) => !covered.has(ch.codePointAt(0)!))
    // Named, so a failure says WHICH glyph to add to the pyftsubset run.
    expect(missing.map((c) => `${c} U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)).toEqual([])
  })

  it('stays small enough to ship in the bundle', () => {
    // A full DejaVu Sans is ~750 kB. If this balloons, the subset command has
    // lost its --unicodes filter.
    expect(FONT.byteLength).toBeLessThan(80_000)
  })

  it('is a real TrueType file, not a placeholder', () => {
    expect(FONT.getUint32(0)).toBe(0x00010000)
    expect(covered.size).toBeGreaterThan(SCENE_FONT_REQUIRED.length)
  })
})

// ── What the scenes actually ask for ──────────────────────────────────────
// The test above proves the font covers the characters we DECLARED. This one
// proves the scenes only ask for those: a `<SceneText>` holding a character
// outside the subset renders NOTHING — troika goes to the CDN, the fetch is
// blocked, and the per-label <Suspense> falls back to null forever. The label
// just is not there, with no error anywhere, which is close to undiagnosable
// from a screenshot. A `kN·m` label was shipped and lost exactly this way.
describe('scene labels stay inside the bundled subset', () => {
  const sources = import.meta.glob('../{components,pages}/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const covered = coveredCodePoints(FONT)

  /** Text nodes and `{`…`}` template children of a <SceneText> element. */
  function sceneStrings(src: string): string[] {
    const out: string[] = []
    const re = /<SceneText\b[^>]*>([\s\S]*?)<\/SceneText>/g
    for (let m = re.exec(src); m; m = re.exec(src)) {
      // Strip `${…}` holes — those are numbers and section names at runtime —
      // and JSX comment blocks, keeping the literal characters around them.
      out.push(m[1].replace(/\$\{[^}]*\}/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, ''))
    }
    return out
  }

  it('every literal character in a <SceneText> is in the bundled font', () => {
    const bad: string[] = []
    for (const [path, src] of Object.entries(sources)) {
      for (const s of sceneStrings(src)) {
        for (const ch of s) {
          const cp = ch.codePointAt(0)!
          if (cp === 0x0a || cp === 0x0d || cp === 0x09) continue          // layout whitespace
          if (ch === '`' || ch === '{' || ch === '}') continue             // template syntax
          if (!covered.has(cp)) {
            bad.push(`${path}: "${ch}" U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('finds the SceneText elements at all (the regex still matches)', () => {
    const total = Object.values(sources).reduce((n, s) => n + sceneStrings(s).length, 0)
    expect(total).toBeGreaterThan(5)
  })
})
