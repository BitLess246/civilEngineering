// ─────────────────────────────────────────────────────────────────────────
// Tributary (load-path) engine — Phase 3 of the 3D roadmap. A slab panel's
// area loads are distributed to its edge beams as EQUIVALENT UNIFORM LINE
// LOADS (NSCP two-way slab simplification), so each beam sees a clean UDL —
// linear shear, parabolic moment, no meshing artefacts:
//   · one-way (long/short ≥ 2): the two LONG edges carry w = q·lx/2; the
//     short edges carry none.
//   · two-way (45° tributary): the actual load is a TRIANGLE on the short
//     edges (peak q·lx/2) and a TRAPEZOID on the long edges. Each is replaced
//     by the load-conserving equivalent uniform load:
//       – short (triangle):  w = q·lx/4              (= peak/2)
//       – long  (trapezoid): w = (q·lx/2)(1 − lx/2ly)
//     These reproduce the exact edge TOTAL (so reactions, columns and
//     footings stay in equilibrium) while keeping the line load uniform.
// Loads carry their NSCP category and feed the beam & frame solvers directly.
// Units: spans m; q kPa (kN/m²); line loads kN/m.
// ─────────────────────────────────────────────────────────────────────────
import type { BeamLoad, LoadCategory } from './beamAnalysis'
import { loadResultant } from './beamAnalysis'

export interface AreaLoad { q: number; cat: LoadCategory }

export type PanelBehaviour = 'one-way' | 'two-way'
export type EdgeKind = 'long' | 'short'

export interface EdgeLoads {
  edge: 'L1' | 'L2' | 'S1' | 'S2'   // two long, two short edges
  kind: EdgeKind
  length: number                    // m
  /** Peak line-load intensity per category source, kN/m (Σq·lx/2 across cats). */
  peak: number
  loads: BeamLoad[]                 // udl / vdl along the edge, x from one end
  /** Total carried by this edge (all categories), kN. */
  total: number
}

export interface TributaryResult {
  lx: number                        // short span, m
  ly: number                        // long span, m
  ratio: number                     // ly / lx ≥ 1
  behaviour: PanelBehaviour
  edges: EdgeLoads[]
  /** Σ over edges — must equal q·lx·ly per category (closure). */
  totalApplied: number
  totalDistributed: number
}

function sumW(loads: BeamLoad[]): number {
  return loads.reduce((s, ld) => s + loadResultant(ld).W, 0)
}

/**
 * Distribute the panel's area loads to its four edges.
 * `a` × `b` are the panel plan dimensions (m) in any order.
 */
export function distributePanel(a: number, b: number, areaLoads: AreaLoad[]): TributaryResult {
  const lx = Math.min(a, b)
  const ly = Math.max(a, b)
  const ratio = ly / Math.max(lx, 1e-9)
  const behaviour: PanelBehaviour = ratio >= 2 ? 'one-way' : 'two-way'

  const qTot = areaLoads.reduce((s, l) => s + l.q, 0)
  const peak = (qTot * lx) / 2

  const mkLong = (edge: 'L1' | 'L2'): EdgeLoads => {
    const loads: BeamLoad[] = []
    for (const al of areaLoads) {
      const p = (al.q * lx) / 2
      if (Math.abs(p) < 1e-12) continue
      // one-way → full q·lx/2; two-way → load-conserving trapezoid EUL
      const w = behaviour === 'one-way' ? p : p * (1 - lx / (2 * ly))
      loads.push({ type: 'udl', x1: 0, x2: ly, w, cat: al.cat })
    }
    return { edge, kind: 'long', length: ly, peak, loads, total: sumW(loads) }
  }

  const mkShort = (edge: 'S1' | 'S2'): EdgeLoads => {
    const loads: BeamLoad[] = []
    if (behaviour === 'two-way') {
      for (const al of areaLoads) {
        const p = (al.q * lx) / 2
        if (Math.abs(p) < 1e-12) continue
        // load-conserving triangle EUL: w = q·lx/4 (= peak/2)
        loads.push({ type: 'udl', x1: 0, x2: lx, w: p / 2, cat: al.cat })
      }
    }
    return { edge, kind: 'short', length: lx, peak: behaviour === 'two-way' ? peak : 0, loads, total: sumW(loads) }
  }

  const edges = [mkLong('L1'), mkLong('L2'), mkShort('S1'), mkShort('S2')]
  return {
    lx, ly, ratio, behaviour, edges,
    totalApplied: qTot * lx * ly,
    totalDistributed: edges.reduce((s, e) => s + e.total, 0),
  }
}

/** Wall self-weight as a line load on its supporting member, kN/m. */
export function wallLineLoad(thicknessMm: number, heightM: number, gammaConc = 24): number {
  return (thicknessMm / 1000) * heightM * gammaConc
}
