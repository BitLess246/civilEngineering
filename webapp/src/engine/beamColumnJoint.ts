// ─────────────────────────────────────────────────────────────────────────
// BEAM–COLUMN JOINT — NSCP 2015 §418.8 (ACI 318-14 §18.8), and the two-view
// detail sheet the joint is built from.
//
// The joint is the piece of the frame nothing else checks. The beam sheet
// designs the beam, the column sheet designs the column, and the block of
// concrete where they cross carries the sum of both their bar forces through a
// depth nobody sized for it. §418.8 is about that block, and it says four
// things the member designs never ask:
//
//   §418.8.2.3  the column dimension PARALLEL to the beam bars must be at least
//               20db of the largest beam bar. A ⌀28 bar needs 560 mm of column
//               to pass through — a 400 mm column cannot take it, whatever the
//               beam design says.
//   §418.8.4    the joint has its own shear strength, φVn = φ·γ·λ·√f'c·Aj, and
//               its own demand, taken with the beam steel at 1.25fy because a
//               joint is checked against what the bars can actually deliver,
//               not against the factored moment.
//   §418.8.3    column confinement hoops CONTINUE through the joint. Where four
//               beams frame in and each is at least ¾ the column width the
//               amount may be halved, at up to 150 mm.
//   §418.8.5.1  a beam bar hooked into the joint develops in
//               ℓdh = fy·db / (5.4·λ·√f'c) — SHORTER than the §425.4.3 hook,
//               because the joint core is confined, but it still has to fit
//               inside the column with its 90° tail in the confined core.
//
// Nothing here re-designs the beam or the column: it takes what those two
// designed and checks the block they share.
//
// Units: sections mm; forces kN; stresses MPa; drawing geometry m.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, Drawing } from './planRenderer'

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
/** §418.8.2.3 — column depth parallel to the beam bars, in bar diameters. */
export const COLUMN_DEPTH_BAR_DIAS = 20
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
  /** Confinement class for γ — Table 418.8.4.3. */
  confinement?: JointConfinement
  /** Every framing beam covers ≥ ¾ of the column width (§418.8.3.2). */
  wideBeams?: boolean
  /** Column shear from the analysis, kN — it relieves the joint demand. */
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
  /** Joint shear demand from the beam steel at 1.25fy, kN. */
  Vu: number
  shearOK: boolean
  /** §418.8.2.3 — column depth the beam bars need, mm, and whether it is there. */
  colDepthMin: number
  colDepthOK: boolean
  /** §418.8.5.1 hook, the straight embedment available for it, and the verdict. */
  ldh: number
  ldhAvail: number
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
 * The demand side is the part worth reading twice: a joint is not checked
 * against the factored moment, it is checked against what the beam bars can
 * physically deliver — 1.25·fy·As (§418.8.2.1) — minus the column shear that
 * acts the other way. At an interior joint the top steel on one side and the
 * bottom steel on the other both pull, so they add.
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

  // §418.8.2.1 — the bars at 1.25fy. Interior joints get both faces pulling.
  const AsTop = i.topBars * area(i.beamBarDia)
  const AsBot = i.botBars * area(i.beamBarDia)
  const As = i.interior ? AsTop + AsBot : AsTop
  const Vu = Math.max((PROBABLE_FY * fy * As) / 1000 - Math.max(i.Vcol ?? 0, 0), 0)
  const shearOK = Vu <= phiVn + 1e-9

  const colDepthMin = COLUMN_DEPTH_BAR_DIAS * i.beamBarDia
  const colDepthOK = i.colH >= colDepthMin - 1e-9

  const ldh = jointHookLdh(i.beamBarDia, fy, fc, lambda)
  const ldhAvail = Math.max(0, i.colH - cover - i.hoopDia)
  const ldhFits = ldh <= ldhAvail + 1e-9
  const hookTail = 12 * i.beamBarDia

  // §418.8.3.2 — four beams, each ≥ ¾ the column width: half the hoops, ≤150.
  const halvedHoops = confinement === 'four-faces' && !!i.wideBeams
  const jointHoopSpacing = halvedHoops
    ? Math.min(JOINT_HOOP_SPACING_MAX, 2 * i.hoopSpacing)
    : i.hoopSpacing

  if (!colDepthOK) {
    notes.push(`column depth ${Math.round(i.colH)} mm is less than the ${Math.round(colDepthMin)} mm (20db) §418.8.2.3 needs for a ⌀${Math.round(i.beamBarDia)} beam bar — deepen the column or use a smaller beam bar`)
  }
  if (!ldhFits) {
    notes.push(`ℓdh ${Math.round(ldh)} mm does not fit the ${Math.round(ldhAvail)} mm available inside the column — the hook cannot be developed in this joint (§418.8.5.1)`)
  }
  if (!shearOK) {
    notes.push(`joint shear Vu ${Math.round(Vu)} kN exceeds φVn ${Math.round(phiVn)} kN (γ = ${gamma.toFixed(1)}, §418.8.4.3) — enlarge the joint or frame more beams into it`)
  }
  if (confinement === 'other') {
    notes.push(`γ = 1.0: the joint is not confined by beams on three or four faces, which is the lowest strength Table 418.8.4.3 allows`)
  }

  return {
    gamma, bj, Aj, Vn, phiVn, Vu, shearOK,
    colDepthMin, colDepthOK,
    ldh, ldhAvail, ldhFits, hookTail,
    jointHoopSpacing, halvedHoops,
    ok: shearOK && colDepthOK && ldhFits,
    notes,
  }
}

// ── the sheet ──────────────────────────────────────────────────────────────

export interface JointDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface JointDetailDrawing extends Drawing { title: string; result: BeamColumnJointResult }

const INK = '#1e293b', REBAR = '#b45309', GRID = '#9aa5b5', NOTE = '#475569', WARN = '#b91c1c'
const CONC = '#f1f5f9'
const GLYPH_W = 0.63

/** Wrap a note to `max` characters a line. */
export function wrapNote(text: string, max: number): string[] {
  if (max < 8) return [text]
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > max) { out.push(line); line = word } else line += (line ? ' ' : '') + word
  }
  if (line) out.push(line)
  return out
}

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

  // beam top and bottom bars, hooked DOWN / UP into the confined core
  const hookX = jx + cov + (60 / 1000)                  // 60 mm clear of the far face
  const tail = r.hookTail / 1000
  for (const [yBar, dir] of [[jy + cov, 1], [jy + bh - cov, -1]] as const) {
    P.push({
      kind: 'path', stroke: REBAR, width: 2.0, cap: 'round', join: 'round',
      cmds: [
        { c: 'M', x: jx + ch + beamRun * 0.96, y: yBar },
        { c: 'L', x: hookX, y: yBar },
        { c: 'L', x: hookX, y: yBar + dir * Math.min(tail, bh * 0.75) },
      ],
    })
  }

  // ℓdh — measured from the column face the bar enters, into the joint
  P.push({
    kind: 'dim', x1: jx + ch, y1: jy - u * 2.8, x2: jx + ch - r.ldh / 1000, y2: jy - u * 2.8,
    text: `ℓdh = ${Math.round(r.ldh)}`, off: 0, size: u * 1.1,
  })
  if (!r.ldhFits) {
    P.push({ kind: 'line', x1: jx + ch - r.ldh / 1000, y1: jy - u * 3.6, x2: jx + ch - r.ldh / 1000, y2: jy + bh, stroke: WARN, width: 0.8, dash: [u * 0.4, u * 0.3] })
  }
  // the two callouts image 3 turns on
  P.push({ kind: 'line', x1: hookX, y1: jy + cov, x2: jx - u * 1.0, y2: jy + bh * 0.45, stroke: NOTE, width: 0.5 })
  P.push({ kind: 'text', x: jx - u * 1.2, y: jy + bh * 0.45, text: `60 CL. TO END OF HOOKS`, size: u * 1.05, anchor: 'end', color: NOTE })
  if (jointHoopYs.length) {
    P.push({ kind: 'line', x1: jx + ch * 0.5, y1: jointHoopYs[0], x2: jx + ch + beamRun * 0.45, y2: jy - u * 1.0, stroke: NOTE, width: 0.5 })
    P.push({ kind: 'text', x: jx + ch + beamRun * 0.47, y: jy - u * 1.0, text: `JOINT HOOPS ⌀${Math.round(i.hoopDia)} @ ${Math.round(r.jointHoopSpacing)}`, size: u * 1.05, anchor: 'start', color: NOTE })
  }
  P.push({ kind: 'text', x: jx + ch + beamRun, y: jy + bh + u * 1.6, text: `BEAM HOOPS`, size: u * 1.05, anchor: 'end', color: NOTE })
  P.push({ kind: 'text', x: jx - u * 1.8, y: jy - colRun * 0.55, text: `COLUMN HOOPS ⌀${Math.round(i.hoopDia)} @ ${Math.round(i.hoopSpacing)}`, size: u * 1.05, anchor: 'end', color: NOTE })
  // the joint depth, which is the §418.8.2.3 dimension
  P.push({ kind: 'dim', x1: jx, y1: jy + bh + colRun + u * 1.6, x2: jx + ch, y2: jy + bh + colRun + u * 1.6, text: `h = ${Math.round(i.colH)}`, off: 0, size: u * 1.2 })

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
      cmds: [{ c: 'M', x: jx + ch + beamRun * 0.96, y }, { c: 'L', x: hookX, y }],
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
  P.push({ kind: 'text', x: jx - u * 0.6, y: py - u * 1.0, text: 'COL. HOOP', size: u * 1.05, anchor: 'end', color: NOTE })
  P.push({ kind: 'text', x: jx + ch + beamRun, y: py + (cb - bb) / 2 - u * 1.2, text: 'BEAM BARS', size: u * 1.05, anchor: 'end', color: NOTE })
  P.push({ kind: 'text', x: jx + (ch + spandrel) / 2 + u * 0.8, y: py - spanRun * 0.55, text: 'SPANDREL BEAM HOOPS', size: u * 1.05, anchor: 'start', color: NOTE })
  P.push({ kind: 'dim', x1: jx, y1: py + cb + spanRun + u * 1.6, x2: jx + ch, y2: py + cb + spanRun + u * 1.6, text: `${Math.round(i.colH)}`, off: 0, size: u * 1.2 })
  P.push({ kind: 'dim', x1: jx - u * 3.2, y1: py, x2: jx - u * 3.2, y2: py + cb, text: `${Math.round(i.colB)}`, off: 0, size: u * 1.2 })

  // ═══ notes and the title block, below both views ═════════════════════════
  const bodyBottom = py + cb + spanRun + u * 3.4
  const notes = [
    `JOINT SHEAR φVn = ${Math.round(r.phiVn)} kN (γ = ${r.gamma.toFixed(1)}, Aj = bj·h = ${Math.round(r.bj)}×${Math.round(i.colH)} mm) vs Vu = ${Math.round(r.Vu)} kN AT 1.25fy (§418.8.4 / §418.8.2.1)`,
    `COLUMN DEPTH PARALLEL TO THE BEAM BARS ≥ 20db = ${Math.round(r.colDepthMin)} — PROVIDED ${Math.round(i.colH)} (§418.8.2.3)`,
    `BEAM BARS HOOKED INTO THE JOINT DEVELOP IN ℓdh = fy·db/(5.4λ√f'c) = ${Math.round(r.ldh)}, TAIL 12db = ${Math.round(r.hookTail)} (§418.8.5.1 / §425.3.1)`,
    `HOOKS TURN INTO THE CONFINED CORE, ${60} CLEAR TO THE END OF THE HOOK`,
    r.halvedHoops
      ? `FOUR BEAMS FRAME IN, EACH ≥ ¾ THE COLUMN WIDTH — JOINT HOOPS MAY BE HALVED AT ≤ ${JOINT_HOOP_SPACING_MAX} (§418.8.3.2)`
      : `COLUMN CONFINEMENT HOOPS CONTINUE THROUGH THE JOINT AT ${Math.round(r.jointHoopSpacing)} (§418.8.3.1)`,
    `CLASS B SPLICES FOR JOINT HOOPS ARE MADE OUTSIDE THE JOINT`,
    ...r.notes.map((t) => `⚠ ${t.toUpperCase()}`),
  ]
  const noteSize = u * 1.15
  const sheetW = Math.max(ch + beamRun, 1.6) + u * 10
  const wrapped = notes.flatMap((t) => wrapNote(t, Math.max(24, Math.floor(sheetW / (GLYPH_W * noteSize)))))
  wrapped.forEach((t, k) => P.push({
    kind: 'text', x: jx, y: bodyBottom + k * u * 1.8, text: t, size: noteSize, anchor: 'start',
    color: t.startsWith('⚠') ? WARN : NOTE,
  }))

  const title = `TYPICAL BEAM–COLUMN JOINT — ${mark}`
  const blockTop = bodyBottom + wrapped.length * u * 1.8 + u * 1.6
  const rad = u * 2.2
  const bx = jx + rad
  P.push({ kind: 'line', x1: jx, y1: blockTop, x2: jx + sheetW, y2: blockTop, stroke: INK, width: 1.0 })
  const cy = blockTop + rad + u * 0.7
  P.push({ kind: 'circle', cx: bx, cy, r: rad, stroke: INK, fill: '#fff', width: 0.9 })
  P.push({ kind: 'line', x1: bx - rad, y1: cy, x2: bx + rad, y2: cy, stroke: INK, width: 0.9 })
  P.push({ kind: 'text', x: bx, y: cy - rad * 0.48, text: opts.detailNo ?? '1', size: u * 1.7, anchor: 'middle', color: INK, weight: 700 })
  P.push({ kind: 'text', x: bx, y: cy + rad * 0.52, text: opts.sheetRef ?? 'S-10', size: u * 1.1, anchor: 'middle', color: INK, weight: 600 })
  const tx = bx + rad + u * 1.4
  P.push({ kind: 'text', x: tx, y: cy - rad * 0.30, text: title, size: u * 2.0, anchor: 'start', color: INK, weight: 700 })
  P.push({ kind: 'line', x1: tx, y1: cy + rad * 0.10, x2: jx + sheetW, y2: cy + rad * 0.10, stroke: GRID, width: 0.6 })
  P.push({ kind: 'text', x: tx, y: cy + rad * 0.62, text: 'SCALE', size: u * 1.1, anchor: 'start', color: NOTE, weight: 600 })
  P.push({ kind: 'text', x: jx + sheetW, y: cy + rad * 0.62, text: opts.scale ?? 'NTS', size: u * 1.1, anchor: 'end', color: NOTE, weight: 600 })
  P.push({ kind: 'line', x1: jx, y1: cy + rad + u * 0.7, x2: jx + sheetW, y2: cy + rad + u * 0.7, stroke: INK, width: 1.0 })

  // ── bounds fitted to the content, text extents included ─────────────────
  const b = {
    minX: jx - u * 2.4, maxX: jx + sheetW,
    minY: jy - colRun - u * 4.0, maxY: cy + rad + u * 2.0,
  }
  for (const p of P) {
    let xs: number[] = [], ys: number[] = []
    if (p.kind === 'line' || p.kind === 'dim') { xs = [p.x1, p.x2]; ys = [p.y1, p.y2] }
    else if (p.kind === 'rect') { xs = [p.x, p.x + p.w]; ys = [p.y, p.y + p.h] }
    else if (p.kind === 'circle') { xs = [p.cx - p.r, p.cx + p.r]; ys = [p.cy - p.r, p.cy + p.r] }
    else if (p.kind === 'path') { xs = p.cmds.map((c) => c.x); ys = p.cmds.map((c) => c.y) }
    else if (p.kind === 'text') {
      const tw = p.text.length * GLYPH_W * p.size, th = p.size
      const lead = p.anchor === 'middle' ? -tw / 2 : p.anchor === 'end' ? -tw : 0
      xs = [p.x + lead, p.x + lead + tw]; ys = [p.y - th / 2, p.y + th / 2]
    }
    for (const x of xs) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x) }
    for (const y of ys) { b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y) }
  }

  return { primitives: P, title, result: r, bounds: b }
}
