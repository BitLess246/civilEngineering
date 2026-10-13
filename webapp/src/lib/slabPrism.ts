// ─────────────────────────────────────────────────────────────────────────
// A SLAB PANEL AS DRAWN — a prism through its four corner NODES.
//
// It was an axis-aligned box: centred on the corners' average, sized from two
// edge differences and shrunk to 96 %. True only for a rectangle square to
// the grid; move one corner node (a raking column's top, a skewed bay) and
// the panel kept its rectangle while the beams went where the nodes went, so
// it no longer met its corners — and the 4 % shrink left a 240 mm gap at every
// edge of a 6 m bay even when it did.
//
// Top face = the corners themselves (the node line is the top of the floor,
// see `levelDrop`), lifted 2 mm so it does not z-fight the beam tops it sits
// flush with. Bottom face = top − thickness along the panel's upward normal,
// so a sloped panel keeps its thickness square to itself.
// ─────────────────────────────────────────────────────────────────────────
export type P3 = readonly [number, number, number]

/** Unit normal of the quad (diagonal cross product), pointing up (+y). */
export function panelNormal(c: readonly P3[]): [number, number, number] {
  const [a, b, cc, d] = c
  const u = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]], v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]]
  let n: [number, number, number] = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const l = Math.hypot(...n) || 1
  n = [n[0] / l, n[1] / l, n[2] / l]
  return n[1] < 0 ? [-n[0], -n[1], -n[2]] : n
}

export const SLAB_LIFT = 0.002

/**
 * Vertex positions (8 × xyz: top 0–3, bottom 4–7) and triangle indices
 * (12 triangles) for a four-cornered panel `thick` m deep.
 */
export function slabPrism(corners: readonly P3[], thick: number): { positions: number[]; index: number[] } {
  const n = panelNormal(corners)
  const top = corners.map((p) => [p[0] + n[0] * SLAB_LIFT, p[1] + n[1] * SLAB_LIFT, p[2] + n[2] * SLAB_LIFT])
  const bot = top.map((p) => [p[0] - n[0] * thick, p[1] - n[1] * thick, p[2] - n[2] * thick])
  const positions = [...top, ...bot].flat()
  const index = [
    0, 1, 2, 0, 2, 3,          // top
    4, 6, 5, 4, 7, 6,          // bottom
    0, 4, 5, 0, 5, 1,          // sides
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]
  return { positions, index }
}
