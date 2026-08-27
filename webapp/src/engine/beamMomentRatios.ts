// ─────────────────────────────────────────────────────────────────────────
// WHICH WAY THE HINGE FORMS
//
// A moment-frame beam is meant to yield in a controlled way at its ends, and
// the code fixes the SHAPE of its strength envelope so it cannot do anything
// else. Two rules, both about strength PROVIDED — not demand:
//
//   §418.6.3.2  SMF   Mn+ at a joint face ≥ ½ · Mn− at that same face.
//                     Mn+ and Mn− at ANY section ≥ ¼ · the largest Mn at
//                     either joint face.
//   §418.4.2.2  IMF   the same two, at ⅓ and ⅕.
//
// The first stops a beam that is heavily reinforced on top and token on the
// bottom: under reversal the sagging capacity has to be a real fraction of the
// hogging one, or the joint hinges one way and shatters the other. The second
// stops the curtailment from eating the middle of the beam away — a bar cut
// off too early leaves a section weaker than a quarter of the end, and the
// hinge relocates to wherever that is.
//
// Both are checked on the CAGE, cut at the stations that matter, because they
// are about the bars actually placed. A section design says what one face
// needed; only the cut says what both faces have — the bottom steel at a
// support is whatever ran through from midspan, and nothing in the section
// design knows that.
//
// Units: mm for the section, kN·m for the strengths.
// ─────────────────────────────────────────────────────────────────────────
import { concreteBeamMn } from './scwb'
import { cutBeam, type BeamSection, type CutInput } from './beamSection'

/** The two ratios a system imposes. */
export interface MomentRatioLimits {
  /** Mn+ at a joint face, as a fraction of Mn− there. */
  atFace: number
  /** Mn at any section, as a fraction of the largest Mn at either face. */
  along: number
  clause: string
}

export function momentRatioLimits(
  system: 'gravity' | 'imf' | 'smf',
): MomentRatioLimits | null {
  if (system === 'smf') return { atFace: 1 / 2, along: 1 / 4, clause: '§418.6.3.2' }
  if (system === 'imf') return { atFace: 1 / 3, along: 1 / 5, clause: '§418.4.2.2' }
  return null                                   // a gravity beam has no reversal rule
}

/** The strength a cut actually provides, each way. */
export interface SectionStrength {
  at: number
  label: string
  /** Hogging (top steel in tension) and sagging, kN·m. */
  MnNeg: number
  MnPos: number
  AsTop: number
  AsBot: number
}

const area = (dia: number) => (Math.PI / 4) * dia * dia

/**
 * Nominal strengths at a cut, from the bars the cut found.
 *
 * `d` is measured to the centroid of the steel in tension, so it follows the
 * bars rather than being assumed: a second layer at a support lowers the top
 * steel's lever arm, and that is exactly where the ratio is tightest.
 */
export function sectionStrength(s: BeamSection, fc: number, fy: number): SectionStrength {
  const bmm = s.b * 1000, hmm = s.h * 1000
  const face = (role: 'top' | 'bottom') => {
    const bars = s.bars.filter((x) => x.role === role)
    const As = bars.reduce((t, x) => t + area(x.dia), 0)
    if (As <= 0) return { As: 0, Mn: 0 }
    // centroid of that face's steel, as a depth from the compression face
    const cen = bars.reduce((t, x) => t + area(x.dia) * x.up * 1000, 0) / As
    const d = role === 'top' ? cen : hmm - cen
    return { As, Mn: concreteBeamMn(bmm, d, As, fc, fy) }
  }
  const top = face('top'), bot = face('bottom')
  return { at: s.at, label: s.label, MnNeg: top.Mn, MnPos: bot.Mn, AsTop: top.As, AsBot: bot.As }
}

/** One clause, at one place, with the numbers that settled it. */
export interface RatioCheck {
  rule: 'at-face' | 'along'
  where: string
  provided: number
  required: number
  ok: boolean
}

export interface BeamMomentRatios {
  system: 'gravity' | 'imf' | 'smf'
  clause: string
  /** The stations the check was made at. */
  stations: SectionStrength[]
  checks: RatioCheck[]
  ok: boolean
  /** Absent when the system imposes no ratio — a gravity beam. */
  applies: boolean
}

/**
 * Check a span's strength envelope.
 *
 * `faces` are the two support faces in the same coordinate the cut takes; the
 * sections between them are sampled, because the "any section" rule is not
 * about midspan — it is about wherever the curtailment leaves the beam
 * weakest, which is just past a cut-off point.
 */
export function beamMomentRatios(
  cut: CutInput, u0: number, u1: number,
  fc: number, fy: number,
  system: 'gravity' | 'imf' | 'smf',
  samples = 12,
): BeamMomentRatios {
  const lim = momentRatioLimits(system)
  if (!lim || !(u1 > u0)) {
    return { system, clause: lim?.clause ?? '', stations: [], checks: [], ok: true, applies: false }
  }
  const eps = Math.min(0.02, (u1 - u0) / 40)
  const at = (x: number, label: string) => sectionStrength(cutBeam(cut, x, label), fc, fy)
  const faceI = at(u0 + eps, 'face i')
  const faceJ = at(u1 - eps, 'face j')
  const inner: SectionStrength[] = []
  for (let k = 1; k < samples; k++) {
    const x = u0 + ((u1 - u0) * k) / samples
    inner.push(at(x, `x = ${x.toFixed(2)} m`))
  }
  const stations = [faceI, ...inner, faceJ]

  const checks: RatioCheck[] = []
  // §…3.2 / §…2.2 first sentence — at EACH joint face.
  for (const f of [faceI, faceJ]) {
    checks.push({
      rule: 'at-face', where: f.label,
      provided: f.MnPos, required: lim.atFace * f.MnNeg,
      ok: f.MnPos >= lim.atFace * f.MnNeg - 1e-9,
    })
  }
  // …second sentence — at ANY section, against the larger END strength. The
  // maximum is over BOTH faces and BOTH senses: "the maximum moment strength
  // provided at face of either joint".
  const peak = Math.max(faceI.MnNeg, faceI.MnPos, faceJ.MnNeg, faceJ.MnPos)
  const floor = lim.along * peak
  for (const s of stations) {
    for (const [sense, Mn] of [['−', s.MnNeg], ['+', s.MnPos]] as const) {
      checks.push({
        rule: 'along', where: `${s.label} (Mn${sense})`,
        provided: Mn, required: floor, ok: Mn >= floor - 1e-9,
      })
    }
  }
  return {
    system, clause: lim.clause, stations, checks,
    ok: checks.every((c) => c.ok), applies: true,
  }
}
