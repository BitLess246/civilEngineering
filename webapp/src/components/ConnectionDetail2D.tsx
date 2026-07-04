// ─────────────────────────────────────────────────────────────────────────
// 2D detail drawing of a designed steel connection — the schedule row's
// section views, in the style of the reference figures: an ELEVATION (side
// view: support at left, beam entering from the right, plate + bolts + cope)
// and an END SECTION (looking along the beam: support face behind, plate
// against the beam web with the fillet welds, every bolt drawn shank + head +
// nut at its row elevation, single-shear plane called out). All geometry comes
// from the designed row (plate t×w×h, bolt layout, cope) and AISC shapes. mm.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { shapeByName } from '../engine/aiscSections'
import type { BeamConnection } from '../engine/steelConnections'

const STEEL = '#94a3b8'      // member outline fill
const PLATE = '#334155'
const BOLT = '#b45309'
const DIM = '#2563eb'
const WELD = '#d97706'

/** Drafting dimension: extension lines + dimension line with filled arrowheads
 *  + centered label. Vertical (measuring y) or horizontal (measuring x). */
function Dim({ x1, y1, x2, y2, off, label, vertical }: {
  x1: number; y1: number; x2: number; y2: number
  /** offset of the dimension line from the measured points (px, signed) */
  off: number
  label: string
  vertical?: boolean
}) {
  const A = 5   // arrowhead size
  if (vertical) {
    const dx = x1 + off
    return (
      <g stroke={DIM} fill={DIM} strokeWidth={0.8}>
        <line x1={x1} y1={y1} x2={dx + Math.sign(off) * 3} y2={y1} />
        <line x1={x2} y1={y2} x2={dx + Math.sign(off) * 3} y2={y2} />
        <line x1={dx} y1={y1} x2={dx} y2={y2} />
        <path d={`M ${dx} ${y1} l ${-A / 2} ${A} l ${A} 0 z`} />
        <path d={`M ${dx} ${y2} l ${-A / 2} ${-A} l ${A} 0 z`} />
        <text x={dx + 5} y={(y1 + y2) / 2 + 3} fontSize={10} stroke="none">{label}</text>
      </g>
    )
  }
  const dy = y1 + off
  return (
    <g stroke={DIM} fill={DIM} strokeWidth={0.8}>
      <line x1={x1} y1={y1} x2={x1} y2={dy + Math.sign(off) * 3} />
      <line x1={x2} y1={y2} x2={x2} y2={dy + Math.sign(off) * 3} />
      <line x1={x1} y1={dy} x2={x2} y2={dy} />
      <path d={`M ${x1} ${dy} l ${A} ${-A / 2} l 0 ${A} z`} />
      <path d={`M ${x2} ${dy} l ${-A} ${-A / 2} l 0 ${A} z`} />
      <text x={(x1 + x2) / 2} y={dy + (off > 0 ? 12 : -5)} textAnchor="middle" fontSize={10} stroke="none">{label}</text>
    </g>
  )
}

export function ConnectionDetail2D({ conn, hostShape, hostKind, faceType, beamShape }: {
  conn: BeamConnection
  hostShape: string            // column or girder AISC shape name
  hostKind: 'column' | 'girder'
  faceType: 'flange' | 'web'
  beamShape?: string           // supported beam AISC shape name
}) {
  const g = useMemo(() => {
    const host = shapeByName(hostShape)
    const beam = beamShape ? shapeByName(beamShape) : undefined
    const dB = beam?.d ?? conn.tab.hMm + 160
    const bfB = beam?.bf ?? 160
    const tfB = beam?.tf ?? 12
    const twB = beam?.tw ?? 8
    // host band width in the elevation = the dimension along the beam axis
    const hostW = hostKind === 'girder' ? (host?.tw ?? 10) + 8
      : faceType === 'flange' ? (host?.d ?? 300) : (host?.bf ?? 300)
    return { host, beam, dB, bfB, tfB, twB, hostW }
  }, [conn, hostShape, hostKind, faceType, beamShape])

  const { dB, bfB, tfB, twB, hostW } = g
  const tab = conn.tab
  const beamLen = Math.max(tab.wMm + 170, 310)
  const cope = conn.cope
  const rows = conn.bolts.locations

  // ── elevation view geometry (mm coordinate space, y down = SVG) ──
  const W = hostW + beamLen + 120, H = Math.max(dB, tab.hMm) + 190
  const cx = 40                       // host left edge
  const faceX = cx + hostW            // support face
  const cy = H / 2                    // beam centreline
  const beamTop = cy - dB / 2, beamBot = cy + dB / 2
  const plateTop = cy - tab.hMm / 2
  const boltY = (y: number) => plateTop + tab.hMm - y          // plate y → SVG y
  const a0 = rows[0]?.x ?? 60

  // ── end-section view ──
  const supW = hostKind === 'girder' ? 30 : Math.max(bfB + 60, (g.host?.bf ?? 254))
  const W2 = Math.max(bfB, supW) + 190, H2 = dB + 150
  const cx2 = (W2 - 60) / 2, cy2 = H2 / 2
  const plateX2 = cx2 + twB / 2                                 // plate against the web, near side

  const sc = 0.55                     // mm → px

  return (
    <div className="flex flex-wrap gap-4">
      {/* ELEVATION */}
      <svg viewBox={`0 0 ${W} ${H}`} width={W * sc} height={H * sc} className="rounded-lg border border-slate-200 bg-white">
        <text x={W / 2} y={16} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">ELEVATION</text>
        {/* support (column band / girder web) */}
        <rect x={cx} y={20} width={hostW} height={H - 40} fill={STEEL} opacity={0.5} stroke="#475569" />
        {hostKind === 'column' && faceType === 'flange' && (
          <>
            <rect x={cx} y={20} width={(g.host?.tf ?? 15)} height={H - 40} fill="#64748b" />
            <rect x={cx + hostW - (g.host?.tf ?? 15)} y={20} width={(g.host?.tf ?? 15)} height={H - 40} fill="#64748b" />
          </>
        )}
        <text x={cx + hostW / 2} y={34} textAnchor="middle" fontSize={10} fill="#334155">{hostShape}</text>
        {/* beam with flanges (+ cope notch on the top flange) */}
        {cope ? (
          <path d={`M ${faceX + cope.lengthMm} ${beamTop} L ${faceX + beamLen} ${beamTop} L ${faceX + beamLen} ${beamBot} L ${faceX} ${beamBot} L ${faceX} ${beamTop + cope.depthMm} L ${faceX + cope.lengthMm} ${beamTop + cope.depthMm} Z`}
            fill={STEEL} opacity={0.45} stroke="#475569" />
        ) : (
          <rect x={faceX} y={beamTop} width={beamLen} height={dB} fill={STEEL} opacity={0.45} stroke="#475569" />
        )}
        <line x1={cope ? faceX + cope.lengthMm : faceX} y1={beamTop + tfB} x2={faceX + beamLen} y2={beamTop + tfB} stroke="#475569" />
        <line x1={faceX} y1={beamBot - tfB} x2={faceX + beamLen} y2={beamBot - tfB} stroke="#475569" />
        {cope && (
          <Dim x1={faceX} y1={beamTop + cope.depthMm} x2={faceX + cope.lengthMm} y2={beamTop + cope.depthMm} off={-(cope.depthMm + 14)} label={`cope ${cope.lengthMm}×${cope.depthMm}`} />
        )}
        {/* plate + weld triangle at the support face */}
        <rect x={faceX} y={plateTop} width={tab.wMm} height={tab.hMm} fill="none" stroke={PLATE} strokeWidth={2.2} />
        <path d={`M ${faceX} ${plateTop - 9} l 11 9 l -11 0 z`} fill={WELD} />
        <text x={faceX + 14} y={plateTop - 11} fontSize={9} fill={WELD}>{tab.weldSizeMm} mm E70 fillet, 2 sides</text>
        {/* bolts at the designed layout */}
        {rows.map((bp) => (
          <g key={bp.id}>
            <circle cx={faceX + bp.x} cy={boltY(bp.y)} r={conn.bolts.dia / 2} fill="none" stroke={BOLT} strokeWidth={2} />
            <line x1={faceX + bp.x - 7} y1={boltY(bp.y)} x2={faceX + bp.x + 7} y2={boltY(bp.y)} stroke={BOLT} />
            <line x1={faceX + bp.x} y1={boltY(bp.y) - 7} x2={faceX + bp.x} y2={boltY(bp.y) + 7} stroke={BOLT} />
          </g>
        ))}
        {/* dimensions: plate h (right), a (face→bolt line, below), pitch (right of bolts) */}
        <Dim x1={faceX + tab.wMm} y1={plateTop} x2={faceX + tab.wMm} y2={plateTop + tab.hMm} off={22} label={`h = ${Math.round(tab.hMm)}`} vertical />
        <Dim x1={faceX} y1={plateTop + tab.hMm} x2={faceX + a0} y2={plateTop + tab.hMm} off={26} label={`a = ${Math.round(a0)}`} />
        {rows.length > 1 && (
          <Dim x1={faceX + a0} y1={boltY(rows[1].y)} x2={faceX + a0} y2={boltY(rows[0].y)} off={-24} label={`p = ${conn.bolts.pitchMm}`} vertical />
        )}
        <text x={faceX + tab.wMm / 2} y={plateTop + tab.hMm + 52} textAnchor="middle" fontSize={10} fill={PLATE} fontWeight={600}>
          PL {tab.t}×{tab.wMm}×{Math.round(tab.hMm)}
        </text>
        {/* Vu arrow */}
        <line x1={faceX + beamLen - 32} y1={beamTop - 28} x2={faceX + beamLen - 32} y2={beamTop - 6} stroke="#dc2626" strokeWidth={2} />
        <path d={`M ${faceX + beamLen - 32} ${beamTop - 6} l -5 -8 l 10 0 z`} fill="#dc2626" />
        <text x={faceX + beamLen - 26} y={beamTop - 14} fontSize={10} fill="#dc2626">Vu = {conn.Vu.toFixed(0)} kN</text>
      </svg>

      {/* END SECTION */}
      <svg viewBox={`0 0 ${W2} ${H2}`} width={W2 * sc} height={H2 * sc} className="rounded-lg border border-slate-200 bg-white">
        <text x={W2 / 2} y={16} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">SECTION</text>
        {/* support face behind: column flange (or girder web edge-band) */}
        <rect x={cx2 - supW / 2} y={cy2 - dB / 2 - 34} width={supW} height={dB + 68}
          fill={STEEL} opacity={0.22} stroke="#94a3b8" strokeDasharray="5 3" />
        <text x={cx2 - supW / 2 + 4} y={cy2 - dB / 2 - 22} fontSize={9} fill="#64748b">
          {hostKind === 'girder' ? `girder web (${hostShape})` : `column ${faceType} (${hostShape})`} behind
        </text>
        {/* beam I end view */}
        <g stroke="#475569" fill={STEEL} fillOpacity={0.45}>
          <rect x={cx2 - bfB / 2} y={cy2 - dB / 2} width={bfB} height={tfB} />
          <rect x={cx2 - bfB / 2} y={cy2 + dB / 2 - tfB} width={bfB} height={tfB} />
          <rect x={cx2 - twB / 2} y={cy2 - dB / 2 + tfB} width={twB} height={dB - 2 * tfB} />
        </g>
        {/* plate against the web + fillet weld triangles top/bottom (to the support) */}
        <rect x={plateX2} y={cy2 - tab.hMm / 2} width={tab.t + 2} height={tab.hMm} fill={PLATE} />
        <path d={`M ${plateX2} ${cy2 - tab.hMm / 2} l ${tab.t + 2} 0 l ${-(tab.t + 2) / 2} ${-9} z`} fill={WELD} />
        <path d={`M ${plateX2} ${cy2 + tab.hMm / 2} l ${tab.t + 2} 0 l ${-(tab.t + 2) / 2} ${9} z`} fill={WELD} />
        <text x={plateX2 + tab.t + 8} y={cy2 - tab.hMm / 2 - 4} fontSize={9} fill={WELD}>weld to support</text>
        {/* bolts: shank through web + plate, hex head (plate side) + nut (web side), per row */}
        {rows.map((bp) => {
          const y = cy2 + tab.hMm / 2 - bp.y
          const shankL = twB + tab.t + 2
          return (
            <g key={bp.id}>
              <rect x={cx2 - twB / 2 - 2} y={y - conn.bolts.dia / 2} width={shankL + 4} height={conn.bolts.dia} fill={BOLT} opacity={0.9} />
              <rect x={plateX2 + tab.t + 2} y={y - conn.bolts.dia * 0.9} width={conn.bolts.dia * 0.7} height={conn.bolts.dia * 1.8} fill={BOLT} />
              <rect x={cx2 - twB / 2 - 2 - conn.bolts.dia * 0.7} y={y - conn.bolts.dia * 0.9} width={conn.bolts.dia * 0.7} height={conn.bolts.dia * 1.8} fill={BOLT} />
            </g>
          )
        })}
        {/* single-shear plane callout at the plate ↔ web interface */}
        {rows.length > 0 && (() => {
          const y = cy2 + tab.hMm / 2 - rows[rows.length - 1].y
          return (
            <g>
              <line x1={plateX2 - 1} y1={y - 26} x2={plateX2 - 1} y2={y + 26} stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1.4} />
              <line x1={plateX2 - 1} y1={y - 26} x2={plateX2 + 34} y2={y - 40} stroke="#dc2626" strokeWidth={0.9} />
              <text x={plateX2 + 36} y={y - 42} fontSize={9.5} fill="#dc2626" fontWeight={600}>single shear plane (m = 1)</text>
            </g>
          )
        })()}
        <Dim x1={plateX2} y1={cy2 + tab.hMm / 2 + 14} x2={plateX2 + tab.t + 2} y2={cy2 + tab.hMm / 2 + 14} off={10} label={`t = ${tab.t}`} />
        <text x={cx2} y={H2 - 14} textAnchor="middle" fontSize={10} fill="#334155">
          {beamShape ?? 'beam'} — {conn.bolts.n} × M{conn.bolts.dia} A325, single shear
        </text>
      </svg>
    </div>
  )
}
