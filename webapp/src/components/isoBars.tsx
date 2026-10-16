// ─────────────────────────────────────────────────────────────────────────
// Reinforcing bars in an axonometric — round steel, not dots on a drawing.
//
// A bar along its length is a cylinder: a dark body with a lit stripe along
// its upper side. Where a section cuts it, its end is a CIRCLE IN THE FACE,
// so it projects as the same ellipse the face does — a flat screen-space
// dot reads as a sticker on top of the drawing rather than steel in it.
//
// Bars are often thinner than a pixel at a footing's scale; the caller passes
// the radius it has chosen to draw (true, or raised to a legible floor) and
// says so on the sheet when it raised it.
// ─────────────────────────────────────────────────────────────────────────
import { isoPath, ring, type Pt, type Vec3 } from '../lib/isometric'

const STEEL = '#3d4754', LIT = '#a7b2be', END = '#59636f', EDGE = '#20262e'

/** One bar from `a` to `b`, drawn `w` sheet units thick. */
export function IsoBar({ a, b, w, p, opacity = 1 }: { a: Vec3; b: Vec3; w: number; p: (v: Vec3) => Pt; opacity?: number }) {
  const [x1, y1] = p(a), [x2, y2] = p(b)
  return <g opacity={opacity}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STEEL} strokeWidth={w} strokeLinecap="butt" />
    <line x1={x1} y1={y1 - w * 0.18} x2={x2} y2={y2 - w * 0.18} stroke={LIT} strokeWidth={Math.max(0.5, w * 0.3)} strokeLinecap="butt" opacity={0.85} />
  </g>
}

/** A bar's cut end at `c`, in the face square to `axis`, radius `r` (world units). */
export function BarEnd({ c, axis, r, p, opacity = 1 }: { c: Vec3; axis: 'x' | 'y' | 'z'; r: number; p: (v: Vec3) => Pt; opacity?: number }) {
  return <g opacity={opacity}>
    <path d={isoPath(ring(c, axis, r).map(p))} fill={END} stroke={EDGE} strokeWidth={0.7} />
    <path d={isoPath(ring(c, axis, r * 0.45).map(p))} fill={LIT} opacity={0.55} />
  </g>
}
