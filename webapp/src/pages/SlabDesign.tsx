import { useMemo, useState } from 'react'
import { designSlabDDM, type SlabInput, type SlabDirResult, type SlabSectionSteel } from '../engine/slabDDM'
import { optimizeSlabRebar } from '../engine/matRebarOptimize'
import { RebarRanking } from '../components/RebarRanking'
import { buildRebarSelectionSolution, withRebarSelection } from '../lib/rebarSolution'
import { nameMat } from '../lib/rebarLabel'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard, ResultsTable, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { buildSlabSolution } from '../lib/slabSolution'
import { Math as KTex } from '../lib/math'
import { SlabBarSection } from '../components/SlabBarSection'
import { tempSteelArea, tempSpacingMax } from '../engine/slabBarDetail'
import { f0, f1, f2 } from '../lib/format'
import { ModelMemberResults } from '../components/ModelMemberResults'
import { backSolvedServiceLoads, type MemberLoadRequest } from '../lib/modelMemberResults'

interface FormState {
  lx: number; ly: number
  colWidth: number
  D: number; L: number
  fc: number; fy: number
  h: number                // NaN = auto
  cover: number; barDia: number
  extX: 'yes' | 'no'
  extY: 'yes' | 'no'
  withBeams: 'yes' | 'no'
}

const DEFAULTS: FormState = {
  lx: 6, ly: 6, colWidth: 400,
  D: 5, L: 2,
  fc: 28, fy: 415,
  h: NaN,
  cover: 20, barDia: 12,
  extX: 'no', extY: 'no',
  withBeams: 'yes',
}

/** The mat adopted for one strip: bars laid on a spacing MODULE, not the
 *  arithmetic spacing that falls out of As/Ab. */
export interface StripMat { bars: number; spacing: number }

function steelText(s: SlabSectionSteel, db: number, mat?: StripMat) {
  const m = mat ?? s
  return `${m.bars}⌀${db} @${f0(m.spacing)} mm`
}
function steelSub(s: SlabSectionSteel) {
  return `As=${f0(s.As)} mm²${s.usedMin ? ' (T/S min)' : ''}`
}

function DirTable({ dir, barDia, mats }: {
  dir: SlabDirResult; barDia: number
  /** Keyed by `slabStrips`' label, so the schedule quotes the adopted mat. */
  mats?: Map<string, StripMat>
}) {
  const mat = (loc: string, which: 'column' | 'middle') =>
    mats?.get(`${dir.dir}-dir ${loc} ${which} strip`)
  return (
    <div>
      <p className="mb-2 font-mono text-[11.5px] text-muted">
        l₁ {f2(dir.l1)} m · l₂ {f2(dir.l2)} m · lₙ {f2(dir.ln)} m · Mo {f1(dir.Mo)} kN·m · d {f1(dir.d)} mm · column strip {f2(dir.csWidth)} m, middle {f2(dir.msWidth)} m
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-hairline text-left uppercase tracking-wide text-muted">
              <th className="pb-1 pr-2 font-semibold">Location</th>
              <th className="pb-1 pr-2 font-semibold">M (kN·m)</th>
              <th className="pb-1 pr-2 font-semibold">Column strip</th>
              <th className="pb-1 font-semibold">Middle strip</th>
            </tr>
          </thead>
          <tbody>
            {dir.locations.map((loc) => (
              <tr key={loc.name} className="border-b border-hairline-2 last:border-0">
                <td className="py-1 pr-2 font-medium text-ink-2">{loc.name}</td>
                <td className="py-1 pr-2 text-muted">{f1(loc.M)}</td>
                <td className="py-1 pr-2">
                  <div className="font-semibold text-ink">{steelText(loc.column, barDia, mat(loc.name, 'column'))}</div>
                  <div className="text-muted">{steelSub(loc.column)}</div>
                </td>
                <td className="py-1">
                  {loc.middle.b > 0 ? (
                    <>
                      <div className="font-semibold text-ink">{steelText(loc.middle, barDia, mat(loc.name, 'middle'))}</div>
                      <div className="text-muted">{steelSub(loc.middle)}</div>
                    </>
                  ) : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SlabDesign() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const [autoBar, setAutoBar] = useState(true)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  const input = useMemo((): SlabInput => ({
    lx: f.lx, ly: f.ly, colWidth: f.colWidth,
    D: f.D, L: f.L,
    fc: f.fc, fy: f.fy,
    h: Number.isFinite(f.h) ? f.h : undefined,
    cover: f.cover, barDia: f.barDia,
    exterior: { x: f.extX === 'yes', y: f.extY === 'yes' },
    withBeams: f.withBeams === 'yes',
  }), [f])

  const valid = useMemo(() => {
    const nums: (keyof FormState)[] = ['lx', 'ly', 'colWidth', 'D', 'L', 'fc', 'fy', 'cover', 'barDia']
    return nums.every((k) => Number.isFinite(f[k] as number)) && f.lx > 0 && f.ly > 0 && f.fc > 0 && f.fy > 0 && f.D >= 0 && f.L >= 0
  }, [f])

  // ── Mat selection ────────────────────────────────────────────────────
  // ONE diameter for the panel, spacing chosen per strip — which is how a
  // slab is drawn, and why the strips carry their own spacing below.
  const slabChoice = useMemo(
    () => (autoBar && valid ? optimizeSlabRebar(input) : null),
    [autoBar, valid, input],
  )
  const dbEff = slabChoice?.db ?? f.barDia
  const inputEff = useMemo(() => ({ ...input, barDia: dbEff }), [input, dbEff])
  const mats = useMemo(() => {
    const m = new Map<string, StripMat>()
    for (const st of slabChoice?.strips ?? []) m.set(st.label, { bars: st.bars, spacing: st.spacing })
    return m
  }, [slabChoice])

  const r = useMemo(() => (valid ? designSlabDDM(inputEff) : null), [valid, inputEff])
  // §424.4.3 shrinkage and temperature steel — a slab detail the DDM result
  // does not carry, because it is not a flexural demand.
  const temp = useMemo(() => tempSteelArea(r?.h ?? 0, f.fy), [r, f.fy])

  const defl = r?.deflection

  const solution = r
    ? withRebarSelection(
        buildSlabSolution(inputEff, r),
        slabChoice ? buildRebarSelectionSolution(slabChoice.selection, 'mat') : [],
      )
    : null

  const report = r ? {
    docCode: 'S-SL',
    ok: r.applicable && (!defl || (defl.liveOK && defl.totalOK)),
    governing: r.applicable
      ? `Two-way DDM · h = ${r.h} mm · wu = ${f1(r.wu)} kPa`
      : 'DDM not fully applicable — see notes',
    stats: [
      { label: 'Adopted thickness h', value: String(r.h), unit: 'mm' },
      { label: 'Factored load wu', value: f1(r.wu), unit: 'kPa' },
      { label: 'Panel ratio ly/lx', value: f2(r.ratio) },
    ],
    checks: [
      // Thickness and deflection are the two the slab can actually fail on;
      // the strip moments are satisfied by design, not checked against a demand.
      { name: 'Minimum thickness h/hmin', ratio: r.h > 0 ? r.hmin / r.h : 0, ok: r.h >= r.hmin },
      ...(defl ? [
        { name: 'Immediate live deflection (L/360)', ratio: defl.immLive / defl.limitLive, ok: defl.liveOK },
        { name: 'Total long-term deflection (L/240)', ratio: defl.total / defl.limitTotal, ok: defl.totalOK },
      ] : []),
    ],
    data: [
      ['Spans lx × ly', `${f2(f.lx)} × ${f2(f.ly)} m`],
      ['Column width', `${f.colWidth} mm`],
      ['Dead load D', `${f1(f.D)} kPa`],
      ['Live load L', `${f1(f.L)} kPa`],
      ["Concrete f'c", `${f.fc} MPa`],
      ['Steel fy', `${f.fy} MPa`],
      ['Cover / bar ⌀', `${f.cover} / ${dbEff} mm`],
      ['Minimum thickness', `${Math.round(r.hmin)} mm`],
      ['Panel action', r.twoWay ? 'two-way' : 'one-way'],
      ['Exterior x / y', `${f.extX} / ${f.extY}`],
      ['Beams on edges', f.withBeams],
      ['Mo (x / y)', `${f1(r.x.Mo)} / ${f1(r.y.Mo)} kN·m`],
      ...(r.notes.length ? [['DDM notes', r.notes.join(' · ')] as [string, string]] : []),
    ] as [string, string][],
    steps: solution ?? undefined,
  } : undefined

  /** Saved-model panel → the page's own fields. Dimensions, thickness and the
   *  mat's diameter are the schedule's own facts; the service D/L pair is
   *  back-solved from the panel's factored wu at this page's default 5:2 split
   *  — the DDM is linear in wu, so the page's solution reproduces the saved
   *  panel's moments and mats. */
  const loadSaved = (req: MemberLoadRequest) => {
    const s = req.design.slabs.find((x) => x.plate === req.id)
    if (!s) return
    setAutoBar(false)
    const r2 = (v: number) => Number(v.toFixed(2))
    const { dead, live } = backSolvedServiceLoads(s.design.wu, 0.4)
    setF((f) => ({
      ...f, lx: s.lx, ly: s.ly, h: s.design.h, barDia: s.barDia,
      D: r2(dead), L: r2(live),
    }))
  }

  const hOK = r ? r.h >= r.hmin : false
  const deflRows: ResultRow[] = defl ? [
    { check: 'Immediate (D + L)', basis: defl.cracked ? 'cracked — Branson Ie' : 'uncracked', demand: `${f1(defl.immediate)} mm`, status: 'info' },
    { check: 'Immediate live', basis: 'L/360', demand: `${f1(defl.immLive)} mm`, limit: `${f1(defl.limitLive)} mm`, ratio: defl.immLive / defl.limitLive, status: defl.liveOK ? 'pass' : 'fail' },
    { check: 'Long-term dead', basis: `λΔ ${defl.lambdaDelta.toFixed(2)} (ξ = 2.0, ρ′ = 0)`, demand: `${f1(defl.longTerm)} mm`, status: 'info' },
    { check: 'Total (LT dead + imm. live)', basis: 'L/240', demand: `${f1(defl.total)} mm`, limit: `${f1(defl.limitTotal)} mm`, ratio: defl.total / defl.limitTotal, status: defl.totalOK ? 'pass' : 'fail' },
  ] : []
  // the section quotes the ADOPTED mat, the same one the strip tables print
  const stripSpacing = (loc: string, strip: 'column' | 'middle', fallback: number) =>
    mats.get(`x-dir ${loc} ${strip} strip`)?.spacing ?? fallback
  return (
    <WorkspacePage title="Two-Way Slab" badges={['Concrete', 'ACI 318-14 §8.10 · NSCP 2015 §408.10']}
      intro="Direct Design Method for square or rectangular interior and end panels: column-strip and middle-strip flexure, the temperature and shrinkage minimum, §408.7.2.2 spacing, and mid-panel deflection by the crossing-strip method with Branson's Ie."
      report={report}
      inputs={<>
        <div className="no-print"><ModelMemberResults kind="slab" onLoad={loadSaved} /></div>
        <InputGroup title="Panel geometry">
          <Num label={<>Span <KTex tex="l_x" /> (short)</>} unit="m" value={f.lx} onChange={set('lx')} min={0.1} />
          <Num label={<>Span <KTex tex="l_y" /> (long)</>} unit="m" value={f.ly} onChange={set('ly')} min={0.1} />
          <Num label="Column width" unit="mm" value={f.colWidth} onChange={set('colWidth')} min={0} />
        </InputGroup>
        <InputGroup title="Service loads">
          <Num label={<>Dead <KTex tex="D" /></>} unit="kPa" value={f.D} onChange={set('D')} min={0} />
          <Num label={<>Live <KTex tex="L" /></>} unit="kPa" value={f.L} onChange={set('L')} min={0} />
        </InputGroup>
        <InputGroup title="Materials">
          <Num label={<KTex tex="f'_c" />} unit="MPa" value={f.fc} onChange={set('fc')} min={1} />
          <Num label={<KTex tex="f_y" />} unit="MPa" value={f.fy} onChange={set('fy')} min={1} />
        </InputGroup>
        <InputGroup title="Detailing">
          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-ink">
            <input type="checkbox" checked={autoBar} onChange={(e) => setAutoBar(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
            Auto-select bar ⌀ and spacing
          </label>
          <Num label="Thickness h (blank = auto)" unit="mm" value={f.h} onChange={set('h')} min={1} />
          <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} min={0} />
          <Num label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={dbEff} onChange={set('barDia')} min={1} disabled={autoBar}
            hint={autoBar ? (slabChoice?.db ? 'chosen by the optimiser' : 'no compliant mat — see the ranking') : undefined} />
        </InputGroup>
        <InputGroup title="Span type">
          <Pick label="End span in x?" value={f.extX} onChange={set('extX')} options={[['no', 'Interior'], ['yes', 'End span']]} />
          <Pick label="End span in y?" value={f.extY} onChange={set('extY')} options={[['no', 'Interior'], ['yes', 'End span']]} />
          <div className="col-span-2">
            <Pick label="Beams on all edges?" value={f.withBeams} onChange={set('withBeams')} options={[['yes', 'Yes (grid beams)'], ['no', 'No (flat plate)']]} />
          </div>
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Panel" basis={r.applicable ? 'DDM applicable' : 'DDM not fully applicable — see notes'} status={r.applicable ? 'pass' : 'warn'}
          pillLabel={r.applicable ? (r.twoWay ? 'TWO-WAY' : 'ONE-WAY') : 'REVIEW'} value={`${r.h} mm`} unit="thickness"
          pairs={[{ label: 'ly / lx', value: f2(r.ratio) }, { label: 'wu', value: `${f1(r.wu)} kPa` }]} />
        <CheckCard title="Minimum thickness" basis="h ≥ h_min" status={hOK ? 'pass' : 'fail'} value={`${Math.round(r.hmin)} mm`} unit="h_min"
          ratio={r.h > 0 ? r.hmin / r.h : undefined} ratioLabel="h_min ÷ h" />
        {defl ? <>
          <CheckCard title="Live deflection" basis="L/360" status={defl.liveOK ? 'pass' : 'fail'} value={f1(defl.immLive)} unit="mm"
            ratio={defl.immLive / defl.limitLive} ratioLabel="δ ÷ limit" />
          <CheckCard title="Total deflection" basis="L/240" status={defl.totalOK ? 'pass' : 'fail'} value={f1(defl.total)} unit="mm"
            ratio={defl.total / defl.limitTotal} ratioLabel="δ ÷ limit" />
        </> : <CheckCard title="Deflection" basis="§24.2 crossing strip" status="info" pillLabel="NOT RUN" value="—" />}
      </> : (
        <CheckCard title="Check the inputs" basis="two-way slab" status="warn" pillLabel="CHECK" value="—" formula="Enter valid panel inputs." />
      )}
      summary={[
        { label: 'Spans lx × ly', value: `${f2(f.lx)} × ${f2(f.ly)} m` },
        { label: 'Loads', value: `D ${f1(f.D)}, L ${f1(f.L)} kPa` },
        { label: "f'c / fy", value: `${f.fc} / ${f.fy} MPa` },
        { label: 'Edges', value: `${f.extX === 'yes' ? 'end' : 'interior'} in x, ${f.extY === 'yes' ? 'end' : 'interior'} in y, ${f.withBeams === 'yes' ? 'beams' : 'flat plate'}` },
      ]}
      drawing={r ? { title: 'Bar arrangement — section through the span', node: <div data-pdf-drawing className="space-y-4">
        {(['column', 'middle'] as const).map((strip) => {
          const loc = r.x.locations.find((l) => l.name === '+M') ?? r.x.locations[0]
          const neg = r.x.locations.find((l) => l.name.includes('−M')) ?? loc
          const sec = strip === 'column' ? loc.column : loc.middle
          const negSec = strip === 'column' ? neg.column : neg.middle
          return (
            <SlabBarSection key={strip} strip={strip}
              l1={r.x.l1} support={f.colWidth / 1000} h={r.h} cover={f.cover}
              topBars={`⌀${dbEff} @ ${f0(stripSpacing(neg.name, strip, negSec.spacing))} mm`}
              bottomBars={`⌀${dbEff} @ ${f0(stripSpacing(loc.name, strip, sec.spacing))} mm`}
              tempBars={`As ${f0(temp.As)} mm²/m · max s ${f0(tempSpacingMax(r.h))} mm`} />
          )
        })}
      </div> } : undefined}
      resultsCaption={r ? [...r.notes, 'Sections are taken along l₁ in the x-direction: top steel is the negative-moment mat over the supports, bottom steel the positive-moment mat at mid-span, the shrinkage and temperature bars cut end-on. Cut-offs follow ACI 318-14 Fig. 8.7.4.1.3(a); the column strip bottom mat is continuous with at least two bars through the column core (§8.7.4.2).'].join(' ') : undefined}
      results={r ? [
        { check: 'Panel ratio ly / lx', basis: r.twoWay ? 'two-way ≤ 2' : 'one-way > 2', demand: f2(r.ratio), status: r.twoWay ? 'pass' : 'warn' },
        { check: 'Adopted thickness', basis: `h_min ${Math.round(r.hmin)} mm`, demand: `${r.h} mm`, limit: `${Math.round(r.hmin)} mm`, status: hOK ? 'pass' : 'fail' },
        { check: 'Factored load wu', basis: '1.2D + 1.6L', demand: `${f1(r.wu)} kPa`, status: 'info' },
        { check: 'Static moment Mo', basis: 'x / y', demand: `${f1(r.x.Mo)} / ${f1(r.y.Mo)} kN·m`, status: 'info' },
        { check: 'Temperature steel', basis: '§424.4.3', demand: `${f0(temp.As)} mm²/m`, limit: `s ≤ ${f0(tempSpacingMax(r.h))} mm`, status: 'info' },
      ] : [{ check: 'Panel', basis: 'invalid input', demand: '—', status: 'warn' }]}
      extraSections={r ? [
        { title: `Direction x (l₁ = ${f2(r.x.l1)} m)`, node: <DirTable dir={r.x} barDia={dbEff} mats={mats} /> },
        { title: `Direction y (l₁ = ${f2(r.y.l1)} m)`, node: <DirTable dir={r.y} barDia={dbEff} mats={mats} /> },
        ...(defl ? [{ title: 'Deflection — §24.2 crossing strip', node: <ResultsTable rows={deflRows} /> }] : []),
        ...(slabChoice ? [{ title: 'Mat selection — whole panel', node: <RebarRanking selection={slabChoice.selection} title="Ranked mats" name={nameMat} /> }] : []),
      ] : []}
      steps={solution ?? [{ title: 'Check the inputs', lines: [{ text: 'Enter valid panel inputs.' }] }]}
      references={[
        { topic: 'Direct Design Method', basis: 'Mo, distribution to column and middle strips', source: 'ACI 318-14 §8.10; NSCP 2015 §408.10' },
        { topic: 'Minimum thickness', basis: 'two-way slab h_min', source: 'ACI 318-14 §8.3.1' },
        { topic: 'Spacing and minimum steel', basis: '§408.7.2.2, shrinkage and temperature', source: 'NSCP 2015 §408.7.2.2, §424.4.3' },
        { topic: 'Bar cut-offs', basis: 'flat plate without drop panels', source: 'ACI 318-14 Fig. 8.7.4.1.3(a), §8.7.4.2' },
        { topic: 'Deflection', basis: 'crossing-strip, Branson Ie', source: 'ACI 318-14 §24.2' },
      ]}
    />
  )
}
