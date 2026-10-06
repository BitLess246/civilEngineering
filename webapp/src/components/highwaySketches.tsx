// ─────────────────────────────────────────────────────────────────────────
// Drawings for the highway-geometry calculators: the stopping-sight-distance
// bar, the vertical-curve profile and the superelevated cross section. Each
// redraws from the engine result it is given, inside its own DrawingFrame.
// ─────────────────────────────────────────────────────────────────────────
import { DrawingFrame } from './DrawingFrame'
import type { SSDResult, VertCurveResult } from '../engine/geometricDesign'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

const mono = 'var(--font-mono, monospace)'

/** SSD as one dimensioned bar, split into its reaction and braking pieces. */
export function SSDBar({ res, V, t, f, gradePct }: { res: SSDResult; V: number; t: number; f: number; gradePct: number }) {
  const W = 640, H = 190
  const x0 = 56, x1 = W - 56, y = H / 2 + 6
  const wr = (res.reaction / res.total) * (x1 - x0)
  const wb = (x1 - x0) - wr
  return (
    <DrawingFrame label="SSD composition bar">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="SSD composition">
        <rect x={x0} y={y - 26} width={wr} height={40} fill="currentColor" opacity="0.1" />
        <rect x={x0 + wr} y={y - 26} width={wb} height={40} fill="currentColor" opacity="0.22" />
        <rect x={x0} y={y - 26} width={x1 - x0} height={40} fill="none" stroke={INK} strokeWidth="1.4" />
        <line x1={x0 + wr} x2={x0 + wr} y1={y - 26} y2={y + 14} stroke={INK} strokeWidth="1.4" />
        <text x={x0 + wr / 2} y={y - 2} textAnchor="middle" fontSize="11" fill={INK} fontFamily={mono}>{wr > 90 ? `reaction ${f2(res.reaction)} m` : f2(res.reaction)}</text>
        <text x={x0 + wr + wb / 2} y={y - 2} textAnchor="middle" fontSize="11" fill={INK} fontFamily={mono}>braking {f2(res.braking)} m</text>
        <line x1={x0} x2={x1} y1={y + 34} y2={y + 34} stroke={INK} strokeWidth="1" />
        <line x1={x0} x2={x0} y1={y + 28} y2={y + 40} stroke={INK} strokeWidth="1" />
        <line x1={x1} x2={x1} y1={y + 28} y2={y + 40} stroke={INK} strokeWidth="1" />
        <text x={(x0 + x1) / 2} y={y + 52} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={INK} fontFamily={mono}>SSD = {f3(res.total)} m</text>
        <text x={x0} y={26} fontSize="10.5" fill={MUTED} fontFamily={mono}>{f2(V)} km/h · t = {f2(t)} s · f = {f2(f)} · G = {f2(gradePct)}%</text>
      </svg>
    </DrawingFrame>
  )
}

/** The parabola between its tangents, with the PVI, its external offset,
 *  BVC/EVC and the high or low point. Elevations exaggerated to fill. */
export function VerticalCurveProfile({ curve, g1, g2, L, pviSt, pviEl }: {
  curve: VertCurveResult; g1: number; g2: number; L: number; pviSt: number; pviEl: number
}) {
  const W = 680, H = 330, pad = 52
  const px0 = pad, px1 = W - pad
  const stSpan = curve.EVCstation - curve.BVCstation
  const toX = (st: number) => px0 + ((st - curve.BVCstation) / stSpan) * (px1 - px0)
  const ext = (40 * stSpan) / (px1 - px0) // 40 px of tangent past BVC/EVC, in station units
  // each tangent runs on its own grade, from 40 px before the BVC to the PVI
  // and on to 40 px past the EVC
  const inEl = curve.BVCelev - (g1 / 100) * ext, outEl = curve.EVCelev + (g2 / 100) * ext
  const elevs: number[] = []
  for (let i = 0; i <= 60; i++) {
    const x = (stSpan * i) / 60
    elevs.push(curve.elevAt(x))
  }
  elevs.push(pviEl, inEl, outEl)
  const eMin = Math.min(...elevs), eMax = Math.max(...elevs)
  const span = Math.max(eMax - eMin, 0.5)
  const scaleY = (H - 2 * pad - 20) / (span * 1.15)
  const toY = (e: number) => H - pad - (e - eMin + span * 0.075) * scaleY
  const profile = Array.from({ length: 61 }, (_, i) => {
    const x = (stSpan * i) / 60
    return `${toX(curve.BVCstation + x)},${toY(curve.elevAt(x))}`
  })
  const turn = curve.turnStation != null ? { x: toX(curve.turnStation), y: toY(curve.turnElev ?? 0) } : null
  const crest = g1 >= g2
  return (
    <DrawingFrame label="Vertical curve profile">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Vertical curve profile">
        <line x1={toX(curve.BVCstation - ext)} y1={toY(inEl)} x2={toX(pviSt)} y2={toY(pviEl)} stroke={MUTED} strokeWidth="1.1" strokeDasharray="5 3" />
        <line x1={toX(pviSt)} y1={toY(pviEl)} x2={toX(curve.EVCstation + ext)} y2={toY(outEl)} stroke={MUTED} strokeWidth="1.1" strokeDasharray="5 3" />
        <polyline points={profile.join(' ')} fill="none" stroke={INK} strokeWidth="2.2" />
        <circle cx={toX(pviSt)} cy={toY(pviEl)} r={2.8} fill={INK} />
        <line x1={toX(pviSt)} y1={toY(pviEl)} x2={toX(pviSt)} y2={toY(curve.elevAt(L / 2))} stroke={INK} strokeWidth="1" />
        <text x={toX(pviSt)} y={toY(pviEl) + (crest ? -10 : 18)} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono}>PVI {f3(pviEl)}</text>
        <text x={toX(pviSt) + 6} y={(toY(pviEl) + toY(curve.elevAt(L / 2))) / 2 + 3} fontSize="10" fill={MUTED} fontFamily={mono}>e = {f3(curve.PVIoffset)}</text>
        <circle cx={toX(curve.BVCstation)} cy={toY(curve.BVCelev)} r={2.6} fill={INK} />
        <text x={toX(curve.BVCstation)} y={toY(curve.BVCelev) + (crest ? 18 : -10)} textAnchor="middle" fontSize="10" fill={INK} fontFamily={mono} paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>BVC {f2(curve.BVCstation)}</text>
        <circle cx={toX(curve.EVCstation)} cy={toY(curve.EVCelev)} r={2.6} fill={INK} />
        <text x={toX(curve.EVCstation)} y={toY(curve.EVCelev) + (crest ? 18 : -10)} textAnchor="middle" fontSize="10" fill={INK} fontFamily={mono} paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>EVC {f2(curve.EVCstation)}</text>
        {/* grade labels at mid-tangent, on the outside of the curve */}
        <text x={(toX(curve.BVCstation - ext) + toX(pviSt)) / 2 - 6} y={(toY(inEl) + toY(pviEl)) / 2 + (crest ? -6 : 14)} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono}>g₁ = {f2(g1)}%</text>
        <text x={(toX(pviSt) + toX(curve.EVCstation + ext)) / 2 + 6} y={(toY(pviEl) + toY(outEl)) / 2 + (crest ? -6 : 14)} fontSize="10" fill={MUTED} fontFamily={mono}>g₂ = {f2(g2)}%</text>
        {turn && Math.abs(turn.x - toX(pviSt)) > 30 && (
          <>
            <circle cx={turn.x} cy={turn.y} r={2.6} fill={INK} />
            <text x={turn.x} y={turn.y + (curve.turnKind === 'high' ? 16 : -9)} textAnchor="middle" fontSize="10" fill={INK} fontFamily={mono}>
              {curve.turnKind === 'high' ? 'high' : 'low'} {f3(curve.turnElev ?? 0)}
            </text>
          </>
        )}
        <text x={px0} y={H - 8} fontSize="10" fill={MUTED} fontFamily={mono}>
          L = {f2(L)} m · A = {f3(Math.abs(g2 - g1))}% · K = {curve.K === Infinity ? '—' : f3(curve.K)} m/% · elevations exaggerated
        </text>
      </svg>
    </DrawingFrame>
  )
}

/** The deck banked at atan(e), outside edge up, with the force triangle of
 *  weight and centrifugal force whose resultant the bank resists. */
export function SuperelevationSection({ e, R, Rmin, D }: { e: number; R: number; Rmin: number; D: number }) {
  const W = 640, H = 300
  const angle = Math.atan(e)
  const cx = W / 2, cy = H / 2 + 26, half = 170
  const dx = Math.cos(angle) * half, dy = Math.sin(angle) * half
  return (
    <DrawingFrame label="Superelevated cross section">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Superelevated cross section">
        <line x1={cx - dx} y1={cy + dy} x2={cx + dx} y2={cy - dy} stroke={INK} strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => {
          const s = (i + 0.5) / 12
          const bx = cx - dx + 2 * dx * s, by = cy + dy - 2 * dy * s
          return <line key={i} x1={bx} y1={by} x2={bx} y2={by + 9} stroke={MUTED} strokeWidth="0.8" />
        })}
        <text x={cx - dx} y={cy + dy + 24} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={mono}>inside (toward centre)</text>
        <text x={cx + dx} y={cy - dy - 12} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={mono}>outside</text>
        <line x1={cx - dx} y1={cy + dy} x2={cx + dx} y2={cy + dy} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
        <text x={cx + dx} y={cy + dy + 18} textAnchor="end" fontSize="10.5" fill={INK} fontFamily={mono}>e = {f2(e * 100)}%</text>
        <g transform={`translate(${cx}, ${cy - 8})`}>
          <line x1={0} y1={0} x2={0} y2={-56} stroke={INK} strokeWidth="1.6" />
          <text x={-6} y={-30} textAnchor="end" fontSize="10" fill={INK} fontFamily={mono}>W</text>
          <line x1={0} y1={-56} x2={48} y2={-56} stroke={INK} strokeWidth="1.6" />
          <text x={52} y={-53} fontSize="10" fill={INK} fontFamily={mono}>F = Wv²/gR</text>
          <line x1={0} y1={0} x2={48} y2={-56} stroke={MUTED} strokeWidth="1.1" strokeDasharray="4 3" />
        </g>
        <text x={24} y={H - 12} fontSize="10" fill={MUTED} fontFamily={mono}>R = {f2(R)} m · Rmin = {f3(Rmin)} m · D = {f3(D)}° per 100 m</text>
      </svg>
    </DrawingFrame>
  )
}
