// ─────────────────────────────────────────────────────────────────────────
// Live schematics for the standalone fluid calculators (hydrostatics and
// hydraulics pages). Schematic, not to scale: each shows what the numbers
// mean — where the force acts, which way the surface tilts, where the energy
// goes — and redraws from the live inputs. Ink is `currentColor`, so every
// sketch follows the theme; the drawing-sheet backdrop is the card's.
// ─────────────────────────────────────────────────────────────────────────
import { DrawingFrame } from './DrawingFrame'
import { f2, f3 } from '../lib/influenceStyle'

const W = 640, H = 300
const ink = { stroke: 'currentColor', fill: 'none' } as const
const T = ({ x, y, children, anchor = 'start', size = 11, bold = false }: {
  x: number; y: number; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; bold?: boolean
}) => <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={bold ? 700 : 400} fill="currentColor">{children}</text>

function Sheet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div data-pdf-drawing className="mx-auto max-w-[680px]">
      <DrawingFrame label={label}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
          <title>{label}</title>
          <defs>
            <marker id="fs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {children}
        </svg>
      </DrawingFrame>
    </div>
  )
}

const Water = ({ x, y, w, markLeft = false }: { x: number; y: number; w: number; markLeft?: boolean }) => (
  <>
    <line x1={x} y1={y} x2={x + w} y2={y} {...ink} strokeWidth="1.2" opacity="0.6" />
    <path d={`M${markLeft ? x + 18 : x + w - 30},${y - 9} l6,7 l6,-7 z`} fill="currentColor" opacity="0.6" />
  </>
)

/** Pressure prism on a surface-piercing plate at the live inclination: the
 *  arrows grow with depth and F strikes at the lower third. */
export function PlanePressureSketch({ thetaDeg, F, hp }: { thetaDeg: number; F: number; hp: number }) {
  const x0 = 200, surfY = 40, len = 190
  const rad = (thetaDeg * Math.PI) / 180
  const dx = Math.cos(rad) * len, dy = Math.sin(rad) * len
  const nx = Math.sin(rad), ny = -Math.cos(rad)
  const cp = 2 / 3
  return (
    <Sheet label="Hydrostatic pressure on an inclined plate">
      <Water x={40} y={surfY} w={W - 60} />
      <T x={W - 26} y={surfY - 14} anchor="end" size={10}>free surface</T>
      <line x1={x0} y1={surfY} x2={x0 + dx} y2={surfY + dy} {...ink} strokeWidth="3" />
      {[0.2, 0.4, 0.6, 0.8, 1].map((f) => (
        <line key={f} x1={x0 + dx * f + nx * 80 * f} y1={surfY + dy * f + ny * 80 * f} x2={x0 + dx * f} y2={surfY + dy * f}
          {...ink} strokeWidth="1.3" opacity="0.7" markerEnd="url(#fs-arrow)" />
      ))}
      <circle cx={x0 + dx * cp} cy={surfY + dy * cp} r="4.5" fill="currentColor" />
      <T x={x0 + dx * cp + 12} y={surfY + dy * cp + 4} bold>F = {f2(F)} kN at the CP</T>
      <T x={x0 + dx * cp + 12} y={surfY + dy * cp + 19} size={10}>hp = {f3(hp)} m below the surface</T>
      <T x={x0 - 8} y={surfY + 20} anchor="end" size={10}>θ = {f2(thetaDeg)}°</T>
    </Sheet>
  )
}

/** Quarter-circular gate holding water on its concave side, h₀ below the
 *  surface. The arc is the lower-left quadrant about its center O (level with
 *  the gate top); the water above it is the quadrant plus the R × h₀ block,
 *  which is Fv. The resultant pushes the gate down and outward, through O. */
export function CurvedGateSketch({ R, h0, Fh, Fv, theta }: { R: number; h0: number; Fh: number; Fv: number; theta: number }) {
  const s = 190 / (R + h0)                       // px per m: free surface to gate bottom fills the height
  const r = R * s, top = 50
  const ox = 330, oy = top + h0 * s              // center O, level with the gate top
  const res = Math.hypot(Fh, Fv) || 1
  const dx = -Fh / res, dy = Fv / res            // on the gate: outward (left) and down
  return (
    <Sheet label="Quarter-circular gate">
      <Water x={ox - r - 80} y={top} w={r + 200} />
      <path d={`M${ox - r},${top} L${ox - r},${oy} A${r},${r} 0 0 0 ${ox},${oy + r} L${ox},${top} Z`} fill="currentColor" opacity="0.09" />
      <path d={`M${ox - r},${oy} A${r},${r} 0 0 0 ${ox},${oy + r}`} {...ink} strokeWidth="3.5" />
      <line x1={ox} y1={oy} x2={ox} y2={oy + r} {...ink} strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <line x1={ox - r} y1={oy} x2={ox} y2={oy} {...ink} strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <circle cx={ox} cy={oy} r="3.5" fill="currentColor" />
      <T x={ox + 8} y={oy - 6} size={10}>O</T>
      {h0 > 0 && <T x={ox + 10} y={(top + oy) / 2 + 4} size={10}>h₀ = {f2(h0)} m</T>}
      <T x={ox + 10} y={oy + r / 2 + 4} size={10}>R = {f2(R)} m</T>
      <line x1={ox + dx * 12} y1={oy + dy * 12} x2={ox + dx * (r + 40)} y2={oy + dy * (r + 40)} {...ink} strokeWidth="2.2" markerEnd="url(#fs-arrow)" />
      <T x={ox + dx * (r + 46)} y={oy + dy * (r + 46) + 14} anchor="end" bold>R at {f2(theta)}° — through O</T>
      <T x={ox + 70} y={top + 30} size={10.5}>Fh = {f2(Fh)} kN (projection)</T>
      <T x={ox + 70} y={top + 46} size={10.5}>Fv = {f2(Fv)} kN (water above)</T>
    </Sheet>
  )
}

/** Box barge in section: keel K, buoyancy center B, gravity G and metacenter
 *  M at their computed heights — GM is the gap that decides stability. */
export function BargeSketch({ B, draft, KG, KB, KM }: { B: number; draft: number; KG: number; KB: number; KM: number }) {
  const depth = Math.max(KM, KG, draft * 1.6) * 1.15
  const s = Math.min(300 / B, 210 / depth)
  const keel = 250, cx = 300, half = (B * s) / 2
  const y = (z: number) => keel - z * s
  const hullTop = y(Math.max(draft * 1.6, KG * 1.15))
  const pt = (z: number, name: string, side: 'l' | 'r') => (
    <g key={name}>
      <circle cx={cx} cy={y(z)} r="4" fill="currentColor" />
      <T x={side === 'r' ? cx + 10 : cx - 10} y={y(z) + 4} anchor={side === 'r' ? 'start' : 'end'} size={10.5} bold>{name}</T>
    </g>
  )
  return (
    <Sheet label="Barge section with K, B, G and M">
      <rect x={cx - half} y={hullTop} width={2 * half} height={keel - hullTop} {...ink} strokeWidth="2.5" />
      <rect x={cx - half} y={y(draft)} width={2 * half} height={draft * s} fill="currentColor" opacity="0.08" />
      <Water x={cx - half - 60} y={y(draft)} w={2 * half + 120} markLeft />
      <line x1={cx} y1={keel} x2={cx} y2={y(KM)} {...ink} strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
      {pt(0, 'K', 'r')}{pt(KB, 'B', 'r')}{pt(KG, 'G', 'l')}{pt(KM, 'M', 'r')}
      <T x={cx + half + 16} y={y(KM) + 4} size={10}>KM = {f3(KM)} m</T>
      <T x={cx + half + 16} y={Math.max(y(KG) + 4, y(KM) + 18)} size={10}>KG = {f3(KG)} m</T>
      <T x={cx - half - 12} y={y(draft) + 14} anchor="end" size={10}>draft {f2(draft)} m</T>
      <T x={cx} y={keel + 26} anchor="middle" bold>GM = KM − KG = {f3(KM - KG)} m</T>
    </Sheet>
  )
}

/** The manometer walk as a running pressure: each leg a step up (going down
 *  the leg, +γh) or down (going up, −γh). */
export function ManometerSketch({ pStart, steps }: { pStart: number; steps: { label: string; dp: number }[] }) {
  const ps = steps.reduce<number[]>((acc, st) => [...acc, acc[acc.length - 1]! + st.dp], [pStart])
  const span = Math.max(...ps) - Math.min(...ps) || 1
  const lo = Math.min(...ps) - span * 0.15, hi = Math.max(...ps) + span * 0.15
  const y = (p: number) => 250 - ((p - lo) / (hi - lo)) * 190
  const dx = Math.min(110, 480 / Math.max(1, steps.length))
  return (
    <Sheet label="Manometer pressure walk">
      {lo < 0 && hi > 0 && <>
        <line x1={60} y1={y(0)} x2={W - 30} y2={y(0)} {...ink} strokeWidth="1" opacity="0.4" strokeDasharray="4 3" />
        <T x={56} y={y(0) + 4} anchor="end" size={10}>0 kPa</T>
      </>}
      {ps.map((p, i) => (
        <g key={i}>
          <line x1={80 + i * dx} y1={y(p)} x2={80 + (i + 1) * dx - 14} y2={y(p)} {...ink} strokeWidth="2.5" />
          <T x={80 + i * dx} y={y(p) - 8} size={10.5} bold>{f2(p)}</T>
          {i < steps.length && (
            <>
              <line x1={80 + (i + 1) * dx - 14} y1={y(p)} x2={80 + (i + 1) * dx - 14} y2={y(ps[i + 1]!)} {...ink} strokeWidth="1.3"
                markerEnd="url(#fs-arrow)" opacity="0.75" />
              <T x={80 + (i + 1) * dx - 18} y={Math.max(y(p), y(ps[i + 1]!)) + 16} anchor="end" size={9.5}>{steps[i]!.label}</T>
            </>
          )}
        </g>
      ))}
      <T x={W - 30} y={30} anchor="end" size={10}>pressure, kPa — start → far end</T>
    </Sheet>
  )
}

/** Two tanks: one accelerating sideways (tilted surface), one spinning
 *  (paraboloid rising ω²r²/2g at the rim). */
export function VesselsSketch({ tiltDeg, rise, r }: { tiltDeg: number; rise: number; r: number }) {
  const tan = Math.tan((tiltDeg * Math.PI) / 180)
  const tilt = Math.max(-60, Math.min(60, tan * 90))
  const rimPx = Math.max(-80, Math.min(80, rise / Math.max(r, 1e-9) * 90))
  return (
    <Sheet label="Accelerating and rotating vessels">
      {/* accelerating tank */}
      <rect x={60} y={60} width={200} height={190} {...ink} strokeWidth="2.5" />
      <path d={`M60,${150 + tilt} L260,${150 - tilt} L260,250 L60,250 Z`} fill="currentColor" opacity="0.08" />
      <line x1={60} y1={150 + tilt} x2={260} y2={150 - tilt} {...ink} strokeWidth="1.8" />
      <line x1={110} y1={40} x2={210} y2={40} {...ink} strokeWidth="2" markerEnd="url(#fs-arrow)" />
      <T x={160} y={32} anchor="middle" size={10.5} bold>aₓ → surface tilts {f2(tiltDeg)}°</T>
      {/* rotating tank */}
      <rect x={370} y={60} width={200} height={190} {...ink} strokeWidth="2.5" />
      <path d={`M370,${170 - rimPx / 2} Q470,${170 + rimPx / 2} 570,${170 - rimPx / 2} L570,250 L370,250 Z`} fill="currentColor" opacity="0.08" />
      <path d={`M370,${170 - rimPx / 2} Q470,${170 + rimPx / 2} 570,${170 - rimPx / 2}`} {...ink} strokeWidth="1.8" />
      <line x1={470} y1={52} x2={470} y2={258} {...ink} strokeWidth="1" strokeDasharray="5 4" opacity="0.6" />
      <T x={470} y={32} anchor="middle" size={10.5} bold>ω → rim rises {f3(rise)} m</T>
    </Sheet>
  )
}

/** Energy and hydraulic grade lines between two points: elevation, pressure
 *  head and velocity head stacked at each, with the pump/turbine/loss gap. */
export function EnergyLineSketch({ z1, p1h, v1h, z2, p2h, v2h }: {
  z1: number; p1h: number; v1h: number; z2: number; p2h: number; v2h: number
}) {
  const top = Math.max(z1 + p1h + v1h, z2 + p2h + v2h, 1)
  const bot = Math.min(z1, z2, 0)
  const y = (h: number) => 255 - ((h - bot) / (top - bot || 1)) * 190
  const col = (x: number, z: number, ph: number, vh: number, n: string) => (
    <g>
      <line x1={x} y1={y(bot)} x2={x} y2={y(z)} {...ink} strokeWidth="6" opacity="0.25" />
      <line x1={x} y1={y(z)} x2={x} y2={y(z + ph)} {...ink} strokeWidth="6" opacity="0.55" />
      <line x1={x} y1={y(z + ph)} x2={x} y2={y(z + ph + vh)} {...ink} strokeWidth="6" />
      <T x={x} y={y(bot) + 18} anchor="middle" bold>{n}</T>
      <T x={x + 12} y={y(z / 2) + 4} size={9.5}>z {f2(z)}</T>
      <T x={x + 12} y={y(z + ph / 2) + 4} size={9.5}>p/γ {f2(ph)}</T>
      <T x={x} y={y(z + ph + vh) - 8} anchor="middle" size={9.5}>v²/2g {f2(vh)}</T>
    </g>
  )
  return (
    <Sheet label="Energy and hydraulic grade lines">
      <line x1={120} y1={y(z1 + p1h + v1h)} x2={500} y2={y(z2 + p2h + v2h)} {...ink} strokeWidth="1.8" />
      <line x1={120} y1={y(z1 + p1h)} x2={500} y2={y(z2 + p2h)} {...ink} strokeWidth="1.2" strokeDasharray="6 4" />
      <T x={310} y={Math.min(y(z1 + p1h + v1h), y(z2 + p2h + v2h)) - 24} anchor="middle" size={10.5} bold>EGL (solid) · HGL (dashed)</T>
      {col(120, z1, p1h, v1h, 'Point 1')}
      {col(500, z2, p2h, v2h, 'Point 2')}
    </Sheet>
  )
}

/** A jet striking a vane and leaving deflected by θ — the force on the vane
 *  acts along the jet, opposite to the momentum it takes out. */
export function JetVaneSketch({ thetaDeg, Fx, u }: { thetaDeg: number; Fx: number; u: number }) {
  const ang = (thetaDeg * Math.PI) / 180
  const vx = 380, vy = 160, out = 110
  const lift = Math.abs(Math.sin(ang)) < 0.35 ? -18 : 0   // keep a reversed jet off the incoming one
  return (
    <Sheet label="Water jet on a vane">
      <rect x={40} y={vy - 10} width={60} height={20} {...ink} strokeWidth="2" />
      <line x1={100} y1={vy} x2={vx - 6} y2={vy} {...ink} strokeWidth="5" opacity="0.6" markerEnd="url(#fs-arrow)" />
      <T x={110} y={vy + 24} size={10.5}>jet v</T>
      <path d={`M${vx},${vy - 50} Q${vx + 34},${vy} ${vx},${vy + 50}`} {...ink} strokeWidth="4" />
      <line x1={vx} y1={vy + lift} x2={vx + Math.cos(ang) * out} y2={vy + lift - Math.sin(ang) * out} {...ink} strokeWidth="3" opacity="0.6" markerEnd="url(#fs-arrow)" />
      <T x={vx + Math.cos(ang) * out + (Math.cos(ang) < -0.2 ? -8 : 8)} y={vy + lift - Math.sin(ang) * out - 8} anchor={Math.cos(ang) < -0.2 ? 'end' : 'start'} size={10.5}>leaves turned θ = {f2(thetaDeg)}°</T>
      <line x1={vx + 40} y1={vy + 70} x2={vx + 150} y2={vy + 70} {...ink} strokeWidth="2.5" markerEnd="url(#fs-arrow)" />
      <T x={vx + 40} y={vy + 90} bold>Fx = {Fx >= 1000 ? `${f2(Fx / 1000)} kN` : `${f2(Fx)} N`}</T>
      {u > 0 && <T x={vx + 40} y={vy + 106} size={10}>vane moving at u = {f2(u)} m/s</T>}
    </Sheet>
  )
}
