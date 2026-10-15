// One-way shear in a spread footing, drawn from the live example: the plan
// with the critical section at d from the column face and the loaded strip
// beyond it, and the section through the footing with the soil pressure that
// strip carries and the diagonal crack it would open. Geometry only — the
// numbers are `footingShearExample`'s, the provision's own.
import type { FootingShearInput } from '../../lib/codes'
import { footingShearExample } from '../../lib/codes/footingShear'
import { DrawingFrame } from '../DrawingFrame'

const INK = 'var(--color-ink, #1f2937)', MUTED = '#64748b', CONC = '#eef3f8', COL = '#37526e'
const CRIT = '#c2402a', LOAD = '#d4512b', DIM = '#1f77b4', HL = '#f59e0b'
const TICK = 4

function DimH({ x1, x2, y, label, color = DIM, out = 'left' }: { x1: number; x2: number; y: number; label: string; color?: string; out?: 'left' | 'right' }) {
  return <g stroke={color} strokeWidth={1}>
    <line x1={x1} y1={y} x2={x2} y2={y} />
    {[x1, x2].map((x) => <line key={x} x1={x - TICK} y1={y + TICK} x2={x + TICK} y2={y - TICK} strokeWidth={1.4} />)}
    {/* a label wider than its dimension goes outside it, on the side given */}
    {label.length * 7 > x2 - x1 - 6
      ? <text x={out === 'left' ? x1 - 8 : x2 + 8} y={y + 4} textAnchor={out === 'left' ? 'end' : 'start'} fontSize={12} fill={color} stroke="none">{label}</text>
      : <text x={(x1 + x2) / 2} y={y - 5} textAnchor="middle" fontSize={12} fill={color} stroke="none">{label}</text>}
  </g>
}

export function FootingOneWayDiagram({ i, hl }: { i: FootingShearInput; hl: string | null }) {
  const r = footingShearExample(i)
  if (!r) return <p className="p-6 text-center text-[12px] text-faint">Enter a column narrower than the footing and an effective depth below the thickness.</p>
  const W = 640, PL = 60
  // one scale for the plan, both ways, and for the section's length
  const s = Math.min(440 / i.L, 250 / i.B)              // px per m
  const PW = i.L * s, PH = i.B * s
  const x0 = PL, y0 = 44
  const cx = x0 + PW / 2, cw = (i.c / 1000) * s
  const face = cx + cw / 2, secX = face + (i.d / 1000) * s, edge = x0 + PW
  const lit = (k: string) => hl === k
  // the section view below the plan, depth exaggerated to stay legible
  const sy0 = y0 + PH + 120, hpx = Math.max(34, Math.min(90, (i.h / 1000) * s * 1.6)), dpx = hpx * (i.d / i.h)
  const H = sy0 + hpx + 70
  const arrows = r.inside ? [] : Array.from({ length: 6 }, (_, k) => secX + ((k + 0.5) / 6) * (edge - secX))
  return (
    <DrawingFrame label="One-way shear: critical section and loaded strip">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Footing plan and section with the one-way shear critical section">
        <text x={x0} y={18} fontSize={13} fontWeight={700} fill={INK}>PLAN — section at d from the column face</text>
        <rect x={x0} y={y0} width={PW} height={PH} fill={CONC} stroke={COL} strokeWidth={1.2} />
        {!r.inside && <rect x={secX} y={y0} width={edge - secX} height={PH} fill={LOAD} opacity={lit('Vu') || lit('arm') ? 0.32 : 0.18} />}
        <rect x={cx - cw / 2} y={y0 + PH / 2 - cw / 2} width={cw} height={cw} fill={COL} />
        <line x1={secX} x2={secX} y1={y0 - 8} y2={y0 + PH + 8} stroke={CRIT} strokeWidth={lit('d') ? 3 : 2} strokeDasharray="7 4" />
        <text x={secX + 4} y={y0 - 12} fontSize={11.5} fill={CRIT}>critical section</text>
        <DimH x1={x0} x2={edge} y={y0 + PH + 22} label={`L = ${i.L} m`} />
        <DimH x1={face} x2={secX} y={y0 + PH + 44} label={`d = ${Math.round(i.d)}`} color={lit('d') ? HL : DIM} />
        {!r.inside && <DimH x1={secX} x2={edge} y={y0 + PH + 66} label={`aᵥ = ${r.arm.toFixed(3)} m`} color={lit('arm') ? HL : DIM} out="right" />}
        <g stroke={lit('B') ? HL : DIM} strokeWidth={1}>
          <line x1={edge + 22} y1={y0} x2={edge + 22} y2={y0 + PH} />
          {[y0, y0 + PH].map((y) => <line key={y} x1={edge + 22 - TICK} y1={y + TICK} x2={edge + 22 + TICK} y2={y - TICK} strokeWidth={1.4} />)}
          <text x={edge + 30} y={y0 + PH / 2 + 4} fontSize={12} fill={lit('B') ? HL : DIM} stroke="none">B = {i.B} m</text>
        </g>

        <text x={x0} y={sy0 - 26} fontSize={13} fontWeight={700} fill={INK}>SECTION — the strip beyond it is the shear</text>
        <rect x={cx - cw / 2} y={sy0 - 22} width={cw} height={22} fill={COL} />
        <rect x={x0} y={sy0} width={PW} height={hpx} fill={CONC} stroke={COL} strokeWidth={1.2} />
        <line x1={x0} x2={edge} y1={sy0 + dpx} y2={sy0 + dpx} stroke={MUTED} strokeDasharray="4 3" />
        <text x={x0 + 4} y={sy0 + dpx - 4} fontSize={11} fill={MUTED}>bottom mat</text>
        <line x1={secX} x2={secX} y1={sy0 - 6} y2={sy0 + hpx + 6} stroke={CRIT} strokeWidth={2} strokeDasharray="7 4" />
        <line x1={face} y1={sy0} x2={Math.min(edge, face + dpx * 1.1)} y2={sy0 + dpx} stroke={CRIT} strokeWidth={1.4} />
        {arrows.map((x) => <g key={x} stroke={lit('qu') ? HL : LOAD} fill={lit('qu') ? HL : LOAD}>
          <line x1={x} x2={x} y1={sy0 + hpx + 30} y2={sy0 + hpx + 6} strokeWidth={1.4} />
          <path d={`M ${x - 4} ${sy0 + hpx + 12} L ${x} ${sy0 + hpx + 4} L ${x + 4} ${sy0 + hpx + 12} Z`} stroke="none" />
        </g>)}
        {!r.inside && <text x={(secX + edge) / 2} y={sy0 + hpx + 46} textAnchor="middle" fontSize={12} fill={LOAD}>qu = {i.qu} kPa → Vu = {r.Vu.toFixed(1)} kN</text>}
        <g stroke={lit('d') ? HL : DIM} strokeWidth={1}>
          <line x1={x0 - 18} y1={sy0} x2={x0 - 18} y2={sy0 + dpx} />
          {[sy0, sy0 + dpx].map((y) => <line key={y} x1={x0 - 18 - TICK} y1={y + TICK} x2={x0 - 18 + TICK} y2={y - TICK} strokeWidth={1.4} />)}
          <text x={x0 - 24} y={sy0 + dpx / 2 + 4} textAnchor="end" fontSize={12} fill={lit('d') ? HL : DIM} stroke="none">d</text>
        </g>
        <text x={edge + 10} y={sy0 + hpx / 2 + 4} fontSize={12} fill={INK}>φVc = {r.phiVc.toFixed(1)} kN</text>
      </svg>
    </DrawingFrame>
  )
}
