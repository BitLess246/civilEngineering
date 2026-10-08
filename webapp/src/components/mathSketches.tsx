// ─────────────────────────────────────────────────────────────────────────
// Live schematics for the mathematics mini-calculators (joints, trigonometry,
// spherical triangles). Schematic, not to scale unless a graph says otherwise:
// each shows what the numbers mean and redraws from the live inputs. Ink is
// `currentColor`, so they theme. Same methodology as dynamicsSketches: one
// Sheet wrapper (DrawingFrame + viewBox + arrow marker), one T text helper.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { f2 } from '../lib/influenceStyle'
import type { ForceComponents } from '../engine/concurrentForces'

const W = 640, H = 300
const ink = { stroke: 'currentColor', fill: 'none' } as const
const T = ({ x, y, children, anchor = 'start', size = 11, bold = false }: {
  x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; bold?: boolean
}) => <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={bold ? 700 : 400} fill="currentColor">{children}</text>

function Sheet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-pdf-drawing className="mx-auto max-w-[680px]">
      <DrawingFrame label={label}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
          <title>{label}</title>
          <defs>
            <marker id="ms-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {children}
        </svg>
      </DrawingFrame>
    </div>
  )
}

const Arrow = ({ x1, y1, x2, y2, w = 2, op = 1, dash }: { x1: number; y1: number; x2: number; y2: number; w?: number; op?: number; dash?: string }) =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} {...ink} strokeWidth={w} opacity={op} strokeDasharray={dash} markerEnd="url(#ms-arrow)" />

// ── Method of Joints ────────────────────────────────────────────────────────

/** The joint with every force as an arrow, each split into dashed x/y
 *  components, and the resultant drawn bold. Name tags ride the arrow tips —
 *  the VALUES stay in the results table and the cards, where the reader is
 *  already looking; a value block drawn into this viewBox would land in the
 *  DrawingFrame's panned region on a phone-width card. */
export function JointForceSketch({ forces, R, thetaDeg, equilibrium }: {
  forces: ForceComponents[]; R: number; thetaDeg: number; equilibrium: boolean
}) {
  const JX = 150, JY = 170
  const maxF = Math.max(...forces.map((f) => f.magnitude), 1e-9)
  const k = 92 / maxF // longest force arrow, px per kN
  const dir = (deg: number) => ({ c: Math.cos((deg * Math.PI) / 180), s: -Math.sin((deg * Math.PI) / 180) })
  const Rk = (R / maxF) * 92
  const rd = dir(thetaDeg)

  return (
    <Sheet label="Forces at the joint">
      {/* reference axes, bottom-left */}
      <Arrow x1={44} y1={272} x2={92} y2={272} w={1.2} op={0.55} />
      <Arrow x1={44} y1={272} x2={44} y2={228} w={1.2} op={0.55} />
      <T x={98} y={276} size={10}>x</T>
      <T x={40} y={220} size={10}>y</T>

      {/* the joint itself */}
      <circle cx={JX} cy={JY} r={5} fill="currentColor" />
      <T x={JX - 10} y={JY + 22} size={11} bold>joint</T>

      {/* each force: solid arrow, dashed components, name tag at the tip */}
      {forces.map((f, i) => {
        const d = dir(((f.angleDeg % 360) + 360) % 360)
        const len = f.magnitude * k
        const ex = JX + d.c * len, ey = JY + d.s * len
        const tx = ex + d.c * 16, ty = ey + d.s * 16
        return (
          <g key={`${f.name}-${i}`}>
            <Arrow x1={JX} y1={JY} x2={ex} y2={ey} w={2.2} />
            {Math.abs(f.fx) > maxF * 0.005 && <line x1={ex} y1={ey} x2={ex} y2={JY} {...ink} strokeWidth={1} opacity={0.4} strokeDasharray="4 3" />}
            {Math.abs(f.fy) > maxF * 0.005 && <line x1={ex} y1={ey} x2={JX} y2={ey} {...ink} strokeWidth={1} opacity={0.4} strokeDasharray="4 3" />}
            <T x={tx} y={ty + 4} anchor={d.c >= 0 ? 'start' : 'end'} bold>{f.name}</T>
          </g>
        )
      })}

      {/* the resultant, bold; its tag rides the tip like the forces' do */}
      {!equilibrium && Rk > 2 && (
        <>
          <Arrow x1={JX} y1={JY} x2={JX + rd.c * Rk} y2={JY + rd.s * Rk} w={3.4} />
          <T x={JX + rd.c * (Rk + 16)} y={JY + rd.s * (Rk + 16) + 4} anchor={rd.c >= 0 ? 'start' : 'end'} bold>R</T>
        </>
      )}
      {equilibrium && (
        <T x={JX + 96} y={JY - 78} size={11.5} bold>ΣFx = ΣFy = 0 — the joint holds</T>
      )}
    </Sheet>
  )
}

// ── Trigonometry (right triangle) ───────────────────────────────────────────

/** The right triangle with C = 90°: side a opposite A (horizontal, bottom),
 *  side b opposite B (vertical, left), c the hypotenuse. Live side and angle
 *  labels — the picture the solver's inverse functions refer to. */
export function RightTriangleSketch({ a, b, c, A, B }: { a: number; b: number; c: number; A: number; B: number }) {
  const CX = 150, CY = 248           // C — the right angle, bottom-left
  const wa = (a / Math.max(a, b)) * 330
  const hb = (b / Math.max(a, b)) * 200
  const AX = CX, AY = CY - hb, BX = CX + wa, BY = CY
  const mid = { x: (AX + BX) / 2, y: (AY + BY) / 2 }
  const len = Math.hypot(hb, wa) || 1
  const nx = hb / len, ny = -wa / len // outward (up-right) normal of the hypotenuse

  return (
    <Sheet label="Right triangle">
      <path d={`M${CX},${CY} L${BX},${BY} L${AX},${AY} Z`} {...ink} strokeWidth={2.4} />
      {/* the right-angle mark at C */}
      <path d={`M${CX + 18},${CY} L${CX + 18},${CY - 18} L${CX},${CY - 18}`} {...ink} strokeWidth={1.2} />
      <T x={CX + 24} y={CY - 6} size={11} bold>C = 90°</T>

      {/* sides */}
      <T x={CX + wa / 2} y={CY + 20} anchor="middle" bold>a = {f2(a)}</T>
      <T x={CX - 12} y={CY - hb / 2} anchor="end" bold>b = {f2(b)}</T>
      <T x={mid.x + nx * 20} y={mid.y + ny * 20} anchor="middle" bold>c = {f2(c)}</T>

      {/* angles at their vertices */}
      <T x={AX + 14} y={AY + 20} size={11} bold>A = {f2(A)}°</T>
      <T x={BX - 16} y={BY - 12} anchor="end" size={11} bold>B = {f2(B)}°</T>
    </Sheet>
  )
}

// ── Spherical triangle ──────────────────────────────────────────────────────

/** The sphere with its great-circle triangle: vertex A at the pole-ish top,
 *  B and C on the lower hemisphere, edges bowed outward along the great
 *  circles. Schematic — the geometry shows the vocabulary, the numbers show
 *  the values. */
export function SphericalTriangleSketch({ a, b, c, A, B, C }: {
  a: number; b: number; c: number; A: number; B: number; C: number
}) {
  const ax = 258, ay = 74, bx = 150, by = 208, cx = 368, cy = 196
  return (
    <Sheet label="Spherical triangle">
      {/* the sphere and its equator */}
      <circle cx={258} cy={170} r={108} {...ink} strokeWidth={1.4} opacity={0.5} />
      <ellipse cx={258} cy={170} rx={108} ry={27} {...ink} strokeWidth={1} opacity={0.3} strokeDasharray="5 4" />

      {/* the three great-circle edges, bowed outward */}
      <path d={`M${bx},${by} Q260,272 ${cx},${cy}`} {...ink} strokeWidth={2.4} />
      <path d={`M${cx},${cy} Q408,124 ${ax},${ay}`} {...ink} strokeWidth={2.4} />
      <path d={`M${ax},${ay} Q110,118 ${bx},${by}`} {...ink} strokeWidth={2.4} />

      {/* vertices */}
      <circle cx={ax} cy={ay} r={4.5} fill="currentColor" />
      <circle cx={bx} cy={by} r={4.5} fill="currentColor" />
      <circle cx={cx} cy={cy} r={4.5} fill="currentColor" />

      {/* vertex angles — placed inside the sphere so they survive a narrow card */}
      <T x={ax + 12} y={ay - 6} size={11} bold>A = {f2(A)}°</T>
      <T x={bx - 12} y={by + 20} anchor="end" size={11} bold>B = {f2(B)}°</T>
      <T x={cx - 8} y={cy - 30} anchor="end" size={11} bold>C = {f2(C)}°</T>

      {/* opposite sides */}
      <T x={262} y={252} anchor="middle" bold>a = {f2(a)}°</T>
      <T x={352} y={116} anchor="end" size={11} bold>b = {f2(b)}°</T>
      <T x={126} y={146} anchor="end" size={11} bold>c = {f2(c)}°</T>

      <T x={258} y={284} anchor="middle" size={10}>schematic — great-circle arcs</T>
      <T x={258} y={296} anchor="middle" size={10}>A + B + C − 180° = the spherical excess E</T>
    </Sheet>
  )
}
