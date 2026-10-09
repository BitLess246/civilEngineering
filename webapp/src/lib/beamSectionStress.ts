// ─────────────────────────────────────────────────────────────────────────
// The strain and stress diagrams, drawn INTO a beam's section detail — joined
// to the actual cut section on its right, at the section's own depth scale.
//
//   section │ strain (linear)       │ stress at nominal strength
//           │ εcu = 0.003 at the     │ Whitney's block 0.85f′c over a,
//           │ compression face, zero │ C at a/2, T at d (C′s at d′ when the
//           │ at the N.A., inverting │ compression steel counts)
//           │ to εs at the steel     │
//
// The compression face, the neutral axis and the steel level are carried
// across all three as projection lines, so each diagram reads against the
// section it describes (ACI 318-14 §22.2.1–22.2.2). World units: metres, y
// DOWN the page from the section's top face — the section detail's own frame.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive } from '../engine/planRenderer'
import type { StressBlock } from './beamStressBlock'

const INK = '#1e293b'
const FAINT = '#94a3b8'
const COMP = '#b3402a'
const COMP_FILL = 'rgba(179,64,42,0.16)'
const TENS = '#0f4c92'
const TENS_FILL = 'rgba(15,76,146,0.12)'

export interface StressDiagramInput {
  /** Section width, depth, effective depth, compression-steel depth — mm. */
  b: number; h: number; d: number; dPrime: number
  fc: number; fy: number
  s: StressBlock
  hogging?: boolean
  /** Steel modulus, MPa. */
  Es?: number
}

export interface StressDiagramGeometry {
  /** Page y (m) of the compression face, the N.A., the steel, a and a/2. */
  yFace: number; yNA: number; ySteel: number; yA: number; yC: number
  /** Steel strain at d, and whether it reached yield. */
  epsS: number; yields: boolean
}

export function stressDiagramGeometry(i: StressDiagramInput): StressDiagramGeometry {
  const H = i.h / 1000
  const depth = (mm: number) => (i.hogging ? H - mm / 1000 : mm / 1000)
  const epsS = (0.003 * (i.d - i.s.c)) / Math.max(i.s.c, 1e-9)
  return {
    yFace: depth(0), yNA: depth(i.s.c), ySteel: depth(i.d), yA: depth(i.s.a), yC: depth(i.s.a / 2),
    epsS, yields: epsS >= i.fy / (i.Es ?? 200_000),
  }
}

/** The section detail with the two diagrams appended to its right. */
export function withStressDiagrams<T extends Drawing>(section: T, i: StressDiagramInput): T {
  const W = i.b / 1000, H = i.h / 1000
  const span = Math.max(W, H)
  const size = span * 0.05
  const off = span * 0.16
  const u0 = -W / 2, u1 = W / 2
  const g = stressDiagramGeometry(i)
  const P: PlanPrimitive[] = []

  // columns: the section's own h-dimension sits at u1 + off
  // ONE strain scale for both triangles — strain is linear through the depth,
  // so εcu at the face and εs at the steel lie on a single straight line
  // through the N.A. (ws/c = wt/(d − c)). The larger of the two is fitted.
  const kEps = (span * 0.55) / Math.max(0.003, g.epsS)
  const ws = 0.003 * kEps                     // εcu drawn this wide
  const wt = g.epsS * kEps                    // εs on the same scale
  // the tension triangle opens to the LEFT of the strain axis, so the axis
  // sits a full tension width clear of the section's own h dimension
  const xs = u1 + off + size * 1.8 + wt       // strain axis
  const xb = xs + ws + size * 4.2             // stress axis
  const wb = span * 0.34                      // 0.85f′c drawn this wide
  const xArrow = xb + wb + span * 0.42        // the force arrows' free ends
  const xEnd = xArrow + size * 2.2

  // projection lines from the section: compression face, N.A., steel level
  P.push({ kind: 'line', x1: u1, y1: g.yFace, x2: xb + wb, y2: g.yFace, stroke: FAINT, width: 0.5, dash: [0.012, 0.01] })
  P.push({ kind: 'line', x1: u0, y1: g.yNA, x2: xb + wb + size * 1.2, y2: g.yNA, stroke: FAINT, width: 0.9, dash: [0.03, 0.015] })
  P.push({ kind: 'line', x1: u0, y1: g.ySteel, x2: xs - wt - size, y2: g.ySteel, stroke: TENS, width: 0.6, dash: [0.03, 0.01, 0.006, 0.01] })
  P.push({ kind: 'text', x: xb + wb + size * 1.4, y: g.yNA, text: `N.A.  c = ${Math.round(i.s.c)} mm`, size: size * 0.78, color: FAINT })

  // ── strain: compression triangle to the right, inverting through the N.A.
  // into the tension triangle to the left, down to the steel ──
  P.push({ kind: 'line', x1: xs, y1: Math.min(g.yFace, g.ySteel) - size * 0.4, x2: xs, y2: Math.max(g.yFace, g.ySteel) + size * 0.4, stroke: INK, width: 1 })
  P.push({
    kind: 'path', closed: true, fill: COMP_FILL, stroke: COMP, width: 1,
    cmds: [{ c: 'M', x: xs, y: g.yFace }, { c: 'L', x: xs + ws, y: g.yFace }, { c: 'L', x: xs, y: g.yNA }],
  })
  P.push({
    kind: 'path', closed: true, fill: TENS_FILL, stroke: TENS, width: 1,
    cmds: [{ c: 'M', x: xs, y: g.yNA }, { c: 'L', x: xs - wt, y: g.ySteel }, { c: 'L', x: xs, y: g.ySteel }],
  })
  P.push({ kind: 'text', x: xs, y: g.yFace + (i.hogging ? size * 1.1 : -size * 0.9), text: 'εcu = 0.003', size: size * 0.78, anchor: 'start', color: COMP })
  P.push({ kind: 'text', x: xs - wt - size * 0.3, y: g.ySteel + (i.hogging ? -size * 0.9 : size * 0.9), text: `εs = ${g.epsS.toFixed(4)}${g.yields ? ' ≥ εy' : ''}`, size: size * 0.78, anchor: 'start', color: TENS })
  P.push({ kind: 'text', x: xs, y: -size * 2.4 + (i.hogging ? 0 : 0), text: 'STRAIN', size: size * 0.85, anchor: 'middle', color: INK, weight: 700 })

  // ── stress: Whitney's block and the resultants ──
  P.push({ kind: 'line', x1: xb, y1: Math.min(g.yFace, g.ySteel) - size * 0.4, x2: xb, y2: Math.max(g.yFace, g.ySteel) + size * 0.4, stroke: INK, width: 1 })
  P.push({ kind: 'rect', x: xb, y: Math.min(g.yFace, g.yA), w: wb, h: Math.abs(g.yA - g.yFace), fill: COMP_FILL, stroke: COMP, width: 1.2 })
  P.push({ kind: 'text', x: xb + wb / 2, y: g.yFace + (i.hogging ? size * 1.1 : -size * 0.9), text: `0.85f′c = ${(0.85 * i.fc).toFixed(1)} MPa`, size: size * 0.78, anchor: 'middle', color: COMP })
  P.push({ kind: 'text', x: xb + wb / 2, y: -size * 2.4, text: 'STRESS', size: size * 0.85, anchor: 'middle', color: INK, weight: 700 })
  const arrow = (xFrom: number, xTo: number, y: number, color: string) => {
    const hd = size * 0.55, dir = Math.sign(xTo - xFrom)
    P.push({ kind: 'line', x1: xFrom, y1: y, x2: xTo, y2: y, stroke: color, width: 1.8 })
    P.push({ kind: 'path', closed: true, fill: color, stroke: color, width: 0.5, cmds: [
      { c: 'M', x: xTo, y }, { c: 'L', x: xTo - dir * hd, y: y - hd * 0.5 }, { c: 'L', x: xTo - dir * hd, y: y + hd * 0.5 }] })
  }
  arrow(xArrow, xb + wb, g.yC, COMP)                       // C pushes on the block
  P.push({ kind: 'text', x: xArrow, y: g.yC - size * 0.75, text: `C = ${i.s.Cc.toFixed(1)} kN`, size: size * 0.82, anchor: 'end', color: COMP, weight: 700 })
  if (i.s.Cs > 0) {
    const yCs = i.hogging ? H - i.dPrime / 1000 : i.dPrime / 1000
    arrow(xArrow, xb, yCs, COMP)
    P.push({ kind: 'text', x: xArrow, y: yCs - size * 0.75, text: `C′s = ${i.s.Cs.toFixed(1)} kN`, size: size * 0.78, anchor: 'end', color: COMP })
  }
  arrow(xb, xArrow, g.ySteel, TENS)                        // T pulls away
  P.push({ kind: 'text', x: xArrow, y: g.ySteel - size * 0.75, text: `T = ${i.s.T.toFixed(1)} kN`, size: size * 0.82, anchor: 'end', color: TENS, weight: 700 })

  // ── dimensions: d off the section's compression face to its steel; a on
  // the block; the lever arm between C and T ──
  P.push({ kind: 'dim', x1: u0 - off, y1: g.yFace, x2: u0 - off, y2: g.ySteel, text: `d = ${Math.round(i.d)} mm`, off: 0, size: size * 0.9, ext: u0 })
  // a is short: its label sits IN the block it measures (below it when the
  // block is too thin to hold the text), not along a dimension it outruns
  P.push({ kind: 'dim', x1: xb - size * 1.6, y1: g.yFace, x2: xb - size * 1.6, y2: g.yA, text: '', off: 0, size: size * 0.75, ext: xb })
  const aFits = Math.abs(g.yA - g.yFace) > size * 0.95
  const yAText = aFits ? (g.yFace + g.yA) / 2 + size * 0.27 : g.yA + (i.hogging ? -size * 0.5 : size * 0.95)
  P.push({ kind: 'text', x: xb + wb / 2, y: yAText, text: `a = ${Math.round(i.s.a)} mm`, size: size * 0.75, anchor: 'middle', color: COMP })
  P.push({ kind: 'dim', x1: xEnd, y1: g.yC, x2: xEnd, y2: g.ySteel, text: `z = ${Math.round(Math.abs(g.ySteel - g.yC) * 1000)} mm`, off: 0, size: size * 0.8, ext: xArrow })

  const yMn = H + off + size * 0.4
  P.push({
    kind: 'text', x: (xs + xEnd) / 2, y: yMn,
    text: `Mn = ${i.s.Cs > 0 ? 'C(d − a/2) + C′s(d − d′)' : 'C(d − a/2)'} = ${i.s.Mn.toFixed(1)} kN·m   ·   depths to the section's scale, forces labelled`,
    size: size * 0.68, anchor: 'middle', color: FAINT,
  })

  return {
    ...section,
    primitives: [...section.primitives, ...P],
    bounds: {
      minX: Math.min(section.bounds.minX, u0 - off - size * 1.6),
      maxX: Math.max(section.bounds.maxX, xEnd + size * 1.4),
      minY: section.bounds.minY,
      maxY: Math.max(section.bounds.maxY, yMn + size),
    },
  }
}
