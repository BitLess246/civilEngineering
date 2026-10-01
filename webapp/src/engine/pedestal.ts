// ─────────────────────────────────────────────────────────────────────────
// THE RC PEDESTAL under a steel or timber column — from the top of the
// footing up to grade, where the base plate (or timber post base) sits.
//
// A steel column is not run down through the backfill to the pad: it stops on
// a short reinforced-concrete pedestal, the plate is grouted to its top, and
// the pedestal carries the column's forces into the footing. The frame is
// analysed with the column base fixed at grade on that pedestal (a stiff,
// short block — its own flexibility is neglected); this module sizes and
// checks the block for what the base delivers to it.
//
//   size     square, side = the column's larger plan dimension + 250 mm
//            (steel) / + 300 mm (timber), rounded up to 50, at least 400 /
//            300 — room for the plate and anchor-rod edge distance. A post
//            base's rods stand OUTSIDE the post (d/2 + 50), where a steel
//            plate's sit inside the flange tips; +300 keeps a ⌀16 rod 6·da =
//            96 mm from the face (ACI 318-14 §17.7.2, untorqued) — at +200 it
//            was 50 mm and on the pedestal's own bar line.
//   demand   Pu (+ its own weight at 1.2), and at its BASE the column-base
//            moment plus the base shear × pedestal height, each axis.
//   capacity ACI 318-14 / NSCP §410 strain compatibility, bars all around;
//            biaxial by the linear load contour Mux/φMn + Muy/φMn ≤ 1 at the
//            factored axial load (conservative for a square, symmetric cage),
//            and Pu ≤ φPn,max.
//   bars     ρ from 1% (§410.6.1.1) up to 4% in steps of four bars; ties per
//            §425.7.2.1: s ≤ min(16 db, 48 dt, side).
//   uplift   a net tension is carried by the bars alone: Tu ≤ 0.9·As·fy.
//
// Units: plan mm; height m; forces kN; moments kN·m; stresses MPa.
// ─────────────────────────────────────────────────────────────────────────
import { interaction, type InteractionInput } from './columnDesign'

export interface PedestalInput {
  /** What stands on it, and its plan dimensions (depth d, width bf / b), mm. */
  column: 'steel' | 'wood'
  colD: number; colB: number
  /** Pedestal height, top of footing to top of pedestal, m. */
  height: number
  /** Factored demands at the column base (pedestal top), one per load case. */
  cases: { Pu: number; Mx: number; Mz: number; Vx: number; Vz: number }[]
  fc: number; fy: number
  barDia?: number   // default 16
  tieDia?: number   // default 10
  cover?: number    // default 40
  gammaC?: number   // kN/m³, default 24
  /** A floor on the side, mm — the anchor rods' edge distance (ACI §17.7). */
  minSide?: number
}

export interface PedestalResult {
  side: number          // mm
  height: number        // m
  bars: number; barDia: number; tieDia: number; tieSpacing: number
  rho: number
  weight: number        // kN (service)
  /** The governing case: its axial load and the moments at the pedestal base. */
  Pu: number; Mux: number; Muz: number; Tu: number
  phiMn: number         // φMn about either axis at the governing Pu, kN·m
  phiPnMax: number      // kN
  util: number
  ok: boolean
}

export const pedestalSide = (column: 'steel' | 'wood', colD: number, colB: number): number =>
  column === 'steel'
    ? Math.max(400, Math.ceil((Math.max(colD, colB) + 250) / 50) * 50)
    : Math.max(300, Math.ceil((Math.max(colD, colB) + 300) / 50) * 50)

/** φMn of the section at a given factored axial load, by interpolating the
 *  φ-scaled interaction curve (Pn descending along it). */
function phiMnAt(i: InteractionInput, Pu: number): { phiMn: number; phiPnMax: number } {
  const r = interaction(i)
  const pts = r.curve.map((p) => ({ P: p.phi * p.Pn, M: p.phi * p.Mn }))
  const phiPnMax = r.phiC * r.PnMax
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k]
    if ((a.P - Pu) * (b.P - Pu) <= 0 && Math.abs(a.P - b.P) > 1e-9) {
      const t = (Pu - a.P) / (b.P - a.P)
      return { phiMn: a.M + t * (b.M - a.M), phiPnMax }
    }
  }
  // Below the curve's lowest axial point: the pure-flexure end.
  return { phiMn: Math.min(...pts.map((p) => p.M).filter((m) => m > 0)), phiPnMax }
}

export function designPedestal(i: PedestalInput): PedestalResult {
  const side = Math.max(pedestalSide(i.column, i.colD, i.colB), i.minSide ?? 0)
  const barDia = i.barDia ?? 16, tieDia = i.tieDia ?? 10, cover = i.cover ?? 40
  const gammaC = i.gammaC ?? 24
  const weight = gammaC * (side / 1000) ** 2 * i.height
  const Ab = (Math.PI / 4) * barDia ** 2
  const Ag = side * side
  const minBars = Math.max(4, Math.ceil((0.01 * Ag) / Ab / 4) * 4)
  const maxBars = Math.max(minBars, Math.floor((0.04 * Ag) / Ab / 4) * 4)

  const check = (bars: number) => {
    const sec: InteractionInput = { b: side, h: side, cover, barDia, tieDia, fc: i.fc, fy: i.fy, numBars: bars, layout: 'all-around' }
    let worst = { util: 0, Pu: 0, Mux: 0, Muz: 0, Tu: 0, phiMn: 0, phiPnMax: 0 }
    for (const c of i.cases) {
      const P = c.Pu + 1.2 * weight
      const Mux = Math.abs(c.Mx) + Math.abs(c.Vz) * i.height
      const Muz = Math.abs(c.Mz) + Math.abs(c.Vx) * i.height
      if (P < 0) {
        // net uplift: the bars alone (0.9·As·fy), plus the moment as above
        const Tu = -P
        const util = (Tu * 1000) / (0.9 * bars * Ab * i.fy)
        if (util > worst.util) worst = { util, Pu: P, Mux, Muz, Tu, phiMn: 0, phiPnMax: 0 }
        continue
      }
      const { phiMn, phiPnMax } = phiMnAt(sec, P)
      const util = Math.max(P / phiPnMax, phiMn > 1e-9 ? (Mux + Muz) / phiMn : Infinity)
      if (util > worst.util) worst = { util, Pu: P, Mux, Muz, Tu: 0, phiMn, phiPnMax }
    }
    return worst
  }

  let bars = minBars
  let w = check(bars)
  while (w.util > 1 && bars + 4 <= maxBars) { bars += 4; w = check(bars) }
  const tieSpacing = Math.floor(Math.min(16 * barDia, 48 * tieDia, side) / 25) * 25
  return {
    side, height: i.height, bars, barDia, tieDia, tieSpacing,
    rho: (bars * Ab) / Ag, weight,
    Pu: w.Pu, Mux: w.Mux, Muz: w.Muz, Tu: w.Tu, phiMn: w.phiMn, phiPnMax: w.phiPnMax,
    util: w.util, ok: w.util <= 1,
  }
}

/** Anchor-rod embedment into a pedestal, mm: 12·da (the hooked-rod rule of
 *  thumb), a 300 mm floor, and never closer than 100 mm to the pad. Not an
 *  ACI 318 Ch. 17 breakout design — the sheet says so. */
export const anchorEmbed = (dia: number, pedestalHeight: number): number =>
  Math.max(150, Math.min(Math.max(300, 12 * dia), Math.round(pedestalHeight * 1000 - 100)))

/** What sits on a pedestal: plate N (along d) × B × t, rods, grout bed — mm. */
export interface PedestalBearing {
  plate: { N: number; B: number; t: number }
  /** Rod count, diameter and embedment; where they stand (±x along N, ±y
   *  along B — absent: the plate's corners); headed (nut + washer) or hooked. */
  rods: { n: number; dia: number; embed: number; x?: number; y?: number; head?: 'headed' | 'hooked' }
  grout: number
}

/**
 * The hardware on a pedestal, sized once for the sheet and the take-off.
 *
 * Steel: the designed base plate (`designBasePlate`, whose defaults are 4
 * rods ⌀25) on a 25 mm grout bed. Timber: a NOMINAL post base — a 10 mm plate
 * 100 mm proud of the post each way along d (where its two ⌀16 rods stand) and
 * 20 mm across b, set straight on the concrete. Nothing checks the post base;
 * the drawing says so.
 */
export function pedestalBearing(
  column: 'steel' | 'wood', colD: number, colB: number, height: number,
  plate?: { N: number; B: number; t: number },
  anchors?: { da: number; hef: number; x: number; y: number },
): PedestalBearing {
  if (column === 'steel') {
    const p = plate ?? { N: colD + 100, B: colB + 100, t: 20 }
    // the DESIGNED rods (ACI 318-14 Ch. 17 in the pipeline): headed, at their
    // embedment and their places outside the flanges
    return anchors
      ? { plate: p, rods: { n: 4, dia: anchors.da, embed: anchors.hef, x: anchors.x, y: anchors.y, head: 'headed' }, grout: 25 }
      : { plate: p, rods: { n: 4, dia: 25, embed: anchorEmbed(25, height), head: 'headed' }, grout: 25 }
  }
  // a designed post base (engine/postBase) passes its plate and rods in;
  // without one, the nominal layout the drawing used to carry
  return {
    plate: plate ?? { N: colD + 200, B: colB + 40, t: 10 },
    rods: anchors
      ? { n: 2, dia: anchors.da, embed: anchors.hef, x: anchors.x, y: 0, head: 'headed' }
      : { n: 2, dia: 16, embed: anchorEmbed(16, height) },
    grout: 0,
  }
}

/** One anchor rod's cut length, mm: through grout and plate, a nut-and-washer
 *  projection of 3·da above, the embedment below, and the anchorage at the
 *  foot — a nut's thickness (1·da) past a headed rod's bearing face, or a
 *  90° foot of 4·da on a hooked one. */
export const anchorRodLength = (b: PedestalBearing): number =>
  b.rods.embed + b.grout + b.plate.t + 3 * b.rods.dia + ((b.rods.head ?? 'hooked') === 'headed' ? 1 : 4) * b.rods.dia
