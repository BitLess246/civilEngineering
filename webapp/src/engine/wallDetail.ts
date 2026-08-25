// ─────────────────────────────────────────────────────────────────────────
// WALL STANDARD DETAILS — the corner, the intersection and the construction
// joint, plus the two checks that decide what those details have to contain.
//
// A wall is drawn as a straight run and detailed as one, and then three places
// on it are not a straight run:
//
//   CORNER        The horizontal steel is what carries the wall's in-plane
//                 tension, and at a corner it simply STOPS unless something
//                 carries it round. A corner bar does that: an L with each leg
//                 lapped Class B (§425.5.2) into the horizontal bars it
//                 continues. Ending the horizontals at the corner with a bit of
//                 cover is the classic detailing failure — the corner opens.
//   INTERSECTION  Same problem one wall at a time: the branch wall's
//                 horizontals have to be ANCHORED into the through wall, which
//                 means a standard hook developing fy (ℓdh, §425.4.3), not a
//                 bar stopped at the face.
//   CONSTRUCTION  Concrete cast against hardened concrete transfers shear only
//   JOINT         by shear friction (§422.9). The steel that does it is the
//                 wall's own VERTICAL reinforcement crossing the joint — so the
//                 check is whether that steel is enough, not whether somebody
//                 remembered to add dowels. The surface preparation is worth a
//                 factor of 1.67 on μ, which is why it is a note on the drawing
//                 and not an assumption.
//
// Nothing here re-designs the wall: `shearWallDesign` sizes the curtains, and
// this module details them and checks the two things that live at the joints.
//
// Units: wall length m; thickness, bar sizes, spacings and lengths mm; forces
// kN; stresses MPa.
// ─────────────────────────────────────────────────────────────────────────
import { calcDevLength, hookClearToFace, hookEmbedmentAvailable } from './devLength'
import type { PlanPrimitive, Drawing } from './planRenderer'
import { GLYPH_W, wrapNote, measureBounds, notesBlock, titleBlock, leader } from './detailSheet'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, SHEET_WARN, STEEL } from './sheetInk'

// ── §422.9 shear friction ──────────────────────────────────────────────────

/**
 * Interface condition, which sets μ — Table 422.9.4.2 (ACI 318-14 Table
 * 22.9.4.2). The difference between a roughened and an unroughened joint is
 * 1.0λ against 0.6λ: two thirds more steel for the same shear, decided by
 * whether anyone chipped the surface.
 */
export type JointSurface = 'monolithic' | 'roughened' | 'not-roughened' | 'as-rolled-steel'

/** μ per Table 422.9.4.2, before the λ multiplier. */
export const FRICTION_MU: Record<JointSurface, number> = {
  'monolithic': 1.4,
  'roughened': 1.0,          // intentionally roughened to a full 6 mm amplitude
  'not-roughened': 0.6,
  'as-rolled-steel': 0.7,
}

/** §426.5.6 — amplitude the "intentionally roughened" case is defined by, mm. */
export const ROUGHENING_AMPLITUDE = 6
const PHI_SHEAR = 0.75

export interface ShearFrictionInput {
  /** Factored shear across the interface, kN. */
  Vu: number
  /** Area of concrete resisting shear transfer, mm² — for a wall joint, ℓw·t. */
  Ac: number
  fc: number
  fy: number
  surface: JointSurface
  lambda?: number
  /** PERMANENT factored compression across the interface, kN (§422.9.4.5). */
  Pu?: number
}

export interface ShearFrictionResult {
  mu: number
  /** Shear-friction steel required, mm² — §422.9.4.2. */
  Avf: number
  /** Upper limit on Vn for this interface, kN — §422.9.4.4. */
  VnMax: number
  /** φ·Vn,max — the shear the interface cannot exceed however much steel is put
   *  across it. Past this the section has to grow. */
  phiVnMax: number
  /** Vu is within the §422.9.4.4 cap. */
  capOK: boolean
  notes: string[]
}

/**
 * Shear-friction reinforcement across an interface — §422.9 (ACI §22.9).
 *
 *   Vn = μ·Avf·fy                                    §422.9.4.2
 *   φVn ≥ Vu with φ = 0.75
 *
 * A permanent net compression across the interface may be added to Avf·fy
 * (§422.9.4.5); it is only taken when the caller supplies it, because a
 * compression that is not permanent is not a clamping force.
 *
 * The §422.9.4.4 cap is a property of the INTERFACE, not of the steel: once Vu
 * exceeds φ·Vn,max no amount of shear-friction steel helps and the section has
 * to grow. Sizing Avf without checking it returns a bar schedule for a joint
 * that cannot work.
 */
export function shearFrictionSteel(i: ShearFrictionInput): ShearFrictionResult {
  const lambda = i.lambda ?? 1
  const notes: string[] = []
  const mu = FRICTION_MU[i.surface] * lambda
  const Vu = Math.max(i.Vu, 0)
  const Ac = Math.max(i.Ac, 1)

  // §422.9.4.5 — permanent net compression across the interface acts with the
  // steel, so it is subtracted from what the steel has to deliver.
  const required = Math.max(0, Vu / PHI_SHEAR - Math.max(i.Pu ?? 0, 0))   // kN
  const Avf = (required * 1000) / (mu * i.fy)                             // mm²

  // §422.9.4.4 — the roughened/monolithic interfaces get the higher set of
  // limits; everything else is held to 0.2f′c and 5.5 MPa.
  const rough = i.surface === 'monolithic' || i.surface === 'roughened'
  const VnMaxMPa = rough
    ? Math.min(0.2 * i.fc, 3.3 + 0.08 * i.fc, 11)
    : Math.min(0.2 * i.fc, 5.5)
  const VnMax = (VnMaxMPa * Ac) / 1000                                    // kN
  const phiVnMax = PHI_SHEAR * VnMax
  const capOK = Vu <= phiVnMax + 1e-9

  if (!capOK) {
    notes.push(`Vu ${Vu.toFixed(0)} kN exceeds φVn,max ${phiVnMax.toFixed(0)} kN for this interface (§422.9.4.4) — no amount of shear-friction steel fixes this; thicken the wall or lengthen the joint`)
  }
  if (i.surface === 'not-roughened') {
    notes.push(`μ = 0.6λ because the joint is not intentionally roughened — roughening to a ${ROUGHENING_AMPLITUDE} mm amplitude raises it to 1.0λ and cuts the steel by 40% (Table 422.9.4.2)`)
  }
  return { mu, Avf, VnMax, phiVnMax, capOK, notes }
}

// ── §411.6 / §411.7 distributed wall steel ─────────────────────────────────

/**
 * Minimum distributed reinforcement ratios for a wall — Table 411.6.1
 * (ACI 318-14 Table 11.6.1).
 *
 * The small-bar case (⌀16 or smaller, fy ≥ 420) is the one nearly every wall
 * falls in and the one worth getting right: 0.0012 vertical, 0.0020 horizontal.
 * The horizontal minimum is the LARGER of the two, which reads backwards until
 * you remember it is shrinkage and temperature steel running the long way.
 */
export function wallMinRatios(barDia: number, fy: number): { rhoL: number; rhoT: number } {
  const small = barDia <= 16 && fy >= 420
  return small ? { rhoL: 0.0012, rhoT: 0.0020 } : { rhoL: 0.0015, rhoT: 0.0025 }
}

/** §411.7.2.1 / §411.7.3.1 — bar spacing in a wall, mm. */
export function wallMaxSpacing(t: number): number {
  return Math.min(3 * t, 450)
}

/** §411.7.2.3 — a wall thicker than this carries reinforcement in TWO layers. */
export const TWO_CURTAIN_THICKNESS = 250

// ── the detail ─────────────────────────────────────────────────────────────

export interface WallDetailInput {
  mark?: string
  /** Wall thickness t, mm. */
  t: number
  /** Thickness of the intersecting (branch) wall, mm — defaults to `t`. */
  t2?: number
  /** Horizontal (transverse) bar diameter and spacing, mm. */
  barDia: number
  spacing: number
  /** Vertical (longitudinal) bar diameter and spacing, mm — default to the
   *  horizontal ones. */
  vertDia?: number
  vertSpacing?: number
  /** Clear cover to the outer bar, mm (default 20 — §420.6.1.3.1 interior). */
  cover?: number
  fc?: number
  fy?: number
  lambda?: number
  /** Construction joint: factored in-plane shear across it, kN. */
  Vu?: number
  /** Wall length resisting that shear, m — the joint's Ac is ℓw·t. */
  lw?: number
  /** Permanent factored compression across the joint, kN. */
  Pu?: number
  /** How the joint will be prepared (default 'roughened' — what the note asks
   *  for; pass 'not-roughened' to see what it costs). */
  surface?: JointSurface
}

export interface WallDetailResult {
  /** Curtains of reinforcement — §411.7.2.3. */
  curtains: 1 | 2
  /** §411.7.2.1 / §411.7.3.1 spacing limit, mm. */
  sMax: number
  spacingOK: boolean
  /** Minimum ratios and what the given bar/spacing actually provides. */
  rhoLMin: number
  rhoTMin: number
  rhoL: number
  rhoT: number
  rhoOK: boolean
  /** Class B tension lap, mm — §425.5.2. */
  lapB: number
  /** Standard 90° hook development length, mm — §425.4.3. */
  ldh: number
  /** 12db hook tail, §425.3.1. */
  hookTail: number
  /** Straight embedment available for that hook in the through wall, mm —
   *  t − cover. A wall deducts the clear cover ONLY: no hoop crosses it and the
   *  bend turns against the far curtain, not behind a column vertical. */
  ldhAvail: number
  /** Clear from the far FACE to the outside of the bend, mm — the cover, and
   *  only the cover. The detail places the hook leg here, so the drawing and
   *  `ldhAvail` cannot drift apart. */
  ldhClear: number
  /**
   * ℓdh fits inside the through wall.
   *
   * Deliberately NOT folded into `ok`: it does not make the wall wrong, it
   * decides WHICH intersection detail is legal. Where it is false the branch
   * bars cannot be hooked into the through wall at all and the detail becomes
   * a U-bar lapped with the through wall's own horizontals.
   */
  ldhFits: boolean
  /** Corner-bar leg, mm — each leg laps the horizontal bar it continues. */
  cornerLeg: number
  /** Construction-joint check, when a shear was supplied. */
  joint?: ShearFrictionResult
  /** Vertical steel crossing the joint, mm² — it IS the shear-friction steel. */
  AvfProvided?: number
  jointOK: boolean
  ok: boolean
  notes: string[]
}

/** Bar area, mm². */
const area = (d: number) => (Math.PI / 4) * d * d

/**
 * How many bars to DRAW over a run, clamped.
 *
 * The builders used to divide by the raw spacing: a zero (a half-filled form,
 * or the degenerate fixture) made this Infinity and the draw loop never ended.
 * The cap is a drawing limit, not an engineering one — past ~120 bars the dots
 * merge anyway.
 */
const drawCount = (run: number, spacing: number, max = 120): number => {
  const s = Math.max(spacing, 1) / 1000
  if (!(run > 0) || !Number.isFinite(run)) return 1
  return Math.min(max, Math.max(1, Math.round(run / s)))
}

/**
 * Detail the three wall junctions and check what governs them.
 *
 * The lap and the hook come from `calcDevLength` on the wall's own bar, with
 * the confinement term built the way a wall curtain actually is: no transverse
 * ties, so Ktr = 0, and cb the lesser of the cover to the bar centre and half
 * the clear bar spacing (§425.4.2.2).
 */
export function designWallDetail(i: WallDetailInput): WallDetailResult {
  const notes: string[] = []
  const t = Math.max(i.t, 1)
  const cover = i.cover ?? 20
  const fc = i.fc ?? 21, fy = i.fy ?? 415
  const db = Math.max(i.barDia, 1)
  const vdb = Math.max(i.vertDia ?? db, 1)
  const s = Math.max(i.spacing, 1)
  const vs = Math.max(i.vertSpacing ?? s, 1)

  const curtains: 1 | 2 = t > TWO_CURTAIN_THICKNESS ? 2 : 1
  const sMax = wallMaxSpacing(t)
  const spacingOK = s <= sMax + 1e-9 && vs <= sMax + 1e-9

  // ρ is over the GROSS area of the wall, so a two-curtain wall provides twice
  // the bar area at the same spacing.
  const rhoT = (curtains * area(db)) / (s * t)
  const rhoL = (curtains * area(vdb)) / (vs * t)
  const { rhoL: rhoLMin, rhoT: rhoTMin } = wallMinRatios(Math.max(db, vdb), fy)
  const rhoOK = rhoT >= rhoTMin - 1e-12 && rhoL >= rhoLMin - 1e-12

  const cb = Math.min(cover + db / 2, s / 2)
  const dev = calcDevLength({
    db, fc, fy, topBar: false, epoxy: 'none', lambda: i.lambda ?? 1,
    cbKtr_db: Math.min(cb / db, 2.5),
    // A hook inside a wall corner has the far face for cover and no ties round
    // it — neither §425.4.3.2 reduction is available.
    hookCover: false, hookTies: false,
  })

  // A hooked bar is developed from the face of the through wall to the outside
  // of the hook, and all of that has to be INSIDE the through wall. A 200 mm
  // wall offers 180 mm and a ⌀12 hook needs 261 — the hook detail is simply not
  // available there, however carefully it is drawn.
  //
  // Same question the column asks (`hookEmbedmentAvailable`), and asked through
  // the same helper so the concept lives in one place — but a WALL deducts the
  // clear cover ONLY. There is no hoop crossing that cover, and the bend turns
  // against the far curtain rather than behind a column vertical the way a
  // beam bar hooked into a joint does, so neither of the column's other two
  // terms exists here.
  const ldhClear = hookClearToFace(cover, 0, 0)
  const ldhAvail = hookEmbedmentAvailable(t, cover, 0, 0)
  //
  // It is NOT pushed onto `notes`: those are the problems that make `ok` false
  // and every sheet prints them, and a hook that will not fit is no business of
  // the corner or the construction-joint detail. The intersection sheet raises
  // it where it belongs.
  const ldhFits = dev.ldh <= ldhAvail + 1e-9

  let joint: ShearFrictionResult | undefined
  let AvfProvided: number | undefined
  let jointOK = true
  if (i.Vu != null && i.lw != null && i.lw > 0) {
    const lwmm = i.lw * 1000
    joint = shearFrictionSteel({
      Vu: i.Vu, Ac: lwmm * t, fc, fy, surface: i.surface ?? 'roughened',
      lambda: i.lambda, Pu: i.Pu,
    })
    // The VERTICAL curtains cross the joint, so they are the shear-friction
    // steel — the detail's job is to say whether they are enough, not to add
    // dowels beside reinforcement that is already there.
    AvfProvided = curtains * area(vdb) * (lwmm / vs)
    jointOK = joint.capOK && AvfProvided >= joint.Avf - 1e-9
    if (!jointOK && joint.capOK) {
      notes.push(`vertical steel crossing the joint (${Math.round(AvfProvided)} mm²) is short of the ${Math.round(joint.Avf)} mm² §422.9 needs — tighten the vertical spacing to ${Math.floor((curtains * area(vdb) * lwmm) / joint.Avf)} mm or add dowels`)
    }
    notes.push(...joint.notes)
  }

  if (!spacingOK) notes.push(`bar spacing exceeds the §411.7.2.1/§411.7.3.1 limit of ${Math.round(sMax)} mm (lesser of 3t and 450)`)
  if (!rhoOK) {
    if (rhoT < rhoTMin) notes.push(`horizontal ρt ${rhoT.toFixed(4)} is below the §411.6.1 minimum ${rhoTMin.toFixed(4)}`)
    if (rhoL < rhoLMin) notes.push(`vertical ρℓ ${rhoL.toFixed(4)} is below the §411.6.1 minimum ${rhoLMin.toFixed(4)}`)
  }
  if (curtains === 2 && t > TWO_CURTAIN_THICKNESS) {
    notes.push(`wall is ${Math.round(t)} mm thick — §411.7.2.3 requires reinforcement in two layers, one near each face`)
  }

  return {
    curtains, sMax, spacingOK,
    rhoLMin, rhoTMin, rhoL, rhoT, rhoOK,
    lapB: dev.ls_B, ldh: dev.ldh, hookTail: dev.hookTail,
    ldhAvail, ldhClear, ldhFits,
    cornerLeg: dev.ls_B,
    joint, AvfProvided, jointOK,
    ok: spacingOK && rhoOK && jointOK,
    notes,
  }
}

// ── the sheets ─────────────────────────────────────────────────────────────

export interface WallDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface WallDetailDrawing extends Drawing { title: string; result: WallDetailResult }

const INK = SHEET_INK, REBAR = STEEL, GRID = SHEET_GRID, NOTE = SHEET_NOTE, WARN = SHEET_WARN
const CONC = '#f1f5f9'

/** Title block, notes block and bounds — shared by all three wall sheets. */
function frame(
  P: PlanPrimitive[], title: string, notes: string[], warn: string[],
  w: number, h: number, u: number, opts: WallDetailOptions,
): Drawing {
  const noteSize = u * 1.15
  const sheetW = w + u * 8.5
  const step = u * 1.8
  const noteTop = h + u * 4.4

  // Notes first, then warnings under them in the warning colour. Two calls
  // rather than one so the two groups keep their own ink without the block
  // needing a per-line colour.
  const nb = notesBlock({ x: 0, w: sheetW, top: noteTop, size: noteSize, lines: notes, color: NOTE, step })
  P.push(...nb.prims)
  const wb = warn.length
    ? notesBlock({
        x: 0, w: sheetW, top: nb.bottom + step, size: noteSize,
        lines: warn.map((t) => `⚠ ${t.toUpperCase()}`), color: WARN, step,
      })
    : { prims: [], bottom: nb.bottom }
  P.push(...wb.prims)

  // The title block goes at the BOTTOM, under the drawing and its notes — the
  // same place every other detail sheet puts it. These three used to float a
  // bare centred title ABOVE the drawing with a loose bubble beside it, which
  // is why the wall sheets never matched the beam, column or footing sheets.
  const tb = titleBlock({
    x: 0, w: sheetW, top: wb.bottom + u * 2.6, u: u * 0.78,
    title, detailNo: opts.detailNo, sheetRef: opts.sheetRef ?? 'S-09', scale: opts.scale,
  })
  P.push(...tb.prims)

  // The sheet is sized to FIT what is on it. Fixed bounds plus a long title is
  // how text ends up printed off the paper: 'TYPICAL WALL CONSTRUCTION JOINT'
  // is wider than a 3 m wall at any readable size, so the paper has to grow,
  // not the title shrink.
  const b = measureBounds(P, {
    minX: -u * 5.4, maxX: sheetW,
    minY: -u * 3.0, maxY: tb.bottom,
  })
  return { primitives: P, bounds: { minX: b.minX - u, minY: b.minY - u, maxX: b.maxX + u, maxY: b.maxY + u } }
}

/** Bars of one curtain, drawn as dots along a face — the plan-section convention. */
function curtainDots(
  P: PlanPrimitive[], x0: number, y0: number, x1: number, y1: number, n: number, r: number,
): void {
  for (let k = 0; k <= n; k++) {
    const f = n === 0 ? 0 : k / n
    P.push({ kind: 'circle', cx: x0 + (x1 - x0) * f, cy: y0 + (y1 - y0) * f, r, fill: REBAR, stroke: REBAR, width: 0.5 })
  }
}

/**
 * WALL CORNER — plan section through the corner of two walls.
 *
 * The sheet exists to draw ONE thing: the corner bar that carries the
 * horizontal steel round the corner, with each leg lapped Class B into the bar
 * it continues. Everything else on it is context for that bar.
 */
export function buildWallCornerDetail(i: WallDetailInput, opts: WallDetailOptions = {}): WallDetailDrawing {
  const r = designWallDetail(i)
  const P: PlanPrimitive[] = []
  const t = i.t / 1000
  const leg = r.cornerLeg / 1000
  const L = leg + t + 0.25                      // drawn leg length, m
  const u = L / 26
  const cov = Math.min((i.cover ?? 20) / 1000, t / 3)
  const mark = i.mark ?? 'W1'

  // ── the two wall legs, in plan (corner at the origin, running +x and +y) ──
  P.push({ kind: 'rect', x: 0, y: 0, w: L, h: t, stroke: INK, width: 1.3, fill: CONC })
  P.push({ kind: 'rect', x: 0, y: 0, w: t, h: L, stroke: INK, width: 1.3, fill: CONC })
  // break lines at the two cut ends
  for (const [x0, y0, x1, y1] of [[L, -u * 0.6, L, t + u * 0.6], [-u * 0.6, L, t + u * 0.6, L]] as const)
    P.push({ kind: 'line', x1: x0, y1: y0, x2: x1, y2: y1, stroke: GRID, width: 0.8, dash: [u * 0.5, u * 0.4] })

  // ── vertical bars, seen end-on: one dot row per curtain per leg ──
  const rad = Math.max(i.barDia, 1) / 2000
  const nx = drawCount(L - t, i.vertSpacing ?? i.spacing)
  const faces = r.curtains === 2 ? [cov, t - cov] : [t / 2]
  for (const f of faces) {
    curtainDots(P, t + (L - t) * 0.08, f, L * 0.94, f, nx, rad * 1.6)
    curtainDots(P, f, t + (L - t) * 0.08, f, L * 0.94, nx, rad * 1.6)
  }

  // ── the horizontal bars in each leg, and the CORNER BAR over them ──
  for (const f of faces) {
    P.push({ kind: 'line', x1: t * 0.5, y1: f, x2: L * 0.97, y2: f, stroke: REBAR, width: 1.0, dash: [u * 1.2, u * 0.7] })
    P.push({ kind: 'line', x1: f, y1: t * 0.5, x2: f, y2: L * 0.97, stroke: REBAR, width: 1.0, dash: [u * 1.2, u * 0.7] })
  }
  // Corner bars: an L per curtain, legs = the Class B lap. Offset a bar
  // diameter and a half off the horizontal bar's own line — a lap is two bars
  // SIDE BY SIDE, and drawn coincident the sheet showed one.
  const off = (1.6 * Math.max(i.barDia, 1)) / 1000
  for (const f of faces) {
    const g = f < t / 2 ? f + off : f - off
    P.push({
      kind: 'path', width: 2.0, stroke: REBAR,
      cmds: [{ c: 'M', x: leg + g, y: g }, { c: 'L', x: g, y: g }, { c: 'L', x: g, y: leg + g }],
    })
  }

  // ── dimensions: the leg, which IS the lap ──
  P.push({ kind: 'dim', x1: cov, y1: t + u * 1.6, x2: leg + cov, y2: t + u * 1.6, text: `${Math.round(r.cornerLeg)}`, off: 0, size: u * 1.4 })
  P.push({ kind: 'dim', x1: -u * 2.2, y1: 0, x2: -u * 2.2, y2: t, text: `${Math.round(i.t)}`, off: 0, size: u * 1.5 })

  // ── callouts ──
  P.push({
    kind: 'text', x: leg * 0.55 + t, y: t + u * 4.2,
    text: `CORNER BAR ⌀${Math.round(i.barDia)}`,
    size: u * 1.25, anchor: 'start', color: REBAR, weight: 600,
  })
  P.push({
    kind: 'text', x: t + u * 1.4, y: L * 0.55,
    text: `HORIZ. ⌀${Math.round(i.barDia)} @ ${Math.round(i.spacing)}`,
    size: u * 1.2, anchor: 'start', color: REBAR, weight: 600,
  })

  const notes = [
    `HORIZONTAL WALL STEEL SHALL BE CONTINUOUS AROUND THE CORNER — LAP THE CORNER BAR CLASS B (${Math.round(r.lapB)}) EACH LEG (§425.5.2)`,
    `DO NOT STOP THE HORIZONTAL BARS AT THE CORNER FACE`,
    `${r.curtains} CURTAIN(S) — §411.7.2.3 (TWO WHERE t > ${TWO_CURTAIN_THICKNESS})`,
    `MAX. BAR SPACING ${Math.round(r.sMax)} = LESSER OF 3t AND 450 (§411.7.2.1/§411.7.3.1)`,
    `MIN. ρℓ ${r.rhoLMin.toFixed(4)} / ρt ${r.rhoTMin.toFixed(4)} (§411.6.1) — PROVIDED ${r.rhoL.toFixed(4)} / ${r.rhoT.toFixed(4)}`,
  ]
  const title = `TYPICAL WALL CORNER — ${mark}`
  const d = frame(P, title, notes, r.notes, L, L, u, opts)
  return { ...d, title, result: r }
}

/**
 * WALL INTERSECTION — plan section where a branch wall meets a through wall.
 *
 * The through wall's horizontals run on past; the branch wall's horizontals are
 * the ones with nowhere to go, so they are hooked into the through wall and the
 * sheet dimensions ℓdh (§425.4.3) rather than letting a bar stop at the face.
 */
export function buildWallIntersectionDetail(i: WallDetailInput, opts: WallDetailOptions = {}): WallDetailDrawing {
  const r = designWallDetail(i)
  const P: PlanPrimitive[] = []
  const t = i.t / 1000, t2 = (i.t2 ?? i.t) / 1000
  const ldh = r.ldh / 1000, tail = r.hookTail / 1000
  const W = Math.max(2 * (ldh + t), 1.6)
  const D = ldh + t + 0.35
  const u = W / 30
  const cov = Math.min((i.cover ?? 20) / 1000, t / 3)
  const mark = i.mark ?? 'W1'
  const bx = (W - t2) / 2                       // branch wall's left face

  // ── through wall along x, branch wall running down from it ──
  P.push({ kind: 'rect', x: 0, y: 0, w: W, h: t, stroke: INK, width: 1.3, fill: CONC })
  P.push({ kind: 'rect', x: bx, y: t, w: t2, h: D - t, stroke: INK, width: 1.3, fill: CONC })

  // ── the through wall's horizontals — continuous, drawn through ──
  const faces = r.curtains === 2 ? [cov, t - cov] : [t / 2]
  for (const f of faces) {
    P.push({ kind: 'line', x1: W * 0.02, y1: f, x2: W * 0.98, y2: f, stroke: REBAR, width: 1.3 })
  }
  // ── the branch wall's horizontals, anchored into the through wall ──
  //
  // A standard hook where ℓdh fits inside the through wall; where it does not
  // (a ⌀12 hook needs 261 mm and a 200 mm wall offers 180) the detail is a
  // U-bar lapped Class B with the through wall's own horizontals, because the
  // hook the sheet would otherwise draw cannot be built.
  const anchorLen = (r.ldhFits ? tail : r.lapB / 1000)
  const bFaces = r.curtains === 2 ? [bx + cov, bx + t2 - cov] : [bx + t2 / 2]
  // Cover to the far face — from `ldhClear`, the same number `ldhAvail` is
  // measured against, so the drawn leg and the check cannot disagree.
  const yLeg = Math.min(r.ldhClear / 1000, t / 3)
  bFaces.forEach((f, k) => {
    // alternate the turn so two bars do not lie on top of each other
    const inward = k % 2 === 0 ? -1 : 1
    P.push({
      kind: 'path', width: 1.8, stroke: REBAR,
      cmds: [
        { c: 'M', x: f, y: D * 0.96 },
        { c: 'L', x: f, y: yLeg },
        { c: 'L', x: Math.max(0, Math.min(W, f + inward * anchorLen)), y: yLeg },
      ],
    })
  })
  // ── vertical bars end-on in both walls ──
  const rad = Math.max(i.barDia, 1) / 2000
  for (const f of faces) curtainDots(P, W * 0.06, f, W * 0.94, f, drawCount(W, i.vertSpacing ?? i.spacing), rad * 1.6)

  // ── dimensions ──
  // ℓdh runs from the critical section (the face of the through wall) INTO the
  // wall, the way the bar does. Where it overruns the far face the drawing says
  // so by itself — which is the point of dimensioning it here rather than
  // anywhere convenient.
  P.push({ kind: 'dim', x1: -u * 2.6, y1: t, x2: -u * 2.6, y2: t - ldh, text: `ℓdh = ${Math.round(r.ldh)}`, off: 0, size: u * 1.4 })
  P.push({ kind: 'dim', x1: -u * 7.0, y1: 0, x2: -u * 7.0, y2: t, text: `t = ${Math.round(i.t)}`, off: 0, size: u * 1.4 })
  if (!r.ldhFits) {
    P.push({ kind: 'line', x1: -u * 3.6, y1: t - ldh, x2: 0, y2: t - ldh, stroke: WARN, width: 0.7, dash: [u * 0.8, u * 0.6] })
    P.push({ kind: 'text', x: -u * 3.8, y: t - ldh, text: `OVERRUNS — AVAIL. ${Math.round(r.ldhAvail)}`, size: u * 1.15, anchor: 'end', color: WARN, weight: 600 })
  }

  P.push({
    kind: 'text', x: W, y: -u * 1.6, text: `THROUGH WALL — HORIZ. BARS CONTINUOUS`,
    size: u * 1.2, anchor: 'end', color: REBAR, weight: 600,
  })
  P.push(...leader({
    x: bx + t2 / 2, y: D * 0.72,
    tx: bx + t2 + u * 3.6, ty: D * 0.72,
    text: r.ldhFits
      ? `BRANCH HORIZ. ⌀${Math.round(i.barDia)} — STD. 90° HOOK`
      : `BRANCH HORIZ. ⌀${Math.round(i.barDia)} — U-BAR, CLASS B LAP`,
    size: u * 1.2, color: REBAR,
  }))

  const notes = r.ldhFits
    ? [
      `ANCHOR THE BRANCH WALL'S HORIZONTAL BARS INTO THE THROUGH WALL TO DEVELOP fy — ℓdh = ${Math.round(r.ldh)}, 12db TAIL = ${Math.round(r.hookTail)} (§425.4.3 / §425.3.1)`,
      `THE THROUGH WALL'S HORIZONTAL BARS ARE NOT CUT AT THE INTERSECTION`,
      `ALTERNATIVELY LAP A SEPARATE TIE BAR CLASS B (${Math.round(r.lapB)}) EACH SIDE (§425.5.2)`,
      `MAX. BAR SPACING ${Math.round(r.sMax)} (§411.7.2.1/§411.7.3.1); ${r.curtains} CURTAIN(S) (§411.7.2.3)`,
    ]
    : [
      `ℓdh = ${Math.round(r.ldh)} DOES NOT FIT THE ${Math.round(r.ldhAvail)} AVAILABLE IN A ${Math.round(i.t)} WALL — DETAIL AS A U-BAR LAPPED CLASS B (${Math.round(r.lapB)}) WITH THE THROUGH WALL'S HORIZONTALS (§425.5.2)`,
      `THE THROUGH WALL'S HORIZONTAL BARS ARE NOT CUT AT THE INTERSECTION`,
      `A SMALLER BRANCH BAR WOULD LET THE STANDARD HOOK BE USED — ℓdh SCALES WITH db (§425.4.3.1)`,
      `MAX. BAR SPACING ${Math.round(r.sMax)} (§411.7.2.1/§411.7.3.1); ${r.curtains} CURTAIN(S) (§411.7.2.3)`,
    ]
  const title = `TYPICAL WALL INTERSECTION — ${mark}`
  const d = frame(P, title, notes, r.notes, W, D, u, opts)
  return { ...d, title, result: r }
}

/**
 * CONSTRUCTION JOINT — a wall elevation across a horizontal pour joint.
 *
 * The drawing carries the two things the joint depends on and a bar schedule
 * cannot state: that the surface is roughened to a full 6 mm amplitude, and
 * that the vertical steel crossing the joint is the shear-friction steel
 * §422.9 counted on.
 */
export function buildWallJointDetail(i: WallDetailInput, opts: WallDetailOptions = {}): WallDetailDrawing {
  const r = designWallDetail(i)
  const P: PlanPrimitive[] = []
  const W = Math.max(i.lw ?? 3, 1.5)
  const H = Math.max(W * 0.45, 1.2)
  const u = W / 34
  const mark = i.mark ?? 'W1'
  const jy = H * 0.5                             // joint elevation on the sheet
  const vs = Math.max(i.vertSpacing ?? i.spacing, 1) / 1000
  const lapAbove = r.lapB / 1000

  // ── wall elevation, poured in two lifts ──
  P.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, stroke: INK, width: 1.3, fill: CONC })
  // Outside the wall: inside it these printed across the bars.
  P.push({ kind: 'text', x: W + u * 1.2, y: jy - u * 1.8, text: 'SECOND POUR', size: u * 1.15, anchor: 'start', color: NOTE })
  P.push({ kind: 'text', x: W + u * 1.2, y: jy + u * 1.8, text: 'FIRST POUR', size: u * 1.15, anchor: 'start', color: NOTE })

  // ── the joint itself, drawn as the roughened line it has to be ──
  const teeth = Math.max(8, Math.round(W / (u * 1.6)))
  const cmds: { c: 'M' | 'L'; x: number; y: number }[] = [{ c: 'M', x: 0, y: jy }]
  for (let k = 1; k <= teeth; k++) {
    cmds.push({ c: 'L', x: (W * k) / teeth, y: jy + (k % 2 === 0 ? 0 : -u * 0.55) })
  }
  P.push({ kind: 'path', cmds, stroke: INK, width: 1.6, join: 'miter' })

  // ── vertical bars crossing it — the shear-friction steel ──
  const n = Math.max(2, drawCount(W, vs * 1000))
  for (let k = 0; k <= n; k++) {
    const x = (W * (k + 0.5)) / (n + 1)
    P.push({ kind: 'line', x1: x, y1: H * 0.04, x2: x, y2: H * 0.96, stroke: REBAR, width: 1.2 })
  }
  // the lap above the joint, marked on one bar
  P.push({ kind: 'dim', x1: -u * 2.4, y1: jy - lapAbove, x2: -u * 2.4, y2: jy, text: `LAP ${Math.round(r.lapB)}`, off: 0, size: u * 1.3 })

  // ── horizontal bars, dashed on the far face ──
  const rows = Math.max(2, drawCount(H, i.spacing))
  for (let k = 1; k < rows; k++) {
    const y = (H * k) / rows
    if (Math.abs(y - jy) < u * 0.9) continue
    P.push({ kind: 'line', x1: W * 0.03, y1: y, x2: W * 0.97, y2: y, stroke: REBAR, width: 0.6, dash: [u * 0.9, u * 0.7] })
  }

  P.push({ kind: 'dim', x1: 0, y1: H + u * 2.4, x2: W, y2: H + u * 2.4, text: `ℓw = ${Math.round(W * 1000)}`, off: 0, size: u * 1.4 })

  const j = r.joint
  const notes = [
    `ROUGHEN THE JOINT TO A FULL ${ROUGHENING_AMPLITUDE} mm AMPLITUDE AND REMOVE ALL LAITANCE BEFORE THE NEXT POUR (§426.5.6)`,
    `THE VERTICAL BARS CROSSING THE JOINT ARE THE SHEAR-FRICTION REINFORCEMENT (§422.9) — NO SEPARATE DOWELS WHERE THEY SUFFICE`,
    `SPLICE VERTICAL BARS ABOVE THE JOINT — CLASS B LAP ${Math.round(r.lapB)} (§425.5.2)`,
  ]
  if (j) {
    notes.push(
      `μ = ${j.mu.toFixed(2)} (${(i.surface ?? 'roughened').toUpperCase().replace(/-/g, ' ')}, TABLE 422.9.4.2) — Avf REQ'D ${Math.round(j.Avf)} mm², PROVIDED ${Math.round(r.AvfProvided ?? 0)} mm²`,
      `φVn,max = ${Math.round(j.phiVnMax)} kN FOR THIS INTERFACE (§422.9.4.4); Vu = ${Math.round(i.Vu ?? 0)} kN`,
    )
  }
  const title = `TYPICAL WALL CONSTRUCTION JOINT — ${mark}`
  const d = frame(P, title, notes, r.notes, W, H, u, opts)
  return { ...d, title, result: r }
}

// Re-exported so the existing callers and tests keep their import site; the
// implementation now lives in `detailSheet` as a single copy.
export { GLYPH_W, wrapNote }
