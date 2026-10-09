// ─────────────────────────────────────────────────────────────────────────
// Live schematics for the standalone dynamics calculators. Schematic, not to
// scale unless a graph says otherwise: each shows what the numbers mean and
// redraws from the live inputs. Ink is `currentColor`, so they theme.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { f2 } from '../lib/influenceStyle'

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
            <marker id="ds-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {children}
        </svg>
      </DrawingFrame>
    </div>
  )
}

const Arrow = ({ x1, y1, x2, y2, w = 2, op = 1 }: { x1: number; y1: number; x2: number; y2: number; w?: number; op?: number }) =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} {...ink} strokeWidth={w} opacity={op} markerEnd="url(#ds-arrow)" />

/** Plot frame: x from 70 to 600, y from 250 (zero) up to 40. Returns mappers. */
function axes(xMax: number, yMin: number, yMax: number) {
  const span = yMax - yMin || 1
  return {
    X: (x: number) => 70 + (x / (xMax || 1)) * 530,
    Y: (y: number) => 250 - ((y - yMin) / span) * 210,
  }
}

/** v–t graph of uniformly accelerated motion: the line from u to v, and the
 *  area under it — the displacement — shaded. */
export function VelocityTimeSketch({ u, v, t }: { u: number; v: number; t: number }) {
  const lo = Math.min(0, u, v), hi = Math.max(0, u, v, 1e-9)
  const { X, Y } = axes(t, lo, hi)
  return (
    <Sheet label="Velocity–time graph">
      <line x1={70} y1={Y(0)} x2={610} y2={Y(0)} {...ink} strokeWidth="1.2" />
      <line x1={70} y1={30} x2={70} y2={265} {...ink} strokeWidth="1.2" />
      <path d={`M${X(0)},${Y(0)} L${X(0)},${Y(u)} L${X(t)},${Y(v)} L${X(t)},${Y(0)} Z`} fill="currentColor" opacity="0.1" />
      <line x1={X(0)} y1={Y(u)} x2={X(t)} y2={Y(v)} {...ink} strokeWidth="2.5" />
      <T x={X(0) + 8} y={Y(u) + (v >= u ? 18 : -10)} bold>u = {f2(u)} m/s</T>
      <T x={X(t) - 6} y={Y(v) - 8} anchor="end" bold>v = {f2(v)} m/s</T>
      <T x={X(t)} y={Y(0) + 16} anchor="middle" size={10}>t = {f2(t)} s</T>
      <T x={(X(0) + X(t)) / 2} y={(Y(0) + Y((u + v) / 2)) / 2 + 4} anchor="middle" size={10.5}>area = s</T>
      <T x={604} y={Y(0) - 6} anchor="end" size={10}>time</T>
      <T x={76} y={40} size={10}>velocity</T>
    </Sheet>
  )
}

/** The trajectory y(x) from launch to landing, with the apex marked. */
export function TrajectorySketch({ A, B, C, range, hMax }: { A: number; B: number; C: number; range: number; hMax: number }) {
  const xMax = Math.max(range, 1e-6)
  const { X, Y } = axes(xMax, 0, Math.max(hMax, C, 1e-6) * 1.1)
  const pts = Array.from({ length: 41 }, (_, i) => {
    const x = (i / 40) * xMax
    return `${X(x)},${Y(Math.max(0, A * x * x + B * x + C))}`
  })
  const xApex = A !== 0 ? Math.min(xMax, Math.max(0, -B / (2 * A))) : 0
  return (
    <Sheet label="Projectile trajectory">
      <line x1={60} y1={Y(0)} x2={612} y2={Y(0)} {...ink} strokeWidth="1.2" />
      {C > 0 && <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={Y(C)} {...ink} strokeWidth="5" opacity="0.3" />}
      <polyline points={pts.join(' ')} {...ink} strokeWidth="2.5" />
      <circle cx={X(xApex)} cy={Y(hMax)} r="4" fill="currentColor" />
      <T x={X(xApex)} y={Y(hMax) - 10} anchor="middle" bold>H = {f2(hMax)} m</T>
      <T x={X(xMax)} y={Y(0) + 18} anchor="end" bold>R = {f2(range)} m</T>
    </Sheet>
  )
}

/** A point on a curved path: velocity along the tangent, aₜ along it, aₙ
 *  toward the center, and their resultant. */
export function CurvilinearSketch({ at, an, rho }: { at: number; an: number; rho: number }) {
  // the path curves UP toward its center of curvature, which is where aₙ points
  const px = 320, py = 230
  const m = Math.max(Math.abs(at), Math.abs(an), 1e-9)
  const len = (a: number) => (a / m) * 120
  return (
    <Sheet label="Tangential and normal acceleration">
      <path d={`M80,90 Q${px},330 560,90`} {...ink} strokeWidth="2" opacity="0.7" />
      <line x1={px} y1={py - 20} x2={px} y2={40} {...ink} strokeWidth="1" strokeDasharray="5 4" opacity="0.5" />
      <T x={px + 6} y={50} size={10}>toward the center (ρ = {f2(rho)} m)</T>
      <circle cx={px} cy={py - 20} r="5" fill="currentColor" />
      {Math.abs(an) > 1e-9 && <Arrow x1={px} y1={py - 20} x2={px} y2={py - 20 - len(an)} w={2.5} />}
      {Math.abs(at) > 1e-9 && <Arrow x1={px} y1={py - 20} x2={px + len(at)} y2={py - 20} w={2.5} />}
      <Arrow x1={px} y1={py - 20} x2={px + len(at)} y2={py - 20 - len(an)} w={1.5} op={0.55} />
      <T x={px - 10} y={py - 20 - len(an) / 2} anchor="end" bold>aₙ = {f2(an)}</T>
      {Math.abs(at) > 1e-9 && <T x={px + len(at) / 2} y={py} anchor="middle" bold>aₜ = {f2(at)}</T>}
    </Sheet>
  )
}

/** A body with the resultant force and the acceleration it causes, in the
 *  x–y plane (z, when present, is reported in the cards). */
export function ForceSketch({ Fx, Fy, ax, ay }: { Fx: number; Fy: number; ax: number; ay: number }) {
  const cx = 300, cy = 160
  const fm = Math.hypot(Fx, Fy) || 1, am = Math.hypot(ax, ay) || 1
  return (
    <Sheet label="Force and acceleration">
      <rect x={cx - 40} y={cy - 30} width={80} height={60} {...ink} strokeWidth="2.5" />
      <T x={cx} y={cy + 4} anchor="middle" bold>m</T>
      {fm > 0 && <Arrow x1={cx + (Fx / fm) * 45} y1={cy - (Fy / fm) * 35} x2={cx + (Fx / fm) * 160} y2={cy - (Fy / fm) * 150} w={3} />}
      <T x={cx + (Fx / fm) * 160} y={cy - (Fy / fm) * 150 - 14} anchor="middle" bold>ΣF = {f2(Math.hypot(Fx, Fy))} N</T>
      {am > 0 && <Arrow x1={cx} y1={cy + 60} x2={cx + (ax / am) * 100} y2={cy + 60 - (ay / am) * 100} w={1.6} op={0.6} />}
      <T x={cx + (ax / am) * 50} y={cy + 60 - (ay / am) * 50 + 20} anchor="middle" size={10.5}>a = {f2(Math.hypot(ax, ay))} m/s²</T>
    </Sheet>
  )
}

/** Energy bars: KE₁, plus the work done, minus the rise in PE, gives KE₂. */
export function EnergyBarsSketch({ bars }: { bars: { label: string; value: number }[] }) {
  const m = Math.max(...bars.map((b) => Math.abs(b.value)), 1e-9)
  const zero = 160, bw = Math.min(90, 500 / bars.length - 20)
  return (
    <Sheet label="Energy balance">
      <line x1={50} y1={zero} x2={610} y2={zero} {...ink} strokeWidth="1.2" />
      {bars.map((b, i) => {
        const x = 70 + i * (bw + 30), h = (b.value / m) * 110
        return (
          <g key={b.label}>
            <rect x={x} y={h >= 0 ? zero - h : zero} width={bw} height={Math.abs(h)} fill="currentColor" opacity={i === 0 || i === bars.length - 1 ? 0.55 : 0.25} />
            <T x={x + bw / 2} y={h >= 0 ? zero - h - 6 : zero - h + 14} anchor="middle" size={10.5} bold>{f2(b.value)}</T>
            <T x={x + bw / 2} y={h >= 0 ? zero + 16 : zero - 8} anchor="middle" size={10}>{b.label}</T>
          </g>
        )
      })}
      <T x={606} y={30} anchor="end" size={10}>joules</T>
    </Sheet>
  )
}

/** Momentum before and after, with the impulse that changed it. */
export function MomentumSketch({ p1, p2, I }: { p1: number; p2: number; I: number }) {
  const m = Math.max(Math.abs(p1), Math.abs(p2), Math.abs(I), 1e-9)
  const len = (p: number) => (p / m) * 220
  const row = (y: number, p: number, label: string) => (
    <g>
      <T x={60} y={y + 4} anchor="end" size={10.5} bold>{label}</T>
      <line x1={320} y1={y - 14} x2={320} y2={y + 14} {...ink} strokeWidth="1" opacity="0.4" />
      {Math.abs(p) > 1e-9 && <Arrow x1={320} y1={y} x2={320 + len(p)} y2={y} w={4} />}
      <T x={320 + len(p) + (p >= 0 ? 10 : -10)} y={y + 4} anchor={p >= 0 ? 'start' : 'end'} size={10.5}>{f2(p)} N·s</T>
    </g>
  )
  return (
    <Sheet label="Momentum and impulse">
      {row(70, p1, 'mv₁')}
      {row(150, I, 'impulse')}
      {row(230, p2, 'mv₂')}
    </Sheet>
  )
}

/** A block on an incline: weight components, the normal force and the
 *  friction that acts (up to μₛN before it slips). */
export function InclineSketch({ thetaDeg, F, Ff, sliding }: { thetaDeg: number; F: number; Ff: number; sliding: boolean }) {
  const t = (thetaDeg * Math.PI) / 180
  const ox = 90, oy = 260, L = 480
  const ux = Math.cos(t), uy = -Math.sin(t)          // up-slope unit (screen)
  const nx = -Math.sin(t), ny = -Math.cos(t)         // outward normal
  const bx = ox + ux * 260, by = oy + uy * 260       // block center on the slope
  const corner = (a: number, b: number) => `${bx + ux * a + nx * b},${by + uy * a + ny * b}`
  const fm = Math.max(Math.abs(F), Math.abs(Ff), 1e-9)
  return (
    <Sheet label="Block on an incline">
      <line x1={ox} y1={oy} x2={ox + ux * L} y2={oy + uy * L} {...ink} strokeWidth="2.5" />
      <line x1={ox} y1={oy} x2={ox + L * Math.cos(t)} y2={oy} {...ink} strokeWidth="1.2" opacity="0.5" />
      <T x={ox + 60} y={oy - 8} size={10}>θ = {f2(thetaDeg)}°</T>
      <polygon points={[corner(-35, 0), corner(35, 0), corner(35, 50), corner(-35, 50)].join(' ')} {...ink} strokeWidth="2.2" />
      {Math.abs(F) > 1e-9 && <Arrow x1={bx + nx * 25} y1={by + ny * 25} x2={bx + nx * 25 + ux * (F / fm) * 110} y2={by + ny * 25 + uy * (F / fm) * 110} w={2.6} />}
      {Math.abs(F) > 1e-9 && <T x={bx + nx * 25 + ux * (F / fm) * 118} y={by + ny * 25 + uy * (F / fm) * 118 - 8} anchor="middle" bold>F = {f2(F)} N</T>}
      {Math.abs(Ff) > 1e-9 && <Arrow x1={bx} y1={by} x2={bx + ux * (Ff / fm) * 90} y2={by + uy * (Ff / fm) * 90} w={1.8} op={0.65} />}
      <T x={bx + ux * (Ff / fm) * 96 + 8} y={by + uy * (Ff / fm) * 96 + 16} size={10.5}>friction {f2(Ff)} N {sliding ? '(kinetic)' : '(static)'}</T>
      <Arrow x1={bx + nx * 25} y1={by + ny * 25} x2={bx + nx * 25} y2={by + ny * 25 + 70} w={1.4} op={0.5} />
      <T x={bx + nx * 25 + 6} y={by + ny * 25 + 70} size={10}>W</T>
    </Sheet>
  )
}

/** A rope or belt wrapped β round a fixed drum: tight side T₁, slack side T₂. */
export function BeltSketch({ betaDeg, T1, T2 }: { betaDeg: number; T1: number; T2: number }) {
  const cx = 320, cy = 160, r = 70
  const b = Math.min(359.9, Math.max(0.1, betaDeg)) * (Math.PI / 180)
  // the wrap starts at the left tangent point and runs over the top, β radians
  const a0 = Math.PI, a1 = Math.PI - b
  const p = (a: number) => ({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) })
  const s = p(a0), e = p(a1)
  const large = b > Math.PI ? 1 : 0
  const tan = (a: number, d: number) => ({ x: Math.sin(a) * d, y: Math.cos(a) * d })
  const te = tan(a1, 120)
  return (
    <Sheet label="Belt friction on a drum">
      <circle cx={cx} cy={cy} r={r - 8} {...ink} strokeWidth="1.5" opacity="0.5" />
      <path d={`M${s.x},${s.y} A${r},${r} 0 ${large} 1 ${e.x},${e.y}`} {...ink} strokeWidth="4" />
      <Arrow x1={s.x} y1={s.y} x2={s.x} y2={s.y + 110} w={3} />
      <T x={s.x - 8} y={s.y + 118} anchor="end" bold>T₂ = {f2(T2)} N (slack)</T>
      <Arrow x1={e.x} y1={e.y} x2={e.x + te.x} y2={e.y + te.y} w={3} />
      <T x={e.x + te.x + (te.x >= 0 ? 8 : -8)} y={e.y + te.y + 4} anchor={te.x >= 0 ? 'start' : 'end'} bold>T₁ = {f2(T1)} N (tight)</T>
      <T x={cx} y={cy + 4} anchor="middle" size={10.5}>β = {f2(betaDeg)}°</T>
    </Sheet>
  )
}
