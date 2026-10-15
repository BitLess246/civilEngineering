// The steel and load-combination diagrams of the Code Library, each drawn from
// the live example through the same engine calls the provision evaluates:
//   · the §F2 strength–unbraced-length curve, with Lp, Lr and this beam's Lb
//   · the web that carries §G2.1 shear, to scale
//   · the §E3 column curve, Fcr against KL/r, with this column on it
//   · every §203.3 combination as a bar, the governing one lit
import type { LoadExampleInput, SteelExampleInput } from '../../lib/codes'
import { shapeByName } from '../../engine/aiscSections'
import { deriveWSection, beamFlexure, beamShear, E_STEEL } from '../../engine/steelDesign'
import { steelCompression } from '../../engine/steelCompression'
import { calcLoadCombinations } from '../../engine/loadCombinations'
import { DrawingFrame } from '../DrawingFrame'

const INK = 'var(--color-ink, #1f2937)', MUTED = '#64748b', GRID = '#e2e8f0'
const CURVE = '#1f4e8c', DEMAND = '#d4512b', HL = '#f59e0b', STEEL = '#94a3b8'
const W = 640

/** Plot frame shared by the two curves: x/y scalers and the axes. */
function axes(xMax: number, yMax: number, H: number) {
  const L = 62, R = W - 24, T = 34, B = H - 46
  const X = (v: number) => L + (v / xMax) * (R - L)
  const Y = (v: number) => B - (v / yMax) * (B - T)
  return { L, R, T, B, X, Y }
}

const ticks = (max: number, n = 5) => {
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, k) => k * step)
}

const NotCovered = ({ text }: { text: string }) => (
  <p className="rounded-md border border-warn-line bg-warn-tint px-3 py-2 text-[12.5px] text-warn">{text}</p>
)

export function SteelLtbCurve({ i, hl }: { i: SteelExampleInput; hl: string | null }) {
  const s = shapeByName(i.shape)
  if (!s || s.family !== 'W') return <NotCovered text={`${i.shape} is not a W-shape — no §F2 curve to draw.`} />
  const p = deriveWSection(s)
  const at = (LbM: number) => beamFlexure(s, p, i.Fy, LbM * 1000, i.Cb)
  const here = at(i.Lb)
  if (!here.applicable) return <NotCovered text={here.reason ?? 'Outside §F2/§F3.'} />
  const H = 300
  const xMax = Math.max((here.Lr / 1000) * 1.6, i.Lb * 1.15, 1)
  const yMax = Math.max(here.Mp, i.Mu) * 1.15
  const { L, R, T, B, X, Y } = axes(xMax, yMax, H)
  const pts = Array.from({ length: 121 }, (_, k) => (k / 120) * xMax).map((lb) => `${X(lb)},${Y(at(lb).phiMn)}`).join(' ')
  const lit = (k: string[]) => (hl && k.includes(hl) ? HL : MUTED)
  return (
    <DrawingFrame label="Design flexural strength against unbraced length">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Design flexural strength against unbraced length">
        <text x={L} y={18} fontSize={13} fontWeight={700} fill={INK}>φbMn against Lb — {s.name}, Fy {i.Fy} MPa, Cb {i.Cb}</text>
        {ticks(yMax).map((v) => <g key={`y${v}`}><line x1={L} x2={R} y1={Y(v)} y2={Y(v)} stroke={GRID} /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize={12} fill={MUTED}>{v}</text></g>)}
        {ticks(xMax).map((v) => <text key={`x${v}`} x={X(v)} y={B + 16} textAnchor="middle" fontSize={12} fill={MUTED}>{v}</text>)}
        <line x1={L} x2={R} y1={B} y2={B} stroke={MUTED} /><line x1={L} x2={L} y1={T} y2={B} stroke={MUTED} />
        <text x={(L + R) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={MUTED}>Lb (m)</text>
        <text x={14} y={(T + B) / 2} textAnchor="middle" fontSize={12} fill={MUTED} transform={`rotate(-90 14 ${(T + B) / 2})`}>kN·m</text>
        {[['Lp', here.Lp / 1000], ['Lr', here.Lr / 1000]].map(([k, v]) => (
          <g key={k as string}>
            <line x1={X(v as number)} x2={X(v as number)} y1={T} y2={B} stroke={lit([k as string])} strokeDasharray="5 4" strokeWidth={hl === k ? 2 : 1} />
            <text x={X(v as number) + 4} y={T + 12} fontSize={12} fill={lit([k as string])}>{k} = {(v as number).toFixed(2)}</text>
          </g>
        ))}
        <polyline points={pts} fill="none" stroke={hl === 'phiMn' || hl === 'Mn' ? HL : CURVE} strokeWidth={2.4} />
        <line x1={L} x2={R} y1={Y(i.Mu)} y2={Y(i.Mu)} stroke={DEMAND} strokeDasharray="6 3" strokeWidth={hl === 'Mu' ? 2.2 : 1.4} />
        <text x={R} y={Y(i.Mu) - 5} textAnchor="end" fontSize={12} fill={DEMAND}>Mu = {i.Mu}</text>
        <line x1={X(i.Lb)} x2={X(i.Lb)} y1={B} y2={Y(here.phiMn)} stroke={hl === 'Lb' ? HL : INK} strokeWidth={hl === 'Lb' ? 2 : 1} />
        <circle cx={X(i.Lb)} cy={Y(here.phiMn)} r={5} fill={i.Mu <= here.phiMn ? '#15803d' : '#b91c1c'} stroke="#fff" strokeWidth={1.5} />
        <text x={X(i.Lb) + 8} y={Y(here.phiMn) + 16} fontSize={12} fontWeight={700} fill={INK}>φbMn = {here.phiMn.toFixed(1)}</text>
      </svg>
    </DrawingFrame>
  )
}

export function SteelShearWeb({ i, hl }: { i: SteelExampleInput; hl: string | null }) {
  const s = shapeByName(i.shape)
  if (!s || s.family !== 'W' || !s.d || !s.bf || !s.tf || !s.tw) return <NotCovered text={`${i.shape} is not a W-shape.`} />
  const r = beamShear(s, deriveWSection(s), i.Fy)
  const H = 300, sc = Math.min(220 / s.d, 240 / s.bf)
  const cx = 180, top = 40, d = s.d * sc, bf = s.bf * sc, tf = Math.max(2, s.tf * sc), tw = Math.max(2, s.tw * sc)
  const webOn = hl === 'Aw' || hl === 'Vn' || hl === 'phiVn'
  return (
    <DrawingFrame label="Steel I-section with the shear-carrying web area">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Steel I-section with the shear-carrying web area">
        <text x={24} y={20} fontSize={13} fontWeight={700} fill={INK}>{s.name} — the web carries the shear</text>
        <rect x={cx - bf / 2} y={top} width={bf} height={tf} fill={STEEL} />
        <rect x={cx - bf / 2} y={top + d - tf} width={bf} height={tf} fill={STEEL} />
        <rect x={cx - tw / 2} y={top} width={tw} height={d} fill={webOn ? HL : '#1f4e8c'} opacity={0.85} />
        {/* dimensions: extension lines and 45° ticks */}
        <g fontSize={12} fill={MUTED} stroke={MUTED}>
          <line x1={cx + bf / 2 + 2} x2={cx + bf / 2 + 22} y1={top} y2={top} strokeWidth={0.8} />
          <line x1={cx + bf / 2 + 2} x2={cx + bf / 2 + 22} y1={top + d} y2={top + d} strokeWidth={0.8} />
          <line x1={cx + bf / 2 + 16} x2={cx + bf / 2 + 16} y1={top} y2={top + d} />
          {[top, top + d].map((y) => <line key={y} x1={cx + bf / 2 + 12} x2={cx + bf / 2 + 20} y1={y + 4} y2={y - 4} strokeWidth={1.4} />)}
          <text stroke="none" x={cx + bf / 2 + 26} y={top + d / 2 + 4}>d = {s.d} mm</text>
          <line x1={cx - tw / 2} x2={cx - tw / 2} y1={top + d + 2} y2={top + d + 20} strokeWidth={0.8} />
          <line x1={cx + tw / 2} x2={cx + tw / 2} y1={top + d + 2} y2={top + d + 20} strokeWidth={0.8} />
          <line x1={cx - tw / 2 - 18} x2={cx + tw / 2 + 18} y1={top + d + 14} y2={top + d + 14} />
          {[cx - tw / 2, cx + tw / 2].map((x) => <line key={x} x1={x - 4} x2={x + 4} y1={top + d + 18} y2={top + d + 10} strokeWidth={1.4} />)}
          <text stroke="none" x={cx + tw / 2 + 22} y={top + d + 18}>tw = {s.tw} mm</text>
        </g>
        <g fontSize={12} fill={INK}>
          <text x={380} y={80}>Aw = d·tw = {Math.round(r.Aw)} mm²</text>
          <text x={380} y={104} fill={hl === 'hwTw' ? HL : INK}>h/tw = {r.hwTw.toFixed(1)}  (limit {(2.24 * Math.sqrt(E_STEEL / i.Fy)).toFixed(1)})</text>
          <text x={380} y={128}>φv = {r.phiV.toFixed(2)},  Cv1 = {r.Cv1.toFixed(3)}</text>
          <text x={380} y={160} fontWeight={700}>φvVn = {r.phiVn.toFixed(1)} kN</text>
          <text x={380} y={184} fill={i.Vu <= r.phiVn ? '#15803d' : '#b91c1c'} fontWeight={700}>Vu = {i.Vu} kN — {i.Vu <= r.phiVn ? 'passes' : 'fails'}</text>
        </g>
      </svg>
    </DrawingFrame>
  )
}

export function SteelColumnCurve({ i, hl }: { i: SteelExampleInput; hl: string | null }) {
  const s = shapeByName(i.shape)
  if (!s || s.family !== 'W') return <NotCovered text={`${i.shape} is not a W-shape.`} />
  const Lmm = i.L * 1000
  const r = steelCompression(s, i.Fy, i.Kx * Lmm, i.Ky * Lmm, Lmm)
  if (!r.applicable) return <NotCovered text={r.reason ?? 'Outside the compression clauses.'} />
  const H = 300, xMax = 250, yMax = i.Fy * 1.08
  const { L, R, T, B, X, Y } = axes(xMax, yMax, H)
  // §E3 curve for flexural buckling (E3-2 / E3-3), the shape a W-column follows
  const fcr = (kl: number) => { const Fe = (Math.PI ** 2 * E_STEEL) / kl ** 2; return i.Fy / Fe <= 2.25 ? 0.658 ** (i.Fy / Fe) * i.Fy : 0.877 * Fe }
  const pts = Array.from({ length: 125 }, (_, k) => 2 + (k / 124) * (xMax - 2)).map((kl) => `${X(kl)},${Y(fcr(kl))}`).join(' ')
  const lim = 4.71 * Math.sqrt(E_STEEL / i.Fy)
  return (
    <DrawingFrame label="Column curve: critical stress against slenderness">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Column curve: critical stress against slenderness">
        <text x={L} y={18} fontSize={13} fontWeight={700} fill={INK}>Fcr against KL/r — Fy {i.Fy} MPa</text>
        {ticks(yMax).map((v) => <g key={`y${v}`}><line x1={L} x2={R} y1={Y(v)} y2={Y(v)} stroke={GRID} /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize={12} fill={MUTED}>{v}</text></g>)}
        {ticks(xMax).map((v) => <text key={`x${v}`} x={X(v)} y={B + 16} textAnchor="middle" fontSize={12} fill={MUTED}>{v}</text>)}
        <line x1={L} x2={R} y1={B} y2={B} stroke={MUTED} /><line x1={L} x2={L} y1={T} y2={B} stroke={MUTED} />
        <text x={(L + R) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={MUTED}>KL/r</text>
        <text x={14} y={(T + B) / 2} textAnchor="middle" fontSize={12} fill={MUTED} transform={`rotate(-90 14 ${(T + B) / 2})`}>MPa</text>
        <line x1={X(lim)} x2={X(lim)} y1={T} y2={B} stroke={hl === 'lim' ? HL : MUTED} strokeDasharray="5 4" />
        <text x={X(lim) + 4} y={T + 12} fontSize={12} fill={MUTED}>inelastic | elastic</text>
        <line x1={X(200)} x2={X(200)} y1={T} y2={B} stroke="#b91c1c" strokeDasharray="2 4" />
        <text x={X(200) - 4} y={B - 6} textAnchor="end" fontSize={12} fill="#b91c1c">KL/r = 200</text>
        <polyline points={pts} fill="none" stroke={hl === 'Fcr' ? HL : CURVE} strokeWidth={2.4} />
        <circle cx={X(Math.min(r.slenderness, xMax))} cy={Y(r.Fcr)} r={5} fill={i.Pu <= r.phiPn ? '#15803d' : '#b91c1c'} stroke="#fff" strokeWidth={1.5} />
        <text x={X(Math.min(r.slenderness, xMax)) + 8} y={Y(r.Fcr) - 8} fontSize={12} fontWeight={700} fill={hl === 'KLr' ? HL : INK}>
          {s.name}: KL/r {r.slenderness.toFixed(0)}, Fcr {r.Fcr.toFixed(0)} MPa{r.mode === 'flexural' ? '' : ` (${r.mode})`}
        </text>
      </svg>
    </DrawingFrame>
  )
}

export function LoadCombosChart({ i, hl }: { i: LoadExampleInput; hl: string | null }) {
  const r = calcLoadCombinations(i)
  const rowH = 20, top = 34, H = top + r.combos.length * rowH + 20
  const lo = Math.min(0, ...r.combos.map((c) => c.value)), hi = Math.max(0, ...r.combos.map((c) => c.value))
  const L = 250, R = W - 70
  const X = (v: number) => L + ((v - lo) / Math.max(hi - lo, 1e-9)) * (R - L)
  return (
    <DrawingFrame label="Factored load effect of every combination">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Factored load effect of every combination">
        <text x={12} y={18} fontSize={13} fontWeight={700} fill={INK}>Every combination — governing in orange, the smallest (uplift / reversal) in red</text>
        <line x1={X(0)} x2={X(0)} y1={top - 6} y2={H - 14} stroke={MUTED} />
        {r.combos.map((c, k) => {
          const y = top + k * rowH, gov = c.id === r.maxCombo.id, low = c.id === r.minCombo.id
          const lit = hl === 'U' && gov
          return (
            <g key={c.id}>
              <text x={L - 8} y={y + 12} textAnchor="end" fontSize={12} fill={gov ? INK : MUTED} fontWeight={gov ? 700 : 400}>({c.id}) {c.label}</text>
              <rect x={Math.min(X(0), X(c.value))} y={y + 2} width={Math.abs(X(c.value) - X(0))} height={rowH - 6}
                fill={gov || lit ? HL : low ? DEMAND : CURVE} opacity={gov ? 1 : 0.55} />
              <text x={c.value >= 0 ? X(c.value) + 4 : X(c.value) - 4} y={y + 12} textAnchor={c.value >= 0 ? 'start' : 'end'} fontSize={12} fill={INK}>{c.value.toFixed(1)}</text>
            </g>
          )
        })}
      </svg>
    </DrawingFrame>
  )
}
