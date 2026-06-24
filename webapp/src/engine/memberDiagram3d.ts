// ─────────────────────────────────────────────────────────────────────────
// 3D internal-force diagram ribbons (BMD / SFD / axial / torsion). Turns a
// member's sampled internal-force arrays (from F3MemberResult) into geometry
// that can be drawn directly on the member in the 3D view — STAAD's inline
// force-diagram overlay. Pure + tested; the page only feeds it the member
// endpoints, the chosen component's ordinates, and a scale.
//
// Offset convention (local axes from frame3d.localAxes = [x′, y′, z′]):
//   Mz / Vy act in the x′-y′ plane → drawn offset along local y′,
//   My / Vz act in the x′-z′ plane → drawn offset along local z′,
//   N (axial) along y′ and T (torsion) along z′ (no natural plane).
// For a horizontal member y′ is global-up, so the gravity BMD reads vertically;
// for a column both transverse axes are horizontal (lateral diagrams).
// ─────────────────────────────────────────────────────────────────────────
import { localAxes, type V3 } from './frame3d'

export type DiagramComp = 'N' | 'Vy' | 'Vz' | 'T' | 'My' | 'Mz'

/** Which local transverse axis (index into [x′, y′, z′]) each component offsets along. */
const OFFSET_AXIS: Record<DiagramComp, 1 | 2> = {
  Mz: 1, Vy: 1, N: 1,   // local y′
  My: 2, Vz: 2, T: 2,   // local z′
}

export interface DiagramRibbon {
  /** Ordinate polyline: member axis + offset·value·scale at each station. */
  curve: V3[]
  /** Member-axis baseline at the same stations (the zero line). */
  base: V3[]
  /** Triangulated strip positions (flat number[], two triangles per segment). */
  fill: number[]
}

/**
 * Build the 3D ribbon for one force component along a member a→b. `xs` are the
 * stations in metres (0…L) and `ys` the ordinates (kN or kN·m). `scale` is the
 * transverse offset in metres per force unit.
 */
export function memberDiagramRibbon(
  a: V3, b: V3, xs: number[], ys: number[], comp: DiagramComp, scale: number,
): DiagramRibbon {
  const dir: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const L = Math.hypot(...dir) || 1
  const off = localAxes(dir)[OFFSET_AXIS[comp]]   // unit transverse axis, global coords

  const base: V3[] = []
  const curve: V3[] = []
  for (let i = 0; i < xs.length; i++) {
    const t = xs[i] / L                            // station fraction 0…1
    const p: V3 = [a[0] + dir[0] * t, a[1] + dir[1] * t, a[2] + dir[2] * t]
    base.push(p)
    const d = (ys[i] ?? 0) * scale
    curve.push([p[0] + off[0] * d, p[1] + off[1] * d, p[2] + off[2] * d])
  }

  // Triangulate the strip: (base[i], base[i+1], curve[i+1]) + (base[i], curve[i+1], curve[i]).
  const fill: number[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    const b0 = base[i], b1 = base[i + 1], c0 = curve[i], c1 = curve[i + 1]
    fill.push(...b0, ...b1, ...c1, ...b0, ...c1, ...c0)
  }
  return { base, curve, fill }
}

/** Symmetric scale mapping the largest |ordinate| to ~`target` metres of offset.
 *  Returns 0 when everything is ~0 (nothing to draw). */
export function diagramScale(maxAbs: number, target: number): number {
  return maxAbs > 1e-9 ? target / maxAbs : 0
}
