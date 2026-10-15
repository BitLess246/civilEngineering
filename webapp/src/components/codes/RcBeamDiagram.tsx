// The RC beam the Code Library explains, drawn from the live example — not a
// picture. Flexure: the cross-section with its bars, the neutral axis and the
// equivalent stress block, the strain profile, and the C–T couple on its lever
// arm. Shear: a length of the beam with the stirrups at their real spacing and
// a 45° diagonal crack, so the number of stirrups the crack crosses — the
// whole idea behind the spacing limit — can be counted.
//
// Every element answers to a variable key, so clicking `a` in an equation
// lights the block, `d` the effective-depth dimension, `A_s` the bars.
import type { BeamExampleInput, BeamLayer } from '../../lib/codes'
import { DrawingFrame } from '../DrawingFrame'


const INK = 'var(--color-ink, #1f2937)', MUTED = '#64748b', CONC = '#e7e3d8', CONC_EDGE = '#8a8577'
const STEEL = '#1f4e8c', COMP = '#d4512b', HL = '#f59e0b'

interface FlexProps {
  i: BeamExampleInput
  v: Record<string, number>
  layers: ReadonlySet<BeamLayer>
  hl: string | null
}

/** Flexure: section · strain · stress/forces, side by side, in one SVG. */
export function BeamFlexureDiagram({ i, v, layers, hl }: FlexProps) {
  const W = 640, H = 340, top = 40
  const sc = Math.min(200 / i.b, 250 / i.h)
  const bx = 50, bw = i.b * sc, bh = i.h * sc
  const Y = (mm: number) => top + mm * sc
  const on = (l: BeamLayer) => layers.has(l)
  const glow = (keys: string[]) => (hl && keys.includes(hl) ? { filter: 'drop-shadow(0 0 3px #f59e0b)' } : undefined)
  const strokeHL = (keys: string[], base: string) => (hl && keys.includes(hl) ? HL : base)
  const d = v.d, c = v.c, a = v.a
  const n = i.nBars, db = i.barDia * sc
  const inner = i.b - 2 * (i.cover + i.stirrupDia) - i.barDia
  const barXs = Array.from({ length: n }, (_, k) => bx + (i.cover + i.stirrupDia + i.barDia / 2 + (n > 1 ? (inner * k) / (n - 1) : inner / 2)) * sc)
  // strain profile
  const sx0 = 315, sW = 90
  const eTop = 0.003, eBot = v.et ?? 0
  const eMax = Math.max(eTop, eBot, 1e-6)
  const SX = (e: number) => sx0 + (e / eMax) * sW * 0.5
  // stress block / forces
  const fx0 = 465

  return (
    <DrawingFrame label="Beam cross-section, strain profile and internal forces">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Beam cross-section, strain profile and internal forces">
      <text x={bx} y={18} fontSize={13} fontWeight={700} fill={INK}>SECTION</text>
      <text x={sx0 - 20} y={18} fontSize={13} fontWeight={700} fill={INK}>STRAIN</text>
      <text x={fx0 - 20} y={18} fontSize={13} fontWeight={700} fill={INK}>STRESS · FORCES</text>

      {/* concrete */}
      <rect x={bx} y={top} width={bw} height={bh} fill={CONC} stroke={strokeHL(['b', 'h'], CONC_EDGE)} strokeWidth={1.4} style={glow(['b'])} />
      {on('block') && <rect x={bx} y={top} width={bw} height={a * sc} fill={COMP} opacity={0.32} stroke={strokeHL(['a'], 'none')} strokeWidth={2} style={glow(['a'])} />}
      {on('stirrup') && <rect x={bx + i.cover * sc} y={top + i.cover * sc} width={bw - 2 * i.cover * sc} height={bh - 2 * i.cover * sc}
        rx={6} fill="none" stroke={strokeHL(['Av', 's'], '#6b7280')} strokeWidth={Math.max(1.2, i.stirrupDia * sc * 0.9)} />}
      {on('bars') && barXs.map((x, k) => (
        <circle key={k} cx={x} cy={Y(d)} r={Math.max(2.5, db / 2)} fill={strokeHL(['As'], STEEL)} style={glow(['As'])} />
      ))}
      {on('na') && <g>
        <line x1={bx - 8} y1={Y(c)} x2={fx0 + 100} y2={Y(c)} stroke={strokeHL(['c'], MUTED)} strokeDasharray="5 4" strokeWidth={hl === 'c' ? 2 : 1} />
        <text x={bx + bw + 6} y={Y(c) - 4} fontSize={12} fill={MUTED}>N.A.  c = {c.toFixed(1)}</text>
      </g>}
      {/* dimensions */}
      <g fontSize={12} fill={MUTED}>
        <line x1={bx} y1={top + bh + 14} x2={bx + bw} y2={top + bh + 14} stroke={strokeHL(['b'], MUTED)} strokeWidth={hl === 'b' ? 2 : 1} />
        <text x={bx + bw / 2} y={top + bh + 27} textAnchor="middle">b = {i.b}</text>
        <line x1={bx - 22} y1={top} x2={bx - 22} y2={Y(d)} stroke={strokeHL(['d'], MUTED)} strokeWidth={hl === 'd' ? 2.4 : 1} />
        <text x={bx - 26} y={top + (d * sc) / 2} textAnchor="end" transform={`rotate(-90 ${bx - 26} ${top + (d * sc) / 2})`}>d = {d.toFixed(0)}</text>
      </g>

      {/* strain */}
      {on('strain') && <g style={glow(['et'])}>
        <line x1={sx0} y1={top} x2={sx0} y2={top + bh} stroke={MUTED} />
        <polygon points={`${sx0},${Y(c)} ${SX(-eTop)},${top} ${sx0},${top}`} fill={COMP} opacity={0.3} />
        <polygon points={`${sx0},${Y(c)} ${SX(eBot)},${Y(d)} ${sx0},${Y(d)}`} fill={STEEL} opacity={0.3} />
        <line x1={SX(-eTop)} y1={top} x2={SX(eBot)} y2={Y(d)} stroke={strokeHL(['et'], INK)} strokeWidth={1.5} />
        <text x={SX(-eTop) - 4} y={top - 4} textAnchor="end" fontSize={12} fill={COMP}>εcu = 0.003</text>
        <text x={SX(eBot) + 4} y={Y(d) + 4} fontSize={12} fill={STEEL} fontWeight={hl === 'et' ? 700 : 400}>εt = {eBot.toFixed(4)}</text>
      </g>}

      {/* stress block + forces */}
      {on('forces') && <g>
        <rect x={fx0} y={top} width={40} height={a * sc} fill={COMP} opacity={0.35} stroke={strokeHL(['a'], 'none')} strokeWidth={2} />
        <text x={fx0 + 46} y={top + 10} fontSize={12} fill={COMP}>0.85 f′c</text>
        <line x1={fx0 + 80} y1={Y(a / 2)} x2={fx0 + 30} y2={Y(a / 2)} stroke={COMP} strokeWidth={2} markerEnd="url(#arr)" />
        <text x={fx0 + 84} y={Y(a / 2) + 4} fontSize={12.5} fill={COMP} fontWeight={700}>C</text>
        <line x1={fx0 + 30} y1={Y(d)} x2={fx0 + 80} y2={Y(d)} stroke={STEEL} strokeWidth={2} markerEnd="url(#arr)" />
        <text x={fx0 + 84} y={Y(d) + 4} fontSize={12.5} fill={STEEL} fontWeight={700}>T = As·fs</text>
        <line x1={fx0 + 22} y1={Y(a / 2)} x2={fx0 + 22} y2={Y(d)} stroke={strokeHL(['Mn', 'phiMn'], MUTED)} strokeWidth={hl === 'Mn' || hl === 'phiMn' ? 2.4 : 1} />
        <text x={fx0 + 18} y={(Y(a / 2) + Y(d)) / 2} textAnchor="end" fontSize={12} fill={MUTED}>d − a/2</text>
        <text x={W - 6} y={top + bh + 27} textAnchor="end" fontSize={12} fill={INK}>Mn = T·(d − a/2) = {v.Mn.toFixed(1)} kN·m</text>
      </g>}
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>
    </svg>
    </DrawingFrame>
  )
}

/** Shear: a length of beam, stirrups at s, a 45° crack from the support face. */
export function BeamShearDiagram({ i, v, hl }: { i: BeamExampleInput; v: Record<string, number>; hl: string | null }) {
  const W = 640, H = 260, left = 30, top = 44
  const minLen = Math.max(3 * v.d, 6 * i.s, 1200)
  const sc = Math.min((W - 2 * left) / minLen, 140 / i.h)
  const len = (W - 2 * left) / sc                          // mm of beam drawn: the full width
  const X = (mm: number) => left + mm * sc, Yb = (mm: number) => top + mm * sc
  const stirrups: number[] = []
  for (let x = i.s / 2; x < len; x += i.s) stirrups.push(x)
  // the crack: 45° from the bottom at x0 to the top of d
  const x0 = len * 0.35, x1 = x0 + v.d
  const crossed = stirrups.filter((x) => x > x0 && x < x1).length
  const okSpacing = i.s <= v.sMax + 1e-9
  const hlc = (keys: string[], base: string) => (hl && keys.includes(hl) ? HL : base)
  return (
    <DrawingFrame label="Beam elevation with stirrups and a diagonal shear crack">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Beam elevation with stirrups and a diagonal shear crack">
      <text x={left} y={20} fontSize={13} fontWeight={700} fill={INK}>ELEVATION — stirrups at s = {i.s} mm (s,max = {v.sMax.toFixed(0)} mm)</text>
      <rect x={X(0)} y={Yb(0)} width={len * sc} height={i.h * sc} fill={CONC} stroke={CONC_EDGE} />
      <line x1={X(0)} y1={Yb(v.d)} x2={X(len)} y2={Yb(v.d)} stroke={hlc(['d'], STEEL)} strokeWidth={3} />
      {stirrups.map((x, k) => (
        <line key={k} x1={X(x)} y1={Yb(i.cover)} x2={X(x)} y2={Yb(i.h - i.cover)}
          stroke={hlc(['Av', 's', 'Vs'], x > x0 && x < x1 ? '#0f766e' : '#6b7280')} strokeWidth={x > x0 && x < x1 ? 2.4 : 1.4} />
      ))}
      <line x1={X(x0)} y1={Yb(i.h)} x2={X(x1)} y2={Yb(i.h - v.d)} stroke={COMP} strokeWidth={2.2} strokeDasharray="6 3" />
      <text x={X(x1) + 6} y={Yb(i.h - v.d) + 4} fontSize={12} fill={COMP}>45° crack over d = {v.d.toFixed(0)} mm</text>
      <g fontSize={12} fill={MUTED}>
        <line x1={X(stirrups[0])} y1={Yb(i.h) + 14} x2={X(stirrups[1] ?? stirrups[0])} y2={Yb(i.h) + 14} stroke={hlc(['s', 'sMax'], MUTED)} strokeWidth={hl === 's' || hl === 'sMax' ? 2.4 : 1} />
        <text x={X(stirrups[0])} y={Yb(i.h) + 28}>s</text>
      </g>
      <text x={left} y={H - 24} fontSize={12} fill={okSpacing ? '#0f766e' : '#b91c1c'} fontWeight={700}>
        {crossed} stirrup{crossed === 1 ? '' : 's'} cross the crack · Vs ≈ (d/s)·Av·fyt = {v.Vs.toFixed(1)} kN
      </text>
      {!okSpacing && <text x={left} y={H - 8} fontSize={12} fill="#b91c1c">Spacing exceeds s,max — a crack can slip between stirrups.</text>}
    </svg>
    </DrawingFrame>
  )
}
