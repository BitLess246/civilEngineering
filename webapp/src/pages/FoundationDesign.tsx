import { useMemo, useState } from 'react'
import { designSquareFooting, columnOffset, type ColumnOffset } from '../engine/isolatedFooting'
import type { AsMinBasis } from '../engine/flexure'
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
import { MIN_FOOTING_DEPTH, type ColumnPosition } from '../engine/shear'
import { FootingSchematic } from '../components/FootingSchematic'
import { Diagram } from '../components/Diagram'
import { DIAGRAM_GRID } from '../lib/diagramLabel'
import { stripSamples, type StripSamples } from '../lib/footingDiagrams'
import { ExcelImport } from '../components/ExcelImport'
import type { BatchResult } from '../lib/foundationExcel'
import { buildFoundationSolution, type SolutionCtx } from '../lib/foundationSolution'
import { Math } from '../lib/math'
import { InputGroup, CheckCard, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { ModelMemberResults } from '../components/ModelMemberResults'
import type { MemberLoadRequest } from '../lib/modelMemberResults'
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
  asMinBasis: AsMinBasis
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
  asMinBasis: 'max',
}

interface DirSteel {
  As: number; bars: number; spacing: number; usedMin: boolean; rho: number
  /** Both minimum-steel candidates and which was larger, for the solution sheet. */
  minGoverning?: 'beam' | 'slab'; asMinBeam?: number; asMinSlab?: number
}
interface View {
  type: FootingType
  loading: LoadingType
  analysis: AnalysisMethod; method: SolutionMethod
  Bx: number; By: number; Dc: number; qNet: number; qu: number
  dPunch: number; dBeamLong: number; dBeamShort: number; dProvided: number
  punchOK: boolean; beamOK: boolean
  /** §413.3.1.2: d ≥ 150 mm over the bottom mat. */
  minDepthOK: boolean
  long: DirSteel
  short: (DirSteel & { bandBars: number; bandFraction: number }) | null
  ecc: { e: number; qMax: number; qMin: number; kernOK: boolean } | null
  /** Property-line geometry when the column is at a free edge — null otherwise. */
  offset: ColumnOffset | null
}


function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="text-[13px]">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

export default function FoundationDesign() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
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
      surcharge: form.surcharge, position: form.position, asMinBasis: form.asMinBasis,
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
      H: form.H, barDia: dbEff, cover: form.cover, surcharge: form.surcharge, position: form.position, asMinBasis: form.asMinBasis,
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
        punchOK: r.punchOK, beamOK: r.beamOK && r.bearingOK, minDepthOK: r.minDepthOK,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho,
          minGoverning: r.minGoverning, asMinBeam: r.asMinBeam, asMinSlab: r.asMinSlab },
        short: null,
        ecc: { e: r.e, qMax: r.qMaxService, qMin: r.qMinService, kernOK: r.kernOK },
        // The applied-moment eccentricity and the geometric one are separate
        // facts; the drawing shows the pad's own offset when there is one.
        offset: columnOffset({ serviceLoad, columnWidth: colWidth, columnWidthY: colWidthY, position: form.position }, r.B),
      }
    }
    if (!rect) {
      const r = designSquareFooting({ ...common, ...methods })
      return {
        type: 'square', loading: 'concentric', analysis: r.analysis, method: r.method,
        Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
        dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam, dProvided: r.dProvided,
        punchOK: r.punchOK, beamOK: r.beamOK, minDepthOK: r.minDepthOK,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho,
          minGoverning: r.minGoverning, asMinBeam: r.asMinBeam, asMinSlab: r.asMinSlab },
        short: null, ecc: null, offset: r.offset,
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
      punchOK: r.punchOK, beamOK: r.beamOK, minDepthOK: r.minDepthOK,
      long: r.long, short: r.short, ecc: null,
      // The rectangular and eccentric paths do not carry the property-line
      // geometry yet; `columnOffset` is a pure function of B and c, so it is
      // derived here rather than left absent and silently drawn centred.
      offset: columnOffset({ serviceLoad, columnWidth: colWidth, columnWidthY: colWidthY, position: form.position }, r.Bx, colWidthY, r.By),
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
      barDia: dbEff, cover: form.cover, surcharge: form.surcharge, position: form.position, asMinBasis: form.asMinBasis,
      Bx: view.Bx, By: view.By, Dc: view.Dc, qNet: view.qNet, qu: view.qu,
      dPunch: view.dPunch, dBeamLong: view.dBeamLong, dBeamShort: view.dBeamShort, dProvided: view.dProvided,
      punchOK: view.punchOK, beamOK: view.beamOK, minDepthOK: view.minDepthOK,
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
  // A pad whose resultant leaves the kern is not an OK design however its
  // shear checks land — it lifts off the soil. The banner used to read
  // "DESIGN OK — all checks pass" beside a drawing showing uplift.
  const allOK = !!view && view.punchOK && view.beamOK && view.minDepthOK
    && (!view.ecc || view.ecc.kernOK) && (!view.offset || view.offset.kernOK)
  const governing = punchRatio >= beamRatio ? 'two-way punching shear' : 'one-way beam shear'

  /** Saved-model pad → the page's own fields. The pad's adopted B and Dc are
   *  checked as-given (analyze mode — the schedule's pad is a fact, not a
   *  suggestion), the column's loads are direct, and the soil is the
   *  project's own — so the page re-derives the schedule's checks. */
  const loadSaved = (req: MemberLoadRequest) => {
    const f = req.design.footings.find((x) => x.node === req.id)
    const sec = req.section
    if (!f || !sec) return
    setAutoBar(false)
    setForm((s) => ({
      ...s,
      footingType: 'square', loadingType: 'concentric', analysisMethod: 'analyze',
      solutionMethod: 'iteration', columnShape: 'square',
      givenB: f.design.B, givenDc: f.design.Dc,
      columnWidth: sec.b, columnWidthY: sec.h,
      loadInput: 'direct', serviceLoad: f.P, ultimateLoad: f.Pu,
      fc: sec.fc, fy: sec.fy,
      qAllow: req.soil.qAllow, gammaSoil: req.soil.gammaSoil, gammaConc: req.soil.gammaConc, H: req.soil.H,
      barDia: f.barDia, surcharge: 0, position: 'interior',
    }))
  }

  const kern = view?.offset ?? null

  // ── The design strip's diagrams ────────────────────────────────────
  // Built on the SAME model the checks quote: the factored net pressure qu
  // uniform on the design strip (the strip the flexure step designs — long:
  // By wide; short: Bx wide), the column load spread over its footprint.
  // The marks are the stations the sheet closes on: the §22.5 one-way
  // sections at d beyond each face, and the faces where Mu is taken. A
  // diagram on any other pressure would disagree with the sheet beside it.
  const strips: { axis: string; s: StripSamples; qu: number; dProvided: number; eccentric: boolean }[] | null =
    useMemo(() => {
      if (!view) return null
      const mk = (axis: string, L: number, stripW: number, cM: number) => ({
        axis,
        s: stripSamples({ L, stripW, qu: view.qu, Pu: ultimateLoad, c: cM, d: view.dProvided }),
        qu: view.qu, dProvided: view.dProvided, eccentric: view.loading === 'eccentric',
      })
      if (view.type !== 'rectangular') {
        // Square (and the eccentric pilot, square-only): one strip, the
        // smaller column dimension giving the governing cantilever — the
        // arm the engine itself sized the mat on.
        const c = globalThis.Math.min(colWidth, colWidthY) / 1000
        return [mk(ecc ? 'along the eccentricity (x)' : 'long (x)', view.Bx, view.By, c)]
      }
      return [
        mk('long (x) — strip By', view.Bx, view.By, colWidth / 1000),
        mk('short (y) — strip Bx', view.By, view.Bx, colWidthY / 1000),
      ]
    }, [view, ultimateLoad, colWidth, colWidthY, ecc])

  const diagramSections = (strips ?? []).map((st) => ({
    title: `Pressure, shear and moment — ${st.axis}`,
    node: (
      <div>
        <p className="mb-2 text-xs text-muted">
          The design strip on the factored net pressure q<sub>u</sub> = {f2(st.qu)} kPa — the pressure the
          checks quote, uniform over the strip the flexure step designs. The column load is spread over its
          footprint; marks show the column faces, where M<sub>u</sub> is taken (§13.2.7.1), and the §22.5
          one-way sections at d = {f0(st.dProvided)} mm beyond them.{st.eccentric
            ? ' The eccentric design acts on the peak pressure qu,max — the service trapezoid is drawn on the section.'
            : ''}
        </p>
        <div className={DIAGRAM_GRID}>
          <div data-pdf-figure data-figure-title={`SOIL PRESSURE (w) — ${st.axis.toUpperCase()}`}>
            <Diagram xs={st.s.x} ys={st.s.w} title={`SOIL PRESSURE (w) — ${st.axis.toUpperCase()}`}
              unit="kN/m" color="#16a34a" markExtrema={false} decimals={1} />
          </div>
          <div data-pdf-figure data-figure-title={`SHEAR (Vu) — ${st.axis.toUpperCase()}`}>
            <Diagram xs={st.s.x} ys={st.s.V} title={`SHEAR (Vu) — ${st.axis.toUpperCase()}`}
              unit="kN" color="#dc2626" markExtrema={false} decimals={0}
              vlines={st.s.crits
                ? [{ x: st.s.crits[0], label: 'crit @ d' }, { x: st.s.crits[1], label: 'crit @ d' }]
                : []} />
          </div>
          <div data-pdf-figure data-figure-title={`MOMENT (Mu) — ${st.axis.toUpperCase()}`}>
            <Diagram xs={st.s.x} ys={st.s.M} title={`MOMENT (Mu) — ${st.axis.toUpperCase()}`}
              unit="kN·m" color="#0056b3" markExtrema={false} decimals={0}
              vlines={[{ x: st.s.faces[0], label: 'col face' }, { x: st.s.faces[1], label: 'col face' }]} />
          </div>
        </div>
      </div>
    ),
  }))

  const steelRow = (label: string, st: DirSteel): ResultRow => ({
    check: label, basis: st.usedMin ? `minimum (${st.minGoverning === 'slab' ? '§24.4.3.2' : '§9.6.1.2'})` : `ρ ${st.rho.toFixed(4)}`,
    demand: `As ${f0(st.As)} mm²`, limit: `${st.bars} ⌀${dbEff} @ ${f0(st.spacing)} mm`, status: 'info',
  })
  const caption = view
    ? kern && !kern.kernOK
      ? `Column flush with the ${form.position === 'corner' ? 'two free edges' : 'free edge'}: the load sits ${kern.e.toFixed(2)} m off the pad centroid — e_x/B + e_y/L is ${(kern.kernRatio / 6).toFixed(3)} against the 1/6 the kern allows, so part of the base lifts. A pad cannot be sized out of this — the offset grows with B. Tie it to an interior footing with a strap taking ${f0(kern.restraint)} kN·m, or use a combined footing.`
      : view.long.usedMin
        ? `Flexure: minimum steel governs — ${view.long.minGoverning === 'slab' ? '§24.4.3.2 shrinkage on b·h' : '§9.6.1.2 flexural on b·d'}.`
        : `Flexure: ρ = ${view.long.rho.toFixed(4)}.`
    : undefined
  const report = view && solutionSteps ? {
    docCode: 'F-01',
    ok: allOK,
    governing: `Governing: ${governing} · ${globalThis.Math.max(punchRatio, beamRatio).toFixed(2)}`,
    stats: [
      { label: 'Plan size', value: `${f2(view.Bx)} × ${f2(view.By)}`, unit: 'm' },
      { label: 'Thickness Dc', value: f0(view.Dc), unit: 'mm' },
      { label: view.type === 'square' ? 'Steel each way' : 'Steel — long', value: `${view.long.bars}-⌀${dbEff}`, unit: `@${f0(view.long.spacing)}` },
    ],
    checks: [
      { name: 'Two-way (punching) shear — d req/prov', ratio: punchRatio, ok: view.punchOK },
      { name: 'One-way (beam) shear — d req/prov', ratio: beamRatio, ok: view.beamOK },
      { name: `Min. depth over the mat — ${MIN_FOOTING_DEPTH}/d prov (§413.3.1.2)`, ratio: MIN_FOOTING_DEPTH / view.dProvided, ok: view.minDepthOK },
      ...(kern ? [{ name: `Resultant in the kern — e/(B/6) · ${form.position} column`, ratio: kern.kernRatio, ok: kern.kernOK }] : []),
    ],
    data: [
      ['Service load P', `${f0(serviceLoad)} kN`], ['Ultimate load Pu', `${f0(ultimateLoad)} kN`],
      ["Concrete f'c", `${form.fc} MPa`], ['Steel fy', `${form.fy} MPa`],
      ['Column width c', `${f0(colWidth)} mm (${form.position})`], ['Bar diameter db', `⌀${dbEff} mm`],
      ['Allowable bearing qa', `${form.qAllow} kPa`], ['Clear cover', `${form.cover} mm`],
      ['Unit weight, soil γs', `${form.gammaSoil} kN/m³`], ['Unit weight, concrete γc', `${form.gammaConc} kN/m³`],
      ['Total depth H', `${f2(form.H)} m`], ['Surcharge', `${form.surcharge} kPa`],
    ] as [string, string][],
    steps: solutionSteps,
    drawingTitle: 'Isolated Footing',
  } : undefined

  return (
    <WorkspacePage title="Isolated Footing" badges={['Foundations', 'ACI 318-14 · NSCP 2015']}
      intro="A square, rectangular or eccentrically loaded spread footing: plan size from the net allowable bearing, depth from two-way and one-way shear, then the mat. Design mode sizes it; analysis mode checks a given B and Dc. A column at a free edge is checked for the resultant leaving the kern."
      report={report}
      inputs={<>
        <div className="no-print space-y-3">
          <ModelMemberResults kind="footing" onLoad={loadSaved} />
          <ExcelImport onResult={setBatch} />
        </div>

          <InputGroup title="Footing">
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
              <p className="col-span-full text-xs text-muted">Eccentric is square-only in this pilot; the footing is sized to keep the load in the kern (no uplift).</p>
            )}
          </InputGroup>

          <InputGroup title="Loads & Column">
            <Select label="Load entry" value={form.loadInput} onChange={set('loadInput')}
              options={[['direct', 'Service & ultimate (P, Pu)'], ['individual', 'Individual loads (DL & LL)']]} />
            {individual ? (
              <>
                <NumField label={<>Dead <Math tex="D" /></>} unit="kN" value={form.deadLoad} onChange={set('deadLoad')} />
                <NumField label={<>Live <Math tex="L" /></>} unit="kN" value={form.liveLoad} onChange={set('liveLoad')} />
                <p className="col-span-full text-xs text-muted">
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
            {/* §13.3.2.1 sends footings to the SLAB minimum; most offices
                detail to the greater of that and the beam rule. Both are
                offered because the clause is genuinely read both ways. */}
            <Select label="Minimum steel" value={form.asMinBasis} onChange={set('asMinBasis')}
              options={[
                ['max', 'Greater of both (default)'],
                ['slab', 'Slab §24.4.3.2 only (§13.3.2.1)'],
                ['beam', 'Beam §9.6.1.2 only'],
              ]} />
            {circular && (
              <p className="col-span-full text-xs text-muted">
                Circular column → equivalent square c = D·√(π/4) = {f0(colWidth)} mm (equal area, legacy convention).
              </p>
            )}
            {rectCol && !rect && (
              <p className="col-span-full text-xs text-muted">
                Punching uses the full cx × cy perimeter (β = max/min); one-way shear & flexure use the smaller
                dimension (longer cantilever governs both ways on a square footing).
              </p>
            )}
          </InputGroup>

          <InputGroup title="Materials">
            {(
              <label className="col-span-full flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted">
                <input type="checkbox" checked={autoBar} onChange={(e) => setAutoBar(e.target.checked)}
                  className="h-3.5 w-3.5 accent-brand" />
                Auto-select bar ⌀ and spacing
              </label>
            )}
            <NumField label={<Math tex="f'_c" />} unit="MPa" value={form.fc} onChange={set('fc')} />
            <NumField label={<Math tex="f_y" />} unit="MPa" value={form.fy} onChange={set('fy')} />
            <NumField label={<>Bar <Math tex="d_b" /></>} unit="mm" value={dbEff} onChange={set('barDia')}
              disabled={!!matChoice}
              hint={matChoice ? (matChoice.db ? 'chosen by the optimiser' : 'no compliant mat — see the ranking') : undefined} />
            <NumField label="Clear cover" unit="mm" value={form.cover} onChange={set('cover')} />
          </InputGroup>

          <InputGroup title="Soil & Geometry">
            <NumField label={<Math tex="q_a" />} unit="kPa" value={form.qAllow} onChange={set('qAllow')} />
            <NumField label={<Math tex="\gamma_{soil}" />} unit="kN/m³" value={form.gammaSoil} onChange={set('gammaSoil')} />
            <NumField label={<Math tex="\gamma_{conc}" />} unit="kN/m³" value={form.gammaConc} onChange={set('gammaConc')} />
            <NumField label={<>Total depth <Math tex="H" /></>} unit="m" value={form.H} onChange={set('H')} />
            <NumField label="Surcharge" unit="kPa" value={form.surcharge} onChange={set('surcharge')} />
          </InputGroup>
              </>}
      checks={view ? <>
        <CheckCard title="Two-way shear" basis="d required ÷ d provided" status={view.punchOK ? 'pass' : 'fail'}
          value={f0(view.dPunch)} unit="mm req." ratio={punchRatio} ratioLabel="d req ÷ d prov"
          pairs={[{ label: 'd provided', value: `${f0(view.dProvided)} mm` }, { label: 'Dc', value: `${f0(view.Dc)} mm` }]} />
        <CheckCard title="One-way shear" basis={view.type === 'square' ? 'each way' : 'long / short'} status={view.beamOK ? 'pass' : 'fail'}
          value={view.type === 'square' ? f0(view.dBeamLong) : `${f0(view.dBeamLong)} / ${f0(view.dBeamShort)}`} unit="mm req." ratio={beamRatio} ratioLabel="d req ÷ d prov" />
        <CheckCard title="Minimum depth" basis="§413.3.1.2" status={view.minDepthOK ? 'pass' : 'fail'}
          value={f0(view.dProvided)} unit="mm" ratio={MIN_FOOTING_DEPTH / view.dProvided} ratioLabel={`${MIN_FOOTING_DEPTH} ÷ d`} />
        {kern && <CheckCard title="Resultant in the kern" basis={`${form.position} column`} status={kern.kernOK ? 'pass' : 'fail'}
          value={kern.e.toFixed(2)} unit="m off centroid" ratio={kern.kernRatio} ratioLabel="e ÷ (B/6)" />}
        {view.ecc && <CheckCard title="Bearing (eccentric)" basis={`e = M/P = ${f3(view.ecc.e)} m`} status={view.ecc.kernOK ? 'pass' : 'fail'}
          value={f2(view.ecc.qMax)} unit="kPa max" pairs={[{ label: 'q min', value: `${f2(view.ecc.qMin)} kPa` }, { label: 'q net', value: `${f3(view.qNet)} kPa` }]} />}
        <CheckCard title="Mat" basis={view.type === 'square' ? 'each way' : 'long direction'} status="info"
          value={`${view.long.bars} ⌀${dbEff} @ ${f0(view.long.spacing)}`} unit="mm"
          pairs={[{ label: 'Plan', value: `${f2(view.Bx)} × ${f2(view.By)} m` }, { label: 'As', value: `${f0(view.long.As)} mm²` }]} />
      </> : <p className="text-sm text-muted">Enter valid inputs — the net bearing must be positive.</p>}
      summary={[
        { label: 'Footing', value: `${rect ? 'rectangular' : 'square'}, ${ecc ? 'eccentric' : 'concentric'}, ${analyze ? 'analysis of given size' : 'design'}` },
        { label: 'Loads', value: `P ${f0(serviceLoad)} kN, Pu ${f0(ultimateLoad)} kN${ecc ? `, M ${f0(form.serviceMoment)} / Mu ${f0(form.ultimateMoment)} kN·m` : ''}` },
        { label: 'Column', value: `${f0(colWidth)}${rectCol ? ` × ${f0(colWidthY)}` : ''} mm ${form.columnShape}, ${form.position}` },
        { label: 'Soil', value: `qa ${form.qAllow} kPa, H ${f2(form.H)} m, γs ${form.gammaSoil}, γc ${form.gammaConc} kN/m³` },
        { label: 'Materials', value: `f′c ${form.fc}, fy ${form.fy} MPa, cover ${form.cover} mm` },
      ]}
      drawing={view ? { title: 'Plan and section', node: <div data-pdf-drawing>
        <FootingSchematic Bx={view.Bx} By={view.By} Dc={view.Dc} columnWidth={colWidth} H={form.H}
          position={form.position} d={view.dProvided} pressure={view.offset ?? view.ecc}
          columnWidthY={rectCol ? colWidthY : undefined}
          bars={{ db: dbEff, cover: form.cover, long: view.long, short: view.short }} />
      </div> } : undefined}
      resultsCaption={caption}
      results={view ? [
        ...(view.analysis === 'design' ? [{ check: 'Method', basis: 'depth by', demand: view.method === 'iteration' ? 'iteration' : 'approximate', status: 'info' as const }] : []),
        { check: 'Net bearing', basis: 'qa − soil and concrete overburden − surcharge', demand: `${f3(view.qNet)} kPa`, status: 'info' as const },
        { check: 'Plan size', basis: view.type === 'square' ? 'B' : 'Bx × By', demand: view.type === 'square' ? `${f2(view.Bx)} m` : `${f2(view.Bx)} × ${f2(view.By)} m`, status: 'info' as const },
        ...(view.ecc ? [{ check: 'Service pressure', basis: `e ${f3(view.ecc.e)} m, kern B/6 ${f3(view.Bx / 6)} m`, demand: `${f2(view.ecc.qMax)} / ${f2(view.ecc.qMin)} kPa`, status: view.ecc.kernOK ? 'pass' as const : 'fail' as const }] : []),
        { check: view.ecc ? 'Factored pressure (max)' : 'Factored pressure', basis: 'qu', demand: `${f3(view.qu)} kPa`, status: 'info' as const },
        { check: 'Two-way shear', basis: 'd required', demand: `${f0(view.dPunch)} mm`, limit: `${f0(view.dProvided)} mm`, ratio: punchRatio, status: view.punchOK ? 'pass' as const : 'fail' as const },
        { check: 'One-way shear', basis: view.type === 'square' ? 'd required' : 'd required, long / short', demand: view.type === 'square' ? `${f0(view.dBeamLong)} mm` : `${f0(view.dBeamLong)} / ${f0(view.dBeamShort)} mm`, limit: `${f0(view.dProvided)} mm`, ratio: beamRatio, status: view.beamOK ? 'pass' as const : 'fail' as const },
        { check: 'Thickness', basis: `Dc, d ≥ ${MIN_FOOTING_DEPTH} mm (§413.3.1.2)`, demand: `${f0(view.Dc)} mm`, status: view.minDepthOK ? 'pass' as const : 'fail' as const },
        steelRow(view.type === 'square' ? 'Steel each way' : 'Steel — long (x)', view.long),
        ...(view.short ? [steelRow('Steel — short (y)', view.short), { check: 'Central band (short)', basis: `≈ ${(view.short.bandFraction * 100).toFixed(0)}% in By`, demand: `${view.short.bandBars} of ${view.short.bars} bars`, status: 'info' as const }] : []),
      ] : []}
      extraSections={[
        ...diagramSections,
        ...(matChoice ? [{ title: 'Mat selection', node: <RebarRanking selection={matChoice.selection} title="Mat selection" name={nameMat} /> }] : []),
        ...(batch ? [{ title: `Batch schedule (${batch.designed}/${batch.rows.length} designed)`, node: (
          <div className="overflow-x-auto">
            <div className="mb-2 text-right"><button type="button" onClick={() => setBatch(null)} className="no-print text-xs text-muted hover:text-ink-2 hover:underline">Clear</button></div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-sheet-2 text-left text-xs uppercase tracking-wide text-muted">
                  {['Label', 'Type', 'Plan', 'Dc', 'Reinforcement', 'Note'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-hairline-2 ${r.ok ? '' : 'bg-fail-tint/60'}`}>
                    <td className="px-3 py-2 font-medium text-ink-2">{r.ok ? '✓' : '✗'} {r.label}</td>
                    <td className="px-3 py-2 text-muted">{r.type}</td>
                    <td className="px-3 py-2 text-ink">{r.size}</td>
                    <td className="px-3 py-2 text-ink">{r.thickness}</td>
                    <td className="px-3 py-2 text-ink">{r.steel}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {batch.unknownHeaders.length > 0 && <p className="mt-2 text-xs text-muted">Ignored headers: {batch.unknownHeaders.join(', ')}</p>}
          </div>
        ) }] : []),
      ]}
      steps={solutionSteps ?? []}
      references={[
        { topic: 'Footing design', basis: 'net bearing, shear, flexure', source: 'ACI 318-14 Ch. 13 · NSCP 2015 §413' },
        { topic: 'Two-way and one-way shear', basis: 'critical sections at d/2 and d', source: 'ACI 318-14 §22.5, §22.6' },
        { topic: 'Minimum steel', basis: 'slab §24.4.3.2 or beam §9.6.1.2', source: 'ACI 318-14 §13.3.2.1' },
      ]}
    />
  )
}
