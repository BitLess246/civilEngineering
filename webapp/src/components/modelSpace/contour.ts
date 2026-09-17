// ─────────────────────────────────────────────────────────────────────────
// Shell stress CONTOUR internals — the pure half of ShellContourPanel.
//
// Three jobs the old SVG panel got wrong, pulled out here where they can be
// tested without a DOM:
//   1. PLATE GROUPING — one flat 2D projection of every panel in the model
//      overlaps walls onto slabs and storey upon storey. Each panel gets its
//      own best-fit plane and its own tile instead.
//   2. BARYCENTRIC SAMPLING — the maths the canvas rasteriser uses to blend
//      the three corner values across a triangle, which is what makes the
//      contour continuous from one element to the next (a shared edge
//      interpolates the same two node colours on both sides).
//
// NO COLOUR RAMP LIVES HERE. It did — a blue→cyan→green→yellow→red ramp with
// its own `heatRGB`/`heatColorCss`/`heatGradientCss` — and NOTHING imported
// any of it: the panel's legend takes `rampSwatches` from `lib/stressScale`
// and its canvas takes `stressColorRGB` from the same place, which is what
// keeps the swatch and the pixel the same number. A second ramp definition
// beside the real one is the drift that #771 existed to remove, so it is gone
// rather than left as a tempting import.
// ─────────────────────────────────────────────────────────────────────────
import { triFrame, type ShellNode, type ShellElem, type V3 } from '../../engine/shell'

export type StressKey =
  | 'vmSurf' | 'vonMises' | 'sigmaX' | 'sigmaY' | 'tauXY'
  | 'sigma1' | 'sigma2' | 'Mx' | 'My' | 'Mxy'

// ── Plate grouping + per-panel best-fit projection ─────────────────────────

export interface PlateGroup {
  id: string
  elems: ShellElem[]
  /** Nodes touched by this panel's elements (subset of `nodes`). */
  nodes: ShellNode[]
  /** Best-fit plane axes: rows = [x̂, ŷ, ẑ] (area-weighted over the panel's
   *  triangles — the same fit `toPanelFrames` rotates the stresses into). */
  frame: [V3, V3, V3]
  /** Origin of the 2D projection (area-weighted centroid), m. */
  origin: V3
}

/** Group shell elements by their panel (element ids are `{plateId}_i_j_k` —
 *  the prefix before the first underscore) and fit each panel's plane. */
export function groupPlates(nodes: ShellNode[], elems: ShellElem[]): PlateGroup[] {
  const posById = new Map(nodes.map((n) => [n.id, [n.x, n.y, n.z] as V3]))
  const byPlate = new Map<string, ShellElem[]>()
  for (const e of elems) {
    const pid = e.id.slice(0, e.id.indexOf('_'))
    const list = byPlate.get(pid)
    if (list) list.push(e)
    else byPlate.set(pid, [e])
  }

  const groups: PlateGroup[] = []
  for (const [id, pes] of byPlate) {
    let A = 0
    const xs: V3 = [0, 0, 0], zs: V3 = [0, 0, 0], org: V3 = [0, 0, 0]
    for (const e of pes) {
      const p = e.nodes.map((nid) => posById.get(nid)!)
      if (p.some((q) => !q)) continue
      const f = triFrame(p[0] as V3, p[1] as V3, p[2] as V3)
      A += f.A
      for (let k = 0; k < 3; k++) {
        xs[k] += f.R[0][k] * f.A
        zs[k] += f.R[2][k] * f.A
        org[k] += ((p[0] as V3)[k] + (p[1] as V3)[k] + (p[2] as V3)[k]) / 3 * f.A
      }
    }
    if (A < 1e-12) continue
    const z = norm3(zs)
    const proj: V3 = [xs[0] - dot3(xs, z) * z[0], xs[1] - dot3(xs, z) * z[1], xs[2] - dot3(xs, z) * z[2]]
    const x = norm3(Math.hypot(proj[0], proj[1], proj[2]) > 1e-9 ? proj : xs)
    const y = cross3(z, x)
    const idSet = new Set<string>()
    for (const e of pes) for (const nid of e.nodes) idSet.add(nid)
    groups.push({
      id, elems: pes, frame: [x, y, z], origin: [org[0] / A, org[1] / A, org[2] / A],
      nodes: nodes.filter((n) => idSet.has(n.id)),
    })
  }
  return groups
}

/** Project a node onto a panel's best-fit plane → panel 2D (u, v), m. */
export function projectNode(n: ShellNode, g: PlateGroup): [number, number] {
  const p: V3 = [n.x - g.origin[0], n.y - g.origin[1], n.z - g.origin[2]]
  return [dot3(p, g.frame[0]), dot3(p, g.frame[1])]
}

// ── Barycentric interpolation ────────────────────────────────────────────────

/** Barycentric weights of point p in triangle (p0,p1,p2), or null if outside
 *  (ε-tolerant so edge pixels belong to exactly one neighbour deterministically
 *  enough for colouring — the colours agree on shared edges anyway). */
export function barycentric(
  p: [number, number], p0: [number, number], p1: [number, number], p2: [number, number],
): [number, number, number] | null {
  const d = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
  if (Math.abs(d) < 1e-12) return null
  const w1 = ((p[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p[1] - p0[1])) / d
  const w2 = ((p1[0] - p0[0]) * (p[1] - p0[1]) - (p[0] - p0[0]) * (p1[1] - p0[1])) / d
  const w0 = 1 - w1 - w2
  const eps = -1e-9
  if (w0 < eps || w1 < eps || w2 < eps) return null
  return [w0, w1, w2]
}

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]
function norm3(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
