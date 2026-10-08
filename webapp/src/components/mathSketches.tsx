// ─────────────────────────────────────────────────────────────────────────
// Live schematics for the mathematics mini-calculators (joints, trigonometry,
// spherical triangles). Schematic, not to scale unless a graph says otherwise —
// the one exception is the triangle solver's sketch, drawn in its true shape:
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

// ── Trigonometry (any triangle) ─────────────────────────────────────────────

/** The solved triangle in its TRUE shape — uniformly scaled to the sheet,
 *  never skewed: side a runs along the bottom from C, A sits wherever the
 *  solved angles put it. Values ride their edges and vertices; a right
 *  angle gets the square mark, every other angle an arc on the bisector.
 *  The right angle is drawn, not assumed — that is the whole point. */
export function TriangleSketch({ a, b, c, A, B, C }: { a: number; b: number; c: number; A: number; B: number; C: number }) {
  const rad = (d: number) => (d * Math.PI) / 180
  // geometry: C at the origin, B down-range on +x at distance a, A placed from C
  const raw = {
    C: { x: 0, y: 0 },
    B: { x: a, y: 0 },
    A: { x: b * Math.cos(rad(C)), y: b * Math.sin(rad(C)) },
  }
  // uniform fit into the sheet, margins left for the labels
  const W = 640, H = 300, MX = 82, MT = 50, MB = 36
  const xs = [raw.A.x, raw.B.x, raw.C.x], ys = [raw.A.y, raw.B.y, raw.C.y]
  const w = Math.max(...xs) - Math.min(...xs) || 1, h = Math.max(...ys) - Math.min(...ys) || 1
  const k = Math.min((W - 2 * MX) / w, (H - MT - MB) / h)
  const cx = (W - 2 * MX - w * k) / 2, cy = (H - MT - MB - h * k) / 2
  const sx = (p: { x: number; y: number }) => MX + cx + (p.x - Math.min(...xs)) * k
  const sy = (p: { x: number; y: number }) => H - MB - cy - (p.y - Math.min(...ys)) * k
  const V = { A: { x: sx(raw.A), y: sy(raw.A) }, B: { x: sx(raw.B), y: sy(raw.B) }, C: { x: sx(raw.C), y: sy(raw.C) } }

  const sub = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x - q.x, y: p.y - q.y })
  const add = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + q.x, y: p.y + q.y })
  const mul = (p: { x: number; y: number }, s: number) => ({ x: p.x * s, y: p.y * s })
  const unit = (p: { x: number; y: number }) => { const l = Math.hypot(p.x, p.y) || 1; return { x: p.x / l, y: p.y / l } }
  const perp = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x })
  const dot = (p: { x: number; y: number }, q: { x: number; y: number }) => p.x * q.x + p.y * q.y
  const anchorOf = (v: { x: number; y: number }): 'start' | 'middle' | 'end' => (Math.abs(v.x) < 0.35 ? 'middle' : v.x > 0 ? 'start' : 'end')

  const angles = [
    { name: 'A', deg: A, at: V.A, n1: V.B, n2: V.C },
    { name: 'B', deg: B, at: V.B, n1: V.C, n2: V.A },
    { name: 'C', deg: C, at: V.C, n1: V.A, n2: V.B },
  ]
  const sides = [
    { label: 'a', value: a, from: V.B, to: V.C, opp: V.A },
    { label: 'b', value: b, from: V.C, to: V.A, opp: V.B },
    { label: 'c', value: c, from: V.A, to: V.B, opp: V.C },
  ]

  return (
    <Sheet label="The solved triangle — true shape">
      <path d={`M${V.A.x},${V.A.y} L${V.B.x},${V.B.y} L${V.C.x},${V.C.y} Z`} {...ink} strokeWidth={2.4} />

      {/* the angle marks: a square where 90° actually fell, arcs elsewhere */}
      {angles.map((g) => {
        const u = unit(sub(g.n1, g.at)), v = unit(sub(g.n2, g.at))
        const bis = unit(add(u, v))
        const r = Math.max(8, Math.min(20, 0.38 * Math.min(Math.hypot(g.n1.x - g.at.x, g.n1.y - g.at.y), Math.hypot(g.n2.x - g.at.x, g.n2.y - g.at.y))))
        const isRight = Math.abs(g.deg - 90) < 0.1
        const p1 = add(g.at, mul(u, r)), p2 = add(g.at, mul(v, r))
        return (
          <g key={g.name}>
            {isRight
              ? <path d={`M${p1.x},${p1.y} L${add(add(g.at, mul(u, r)), mul(v, r)).x},${add(add(g.at, mul(u, r)), mul(v, r)).y} L${p2.x},${p2.y}`} {...ink} strokeWidth={1.2} />
              : (() => {
                  const pm = add(g.at, mul(bis, r))
                  const ctrl = sub(mul(pm, 2), mul(add(p1, p2), 0.5))
                  return <path d={`M${p1.x},${p1.y} Q${ctrl.x},${ctrl.y} ${p2.x},${p2.y}`} {...ink} strokeWidth={1.2} />
                })()}
            <T x={g.at.x + bis.x * (r + 15)} y={g.at.y + bis.y * (r + 15) + 4} anchor="middle" size={11} bold>{g.name} = {f2(g.deg)}°</T>
            {/* vertex name, outside */}
            {(() => { const out = mul(bis, -1); const p = add(g.at, mul(out, 19))
              return <T x={p.x} y={p.y + 4} anchor={anchorOf(out)} size={11}>{g.name}</T> })()}
          </g>
        )
      })}

      {/* side values, riding their edges' outward normals */}
      {sides.map((s) => {
        const mid = mul(add(s.from, s.to), 0.5)
        let n = perp(unit(sub(s.to, s.from)))
        if (dot(n, sub(mid, s.opp)) < 0) n = mul(n, -1)
        const p = add(mid, mul(n, 17))
        return <T key={s.label} x={p.x} y={p.y + 4} anchor="middle" bold>{s.label} = {f2(s.value)}</T>
      })}
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
