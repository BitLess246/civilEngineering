// ─────────────────────────────────────────────────────────────────────────
// Drawings for the soil-mechanics calculators: the footing in section for
// bearing capacity, the retaining wall with its active pressure diagram, the
// stress increase with depth under a footing, and the slope with its critical
// slip circle. Geometry is drawn at ONE true scale (stated); a pressure
// diagram is a second, stated scale in kPa; every length the page reports is
// dimensioned between drawn lines.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { HDim, VDim, SurfaceMark, WATER } from './hydraulicsSketches'
import { INK, MUTED, f2 } from '../lib/influenceStyle'
import { niceStep, tickLabel } from '../lib/chartScale'

const mono = 'var(--font-mono, monospace)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }
const RED = 'rgba(200,60,60,0.95)'
const SOIL = 'rgba(146,120,80,0.16)'
const CONCRETE = 'rgba(115,109,94,0.28)'

function Chart({ label, W, H, children }: { label: string; W: number; H: number; children: ReactNode }) {
  return (
    <DrawingFrame label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>{children}</svg>
    </DrawingFrame>
  )
}

function Arrow({ x1, y1, x2, y2, color = INK, w = 1.8 }: { x1: number; y1: number; x2: number; y2: number; color?: string; w?: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 9
  const p1 = `${x2 - h * Math.cos(a - 0.4)},${y2 - h * Math.sin(a - 0.4)}`
  const p2 = `${x2 - h * Math.cos(a + 0.4)},${y2 - h * Math.sin(a + 0.4)}`
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - 6 * Math.cos(a)} y2={y2 - 6 * Math.sin(a)} stroke={color} strokeWidth={w} />
      <polygon points={`${x2},${y2} ${p1} ${p2}`} fill={color} />
    </g>
  )
}

// ── Bearing capacity ─────────────────────────────────────────────────────

/** The footing in section at one true scale: founding depth, width, the
 *  effective width B′ = B − 2e under an eccentric load, the load at its
 *  inclination, and the water table where it reaches the failure zone. */
export function FootingSection({ B, Df, dw, eB, incl, effectiveB, surcharge, strip }: {
  B: number; Df: number; dw?: number; eB: number; incl: number; effectiveB: number; surcharge: number; strip: boolean
}) {
  const W = 660, H = 380
  const gy = 128 // ground line, px
  const zView = Df + 1.3 * B
  const k = Math.min((W - 260) / (2.2 * B), (H - gy - 70) / zView) // px per m
  const cx = 250, bx0 = cx - (B / 2) * k, bx1 = cx + (B / 2) * k
  const by = gy + Df * k // underside of the footing
  const t = Math.min(0.5, Df * 0.45) * k // footing thickness, drawn
  const col = Math.max(0.3 * k, 8) // column width
  const xe = cx + eB * k // where the load acts
  const a = (incl * Math.PI) / 180
  const Lw = 70
  const wt = dw !== undefined && dw < zView ? gy + dw * k : null
  return (
    <Chart label="Footing section for bearing capacity" W={W} H={H}>
      {/* soil, then the footing and column sitting in it */}
      <rect x={20} y={gy} width={W - 40} height={H - gy - 40} fill={SOIL} />
      <line x1={20} x2={W - 20} y1={gy} y2={gy} stroke={INK} strokeWidth="1.4" />
      <text x={W - 24} y={gy - 8} textAnchor="end" fontSize="10" fill={INK} fontFamily={mono} {...halo}>ground · q = {f2(surcharge)} kPa at founding level</text>
      <rect x={bx0} y={by - t} width={bx1 - bx0} height={t} fill={CONCRETE} stroke={INK} strokeWidth="1.3" />
      <rect x={cx - col / 2} y={gy - 34} width={col} height={by - t - gy + 34} fill={CONCRETE} stroke={INK} strokeWidth="1.3" />
      {/* the load, inclined β from vertical, at the eccentricity */}
      <Arrow x1={xe - Lw * Math.sin(a)} y1={gy - 40 - Lw * Math.cos(a)} x2={xe} y2={gy - 40} color={RED} w={2.2} />
      <text x={xe + 10} y={gy - 74} fontSize="10.5" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>P{incl > 0 ? `, β = ${f2(incl)}°` : ''}</text>
      {eB > 0 && <>
        <line x1={cx} x2={cx} y1={gy - 60} y2={gy - 40} stroke={MUTED} strokeWidth="0.8" strokeDasharray="5 2 1 2" />
        <HDim y={gy - 52} a={cx} b={xe} label={`e ${f2(eB)}`} color={INK} />
      </>}
      {/* founding depth, from the ground to the underside */}
      <line x1={bx0 - 6} x2={bx0 - 44} y1={by} y2={by} stroke={MUTED} strokeWidth="0.8" />
      <VDim x={bx0 - 36} a={gy} b={by} label={`Df ${f2(Df)} m`} color={INK} side="left" />
      {/* width and effective width below the base */}
      <line x1={bx0} x2={bx0} y1={by + 4} y2={by + 32} stroke={MUTED} strokeWidth="0.8" />
      <line x1={bx1} x2={bx1} y1={by + 4} y2={by + (effectiveB < B - 1e-6 ? 56 : 32)} stroke={MUTED} strokeWidth="0.8" />
      <HDim y={by + 26} a={bx0} b={bx1} label={`B ${f2(B)} m${strip ? ' (strip)' : ''}`} />
      {effectiveB < B - 1e-6 && <>
        <rect x={bx1 - effectiveB * k} y={by - 3} width={effectiveB * k} height={3} fill={RED} />
        <line x1={bx1 - effectiveB * k} x2={bx1 - effectiveB * k} y1={by + 4} y2={by + 56} stroke={MUTED} strokeWidth="0.8" />
        <HDim y={by + 50} a={bx1 - effectiveB * k} b={bx1} label={`B′ = B − 2e = ${f2(effectiveB)} m`} color={RED} />
      </>}
      {wt !== null && <>
        <line x1={20} x2={W - 20} y1={wt} y2={wt} stroke={WATER} strokeWidth="1.2" strokeDasharray="8 4" />
        <SurfaceMark x={W - 60} y={wt} />
        <text x={W - 74} y={wt - 6} textAnchor="end" fontSize="10" fill={WATER} fontFamily={mono} {...halo}>water table {f2(dw ?? 0)} m</text>
      </>}
      <text x={24} y={H - 14} fontSize="9.5" fill={MUTED} fontFamily={mono}>to scale (1 px = {f2(1000 / k)} mm) · footing thickness and column drawn indicatively</text>
    </Chart>
  )
}

// ── Lateral earth pressure ───────────────────────────────────────────────

/** The wall and its backfill at one true scale, the active pressure
 *  diagram on the back face at a stated kPa scale, and the resultant at its
 *  line of action and inclination. */
export function WallPressure({ H, thetaDeg, betaDeg, q, gamma, K, P, lineOfAction, inclinationDeg, seismic }: {
  H: number; thetaDeg: number; betaDeg: number; q: number; gamma: number
  K: number; P: number; lineOfAction: number; inclinationDeg: number
  seismic?: { increment: number; at: number } | null
}) {
  const W = 680
  const k = 220 / H // px per m
  const xh = 200 // back face at the base (heel)
  const th = (thetaDeg * Math.PI) / 180, bt = (betaDeg * Math.PI) / 180
  // the frame grows by as much as the backfill rises, so a level fill has no empty band
  const rise = Math.min((W - 30 - xh) * Math.tan(bt), 160)
  const base = 40 + rise + 220, Hpx = base + 70
  const xBack = (z: number) => xh + (H - z) * Math.tan(th) * k // z measured down from the top
  const yAt = (z: number) => base - (H - z) * k
  const top = yAt(0)
  const stemTop = 0.3 * k, toe = 1.2 * k
  const pTop = K * q, pBase = K * (gamma * H + q)
  const kp = 150 / Math.max(pBase, 1e-6) // px per kPa
  const groundEnd = W - 30
  const groundY = (x: number) => top - (x - xBack(0)) * Math.tan(bt)
  const ya = base - lineOfAction * k
  const za = H - lineOfAction
  const ia = (inclinationDeg * Math.PI) / 180
  return (
    <Chart label="Retaining wall with active earth pressure" W={W} H={Hpx}>
      {/* backfill */}
      <polygon points={`${xBack(0)},${top} ${groundEnd},${groundY(groundEnd)} ${groundEnd},${base} ${xh},${base}`} fill={SOIL} />
      <line x1={xBack(0)} y1={top} x2={groundEnd} y2={groundY(groundEnd)} stroke={INK} strokeWidth="1.3" />
      {/* wall: back face at θ, front face vertical, base slab */}
      <polygon points={`${xBack(0) - stemTop},${top} ${xBack(0)},${top} ${xh},${base} ${xh - stemTop - 0.25 * H * k * 0.3},${base}`} fill={CONCRETE} stroke={INK} strokeWidth="1.4" />
      <rect x={xh - stemTop - toe} y={base} width={toe + stemTop + 0.6 * k} height={0.4 * k} fill={CONCRETE} stroke={INK} strokeWidth="1.3" />
      {/* the pressure diagram on the back face, normal-to-wall offsets at the kPa scale */}
      <polygon points={`${xBack(0)},${top} ${xBack(0) + pTop * kp},${top} ${xh + pBase * kp},${base} ${xh},${base}`}
        fill="rgba(200,60,60,0.14)" stroke={RED} strokeWidth="1.2" />
      {pTop > 0.05 && <text x={xBack(0) + pTop * kp + 6} y={top + 12} fontSize="9.5" fill={RED} fontFamily={mono} {...halo}>Kq = {f2(pTop)} kPa</text>}
      <text x={xh + pBase * kp + 6} y={base - 6} fontSize="9.5" fill={RED} fontFamily={mono} {...halo}>K(γH + q) = {f2(pBase)} kPa</text>
      {/* the resultant, pointing onto the wall at its inclination */}
      <Arrow x1={xBack(za) + 90 * Math.cos(ia)} y1={ya - 90 * Math.sin(ia)} x2={xBack(za)} y2={ya} color={INK} w={2.4} />
      <text x={xBack(za) + 90 * Math.cos(ia) + 6} y={ya - 90 * Math.sin(ia) - 6} fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>
        Pa = {f2(P)} kN/m{inclinationDeg > 0.05 ? ` at ${f2(inclinationDeg)}°` : ''}
      </text>
      {seismic && seismic.increment > 0 && (() => {
        const yi = base - seismic.at * k, zi = H - seismic.at
        return <>
          <g strokeDasharray="5 3"><Arrow x1={xBack(zi) + 70} y1={yi} x2={xBack(zi)} y2={yi} color={RED} w={1.8} /></g>
          <text x={xBack(zi) + 76} y={yi + 4} fontSize="10" fill={RED} fontFamily={mono} {...halo}>ΔPae = {f2(seismic.increment)} kN/m</text>
        </>
      })()}
      {/* heights: the wall, and the line of action above the base */}
      <line x1={xBack(0) - stemTop - 4} x2={xh - stemTop - toe - 40} y1={top} y2={top} stroke={MUTED} strokeWidth="0.8" />
      <line x1={xh - stemTop - toe - 4} x2={xh - stemTop - toe - 40} y1={base} y2={base} stroke={MUTED} strokeWidth="0.8" />
      <VDim x={xh - stemTop - toe - 32} a={top} b={base} label={`H ${f2(H)} m`} color={INK} side="left" />
      <line x1={xh - 4} x2={xh - stemTop - toe - 14} y1={ya} y2={ya} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 2" />
      <VDim x={xh - stemTop - toe - 8} a={ya} b={base} label={`${f2(lineOfAction)} m`} color={INK} side="left" />
      {betaDeg > 0 && <text x={groundEnd - 6} y={groundY(groundEnd) - 8} textAnchor="end" fontSize="10" fill={INK} fontFamily={mono} {...halo}>backfill β = {f2(betaDeg)}°</text>}
      {thetaDeg !== 0 && <text x={xBack(H / 2) + 8} y={yAt(H * 0.25)} fontSize="10" fill={INK} fontFamily={mono} {...halo}>θ = {f2(thetaDeg)}°</text>}
      <text x={24} y={Hpx - 14} fontSize="9.5" fill={MUTED} fontFamily={mono}>wall to scale (1 px = {f2(1000 / k)} mm) · pressure diagram 1 px = {f2(1 / kp)} kPa · wall shape indicative</text>
    </Chart>
  )
}

// ── Settlement: stress increase with depth ───────────────────────────────

/** Δσ under the footing centre against depth BELOW THE BASE (z = 0 at the
 *  footing underside), Boussinesq against the 2:1 average, each labelled on
 *  its own curve, on numbered axes. */
export function StressDepth({ q, zMax, curve }: { q: number; zMax: number; curve: { z: number; b: number; t: number }[] }) {
  const W = 620, H = 360
  const box = { x0: 90, x1: W - 40, top: 60, base: H - 40 }
  const X = (s: number) => box.x0 + (s / Math.max(q, 1e-9)) * (box.x1 - box.x0)
  const Y = (z: number) => box.top + (z / Math.max(zMax, 1e-9)) * (box.base - box.top)
  const xs = niceStep(q, 5), zs = niceStep(zMax, 5)
  const xt: number[] = [], zt: number[] = []
  for (let v = 0; v <= q * 1.0001; v += xs) xt.push(v)
  for (let v = 0; v <= zMax * 1.0001; v += zs) zt.push(v)
  const path = (key: 'b' | 't') => curve.map((p, i) => `${i ? 'L' : 'M'}${X(p[key]).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' ')
  const lab = curve[Math.round(curve.length * 0.2)], lab2 = curve[Math.round(curve.length * 0.1)]
  return (
    <Chart label="Stress increase with depth below the footing" W={W} H={H}>
      {zt.map((z) => (
        <g key={`z${z}`}>
          {z > 0 && <line x1={box.x0} x2={box.x1} y1={Y(z)} y2={Y(z)} stroke="var(--hairline, #e5e2da)" strokeWidth="0.7" />}
          <line x1={box.x0 - 4} x2={box.x0} y1={Y(z)} y2={Y(z)} stroke={INK} strokeWidth="1" />
          <text x={box.x0 - 7} y={Y(z) + 3.5} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily={mono}>{tickLabel(z, zs)}</text>
        </g>
      ))}
      {xt.map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v)} x2={X(v)} y1={box.top - 4} y2={box.top} stroke={INK} strokeWidth="1" />
          <text x={X(v)} y={box.top - 8} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono}>{tickLabel(v, xs)}</text>
        </g>
      ))}
      <line x1={box.x0} x2={box.x1} y1={box.top} y2={box.top} stroke={INK} strokeWidth="1.2" />
      <line x1={box.x0} x2={box.x0} y1={box.top} y2={box.base} stroke={INK} strokeWidth="1.2" />
      <text x={box.x1} y={box.top - 26} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono}>Δσ (kPa)</text>
      <text x={box.x0 - 54} y={box.top - 26} fontSize="10" fill={MUTED} fontFamily={mono}>z below base (m)</text>
      <path d={path('t')} fill="none" stroke={MUTED} strokeWidth="1.8" strokeDasharray="6 3" />
      <path d={path('b')} fill="none" stroke={WATER} strokeWidth="2.2" />
      {lab && lab2 && <>
        <text x={X(lab.b) + 8} y={Y(lab.z) + 4} fontSize="10" fill={INK} fontFamily={mono} {...halo}>Boussinesq, centre</text>
        <text x={X(lab2.t) - 8} y={Y(lab2.z) - 4} textAnchor="end" fontSize="10" fill={INK} fontFamily={mono} {...halo}>2:1 average</text>
      </>}
      <text x={box.x1 - 8} y={box.base - 8} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily={mono}>q = {f2(q)} kPa at the base</text>
    </Chart>
  )
}

// ── Slope stability ──────────────────────────────────────────────────────

/** The slope at one true scale (m, both ways) with the critical circle: the
 *  sliding mass and its slices, the centre O and radius R, the height H and
 *  face angle β, and the factor of safety written in the mass it applies to. */
export function SlopeSection({ ground, circle, slices, FS, method, H, betaDeg, surface }: {
  ground: { x: number; y: number }[]
  circle: { xc: number; yc: number; R: number } | null
  slices: { x: number; b: number }[]
  FS: number; method: string; H: number; betaDeg: number
  surface: (x: number) => number
}) {
  const W = 680, Hpx = 400
  const xs = ground.map((p) => p.x), ys = ground.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys, circle ? circle.yc - circle.R : 0) - 1
  const maxY = Math.max(...ys, circle ? circle.yc : 0) + 1
  const padL = 64, padR = 120, padT = 30, padB = 50
  const s = Math.min((W - padL - padR) / Math.max(maxX - minX, 1e-6), (Hpx - padT - padB) / Math.max(maxY - minY, 1e-6))
  const X = (x: number) => padL + (x - minX) * s
  const Y = (y: number) => Hpx - padB - (y - minY) * s
  const gPath = ground.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')
  const soil = `${gPath} L${X(maxX).toFixed(1)},${Y(minY).toFixed(1)} L${X(minX).toFixed(1)},${Y(minY).toFixed(1)} Z`
  // the face: crest at ground[1], toe at ground[2]
  const crest = ground[1], toeP = ground[2]
  const arcOf = () => {
    if (!circle || slices.length === 0) return null
    const yArc = (x: number) => circle.yc - Math.sqrt(Math.max(0, circle.R ** 2 - (x - circle.xc) ** 2))
    const x0 = slices[0].x - slices[0].b / 2, x1 = slices[slices.length - 1].x + slices[slices.length - 1].b / 2
    const pts = Array.from({ length: 61 }, (_, i) => x0 + ((x1 - x0) * i) / 60).map((x) => ({ x, y: yArc(x) }))
    const arc = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')
    const mass = 'M' + pts.map((p) => `${X(p.x).toFixed(1)},${Y(surface(p.x)).toFixed(1)}`).join(' L') +
      ' L' + [...pts].reverse().map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' L') + ' Z'
    const cuts = slices.slice(1).map((sl) => { const xb = sl.x - sl.b / 2; return { x: xb, yt: surface(xb), yb: yArc(xb) } })
    const mid = pts[Math.round(pts.length * 0.55)]
    return { arc, mass, cuts, mid, end: pts[pts.length - 1] }
  }
  const a = arcOf()
  const xDim = X(maxX) + 26
  return (
    <Chart label="Slope with the critical slip circle" W={W} H={Hpx}>
      <path d={soil} fill={SOIL} stroke="none" />
      {a && <>
        <path d={a.mass} fill="rgba(200,60,60,0.16)" stroke="none" />
        {a.cuts.map((c, i) => <line key={i} x1={X(c.x)} x2={X(c.x)} y1={Y(c.yt)} y2={Y(c.yb)} stroke={MUTED} strokeWidth="0.5" />)}
        <path d={a.arc} fill="none" stroke={RED} strokeWidth="2" />
      </>}
      <path d={gPath} fill="none" stroke={INK} strokeWidth="1.8" />
      {circle && a && <>
        <circle cx={X(circle.xc)} cy={Y(circle.yc)} r="3.5" fill={RED} />
        <line x1={X(circle.xc)} y1={Y(circle.yc)} x2={X(a.end.x)} y2={Y(a.end.y)} stroke={RED} strokeWidth="0.9" strokeDasharray="4 3" />
        <text x={X(circle.xc) + 8} y={Y(circle.yc) - 6} fontSize="10" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>O</text>
        <text x={(X(circle.xc) + X(a.end.x)) / 2 + 6} y={(Y(circle.yc) + Y(a.end.y)) / 2} fontSize="10" fill={RED} fontFamily={mono} {...halo}>R = {f2(circle.R)} m</text>
        <text x={X(a.mid.x)} y={(Y(a.mid.y) + Y(surface(a.mid.x))) / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>FS {f2(FS)} ({method})</text>
      </>}
      {/* height: crest level carried right to the dimension; the toe level is the ground */}
      <line x1={X(crest.x)} x2={xDim + 6} y1={Y(crest.y)} y2={Y(crest.y)} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 2" />
      <line x1={X(maxX)} x2={xDim + 6} y1={Y(toeP.y)} y2={Y(toeP.y)} stroke={MUTED} strokeWidth="0.8" />
      <VDim x={xDim} a={Y(crest.y)} b={Y(toeP.y)} label={`H ${f2(H)} m`} color={INK} />
      <text x={X(toeP.x) + 12} y={Y(toeP.y) + 16} fontSize="10" fill={INK} fontFamily={mono} {...halo}>β = {f2(betaDeg)}° face</text>
      {/* scale bar */}
      {(() => {
        const step = niceStep(maxX - minX, 4)
        return <g>
          <line x1={padL} x2={padL + step * s} y1={Hpx - 22} y2={Hpx - 22} stroke={INK} strokeWidth="2" />
          <line x1={padL} x2={padL} y1={Hpx - 27} y2={Hpx - 17} stroke={INK} strokeWidth="1" />
          <line x1={padL + step * s} x2={padL + step * s} y1={Hpx - 27} y2={Hpx - 17} stroke={INK} strokeWidth="1" />
          <text x={padL + step * s + 8} y={Hpx - 18} fontSize="9.5" fill={MUTED} fontFamily={mono}>{tickLabel(step, step)} m · true scale both ways</text>
        </g>
      })()}
    </Chart>
  )
}
