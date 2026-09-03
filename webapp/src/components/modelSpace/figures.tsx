// ─────────────────────────────────────────────────────────────────────────
// SCHEDULE FIGURES — the little drawings a schedule row expands into.
//
// A beam's bar elevation, a column's tie elevation, a W-shape section and the
// §424.2 serviceability read-out. Pure SVG from numbers: no model, no state,
// no analysis — which is why they can live away from the page.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, type ReactNode } from 'react'
import { planToSvg, type Drawing } from '../../engine/planRenderer'
import { memberSectionDetail } from '../../engine/memberSection'
import type { StructuralModel } from '../../engine/model'
import type { RebarCage } from '../../engine/rebarModel'
import { type MemberDeflectionResult } from '../../engine/memberDeflection'
import { DimBelow, DimSide } from '../../components/dims'
import { f0, f1, f2 } from '../../lib/format'

/** §424.2 computed service deflection for one beam, integrated from its own
 *  D-only / L-only moment diagrams. Shown once per member in the accordion (and
 *  therefore in the printed report, which force-expands every row). */
export function BeamServiceability({ r, id, L }: { r: MemberDeflectionResult; id: string; L: number }) {
  const serviceOK = r.liveOK && r.totalOK
  const cell = (label: string, value: string, sub?: string, alert?: boolean) => (
    <div className={`rounded border px-2 py-1 ${alert ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-[11px] font-semibold ${alert ? 'text-red-700' : 'text-slate-800'}`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500">{sub}</div>}
    </div>
  )
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
      <p className="mb-1.5 text-[11px] font-semibold text-[#0f4c92]">
        Serviceability — NSCP §424.2 computed deflection · {id} ({f2(L)} m, {r.support})
        <span className={`ml-2 rounded px-1.5 py-px font-mono text-[10px] ${
          serviceOK ? 'bg-[#ddefe3] text-[#14603a]' : 'bg-[#fbeeea] text-[#c2402a]'}`}>
          {serviceOK ? 'within limits' : 'exceeds limit'}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
        {cell('Ig', `${(r.Ig / 1e6).toFixed(0)}×10⁶ mm⁴`)}
        {cell('Icr', `${(r.Icr / 1e6).toFixed(0)}×10⁶ mm⁴`)}
        {cell('Ie (Branson)', `${(r.Ie / 1e6).toFixed(0)}×10⁶ mm⁴`, r.cracked ? `cracked · Ma ${f1(r.Ma)} > Mcr ${f1(r.Mcr)}` : `uncracked · Ma ${f1(r.Ma)} ≤ Mcr ${f1(r.Mcr)}`)}
        {cell('δ dead (immediate)', `${f2(r.deltaD)} mm`)}
        {cell('λΔ · δ dead', `${f2(r.deltaLong)} mm`, `λΔ = ${f2(r.lambdaDelta)}`)}
        {cell('δ live', `${f2(r.deltaL)} mm`, `limit L/360 = ${f1(r.limitL360)}`, !r.liveOK)}
        {cell('δ total', `${f2(r.deltaTotal)} mm`, `limit L/240 = ${f1(r.limitL240)}`, !r.totalOK)}
        {cell('peak at', `${f2(r.xMax)} m`, 'from the i-end')}
        {cell('h min (Table 409.3.1.1)', `${f0(r.hMin)} mm`, r.hMinOK ? 'satisfied — deflections need not be computed' : 'not satisfied — computed check governs', !r.hMinOK && !serviceOK)}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        Ie from Branson (§424.2.3.5) at the peak service D+L moment; δ obtained by integrating this member's own
        moment diagram (M/EcIe, twice) with the model's end restraint, not an assumed uniform load. Total = λΔ·δD + δL
        (§424.2.2). §409.3.1.1 permits skipping the calculation when h ≥ hMin, so the member passes on either route.
      </p>
    </div>
  )
}

// ── Element drawings for the schedule accordions ─────────────────────────────

/**
 * A section through the member's OWN CAGE, painted with the plan renderer.
 *
 * What stood here was a drawing about the design: `BeamSchematic` and
 * `ColumnSchematic` each took b, h, a bar count and a cover and laid the steel
 * out themselves. Three modules had a bar layout — those two and `columnCage`
 * — and only the last one is the steel that gets built, scheduled and weighed,
 * so a schedule row could show a tie arrangement the 3D view did not have.
 *
 * This draws the cut (`memberSectionDetail`): if a bar is on it, the plane
 * passed through it. Same `Drawing` type and same `planToSvg` the Plans tab
 * uses, so the figure in the worked solution and the sheet in the drawing set
 * are one object rendered twice.
 */
export function CageSectionFigure({ drawing, width = 300 }: { drawing: Drawing; width?: number }): ReactNode {
  const svg = useMemo(() => planToSvg(drawing, width), [drawing, width])
  // Engine-generated markup — every string in it comes from `planToSvg`, which
  // escapes the text it is given.
  return <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** The design numbers a section callout prints. Structural rather than the
 *  pipeline's own types, so this file stays free of the design pipeline. */
export interface SectionRowDesign {
  bars: number; sAdopt: number; legs: number; layers: number[]
  comprBars: number; comprLayers: number[]
}
export interface BeamRowSection {
  x: number; label: string; hogging: boolean
  bf?: number; hf?: number; edge?: boolean; flangeKind?: string
  design: SectionRowDesign & { flangeAction?: string }
}
export interface SectionRect { b: number; h: number; cover: number; barDia: number; tieDia: number }

/**
 * The SECTION figure in a beam's schedule row — cut through that beam's cage,
 * at the station the row is about.
 *
 * The station is the row's own `x`, so the drawing follows the design along the
 * span: at a support it shows the top steel the hogging check sized, at midspan
 * the bottom steel, and where a bar laps it shows both pieces. A drawing made
 * from the bar COUNT could show none of that.
 */
export function BeamCageSection({ model, cages, beam, sec, rect }: {
  model: StructuralModel; cages: RebarCage[]
  beam: { id: string; L: number }; sec: BeamRowSection; rect: SectionRect
}): ReactNode {
  const d = sec.design
  const drawing = useMemo(() => memberSectionDetail(
    model, cages, beam.id, beam.L > 0 ? sec.x / beam.L : 0.5,
    {
      title: `SECTION — ${sec.label}`,
      notes: [
        `${d.bars}-⌀${rect.barDia}${sec.hogging ? ' TOP' : ' BOT'}${d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}`,
        ...(d.comprBars > 0 ? [`${d.comprBars}-⌀${rect.barDia} COMPR.`] : []),
        d.sAdopt > 0
          ? `STIRRUPS ${d.legs}L-⌀${rect.tieDia} @ ${Math.round(d.sAdopt)}`
          : `STIRRUPS ⌀${rect.tieDia} @ MIN. (§409.6.3.1)`,
        ...(sec.bf ? [`${sec.flangeKind ?? (sec.edge ? 'L' : 'T')}-BEAM · bf ${Math.round(sec.bf)}${d.flangeAction === 'true-T' ? ' · TRUE T' : ''}`] : []),
      ],
    },
  ), [model, cages, beam.id, beam.L, sec, rect, d])
  if (!drawing) return null
  return <CageSectionFigure drawing={drawing} />
}

/**
 * The SECTION figure in a column's schedule row — cut at mid-height, which is
 * the length between the confinement zones and so the column's general section.
 *
 * The tie set it draws is the one the cage placed there: the hoop AND the cross
 * ties threaded through it, at the spacing the design adopted. `ColumnSchematic`
 * drew a tie arrangement of its own, from a bar layout of its own, and neither
 * had to agree with the cage.
 */
export function ColumnCageSection({ model, cages, col, rect }: {
  model: StructuralModel; cages: RebarCage[]
  col: { id: string; bars: number; tieSpacingFinal: number; seismicSConf?: number; seismicSOut?: number }
  rect: SectionRect
}): ReactNode {
  const drawing = useMemo(() => memberSectionDetail(model, cages, col.id, 0.5, {
    title: 'SECTION — MID-HEIGHT',
    notes: [
      `${col.bars}-⌀${rect.barDia} VERT.`,
      col.seismicSConf !== undefined
        ? `TIES ⌀${rect.tieDia} @ ${Math.round(col.seismicSConf)} IN ℓo, @ ${Math.round(col.seismicSOut ?? col.tieSpacingFinal)} ELSEWHERE`
        : `TIES ⌀${rect.tieDia} @ ${Math.round(col.tieSpacingFinal)}`,
    ],
  }), [model, cages, col, rect])
  if (!drawing) return null
  return <CageSectionFigure drawing={drawing} />
}

/** Rebar elevation of a beam/girder: outline, stirrup ticks, top steel over the
 *  hogging ends and bottom steel over the sagging mid-span. */
export function BeamRebarElevation({ L, h, sections }: {
  L: number; h: number; sections: { x: number; hogging: boolean; design: { bars: number; sAdopt: number } }[]
}): ReactNode {
  // viewBox width matches BeamSchematic (330) so text renders the same size.
  const W = 330, padL = 44, padR = 18, top = 22, bh = 62
  const x0 = padL, x1 = W - padR, yTop = top, yBot = top + bh
  const dimY = yBot + 22, H = dimY + 14
  const sx = (x: number) => x0 + (x1 - x0) * (L > 0 ? Math.max(0, Math.min(1, x / L)) : 0)
  const sList = sections.map((s) => s.design.sAdopt).filter((v) => v > 0)
  const sm = sList.length ? Math.min(...sList) / 1000 : 0
  const nStir = sm > 0 ? Math.min(40, Math.max(2, Math.round(L / sm))) : 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={x0} y={13} fontSize={11} fontWeight={700} fill="#0f4c92">ELEVATION — rebar{sm > 0 ? ` (stirrups @${Math.round(sm * 1000)})` : ''}</text>
      <rect x={x0} y={yTop} width={x1 - x0} height={bh} fill="#fff" stroke="#37526e" strokeWidth={1.4} />
      {Array.from({ length: nStir + 1 }, (_, k) => {
        const x = sx((L * k) / Math.max(nStir, 1))
        return <line key={k} x1={x} y1={yTop + 4} x2={x} y2={yBot - 4} stroke="#94a3b8" strokeWidth={0.7} />
      })}
      {sections.map((s, i) => {
        const y = s.hogging ? yTop + 7 : yBot - 7
        const c = sx(s.x), half = (x1 - x0) * (s.hogging ? 0.16 : 0.3)
        const xa = Math.max(x0 + 3, c - half), xb = Math.min(x1 - 3, c + half)
        return (
          <g key={i}>
            <line x1={xa} y1={y} x2={xb} y2={y} stroke="#dc2626" strokeWidth={2} />
            <text x={(xa + xb) / 2} y={s.hogging ? y - 3 : y + 9} fontSize={8.5} fill="#dc2626" textAnchor="middle">
              {s.design.bars}⌀ {s.hogging ? 'top' : 'bot'}
            </text>
          </g>
        )
      })}
      <DimBelow xA={x0} xB={x1} featY={yBot} dY={dimY} label={`L = ${L} m`} />
      <DimSide yA={yTop} yB={yBot} featX={x0} dX={x0 - 16} label={`h = ${h}`} side="left" />
    </svg>
  )
}

/** Rebar elevation of a column, drawn to scale (height ∝ Lh, width ∝ b), with
 *  longitudinal bars, ties at spacing and dimension lines. viewBox width
 *  matches ColumnSchematic (320) so its text matches the section below it. */
export function ColumnElevation({ Lh, b, barDia, tieDia, bars, tieSpacing }: { Lh: number; b: number; barDia: number; tieDia: number; bars: number; tieSpacing: number }): ReactNode {
  const W = 320, top = 24, availH = 230
  const scl = availH / Math.max(Lh, 0.5)                 // px per metre
  const colW = Math.max(30, (b / 1000) * scl)            // to scale with height
  const cx = W * 0.46, x0 = cx - colW / 2, x1 = cx + colW / 2, y0 = top, y1 = top + availH
  const dimY = y1 + 20, H = dimY + 16
  const sm = tieSpacing / 1000
  const n = sm > 0 ? Math.min(40, Math.max(2, Math.round(Lh / sm))) : 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={12} y={14} fontSize={11} fontWeight={700} fill="#0f4c92">ELEVATION — {bars}⌀{barDia} · ties ⌀{tieDia} @{Math.round(tieSpacing)} mm</text>
      <rect x={x0} y={y0} width={colW} height={availH} fill="#fff" stroke="#37526e" strokeWidth={1.4} />
      <line x1={x0 + 6} y1={y0} x2={x0 + 6} y2={y1} stroke="#dc2626" strokeWidth={1.6} />
      <line x1={x1 - 6} y1={y0} x2={x1 - 6} y2={y1} stroke="#dc2626" strokeWidth={1.6} />
      {Array.from({ length: n + 1 }, (_, k) => {
        const y = y0 + (availH * k) / n
        return <line key={k} x1={x0 + 3} y1={y} x2={x1 - 3} y2={y} stroke="#94a3b8" strokeWidth={0.7} />
      })}
      <DimSide yA={y0} yB={y1} featX={x0} dX={x0 - 14} label={`H = ${Lh} m`} side="left" />
      <DimBelow xA={x0} xB={x1} featY={y1} dY={dimY} label={`b = ${b} mm`} />
    </svg>
  )
}

/** W-shape cross-section SVG: top flange + web + bottom flange, scaled to fit
 *  a fixed viewbox so all dimensions are labelled. d/bf/tf/tw all in mm. */
export function WShapeSection({ shape, d, bf, tf, tw }: { shape: string; d: number; bf: number; tf: number; tw: number }): ReactNode {
  const VW = 200, VH = 200
  const pad = 28          // room for labels
  const scale = Math.min((VW - pad * 2) / bf, (VH - pad * 2) / d)
  const sw = bf * scale   // scaled width
  const sh = d * scale    // scaled height
  const stf = tf * scale  // flange thickness
  const stw = tw * scale  // web thickness
  const x0 = (VW - sw) / 2, y0 = (VH - sh) / 2
  const webX = (VW - stw) / 2
  const textStyle = { fontSize: 9, fontFamily: 'Arial, sans-serif', fill: '#334155' }
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} xmlns="http://www.w3.org/2000/svg"
      style={{ width: 200, height: 200 }}>
      {/* label */}
      <text x={VW / 2} y={10} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0f4c92" fontFamily="Arial, sans-serif">{shape}</text>
      {/* top flange */}
      <rect x={x0} y={y0} width={sw} height={stf} fill="#bfdbfe" stroke="#0f4c92" strokeWidth={0.8} />
      {/* web */}
      <rect x={webX} y={y0 + stf} width={stw} height={sh - 2 * stf} fill="#dbeafe" stroke="#0f4c92" strokeWidth={0.8} />
      {/* bottom flange */}
      <rect x={x0} y={y0 + sh - stf} width={sw} height={stf} fill="#bfdbfe" stroke="#0f4c92" strokeWidth={0.8} />
      {/* bf dim arrow */}
      <line x1={x0} y1={VH - 10} x2={x0 + sw} y2={VH - 10} stroke="#64748b" strokeWidth={0.8} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text x={VW / 2} y={VH - 2} textAnchor="middle" {...textStyle}>bf={Math.round(bf)} mm</text>
      {/* d dim arrow */}
      <line x1={VW - 10} y1={y0} x2={VW - 10} y2={y0 + sh} stroke="#64748b" strokeWidth={0.8} />
      <text x={VW - 2} y={(y0 + y0 + sh) / 2} textAnchor="middle" {...textStyle} transform={`rotate(-90,${VW - 2},${(y0 + y0 + sh) / 2})`}>d={Math.round(d)} mm</text>
      {/* tf label */}
      <text x={x0 - 2} y={y0 + stf / 2 + 3} textAnchor="end" {...textStyle}>tf={tf.toFixed(1)} mm</text>
      {/* tw label */}
      <text x={webX - 2} y={(VH) / 2 + 3} textAnchor="end" {...textStyle}>tw={tw.toFixed(1)} mm</text>
      {/* arrow marker def */}
      <defs>
        <marker id="arr" markerWidth={4} markerHeight={4} refX={2} refY={2} orient="auto">
          <path d="M4,0 L0,2 L4,4" fill="none" stroke="#64748b" strokeWidth={0.8} />
        </marker>
      </defs>
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
