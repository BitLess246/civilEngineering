import { Card, Num, Pick } from '../components/qty'
import { DrawingFrame } from '../components/DrawingFrame'
import { geomAt, type ChannelShape } from '../engine/openChannel'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'
import type { ShapeKind, ShapeState } from './openChannelTypes'

// Shared pieces for the three open-channel modes: the section-shape picker
// card and the cross-section sketch every mode reuses. Types and the shape
// builder live in openChannelTypes.ts — this file exports components only.

/** The channel-section input card, shared by all three modes. */
export function ShapeCard({ shape, onChange, hint }: {
  shape: ShapeState
  onChange: (patch: Partial<ShapeState>) => void
  hint: string
}) {
  return (
    <Card title="Channel section" hint={hint}>
      <Pick label="Shape" value={shape.kind} onChange={(v) => onChange({ kind: v as ShapeKind })}
        options={[
          ['trap', 'Trapezoidal — b, side slope z'],
          ['rect', 'Rectangular — b'],
          ['tri', 'Triangular — side slope z'],
          ['circle', 'Circular pipe — D'],
        ]} />
      {(shape.kind === 'rect' || shape.kind === 'trap') && (
        <Num label="Bottom width b" unit="m" value={parseFloat(shape.b) || 0} onChange={(v) => onChange({ b: String(v) })} min={0.05} max={50} step="0.1" />
      )}
      {(shape.kind === 'trap' || shape.kind === 'tri') && (
        <Num label="Side slope z (zH : 1V)" value={parseFloat(shape.z) || 0} onChange={(v) => onChange({ z: String(v) })} min={0} max={10} step="0.25" />
      )}
      {shape.kind === 'circle' && (
        <Num label="Diameter D" unit="m" value={parseFloat(shape.D) || 0} onChange={(v) => onChange({ D: String(v) })} min={0.1} max={10} step="0.1" />
      )}
    </Card>
  )
}

/**
 * Cross-section at depth y, to scale, with the geometry the mode reports.
 * y > the drawable depth clamps the drawing (the section fills).
 */
export function SectionSketch({ shape, y, caption }: { shape: ChannelShape; y: number; caption: string }) {
  const W = 640
  const H = 380
  const pad = 56

  const g = geomAt(shape, y)
  // drawing scale from the section's overall extents plus freeboard room
  const yDraw = Math.max(0.02, y * 1.25)
  const widthTop = shape.kind === 'circle'
    ? shape.D
    : shape.kind === 'rect' ? shape.b
    : shape.kind === 'trap' ? shape.b + 2 * shape.z * yDraw
    : 2 * shape.z * yDraw
  const height = shape.kind === 'circle' ? shape.D : yDraw
  const scale = Math.min((W - 2 * pad - 90) / Math.max(widthTop, 0.2), (H - 2 * pad - 40) / Math.max(height, 0.2))
  const cx = W / 2 - 30
  const bedY = pad + (H - 2 * pad - 20) // y of the invert line on screen

  const sx = (w: number) => w * scale
  const sy = (d: number) => d * scale

  // outline of the section (screen coords), water surface at depth y
  let outline: string
  if (shape.kind === 'rect') {
    outline = `M ${cx - sx(shape.b / 2)} ${bedY} H ${cx + sx(shape.b / 2)} V ${bedY - sy(yDraw)} H ${cx - sx(shape.b / 2)} Z`
  } else if (shape.kind === 'trap') {
    const zb = cx - sx(shape.b / 2)
    const zt = cx - sx((shape.b + 2 * shape.z * yDraw) / 2)
    outline = `M ${zt} ${bedY - sy(yDraw)} H ${zt + sx(shape.b + 2 * shape.z * yDraw)} L ${zb + sx(shape.b)} ${bedY} H ${zb} Z`
  } else if (shape.kind === 'tri') {
    const zt = cx - sx(shape.z * yDraw)
    outline = `M ${zt} ${bedY - sy(yDraw)} H ${zt + sx(2 * shape.z * yDraw)} L ${cx} ${bedY} Z`
  } else {
    const r = sx(shape.D / 2)
    const cyc = bedY - sy(shape.D / 2)
    outline = `M ${cx - r} ${cyc} A ${r} ${r} 0 1 0 ${cx + r} ${cyc} A ${r} ${r} 0 1 0 ${cx - r} ${cyc}`
  }

  // water polygon: section clipped to the water surface
  let water = ''
  const wy = bedY - sy(y)
  if (shape.kind === 'rect') {
    water = `M ${cx - sx(shape.b / 2)} ${bedY} H ${cx + sx(shape.b / 2)} V ${wy} H ${cx - sx(shape.b / 2)} Z`
  } else if (shape.kind === 'trap') {
    const zb = cx - sx(shape.b / 2)
    const wt = cx - sx((shape.b + 2 * shape.z * y) / 2)
    water = `M ${wt} ${wy} H ${wt + sx(shape.b + 2 * shape.z * y)} L ${zb + sx(shape.b)} ${bedY} H ${zb} Z`
  } else if (shape.kind === 'tri') {
    const wt = cx - sx(shape.z * y)
    water = `M ${wt} ${wy} H ${wt + sx(2 * shape.z * y)} L ${cx} ${bedY} Z`
  }

  return (
    <DrawingFrame label="Channel cross-section at the solved depth">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Channel cross-section">
        {/* section outline */}
        <path d={outline} fill="rgba(15,76,146,0.05)" stroke={INK} strokeWidth="1.6" />
        {/* water */}
        {water !== '' && <path d={water} fill="rgba(15,76,146,0.22)" stroke="none" />}
        {shape.kind === 'circle' && y < shape.D && (
          <path d={`M ${cx - sx(g.T / 2)} ${wy} H ${cx + sx(g.T / 2)}`} stroke="none" />
        )}
        {/* water surface line */}
        <line x1={cx - sx(g.T / 2) - 26} x2={cx + sx(g.T / 2) + 26} y1={wy} y2={wy} stroke={INK} strokeWidth="1.2" />
        <line x1={cx - sx(g.T / 2) - 26} x2={cx - sx(g.T / 2) - 26} y1={wy - 4} y2={wy + 4} stroke={INK} strokeWidth="1" />
        <line x1={cx + sx(g.T / 2) + 26} x2={cx + sx(g.T / 2) + 26} y1={wy - 4} y2={wy + 4} stroke={INK} strokeWidth="1" />
        <text x={cx + sx(g.T / 2) + 32} y={wy + 3} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">y = {f3(y)} m</text>
        <text x={cx - sx(g.T / 2) - 30} y={wy - 8} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          T = {f2(g.T)} m
        </text>

        {/* depth dimension */}
        <line x1={cx + sx(g.T / 2) + 60} x2={cx + sx(g.T / 2) + 60} y1={bedY} y2={wy} stroke={MUTED} strokeWidth="1" />
        <line x1={cx + sx(g.T / 2) + 55} x2={cx + sx(g.T / 2) + 65} y1={bedY} y2={bedY} stroke={MUTED} strokeWidth="1" />
        <line x1={cx + sx(g.T / 2) + 55} x2={cx + sx(g.T / 2) + 65} y1={wy} y2={wy} stroke={MUTED} strokeWidth="1" />

        {/* bed hatching */}
        {Array.from({ length: 14 }, (_, i) => {
          const x = cx - sx(widthTop / 2) - 20 + i * (sx(widthTop) + 40) / 13
          return <line key={i} x1={x} x2={x + 7} y1={bedY + 3} y2={bedY + 11} stroke={HAIR} strokeWidth="1" />
        })}
        <line x1={cx - sx(widthTop / 2) - 24} x2={cx + sx(widthTop / 2) + 24} y1={bedY} y2={bedY} stroke={INK} strokeWidth="1.4" />

        {/* geometry stamp */}
        <text x={pad} y={pad - 22} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          A = {f3(g.A)} m² · P = {f3(g.P)} m · R = {f3(g.R)} m
        </text>
        <text x={pad} y={H - 10} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">{caption}</text>
      </svg>
    </DrawingFrame>
  )
}
