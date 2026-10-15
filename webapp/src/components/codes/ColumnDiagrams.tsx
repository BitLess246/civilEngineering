// The column's P–M interaction diagram, drawn from the live example through
// the same engine calls the provision evaluates (`interaction`,
// `capacityAtEccentricity`): the nominal curve, the design curve with its φ
// and its 0.80·φ·Po cap, the balanced point, and the demand with the ray along
// its eccentricity to the capacity it is rated against.
import type { ColumnExampleInput } from '../../lib/codes'
import { columnExample } from '../../lib/codes/rcColumn'
import { DrawingFrame } from '../DrawingFrame'

const INK = 'var(--color-ink, #1f2937)', MUTED = '#64748b', GRID = '#e2e8f0'
const CURVE = '#1f4e8c', NOMINAL = '#94a3b8', DEMAND = '#d4512b', HL = '#f59e0b', BAL = '#0f766e'
const W = 640, H = 380

const ticks = (max: number, n = 5) => {
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, k) => k * step)
}

export function ColumnPmDiagram({ i, hl }: { i: ColumnExampleInput; hl: string | null }) {
  const r = columnExample(i)
  if (!r) return <p className="p-6 text-center text-[12px] text-faint">Enter a section with at least four bars, a positive Pu and a moment of zero or more.</p>
  const { it, cap } = r
  // the curve above zero axial load — the compression side the check reads
  const pts = it.curve.filter((p) => p.Pn >= 0).sort((a, b) => a.Pn - b.Pn)
  const design = pts.map((p) => ({ M: p.phi * p.Mn, P: Math.min(p.phi * p.Pn, r.phiPnMax) }))
  const xMax = Math.max(...pts.map((p) => p.Mn), i.Mu) * 1.12
  const yMax = Math.max(it.Po, i.Pu) * 1.08
  const L = 66, R = W - 24, T = 30, B = H - 44
  const X = (v: number) => L + (v / xMax) * (R - L)
  const Y = (v: number) => B - (v / yMax) * (B - T)
  const line = (ps: { M: number; P: number }[]) => ps.map((p) => `${X(p.M).toFixed(1)},${Y(p.P).toFixed(1)}`).join(' ')
  const lit = (k: string) => hl === k
  const ok = i.Pu <= r.phiPn * 1.005 && i.Pu <= r.phiPnMax * 1.005
  return (
    <DrawingFrame label="P–M interaction diagram">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Column axial load–moment interaction diagram">
        <text x={L} y={18} fontSize={13} fontWeight={700} fill={INK}>P–M interaction — {i.b}×{i.h}, {i.numBars}-⌀{i.barDia} {i.layout}, f′c {i.fc}, fy {i.fy}</text>
        {ticks(yMax).map((v) => <g key={`y${v}`}><line x1={L} x2={R} y1={Y(v)} y2={Y(v)} stroke={GRID} /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize={12} fill={MUTED}>{v}</text></g>)}
        {ticks(xMax).map((v) => <text key={`x${v}`} x={X(v)} y={B + 16} textAnchor="middle" fontSize={12} fill={MUTED}>{v}</text>)}
        <line x1={L} x2={R} y1={B} y2={B} stroke={MUTED} /><line x1={L} x2={L} y1={T} y2={B} stroke={MUTED} />
        <text x={(L + R) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={MUTED}>M (kN·m)</text>
        <text x={16} y={(T + B) / 2} textAnchor="middle" fontSize={12} fill={MUTED} transform={`rotate(-90 16 ${(T + B) / 2})`}>P (kN)</text>

        <polyline points={line(pts.map((p) => ({ M: p.Mn, P: p.Pn })))} fill="none" stroke={lit('Pn') || lit('Mn') ? HL : NOMINAL} strokeWidth={1.4} strokeDasharray="6 4" />
        <polyline points={line(design)} fill="none" stroke={lit('phiPn') ? HL : CURVE} strokeWidth={2.4} />
        <line x1={L} x2={X(xMax * 0.92)} y1={Y(r.phiPnMax)} y2={Y(r.phiPnMax)} stroke={lit('phiPnMax') || lit('PnMax') ? HL : CURVE} strokeDasharray="2 3" />
        <text x={X(xMax * 0.92)} y={Y(r.phiPnMax) - 5} textAnchor="end" fontSize={11.5} fill={CURVE}>φPn,max = {r.phiPnMax.toFixed(0)}</text>
        <circle cx={L} cy={Y(it.Po)} r={3.5} fill={lit('Po') ? HL : NOMINAL} />
        <text x={L + 8} y={Y(it.Po) - 7} fontSize={11.5} fill={MUTED}>Po = {it.Po.toFixed(0)}</text>

        <circle cx={X(it.balanced.Mb)} cy={Y(it.balanced.Pb)} r={4} fill={lit('Pb') || lit('Mb') || lit('cb') ? HL : BAL} />
        <text x={X(it.balanced.Mb) + 7} y={Y(it.balanced.Pb) + 4} fontSize={11.5} fill={BAL}>balanced</text>

        <line x1={X(0)} y1={Y(0)} x2={X(cap.phi * cap.Mn)} y2={Y(r.phiPn)} stroke={lit('e') ? HL : DEMAND} strokeDasharray="3 3" />
        <circle cx={X(cap.phi * cap.Mn)} cy={Y(r.phiPn)} r={4} fill="none" stroke={CURVE} strokeWidth={2} />
        <circle cx={X(i.Mu)} cy={Y(i.Pu)} r={5} fill={lit('Pu') || lit('Mu') ? HL : DEMAND} />
        {/* left of the point: the curve it is measured against runs to its right */}
        <text x={X(i.Mu) - 9} y={Y(i.Pu) - 7} textAnchor="end" fontSize={12} fontWeight={700} fill={DEMAND}>(Mu, Pu) {ok ? 'inside' : 'outside'}</text>
        <g fontSize={11.5}>
          <line x1={R - 170} x2={R - 150} y1={T + 8} y2={T + 8} stroke={CURVE} strokeWidth={2.4} /><text x={R - 145} y={T + 12} fill={INK}>design φPn–φMn</text>
          <line x1={R - 170} x2={R - 150} y1={T + 24} y2={T + 24} stroke={NOMINAL} strokeWidth={1.4} strokeDasharray="6 4" /><text x={R - 145} y={T + 28} fill={INK}>nominal Pn–Mn</text>
        </g>
      </svg>
    </DrawingFrame>
  )
}
