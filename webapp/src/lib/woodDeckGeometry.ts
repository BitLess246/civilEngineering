// ─────────────────────────────────────────────────────────────────────────
// A TIMBER FLOOR AS BUILT — deck boards on joists, through its four corner nodes.
//
// The panel used to draw as a faint box with the joists as hairlines under it:
// it said "wood" without showing the floor that was designed. This is the
// floor: a deck `deckThickness` deep whose top is the node line (the top of
// the floor, as for a concrete panel — see `slabPrism`), its board joints on
// it, and the joists as b × d timbers under the deck.
//
// The layout is the design's (`woodSlab`): joists span the panel's SHORTER
// side, and there are floor(L/s) + 1 of them across the longer side L. They are
// spread evenly with the outer two against the panel edges, so the drawn pitch
// is never more than the design spacing s. The boards run square to the joists
// — they span between them — so their joints run along the longer side.
//
// A skewed panel (one corner node moved) is followed exactly: each joist runs
// between the matching points of the two long edges, not along a rectangle.
//
// Pure: positions and indices only; metres; y up.
// ─────────────────────────────────────────────────────────────────────────
import { panelNormal, slabPrism, SLAB_LIFT, type P3 } from './slabPrism'

export interface WoodDeckLayout {
  /** Deck prism through the corners, `deckThickness` deep (8 vertices, 12 triangles). */
  deck: { positions: number[]; index: number[] }
  /** All joists as boxes in one buffer (8 vertices, 12 triangles each). */
  joists: { positions: number[]; index: number[] }
  /** Board joints on the deck's top face, as line-segment pairs. */
  seams: number[]
  joistCount: number
  /** Drawn centre-to-centre pitch, m (≤ the design spacing). */
  pitch: number
}

/** How many board joints are drawn at most — a 50 mm slat on a 10 m bay would be 200 lines. */
export const MAX_SEAMS = 120

const lerp = (a: P3, b: P3, t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const len = (a: P3, b: P3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

/**
 * The deck and its joists for a four-cornered panel (corners in order round
 * the panel). Sizes in mm as the model stores them: joist b × d at `spacing`
 * c/c, deck `deckThickness` thick in boards `deckWidth` wide.
 */
export function woodDeckLayout(corners: readonly P3[], d: {
  joistB: number; joistD: number; joistSpacing: number; deckThickness: number; deckWidth?: number
}): WoodDeckLayout {
  const [c0, c1, c2, c3] = corners
  const n = panelNormal(corners)
  const tDeck = Math.max(0.005, d.deckThickness / 1000)
  const b = Math.max(0.01, d.joistB / 1000), dj = Math.max(0.01, d.joistD / 1000)
  const deck = slabPrism(corners, tDeck)

  // joists span the shorter side: edges A (c0→c1, c3→c2) or B (c0→c3, c1→c2)
  const spanA = (len(c0, c1) + len(c3, c2)) / 2, spanB = (len(c0, c3) + len(c1, c2)) / 2
  const alongA = spanA <= spanB
  // a joist at t across the long side runs between these two points
  const ends = (t: number): [[number, number, number], [number, number, number]] => alongA
    ? [lerp(c0, c3, t), lerp(c1, c2, t)]
    : [lerp(c0, c1, t), lerp(c3, c2, t)]
  const L = alongA ? spanB : spanA
  const s = Math.max(0.05, d.joistSpacing / 1000)
  const joistCount = Math.max(2, Math.floor(L / s) + 1)
  const inset = Math.min(b / 2, L / 4)
  const pitch = (L - 2 * inset) / (joistCount - 1)

  // the underside of the deck, where the joists' tops are
  const under = SLAB_LIFT - tDeck
  const positions: number[] = [], index: number[] = []
  for (let i = 0; i < joistCount; i++) {
    const t = (inset + i * pitch) / L
    const [p, q] = ends(t).map((v) => [v[0] + n[0] * under, v[1] + n[1] * under, v[2] + n[2] * under])
    const dir = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
    const dl = Math.hypot(...dir) || 1
    // across the joist, in the panel's plane: n × dir
    let w = [n[1] * dir[2] - n[2] * dir[1], n[2] * dir[0] - n[0] * dir[2], n[0] * dir[1] - n[1] * dir[0]]
    w = w.map((x) => (x / dl) * (b / 2))
    const base = positions.length / 3
    for (const end of [p, q]) {
      for (const sg of [-1, 1]) positions.push(end[0] + w[0] * sg, end[1] + w[1] * sg, end[2] + w[2] * sg)
    }
    // bottom four: the top four dropped by d along −n
    for (let k = 0; k < 4; k++) {
      const o = (base + k) * 3
      positions.push(positions[o] - n[0] * dj, positions[o + 1] - n[1] * dj, positions[o + 2] - n[2] * dj)
    }
    // top: 0 p−, 1 p+, 2 q−, 3 q+; bottom 4–7 the same
    const f = [
      0, 2, 3, 0, 3, 1,   4, 5, 7, 4, 7, 6,     // top, bottom
      0, 1, 5, 0, 5, 4,   2, 6, 7, 2, 7, 3,     // ends
      0, 4, 6, 0, 6, 2,   1, 3, 7, 1, 7, 5,     // sides
    ]
    for (const k of f) index.push(base + k)
  }

  // board joints: lines across the joists (along the long side), every deckWidth across the span
  const seams: number[] = []
  const bw = Math.max(0.02, (d.deckWidth ?? 140) / 1000)
  const span = alongA ? spanA : spanB
  const nSeam = Math.min(MAX_SEAMS, Math.floor(span / bw))
  const lift = SLAB_LIFT + 0.002
  for (let k = 1; k <= nSeam; k++) {
    const u = (k * bw) / span
    if (u >= 1 - 1e-6) break
    // the joint at u across the span runs the full length of the long side
    const a = alongA ? lerp(c0, c1, u) : lerp(c0, c3, u)
    const z = alongA ? lerp(c3, c2, u) : lerp(c1, c2, u)
    seams.push(a[0] + n[0] * lift, a[1] + n[1] * lift, a[2] + n[2] * lift, z[0] + n[0] * lift, z[1] + n[1] * lift, z[2] + n[2] * lift)
  }
  return { deck, joists: { positions, index }, seams, joistCount, pitch }
}
