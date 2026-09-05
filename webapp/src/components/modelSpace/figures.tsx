// ─────────────────────────────────────────────────────────────────────────
// SCHEDULE FIGURES — the drawings a schedule row expands into.
//
// These used to be little SVGs drawn from numbers: a rectangle scaled to the
// member, a ladder of evenly pitched ticks for the transverse steel, and a
// line or two standing for "the bars". Nothing in them came from the cage, so
// none of them could show a curtailment, a lap, a crank, or a spacing that
// changes along the member — and each was a second description of steel the
// drawing set already describes.
//
// So a row now expands into the SHEET. The beam's is its grid line's frame
// elevation, the column's is its own stack detail footing-to-roof, and both
// carry a wash over the stretch the row speaks for — which is what a schedule
// row adds over a link to the drawing. The sections are cuts through the same
// cages. `SheetFigure` paints any of them with the plan renderer, so what the
// accordion shows and what the Plans tab shows are one object.
//
// The two that remain pure geometry — the W-shape section and the §424.2
// serviceability read-out — are still just numbers.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, type ReactNode } from 'react'
import { planToSvg, type Drawing } from '../../engine/planRenderer'
import type { ColumnStackBundle, FrameElevationBundle } from '../../lib/planDetails'
import {
  beamSectionDrawing, columnSectionDrawing, beamElevationDrawing, columnElevationDrawing,
  type BeamRowSection, type SectionRect, type ColumnRow,
} from '../../lib/scheduleFigures'
import type { StructuralModel } from '../../engine/model'
import type { RebarCage } from '../../engine/rebarModel'
import { type MemberDeflectionResult } from '../../engine/memberDeflection'
import { f0, f1, f2 } from '../../lib/format'

export type { BeamRowSection, SectionRect, SectionRowDesign } from '../../lib/scheduleFigures'

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
 * An engine `Drawing`, painted with the plan renderer.
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
export function SheetFigure({ drawing, width = 300 }: { drawing: Drawing; width?: number }): ReactNode {
  const svg = useMemo(() => planToSvg(drawing, width), [drawing, width])
  // Engine-generated markup — every string in it comes from `planToSvg`, which
  // escapes the text it is given.
  return <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

/**
 * The SECTION figure in a beam's schedule row — cut through that beam's cage,
 * at the station the row is about. Decided in `scheduleFigures`, which is
 * where the PDF report gets the same cut with the same callout.
 */
export function BeamCageSection({ model, cages, beam, sec, rect }: {
  model: StructuralModel; cages: RebarCage[]
  beam: { id: string; L: number }; sec: BeamRowSection; rect: SectionRect
}): ReactNode {
  const drawing = useMemo(() => beamSectionDrawing(model, cages, beam, sec, rect),
    [model, cages, beam, sec, rect])
  if (!drawing) return null
  return <SheetFigure drawing={drawing} />
}

/**
 * The SECTION figure in a column's schedule row — cut at mid-height, which is
 * the length between the confinement zones and so the column's general section.
 */
export function ColumnCageSection({ model, cages, col, rect }: {
  model: StructuralModel; cages: RebarCage[]
  col: ColumnRow
  rect: SectionRect
}): ReactNode {
  const drawing = useMemo(() => columnSectionDrawing(model, cages, col, rect), [model, cages, col, rect])
  if (!drawing) return null
  return <SheetFigure drawing={drawing} />
}

/**
 * The beam's ELEVATION in its schedule row — the drawing set's own sheet for
 * the grid line and level it is on, with the stretch this row speaks for
 * washed over.
 *
 * What stood here was a compact figure of its own: a rectangle, a ladder of
 * evenly pitched ticks and two red lines standing for "top steel" and "bottom
 * steel". None of it was the cage — the ticks were `L / min(sAdopt)` and the
 * bar lines were fractions of the span — so it could not show a curtailment,
 * a lap, a crank at a column, or the change of stirrup pitch between the end
 * zone and the middle, all of which the sheet in the drawing set does show.
 *
 * The wash is the point of putting it in a schedule row rather than just
 * linking to the sheet: a row headed "End i" is about the steel over that
 * support, and on an elevation carrying three different arrangements there is
 * otherwise nothing to say which third is being discussed.
 */
export function BeamElevationFigure({ bundle, zone, label, width = 900 }: {
  bundle: FrameElevationBundle
  zone?: [number, number]
  label?: string
  width?: number
}): ReactNode {
  const drawing = useMemo(() => beamElevationDrawing(bundle, zone, label), [bundle, zone, label])
  return <SheetFigure drawing={drawing} width={width} />
}

/**
 * The column's ELEVATION in its schedule row — the drawing set's own sheet for
 * the whole column line, with the storey this row speaks for washed over.
 *
 * What stood here was a figure of its own: a rectangle scaled to one storey,
 * two red lines standing for "the bars", and a ladder of evenly pitched ticks
 * at L / tieSpacingFinal. None of it came from the cage, so it could not show
 * the confinement tightening at each end, the lap splice in the centre half of
 * the storey, the crank where the section steps, the dowels the column stands
 * on, or the joint hoops through the floor — all of which `columnStackDetail`
 * shows, because that one is drawn from the placed cages.
 *
 * It also could not show the COLUMN. A schedule row is one storey; the sheet
 * is footing to roof, which is the thing that gets built. The wash is what
 * keeps the row's own subject legible on it.
 */
export function ColumnElevationFigure({ bundle, storey, label, width = 320 }: {
  bundle: ColumnStackBundle
  storey?: { yBot: number; yTop: number }
  label?: string
  width?: number
}): ReactNode {
  const drawing = useMemo(() => columnElevationDrawing(bundle, storey, label), [bundle, storey, label])
  return <SheetFigure drawing={drawing} width={width} />
}

/** W-shape cross-section: top flange + web + bottom flange, scaled to fit a
 *  fixed viewbox so every dimension is labelled. d/bf/tf/tw all in mm. A rolled
 *  section has no cage, so this one really is a drawing from numbers. */
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
