// ─────────────────────────────────────────────────────────────────────────
// SHELL CONTOUR DATA — the nodal field and its domain, for whoever paints it.
//
// Separate from the component that draws it because the LEGEND needs the same
// domain the mesh was coloured with. Recomputing it beside the legend is how a
// colour bar ends up labelled with numbers the picture does not use — and a
// component file cannot export this without breaking fast refresh.
// ─────────────────────────────────────────────────────────────────────────
import type { ShellNode, ShellElem, ElementStress } from '../engine/shell'
import { shellNodalContour } from '../engine/shell'
import {
  isSigned, stressDomain, normalise, stressColorRGB, type Domain, type StressKey,
} from './stressScale'

export interface ContourData {
  /** Smoothed value at each mesh node. */
  nodal: Map<string, number>
  domain: Domain
  /** Extreme element, for the read-out beside the legend. */
  peak: { id: string; value: number } | null
}

/**
 * Nodal field + domain for one quantity.
 *
 * Exported because the legend needs the SAME domain the mesh was coloured
 * with. Recomputing it beside the legend is how a colour bar ends up labelled
 * with numbers the picture does not use.
 */
export function contourData(
  nodes: readonly ShellNode[], elems: readonly ShellElem[],
  stresses: readonly ElementStress[], key: StressKey,
): ContourData {
  const nodal = shellNodalContour(nodes as ShellNode[], elems as ShellElem[], stresses as ElementStress[], key)
  const domain = stressDomain([...nodal.values()], isSigned(key))
  let peak: { id: string; value: number } | null = null
  for (const s of stresses) {
    const v = s[key] as number
    if (!Number.isFinite(v)) continue
    if (!peak || Math.abs(v) > Math.abs(peak.value)) peak = { id: s.id, value: v }
  }
  return { nodal, domain, peak }
}

/** Flat buffers for a vertex-coloured triangle mesh. */
export interface ContourGeometry {
  /** xyz per node, metres. */
  position: Float32Array
  /** rgb per node, 0–1. */
  color: Float32Array
  /** Triangle indices into the node arrays. */
  index: number[]
}

/**
 * Build the contour mesh buffers.
 *
 * Pure, and separate from the component, because this project cannot trust a
 * screenshot of a WebGL canvas — the capture reads black often enough that
 * pixels are not evidence. The geometry is therefore checked as numbers.
 *
 * One colour per NODE, not per element: the mesh is conforming, so
 * neighbouring triangles share nodes and the colour interpolates across the
 * edge. Colouring per element draws the same field as a mosaic of flat facets,
 * which reads as a step change in stress at every element boundary — an
 * artefact of the mesh rather than anything in the structure.
 */
export function contourGeometry(
  nodes: readonly ShellNode[], elems: readonly ShellElem[],
  nodal: Map<string, number>, domain: Domain,
): ContourGeometry | null {
  if (nodes.length === 0 || elems.length === 0) return null
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const position = new Float32Array(nodes.length * 3)
  const color = new Float32Array(nodes.length * 3)
  nodes.forEach((n, i) => {
    position[i * 3] = n.x; position[i * 3 + 1] = n.y; position[i * 3 + 2] = n.z
    const [r, g, b] = stressColorRGB(normalise(nodal.get(n.id) ?? 0, domain), domain.signed)
    color[i * 3] = r; color[i * 3 + 1] = g; color[i * 3 + 2] = b
  })
  // An element naming a node the mesh does not carry is SKIPPED rather than
  // indexed as undefined: three.js turns that into a triangle at the origin,
  // which draws as a stray shard hanging off the model.
  const tri: number[] = []
  for (const e of elems) {
    const a = index.get(e.nodes[0]), b = index.get(e.nodes[1]), c = index.get(e.nodes[2])
    if (a === undefined || b === undefined || c === undefined) continue
    tri.push(a, b, c)
  }
  return tri.length ? { position, color, index: tri } : null
}
