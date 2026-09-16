// ─────────────────────────────────────────────────────────────────────────
// LATERAL CASE PREVIEW — which earthquake or wind case the model is showing.
//
// `buildECases` expands the seismic base pattern into dirs × ±0.3·perpendicular
// (§208.8.1) × ⟳/⟲ accidental torsion (§208.7.2.7) — up to SIXTEEN cat-E cases
// — and `generateW` yields up to four cat-W cases. The design envelope solves
// every one of them. The viewport, however, only ever drew `model.loads`, and
// `commitECases` / `generateW` commit the PRIMARY direction alone. So fifteen
// of the sixteen cases the design is governed by were never drawn anywhere:
// the ±0.3 orthogonal pairs, both torsion senses, and every direction after
// the first.
//
// This module is the pure half of showing them. It decides WHICH loads are
// drawn for a chosen case and at WHAT scale, and it never mutates the model —
// a preview that committed itself would silently change the case the drift
// check and the report are based on.
//
// Units: node forces kN.
// ─────────────────────────────────────────────────────────────────────────
import type { ModelLoad, StructuralModel } from '../engine/model'
import type { LateralCase } from '../engine/pipeline'

/** The pieces of a case name, for a legend that can say what it is showing. */
export interface CaseParts {
  kind: 'E' | 'W'
  /** Primary direction, e.g. `+X`. */
  dir: string
  /** §208.8.1 orthogonal component, e.g. `+0.3Z`, or null when off. */
  orth: string | null
  /** §208.7.2.7 accidental-torsion sense, or null when off. */
  torsion: '⟳' | '⟲' | null
}

/**
 * Take a case name apart.
 *
 * The names are built by `buildECases` as `E` + dir + orth-tag + torsion glyph,
 * e.g. `E+X−0.3Z⟲`. Note the two different minus signs: the direction carries
 * an ASCII hyphen and the orthogonal tag a Unicode MINUS SIGN (U+2212), because
 * they are produced by different pieces of code. Both are accepted here rather
 * than normalised at the source — the names are already in saved projects.
 */
export function parseCase(name: string): CaseParts | null {
  const m = /^([EW])([+-])([XZ])(?:([+−-])0\.3([XZ]))?([⟳⟲])?$/.exec(name)
  if (!m) return null
  const [, kind, dSign, dAxis, oSign, oAxis, tor] = m
  return {
    kind: kind as 'E' | 'W',
    dir: `${dSign}${dAxis}`,
    orth: oAxis ? `${oSign === '+' ? '+' : '−'}0.3${oAxis}` : null,
    torsion: (tor as '⟳' | '⟲' | undefined) ?? null,
  }
}

/**
 * What this case IS, in words, with the clause that asks for it.
 *
 * The glyphs alone are not self-explanatory — `E+X−0.3Z⟲` is unreadable unless
 * you already know the expansion, and someone who already knows it is not the
 * person who needs the picture.
 */
export function describeCase(name: string): string {
  const p = parseCase(name)
  if (!p) return name
  const what = p.kind === 'E' ? 'Seismic' : 'Wind'
  const bits = [`${what} acting along ${p.dir}`]
  if (p.orth) bits.push(`with ${p.orth} of the perpendicular direction (§208.8.1, 100%+30%)`)
  if (p.torsion) {
    bits.push(`and the accidental 5% eccentricity applied ${
      p.torsion === '⟳' ? 'clockwise' : 'anticlockwise'} (§208.7.2.7)`)
  }
  return `${bits.join(' ')}.`
}

/**
 * The largest node-force magnitude across ALL the cases, for arrow scaling.
 *
 * This is the whole reason the scale is computed here rather than inside the
 * drawing code. `Loads3D` normalises arrow length against the largest force it
 * is given, so a case drawn on its own always renders with its peak arrow at
 * full length — and a ±0.3 orthogonal case, whose entire point is that it is
 * 30% of the primary, would look EXACTLY like the primary. Stepping through the
 * cases would then show sixteen identical pictures of a structure whose cases
 * differ by a factor of three.
 *
 * It makes the differences DIRECTIONALLY true, not proportional: `Loads3D`
 * maps a force onto 0.5–1.2 m, a floor that exists so a small load is still
 * drawable, so a 7× force ratio comes out as roughly 2× on screen. The numbers
 * beside the picture are what anyone reads a magnitude off.
 */
export function caseNodePeak(cases: readonly LateralCase[]): number {
  let peak = 0
  for (const c of cases) {
    for (const l of c.loads) {
      if (l.kind !== 'node') continue
      const m = Math.hypot(l.Fx ?? 0, l.Fy ?? 0, l.Fz ?? 0)
      if (m > peak) peak = m
    }
  }
  return peak
}

/**
 * The load set to DRAW for a chosen case — the model's own loads with every
 * lateral node load swapped for this case's.
 *
 * Both cat-E and cat-W node loads are stripped, not just the matching kind.
 * Earthquake and wind are ALTERNATIVE cases — no NSCP combination contains
 * both — so leaving the committed wind primary on screen under a previewed
 * seismic case would draw a loading the structure is never checked for.
 *
 * Gravity (D, L, and everything else) stays: it genuinely acts at the same
 * time, and it is what gives the lateral arrows something to be read against.
 *
 * Returns `model.loads` unchanged for a null case, so "no preview" is the
 * model as committed rather than a subtly different picture of it.
 */
export function caseLoads(model: StructuralModel, c: LateralCase | null): ModelLoad[] {
  if (!c) return model.loads
  const lateral = (l: ModelLoad) => l.kind === 'node' && (l.cat === 'E' || l.cat === 'W')
  return [...model.loads.filter((l) => !lateral(l)), ...c.loads]
}

/** Base shear of a case, per axis — the number the arrows add up to. */
export function caseBaseShear(c: LateralCase): { Fx: number; Fz: number } {
  let Fx = 0, Fz = 0
  for (const l of c.loads) {
    if (l.kind !== 'node') continue
    Fx += l.Fx ?? 0
    Fz += l.Fz ?? 0
  }
  return { Fx, Fz }
}
