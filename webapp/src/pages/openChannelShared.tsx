import { Card, Num, Pick } from '../components/qty'
import { InputGroup } from '../components/workspace'
import { DrawingFrame } from '../components/DrawingFrame'
import { geomAt, specificEnergy, G, type ChannelShape, type JumpResult } from '../engine/openChannel'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

/** Water-surface ink: the same blue the section's water fill is tinted with. */
const WATER = '#0f4c92'
import type { ShapeKind, ShapeState } from './openChannelTypes'

// Shared pieces for the three open-channel pages: the section-shape picker
// group and the cross-section sketch every mode reuses. Types and the shape
// builder live in openChannelTypes.ts — this file exports components only.

/** The channel-section input group, shared by the three pages. */
export function ShapeGroup({ shape, onChange, hint }: {
  shape: ShapeState
  onChange: (patch: Partial<ShapeState>) => void
  hint: string
}) {
  return (
    <InputGroup title="Channel section" hint={hint}>
      <div className="col-span-2">
      <Pick label="Shape" value={shape.kind} onChange={(v) => onChange({ kind: v as ShapeKind })}
        options={[
          ['trap', 'Trapezoidal — b, side slope z'],
          ['rect', 'Rectangular — b'],
          ['tri', 'Triangular — side slope z'],
          ['circle', 'Circular pipe — D'],
        ]} />
      </div>
      {(shape.kind === 'rect' || shape.kind === 'trap') && (
        <Num label="Bottom width b" unit="m" value={parseFloat(shape.b) || 0} onChange={(v) => onChange({ b: String(v) })} min={0.05} max={50} step="0.1" />
      )}
      {(shape.kind === 'trap' || shape.kind === 'tri') && (
        <Num label="Side slope z (zH : 1V)" value={parseFloat(shape.z) || 0} onChange={(v) => onChange({ z: String(v) })} min={0} max={10} step="0.25" />
      )}
      {shape.kind === 'circle' && (
        <Num label="Diameter D" unit="m" value={parseFloat(shape.D) || 0} onChange={(v) => onChange({ D: String(v) })} min={0.1} max={10} step="0.1" />
      )}
    </InputGroup>
  )
}

/** The section picker as a classic Card, for pages not yet on the workspace layout (GVF). */
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
  let water: string
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
  } else if (y < shape.D) {
    // circular segment below the surface chord; past half full the arc
    // under the water is the large one
    const r = sx(shape.D / 2)
    water = `M ${cx - sx(g.T / 2)} ${wy} A ${r} ${r} 0 ${y > shape.D / 2 ? 1 : 0} 0 ${cx + sx(g.T / 2)} ${wy} Z`
  } else {
    const r = sx(shape.D / 2), cyc = bedY - r
    water = `M ${cx - r} ${cyc} A ${r} ${r} 0 1 0 ${cx + r} ${cyc} A ${r} ${r} 0 1 0 ${cx - r} ${cyc}`
  }

  // crop the empty band above a shallow section: the sheet starts just above
  // the section top instead of at a fixed height
  const dimY = bedY - sy(height) - 18            // T dimension, clear above the section
  const vbTop = Math.max(0, dimY - 42)
  return (
    <DrawingFrame label="Channel cross-section at the solved depth">
      <svg viewBox={`0 ${vbTop} ${W} ${H - vbTop}`} className="w-full" role="img" aria-label="Channel cross-section">
        {/* section outline */}
        <path d={outline} fill="rgba(15,76,146,0.05)" stroke={INK} strokeWidth="1.6" />
        {/* water */}
        {<path d={water} fill="rgba(15,76,146,0.22)" stroke="none" />}
        {shape.kind === 'circle' && y < shape.D && (
          <path d={`M ${cx - sx(g.T / 2)} ${wy} H ${cx + sx(g.T / 2)}`} stroke="none" />
        )}
        {/* free water surface: wall to wall only, with the ▽ symbol and its
            two short ripple lines — a surface, not a dimension */}
        <line x1={cx - sx(g.T / 2)} x2={cx + sx(g.T / 2)} y1={wy} y2={wy} stroke={WATER} strokeWidth="1.6" />
        <path d={`M ${cx + sx(g.T / 4) - 6} ${wy - 10} h 12 l -6 9 z`} fill="none" stroke={WATER} strokeWidth="1.2" />
        <line x1={cx + sx(g.T / 4) - 5} x2={cx + sx(g.T / 4) + 5} y1={wy + 4} y2={wy + 4} stroke={WATER} strokeWidth="1" />
        <line x1={cx + sx(g.T / 4) - 3} x2={cx + sx(g.T / 4) + 3} y1={wy + 7} y2={wy + 7} stroke={WATER} strokeWidth="1" />

        {/* top width T: a proper dimension above the section, with extension
            lines down to where the surface meets the walls */}
        <line x1={cx - sx(g.T / 2)} x2={cx - sx(g.T / 2)} y1={wy - 3} y2={dimY - 5} stroke={MUTED} strokeWidth="0.8" />
        <line x1={cx + sx(g.T / 2)} x2={cx + sx(g.T / 2)} y1={wy - 3} y2={dimY - 5} stroke={MUTED} strokeWidth="0.8" />
        <line x1={cx - sx(g.T / 2)} x2={cx + sx(g.T / 2)} y1={dimY} y2={dimY} stroke={MUTED} strokeWidth="1" />
        <line x1={cx - sx(g.T / 2) - 4} x2={cx - sx(g.T / 2) + 4} y1={dimY + 4} y2={dimY - 4} stroke={MUTED} strokeWidth="1.2" />
        <line x1={cx + sx(g.T / 2) - 4} x2={cx + sx(g.T / 2) + 4} y1={dimY + 4} y2={dimY - 4} stroke={MUTED} strokeWidth="1.2" />
        <text x={cx} y={dimY - 5} textAnchor="middle" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)"
          paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>T = {f2(g.T)} m</text>

        {/* depth dimension */}
        <line x1={cx + sx(widthTop / 2) + 40} x2={cx + sx(widthTop / 2) + 40} y1={bedY} y2={wy} stroke={MUTED} strokeWidth="1" />
        <line x1={cx + sx(g.T / 2) + 3} x2={cx + sx(widthTop / 2) + 45} y1={wy} y2={wy} stroke={MUTED} strokeWidth="0.8" />
        <line x1={cx + sx(widthTop / 2) + 36} x2={cx + sx(widthTop / 2) + 44} y1={bedY + 4} y2={bedY - 4} stroke={MUTED} strokeWidth="1.2" />
        <line x1={cx + sx(widthTop / 2) + 36} x2={cx + sx(widthTop / 2) + 44} y1={wy + 4} y2={wy - 4} stroke={MUTED} strokeWidth="1.2" />
        <text x={cx + sx(widthTop / 2) + 50} y={(wy + bedY) / 2 + 4} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">y = {f3(y)} m</text>

        {/* bed hatching */}
        {Array.from({ length: 14 }, (_, i) => {
          const x = cx - sx(widthTop / 2) - 20 + i * (sx(widthTop) + 40) / 13
          return <line key={i} x1={x} x2={x + 7} y1={bedY + 3} y2={bedY + 11} stroke={HAIR} strokeWidth="1" />
        })}
        <line x1={cx - sx(widthTop / 2) - 24} x2={cx + sx(widthTop / 2) + 24} y1={bedY} y2={bedY} stroke={INK} strokeWidth="1.4" />
        {/* extension of the bed out to the depth dimension */}
        <line x1={cx + sx(widthTop / 2) + 26} x2={cx + sx(widthTop / 2) + 45} y1={bedY} y2={bedY} stroke={MUTED} strokeWidth="0.8" />

        {/* geometry stamp */}
        <text x={pad} y={vbTop + 18} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          A = {f3(g.A)} m² · P = {f3(g.P)} m · R = {f3(g.R)} m
        </text>
        <text x={pad} y={H - 10} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">{caption}</text>
      </svg>
    </DrawingFrame>
  )
}

// ── E–y curve with the critical point and both limbs marked ──────────────

export function EnergyCurve({ shape, Q, yc, EMin, probe }: {
  shape: ChannelShape
  Q: number
  yc: number
  EMin: number
  probe: { y: number; E: number; Fr: number } | null
}) {
  const W = 640
  const H = 380
  const padL = 58
  const padB = 46
  const padT = 30
  const padR = 24

  // E range: from just above EMin to the largest plotted E
  const yMaxPlot = shape.kind === 'circle' ? Math.max(yc * 3, probe?.y ?? 0, 0.5) : Math.max(yc * 2.6, probe?.y ?? 0, 0.5)
  const EMax = specificEnergy(shape, yMaxPlot, Q)
  const E0 = Math.max(0, EMin - 0.15 * (EMax - EMin)) // x-axis start

  const px = (E: number) => padL + (E - E0) / (EMax - E0) * (W - padL - padR)
  const py = (y: number) => H - padB - y / yMaxPlot * (H - padB - padT)

  // sample the curve on both limbs
  const upper: string[] = []
  for (let i = 0; i <= 60; i++) {
    const y = yc + (yMaxPlot - yc) * i / 60
    upper.push(`${px(specificEnergy(shape, y, Q))},${py(y)}`)
  }
  const lower: string[] = []
  for (let i = 0; i <= 60; i++) {
    const y = yc * (1 - 0.985 * i / 60)
    if (y <= 0.0005) break
    lower.push(`${px(specificEnergy(shape, y, Q))},${py(y)}`)
  }

  // alternate depth for the probe: same E on the other limb
  const alt = probe && probe.Fr < 1
    ? (() => {
        // alternate is supercritical: bisect the lower limb for E(y) = probe.E
        let lo = 1e-4, hi = yc
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2
          if (specificEnergy(shape, mid, Q) > probe.E) lo = mid; else hi = mid
        }
        return (lo + hi) / 2
      })()
    : probe
      ? (() => {
          let lo = yc, hi = yMaxPlot
          for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2
            if (specificEnergy(shape, mid, Q) < probe.E) lo = mid; else hi = mid
          }
          return (lo + hi) / 2
        })()
      : null

  // the 45° asymptote y = E
  const asyE0 = E0 + (yMaxPlot * 0.02)
  const asyMax = Math.min(yMaxPlot, EMax)

  return (
    <DrawingFrame label="Specific energy curve E(y)">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Specific energy curve">
        {/* axes */}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke={INK} strokeWidth="1.4" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke={INK} strokeWidth="1.4" />
        <text x={W - padR} y={H - padB + 26} textAnchor="end" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">E (m)</text>
        <text x={padL - 8} y={padT - 10} fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">y (m)</text>

        {/* E = Emin vertical */}
        <line x1={px(EMin)} x2={px(EMin)} y1={py(yc)} y2={H - padB} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
        <text x={px(EMin) + 5} y={H - padB - 6} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">Emin = {f3(EMin)}</text>

        {/* y = yc horizontal */}
        <line x1={padL} x2={px(EMin)} y1={py(yc)} y2={py(yc)} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
        <text x={padL + 6} y={py(yc) - 5} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">yc = {f3(yc)}</text>

        {/* 45° asymptote */}
        <line x1={px(asyE0)} y1={py(Math.min(yMaxPlot, asyE0))} x2={px(EMax)} y2={py(asyMax)} stroke={HAIR} strokeWidth="1" strokeDasharray="2 4" />
        <text x={px(asyE0) + 6} y={py(Math.min(yMaxPlot, asyE0)) - 6} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">y = E</text>

        {/* limbs */}
        <polyline points={upper.join(' ')} fill="none" stroke={INK} strokeWidth="1.8" />
        <polyline points={lower.join(' ')} fill="none" stroke={INK} strokeWidth="1.8" />
        <text x={px(specificEnergy(shape, yc * 1.35, Q)) + 10} y={py(yc * 1.35) + 12} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)"
          paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>subcritical</text>
        {specificEnergy(shape, yc * 0.6, Q) < EMax && (
          <text x={px(specificEnergy(shape, yc * 0.6, Q))} y={py(yc * 0.6) + 16} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)"
            paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>supercritical</text>
        )}

        {/* critical point */}
        <circle cx={px(EMin)} cy={py(yc)} r="3.5" fill={INK} />

        {/* probe and its alternate */}
        {probe && probe.E <= EMax && probe.y <= yMaxPlot && (
          <>
            <line x1={px(probe.E)} x2={px(probe.E)} y1={py(probe.y)} y2={H - padB} stroke="rgba(15,76,146,0.45)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={px(probe.E)} cy={py(probe.y)} r="4" fill="#0f4c92" />
            <text x={px(probe.E) + 7} y={py(probe.y) - 7} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              y = {f2(probe.y)}, Fr = {f2(probe.Fr)}
            </text>
            {alt !== null && probe.Fr < 1 && (
              <>
                <line x1={px(probe.E)} x2={px(probe.E)} y1={py(alt)} y2={py(probe.y)} stroke="rgba(15,76,146,0.45)" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={px(probe.E)} cy={py(alt)} r="4" fill="none" stroke="#0f4c92" strokeWidth="1.6" />
                <text x={px(probe.E) + 7} y={py(alt) + 17} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)"
                  paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>
                  alternate {f2(alt)} m
                </text>
              </>
            )}
          </>
        )}

        <text x={padL} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          E = y + Q²/(2gA²) · critical where Q²T/(gA³) = 1 · g = {f2(G)} m/s²
        </text>
      </svg>
    </DrawingFrame>
  )
}

// ── longitudinal jump profile ─────────────────────────────────────────────

export function JumpProfile({ j }: { shape: ChannelShape; j: JumpResult }) {
  const W = 640
  const H = 360
  const pad = 46
  const mono = 'var(--font-mono, monospace)'
  // ONE vertical scale for depths and energy heads alike, so the energy
  // grade line sits above each surface by exactly its velocity head and the
  // drop ΔE = E₁ − E₂ reads as a length on the sheet. Horizontal is schematic.
  const bedY = H - pad - 30
  const ky = (bedY - 58) / Math.max(j.E1, j.y2, 1e-6)
  const sy = (d: number) => d * ky

  // water surface: y1 for the approach, S-curve through the jump, y2 after
  const xJump0 = W * 0.32
  const xJump1 = W * 0.52
  const ease = (x: number) => { const t = (x - xJump0) / (xJump1 - xJump0); return t * t * (3 - 2 * t) }
  const surf = (x: number): number => (x < xJump0 ? j.y1 : x > xJump1 ? j.y2 : j.y1 + (j.y2 - j.y1) * ease(x))
  const eLine = (x: number): number => (x < xJump0 ? j.E1 : x > xJump1 ? j.E2 : j.E1 + (j.E2 - j.E1) * ease(x))
  const xs = Array.from({ length: 81 }, (_, i) => pad + ((W - 2 * pad) * i) / 80)
  const pts = xs.map((x) => `${x},${bedY - sy(surf(x))}`)
  const energyPts = xs.map((x) => `${x},${bedY - sy(eLine(x))}`)
  const EGL = 'rgba(15,76,146,0.85)'
  // dimension helper: vertical, oblique ticks, label to the right
  const dim = (x: number, a: number, b: number, label: string, color: string) => (
    <g>
      <line x1={x} x2={x} y1={a} y2={b} stroke={color} strokeWidth="1" />
      <line x1={x - 4} x2={x + 4} y1={a + 4} y2={a - 4} stroke={color} strokeWidth="1.2" />
      <line x1={x - 4} x2={x + 4} y1={b + 4} y2={b - 4} stroke={color} strokeWidth="1.2" />
      <text x={x + 8} y={(a + b) / 2 + 4} fontSize="10" fill={color} fontFamily={mono} paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>{label}</text>
    </g>
  )
  const xD = W * 0.6                     // where ΔE is dimensioned, just past the roller
  const hv1 = j.E1 - j.y1, hv2 = j.E2 - j.y2

  return (
    <DrawingFrame label="Longitudinal jump profile">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hydraulic jump profile">
        {/* bed */}
        <line x1={pad} x2={W - pad} y1={bedY} y2={bedY} stroke={INK} strokeWidth="1.6" />
        {Array.from({ length: 22 }, (_, i) => {
          const x = pad + 6 + (i * (W - 2 * pad - 12)) / 21
          return <line key={i} x1={x} x2={x + 6} y1={bedY + 3} y2={bedY + 10} stroke={HAIR} strokeWidth="1" />
        })}

        {/* water body and surface */}
        <polygon points={`${pad},${bedY} ${pts.join(' ')} ${W - pad},${bedY}`} fill="rgba(15,76,146,0.20)" stroke="none" />
        <polyline points={pts.join(' ')} fill="none" stroke={INK} strokeWidth="1.8" />
        {Array.from({ length: 5 }, (_, i) => {
          const t = (i + 0.5) / 5
          const x = xJump0 + (xJump1 - xJump0) * t
          const y = surf(x) * (0.55 + 0.4 * Math.sin(t * Math.PI))
          return <circle key={i} cx={x} cy={bedY - sy(y)} r={2 + t * 2} fill="none" stroke={MUTED} strokeWidth="1" />
        })}

        {/* energy grade line E = y + V²/2g, on the same scale as the water */}
        <polyline points={energyPts.join(' ')} fill="none" stroke={EGL} strokeWidth="1.3" strokeDasharray="6 3" />
        {/* E₁'s level carried past the jump, so the drop has a datum */}
        <line x1={xJump1} x2={xD + 14} y1={bedY - sy(j.E1)} y2={bedY - sy(j.E1)} stroke={EGL} strokeWidth="0.8" strokeDasharray="2 3" opacity="0.7" />
        <text x={pad + 4} y={bedY - sy(j.E1) - 6} fontSize="10" fill={EGL} fontFamily={mono}>E₁ = {f3(j.E1)} m (energy line)</text>
        <text x={W - pad - 4} y={bedY - sy(j.E2) - 6} textAnchor="end" fontSize="10" fill={EGL} fontFamily={mono}>E₂ = {f3(j.E2)} m</text>
        {dim(xD, bedY - sy(j.E1), bedY - sy(j.E2), `ΔE = ${f3(j.dE)} m`, EGL)}

        {/* velocity heads: the gap between each surface and the energy line */}
        {sy(hv1) > 14 && dim(pad + 150, bedY - sy(j.E1), bedY - sy(j.y1), `V₁²/2g = ${f3(hv1)}`, MUTED)}
        {sy(hv2) > 14 && dim(W - pad - 64, bedY - sy(j.E2), bedY - sy(j.y2), `V₂²/2g`, MUTED)}

        {/* depths */}
        <text x={pad + 8} y={bedY - sy(j.y1) + 15} fontSize="10.5" fill={INK} fontFamily={mono}>y₁ = {f3(j.y1)} m · Fr₁ = {f2(j.Fr1)}</text>
        <text x={W - pad - 8} y={bedY - sy(j.y2) + 15} textAnchor="end" fontSize="10.5" fill={INK} fontFamily={mono}>y₂ = {f3(j.y2)} m · Fr₂ = {f2(j.Fr2)}</text>

        <text x={pad} y={H - 8} fontSize="10" fill={MUTED} fontFamily={mono}>
          {j.cls} jump · {f2(j.powerKW)} kW dissipated · length ≈ 6.1·y₂ = {f2(j.Lj)} m · depths and heads to one scale
        </text>
      </svg>
    </DrawingFrame>
  )
}
