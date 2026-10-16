// ─────────────────────────────────────────────────────────────────────────
// Block shear in three dimensions — the two planes a tab tears along.
//
// §J4.3 adds a SHEAR plane (along the bolt line, area Agv, net Anv) to a
// TENSION plane (across to the free edge, Agt / Ant). In elevation both are
// lines; their areas are those lines times the plate thickness, less the
// holes they cut through. Drawn exploded, the torn block pulled clear, the
// two planes are faces you can see, with a gap at every hole.
//
// Plate frame as `connectionMechanics.blockShearPath` (mm, x across to the
// free edge at W, y up). World for `lib/isometric`: x = plate x, z = plate y,
// y = through the thickness (front face y = 0).
// ─────────────────────────────────────────────────────────────────────────
import type { Vec3 } from './isometric'
import { blockShearPath, type Pt } from './connectionMechanics'

export interface Extrusion {
  /** Outline in the plate plane (x, z), anticlockwise. */
  outline: Pt[]
  /** Sheet offset applied to the whole body (the explode), world mm. */
  shift: Vec3
}

export interface CutFace {
  /** Solid strips of the face, holes removed — each a world quad. */
  strips: Vec3[][]
  /** Gross and net lengths along the plane, mm. */
  gross: number
  net: number
  /** Outward normal of the face drawn. */
  n: Vec3
}

export interface BlockShearIso {
  plate: Extrusion
  block: Extrusion
  shear: CutFace
  tension: CutFace
  /** Hole circles on the front face: centre, and which body each half sits on. */
  holes: { c: Pt; split: boolean }[]
  /** Drawn thickness: the real t, or thicker when t is under ~1/8 of the plate width. */
  tDraw: number
}

/** Remove (lo, hi) hole intervals from [a, b]; returns the solid pieces. */
export function solidPieces(a: number, b: number, holes: readonly [number, number][]): [number, number][] {
  let pieces: [number, number][] = [[a, b]]
  for (const [h0, h1] of holes) {
    pieces = pieces.flatMap(([p0, p1]): [number, number][] => {
      if (h1 <= p0 || h0 >= p1) return [[p0, p1]]
      return [...(h0 > p0 ? [[p0, h0] as [number, number]] : []), ...(h1 < p1 ? [[h1, p1] as [number, number]] : [])]
    })
  }
  return pieces
}

const sum = (ps: [number, number][]) => ps.reduce((s, [a, b]) => s + b - a, 0)

/**
 * The exploded tab for case A (block torn from the bottom edge up to the top
 * bolt) or B (top edge down to the bottom bolt). The block moves out along
 * +x and away from the plate along the shear plane, far enough that neither
 * cut face is hidden behind it.
 */
export function blockShearIso(bolts: readonly Pt[], W: number, H: number, t: number, dh: number, which: 'A' | 'B'): BlockShearIso {
  const bp = blockShearPath(bolts, W, H, which)
  const xL = bp.shear[0].x
  const yT = bp.tension[0].y
  // a thin plate is drawn thicker — only when that changes how it reads
  const tDraw = 0.16 * W > 1.3 * t ? 0.16 * W : t
  const gap = Math.max(1.8 * tDraw, 0.14 * W)
  const shift: Vec3 = [gap, 0, which === 'A' ? -gap : gap]

  // the plate keeps everything but the block; the block is bp.polygon
  const plateOutline: Pt[] = which === 'A'
    ? [{ x: 0, y: 0 }, { x: xL, y: 0 }, { x: xL, y: yT }, { x: W, y: yT }, { x: W, y: H }, { x: 0, y: H }]
    : [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: yT }, { x: xL, y: yT }, { x: xL, y: H }, { x: 0, y: H }]

  // shear plane on the plate's notch face (x = xL, facing +x), holes out
  const [v0, v1] = which === 'A' ? [0, yT] : [yT, H]
  const vHoles = bp.holes.map((h): [number, number] => [h.y - dh / 2, h.y + dh / 2])
  const vPieces = solidPieces(v0, v1, vHoles)
  const shear: CutFace = {
    gross: v1 - v0, net: sum(vPieces), n: [1, 0, 0],
    strips: vPieces.map(([a, b]) => [[xL, 0, a], [xL, 0, b], [xL, tDraw, b], [xL, tDraw, a]]),
  }
  // tension plane: the block's top (A, facing +z) or the plate's notch floor (B, facing +z)
  const tPieces = solidPieces(xL, W, [[xL - dh / 2, xL + dh / 2]])
  const dx = which === 'A' ? shift[0] : 0, dz = which === 'A' ? shift[2] : 0
  const tension: CutFace = {
    gross: W - xL, net: sum(tPieces), n: [0, 0, 1],
    strips: tPieces.map(([a, b]) => [[a + dx, 0, yT + dz], [b + dx, 0, yT + dz], [b + dx, tDraw, yT + dz], [a + dx, tDraw, yT + dz]]),
  }
  const onLine = (b: Pt) => Math.abs(b.x - xL) < 1e-6
  return {
    plate: { outline: plateOutline, shift: [0, 0, 0] },
    block: { outline: bp.polygon, shift },
    shear, tension, tDraw,
    holes: bolts.map((c) => ({ c, split: onLine(c) })),
  }
}
