// ─────────────────────────────────────────────────────────────────────────
// Two-way slab — Direct Design Method (NSCP 2015 §408.10 / ACI 318-14 §8.10).
//   Total static moment  Mo = wu·ℓ2·ℓn²/8           (§408.10.3)
//   split into negative / positive (interior or end span, §408.10.4) then into
//   column-strip / middle-strip shares (§408.10.5/6), each reinforced for
//   flexure with the §408.6.1.1 temperature/shrinkage minimum and §408.7.2.2
//   maximum spacing. Beam stiffness αf is conservatively neglected for the
//   SLAB steel (the bounding beams are designed separately by the frame
//   pipeline), so the slab carries the full column-strip share.
// Units: spans m; loads kPa; h/cover/db mm; moments kN·m; steel mm².
// ─────────────────────────────────────────────────────────────────────────
import { flexuralSteel } from './flexure'

export interface SlabInput {
  lx: number; ly: number          // centre-to-centre spans, m (lx ≤ ly used as short/long)
  colWidth: number                // support width along the span, mm (clear-span deduction)
  D: number; L: number            // service area loads, kPa
  fc: number; fy: number
  h?: number                      // slab thickness, mm (defaults to the §408.3.1.2 minimum)
  cover?: number; barDia?: number
  /** Is the panel's span an END span (one discontinuous edge) in each dir? */
  exterior?: { x: boolean; y: boolean }
  /** Beams on all edges (grid panels) → end-span coefficients per case (b). */
  withBeams?: boolean
}

export interface SlabSectionSteel {
  M: number                       // kN·m on the strip
  b: number                       // strip width, mm
  As: number; bars: number; spacing: number; usedMin: boolean
}
export interface SlabLocation {
  name: 'Ext −M' | '+M' | 'Int −M' | 'Support −M'
  coeff: number                   // fraction of Mo
  M: number                       // kN·m (total across ℓ2)
  csFrac: number                  // column-strip share
  column: SlabSectionSteel
  middle: SlabSectionSteel
}
export interface SlabDirResult {
  dir: 'x' | 'y'
  l1: number; l2: number; ln: number
  Mo: number
  csWidth: number; msWidth: number   // m
  locations: SlabLocation[]
}
export interface SlabDesignResult {
  h: number; hmin: number; wu: number
  ratio: number                   // long/short
  twoWay: boolean
  applicable: boolean
  notes: string[]
  x: SlabDirResult
  y: SlabDirResult
}

const interp = (r: number, a: number, b: number, c: number): number =>
  r <= 0.5 ? a : r >= 2 ? c : r <= 1 ? a + (b - a) * (r - 0.5) / 0.5 : b + (c - b) * (r - 1) / 1

// Column-strip share of each moment (slab WITHOUT beams, βt = 0), by ℓ2/ℓ1.
const csInteriorNeg = (r: number) => interp(r, 0.90, 0.75, 0.45)
const csPositive = (r: number) => interp(r, 0.60, 0.60, 0.45)
const csExteriorNeg = () => 1.0       // no edge beam → column strip takes all

export function designSlabDDM(i: SlabInput): SlabDesignResult {
  const cover = i.cover ?? 20, db = i.barDia ?? 12, Ab = (Math.PI / 4) * db * db
  const short = Math.min(i.lx, i.ly), long = Math.max(i.lx, i.ly)
  const ratio = long / short
  const twoWay = ratio < 2
  const wu = 1.2 * i.D + 1.6 * i.L

  // minimum thickness (two-way with beams, αfm ≥ 2 governing form, §408.3.1.2)
  const lnLong = long - i.colWidth / 1000
  const lnShort = short - i.colWidth / 1000
  const beta = lnLong / Math.max(lnShort, 1e-9)
  const hmin = Math.max(90, (lnLong * 1000 * (0.8 + i.fy / 1400)) / (36 + 9 * beta))
  const h = i.h ?? Math.ceil(hmin / 5) * 5

  const notes: string[] = []
  if (!twoWay) notes.push('Long/short > 2 → behaves one-way; DDM (two-way) not applicable.')
  if (i.L > 2 * i.D) notes.push('Live load > 2× dead — outside DDM limit §408.10.2.6 (unfactored L/D ≤ 2).')
  if (i.h !== undefined && i.h < hmin) notes.push(`Thickness ${i.h} mm < minimum ${Math.round(hmin)} mm (§408.3.1.2).`)
  notes.push('DDM assumes ≥ 3 spans each way, roughly equal spans and ≤ 10% column offset.')
  notes.push('Beam stiffness αf neglected for slab steel (conservative; beams designed separately).')

  const dir = (which: 'x' | 'y'): SlabDirResult => {
    const l1 = which === 'x' ? i.lx : i.ly
    const l2 = which === 'x' ? i.ly : i.lx
    const ln = Math.max(0.65 * l1, l1 - i.colWidth / 1000)
    const Mo = (wu * l2 * ln * ln) / 8
    const r = l2 / l1
    const csWidth = 2 * Math.min(0.25 * l1, 0.25 * l2)   // m
    const msWidth = Math.max(0, l2 - csWidth)
    // effective depth — short dir uses the outer layer, long dir the inner
    const d = which === (i.lx <= i.ly ? 'x' : 'y') ? h - cover - db / 2 : h - cover - 1.5 * db

    const isEnd = i.exterior?.[which] ?? false
    const withBeams = i.withBeams ?? true
    // (coeff of Mo, location name, column-strip fraction)
    const spec: [number, SlabLocation['name'], number][] = isEnd
      ? withBeams
        ? [[0.16, 'Ext −M', csExteriorNeg()], [0.57, '+M', csPositive(r)], [0.70, 'Int −M', csInteriorNeg(r)]]
        : [[0.26, 'Ext −M', csExteriorNeg()], [0.52, '+M', csPositive(r)], [0.70, 'Int −M', csInteriorNeg(r)]]
      : [[0.65, 'Support −M', csInteriorNeg(r)], [0.35, '+M', csPositive(r)]]

    const steel = (M: number, b: number): SlabSectionSteel => {
      const flex = flexuralSteel({ Mu: Math.abs(M), b, d, fc: i.fc, fy: i.fy })
      const asMin = (i.fy >= 420 ? 0.0018 : 0.002) * b * h    // §408.6.1.1 temp/shrinkage
      const As = Math.max(flex.As, asMin)
      const smax = Math.min(2 * h, 450)                        // §408.7.2.2
      const n = Math.max(2, Math.ceil(As / Ab), Math.ceil(b / smax))
      return { M: Math.abs(M), b, As, bars: n, spacing: (b - db) / (n - 1), usedMin: As <= asMin + 1e-9 }
    }

    const locations: SlabLocation[] = spec.map(([coeff, name, csFrac]) => {
      const M = coeff * Mo
      return {
        name, coeff, M, csFrac,
        column: steel(csFrac * M, csWidth * 1000),
        middle: steel((1 - csFrac) * M, msWidth * 1000),
      }
    })
    return { dir: which, l1, l2, ln, Mo, csWidth, msWidth, locations }
  }

  return {
    h, hmin, wu, ratio, twoWay,
    applicable: twoWay && i.L <= 2 * i.D,
    notes, x: dir('x'), y: dir('y'),
  }
}
