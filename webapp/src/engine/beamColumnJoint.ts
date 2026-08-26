// ─────────────────────────────────────────────────────────────────────────
// BEAM–COLUMN JOINT — NSCP 2015 §418.8 (ACI 318-14 §18.8), and the two-view
// detail sheet the joint is built from.
//
// The joint is the piece of the frame nothing else checks. The beam sheet
// designs the beam, the column sheet designs the column, and the block of
// concrete where they cross carries the forces of both.
//
// §418.8.2 splits into two cases, and CONFLATING THEM IS THE EASY MISTAKE —
// this module made it and was corrected in review:
//
//   §418.8.2.3  "Where longitudinal beam reinforcement EXTENDS THROUGH a
//               beam-column joint", the column dimension parallel to that
//               reinforcement shall be at least 20db (26db lightweight). It is
//               a bond/slip rule: a bar passing through is pulled one way on
//               one face and pushed the other way on the other, and it needs
//               that much joint to do it. A bar that STOPS in the joint is not
//               doing that, so the rule does not reach it.
//   §418.8.2.2  Beam reinforcement TERMINATED in a column shall extend to the
//               far face of the confined core and be developed in tension per
//               §418.8.5. That — not 20db — is what governs a hooked bar.
//
// So the two checks are asked separately, per direction, of whichever bars are
// actually doing that thing. A ⌀28 bar hooked into a 400 mm column may well
// fail its anchorage; it does not fail the 20db rule, because it never passes
// through. The bars that DO pass through may be the spandrel's, in which case
// 20db is measured against the column dimension parallel to THEM.
//
// The rest:
//
//   §418.8.4    the joint has its own shear strength, φVn = φ·γ·λ·√f'c·Aj, and
//               its own demand — from the FREE BODY of the joint, with the beam
//               steel stressed to 1.25fy (§418.8.2.1). See `JointForces`.
//   §418.8.3    column confinement hoops CONTINUE through the joint. Where four
//               beams frame in and each is at least ¾ the column width the
//               amount may be halved, at up to 150 mm.
//   §418.8.5.1  ℓdh = fy·db / (5.4·λ·√f'c) — shorter than the §425.4.3 hook
//               because the joint core is confined, floored at 8db and 150 mm.
//
// Nothing here re-designs the beam or the column: it takes what those two
// designed and checks the block they share.
//
// Units: sections mm; forces kN; stresses MPa; drawing geometry m.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, Drawing } from './planRenderer'
import { hookClearToFace, hookEmbedmentAvailable } from './devLength'
import { GLYPH_W, wrapNote, measureBounds, notesBlock, titleBlock, leader } from './detailSheet'
import { seeGeneralNotes } from './generalNotes'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, SHEET_WARN, STEEL } from './sheetInk'

// ── code constants ─────────────────────────────────────────────────────────

/** How the joint is confined by the beams framing into it — Table 418.8.4.3. */
export type JointConfinement = 'four-faces' | 'three-faces' | 'two-opposite' | 'other'

/** γ in Vn = γ·λ·√f'c·Aj, SI (MPa, mm²) — Table 418.8.4.3. */
export const JOINT_GAMMA: Record<JointConfinement, number> = {
  'four-faces': 1.7,
  'three-faces': 1.2,
  'two-opposite': 1.2,
  'other': 1.0,
}

/** §421.2.4.3 — φ for shear in a joint. NOT the 0.75 used for member shear. */
export const PHI_JOINT = 0.85
/** §418.8.2.3 — joint dimension parallel to bars PASSING THROUGH, in bar dias. */
export const THROUGH_BAR_DIAS = 20
/** §418.8.2.3 — the same rule for lightweight concrete. */
export const THROUGH_BAR_DIAS_LIGHTWEIGHT = 26
/** §418.8.2.1 — beam steel is taken at this multiple of fy at a joint. */
export const PROBABLE_FY = 1.25
/** §418.8.3.2 — hoop spacing allowed through a joint confined on four faces. */
export const JOINT_HOOP_SPACING_MAX = 150

const area = (d: number) => (Math.PI / 4) * d * d

// ── the checks ─────────────────────────────────────────────────────────────

/**
 * Effective joint width b_j, mm — §418.8.4.3 via §415.4.2.
 *
 * The lesser of the beam width plus the joint depth and the beam width plus
 * twice the distance from the beam's axis to the column side, and never more
 * than the column width. The middle term is the one that bites on an ECCENTRIC
 * beam: a beam pushed to one face of the column cannot mobilise the far side.
 */
export function effectiveJointWidth(beamB: number, colB: number, colH: number, eccentricity = 0): number {
  const x = Math.max(colB / 2 - Math.abs(eccentricity), 0)   // beam axis → nearer column side
  return Math.min(beamB + colH, beamB + 2 * x, colB)
}

/**
 * Development length of a beam bar hooked into a joint, mm — §418.8.5.1.
 *
 *   ℓdh = fy·db / (5.4·λ·√f'c),  not less than 8db or 150 mm
 *
 * This is the SEISMIC hook, and it is shorter than the §425.4.3 one because the
 * joint core is confined by hoops. Using the general clause here would be
 * conservative; using this one anywhere else would not be.
 */
export function jointHookLdh(db: number, fy: number, fc: number, lambda = 1): number {
  const raw = (fy * db) / (5.4 * lambda * Math.sqrt(Math.max(fc, 1)))
  return Math.max(raw, 8 * db, 150)
}

/** §418.8.2.3 applied to ONE direction — and only to bars that pass through. */
export interface ThroughBarCheck {
  /** These bars extend THROUGH the joint, so §418.8.2.3 reaches them. */
  applies: boolean
  /** Largest bar diameter passing through in this direction, mm. */
  dia: number
  /** The column dimension PARALLEL to those bars, mm. */
  provided: number
  /** 20db, or 26db in lightweight concrete, mm. */
  required: number
  ok: boolean
}

/**
 * §418.8.2.3 for one direction.
 *
 * `applies` is the whole point: the rule is conditioned on the bars extending
 * through the joint. Asked of bars that terminate in it, the answer is "not
 * this rule" — not "fail".
 */
export function throughBarCheck(through: boolean, dia: number, provided: number, lambda = 1): ThroughBarCheck {
  const factor = lambda < 1 ? THROUGH_BAR_DIAS_LIGHTWEIGHT : THROUGH_BAR_DIAS
  const required = factor * Math.max(dia, 0)
  return {
    applies: through && dia > 0,
    dia, provided, required,
    ok: !through || dia <= 0 || provided >= required - 1e-9,
  }
}

/**
 * The free body of the joint — §418.8.2.1 with §418.8.4.
 *
 * The demand is NOT "1.25·fy·As". It is the horizontal equilibrium of the block:
 * the beam steel entering it is stressed to 1.25fy (§418.8.2.1), and the joint
 * shear is what is left once the column shear is taken off.
 *
 *   Vu = T + C − Vcol
 *
 * At an INTERIOR joint the far beam's flexural couple pushes on the same face
 * that the near beam's top steel pulls, and C equals that beam's own bar
 * tension by section equilibrium — so the two add. At an EXTERIOR joint there
 * is no far beam and C is zero.
 */
export interface JointForces {
  /** Tension from the near beam's top steel at 1.25fy, kN. */
  T: number
  /** Compression delivered by the far beam, kN — zero at an exterior joint. */
  C: number
  /** Column shear acting against them, kN. */
  Vcol: number
  /** Vu = T + C − Vcol, floored at zero. */
  Vu: number
}

export function jointForces(
  AsTop: number, AsBot: number, fy: number, interior: boolean, Vcol = 0,
): JointForces {
  const T = (PROBABLE_FY * fy * AsTop) / 1000
  const C = interior ? (PROBABLE_FY * fy * AsBot) / 1000 : 0
  const V = Math.max(Vcol, 0)
  return { T, C, Vcol: V, Vu: Math.max(T + C - V, 0) }
}

export interface BeamColumnJointInput {
  mark?: string
  /** Column width (perpendicular to the beam) and depth (parallel to it), mm. */
  colB: number
  colH: number
  /** Column longitudinal bars and the hoop set. */
  colBarDia: number
  colBars: number
  hoopDia: number
  /** Column hoop spacing in the confinement zone, mm — what continues through. */
  hoopSpacing: number
  /** The beam framing in: width, overall depth, bar Ø, and the bar counts. */
  beamB: number
  beamH: number
  beamBarDia: number
  topBars: number
  botBars: number
  /** Beams frame in from BOTH sides in the direction of the shear. */
  interior?: boolean
  /**
   * The beam's longitudinal bars EXTEND THROUGH the joint rather than
   * terminating in it. Defaults to `interior`: a beam continuing past the
   * column runs its bars through, one that stops there hooks them.
   *
   * This is the flag §418.8.2.3 turns on. Getting it wrong is how a hooked bar
   * comes to "fail" a rule written for a different bar.
   */
  barsThrough?: boolean
  /** Largest bar of the PERPENDICULAR (spandrel) beam, mm, and whether ITS bars
   *  pass through — then §418.8.2.3 is measured against `colB`. */
  spandrelBarDia?: number
  spandrelThrough?: boolean
  /** Confinement class for γ — Table 418.8.4.3. */
  confinement?: JointConfinement
  /** Every framing beam covers ≥ ¾ of the column width (§418.8.3.2). */
  wideBeams?: boolean
  /** Column shear from the analysis, kN — part of the joint free body. */
  Vcol?: number
  /** Beam axis offset from the column centreline, mm. */
  eccentricity?: number
  fc?: number
  fy?: number
  lambda?: number
  /** Clear cover to the hoop, mm (default 40). */
  cover?: number
}

export interface BeamColumnJointResult {
  gamma: number
  /** Effective joint width and area — §418.8.4.3. */
  bj: number
  Aj: number
  /** Nominal and design joint shear, kN. */
  Vn: number
  phiVn: number
  /** The free body the demand comes from — §418.8.2.1. */
  forces: JointForces
  /** Vu from that free body, kN. */
  Vu: number
  shearOK: boolean
  /** §418.8.2.3, asked separately of each direction's THROUGH bars. */
  through: { main: ThroughBarCheck; spandrel: ThroughBarCheck }
  /** The near beam's bars terminate in the joint — §418.8.2.2 / §418.8.5. */
  terminated: boolean
  /** §418.8.5.1 hook, with the values it was computed from. */
  ldh: number
  ldhInputs: { db: number; fy: number; fc: number; lambda: number }
  /** Straight embedment available inside the confined core, mm —
   *  colH − cover − hoop Ø − column bar Ø. */
  ldhAvail: number
  /** Clear from the far FACE to the outside of the bend, mm — cover + hoop +
   *  column bar. The drawing places the hook here and the notes quote it, so
   *  neither can drift from the other or from `ldhAvail`. */
  ldhClear: number
  ldhFits: boolean
  /** 12db hook tail, §425.3.1. */
  hookTail: number
  /** Hoop spacing to detail through the joint, mm, and whether §418.8.3.2's
   *  relaxation was available. */
  jointHoopSpacing: number
  halvedHoops: boolean
  ok: boolean
  notes: string[]
}

/**
 * Check the joint the beam and the column share.
 *
 * Each rule is asked of the bars it was written for: §418.8.2.3 of whatever
 * passes THROUGH (in either direction, against the column dimension parallel to
 * it), §418.8.2.2 / §418.8.5.1 of whatever TERMINATES, and §418.8.4 of the
 * whole free body.
 */
export function designBeamColumnJoint(i: BeamColumnJointInput): BeamColumnJointResult {
  const notes: string[] = []
  const fc = i.fc ?? 21, fy = i.fy ?? 415, lambda = i.lambda ?? 1
  const cover = i.cover ?? 40
  const confinement = i.confinement ?? 'other'
  const gamma = JOINT_GAMMA[confinement]

  const bj = effectiveJointWidth(i.beamB, i.colB, i.colH, i.eccentricity ?? 0)
  const Aj = bj * i.colH
  const Vn = (gamma * lambda * Math.sqrt(Math.max(fc, 1)) * Aj) / 1000        // kN
  const phiVn = PHI_JOINT * Vn

  const forces = jointForces(
    i.topBars * area(i.beamBarDia), i.botBars * area(i.beamBarDia),
    fy, !!i.interior, i.Vcol ?? 0,
  )
  const shearOK = forces.Vu <= phiVn + 1e-9

  // §418.8.2.3 — per direction, and only for bars that actually pass through.
  // A beam that continues past the column runs its bars through; one that stops
  // there terminates them, and this rule is not about those.
  const barsThrough = i.barsThrough ?? !!i.interior
  const main = throughBarCheck(barsThrough, i.beamBarDia, i.colH, lambda)
  const spandrel = throughBarCheck(!!i.spandrelThrough, i.spandrelBarDia ?? 0, i.colB, lambda)
  const terminated = !barsThrough

  // §418.8.2.2 / §418.8.5.1 — the terminated bars' anchorage.
  const ldh = jointHookLdh(i.beamBarDia, fy, fc, lambda)
  // The hook turns DOWN inside the far-face column longitudinals, so the depth
  // it can occupy is the core less that bar. Shared with the §425.4.3 hook on
  // the dev-length page — one formula, so the joint sheet and that page cannot
  // quote different room for the same bar in the same column.
  const ldhClear = hookClearToFace(cover, i.hoopDia, i.colBarDia)
  const ldhAvail = hookEmbedmentAvailable(i.colH, cover, i.hoopDia, i.colBarDia)
  const ldhFits = !terminated || ldh <= ldhAvail + 1e-9
  const hookTail = 12 * i.beamBarDia

  // §418.8.3.2 — four beams, each ≥ ¾ the column width: half the hoops, ≤150.
  const halvedHoops = confinement === 'four-faces' && !!i.wideBeams
  const jointHoopSpacing = halvedHoops
    ? Math.min(JOINT_HOOP_SPACING_MAX, 2 * i.hoopSpacing)
    : i.hoopSpacing

  if (main.applies && !main.ok) {
    notes.push(`⌀${Math.round(main.dia)} beam bars pass THROUGH the joint, so §418.8.2.3 needs a column depth of ${Math.round(main.required)} mm parallel to them — ${Math.round(main.provided)} mm provided`)
  }
  if (spandrel.applies && !spandrel.ok) {
    notes.push(`the spandrel's ⌀${Math.round(spandrel.dia)} bars pass THROUGH the joint, so §418.8.2.3 needs ${Math.round(spandrel.required)} mm of column WIDTH parallel to them — ${Math.round(spandrel.provided)} mm provided`)
  }
  if (terminated && !ldhFits) {
    notes.push(`ℓdh ${Math.round(ldh)} mm = ${fy}(${Math.round(i.beamBarDia)}) / (5.4·${lambda.toFixed(2)}·√${fc}) does not fit the ${Math.round(ldhAvail)} mm available inside the confined core — the terminated bars cannot be developed in this joint (§418.8.2.2 / §418.8.5.1)`)
  }
  if (!shearOK) {
    notes.push(`joint shear Vu ${Math.round(forces.Vu)} kN = T ${Math.round(forces.T)} + C ${Math.round(forces.C)} − Vcol ${Math.round(forces.Vcol)} exceeds φVn ${Math.round(phiVn)} kN (γ = ${gamma.toFixed(1)}, §418.8.4.3) — enlarge the joint or frame more beams into it`)
  }
  if (confinement === 'other') {
    notes.push(`γ = 1.0: the joint is not confined by beams on three or four faces, which is the lowest strength Table 418.8.4.3 allows`)
  }

  return {
    gamma, bj, Aj, Vn, phiVn,
    forces, Vu: forces.Vu, shearOK,
    through: { main, spandrel }, terminated,
    ldh, ldhInputs: { db: i.beamBarDia, fy, fc, lambda }, ldhAvail, ldhClear, ldhFits, hookTail,
    jointHoopSpacing, halvedHoops,
    ok: shearOK && main.ok && spandrel.ok && ldhFits,
    notes,
  }
}


// ── the sheet ──────────────────────────────────────────────────────────────

export interface JointDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface JointDetailDrawing extends Drawing {
  title: string
  result: BeamColumnJointResult
  /** The checks, for the engineer. Not printed on the sheet — see `beamDetail`
   *  for why a design result under a detail is a note nobody can act on. */
  designNotes: string[]
}

const INK = SHEET_INK, REBAR = STEEL, GRID = SHEET_GRID, NOTE = SHEET_NOTE, WARN = SHEET_WARN
const CONC = '#f1f5f9'

/** Wrap a note to `max` characters a line. */

/**
 * Build the two-view joint sheet: VERTICAL SECTION Y-Y over PLAN SECTION X-X.
 *
 * Two views because one cannot carry it. The elevation shows the hooks and the
 * hoops through the joint; only the plan shows that the beam bars pass INSIDE
 * the column bars and how the spandrel crosses them, which is what decides
 * whether the cage can actually be built.
 *
 * The sheet's y runs DOWN (the serializer's convention), so the vertical
 * section is laid out first and the plan below it.
 */
export function buildBeamColumnJointDetail(i: BeamColumnJointInput, opts: JointDetailOptions = {}): JointDetailDrawing {
  const r = designBeamColumnJoint(i)
  const P: PlanPrimitive[] = []
  const cb = Math.max(i.colB, 100) / 1000, ch = Math.max(i.colH, 100) / 1000
  const bb = Math.max(i.beamB, 80) / 1000, bh = Math.max(i.beamH, 100) / 1000
  const cov = Math.min((i.cover ?? 40) / 1000, ch / 6)
  const mark = i.mark ?? 'J1'
  const u = Math.max(ch, bh) / 9                       // one text unit
  const beamRun = Math.max(ch * 2.4, 1.0)              // how much beam is drawn
  const colRun = Math.max(bh * 1.6, 0.9)               // how much column is drawn

  // ═══ VIEW 1 — VERTICAL SECTION Y-Y ═══════════════════════════════════════
  // Column vertical, beam framing in from the right. Origin at the joint's
  // top-left corner; y increases DOWN.
  const jx = 0, jy = 0                                  // joint top-left
  P.push({ kind: 'text', x: jx + ch / 2, y: jy - colRun - u * 2.2, text: 'VERTICAL SECTION Y-Y', size: u * 1.5, anchor: 'middle', color: INK, weight: 700 })

  // column above and below the joint, and the joint block itself
  P.push({ kind: 'rect', x: jx, y: jy - colRun, w: ch, h: colRun, stroke: INK, width: 1.2, fill: CONC })
  P.push({ kind: 'rect', x: jx, y: jy + bh, w: ch, h: colRun, stroke: INK, width: 1.2, fill: CONC })
  P.push({ kind: 'rect', x: jx, y: jy, w: ch, h: bh, stroke: INK, width: 1.4, fill: '#e8eef5' })
  // the beam framing in from the right
  P.push({ kind: 'rect', x: jx + ch, y: jy, w: beamRun, h: bh, stroke: INK, width: 1.2, fill: CONC })
  // break lines where column and beam carry on
  const brk = (x0: number, y0: number, x1: number, y1: number) =>
    P.push({ kind: 'line', x1: x0, y1: y0, x2: x1, y2: y1, stroke: GRID, width: 0.9, dash: [u * 0.5, u * 0.4] })
  brk(jx - u * 0.3, jy - colRun, jx + ch + u * 0.3, jy - colRun)
  brk(jx - u * 0.3, jy + bh + colRun, jx + ch + u * 0.3, jy + bh + colRun)
  brk(jx + ch + beamRun, jy - u * 0.3, jx + ch + beamRun, jy + bh + u * 0.3)

  // column bars, both faces, running the full height
  for (const x of [jx + cov, jx + ch - cov]) {
    P.push({ kind: 'line', x1: x, y1: jy - colRun, x2: x, y2: jy + bh + colRun, stroke: REBAR, width: 1.5 })
  }
  // column hoops above and below, at the confinement spacing
  const sCol = Math.max(i.hoopSpacing, 40) / 1000
  for (const [y0, y1, dir] of [[jy - sCol / 2, jy - colRun, -1], [jy + bh + sCol / 2, jy + bh + colRun, 1]] as const) {
    for (let y = y0; dir < 0 ? y > y1 : y < y1; y += dir * sCol) {
      P.push({ kind: 'line', x1: jx + cov * 0.6, y1: y, x2: jx + ch - cov * 0.6, y2: y, stroke: REBAR, width: 0.8 })
    }
  }
  // JOINT hoops — the column confinement continuing THROUGH the joint
  const sJoint = Math.max(r.jointHoopSpacing, 40) / 1000
  const jointHoopYs: number[] = []
  for (let y = jy + sJoint / 2; y < jy + bh; y += sJoint) jointHoopYs.push(y)
  for (const y of jointHoopYs) {
    P.push({ kind: 'line', x1: jx + cov * 0.6, y1: y, x2: jx + ch - cov * 0.6, y2: y, stroke: REBAR, width: 1.0 })
  }
  // beam hoops along the drawn beam
  const sBeam = sJoint
  for (let x = jx + ch + sBeam / 2; x < jx + ch + beamRun; x += sBeam) {
    P.push({ kind: 'line', x1: x, y1: jy + cov * 0.6, x2: x, y2: jy + bh - cov * 0.6, stroke: REBAR, width: 0.8 })
  }

  // Beam top and bottom bars, hooked DOWN / UP into the confined core.
  //
  // The bend sits behind the far-face column vertical, inside the hoop — the
  // same place `hookEmbedmentAvailable` stops measuring, and the same place the
  // beam elevation draws it. This used to be `cov + 60`, which put the hook
  // 100 mm from the face under a note that said 60: the drawing disagreed with
  // its own annotation AND with the beam sheet for the same joint.
  const clear = r.ldhClear / 1000
  const hookX = jx + clear
  const tail = r.hookTail / 1000
  // Top and bottom hooks share an x in elevation, and in a shallow beam their
  // 12db tails pass each other. Drawn on the same line they merge into what
  // reads as a closed loop, so they are separated by a bar diameter — the usual
  // convention for two bars that coincide in view.
  const hookSep = i.beamBarDia / 1000
  for (const [yBar, dir, sx] of [
    [jy + cov, 1, 0],
    [jy + bh - cov, -1, hookSep],
  ] as const) {
    P.push(r.terminated
      // hooked: in to 60 mm clear of the far face, then turned into the core
      ? {
        kind: 'path', stroke: REBAR, width: 2.0, cap: 'round', join: 'round',
        cmds: [
          { c: 'M', x: jx + ch + beamRun * 0.96, y: yBar },
          { c: 'L', x: hookX + sx, y: yBar },
          { c: 'L', x: hookX + sx, y: yBar + dir * Math.min(tail, bh * 0.75) },
        ],
      }
      // through: straight out the far face, which is what §418.8.2.3 is about
      : {
        kind: 'path', stroke: REBAR, width: 2.0, cap: 'round',
        cmds: [
          { c: 'M', x: jx + ch + beamRun * 0.96, y: yBar },
          { c: 'L', x: jx - beamRun * 0.10, y: yBar },
        ],
      })
  }

  // ℓdh — measured from the column face the bar enters, into the joint.
  //
  // The hoops are BROKEN behind it. Run straight across the hoop band, the
  // dimension line, its ticks and its label all overprinted the very
  // reinforcement the sheet exists to draw, and the number became unreadable
  // exactly where it matters most.
  const ldhY = jy - u * 3.0
  if (r.terminated) {
    const ldhX = jx + ch - r.ldh / 1000
    const lo = Math.min(ldhX, jx + ch), hi = Math.max(ldhX, jx + ch)
    P.push({ kind: 'rect', x: lo - u * 0.5, y: ldhY - u * 1.2, w: hi - lo + u, h: u * 2.4, fill: '#fff' })
    P.push({
      kind: 'dim', x1: jx + ch, y1: ldhY, x2: ldhX, y2: ldhY,
      text: `ℓdh = ${Math.round(r.ldh)}`, off: 0, size: u * 1.1,
    })
    if (!r.ldhFits) {
      P.push({ kind: 'line', x1: ldhX, y1: ldhY, x2: ldhX, y2: jy + bh, stroke: WARN, width: 0.8, dash: [u * 0.4, u * 0.3] })
    }
  }
  // the two callouts image 3 turns on
  if (r.terminated) {
    P.push(...leader({
      x: hookX, y: jy + cov,
      tx: jx - u * 1.2, ty: jy + bh * 0.45,
      text: `${Math.round(clear * 1000)} CL. TO END OF HOOKS`, size: u * 1.05, side: 'right',
    }))
  }
  if (jointHoopYs.length) {
    P.push(...leader({
      x: jx + ch * 0.5, y: jointHoopYs[0],
      tx: jx + ch + beamRun * 0.47, ty: jy - u * 1.0,
      text: `JOINT HOOPS ⌀${Math.round(i.hoopDia)} @ ${Math.round(r.jointHoopSpacing)}`, size: u * 1.05, side: 'left',
    }))
  }
  // These two used to float unattached beside the drawing, which is the same
  // defect as a leaderless callout: a label that names nothing in particular.
  P.push(...leader({
    x: jx + ch + beamRun * 0.72, y: jy + bh * 0.5,
    tx: jx + ch + beamRun, ty: jy + bh + u * 1.6,
    text: `BEAM HOOPS`, size: u * 1.05, side: 'right',
  }))
  P.push(...leader({
    x: jx + ch * 0.5, y: jy - colRun * 0.42,
    tx: jx - u * 1.8, ty: jy - colRun * 0.55,
    text: `COLUMN HOOPS ⌀${Math.round(i.hoopDia)} @ ${Math.round(i.hoopSpacing)}`, size: u * 1.05, side: 'right',
  }))
  // the joint depth, which is the §418.8.2.3 dimension
  P.push({ kind: 'dim', x1: jx, y1: jy + bh + colRun + u * 1.6, x2: jx + ch, y2: jy + bh + colRun + u * 1.6, text: `h = ${Math.round(i.colH)}`, off: 0, size: u * 1.2, ext: jy + bh + colRun })

  // ═══ VIEW 2 — PLAN SECTION X-X ═══════════════════════════════════════════
  const spandrel = Math.max(bb * 1.1, cb * 0.55)        // spandrel beam width in plan
  const spanRun = Math.max(cb * 1.8, 0.7)               // how much spandrel is drawn
  // The plan's spandrel runs UP from the plan's own top edge, so the gap between
  // the views has to clear it — sized off the column alone, it drew the spandrel
  // straight through the vertical section above.
  const py = jy + bh + colRun + spanRun + u * 7.0
  P.push({ kind: 'text', x: jx + ch / 2, y: py - spanRun - u * 2.2, text: 'PLAN SECTION X-X', size: u * 1.5, anchor: 'middle', color: INK, weight: 700 })
  // spandrel running across the column, then the column, then the beam
  P.push({ kind: 'rect', x: jx + (ch - spandrel) / 2, y: py - spanRun, w: spandrel, h: spanRun, stroke: INK, width: 1.1, fill: CONC })
  P.push({ kind: 'rect', x: jx + (ch - spandrel) / 2, y: py + cb, w: spandrel, h: spanRun, stroke: INK, width: 1.1, fill: CONC })
  P.push({ kind: 'rect', x: jx, y: py, w: ch, h: cb, stroke: INK, width: 1.4, fill: '#e8eef5' })
  P.push({ kind: 'rect', x: jx + ch, y: py + (cb - bb) / 2, w: beamRun, h: bb, stroke: INK, width: 1.2, fill: CONC })
  brk(jx + ch + beamRun, py + (cb - bb) / 2 - u * 0.3, jx + ch + beamRun, py + (cb + bb) / 2 + u * 0.3)

  // the column hoop, as a rounded rectangle inside the cover
  P.push({
    kind: 'rect', x: jx + cov, y: py + cov, w: ch - 2 * cov, h: cb - 2 * cov,
    stroke: REBAR, width: 1.6, fill: 'none',
  })
  // column bars around that hoop
  const nPerSide = Math.max(2, Math.ceil(Math.max(i.colBars, 4) / 4) + 1)
  const rBar = Math.max(i.colBarDia, 8) / 2000
  for (let k = 0; k < nPerSide; k++) {
    const f = nPerSide === 1 ? 0.5 : k / (nPerSide - 1)
    for (const y of [py + cov, py + cb - cov]) {
      P.push({ kind: 'circle', cx: jx + cov + (ch - 2 * cov) * f, cy: y, r: rBar, fill: REBAR, stroke: REBAR, width: 0.5 })
    }
    for (const x of [jx + cov, jx + ch - cov]) {
      P.push({ kind: 'circle', cx: x, cy: py + cov + (cb - 2 * cov) * f, r: rBar, fill: REBAR, stroke: REBAR, width: 0.5 })
    }
  }
  // BEAM BARS running in, INSIDE the column bars, hooked at 60 mm clear
  for (const t of [0.26, 0.74]) {
    const y = py + (cb - bb) / 2 + bb * t
    P.push({
      kind: 'path', stroke: REBAR, width: 1.8, cap: 'round',
      cmds: [
        { c: 'M', x: jx + ch + beamRun * 0.96, y },
        { c: 'L', x: r.terminated ? hookX : jx - beamRun * 0.10, y },
      ],
    })
  }
  // beam hoops in plan — across the beam width
  for (let x = jx + ch + sBeam / 2; x < jx + ch + beamRun; x += sBeam) {
    P.push({ kind: 'line', x1: x, y1: py + (cb - bb) / 2 + cov * 0.4, x2: x, y2: py + (cb + bb) / 2 - cov * 0.4, stroke: REBAR, width: 0.8 })
  }
  // spandrel hoops
  for (const [y0, y1] of [[py - spanRun, py], [py + cb, py + cb + spanRun]] as const) {
    for (let y = y0 + sBeam / 2; y < y1; y += sBeam) {
      P.push({ kind: 'line', x1: jx + (ch - spandrel) / 2 + cov * 0.4, y1: y, x2: jx + (ch + spandrel) / 2 - cov * 0.4, y2: y, stroke: REBAR, width: 0.7 })
    }
  }
  P.push(...leader({
    x: jx + cov * 0.5, y: py + cb * 0.5,
    tx: jx - u * 0.6, ty: py - u * 1.0,
    text: 'COL. HOOP', size: u * 1.05, side: 'right',
  }))
  P.push(...leader({
    x: jx + ch + beamRun * 0.75, y: py + (cb - bb) / 2 + bb * 0.5,
    tx: jx + ch + beamRun, ty: py + (cb - bb) / 2 - u * 1.2,
    text: 'BEAM BARS', size: u * 1.05, side: 'right',
  }))
  P.push(...leader({
    x: jx + (ch + spandrel) / 2 - u * 0.4, y: py - spanRun * 0.5,
    tx: jx + (ch + spandrel) / 2 + u * 0.8, ty: py - spanRun * 0.72,
    text: 'SPANDREL BEAM HOOPS', size: u * 1.05, side: 'left',
  }))
  P.push({ kind: 'dim', x1: jx, y1: py + cb + spanRun + u * 1.6, x2: jx + ch, y2: py + cb + spanRun + u * 1.6, text: `${Math.round(i.colH)}`, off: 0, size: u * 1.2, ext: py + cb })
  P.push({ kind: 'dim', x1: jx - u * 3.2, y1: py, x2: jx - u * 3.2, y2: py + cb, text: `${Math.round(i.colB)}`, off: 0, size: u * 1.2, ext: jx })

  // ═══ notes and the title block, below both views ═════════════════════════
  const bodyBottom = py + cb + spanRun + u * 3.4
  const L = r.ldhInputs
  // ── notes: what to BUILD in this joint ──────────────────────────────────
  //
  // Not how the joint was checked. Vu = T + C − Vcol, φVn and the Aj it was
  // worked on are results: nobody tying steel can act on them, and where they
  // fail the answer is to enlarge the joint, which is not a site decision.
  // They go out as design notes, beside the drawing.
  const notes = [
    ...(r.through.main.applies
      ? [`⌀${Math.round(r.through.main.dia)} BEAM BARS RUN CONTINUOUS THROUGH THE JOINT`]
      : [`⌀${Math.round(i.beamBarDia)} BEAM BARS TERMINATE IN THE JOINT WITH STANDARD 90° HOOKS`]),
    ...(r.through.spandrel.applies
      ? [`SPANDREL ⌀${Math.round(r.through.spandrel.dia)} BARS RUN CONTINUOUS THROUGH`] : []),
    ...(r.terminated
      ? [
        `TERMINATED BARS: ℓdh ${Math.round(r.ldh)}, TAIL 12db = ${Math.round(r.hookTail)}, TO THE FAR FACE OF THE CONFINED CORE WITH ${Math.round(r.ldhClear)} CLEAR TO THE END OF THE HOOK`,
      ]
      : []),
    r.halvedHoops
      ? `JOINT HOOPS @ ${JOINT_HOOP_SPACING_MAX} — FOUR BEAMS FRAME IN, EACH ≥ ¾ THE COLUMN WIDTH (§418.8.3.2)`
      : `COLUMN CONFINEMENT HOOPS CONTINUE THROUGH THE JOINT @ ${Math.round(r.jointHoopSpacing)} (§418.8.3.1)`,
    `JOINT HOOP SPLICES ARE MADE OUTSIDE THE JOINT`,
    seeGeneralNotes(),
  ]

  /** The checks, for the engineer — not for the steel fixer. */
  const designNotes: string[] = [
    `${mark}: joint shear Vu = T + C − Vcol = ${Math.round(r.forces.T)} + ${Math.round(r.forces.C)} − ${Math.round(r.forces.Vcol)} = ${Math.round(r.Vu)} kN, beam steel at 1.25fy (§418.8.2.1)`,
    `${mark}: φVn = ${Math.round(r.phiVn)} kN (γ = ${r.gamma.toFixed(1)}, φ = 0.85, Aj = bj·h = ${Math.round(r.bj)}×${Math.round(i.colH)} mm) — §418.8.4.3 / §421.2.4.3`,
    ...(r.through.main.applies
      ? [`${mark}: §418.8.2.3 needs ${Math.round(r.through.main.required)} of column depth parallel to the ⌀${Math.round(r.through.main.dia)} bars passing through; ${Math.round(r.through.main.provided)} provided`]
      : [`${mark}: the terminated hooked bars are governed by §418.8.2.2 and §418.8.5, not by §418.8.2.3's 20db joint-depth rule, which applies to reinforcement extending THROUGH the joint`]),
    ...(r.through.spandrel.applies
      ? [`${mark}: §418.8.2.3 needs ${Math.round(r.through.spandrel.required)} of column width parallel to the spandrel bars; ${Math.round(r.through.spandrel.provided)} provided`] : []),
    ...(r.terminated
      ? [`${mark}: ℓdh = fy·db/(5.4λ√f'c) = ${L.fy}(${Math.round(L.db)}) / (5.4·${L.lambda.toFixed(2)}·√${L.fc}) = ${Math.round(r.ldh)}`] : []),
    ...r.notes.map((t) => `${mark}: ${t}`),
  ]

  const noteSize = u * 1.15
  const sheetW = Math.max(ch + beamRun, 1.6) + u * 10
  const step = u * 1.8
  const nb = notesBlock({ x: jx, w: sheetW, top: bodyBottom, size: noteSize, lines: notes, color: NOTE, step })
  P.push(...nb.prims)
  const wb = nb

  const title = `TYPICAL BEAM–COLUMN JOINT — ${mark}`
  const tb = titleBlock({
    x: jx, w: sheetW, top: wb.bottom + u * 1.6, u: u * 0.85,
    title, detailNo: opts.detailNo, sheetRef: opts.sheetRef ?? 'S-10', scale: opts.scale,
  })
  P.push(...tb.prims)

  // ── bounds fitted to the content, text extents included ─────────────────
  const b = measureBounds(P, {
    minX: jx - u * 2.4, maxX: jx + sheetW,
    minY: jy - colRun - u * 4.0, maxY: tb.bottom + u * 2.0,
  })

  return { primitives: P, title, result: r, designNotes, bounds: b }
}

// Re-exported so the existing callers and tests keep their import site; the
// implementation now lives in `detailSheet` as a single copy.
export { GLYPH_W, wrapNote }
