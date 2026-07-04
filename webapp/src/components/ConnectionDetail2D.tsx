// ─────────────────────────────────────────────────────────────────────────
// 2D detail drawing of a designed steel connection — the schedule row's
// section views, in the style of the reference figures: an ELEVATION (side
// view: support at left, beam entering from the right, plate + bolts + cope)
// and an END SECTION (looking along the beam: support face, plate edge-on
// against the beam web, bolts across). All geometry comes from the designed
// row (plate t×w×h, bolt layout, cope) and the AISC shapes. Units mm.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { shapeByName } from '../engine/aiscSections'
import type { BeamConnection } from '../engine/steelConnections'

const STEEL = '#94a3b8'      // member outline fill
const PLATE = '#334155'
const BOLT = '#b45309'
const DIM = '#2563eb'

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
  const beamLen = Math.max(tab.wMm + 160, 300)
  const cope = conn.cope

  // ── elevation view geometry (mm coordinate space, y up) ──
  const W = hostW + beamLen + 90, H = Math.max(dB, tab.hMm) + 170
  const cx = 40                       // host left edge
  const faceX = cx + hostW            // support face
  const cy = H / 2                    // beam centreline
  const beamTop = cy - dB / 2, beamBot = cy + dB / 2
  const plateTop = cy - tab.hMm / 2

  // ── end-section view ──
  const W2 = Math.max(bfB, 160) + 120, H2 = dB + 120
  const cx2 = W2 / 2, cy2 = H2 / 2

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
          <text x={faceX + cope.lengthMm + 4} y={beamTop + cope.depthMm - 4} fontSize={9} fill={DIM}>
            cope {cope.lengthMm}×{cope.depthMm}
          </text>
        )}
        {/* plate + weld triangles at the support face */}
        <rect x={faceX} y={plateTop} width={tab.wMm} height={tab.hMm} fill="none" stroke={PLATE} strokeWidth={2.2} />
        <path d={`M ${faceX} ${plateTop - 8} l 10 8 l -10 0 z`} fill={PLATE} />
        <text x={faceX + 12} y={plateTop - 10} fontSize={9} fill={PLATE}>{tab.weldSizeMm} mm E70 (2 sides)</text>
        {/* bolts at the designed layout (x from the face/weld line, y from the plate bottom) */}
        {conn.bolts.locations.map((bp) => (
          <g key={bp.id}>
            <circle cx={faceX + bp.x} cy={plateTop + tab.hMm - bp.y} r={conn.bolts.dia / 2} fill="none" stroke={BOLT} strokeWidth={2} />
            <line x1={faceX + bp.x - 7} y1={plateTop + tab.hMm - bp.y} x2={faceX + bp.x + 7} y2={plateTop + tab.hMm - bp.y} stroke={BOLT} />
            <line x1={faceX + bp.x} y1={plateTop + tab.hMm - bp.y - 7} x2={faceX + bp.x} y2={plateTop + tab.hMm - bp.y + 7} stroke={BOLT} />
          </g>
        ))}
        {/* dimensions */}
        <line x1={faceX + tab.wMm + 16} y1={plateTop} x2={faceX + tab.wMm + 16} y2={plateTop + tab.hMm} stroke={DIM} markerEnd="" />
        <text x={faceX + tab.wMm + 20} y={cy + 3} fontSize={10} fill={DIM}>h = {Math.round(tab.hMm)}</text>
        <text x={faceX + tab.wMm / 2} y={plateTop + tab.hMm + 14} textAnchor="middle" fontSize={10} fill={DIM}>
          PL {tab.t}×{tab.wMm}×{Math.round(tab.hMm)}
        </text>
        <text x={faceX + (conn.bolts.locations[0]?.x ?? 60) / 2} y={beamBot + 26} textAnchor="middle" fontSize={9} fill={DIM}>
          a = {Math.round(conn.bolts.locations[0]?.x ?? 60)}
        </text>
        {/* Vu arrow */}
        <line x1={faceX + beamLen - 30} y1={beamTop - 26} x2={faceX + beamLen - 30} y2={beamTop - 4} stroke="#dc2626" strokeWidth={2} />
        <path d={`M ${faceX + beamLen - 30} ${beamTop - 4} l -5 -8 l 10 0 z`} fill="#dc2626" />
        <text x={faceX + beamLen - 24} y={beamTop - 12} fontSize={10} fill="#dc2626">Vu = {conn.Vu.toFixed(0)} kN</text>
      </svg>

      {/* END SECTION */}
      <svg viewBox={`0 0 ${W2} ${H2}`} width={W2 * sc} height={H2 * sc} className="rounded-lg border border-slate-200 bg-white">
        <text x={cx2} y={16} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">SECTION</text>
        {/* beam I end view */}
        <g stroke="#475569" fill={STEEL} fillOpacity={0.45}>
          <rect x={cx2 - bfB / 2} y={cy2 - dB / 2} width={bfB} height={tfB} />
          <rect x={cx2 - bfB / 2} y={cy2 + dB / 2 - tfB} width={bfB} height={tfB} />
          <rect x={cx2 - twB / 2} y={cy2 - dB / 2 + tfB} width={twB} height={dB - 2 * tfB} />
        </g>
        {/* plate edge-on beside the web + bolt across */}
        <rect x={cx2 + twB / 2} y={cy2 - tab.hMm / 2} width={tab.t} height={tab.hMm} fill={PLATE} />
        <line x1={cx2 - twB / 2 - 14} y1={cy2} x2={cx2 + twB / 2 + tab.t + 14} y2={cy2} stroke={BOLT} strokeWidth={4} />
        <text x={cx2 + twB / 2 + tab.t + 6} y={cy2 - 8} fontSize={10} fill={PLATE}>t = {tab.t}</text>
        <text x={cx2} y={cy2 + dB / 2 + 24} textAnchor="middle" fontSize={10} fill="#334155">
          {beamShape ?? 'beam'} — {conn.bolts.n} × M{conn.bolts.dia}
        </text>
      </svg>
    </div>
  )
}
