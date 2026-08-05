import { useMemo, useState, type ReactNode } from 'react'
import { designSquareFooting } from '../engine/isolatedFooting'
import {
  optimizeFootingRebar, optimizeRectFootingRebar, optimizeEccentricFootingRebar,
} from '../engine/matRebarOptimize'
import { RebarRanking } from '../components/RebarRanking'
import { buildRebarSelectionSolution, withRebarSelection } from '../lib/rebarSolution'
import { nameMat } from '../lib/rebarLabel'
// The page used to carry its own byte-identical copy of this input.
import { Num as NumField } from '../components/qty'
import { designRectangularFooting } from '../engine/rectangularFooting'
import { designEccentricSquareFooting } from '../engine/eccentricFooting'
import { netBearing } from '../engine/bearing'
import { factoredLoad } from '../engine/loads'
import type { ColumnPosition } from '../engine/shear'
import { FootingSchematic } from '../components/FootingSchematic'
import { ExcelImport } from '../components/ExcelImport'
import type { BatchResult } from '../lib/foundationExcel'
import { WorkedSolution } from '../components/WorkedSolution'
import { buildFoundationSolution, type SolutionCtx } from '../lib/foundationSolution'
import { Math } from '../lib/math'
import { PageHeader, CalcSection, VerdictPanel, DrawingCard, LetterheadCard, PrintReport, type LetterheadState } from '../components/calc'
import { initialLetterhead } from '../lib/letterhead'
import { f0, f2, f3 } from '../lib/format'
import 'katex/dist/katex.min.css'

type FootingType = 'square' | 'rectangular'
type SizingMode = 'ratio' | 'fixedWidth'
type LoadingType = 'concentric' | 'eccentric'
type AnalysisMethod = 'design' | 'analyze'
type SolutionMethod = 'iteration' | 'approximate'
type LoadInput = 'direct' | 'individual'
type ColumnShape = 'square' | 'rectangular' | 'circular'

interface FormState {
  footingType: FootingType
  loadingType: LoadingType
  analysisMethod: AnalysisMethod
  solutionMethod: SolutionMethod
  givenB: number
  givenBy: number
  givenDc: number
  columnShape: ColumnShape
  sizingMode: SizingMode
  ratio: number
  fixedBy: number
  loadInput: LoadInput
  deadLoad: number
  liveLoad: number
  serviceLoad: number
  ultimateLoad: number
  serviceMoment: number
  ultimateMoment: number
  columnWidth: number
  columnWidthY: number
  fc: number
  fy: number
  qAllow: number
  gammaSoil: number
  gammaConc: number
  H: number
  barDia: number
  cover: number
  surcharge: number
  position: ColumnPosition
}

const DEFAULTS: FormState = {
  footingType: 'square',
  loadingType: 'concentric',
  analysisMethod: 'design',
  solutionMethod: 'iteration',
  givenB: 2,
  givenBy: 2,
  givenDc: 500,
  columnShape: 'square',
  sizingMode: 'ratio',
  ratio: 1.5,
  fixedBy: 2,
  loadInput: 'direct',
  deadLoad: 600,
  liveLoad: 400,
  serviceLoad: 1000,
  ultimateLoad: 1400,
  serviceMoment: 150,
  ultimateMoment: 210,
  columnWidth: 400,
  columnWidthY: 400,
  fc: 28,
  fy: 415,
  qAllow: 200,
  gammaSoil: 18,
  gammaConc: 24,
  H: 1.5,
  barDia: 20,
  cover: 75,
  surcharge: 0,
  position: 'interior',
}

interface DirSteel { As: number; bars: number; spacing: number; usedMin: boolean; rho: number }
interface View {
  type: FootingType
  loading: LoadingType
  analysis: AnalysisMethod; method: SolutionMethod
  Bx: number; By: number; Dc: number; qNet: number; qu: number
  dPunch: number; dBeamLong: number; dBeamShort: number; dProvided: number
  punchOK: boolean; beamOK: boolean
  long: DirSteel
  short: (DirSteel & { bandBars: number; bandFraction: number }) | null
  ecc: { e: number; qMax: number; qMin: number; kernOK: boolean } | null
}


function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="text-[13px]">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

const SECTION_META: Record<string, { num: string; hint: string }> = {
  'Footing': { num: '01', hint: 'geometry & method' },
  'Loads & Column': { num: '02', hint: 'P = service, Pu = factored' },
  'Materials': { num: '03', hint: 'concrete & rebar' },
  'Soil & Geometry': { num: '04', hint: 'allowable bearing' },
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  const meta = SECTION_META[title] ?? { num: '··', hint: '' }
  return <CalcSection num={meta.num} title={title} hint={meta.hint}>{children}</CalcSection>
}

function Row({ label, value, check }: { label: ReactNode; value: ReactNode; check?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#f3f1ea] py-1.5 last:border-0">
      <span className="text-[12px] text-[#5c6675]">{label}</span>
      <span className="text-right font-mono text-[12.5px] font-semibold text-[#0f1b2a]">{value}</span>
      {check ? <span className="w-32 text-right text-[10.5px] text-[#a39d8d]">{check}</span> : null}
    </div>
  )
}

function steelRow(label: ReactNode, s: DirSteel, db: number) {
  return (
    <Row label={label} value={`${s.bars} ⌀${db} mm @ ${f0(s.spacing)} mm`}
      check={`As=${f0(s.As)} mm² · ${s.usedMin ? 'ρ_min' : `ρ=${s.rho.toFixed(4)}`}`} />
  )
}

export default function FoundationDesign() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [lh, setLh] = useState<LetterheadState>(() => initialLetterhead('F-01 · Rev A'))
  const [batch, setBatch] = useState<BatchResult | null>(null)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))
  const ecc = form.loadingType === 'eccentric'
  const rect = form.footingType === 'rectangular' && !ecc   // eccentric pilot is square-only
  const analyze = form.analysisMethod === 'analyze'
  // Circular columns use the legacy equivalent-square width c_eq = D·√(π/4).
  // (globalThis.Math: the KaTeX <Math> import shadows the global in this file.)
  const circular = form.columnShape === 'circular'
  const rectCol = form.columnShape === 'rectangular'
  const colWidth = circular ? form.columnWidth * globalThis.Math.sqrt(globalThis.Math.PI / 4) : form.columnWidth
  const colWidthY = rectCol ? form.columnWidthY : colWidth

  const qNetTrial = useMemo(
    () => netBearing({ qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc, H: form.H, Dc: 0.25, surcharge: form.surcharge }),
    [form.qAllow, form.gammaSoil, form.gammaConc, form.H, form.surcharge],
  )
  const sizingOk = analyze || !rect || (form.sizingMode === 'ratio' ? form.ratio >= 1 : form.fixedBy > 0)
  const analyzeOk = !analyze || (form.givenB > 0 && form.givenDc > 0 && (!rect || form.givenBy > 0))
  const valid = Object.values(form).every((v) => typeof v === 'string' || Number.isFinite(v as number)) && qNetTrial > 0 && sizingOk && analyzeOk

  // Effective loads: entered directly, or derived from DL & LL
  // (P = D + L, Pu = max(1.4D, 1.2D + 1.6L)).
  const individual = form.loadInput === 'individual'
  const serviceLoad = individual ? form.deadLoad + form.liveLoad : form.serviceLoad
  const ultimateLoad = individual ? factoredLoad({ dead: form.deadLoad, live: form.liveLoad }) : form.ultimateLoad

  // ── Mat selection ────────────────────────────────────────────────────
  // All three shapes now. The rectangular and eccentric paths used to keep
  // the ⌀ field because the optimiser only covered the concentric square one.
  const [autoBar, setAutoBar] = useState(true)
  const matChoice = useMemo(() => {
    if (!autoBar || !valid) return null
    const common = {
      serviceLoad, ultimateLoad, columnWidth: colWidth, columnWidthY: colWidthY,
      fc: form.fc, fy: form.fy, qAllow: form.qAllow, gammaSoil: form.gammaSoil,
      gammaConc: form.gammaConc, H: form.H, barDia: form.barDia, cover: form.cover,
      surcharge: form.surcharge, position: form.position,
      analysis: form.analysisMethod, solutionMethod: form.solutionMethod,
    }
    try {
      if (ecc) {
        return optimizeEccentricFootingRebar({
          ...common, givenB: form.givenB, givenDc: form.givenDc,
          serviceMoment: form.serviceMoment, ultimateMoment: form.ultimateMoment,
        })
      }
      if (rect) {
        const sizing = form.sizingMode === 'ratio'
          ? { mode: 'ratio' as const, ratio: form.ratio }
          : { mode: 'fixedWidth' as const, By: form.fixedBy }
        return optimizeRectFootingRebar({
          ...common, sizing, givenBx: form.givenB, givenBy: form.givenBy, givenDc: form.givenDc,
        })
      }
      return optimizeFootingRebar({ ...common, givenB: form.givenB, givenDc: form.givenDc })
    } catch { return null }
  }, [autoBar, valid, rect, ecc, serviceLoad, ultimateLoad, colWidth, colWidthY, form])

  /** The diameter actually detailed. */
  const dbEff = matChoice?.db ?? form.barDia

  const viewRaw: View | null = useMemo(() => {
    if (!valid) return null
    const common = {
      serviceLoad, ultimateLoad, columnWidth: colWidth, columnWidthY: colWidthY,
      fc: form.fc, fy: form.fy, qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc,
      H: form.H, barDia: dbEff, cover: form.cover, surcharge: form.surcharge, position: form.position,
    }
    const methods = {
      analysis: form.analysisMethod, solutionMethod: form.solutionMethod,
      givenB: form.givenB, givenDc: form.givenDc,
    }
    if (ecc) {
      const r = designEccentricSquareFooting({
        ...common, ...methods, serviceMoment: form.serviceMoment, ultimateMoment: form.ultimateMoment,
      })
      return {
        type: 'square', loading: 'eccentric', analysis: r.analysis, method: r.method,
        Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.quMax,
        dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam, dProvided: r.dProvided,
        punchOK: r.punchOK, beamOK: r.beamOK && r.bearingOK,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho },
        short: null,
        ecc: { e: r.e, qMax: r.qMaxService, qMin: r.qMinService, kernOK: r.kernOK },
      }
    }
    if (!rect) {
      const r = designSquareFooting({ ...common, ...methods })
      return {
        type: 'square', loading: 'concentric', analysis: r.analysis, method: r.method,
        Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
        dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam, dProvided: r.dProvided,
        punchOK: r.punchOK, beamOK: r.beamOK,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho },
        short: null, ecc: null,
      }
    }
    const sizing = form.sizingMode === 'ratio'
      ? { mode: 'ratio' as const, ratio: form.ratio }
      : { mode: 'fixedWidth' as const, By: form.fixedBy }
    const r = designRectangularFooting({
      ...common, sizing, ...methods, givenBx: form.givenB, givenBy: form.givenBy,
    })
    return {
      type: 'rectangular', loading: 'concentric', analysis: r.analysis, method: r.method,
      Bx: r.Bx, By: r.By, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
      dPunch: r.dPunch, dBeamLong: r.dBeamLong, dBeamShort: r.dBeamShort, dProvided: r.dProvided,
      punchOK: r.punchOK, beamOK: r.beamOK,
      long: r.long, short: r.short, ecc: null,
    }
  }, [form, dbEff, valid, rect, ecc, serviceLoad, ultimateLoad, colWidth, colWidthY])

  // The mat is drawn on a spacing module, so the adopted spacing — not the
  // count that falls out of As/Ab — is what goes on the schedule.
  const view: View | null = useMemo(() => {
    if (!viewRaw || !matChoice?.bars || !matChoice.spacing) return viewRaw
    // Each direction takes its OWN adopted mat. A rectangular footing carries
    // different steel each way, so quoting the governing strip's spacing on
    // both over-provides the lighter one.
    const at = (label: string) => matChoice.strips.find((x) => x.label === label)
    const long = at('long direction') ?? at('bottom mat')
    const short = at('short direction')
    return {
      ...viewRaw,
      long: long ? { ...viewRaw.long, bars: long.bars, spacing: long.spacing } : viewRaw.long,
      short: viewRaw.short && short
        ? { ...viewRaw.short, bars: short.bars, spacing: short.spacing }
        : viewRaw.short,
    }
  }, [viewRaw, matChoice])

  const solutionSteps = useMemo(() => {
    if (!view) return null
    const ctx: SolutionCtx = {
      type: view.type, loading: view.loading, analysis: view.analysis, method: view.method,
      serviceLoad, ultimateLoad,
      loads: individual ? { dead: form.deadLoad, live: form.liveLoad } : null,
      serviceMoment: form.serviceMoment, ultimateMoment: form.ultimateMoment,
      columnWidth: colWidth, columnWidthY: colWidthY, fc: form.fc, fy: form.fy,
      column: circular ? { shape: 'circular' as const, dia: form.columnWidth } : null,
      qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc, H: form.H,
      barDia: dbEff, cover: form.cover, surcharge: form.surcharge, position: form.position,
      Bx: view.Bx, By: view.By, Dc: view.Dc, qNet: view.qNet, qu: view.qu,
      dPunch: view.dPunch, dBeamLong: view.dBeamLong, dBeamShort: view.dBeamShort, dProvided: view.dProvided,
      punchOK: view.punchOK, beamOK: view.beamOK,
      long: view.long, short: view.short, ecc: view.ecc,
    }
    return withRebarSelection(
      buildFoundationSolution(ctx),
      matChoice ? buildRebarSelectionSolution(matChoice.selection, 'mat') : [],
    )
  }, [view, form, dbEff, matChoice, serviceLoad, ultimateLoad, individual, circular, colWidth, colWidthY])

  // Verdict data — presentation of engine outputs only: utilization is the
  // required-over-provided effective depth per shear mode (capacity grows with
  // d, so this is the honest "how close to the limit" bar for the report).
  const punchRatio = view ? view.dPunch / view.dProvided : 0
  const beamRatio = view ? globalThis.Math.max(view.dBeamLong, view.dBeamShort) / view.dProvided : 0
  const allOK = !!view && view.punchOK && view.beamOK && (!view.ecc || view.ecc.kernOK)
  const governing = punchRatio >= beamRatio ? 'two-way punching shear' : 'one-way beam shear'

  return (
    <div>
      <PageHeader title="Isolated Footing" badges={['ACI 318-14', 'NSCP 2015']}
        actions={
          <button type="button" onClick={() => { const prev = document.title; document.title = `Foundation Design Report${lh.project ? ` — ${lh.project}` : ''}`; window.print(); window.setTimeout(() => { document.title = prev }, 500) }}
            className="inline-flex items-center gap-2 rounded-md bg-[#0f4c92] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#0d3f78]">
            ⎙ Export report
          </button>
        } />
        <div className="no-print mx-auto max-w-[1500px] px-5 pt-5 sm:px-7"><LetterheadCard lh={lh} onChange={(patch) => setLh((v) => ({ ...v, ...patch }))} /></div>
        {view && solutionSteps && (
          <PrintReport
            docTitle="Isolated Footing" docCode="F-01" badges={['ACI 318-14', 'NSCP 2015']}
            ok={allOK} governing={`Governing: ${governing} · ${globalThis.Math.max(punchRatio, beamRatio).toFixed(2)}`}
            lh={lh}
            stats={[
              { label: 'Plan size', value: `${f2(view.Bx)} × ${f2(view.By)}`, unit: 'm' },
              { label: 'Thickness Dc', value: f0(view.Dc), unit: 'mm' },
              { label: view.type === 'square' ? 'Steel each way' : 'Steel — long', value: `${view.long.bars}-⌀${dbEff}`, unit: `@${f0(view.long.spacing)}` },
            ]}
            checks={[
              { name: 'Two-way (punching) shear — d req/prov', ratio: punchRatio, ok: view.punchOK },
              { name: 'One-way (beam) shear — d req/prov', ratio: beamRatio, ok: view.beamOK },
            ]}
            data={[
              ['Service load P', `${f0(serviceLoad)} kN`], ['Ultimate load Pu', `${f0(ultimateLoad)} kN`],
              ["Concrete f'c", `${form.fc} MPa`], ['Steel fy', `${form.fy} MPa`],
              ['Column width c', `${f0(colWidth)} mm (${form.position})`], ['Bar diameter db', `⌀${dbEff} mm`],
              ['Allowable bearing qa', `${form.qAllow} kPa`], ['Clear cover', `${form.cover} mm`],
              ['Unit weight, soil γs', `${form.gammaSoil} kN/m³`], ['Unit weight, concrete γc', `${form.gammaConc} kN/m³`],
              ['Total depth H', `${f2(form.H)} m`], ['Surcharge', `${form.surcharge} kPa`],
            ]}
            steps={solutionSteps}
            drawingTitle="Isolated Footing"
            drawing={<FootingSchematic Bx={view.Bx} By={view.By} Dc={view.Dc} columnWidth={colWidth} H={form.H} />}
          />
        )}
      <div className="mx-auto max-w-[1500px] px-5 pb-8 sm:px-7">
      <div className="no-print"><ExcelImport onResult={setBatch} /></div>

      {batch && (
        <div className="no-print mt-4 overflow-hidden rounded-lg border border-[#e3e1da] bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
            <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">
              Batch schedule <span className="text-sm font-normal text-slate-500">({batch.designed}/{batch.rows.length} designed)</span>
            </h2>
            <button type="button" onClick={() => setBatch(null)} className="no-print text-xs text-slate-500 hover:text-slate-700 hover:underline">Clear</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-semibold">Label</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Plan</th>
                  <th className="px-4 py-2 font-semibold">Dc</th>
                  <th className="px-4 py-2 font-semibold">Reinforcement</th>
                  <th className="px-4 py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-100 ${r.ok ? '' : 'bg-red-50/60'}`}>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.ok ? '✓' : '✗'} {r.label}</td>
                    <td className="px-4 py-2 text-slate-600">{r.type}</td>
                    <td className="px-4 py-2 text-slate-800">{r.size}</td>
                    <td className="px-4 py-2 text-slate-800">{r.thickness}</td>
                    <td className="px-4 py-2 text-slate-800">{r.steel}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.unknownHeaders.length > 0 && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Ignored headers: {batch.unknownHeaders.join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="no-print mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        {/* ── Inputs ── */}
        <div className="space-y-3.5">
          <Card title="Footing">
            <Select label="Type" value={form.footingType} onChange={set('footingType')}
              options={[['square', 'Isolated Square'], ['rectangular', 'Isolated Rectangular']]} />
            <Select label="Loading" value={form.loadingType} onChange={set('loadingType')}
              options={[['concentric', 'Concentric'], ['eccentric', 'Eccentric (uniaxial)']]} />
            <Select label="Analysis method" value={form.analysisMethod} onChange={set('analysisMethod')}
              options={[['design', 'Detailed design'], ['analyze', 'Analyze given dimensions']]} />
            {!analyze && (
              <Select label="Solution method" value={form.solutionMethod} onChange={set('solutionMethod')}
                options={[['iteration', 'Iteration'], ['approximate', 'Approximate (initial Dc)']]} />
            )}
            {analyze && (
              <NumField label={rect ? 'Given Bx' : 'Given B'} unit="m" value={form.givenB} onChange={set('givenB')} />
            )}
            {analyze && rect && (
              <NumField label="Given By" unit="m" value={form.givenBy} onChange={set('givenBy')} />
            )}
            {analyze && (
              <NumField label="Given Dc" unit="mm" value={form.givenDc} onChange={set('givenDc')} />
            )}
            {rect && !analyze && (
              <Select label="Sizing" value={form.sizingMode} onChange={set('sizingMode')}
                options={[['ratio', 'By aspect ratio (Bx/By)'], ['fixedWidth', 'Fixed width By']]} />
            )}
            {rect && !analyze && form.sizingMode === 'ratio' && (
              <NumField label="Aspect Bx/By" value={form.ratio} onChange={set('ratio')} />
            )}
            {rect && !analyze && form.sizingMode === 'fixedWidth' && (
              <NumField label="Width By" unit="m" value={form.fixedBy} onChange={set('fixedBy')} />
            )}
            {ecc && (
              <p className="col-span-full text-xs text-slate-500">Eccentric is square-only in this pilot; the footing is sized to keep the load in the kern (no uplift).</p>
            )}
          </Card>

          <Card title="Loads & Column">
            <Select label="Load entry" value={form.loadInput} onChange={set('loadInput')}
              options={[['direct', 'Service & ultimate (P, Pu)'], ['individual', 'Individual loads (DL & LL)']]} />
            {individual ? (
              <>
                <NumField label={<>Dead <Math tex="D" /></>} unit="kN" value={form.deadLoad} onChange={set('deadLoad')} />
                <NumField label={<>Live <Math tex="L" /></>} unit="kN" value={form.liveLoad} onChange={set('liveLoad')} />
                <p className="col-span-full text-xs text-slate-500">
                  P = D + L = {f0(serviceLoad)} kN · Pu = max(1.4D, 1.2D+1.6L) = {f0(ultimateLoad)} kN
                </p>
              </>
            ) : (
              <>
                <NumField label={<Math tex="P" />} unit="kN" value={form.serviceLoad} onChange={set('serviceLoad')} />
                <NumField label={<Math tex="P_u" />} unit="kN" value={form.ultimateLoad} onChange={set('ultimateLoad')} />
              </>
            )}
            {ecc && <NumField label={<Math tex="M" />} unit="kN·m" value={form.serviceMoment} onChange={set('serviceMoment')} />}
            {ecc && <NumField label={<Math tex="M_u" />} unit="kN·m" value={form.ultimateMoment} onChange={set('ultimateMoment')} />}
            <Select label="Column shape" value={form.columnShape} onChange={set('columnShape')}
              options={[['square', 'Square'], ['rectangular', 'Rectangular'], ['circular', 'Circular (spiral)']]} />
            <NumField
              label={circular ? <>Column Ø <Math tex="D" /></> : rectCol ? <>Column <Math tex="c_x" /></> : <>Column <Math tex="c" /> (square)</>}
              unit="mm" value={form.columnWidth} onChange={set('columnWidth')} />
            {rectCol && (
              <NumField label={<>Column <Math tex="c_y" /></>} unit="mm" value={form.columnWidthY} onChange={set('columnWidthY')} />
            )}
            <Select label="Column position" value={form.position} onChange={set('position')}
              options={[['interior', 'Interior'], ['edge', 'Edge'], ['corner', 'Corner']]} />
            {circular && (
              <p className="col-span-full text-xs text-slate-500">
                Circular column → equivalent square c = D·√(π/4) = {f0(colWidth)} mm (equal area, legacy convention).
              </p>
            )}
            {rectCol && !rect && (
              <p className="col-span-full text-xs text-slate-500">
                Punching uses the full cx × cy perimeter (β = max/min); one-way shear & flexure use the smaller
                dimension (longer cantilever governs both ways on a square footing).
              </p>
            )}
          </Card>

          <Card title="Materials">
            {(
              <label className="col-span-full flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[#5c6675]">
                <input type="checkbox" checked={autoBar} onChange={(e) => setAutoBar(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0f4c92]" />
                Auto-select bar ⌀ and spacing
              </label>
            )}
            <NumField label={<Math tex="f'_c" />} unit="MPa" value={form.fc} onChange={set('fc')} />
            <NumField label={<Math tex="f_y" />} unit="MPa" value={form.fy} onChange={set('fy')} />
            <NumField label={<>Bar <Math tex="d_b" /></>} unit="mm" value={dbEff} onChange={set('barDia')}
              disabled={!!matChoice}
              hint={matChoice ? (matChoice.db ? 'chosen by the optimiser' : 'no compliant mat — see the ranking') : undefined} />
            <NumField label="Clear cover" unit="mm" value={form.cover} onChange={set('cover')} />
          </Card>

          <Card title="Soil & Geometry">
            <NumField label={<Math tex="q_a" />} unit="kPa" value={form.qAllow} onChange={set('qAllow')} />
            <NumField label={<Math tex="\gamma_{soil}" />} unit="kN/m³" value={form.gammaSoil} onChange={set('gammaSoil')} />
            <NumField label={<Math tex="\gamma_{conc}" />} unit="kN/m³" value={form.gammaConc} onChange={set('gammaConc')} />
            <NumField label={<>Total depth <Math tex="H" /></>} unit="m" value={form.H} onChange={set('H')} />
            <NumField label="Surcharge" unit="kPa" value={form.surcharge} onChange={set('surcharge')} />
          </Card>
          {matChoice && (
            <RebarRanking selection={matChoice.selection} title="Mat selection" name={nameMat} />
          )}
        </div>

        {/* ── Verdict rail ── */}
        <div className="space-y-3.5 lg:sticky lg:top-14 lg:self-start">
          {view && (
            <VerdictPanel
              ok={allOK}
              headline={allOK
                ? (view.analysis === 'analyze' ? 'SECTION OK — all checks pass' : 'DESIGN OK — all checks pass')
                : 'CHECK FAILED — section inadequate'}
              governing={`Governing: ${governing} · d req/prov ${globalThis.Math.max(punchRatio, beamRatio).toFixed(2)}`}
              stats={[
                { label: 'Plan size', value: view.type === 'square' ? `${f2(view.Bx)} × ${f2(view.By)}` : `${f2(view.Bx)} × ${f2(view.By)}`, unit: 'm' },
                { label: 'Thickness Dc', value: f0(view.Dc), unit: 'mm' },
                { label: view.type === 'square' ? 'Steel each way' : 'Steel — long', value: `${view.long.bars}-⌀${dbEff}`, unit: `@${f0(view.long.spacing)}` },
              ]}
              checks={[
                { name: 'Punching shear (d req / prov)', ratio: punchRatio },
                { name: 'Beam shear (d req / prov)', ratio: beamRatio },
              ]}
              footnote={view.long.usedMin
                ? 'Flexure: As,min = 0.0018·b·h governs (ρmin) — §24.4.3.2'
                : `Flexure: ρ = ${view.long.rho.toFixed(4)} — §24.4.3.2 satisfied`}
            />
          )}

          <DrawingCard pdfDrawing title="Drawing" meta="plan · section">
            {view ? (
              <FootingSchematic Bx={view.Bx} By={view.By} Dc={view.Dc} columnWidth={colWidth} H={form.H} />
            ) : (
              <p className="py-8 text-center text-sm text-[#a39d8d]">Enter valid inputs — net bearing must be positive.</p>
            )}
          </DrawingCard>

          {view && (
            <div className="rounded-lg border border-[#e3e1da] bg-white p-4">
              <h2 className="mb-2 text-[13.5px] font-bold text-[#0f1b2a]">Results</h2>
              {view.analysis === 'analyze' && (
                <Row label="Adequacy" value={view.punchOK && view.beamOK ? '✓ section OK' : '✗ inadequate in shear'}
                  check={`punching ${view.punchOK ? '✓' : '✗'} · beam ${view.beamOK ? '✓' : '✗'}`} />
              )}
              {view.analysis === 'design' && (
                <Row label="Method" value={view.method === 'iteration' ? 'Iteration' : 'Approximate'} />
              )}
              <Row label={<Math tex="q_{net}" />} value={`${f3(view.qNet)} kPa`} />
              <Row label="Footing size"
                value={view.type === 'square' ? `B = ${f2(view.Bx)} m` : `${f2(view.Bx)} × ${f2(view.By)} m`} />
              {view.ecc && (
                <>
                  <Row label={<>Eccentricity <Math tex="e = M/P" /></>} value={`${f3(view.ecc.e)} m`} check={`kern B/6 = ${f3(view.Bx / 6)} m`} />
                  <Row label={<Math tex="q_{max}/q_{min}" />} value={`${f2(view.ecc.qMax)} / ${f2(view.ecc.qMin)} kPa`}
                    check={view.ecc.kernOK ? '✓ no uplift, ≤ q_net' : '✗ check uplift'} />
                </>
              )}
              <Row label={view.ecc ? <Math tex="q_{u,max}" /> : <Math tex="q_u" />} value={`${f3(view.qu)} kPa`} />
              <Row label="Slab thickness Dc" value={`${f0(view.Dc)} mm`} />
              <Row label="d — punching"
                value={`${f0(view.dPunch)} mm`}
                check={view.type === 'square' ? `beam ${f0(view.dBeamLong)} mm` : `beam x/y ${f0(view.dBeamLong)}/${f0(view.dBeamShort)} mm`} />
              {view.type === 'square'
                ? steelRow('Steel (each way)', view.long, dbEff)
                : (
                  <>
                    {steelRow('Steel — long (x)', view.long, dbEff)}
                    {view.short && steelRow('Steel — short (y)', view.short, dbEff)}
                    {view.short && (
                      <Row label="Central band (short)"
                        value={`${view.short.bandBars} of ${view.short.bars} bars`}
                        check={`band ≈ ${(view.short.bandFraction * 100).toFixed(0)}% in By`} />
                    )}
                  </>
                )}
            </div>
          )}

        </div>
      </div>

      <div className="no-print">{solutionSteps && <WorkedSolution steps={solutionSteps} title="Calculation report — worked solution" />}</div>
      </div>
    </div>
  )
}
