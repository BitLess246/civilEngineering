// The §208 base-shear coefficient against period, drawn from the live example
// through `seismicExample` (the Seismic Wizard's own calls): the basic
// Cv·I/(R·T) curve, its 2.5Ca·I/R cap, the 0.11Ca·I floor and — in Zone 4 —
// the 0.8Z·Nv·I/R floor, with this building's T and the Cs it is designed for.
import type { SeismicExampleInput } from '../../lib/codes'
import { seismicExample } from '../../lib/codes/seismic'
import { DrawingFrame } from '../DrawingFrame'

const INK = 'var(--color-ink, #1f2937)', MUTED = '#64748b', GRID = '#e2e8f0'
const CURVE = '#1f4e8c', RAW = '#94a3b8', FLOOR = '#b45309', HERE = '#d4512b', HL = '#f59e0b'
const W = 640, H = 330

export function SeismicCsCurve({ i, hl }: { i: SeismicExampleInput; hl: string | null }) {
  const r = seismicExample(i)
  if (!r) return <p className="p-6 text-center text-[12px] text-faint">Choose a structural system and enter a positive period.</p>
  const { p, c } = r
  const tMax = Math.max(3, i.T * 1.3)
  const at = (T: number) => seismicExample({ ...i, T })!.c
  const yMax = Math.max(c.Csmax, c.Csraw > 0 && i.T > 0 ? Math.min(c.Csraw, c.Csmax * 1.6) : 0) * 1.18
  const L = 62, R = W - 24, T0 = 30, B = H - 44
  const X = (t: number) => L + (t / tMax) * (R - L)
  const Y = (v: number) => B - (Math.min(v, yMax) / yMax) * (B - T0)
  const ts = Array.from({ length: 160 }, (_, k) => 0.05 + (k / 159) * (tMax - 0.05))
  const design = ts.map((t) => `${X(t).toFixed(1)},${Y(at(t).Cs).toFixed(1)}`).join(' ')
  const raw = ts.map((t) => `${X(t).toFixed(1)},${Y(at(t).Csraw).toFixed(1)}`).join(' ')
  const lit = (k: string) => hl === k
  // round ticks: the smallest of 0.01, 0.02, 0.025, 0.05… giving ≤ 6 steps
  const raw5 = yMax / 5, mag = 10 ** Math.floor(Math.log10(raw5))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw5) ?? raw5
  const yt = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, k) => k * step)
  const xt = Array.from({ length: Math.floor(tMax) + 1 }, (_, k) => k)
  return (
    <DrawingFrame label="Design base-shear coefficient against period">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Design base-shear coefficient against period">
        <text x={L} y={18} fontSize={13} fontWeight={700} fill={INK}>Cs = V/W against T — Zone {i.zone}, {i.soil}, R {p.R}, I {p.I}</text>
        {yt.map((v) => <g key={`y${v}`}><line x1={L} x2={R} y1={Y(v)} y2={Y(v)} stroke={GRID} /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize={12} fill={MUTED}>{+v.toFixed(3)}</text></g>)}
        {xt.map((v) => <text key={`x${v}`} x={X(v)} y={B + 16} textAnchor="middle" fontSize={12} fill={MUTED}>{v}</text>)}
        <line x1={L} x2={R} y1={B} y2={B} stroke={MUTED} /><line x1={L} x2={L} y1={T0} y2={B} stroke={MUTED} />
        <text x={(L + R) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={MUTED}>T (s)</text>
        <polyline points={raw} fill="none" stroke={lit('Csraw') ? HL : RAW} strokeWidth={1.3} strokeDasharray="6 4" />
        <line x1={L} x2={R} y1={Y(c.Csmax)} y2={Y(c.Csmax)} stroke={lit('Csmax') ? HL : CURVE} strokeDasharray="2 3" />
        <text x={R} y={Y(c.Csmax) - 5} textAnchor="end" fontSize={11.5} fill={CURVE}>cap 2.5Ca·I/R = {c.Csmax.toFixed(3)}</text>
        <line x1={L} x2={R} y1={Y(c.Csmin)} y2={Y(c.Csmin)} stroke={lit('Csmin') ? HL : FLOOR} strokeDasharray="2 3" />
        <text x={R} y={Y(c.Csmin) - 5} textAnchor="end" fontSize={11.5} fill={FLOOR}>floor 0.11Ca·I = {c.Csmin.toFixed(3)}</text>
        {c.Cszone4 > 0 && <>
          <line x1={L} x2={R} y1={Y(c.Cszone4)} y2={Y(c.Cszone4)} stroke={lit('Cszone4') ? HL : FLOOR} strokeDasharray="6 3" />
          <text x={L + 8} y={Y(c.Cszone4) + 14} fontSize={11.5} fill={FLOOR}>Zone 4 floor 0.8ZNv·I/R = {c.Cszone4.toFixed(3)}</text>
        </>}
        <polyline points={design} fill="none" stroke={lit('Cs') ? HL : CURVE} strokeWidth={2.4} />
        <line x1={X(i.T)} x2={X(i.T)} y1={B} y2={Y(c.Cs)} stroke={lit('T') ? HL : HERE} strokeDasharray="3 3" />
        <circle cx={X(i.T)} cy={Y(c.Cs)} r={5} fill={lit('V') || lit('Cs') ? HL : HERE} />
        {/* above the point: the design curve runs level to its left and falls to its right */}
        <text x={X(i.T) + 8} y={Y(c.Cs) - 10} fontSize={12} fontWeight={700} fill={HERE}>T = {i.T} s → Cs = {c.Cs.toFixed(4)}</text>
        {/* the legend sits at the right, midway between the cap and the floor,
            where the curves have already fallen away */}
        <g fontSize={11.5} transform={`translate(0 ${(Y(c.Csmax) + Y(Math.max(c.Csmin, c.Cszone4))) / 2 - 18})`}>
          <line x1={R - 130} x2={R - 110} y1={4} y2={4} stroke={CURVE} strokeWidth={2.4} /><text x={R - 105} y={8} fill={INK}>design Cs</text>
          <line x1={R - 130} x2={R - 110} y1={22} y2={22} stroke={RAW} strokeWidth={1.3} strokeDasharray="6 4" /><text x={R - 105} y={26} fill={INK}>Cv·I/(R·T)</text>
        </g>
      </svg>
    </DrawingFrame>
  )
}
