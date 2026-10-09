// ─────────────────────────────────────────────────────────────────────────
// Drawing for the material estimates — how each commercial 6 m bar is used.
//
// Every row is one stock bar on the SAME metre scale: a main bar is its
// usable length plus the lap the next bar overlaps; a tie or stirrup bar is
// its whole cuts plus the offcut that is wasted. That is the arithmetic
// behind every bar count on the page, drawn.
// ─────────────────────────────────────────────────────────────────────────
import { BAR_LENGTH } from '../engine/quantities'
import { DrawingFrame } from './DrawingFrame'

const INK = '#37526e'
const MUTED = '#6b7a8c'
const FAINT = '#a39d8d'
const STEEL = '#c9d8e8'
const LAP = '#f0d9a8'
const WASTE = '#e9e4da'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

export type CuttingRow =
  | { label: string; kind: 'lap'; splice: number; bars: number }
  | { label: string; kind: 'cuts'; cut: number; bars: number }

export function StockCutting({ rows }: { rows: CuttingRow[] }) {
  const x0 = 16, len = 430
  const k = len / BAR_LENGTH
  const X = (m: number) => x0 + Math.min(Math.max(m, 0), BAR_LENGTH) * k
  const rowH = 44, top = 8, bh = 12
  const W = x0 + len + 16
  const axisY = top + rows.length * rowH + 6
  const H = axisY + 30

  return (
    <DrawingFrame label="bar cutting from stock">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[600px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        <defs>
          <pattern id="est-waste" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill={WASTE} />
            <line x1="0" y1="0" x2="0" y2="5" stroke={FAINT} strokeWidth="1" />
          </pattern>
        </defs>
        {rows.map((r, i) => {
          const y = top + i * rowH + 16
          const head = <text x={x0} y={y - 5} fontSize={9.5} fill={INK} fontWeight={700}>
            {r.label}<tspan fontWeight={400} fill={MUTED}> · {r.bars} bar{r.bars === 1 ? '' : 's'} of {BAR_LENGTH} m</tspan>
          </text>
          if (r.kind === 'lap') {
            const use = BAR_LENGTH - r.splice
            return (
              <g key={i}>
                {head}
                <rect x={X(0)} y={y} width={X(use) - X(0)} height={bh} fill={STEEL} stroke={INK} strokeWidth={0.9} />
                <rect x={X(use)} y={y} width={X(BAR_LENGTH) - X(use)} height={bh} fill={LAP} stroke={INK} strokeWidth={0.9} />
                <text x={(X(0) + X(use)) / 2} y={y + bh + 11} fontSize={8.5} fill={MUTED} textAnchor="middle">usable {use.toFixed(2)} m</text>
                <text x={X(BAR_LENGTH)} y={y + bh + 11} fontSize={8.5} fill={MUTED} textAnchor="end" {...HALO}>lap {r.splice.toFixed(2)}</text>
              </g>
            )
          }
          const n = r.cut > 0 ? Math.floor(BAR_LENGTH / r.cut + 1e-9) : 0
          const used = n * r.cut
          return (
            <g key={i}>
              {head}
              {Array.from({ length: n }, (_, j) => (
                <rect key={j} x={X(j * r.cut)} y={y} width={r.cut * k} height={bh} fill={STEEL} stroke={INK} strokeWidth={0.9} />
              ))}
              {used < BAR_LENGTH - 1e-9 && <rect x={X(used)} y={y} width={X(BAR_LENGTH) - X(used)} height={bh} fill="url(#est-waste)" stroke={INK} strokeWidth={0.9} />}
              <text x={X(0)} y={y + bh + 11} fontSize={8.5} fill={MUTED}>{n} × {r.cut.toFixed(2)} m</text>
              <text x={X(BAR_LENGTH)} y={y + bh + 11} fontSize={8.5} fill={MUTED} textAnchor="end" {...HALO}>
                {n === 0 ? 'too long for the stock bar' : BAR_LENGTH - used < 0.005 ? 'no offcut' : `waste ${(BAR_LENGTH - used).toFixed(2)}`}
              </text>
            </g>
          )
        })}
        {/* metre scale shared by every row */}
        <line x1={X(0)} y1={axisY} x2={X(BAR_LENGTH)} y2={axisY} stroke={INK} strokeWidth={0.8} />
        {Array.from({ length: BAR_LENGTH + 1 }, (_, m) => (
          <g key={m}>
            <line x1={X(m)} y1={axisY} x2={X(m)} y2={axisY + 4} stroke={INK} strokeWidth={0.8} />
            <text x={X(m)} y={axisY + 13} fontSize={8} fill={MUTED} textAnchor="middle">{m}</text>
          </g>
        ))}
        <text x={X(BAR_LENGTH)} y={H - 3} fontSize={7.5} fill={FAINT} textAnchor="end">m · every bar on one scale</text>
      </svg>
    </DrawingFrame>
  )
}
