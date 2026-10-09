import { useMemo, useState } from 'react'
import {
  designAxialColumn, interaction, capacityAtEccentricity, momentMagnificationNonsway,
  RHO_MIN, RHO_MAX,
  type ColumnShape, type LateralSystem, type BarLayout,
} from '../engine/columnDesign'
import { factoredLoad } from '../engine/loads'
import { ColumnSchematic } from '../components/ColumnSchematic'
import { SheetFigure } from '../components/modelSpace/figures'
import { calcColumnSection } from '../lib/calcFigures'
import { columnSectionNotes } from '../lib/scheduleFigures'
import { type VerdictStat, type VerdictCheck } from '../components/calc'
import { ModelMemberResults } from '../components/ModelMemberResults'
import type { MemberLoadRequest } from '../lib/modelMemberResults'
import { InteractionDiagram } from '../components/InteractionDiagram'
import { axialColumnSolution, eccentricColumnSolution, slendernessSolution } from '../lib/columnSolution'
import { optimizeColumnRebar } from '../engine/columnRebarOptimize'
import { RebarRanking } from '../components/RebarRanking'
import { buildRebarSelectionSolution, withRebarSelection } from '../lib/rebarSolution'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { Math as KTex } from '../lib/math'
import { f0, f1, f2 } from '../lib/format'
import type { SolutionStep } from '../lib/solution'

type Mode = 'axial' | 'eccentric'
type LoadInput = 'direct' | 'individual'
type BarMode = 'design' | 'analyze'

export default function ColumnDesign() {
  const [mode, setMode] = useState<Mode>('axial')
  const [shape, setShape] = useState<ColumnShape>('tied')
  const [b, setB] = useState(400); const [h, setH] = useState(400); const [D, setD] = useState(400)
  const [cover, setCover] = useState(40)
  const [barDia, setBarDia] = useState(28); const [tieDia, setTieDia] = useState(10)
  const [fc, setFc] = useState(28); const [fy, setFy] = useState(415); const [fyt, setFyt] = useState(415)
  const [loadInput, setLoadInput] = useState<LoadInput>('individual')
  const [dead, setDead] = useState(1400); const [live, setLive] = useState(790)
  const [PuDirect, setPuDirect] = useState(2944)
  const [Mu, setMu] = useState(200)
  const [barMode, setBarMode] = useState<BarMode>('design')
  const [numBars, setNumBars] = useState(8)
  // Auto-selection applies to the AXIAL design only. Analyze mode and the
  // eccentric pilot both exist to check a cage the user already has, so
  // choosing one for them would defeat the point.
  const [autoBar, setAutoBar] = useState(true)
  const [layout, setLayout] = useState<BarLayout>('all-around')   // P–M bar distribution
  // Seismic / lateral system
  const [system, setSystem] = useState<LateralSystem>('gravity')
  const [colLen, setColLen] = useState(3000)  // mm clear height
  const [hx, setHx]         = useState(0)     // mm, max lateral tie spacing (0 = use bMin)
  // Slenderness (nonsway)
  const [slenderOn, setSlenderOn] = useState(true)
  const [kEff, setKEff] = useState(1.0); const [Lu, setLu] = useState(3.0)
  const [M1, setM1] = useState(-150); const [M2, setM2] = useState(200)
  const [EIin, setEIin] = useState(0)   // kN·m², 0 → derive 0.4EcIg/(1+βd)

  const eccentric = mode === 'eccentric'
  const tied = shape === 'tied' || eccentric    // eccentric pilot is tied-rect only
  const Pu = loadInput === 'individual' ? factoredLoad({ dead, live }) : PuDirect

  // ── Cage selection ───────────────────────────────────────────────────
  // Both axes are searched: diameter AND count. Unlike a beam, a column's
  // count is not fixed once the diameter is — 8⌀20 and 4⌀25 are both real.
  const cageChoice = useMemo(() => {
    if (!autoBar || eccentric || barMode !== 'design') return null
    if (!(fc > 0 && fy > 0 && Pu > 0)) return null
    try {
      return optimizeColumnRebar({
        shape: tied ? 'tied' : 'spiral', b, h, D, cover, barDia, tieDia, fc, fy, fyt, Pu,
        system, columnLength: colLen, hx: hx > 0 ? hx : undefined,
      })
    } catch { return null }
  }, [autoBar, eccentric, barMode, tied, b, h, D, cover, barDia, tieDia, fc, fy, fyt, Pu, system, colLen, hx])

  /** The diameter actually detailed — the optimiser's, or the user's field. */
  const dbEff = cageChoice?.db ?? barDia

  const axial = useMemo(() => {
    if (!(fc > 0 && fy > 0 && Pu > 0)) return null
    try {
      return designAxialColumn({
        shape: tied ? 'tied' : 'spiral', b, h, D, cover, barDia: dbEff, tieDia, fc, fy, fyt, Pu,
        numBars: barMode === 'analyze' || eccentric ? numBars : cageChoice?.bars ?? undefined,
        system, columnLength: colLen, hx: hx > 0 ? hx : undefined,
      })
    } catch { return null }
  }, [tied, b, h, D, cover, dbEff, tieDia, fc, fy, fyt, Pu, barMode, numBars, eccentric, system, colLen, hx, cageChoice])

  const slender = useMemo(() => {
    if (!eccentric || !slenderOn) return null
    return momentMagnificationNonsway({
      Pu, M1, M2, k: kEff, Lu, h, shape: 'tied',
      EI: EIin > 0 ? EIin : undefined, fc, b, betaD: 0.6,
    })
  }, [eccentric, slenderOn, Pu, M1, M2, kEff, Lu, h, EIin, fc, b])

  // THE SAME CUT THE DRAWING SET MAKES, from the cage this page has designed —
  // hoop, cross ties and all, at the spacing the check adopted. A spiral column
  // has no cage to cut (`columnCage` builds rectangular tied cages), so it
  // keeps the drawn schematic and this stays null.
  const sectionFigure = useMemo(() => {
    if (!tied || !(b > 0 && h > 0)) return null
    const bars = axial?.bars ?? numBars
    if (!(bars >= 4)) return null
    const spacing = axial?.tieSpacingFinal ?? 0
    if (!(spacing > 0)) return null
    const rect = { b, h, cover, barDia: dbEff, tieDia }
    return calcColumnSection({
      ...rect, bars, spacing,
      title: `SECTION — ${Math.round(b)}×${Math.round(h)}`,
      notes: columnSectionNotes({ id: '', bars, tieSpacingFinal: spacing }, rect),
    })
  }, [tied, b, h, cover, dbEff, tieDia, axial, numBars])

  const unstable = slender !== null && !slender.stable
  const MuEff = slender ? slender.Mc : Mu
  const inter = useMemo(() => {
    if (!eccentric || !(b > 0 && h > 0)) return null
    try { return interaction({ b, h, cover, barDia, tieDia, fc, fy, numBars, layout }) } catch { return null }
  }, [eccentric, b, h, cover, barDia, tieDia, fc, fy, numBars, layout])
  const cap = useMemo(() => {
    if (!inter || !(Pu > 0) || !(MuEff > 0) || !Number.isFinite(MuEff)) return null
    return capacityAtEccentricity({ b, h, cover, barDia, tieDia, fc, fy, numBars, layout }, MuEff / Pu)
  }, [inter, Pu, MuEff, b, h, cover, barDia, tieDia, fc, fy, numBars, layout])

  const solution = useMemo(() => {
    const steps: SolutionStep[] = []
    if (slender) steps.push(...slendernessSolution({ Pu, M1, M2, k: kEff, Lu, h, EI: EIin > 0 ? EIin : undefined, fc, b }, slender))
    if (eccentric && inter && cap) steps.push(...eccentricColumnSolution({ b, h, cover, barDia, tieDia, fc, fy, numBars, layout }, inter, Pu, MuEff, cap))
    if (axial) steps.push(...axialColumnSolution({
      shape: tied ? 'tied' : 'spiral', b, h, D, cover, barDia: dbEff, tieDia, fc, fy, fyt, Pu,
      numBars: barMode === 'analyze' || eccentric ? numBars : cageChoice?.bars ?? undefined,
    }, axial))
    return withRebarSelection(
      steps, cageChoice ? buildRebarSelectionSolution(cageChoice.selection, 'cage') : [],
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slender, eccentric, inter, cap, axial, Pu, MuEff, cageChoice])

  const util = cap && cap.phi * cap.Pn > 1e-9 ? Pu / (cap.phi * cap.Pn) : null

  /**
   * The on-screen verdict, and the SAME object the printed report uses.
   *
   * Built once rather than assembled twice: the PDF already carried a headline,
   * a governing line, stat tiles and utilisation checks, and the page carried
   * none of them. Two hand-built copies of a pass/fail verdict is how a sheet
   * ends up saying OK while the screen says otherwise.
   */
  const verdict = useMemo(() => {
    if (!axial) return null
    const ok = (eccentric ? util !== null && util <= 1 && !unstable : axial.axialOK) && axial.rhoOK
    const spacing = tied ? axial.tieSpacingFinal : axial.spiralPitch
    const checks: VerdictCheck[] = []
    // Axial capacity is meaningful in both modes; the P–M check only exists
    // once there is a moment to interact with.
    if (axial.phiPnMax > 1e-9) checks.push({ name: 'Axial Pu/φPn,max', ratio: Pu / axial.phiPnMax })
    if (eccentric && util !== null) checks.push({ name: 'P–M interaction Pu/φPn', ratio: util })
    // ρ against the 8% ceiling (§410.6.1.1). The 1% floor is a minimum, not a
    // utilisation, so it belongs in the footnote rather than on a bar.
    checks.push({ name: 'Steel ratio ρ/ρmax', ratio: axial.rho / RHO_MAX })
    return {
      ok,
      headline: ok
        ? `DESIGN OK — ${tied ? 'tied' : 'spiral'}, ${eccentric && slender?.slender ? 'slender' : 'short'}`
        : 'CHECK FAILED — revise the section',
      governing: eccentric
        ? (unstable
          ? 'Slender column unstable — Pu ≥ 0.75·Pc (§406.6.4)'
          : `Governing: P–M interaction · utilization ${util !== null ? util.toFixed(2) : '—'}`)
        : `Governing: axial · φPn,max = ${f1(axial.phiPnMax)} kN`,
      stats: [
        { label: 'Longitudinal', value: `${axial.bars}-⌀${dbEff}`, unit: `ρ ${(axial.rho * 100).toFixed(2)}%` },
        { label: tied ? 'Ties' : 'Spiral',
          value: `⌀${tied ? Math.max(tieDia, axial.tieDiaMin) : tieDia}`,
          unit: `@${f0(spacing)} mm` },
        { label: 'φPn,max', value: f1(axial.phiPnMax), unit: 'kN' },
      ] as VerdictStat[],
      checks,
      footnote: `ρ = ${(axial.rho * 100).toFixed(2)}% within ${(RHO_MIN * 100).toFixed(0)} … ${(RHO_MAX * 100).toFixed(0)}% — §410.6.1.1${eccentric && slender ? ` · δ = ${slender.delta.toFixed(3)}` : ''}`,
    }
  }, [axial, eccentric, util, unstable, tied, slender, Pu, dbEff, tieDia])

  // ~12 representative rows for the P-M table, balanced point always included.
  const tableRows = useMemo(() => {
    if (!inter) return []
    const { curve, PnMax } = inter
    const compCap = 0.65 * PnMax
    const balIdx = curve.reduce(
      (b, _, i) => Math.abs(curve[i].c - inter.balanced.c) < Math.abs(curve[b].c - inter.balanced.c) ? i : b, 0,
    )
    const selected = new Set([80, 72, 63, 54, balIdx, 45, 36, 27, 18, 9, 2, 0])
    return [...selected]
      .sort((a, z) => z - a)   // high c first (compression at top of table)
      .map((idx) => ({
        ...curve[idx],
        phiPn: Math.min(curve[idx].phi * curve[idx].Pn, compCap),
        phiMn: curve[idx].phi * curve[idx].Mn,
        isBalanced: idx === balIdx,
        label: idx === 80 ? 'Pure axial' : idx === balIdx ? 'Balanced' : idx === 0 ? 'Pure flexure' : '—',
      }))
      .filter((p) => p.Pn > -100)   // drop deep-tension rows
  }, [inter])

  /** Saved-model column → the page's own fields. The scheduled cage goes to
   *  ANALYZE mode — its bars are a fact to check, not a suggestion — and the
   *  saved frame's system and storey length come along so slenderness and
   *  confinement match the model. The worked solution stays the page's own. */
  const loadSaved = (req: MemberLoadRequest) => {
    const c = req.design.columns.find((x) => x.id === req.id)
    const sec = req.section
    if (!c || !sec) return
    setMode(Math.abs(c.Mu) > 1e-9 ? 'eccentric' : 'axial')
    setSystem(req.design.system)
    setB(sec.b); setH(sec.h); setCover(sec.cover)
    setBarDia(sec.barDia); setTieDia(sec.tieDia)
    setFc(sec.fc); setFy(sec.fy)
    setBarMode('analyze'); setAutoBar(false)
    setNumBars(c.bars > 0 ? c.bars : (sec.barCount ?? 8))
    setLayout(c.layout ?? 'all-around')
    setLoadInput('direct')
    setPuDirect(c.Pu); setMu(c.Mu)
    setColLen(Math.round(c.L * 1000)); setLu(c.L)
  }

  const resultRows: ResultRow[] = axial ? [
    ...axial.inputNotes.map((n) => ({ check: 'Section', basis: 'geometry', demand: n, status: 'fail' as const })),
    ...(eccentric && slender ? [unstable
      ? { check: 'Slenderness', basis: '§406.6.4', demand: `Pu ≥ 0.75·Pc (${f1(0.75 * slender.Pc)} kN) — unstable`, status: 'fail' as const }
      : { check: 'Magnified moment Mc', basis: `δ ${slender.delta.toFixed(3)} · ${slender.slender ? 'slender' : 'short'}`, demand: `${f2(slender.Mc)} kN·m`, status: 'info' as const }] : []),
    ...(eccentric && util !== null && cap ? [{ check: 'P–M interaction', basis: `e ${f0((MuEff / Pu) * 1000)} mm`, demand: `${f1(Pu)} kN`, limit: `φPn ${f1(cap.phi * cap.Pn)} kN`, ratio: util, status: util <= 1 ? 'pass' as const : 'fail' as const }] : []),
    { check: 'Longitudinal bars', basis: `ρ ${(axial.rho * 100).toFixed(2)} % (1–8 %, §410.6.1.1)`, demand: `${axial.bars}-⌀${dbEff}`, status: axial.inputNotes.length > 0 ? 'info' : axial.rhoOK ? 'pass' : 'fail' },
    { check: 'Axial capacity φPn,max', basis: `Po ${f1(axial.Po)} kN · ${axial.alpha.toFixed(2)}Po cap`, demand: `${f1(Pu)} kN`, limit: `${f1(axial.phiPnMax)} kN`, ratio: axial.phiPnMax > 0 ? Pu / axial.phiPnMax : undefined, status: eccentric ? 'info' : axial.axialOK ? 'pass' : 'fail' },
    ...(tied ? [
      { check: 'Ties', basis: axial.tieSpacingLabel, demand: `⌀${Math.max(tieDia, axial.tieDiaMin)} @ ${f0(axial.tieSpacingFinal)} mm`, status: 'info' as const },
      ...(system !== 'gravity' && axial.seismicSConf !== undefined ? [
        { check: 'Confinement zone lo', basis: system === 'smf' ? '§418.7.5.1' : '§418.4.3', demand: `${f0(axial.seismicLoZone ?? 0)} mm`, status: 'info' as const },
        { check: 'Spacing in lo', basis: system === 'smf' ? '§418.7.5.4' : '§418.4.3', demand: `${f0(axial.seismicSConf)} mm`, status: 'info' as const },
        ...(system === 'smf' && axial.seismicSOut !== undefined ? [{ check: 'Spacing outside lo', basis: '§418.7.5.5', demand: `${f0(axial.seismicSOut)} mm`, status: 'info' as const }] : []),
      ] : []),
    ] : [{ check: 'Spiral', basis: `ρs ${axial.rhoS.toFixed(4)}`, demand: `⌀${tieDia} @ ${f0(axial.spiralPitch)} mm`, status: axial.pitchClearOK ? 'pass' as const : 'fail' as const }]),
    ...(eccentric && inter ? [{ check: 'Balanced point', basis: `eb ${f0(inter.balanced.eb * 1000)} mm`, demand: `Pb ${f1(inter.balanced.Pb)} kN, Mb ${f1(inter.balanced.Mb)} kN·m`, status: 'info' as const }] : []),
  ] : [{ check: 'Column', basis: 'invalid input', demand: 'Positive section, materials and load.', status: 'warn' as const }]

  const pmTable = eccentric && inter && tableRows.length > 0 ? (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-hairline text-left uppercase tracking-wide text-muted">
            {['Point', 'c (mm)', 'εt', 'φ', 'Pn (kN)', 'Mn (kN·m)', 'φPn (kN)', 'φMn (kN·m)'].map((t) => <th key={t} className="pb-1.5 pr-3 font-semibold">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-hairline-2 bg-sheet-2">
            <td className="py-1 pr-3 font-semibold text-muted">Max. axial cap</td>
            <td className="py-1 pr-3 text-muted">—</td><td className="py-1 pr-3 text-muted">—</td><td className="py-1 pr-3 text-muted">0.65</td>
            <td className="py-1 pr-3 text-muted">{f1(inter.PnMax)}</td><td className="py-1 pr-3 text-muted">0</td>
            <td className="py-1 pr-3 font-semibold text-ink">{f1(0.65 * inter.PnMax)}</td><td className="py-1 font-semibold text-ink">0</td>
          </tr>
          {tableRows.map((row, i) => (
            <tr key={i} className={`border-b border-hairline-2 last:border-0 ${row.isBalanced ? 'bg-brand-tint' : ''}`}>
              <td className={`py-1 pr-3 ${row.isBalanced ? 'font-semibold text-brand' : 'text-muted'}`}>{row.label}</td>
              <td className="py-1 pr-3 text-muted">{f0(row.c)}</td>
              <td className="py-1 pr-3 text-muted">{row.et.toFixed(4)}</td>
              <td className="py-1 pr-3 text-muted">{row.phi.toFixed(2)}</td>
              <td className="py-1 pr-3 text-muted">{f1(row.Pn)}</td>
              <td className="py-1 pr-3 text-muted">{f1(Math.abs(row.Mn))}</td>
              <td className={`py-1 pr-3 font-semibold ${row.isBalanced ? 'text-brand' : 'text-ink'}`}>{f1(Math.max(0, row.phiPn))}</td>
              <td className={`py-1 font-semibold ${row.isBalanced ? 'text-brand' : 'text-ink'}`}>{f1(Math.max(0, row.phiMn))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cap && (
        <p className="mt-2 text-[11px] text-muted">
          Demand Pu = {f1(Pu)} kN, Mu = {f1(MuEff)} kN·m — capacity at e = {f0((MuEff / Pu) * 1000)} mm: φPn = {f1(cap.phi * cap.Pn)} kN, utilisation {util !== null ? `${(util * 100).toFixed(0)} %` : '—'}. Balanced: Pb = {f1(inter.balanced.Pb)} kN, Mb = {f1(inter.balanced.Mb)} kN·m.
        </p>
      )}
    </div>
  ) : null

  const sectionNode = sectionFigure ? <SheetFigure drawing={sectionFigure} width={420} />
    : <ColumnSchematic shape="spiral" b={b} h={h} D={D} cover={cover} barDia={dbEff} tieDia={tieDia} bars={axial?.bars ?? numBars} tieSpacing={axial?.spiralPitch} />

  return (
    <WorkspacePage title="RC Column" badges={['Concrete', 'ACI 318-14 · NSCP 2015']}
      intro="A tied or spiral reinforced-concrete column: concentric axial design with the cage chosen by the optimiser, or an eccentric P–M check of a given cage with nonsway slenderness magnification, plus the gravity, IMF and SMF confinement rules for the ties."
      report={axial && verdict && solution.length > 0 ? {
        docCode: 'C-01', ok: verdict.ok, governing: verdict.governing,
        stats: [
          { label: 'Bars', value: `${axial.bars}-⌀${dbEff}` },
          { label: tied ? 'Ties' : 'Spiral pitch', value: tied ? `⌀${Math.max(tieDia, axial.tieDiaMin)} @${f0(axial.tieSpacingFinal)}` : `@${f0(axial.spiralPitch)}`, unit: 'mm' },
          { label: 'φPn,max', value: f1(axial.phiPnMax), unit: 'kN' },
          ...(eccentric && slender ? [{ label: 'Column class', value: slender.slender ? 'LONG (slender)' : 'SHORT' }] : []),
        ],
        // the same checks the screen shows — axial mode used to print none
        checks: verdict.checks.map((c) => ({ name: c.name, ratio: c.ratio, ok: c.ratio !== null && c.ratio <= 1.0001 })),
        data: [
          ['Section', tied ? `${b} × ${h} mm (tied)` : `⌀${D} mm (spiral)`], ['Clear cover', `${cover} mm`],
          ["Concrete f'c", `${fc} MPa`], ['Steel fy / fyt', `${fy} / ${fyt} MPa`],
          ['Bar ⌀ / tie ⌀', `${dbEff} / ${tieDia} mm`], ['ρ provided', `${(axial.rho * 100).toFixed(2)} %`],
          ['Pu', `${f1(Pu)} kN`], ...(eccentric ? [['Mu', `${f1(Mu)} kN·m`] as [string, string]] : []),
        ],
        steps: solution, drawingTitle: 'Column Section',
      } : undefined}
      inputs={<>
        <div className="no-print"><ModelMemberResults kind="column" onLoad={loadSaved} /></div>
        <InputGroup title="Column">
          {!eccentric && barMode === 'design' && (
            <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-ink">
              <input type="checkbox" checked={autoBar} onChange={(e) => setAutoBar(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
              Auto-select cage
            </label>
          )}
          <Pick label="Loading" value={mode} onChange={(v) => setMode(v as Mode)} options={[['axial', 'Concentric (axial)'], ['eccentric', 'Eccentric (P + M)']]} />
          <Pick label="Shape" value={eccentric ? 'tied' : shape} onChange={(v) => setShape(v as ColumnShape)}
            options={eccentric ? [['tied', 'Tied rectangular']] : [['tied', 'Tied rectangular'], ['spiral', 'Spiral circular']]} />
          {tied ? <>
            <Num label="Width b" unit="mm" value={b} onChange={setB} min={1} />
            <Num label="Depth h (bending)" unit="mm" value={h} onChange={setH} min={1} />
          </> : <Num label="Diameter D" unit="mm" value={D} onChange={setD} min={1} />}
          <Num label="Clear cover" unit="mm" value={cover} onChange={setCover} min={0} />
          <Num label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={dbEff} onChange={setBarDia} min={1} disabled={!!cageChoice}
            hint={cageChoice ? (cageChoice.db ? 'chosen by the optimiser' : 'no compliant cage — see the ranking') : undefined} />
          <Num label={tied ? <>Tie <KTex tex="d_t" /></> : <>Spiral <KTex tex="d_s" /></>} unit="mm" value={tieDia} onChange={setTieDia} min={1} />
          <Pick label="Bars" value={eccentric ? 'analyze' : barMode} onChange={(v) => setBarMode(v as BarMode)}
            options={eccentric ? [['analyze', 'Given count']] : [['design', 'Design automatically'], ['analyze', 'Given count']]} />
          {(barMode === 'analyze' || eccentric) && <Num label="No. of bars" value={numBars} onChange={setNumBars} min={tied ? 4 : 6} step="1" />}
          {eccentric && <Pick label="Bar distribution" value={layout} onChange={(v) => setLayout(v as BarLayout)} options={[['all-around', 'All four faces'], ['two-face', 'Two faces (⟂ to h)']]} />}
        </InputGroup>
        <InputGroup title="Materials">
          <Num label={<KTex tex="f'_c" />} unit="MPa" value={fc} onChange={setFc} min={1} />
          <Num label={<KTex tex="f_y" />} unit="MPa" value={fy} onChange={setFy} min={1} />
          <Num label={<KTex tex="f_{yt}" />} unit="MPa" value={fyt} onChange={setFyt} min={1} />
        </InputGroup>
        <InputGroup title="Lateral system" hint={system === 'smf' ? 'hx = centre-to-centre of the outermost laterally restrained bars (≤ 350 mm); 0 uses the least dimension.' : undefined}>
          <div className="col-span-2">
            <Pick label="System" value={system} onChange={(v) => setSystem(v as LateralSystem)}
              options={[['gravity', 'Gravity only (§425.7.2)'], ['imf', 'IMF — Intermediate MF (§418.4.3)'], ['smf', 'SMF — Special MF (§418.7.5)']]} />
          </div>
          {system !== 'gravity' && <Num label="Clear height Lu" unit="mm" value={colLen} onChange={setColLen} />}
          {system === 'smf' && <Num label="Max bar spacing hx" unit="mm" value={hx} onChange={setHx} />}
        </InputGroup>
        <InputGroup title="Loads" hint={loadInput === 'individual' ? `Pu = max(1.4D, 1.2D + 1.6L) = ${f0(Pu)} kN` : undefined}>
          <div className="col-span-2">
            <Pick label="Load entry" value={loadInput} onChange={(v) => setLoadInput(v as LoadInput)} options={[['individual', 'Individual (D & L)'], ['direct', 'Factored Pu']]} />
          </div>
          {loadInput === 'individual' ? <>
            <Num label={<>Dead <KTex tex="D" /></>} unit="kN" value={dead} onChange={setDead} />
            <Num label={<>Live <KTex tex="L" /></>} unit="kN" value={live} onChange={setLive} />
          </> : <Num label={<KTex tex="P_u" />} unit="kN" value={PuDirect} onChange={setPuDirect} />}
          {eccentric && <Num label={<KTex tex="M_u" />} unit="kN·m" value={Mu} onChange={setMu} />}
        </InputGroup>
        {eccentric && (
          <InputGroup title="Slenderness (nonsway)" hint={slenderOn ? 'Sheet convention: M1/M2 negative for single curvature.' : undefined}>
            <div className="col-span-2">
              <Pick label="Consider slenderness" value={slenderOn ? 'yes' : 'no'} onChange={(v) => setSlenderOn(v === 'yes')} options={[['no', 'No — short column'], ['yes', 'Yes — magnify moment']]} />
            </div>
            {slenderOn && <>
              <Num label="k" value={kEff} onChange={setKEff} />
              <Num label={<KTex tex="L_u" />} unit="m" value={Lu} onChange={setLu} />
              <Num label={<KTex tex="M_1" />} unit="kN·m" value={M1} onChange={setM1} />
              <Num label={<KTex tex="M_2" />} unit="kN·m" value={M2} onChange={setM2} />
              <Num label="EI (0 = 0.4EcIg/1.6)" unit="kN·m²" value={EIin} onChange={setEIin} />
            </>}
          </InputGroup>
        )}
      </>}
      checks={verdict && axial ? <>
        <CheckCard title="Design" basis={verdict.governing} status={verdict.ok ? 'pass' : 'fail'} pillLabel={verdict.ok ? 'DESIGN OK' : 'REVISE'}
          value={verdict.stats[0].value} unit={verdict.stats[0].unit}
          pairs={verdict.stats.slice(1).map((st) => ({ label: st.label, value: `${st.value}${st.unit ? ` ${st.unit}` : ''}` }))} />
        {verdict.checks.map((c) => (
          <CheckCard key={c.name} title={c.name} basis="ACI 318-14 / NSCP 2015" status={c.ratio === null ? 'info' : c.ratio <= 1.0001 ? 'pass' : 'fail'}
            pillLabel={c.ratio === null ? 'NOT RUN' : undefined} value={c.ratio === null ? '—' : f2(c.ratio)} ratio={c.ratio ?? undefined} ratioLabel="Utilization" />
        ))}
      </> : (
        <CheckCard title="Check the inputs" basis="column" status="warn" pillLabel="CHECK" value="—" formula="Positive section, materials and load." />
      )}
      summary={[
        { label: 'Section', value: tied ? `${f0(b)} × ${f0(h)} mm tied, cover ${f0(cover)} mm` : `⌀${f0(D)} mm spiral, cover ${f0(cover)} mm` },
        { label: "Materials f'c / fy / fyt", value: `${f0(fc)} / ${f0(fy)} / ${f0(fyt)} MPa` },
        { label: 'Loads', value: `Pu ${f1(Pu)} kN${eccentric ? `, Mu ${f1(Mu)} kN·m` : ''}` },
        { label: 'System', value: system === 'gravity' ? 'gravity only' : system.toUpperCase() },
      ]}
      drawing={{ title: 'Section', node: <div data-pdf-drawing>{sectionNode}</div> }}
      resultsCaption={verdict?.footnote}
      results={resultRows}
      extraSections={[
        ...(eccentric && inter ? [{ title: 'Interaction diagram', node: <InteractionDiagram r={inter} Pu={Pu} Mu={MuEff} /> }] : []),
        ...(pmTable ? [{ title: 'P–M interaction table — design envelope', node: pmTable }] : []),
        ...(cageChoice ? [{ title: 'Cage selection', node: <RebarRanking selection={cageChoice.selection} title="Ranked cages" /> }] : []),
      ]}
      steps={solution.length ? solution : [{ title: 'Check the inputs', lines: [{ text: 'Positive section, materials and load.' }] }]}
      references={[
        { topic: 'Axial capacity', basis: 'Po, 0.80 / 0.85 Po cap, φ', source: 'ACI 318-14 §22.4; NSCP 2015 §422.4' },
        { topic: 'P–M interaction', basis: 'strain compatibility, φ by εt', source: 'ACI 318-14 §22.4, §21.2.2' },
        { topic: 'Slenderness', basis: 'nonsway moment magnification', source: 'ACI 318-14 §6.6.4' },
        { topic: 'Reinforcement limits', basis: 'ρ between 1 % and 8 %', source: 'NSCP 2015 §410.6.1.1' },
        { topic: 'Ties and confinement', basis: 'gravity, IMF, SMF', source: 'NSCP 2015 §425.7.2, §418.4.3, §418.7.5' },
      ]}
    />
  )
}
