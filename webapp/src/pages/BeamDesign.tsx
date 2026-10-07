import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { type LetterheadState, type VerdictCheck } from '../components/calc'
import { ModelMemberResults } from '../components/ModelMemberResults'
import type { MemberLoadRequest } from '../lib/modelMemberResults'
import { initialLetterhead } from '../lib/letterhead'
import { designBeam, detailingNotes, beamServiceDeflection, type BeamDesignInput, type BeamDesignResult } from '../engine/beamDesign'
import type { BeamSupport } from '../engine/beamDeflection'
import type { CriticalSection } from '../engine/beamSections'
import { SheetFigure } from '../components/modelSpace/figures'
import { calcBeamSection } from '../lib/calcFigures'
import { beamSectionNotes } from '../lib/scheduleFigures'
import { beamStressBlock } from '../lib/beamStressBlock'
import { withStressDiagrams } from '../lib/beamSectionStress'
import { buildBeamSolution, beamProvidedCapacities } from '../lib/beamSolution'
import { optimizeBeamRebar, optimizeBeamMember } from '../engine/beamRebarOptimize'
import { RebarRanking } from '../components/RebarRanking'
import { buildRebarSelectionSolution, withRebarSelection } from '../lib/rebarSolution'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard, ResultsTable, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { Math as KTex } from '../lib/math'
import { f0, f1, f2 } from '../lib/format'
import { usePublishPageSnapshot, type PageSnapshot } from '../lib/ai/pageContext'

interface FormState extends BeamDesignInput { fyt: number; legs: number; comprBarDia: number }

const DEFAULTS: FormState = {
  b: 300, h: 500, cover: 40, barDia: 20, comprBarDia: 16, stirrupDia: 10,
  fc: 28, fy: 415, fyt: 415, Mu: 180, Vu: 150, legs: 2, aggregate: 20,
}

const REGION: Record<string, string> = {
  none: 'No stirrups required',
  minimum: 'Minimum stirrups',
  designed: 'Stirrups designed',
  inadequate: '⚠ Section inadequate',
}

/** Storage key for the Beam Analysis → multi-section handoff. */
export const SECTIONS_HANDOFF_KEY = 'beam-critical-sections'

let uid = 1
interface SecRow extends CriticalSection { id: number }

const DEF_SECTIONS: SecRow[] = [
  { id: uid++, label: 'Midspan', x: 3, Mu: 180, Vu: 30 },
  { id: uid++, label: 'Support', x: 0, Mu: -120, Vu: 150 },
]

function sectionOK(r: BeamDesignResult): boolean {
  return r.flexOK && r.comprEffective && r.comprNAOK && r.region !== 'inadequate'
}

export default function BeamDesign() {
  const [params] = useSearchParams()

  // Handoffs from Beam Analysis: ?mu&vu (single) or ?sections=auto (multi,
  // via sessionStorage — the list is too rich for query params).
  const handoff = useMemo(() => {
    if (params.get('sections') === 'auto') {
      try {
        const raw = sessionStorage.getItem(SECTIONS_HANDOFF_KEY)
        if (raw) {
          const secs = (JSON.parse(raw) as CriticalSection[]).map((s) => ({ ...s, id: uid++ }))
          if (secs.length) return { multi: true as const, sections: secs }
        }
      } catch { /* fall through to defaults */ }
    }
    const mu = parseFloat(params.get('mu') ?? ''), vu = parseFloat(params.get('vu') ?? '')
    return {
      multi: false as const,
      single: {
        ...(Number.isFinite(mu) ? { Mu: mu } : {}),
        ...(Number.isFinite(vu) ? { Vu: vu } : {}),
      },
    }
  }, [params])

  const [f, setF] = useState<FormState>({ ...DEFAULTS, ...(handoff.multi ? {} : handoff.single) })
  const [lh, setLh] = useState<LetterheadState>(() => initialLetterhead('S-01 · Rev A'))
  const [span, setSpan] = useState<number>(NaN)
  const [support, setSupport] = useState<BeamSupport>('simple')
  const [svcWD, setSvcWD] = useState<number>(NaN)
  const [svcWL, setSvcWL] = useState<number>(NaN)
  const [multi, setMulti] = useState<boolean>(handoff.multi)
  // The optimiser chooses the diameter; everything else on the page is still
  // the user's. Off puts the ⌀ field back in charge, which is what checking an
  // existing drawing needs.
  const [autoBar, setAutoBar] = useState(true)
  const [sections, setSections] = useState<SecRow[]>(handoff.multi ? handoff.sections : DEF_SECTIONS)
  const [selId, setSelId] = useState<number | null>(handoff.multi ? handoff.sections[0].id : null)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const setSec = (id: number, patch: Partial<SecRow>) =>
    setSections((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const sectionGeomOK = useMemo(() => {
    const keys: (keyof FormState)[] = ['b', 'h', 'cover', 'barDia', 'stirrupDia', 'fc', 'fy', 'fyt', 'legs']
    return keys.every((k) => Number.isFinite(f[k] as number)) && f.b > 0 && f.h > 0 && f.fc > 0 && f.fy > 0
      // The derived depth only has to be positive when it is the one being
      // used; a given d stands on its own, and must itself be inside the
      // section.
      && (f.dGiven && f.dGiven > 0
        ? f.dGiven < f.h
        : f.h - f.cover - f.stirrupDia - f.barDia / 2 > 0)
  }, [f])

  // ── Bar selection ────────────────────────────────────────────────────
  // In multi-section mode the whole member gets ONE diameter, scored across
  // every critical section — three sections of one beam detailed with three
  // different bars is not a beam anybody builds.
  const memberChoice = useMemo(() => {
    if (!autoBar || !sectionGeomOK || !multi) return null
    const valid = sections.filter((s) => Number.isFinite(s.Mu) && Number.isFinite(s.Vu))
    if (valid.length === 0) return null
    return optimizeBeamMember(f, valid.map((s) => ({
      id: String(s.id), label: s.label, Mu: Math.abs(s.Mu), Vu: Math.abs(s.Vu),
    })))
  }, [autoBar, sectionGeomOK, multi, f, sections])

  const singleChoice = useMemo(() => {
    if (!autoBar || !sectionGeomOK || multi) return null
    if (!Number.isFinite(f.Mu) || !Number.isFinite(f.Vu)) return null
    return optimizeBeamRebar({ ...f, Mu: Math.abs(f.Mu) })
  }, [autoBar, sectionGeomOK, multi, f])

  const adoptedDb = multi
    ? memberChoice?.db ?? null
    : singleChoice?.selection.best?.layout.db ?? null

  /** The form as designed with — identical to `f` unless the optimiser chose. */
  const fd: FormState = useMemo(
    () => (adoptedDb === null ? f : { ...f, barDia: adoptedDb, comprBarDia: adoptedDb }),
    [f, adoptedDb],
  )

  const selection = multi ? memberChoice?.selection ?? null : singleChoice?.selection ?? null

  // Per-section designs (multi) — hogging sections design with |Mu|.
  const designs = useMemo(() => {
    if (!sectionGeomOK || !multi) return []
    return sections.map((s) => {
      if (!Number.isFinite(s.Mu) || !Number.isFinite(s.Vu)) return null
      return designBeam({ ...fd, Mu: Math.abs(s.Mu), Vu: Math.abs(s.Vu) })
    })
  }, [fd, sections, multi, sectionGeomOK])

  // The active demand: selected section (multi) or the single Mu/Vu fields.
  const selIdx = multi ? Math.max(0, sections.findIndex((s) => s.id === selId)) : -1
  const active = multi ? sections[selIdx] ?? sections[0] : null
  const hogging = multi ? (active?.Mu ?? 0) < 0 : f.Mu < 0

  const singleValid = sectionGeomOK && Number.isFinite(f.Mu) && Number.isFinite(f.Vu)
  const r = multi
    ? designs[selIdx] ?? null
    : singleValid ? designBeam({ ...fd, Mu: Math.abs(fd.Mu) }) : null
  const demand = multi
    ? { Mu: Math.abs(active?.Mu ?? 0), Vu: Math.abs(active?.Vu ?? 0) }
    : { Mu: Math.abs(f.Mu), Vu: f.Vu }

  // THE SAME CUT THE DRAWING SET MAKES, from the cage this page has designed.
  // The old figure was a picture of a cage — a rounded rectangle for the
  // stirrup, dots spread from the bar count — and could show neither the 135°
  // returns, a second layer, nor the arrangement the sheets draw for the same
  // beam. The callout is composed by the schedule's own `beamSectionNotes`, so
  // the calculator and the schedule cannot word the same section differently.
  const sectionNotes = useMemo(() => (r ? [
    `d = ${Math.round(r.d)} TO THE ${hogging ? 'BOTTOM' : 'TOP'} FACE`,
    ...beamSectionNotes(
      { x: 0, label: '', hogging, design: {
        bars: r.bars, sAdopt: r.sAdopt, sHinge: r.sHinge, legs: fd.legs, layers: r.layers,
        comprBars: r.comprBars, comprLayers: r.comprLayers,
        mode: r.mode, comprEffective: r.comprEffective,
      } },
      { b: fd.b, h: fd.h, cover: fd.cover, barDia: fd.barDia, tieDia: fd.stirrupDia },
    ),
    // The reason comes from the engine: "enlarge it" is right for a
    // diverging layout and wrong for a mistyped bar diameter.
    ...r.flexNotes.map((n) => n.toUpperCase()),
  ] : []), [r, fd, hogging])
  // The notes print BELOW the figure as text, not inside the SVG — a long
  // callout was clipped at the figure's edge.
  const sectionFigure = useMemo(() => {
    if (!r || !sectionGeomOK) return null
    const rect = { b: fd.b, h: fd.h, cover: fd.cover, barDia: fd.barDia, tieDia: fd.stirrupDia }
    const section = calcBeamSection({
      ...rect, stirrupDia: fd.stirrupDia,
      bars: r.bars, comprBars: r.comprBars, hogging, spacing: r.sAdopt,
      title: `SECTION — ${f0(fd.b)}×${f0(fd.h)}`,
      notes: [],
    })
    // the strain and stress diagrams, joined to the actual section on its
    // right at the section's own depth scale
    return withStressDiagrams(section, {
      b: fd.b, h: fd.h, d: r.d, dPrime: r.dPrime, fc: fd.fc, fy: fd.fy,
      s: beamStressBlock(r, fd.fc, fd.fy), hogging,
    })
  }, [r, fd, hogging, sectionGeomOK])
  const stress = useMemo(() => (r && sectionGeomOK ? beamStressBlock(r, fd.fc, fd.fy) : null), [r, fd.fc, fd.fy, sectionGeomOK])
  // The selection is appended, not prepended: it justifies the bar chosen for
  // the steel the flexure steps above derived, so it reads after them.
  const solution = useMemo(
    () => (r
      ? withRebarSelection(
          buildBeamSolution({ ...fd, ...demand }, r),
          selection ? buildRebarSelectionSolution(selection, 'cage') : [],
        )
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, fd, demand.Mu, demand.Vu, selection],
  )

  const deflection = useMemo(() => {
    if (!r || !Number.isFinite(span) || !Number.isFinite(svcWD) || !Number.isFinite(svcWL)) return null
    return beamServiceDeflection({
      b: f.b, h: f.h, d: r.d, As: r.As,
      AsPrime: r.mode === 'DRRB' ? r.AsPrime : 0, dPrime: r.dPrime,
      fc: f.fc, fy: f.fy, span, support, wD: svcWD, wL: svcWL,
    })
  }, [r, f.b, f.h, f.fc, f.fy, span, support, svcWD, svcWL])

  const stirrupText = (rr: BeamDesignResult) =>
    rr.region === 'designed' || rr.region === 'minimum'
      ? `⌀${f.stirrupDia} ${f.legs}-leg @ ${f0(rr.sAdopt)} mm`
      : rr.region === 'none' ? '— none' : '⚠ enlarge'

  // Verdict presentation from the engine result: flexure utilization is
  // Mu/φMn,max (true section utilization while singly reinforced), bar-fit is
  // required-over-provided clear spacing, shear Vu/φVc while no stirrups are
  // demanded — all existing outputs, no new calculation.
  // `allOK` speaks only for the checks that RAN. Serviceability is declared in
  // `checks` whether or not it could be evaluated (§424.2 applies to the beam
  // regardless of whether the user supplied a span), so an unevaluated check
  // qualifies the headline as `DESIGN OK (3 of 4 checks)` and prints under
  // Assumptions & Scope instead of vanishing. Before this it was absent from
  // both, and `!deflection ||` made a missing check indistinguishable from a
  // passing one — on a sheet an engineer signs.
  const allOK = !!r && sectionOK(r) && (!deflection || (deflection.liveOK && deflection.totalOK))
  const cap = r ? beamProvidedCapacities(fd, r) : null
  const checks: VerdictCheck[] = r && cap ? [
    { name: 'Flexure Mu/φMn', ratio: demand.Mu / cap.phiMn },
    { name: 'Shear Vu/φVn', ratio: demand.Vu / cap.phiVn },
    { name: `Bar spacing (${r.layers.length} layer${r.layers.length > 1 ? 's' : ''})`, ratio: r.sMinClear / Math.max(r.sClear, 1e-9) },
    deflection
      // §409.3.1.1: the computed check is waived when h ≥ h_min, so a waived
      // beam is reported at its live-deflection ratio and still passes.
      ? { name: 'Serviceability δ/limit', ratio: deflection.deltaL / Math.max(deflection.limitL360, 1e-9) }
      : { name: 'Serviceability δ/limit', ratio: null, note: 'enter span and service loads to run §424.2' },
  ] : []

  // Assistant snapshot — the live numbers behind "why did it come out like
  // that?". Ratios are re-stated here (not read off `checks`) so the memo
  // stays stable across renders: `checks` is a fresh array every render and
  // depending on it would republish on each render. The stirrup line is
  // likewise inlined from `stirrupText` — the helper has a fresh identity
  // every render and would do the same.
  const beamSnapshot = useMemo<PageSnapshot | null>(() => {
    if (!r || !cap) return null
    return {
      route: '/beam-design',
      tool: 'Beam Design',
      inputs: [
        { label: 'b × h', value: `${f0(fd.b)} × ${f0(fd.h)} mm` },
        { label: "f'c", value: `${f0(fd.fc)} MPa` },
        { label: 'fy', value: `${f0(fd.fy)} MPa` },
        { label: 'Mu', value: `${f1(demand.Mu)} kN·m${hogging ? ' (hogging)' : ''}` },
        { label: 'Vu', value: `${f1(demand.Vu)} kN` },
        ...(multi && active ? [{ label: 'section', value: active.label }] : []),
      ],
      results: [
        { label: 'steel', value: `${r.bars}-⌀${fd.barDia}${r.mode === 'DRRB' ? ` + ${r.comprBars}-⌀${fd.comprBarDia} comp` : ''}` },
        { label: 'φMn', value: `${f1(cap.phiMn)} kN·m` },
        { label: 'φVn', value: `${f1(cap.phiVn)} kN` },
        {
          label: 'stirrups',
          value: r.region === 'designed' || r.region === 'minimum'
            ? `⌀${f.stirrupDia} ${f.legs}-leg @ ${f0(r.sAdopt)} mm`
            : r.region === 'none' ? '— none' : '⚠ enlarge',
        },
        { label: 'Flexure Mu/φMn', value: f2(demand.Mu / cap.phiMn) },
        { label: 'Shear Vu/φVn', value: f2(demand.Vu / cap.phiVn) },
        ...(deflection
          ? [{ label: 'Serviceability δ/limit', value: f2(deflection.deltaL / Math.max(deflection.limitL360, 1e-9)) }]
          : [{ label: 'Serviceability δ/limit', value: 'not run — enter span and service loads' }]),
        { label: 'verdict', value: allOK ? 'DESIGN OK' : 'NOT ACCEPTABLE' },
      ],
      notes: r.mode === 'DRRB' ? ['doubly reinforced — compression steel is effective'] : [],
    }
  }, [r, cap, demand.Mu, demand.Vu, deflection, allOK, f, fd, multi, active, hogging])
  usePublishPageSnapshot('/beam-design', beamSnapshot)

  // One payload for both report paths — the printed calc sheet and the
  // generated PDF. Sharing it is the point: two copies of this drift, and the
  // PDF quietly stops matching what the page shows.
  const reportData = r && solution ? {
    docTitle: multi && active ? `RC Beam — ${active.label}` : 'Rectangular RC Beam',
    docCode: 'S-01',
    badges: ['ACI 318-14', 'NSCP 2015'],
    ok: allOK,
    governing: `Governing: flexure · utilization ${cap ? (demand.Mu / cap.phiMn).toFixed(2) : '—'}${r.mode === 'DRRB' ? ' · DRRB' : ''}`,
    lh,
    onLhChange: (patch: Partial<LetterheadState>) => setLh((v) => ({ ...v, ...patch })),
    stats: [
      { label: hogging ? 'Tension (top)' : 'Tension steel', value: `${r.bars}-⌀${fd.barDia}` },
      { label: 'Stirrups', value: r.sAdopt > 0 ? `⌀${f.stirrupDia} @${f0(r.sAdopt)}` : REGION[r.region] },
      { label: 'Eff. depth d', value: f0(r.d), unit: 'mm' },
    ],
    // `c.ratio !== null &&` is load-bearing, not defensive: `null <= 1.0001`
    // is TRUE in JS, so without it an unevaluated check prints PASS.
    checks: checks.map((c) => ({ ...c, ok: c.ratio !== null && c.ratio <= 1.0001 })),
    data: [
      ['Section b × h', `${f.b} × ${f.h} mm`], ['Clear cover', `${f.cover} mm`],
      ["Concrete f'c", `${f.fc} MPa`], ['Steel fy / fyt', `${f.fy} / ${f.fyt} MPa`],
      ['Max. aggregate size', `${f.aggregate ?? 20} mm`],
      ['Bar ⌀ / stirrup ⌀', `${fd.barDia} / ${fd.stirrupDia} mm (${fd.legs}-leg)`],
      ['Moment Mu', `${f1(demand.Mu)} kN·m${hogging ? ' (hogging)' : ''}`],
      ['Shear Vu', `${f1(demand.Vu)} kN`], ['ρ / ρmin / ρmax', `${r.rho.toFixed(4)} / ${r.rhoMin.toFixed(4)} / ${r.rhoMax.toFixed(4)}`],
      ...(stress ? [['Internal couple', `a = ${f0(stress.a)} mm, c = ${f0(stress.c)} mm, C = ${f1(stress.Cc + stress.Cs)} kN, T = ${f1(stress.T)} kN`] as [string, string]] : []),
      // the section's notes left the drawing; the PDF keeps them here
      ...sectionNotes.map((n, i) => [`Section note ${i + 1}`, n] as [string, string]),
    ] as [string, string][],
    steps: solution,
    drawingTitle: 'Beam Section',
  } : null

  /** Saved-model member → the page's own fields. Geometry, materials and the
   *  cage come from the project's (bar-selection-adopted) section; the demands
   *  from the member's governing section, sign kept so hogging loads hogging.
   *  The worked solution below stays the page's own — it solves what the
   *  fields now say, visibly. */
  const loadSaved = (req: MemberLoadRequest) => {
    const b = req.design.beams.find((x) => x.id === req.id)
    const sec = req.section
    if (!b || !sec || !b.sections.length) return
    const worst = b.sections.reduce((a, z) => (Math.abs(z.Mu) > Math.abs(a.Mu) ? z : a))
    setMulti(false)
    setAutoBar(false)
    setF((s) => ({
      ...s, b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia,
      stirrupDia: sec.tieDia, fc: sec.fc, fy: sec.fy,
      Mu: worst.Mu, Vu: worst.Vu, dGiven: 0,
    }))
  }

  const okRow = (ok: boolean): ResultRow['status'] => (ok ? 'pass' : 'fail')
  const resultRows: ResultRow[] = r ? [
    ...r.flexNotes.map((n) => ({ check: 'Section', basis: 'detailing', demand: n, status: 'fail' as const })),
    { check: 'Effective depth d', basis: r.layers.length > 1 ? `dt ${f1(r.dt)} · ȳ ${f1(r.yBar)} mm` : 'single layer', demand: `${f1(r.d)} mm`, status: 'info' },
    { check: 'Flexure mode', basis: r.mode === 'SRRB' ? `from the ${hogging ? 'top' : 'bottom'} steel alone (§409.7.3.8 bars not counted)` : `compression steel ${r.comprEffective ? 'counted' : "not counted: f's ≤ 0.85f'c"}`, demand: `${r.mode}, φMn,max ${f1(r.phiMnMax)} kN·m`, status: 'info' },
    { check: 'Tension steel', basis: r.usedMin ? 'ρ_min governs' : `ρ ${r.rho.toFixed(4)}`, demand: `${r.bars}-⌀${fd.barDia} (As ${f0(r.As)} mm²)`, status: 'info' },
    { check: 'Steel ratio', basis: `ρ_min ${r.rhoMin.toFixed(4)} · ρ_b ${r.rhoB.toFixed(4)}`, demand: r.rho.toFixed(4), limit: `ρ_max ${r.rhoMax.toFixed(4)}`, status: okRow(r.rho <= r.rhoMax + 1e-9) },
    { check: 'Bar layers', basis: `clear spacing ≥ ${f0(r.sMinClear)} mm`, demand: r.layers.length > 1 ? `${r.layers.length} (${r.layers.join(' + ')})` : '1', limit: `${f0(r.sClear)} mm clear`, status: okRow(r.sClear >= r.sMinClear - 1e-9) },
    ...(r.mode === 'DRRB' ? [{ check: 'Compression steel', basis: `f's ${f1(r.fsPrime)} MPa${r.fsYields ? '' : ' (not yielding)'}`, demand: r.comprEffective ? `${r.comprBars}-⌀${fd.comprBarDia} (A's ${f0(r.AsPrime)} mm²)` : 'ineffective', status: okRow(r.comprEffective) }] : []),
    ...(r.comprLayers.length > 0 ? [{ check: 'Compression above NA', basis: `deepest d' ${f0(r.dPrimeExtreme)} mm vs c ${f0(r.cNA)} mm`, demand: r.comprNAOK ? 'above NA' : 'crosses NA', status: okRow(r.comprNAOK) }] : []),
    { check: 'Concrete shear φVc', basis: `Vc ${f1(r.Vc)} kN`, demand: `${f1(r.phiVc)} kN`, status: 'info' },
    { check: 'Shear region', basis: REGION[r.region], demand: stirrupText(r), status: r.region === 'inadequate' ? 'fail' : 'pass' },
    ...(r.region === 'designed' ? [{ check: 'Stirrup spacing', basis: `s_max ${f0(r.sMax)} mm`, demand: `s_req ${f0(r.sReq)} mm`, status: 'info' as const }] : []),
    { check: 'Hooks (135°)', basis: `bend ⌀ ${f0(r.stirrupBendDia)} mm (4ds)`, demand: `extension ${f0(r.stirrupHookExt)} mm`, status: 'info' },
  ] : [{ check: 'Section', basis: 'invalid input', demand: detailingNotes(f)[0] ?? 'Enter a valid section.', status: 'warn' }]

  const deflRows: ResultRow[] = deflection ? [
    { check: 'Minimum thickness', basis: `Table 409.3.1.1 (${deflection.support})`, demand: `h ${f0(f.h)} mm`, limit: `${deflection.hMin.toFixed(0)} mm`, status: deflection.hMinOK ? 'pass' : 'warn' },
    { check: 'Section state', basis: `Mcr ${deflection.Mcr.toFixed(1)} kN·m`, demand: deflection.cracked ? 'cracked (Ma > Mcr)' : 'uncracked', status: 'info' },
    { check: 'Effective inertia', basis: `Ig ${(deflection.Ig / 1e6).toFixed(0)} · Icr ${(deflection.Icr / 1e6).toFixed(0)} ×10⁶ mm⁴`, demand: `Ie ${(deflection.Ie / 1e6).toFixed(0)} ×10⁶ mm⁴`, status: 'info' },
    { check: 'Immediate dead δD', basis: 'Branson Ie', demand: `${deflection.deltaD.toFixed(1)} mm`, status: 'info' },
    { check: 'Immediate live δL', basis: 'L/360', demand: `${deflection.deltaL.toFixed(1)} mm`, limit: `${deflection.limitL360.toFixed(1)} mm`, ratio: deflection.deltaL / Math.max(deflection.limitL360, 1e-9), status: okRow(deflection.liveOK) },
    { check: 'Long-term total', basis: `λΔ ${deflection.lambdaDelta.toFixed(3)} (ξ = 2.0), L/240`, demand: `${deflection.deltaTotal.toFixed(1)} mm`, limit: `${deflection.limitL240.toFixed(1)} mm`, ratio: deflection.deltaTotal / Math.max(deflection.limitL240, 1e-9), status: okRow(deflection.totalOK) },
  ] : []

  const modeToggle = (
    <div className="flex items-center gap-0.5 rounded-md border border-field-line bg-field p-0.5">
      {([['single', 'Single section'], ['multi', 'Multiple sections']] as const).map(([v, t]) => (
        <button key={v} type="button" onClick={() => setMulti(v === 'multi')}
          className={`rounded px-3 py-1.5 text-[11.5px] font-semibold ${(v === 'multi') === multi ? 'bg-brand text-on-solid' : 'text-muted hover:text-ink'}`}>
          {t}
        </button>
      ))}
    </div>
  )
  const scheduleTable = (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-muted">
            <th className="py-1 pr-2 font-semibold">Section</th><th className="py-1 pr-2 font-semibold">Mode</th>
            <th className="py-1 pr-2 font-semibold">Tension</th><th className="py-1 pr-2 font-semibold">Compr.</th><th className="py-1 font-semibold">Stirrups</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s, i) => {
            const d = designs[i]
            const bad = d ? !sectionOK(d) : true
            return (
              <tr key={s.id} onClick={() => setSelId(s.id)}
                className={`cursor-pointer border-t border-hairline-2 hover:bg-brand-tint ${bad ? 'bg-fail-tint text-fail' : ''} ${s.id === active?.id ? 'outline outline-1 outline-brand' : ''}`}>
                <td className="py-1 pr-2">{s.label}{s.Mu < 0 ? ' (hog)' : ''}</td>
                <td className="py-1 pr-2">{d ? d.mode : '—'}</td>
                <td className="py-1 pr-2">{d ? `${d.bars}⌀${fd.barDia}${d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}` : '—'}</td>
                <td className="py-1 pr-2">{d && d.comprBars > 0 ? `${d.comprBars}⌀${fd.comprBarDia}` : '—'}</td>
                <td className="py-1">{d ? (d.sAdopt > 0 ? `@${f0(d.sAdopt)}` : d.region === 'none' ? 'none' : '⚠') : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted">Click a row to view its drawing, results and worked solution. Red rows have errors.</p>
    </div>
  )
  const { docTitle: _dt, badges: _bg, lh: _lh, onLhChange: _ol, ...pdf } = reportData ?? ({} as NonNullable<typeof reportData>)
  void _dt; void _bg; void _lh; void _ol

  return (
    <WorkspacePage title="Rectangular RC Beam" badges={['Concrete', 'ACI 318-14 · NSCP 2015']}
      intro="A rectangular reinforced-concrete beam: flexure singly or doubly reinforced with bar layers checked for clear spacing, shear with designed stirrups and 135° hooks, and the §424.2 serviceability check when a span and service loads are given. The bar diameter can be chosen by the optimiser or fixed to check an existing drawing."
      actions={modeToggle}
      report={reportData ? pdf : undefined}
      inputs={<>
        <div className="no-print"><ModelMemberResults kind="beam" onLoad={loadSaved} /></div>
        <InputGroup title="Section">
          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-ink">
            <input type="checkbox" checked={autoBar} onChange={(e) => setAutoBar(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
            Auto-select bar ⌀
          </label>
          <Num label="Width b" unit="mm" value={f.b} onChange={set('b')} min={1} />
          <Num label="Total depth h" unit="mm" value={f.h} onChange={set('h')} min={1} />
          <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} min={0} />
          <Num label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={fd.barDia} onChange={set('barDia')} min={1} disabled={autoBar}
            hint={autoBar ? (adoptedDb ? 'chosen by the optimiser' : 'no compliant ⌀ — see the ranking') : undefined} />
          <Num label={<>Compr. bar <KTex tex="d_b'" /></>} unit="mm" value={fd.comprBarDia} onChange={set('comprBarDia')} min={1} disabled={autoBar}
            hint={autoBar ? 'follows the tension bar' : undefined} />
          <Num label={<>Stirrup <KTex tex="d_s" /></>} unit="mm" value={f.stirrupDia} onChange={set('stirrupDia')} min={1} />
          <Num label="Stirrup legs" value={f.legs} onChange={set('legs')} min={2} step="1" />
          <Num label={<>Depth <KTex tex="d" /> (0 = derive)</>} unit="mm" value={f.dGiven ?? 0} onChange={set('dGiven')} />
        </InputGroup>
        <InputGroup title="Materials">
          <Num label={<KTex tex="f'_c" />} unit="MPa" value={f.fc} onChange={set('fc')} />
          <Num label={<KTex tex="f_y" />} unit="MPa" value={f.fy} onChange={set('fy')} />
          <Num label={<KTex tex="f_{yt}" />} unit="MPa" value={f.fyt} onChange={set('fyt')} />
          <Num label="Max. aggregate" unit="mm" value={f.aggregate ?? 20} onChange={set('aggregate')} min={1} />
        </InputGroup>
        {!multi ? (
          <InputGroup title="Factored demands" hint={hogging ? 'Negative Mu — hogging: designed with |Mu|; the tension steel goes at the TOP.' : undefined}>
            <Num label={<KTex tex="M_u" />} unit="kN·m" value={f.Mu} onChange={set('Mu')} />
            <Num label={<KTex tex="V_u" />} unit="kN" value={f.Vu} onChange={set('Vu')} />
          </InputGroup>
        ) : (
          <InputGroup title="Critical sections" hint="Negative Mu = hogging (top steel). Or auto-detect them from Beam Analysis.">
            {sections.map((s) => (
              <div key={s.id} className={`col-span-2 rounded-lg border p-2.5 ${s.id === active?.id ? 'border-brand bg-brand-tint/40' : 'border-hairline bg-sheet-2'}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input value={s.label} onChange={(e) => setSec(s.id, { label: e.target.value })} aria-label="Section label"
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-bold uppercase tracking-wide text-muted focus:border-field-line focus:bg-sheet" />
                  <button type="button" onClick={() => setSelId(s.id)} className="text-xs text-brand hover:underline">view</button>
                  <button type="button" onClick={() => setSections((ss) => ss.filter((q) => q.id !== s.id))} className="text-xs text-fail hover:underline">remove</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Num label="x" unit="m" value={s.x} onChange={(v) => setSec(s.id, { x: v })} />
                  <Num label={<KTex tex="M_u" />} unit="kN·m" value={s.Mu} onChange={(v) => setSec(s.id, { Mu: v })} />
                  <Num label={<KTex tex="V_u" />} unit="kN" value={s.Vu} onChange={(v) => setSec(s.id, { Vu: v })} />
                </div>
              </div>
            ))}
            <div className="col-span-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setSections((ss) => [...ss, { id: uid++, label: `Section ${ss.length + 1}`, x: 0, Mu: 50, Vu: 30 }])}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add section</button>
              <Link to="/beam-analysis" className="text-[11px] font-semibold text-brand hover:underline">from Beam Analysis</Link>
            </div>
          </InputGroup>
        )}
        <InputGroup title="Serviceability (optional)" hint="Enter a span and service loads to run §424.2.">
          <Num label="Span" unit="m" value={span} onChange={setSpan} />
          <Pick label="Support" value={support} onChange={(v) => setSupport(v as BeamSupport)}
            options={[['simple', 'Simply supported'], ['one-end', 'One end continuous'], ['both-ends', 'Both ends continuous'], ['cantilever', 'Cantilever']]} />
          <Num label={<>Dead <KTex tex="w_D" /></>} unit="kN/m" value={svcWD} onChange={setSvcWD} />
          <Num label={<>Live <KTex tex="w_L" /></>} unit="kN/m" value={svcWL} onChange={setSvcWL} />
        </InputGroup>
      </>}
      checks={r && cap ? <>
        <CheckCard title={multi && active ? `Design — ${active.label}` : 'Design'} basis={`${r.mode}, ${r.layers.length > 1 ? `${r.layers.length} layers` : 'single layer'}`}
          status={allOK ? 'pass' : 'fail'} pillLabel={allOK ? 'DESIGN OK' : 'REVISE'}
          value={`${r.bars}-⌀${fd.barDia}`} unit={hogging ? 'top' : 'bottom'}
          pairs={[{ label: 'Stirrups', value: r.sAdopt > 0 ? `⌀${f.stirrupDia} ${f.legs}-leg @${f0(r.sAdopt)}` : REGION[r.region] }, { label: 'Eff. depth d', value: `${f0(r.d)} mm` }]} />
        {checks.map((c) => (
          <CheckCard key={c.name} title={c.name} basis={c.ratio === null ? 'not run' : 'ACI 318-14 / NSCP 2015'}
            status={c.ratio === null ? 'info' : c.ratio <= 1.0001 ? 'pass' : 'fail'} pillLabel={c.ratio === null ? 'NOT RUN' : undefined}
            value={c.ratio === null ? '—' : f2(c.ratio)} formula={c.ratio === null ? c.note : undefined}
            ratio={c.ratio ?? undefined} ratioLabel="Utilization" />
        ))}
      </> : (
        <CheckCard title="Check the inputs" basis="beam section" status="warn" pillLabel="CHECK" value="—" formula={detailingNotes(f)[0] ?? 'Enter a valid section.'} />
      )}
      summary={[
        { label: 'Section b × h', value: `${f0(f.b)} × ${f0(f.h)} mm, cover ${f0(f.cover)} mm` },
        { label: "Materials f'c / fy / fyt", value: `${f0(f.fc)} / ${f0(f.fy)} / ${f0(f.fyt)} MPa` },
        { label: 'Bars', value: `⌀${fd.barDia} tension, ⌀${fd.comprBarDia} compr., ⌀${f.stirrupDia} ${f.legs}-leg stirrups` },
        { label: multi && active ? `Demands (${active.label})` : 'Demands', value: `Mu ${f1(demand.Mu)} kN·m${hogging ? ' (hogging)' : ''}, Vu ${f1(demand.Vu)} kN` },
      ]}
      drawing={{ title: `Section${multi && active ? ` — ${active.label}` : ''}`, node: r && sectionFigure ? (
        <div>
          <div data-pdf-drawing><SheetFigure drawing={sectionFigure} width={900} /></div>
          {sectionNotes.length > 0 && (
            <div className="mt-4 border-t border-hairline pt-3">
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-2">Section notes</div>
              <ol className="list-decimal space-y-1 pl-5 font-mono text-[11.5px] leading-snug text-ink">
                {sectionNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ol>
            </div>
          )}
        </div>
      ) : <p className="py-8 text-center text-sm text-faint">{detailingNotes(f)[0] ?? 'Enter a valid section.'}</p> }}
      results={resultRows}
      resultsCaption={r ? `ρ = ${r.rho.toFixed(4)} within ρmin ${r.rhoMin.toFixed(4)} … ρmax ${r.rhoMax.toFixed(4)} — §9.6.1.2 / §21.2.2` : undefined}
      extraSections={[
        ...(multi ? [{ title: 'Section schedule', node: scheduleTable }] : []),
        ...(deflection ? [{ title: 'Serviceability — ACI 318-14 §24.2', node: <ResultsTable rows={deflRows} /> }] : []),
        ...(selection ? [{ title: multi ? 'Bar selection — whole member' : 'Bar selection', node: <RebarRanking selection={selection} title="Ranked bar choices" /> }] : []),
      ]}
      steps={solution ?? [{ title: 'Check the inputs', lines: [{ text: detailingNotes(f)[0] ?? 'Enter a valid section.' }] }]}
      references={[
        { topic: 'Flexure', basis: 'rectangular stress block, SRRB/DRRB, φ by strain', source: 'ACI 318-14 §22.2, §21.2; NSCP 2015 §422' },
        { topic: 'Minimum and maximum steel', basis: 'ρmin, tension-controlled limit', source: 'ACI 318-14 §9.6.1.2, §21.2.2' },
        { topic: 'Shear', basis: 'Vc and stirrup design, spacing limits', source: 'ACI 318-14 §22.5, §9.7.6.2' },
        { topic: 'Bar spacing', basis: 'clear spacing ≥ max(25 mm, db, 4/3 dagg)', source: 'ACI 318-14 §25.2.1' },
        { topic: 'Deflection', basis: 'h_min table, Branson Ie, long-term λΔ', source: 'ACI 318-14 §24.2; NSCP 2015 Table 409.3.1.1' },
      ]}
    />
  )
}
