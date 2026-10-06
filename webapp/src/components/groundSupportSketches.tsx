// ─────────────────────────────────────────────────────────────────────────
// Drawings for the ground-support calculators: one soil nail with its
// tributary area and pressure, the shotcrete facing panel between nail
// heads, and a rock/ground anchor bond zone. Each stated scale applies to
// the view it is printed under; every length the page reports is
// dimensioned between drawn lines.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { HDim, VDim } from './hydraulicsSketches'
import { INK, MUTED, f2 } from '../lib/influenceStyle'

const mono = 'var(--font-mono, monospace)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }
const RED = 'rgba(200,60,60,0.95)'
const SOIL = 'rgba(146,120,80,0.16)'
const CONCRETE = 'rgba(115,109,94,0.3)'

function Chart({ label, W, H, children }: { label: string; W: number; H: number; children: ReactNode }) {
  return (
    <DrawingFrame label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>{children}</svg>
    </DrawingFrame>
  )
}

function Arrow({ x1, y1, x2, y2, color = INK, w = 1.8 }: { x1: number; y1: number; x2: number; y2: number; color?: string; w?: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 9
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - 6 * Math.cos(a)} y2={y2 - 6 * Math.sin(a)} stroke={color} strokeWidth={w} />
      <polygon points={`${x2},${y2} ${x2 - h * Math.cos(a - 0.4)},${y2 - h * Math.sin(a - 0.4)} ${x2 - h * Math.cos(a + 0.4)},${y2 - h * Math.sin(a + 0.4)}`} fill={color} />
    </g>
  )
}

/** One nail: in elevation, the nail grid with the analysed nail's
 *  tributary area Sh × Sv; in section at one true scale, the nail at depth
 *  z, its grouted bond length Le, and the active pressure Ka(γz + q) it
 *  carries. Where the slip surface sits is a global-stability result, so it
 *  is drawn schematically and Le is measured from the nail's far end. */
export function SoilNailDrawing({ z, Sh, Sv, bondLength, drillDia, Ka, gamma, q, Tmax }: {
  z: number; Sh: number; Sv: number; bondLength: number; drillDia: number; Ka: number; gamma: number; q: number; Tmax: number
}) {
  const W = 680, H = 400
  // elevation of the facing, nail grid 3 × 3 around the analysed nail
  const ex = 150, ey = 200, ke = Math.min(46 / Math.max(Sh, 0.3), 46 / Math.max(Sv, 0.3))
  const nails = [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => ({ i, j })))
  // section at true scale
  const wallX = 330, top = 54
  const depthSpan = z + Sv, lenSpan = bondLength + 2
  const k = Math.min((H - top - 70) / depthSpan, (W - wallX - 60) / lenSpan) // px per m
  const yn = top + z * k
  const nailEnd = wallX + (bondLength + 1.2) * k, bondStart = nailEnd - bondLength * k
  const pz = Ka * (gamma * z + q)
  return (
    <Chart label="Soil nail tributary area and section" W={W} H={H}>
      <text x={ex} y={26} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono}>FACING ELEVATION</text>
      {nails.map(({ i, j }) => (
        <circle key={`${i}${j}`} cx={ex + i * Sh * ke} cy={ey + j * Sv * ke} r={i === 0 && j === 0 ? 4.5 : 3} fill={i === 0 && j === 0 ? RED : INK} />
      ))}
      <rect x={ex - (Sh / 2) * ke} y={ey - (Sv / 2) * ke} width={Sh * ke} height={Sv * ke} fill="rgba(200,60,60,0.1)" stroke={RED} strokeWidth="1" strokeDasharray="4 3" />
      {/* nail-to-nail spacings, dimensioned between the nail centrelines */}
      <line x1={ex} x2={ex} y1={ey + Sv * ke + 6} y2={ey + Sv * ke + 34} stroke={MUTED} strokeWidth="0.7" />
      <line x1={ex + Sh * ke} x2={ex + Sh * ke} y1={ey + Sv * ke + 6} y2={ey + Sv * ke + 34} stroke={MUTED} strokeWidth="0.7" />
      <HDim y={ey + Sv * ke + 28} a={ex} b={ex + Sh * ke} label={`Sh ${f2(Sh)} m`} />
      <line x1={ex - Sh * ke - 6} x2={ex - Sh * ke - 34} y1={ey} y2={ey} stroke={MUTED} strokeWidth="0.7" />
      <line x1={ex - Sh * ke - 6} x2={ex - Sh * ke - 34} y1={ey - Sv * ke} y2={ey - Sv * ke} stroke={MUTED} strokeWidth="0.7" />
      <VDim x={ex - Sh * ke - 28} a={ey - Sv * ke} b={ey} label={`Sv ${f2(Sv)} m`} color={INK} side="left" />
      <text x={ex} y={ey - Sv * ke - 26} textAnchor="middle" fontSize="9.5" fill={RED} fontFamily={mono} {...halo}>tributary Sh × Sv</text>

      <text x={wallX + 120} y={26} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono}>SECTION AT THE NAIL</text>
      <rect x={wallX} y={top} width={W - 30 - wallX} height={depthSpan * k} fill={SOIL} />
      <line x1={wallX - 30} x2={W - 30} y1={top} y2={top} stroke={INK} strokeWidth="1.3" />
      <rect x={wallX - 8} y={top} width={8} height={depthSpan * k} fill={CONCRETE} stroke={INK} strokeWidth="1.2" />
      {/* the nail: drill hole, bonded length at its far end */}
      <rect x={wallX} y={yn - Math.max(drillDia * k, 5) / 2} width={nailEnd - wallX} height={Math.max(drillDia * k, 5)} fill="rgba(115,109,94,0.25)" stroke={MUTED} strokeWidth="0.8" />
      <rect x={bondStart} y={yn - Math.max(drillDia * k, 5) / 2} width={nailEnd - bondStart} height={Math.max(drillDia * k, 5)} fill="rgba(146,120,80,0.5)" stroke={INK} strokeWidth="1" />
      <line x1={wallX - 14} x2={nailEnd} y1={yn} y2={yn} stroke={INK} strokeWidth="2" />
      <rect x={wallX - 18} y={yn - 8} width={6} height={16} fill={INK} />
      <path d={`M ${bondStart - 6} ${top} Q ${bondStart - 20} ${yn} ${wallX + 10} ${top + depthSpan * k}`} fill="none" stroke={RED} strokeWidth="1" strokeDasharray="6 4" />
      <text x={bondStart - 26} y={top + 16} textAnchor="end" fontSize="9" fill={RED} fontFamily={mono} {...halo}>slip surface (schematic)</text>
      {/* depth to the nail, and the bond length */}
      <line x1={wallX - 18} x2={wallX - 52} y1={yn} y2={yn} stroke={MUTED} strokeWidth="0.8" />
      <VDim x={wallX - 46} a={top} b={yn} label={`z ${f2(z)} m`} color={INK} side="left" />
      <line x1={bondStart} x2={bondStart} y1={yn + 6} y2={yn + 40} stroke={MUTED} strokeWidth="0.8" />
      <line x1={nailEnd} x2={nailEnd} y1={yn + 6} y2={yn + 40} stroke={MUTED} strokeWidth="0.8" />
      <HDim y={yn + 34} a={bondStart} b={nailEnd} label={`Le ${f2(bondLength)} m`} />
      <Arrow x1={wallX + 70} y1={yn - 22} x2={wallX + 2} y2={yn - 22} color={RED} w={1.8} />
      <text x={wallX + 76} y={yn - 18} fontSize="10" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>Ka(γz + q) = {f2(pz)} kPa → Tmax {f2(Tmax)} kN</text>
      <text x={wallX - 30} y={H - 12} fontSize="9.5" fill={MUTED} fontFamily={mono}>section 1 px = {f2(1000 / k)} mm · nail drawn level</text>
    </Chart>
  )
}

/** The facing panel between four nail heads in elevation (spacings, the
 *  bearing plate and the punching perimeter around it), and the panel
 *  section with its thickness, cover and effective depth. */
export function FacingDrawing({ SH, SV, hc, cover, d, plate }: { SH: number; SV: number; hc: number; cover: number; d: number; plate: number }) {
  const W = 680, H = 380
  const k = Math.min(190 / Math.max(SH, 0.3), 190 / Math.max(SV, 0.3)) // px per m, elevation
  const ox = 150, oy = 70
  const heads = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => ({ x: ox + i * SH * k, y: oy + j * SV * k }))
  const bpx = plate * k, rp = ((plate * 1000 + d) / 2 / 1000) * k
  // section, true scale in mm
  const sx = 460, sy = 124, ks = Math.min(1.4, 140 / Math.max(hc, 1))
  return (
    <Chart label="Shotcrete facing panel" W={W} H={H}>
      <text x={ox + (SH * k) / 2} y={30} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono}>FACING ELEVATION</text>
      <rect x={ox - 30} y={oy - 30} width={SH * k + 60} height={SV * k + 60} fill="rgba(115,109,94,0.12)" />
      {heads.map((h, i) => (
        <g key={i}>
          <rect x={h.x - bpx / 2} y={h.y - bpx / 2} width={bpx} height={bpx} fill={CONCRETE} stroke={INK} strokeWidth="1.1" />
          <circle cx={h.x} cy={h.y} r="3" fill={INK} />
        </g>
      ))}
      {/* the punching perimeter around one plate, at d/2 beyond its edge */}
      <circle cx={heads[0].x} cy={heads[0].y} r={rp} fill="none" stroke={RED} strokeWidth="1" strokeDasharray="4 3" />
      <text x={heads[0].x + rp + 6} y={heads[0].y - rp + 4} fontSize="9.5" fill={RED} fontFamily={mono} {...halo}>bo = π(L + d)</text>
      <line x1={heads[2].x} x2={heads[2].x} y1={heads[2].y + bpx / 2 + 4} y2={heads[2].y + 50} stroke={MUTED} strokeWidth="0.7" />
      <line x1={heads[3].x} x2={heads[3].x} y1={heads[3].y + bpx / 2 + 4} y2={heads[3].y + 50} stroke={MUTED} strokeWidth="0.7" />
      <HDim y={heads[2].y + 44} a={heads[2].x} b={heads[3].x} label={`SH ${f2(SH)} m`} />
      <line x1={heads[0].x - bpx / 2 - 4} x2={heads[0].x - 60} y1={heads[0].y} y2={heads[0].y} stroke={MUTED} strokeWidth="0.7" />
      <line x1={heads[2].x - bpx / 2 - 4} x2={heads[2].x - 60} y1={heads[2].y} y2={heads[2].y} stroke={MUTED} strokeWidth="0.7" />
      <VDim x={heads[0].x - 54} a={heads[0].y} b={heads[2].y} label={`SV ${f2(SV)} m`} color={INK} side="left" />
      <text x={heads[1].x - bpx / 2} y={heads[1].y - bpx / 2 - 8} fontSize="9.5" fill={INK} fontFamily={mono} {...halo}>plate {f2(plate * 1000)} mm</text>

      {/* the facing in section as built: a vertical skin, exposed face left, soil behind */}
      <text x={sx + (hc * ks) / 2 + 20} y={30} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono}>SECTION</text>
      <rect x={sx + hc * ks} y={sy - 40} width={70} height={190} fill={SOIL} />
      <text x={sx + hc * ks + 35} y={sy + 60} textAnchor="middle" fontSize="9" fill={MUTED} fontFamily={mono}>soil</text>
      <rect x={sx} y={sy - 40} width={hc * ks} height={190} fill={CONCRETE} stroke={INK} strokeWidth="1.3" />
      <line x1={sx + d * ks} x2={sx + d * ks} y1={sy - 40} y2={sy + 150} stroke={RED} strokeWidth="1.6" strokeDasharray="10 4" />
      <text x={sx + d * ks} y={sy + 166} textAnchor="middle" fontSize="9" fill={RED} fontFamily={mono} {...halo}>mesh</text>
      <text x={sx - 6} y={sy + 60} textAnchor="end" fontSize="9" fill={MUTED} fontFamily={mono}>exposed</text>
      <text x={sx - 6} y={sy + 72} textAnchor="end" fontSize="9" fill={MUTED} fontFamily={mono}>face</text>
      {/* effective depth above, thickness below, each between extension lines */}
      <line x1={sx} x2={sx} y1={sy - 44} y2={sy - 70} stroke={MUTED} strokeWidth="0.8" />
      <line x1={sx + d * ks} x2={sx + d * ks} y1={sy - 44} y2={sy - 70} stroke={MUTED} strokeWidth="0.8" />
      <HDim y={sy - 62} a={sx} b={sx + d * ks} label={`d ${f2(d)}`} />
      <line x1={sx} x2={sx} y1={sy + 154} y2={sy + 196} stroke={MUTED} strokeWidth="0.8" />
      <line x1={sx + hc * ks} x2={sx + hc * ks} y1={sy + 154} y2={sy + 196} stroke={MUTED} strokeWidth="0.8" />
      <HDim y={sy + 190} a={sx} b={sx + hc * ks} label={`hc ${f2(hc)}`} />
      <text x={sx - 40} y={sy + 220} fontSize="9.5" fill={MUTED} fontFamily={mono}>cover {f2(cover)} mm · 1 px = {f2(1 / ks)} mm</text>
      <text x={ox - 30} y={H - 12} fontSize="9.5" fill={MUTED} fontFamily={mono}>elevation to scale (1 px = {f2(1000 / k)} mm)</text>
    </Chart>
  )
}

/** A ground anchor: the tendon from the head through the free length
 *  (drawn broken, not designed here) into the bonded socket, with the bond
 *  length and hole diameter dimensioned and the tension at the head. */
export function AnchorDrawing({ holeDia, bondLength, T, testLoad }: { holeDia: number; bondLength: number; T: number; testLoad: number }) {
  const W = 680, H = 300
  const ang = (20 * Math.PI) / 180 // drawn at 20° below horizontal
  const k = 330 / Math.max(bondLength, 0.5) // px per m along the anchor
  const hx = 120, hy = 70
  const free = 120 // px of free length, broken
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux
  const at = (s: number) => ({ x: hx + ux * s, y: hy + uy * s })
  const b0 = at(free), b1 = at(free + bondLength * k)
  const r = Math.max((holeDia * k) / 2, 6)
  const sock = `${b0.x + nx * r},${b0.y + ny * r} ${b1.x + nx * r},${b1.y + ny * r} ${b1.x - nx * r},${b1.y - ny * r} ${b0.x - nx * r},${b0.y - ny * r}`
  const brk = at(free * 0.5)
  return (
    <Chart label="Ground anchor bond zone" W={W} H={H}>
      <rect x={40} y={hy} width={W - 70} height={H - hy - 40} fill="rgba(115,109,94,0.14)" />
      <line x1={40} x2={W - 30} y1={hy} y2={hy} stroke={INK} strokeWidth="1.3" />
      <polygon points={sock} fill="rgba(146,120,80,0.45)" stroke={INK} strokeWidth="1.2" />
      <line x1={hx} y1={hy} x2={b1.x} y2={b1.y} stroke={INK} strokeWidth="2.2" />
      {/* break in the free length */}
      <path d={`M ${brk.x + nx * 12 - ux * 4} ${brk.y + ny * 12 - uy * 4} l ${ux * 8 - nx * 8} ${uy * 8 - ny * 8} l ${-ux * 0 - nx * 8} ${-uy * 0 - ny * 8} l ${ux * 8 - nx * 8} ${uy * 8 - ny * 8}`} fill="none" stroke={INK} strokeWidth="1" />
      <text x={56} y={hy + 56} fontSize="9.5" fill={MUTED} fontFamily={mono} {...halo}>free length</text>
      <text x={56} y={hy + 70} fontSize="9.5" fill={MUTED} fontFamily={mono} {...halo}>(not designed here)</text>
      <rect x={hx - 14} y={hy - 10} width={28} height={10} fill={CONCRETE} stroke={INK} strokeWidth="1.1" />
      <Arrow x1={hx} y1={hy - 6} x2={hx - ux * 70} y2={hy - 6 - uy * 70} color={RED} w={2.2} />
      <text x={hx - ux * 70 - 4} y={hy - uy * 70 - 18} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>T {f2(T)} kN</text>
      {/* bond length along the anchor, offset to the upper side */}
      {(() => {
        const off = r + 26
        const a = { x: b0.x + nx * -off, y: b0.y + ny * -off }, b = { x: b1.x + nx * -off, y: b1.y + ny * -off }
        return <g>
          <line x1={b0.x - nx * r} y1={b0.y - ny * r} x2={a.x - nx * 6} y2={a.y - ny * 6} stroke={MUTED} strokeWidth="0.8" />
          <line x1={b1.x - nx * r} y1={b1.y - ny * r} x2={b.x - nx * 6} y2={b.y - ny * 6} stroke={MUTED} strokeWidth="0.8" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth="1" />
          {[a, b].map((p, i) => <line key={i} x1={p.x - 4} y1={p.y + 4} x2={p.x + 4} y2={p.y - 4} stroke={INK} strokeWidth="1.2" />)}
          <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" fontSize="10" fill={INK} fontFamily={mono} {...halo}
            transform={`rotate(${(ang * 180) / Math.PI} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 8})`}>bond length {f2(bondLength)} m</text>
        </g>
      })()}
      <text x={b1.x + 10} y={b1.y + 4} fontSize="9.5" fill={INK} fontFamily={mono} {...halo}>⌀ {f2(holeDia * 1000)} mm</text>
      <text x={40} y={H - 14} fontSize="9.5" fill={MUTED} fontFamily={mono}>bond length 1 px = {f2(1000 / k)} mm, hole ⌀ exaggerated, inclination indicative · proof load {f2(testLoad)} kN</text>
    </Chart>
  )
}
