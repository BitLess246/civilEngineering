import { useMemo, useState } from 'react'
import { designSlabDDM, type SlabInput, type SlabDirResult, type SlabSectionSteel } from '../engine/slabDDM'
import { optimizeSlabRebar } from '../engine/matRebarOptimize'
import { RebarRanking } from '../components/RebarRanking'
import { buildRebarSelectionSolution, withRebarSelection } from '../lib/rebarSolution'
import { nameMat } from '../lib/rebarLabel'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { buildSlabSolution } from '../lib/slabSolution'
import { Math as KTex } from '../lib/math'
import { SlabBarSection } from '../components/SlabBarSection'
import { tempSteelArea, tempSpacingMax } from '../engine/slabBarDetail'
import { f0, f1, f2 } from '../lib/format'
import 'katex/dist/katex.min.css'
import { WorkedSolution } from '../components/WorkedSolution'
import { PageHeader } from '../components/calc'

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

function DirCard({ title, dir, barDia, mats }: {
  title: string; dir: SlabDirResult; barDia: number
  /** Keyed by `slabStrips`' label, so the schedule quotes the adopted mat. */
  mats?: Map<string, StripMat>
}) {
  const mat = (loc: string, which: 'column' | 'middle') =>
    mats?.get(`${dir.dir}-dir ${loc} ${which} strip`)
  return (
    <ResultCard title={title}>
      <Row label="Span l₁" value={`${f2(dir.l1)} m`} sub={`l₂=${f2(dir.l2)} m`} />
      <Row label="Clear span lₙ" value={`${f2(dir.ln)} m`} />
      <Row label={<KTex tex="M_o" />} value={`${f1(dir.Mo)} kN·m`} />
      <Row label="d (effective)" value={`${f1(dir.d)} mm`} />
      <Row label="Column strip" value={`${f2(dir.csWidth)} m wide`} sub={`Middle: ${f2(dir.msWidth)} m`} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
              <th className="pb-1 pr-2 font-semibold">Location</th>
              <th className="pb-1 pr-2 font-semibold">M (kN·m)</th>
              <th className="pb-1 pr-2 font-semibold">Col strip</th>
              <th className="pb-1 font-semibold">Mid strip</th>
            </tr>
          </thead>
          <tbody>
            {dir.locations.map((loc) => (
              <tr key={loc.name} className="border-b border-slate-100 last:border-0">
                <td className="py-1 pr-2 font-medium text-slate-700">{loc.name}</td>
                <td className="py-1 pr-2 text-slate-600">{f1(loc.M)}</td>
                <td className="py-1 pr-2">
                  <div className="font-semibold text-slate-800">{steelText(loc.column, barDia, mat(loc.name, 'column'))}</div>
                  <div className="text-slate-500">{steelSub(loc.column)}</div>
                </td>
                <td className="py-1">
                  {loc.middle.b > 0 ? (
                    <>
                      <div className="font-semibold text-slate-800">{steelText(loc.middle, barDia, mat(loc.name, 'middle'))}</div>
                      <div className="text-slate-500">{steelSub(loc.middle)}</div>
                    </>
                  ) : <span className="text-slate-500">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResultCard>
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

  return (
        <div>
      <PageHeader title="Two-Way Slab Design" badges={['ACI 318-14 §8.10', 'NSCP 2015 §408.10']} />
      <div className="mx-auto max-w-[1500px] p-6">
      <p className="no-print mt-1 text-slate-600">
        Direct Design Method — NSCP 2015 §408.10 / ACI 318-14 §8.10. Square or rectangular interior and end panels;
        column-strip / middle-strip flexure; temp/shrinkage minimum; §408.7.2.2 spacing; mid-panel deflection by
        crossing-strip method (Branson I_e).
      </p>
      <ReportControls title="Two-Way Slab (DDM)" badges={['ACI 318-14 §8.10', 'NSCP 2015 §408.10']} report={report} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── INPUTS ── */}
        <div className="space-y-5">
          <Card title="Panel geometry">
            <Num label={<>Span <KTex tex="l_x" /> (short)</>} unit="m" value={f.lx} onChange={set('lx')} />
            <Num label={<>Span <KTex tex="l_y" /> (long)</>} unit="m" value={f.ly} onChange={set('ly')} />
            <Num label="Column width" unit="mm" value={f.colWidth} onChange={set('colWidth')} />
          </Card>

          <Card title="Service loads">
            <Num label={<>Dead load <KTex tex="D" /></>} unit="kPa" value={f.D} onChange={set('D')} />
            <Num label={<>Live load <KTex tex="L" /></>} unit="kPa" value={f.L} onChange={set('L')} />
          </Card>

          <Card title="Materials">
            <Num label={<KTex tex="f'_c" />} unit="MPa" value={f.fc} onChange={set('fc')} />
            <Num label={<KTex tex="f_y" />} unit="MPa" value={f.fy} onChange={set('fy')} />
          </Card>

          <Card title="Detailing"
            hint={
              <label className="no-print flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[#5c6675]">
                <input type="checkbox" checked={autoBar} onChange={(e) => setAutoBar(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0f4c92]" />
                Auto-select bar ⌀ and spacing
              </label>
            }>
            <Num label="Thickness h (blank = auto)" unit="mm" value={f.h} onChange={set('h')} />
            <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} />
            <Num label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={dbEff} onChange={set('barDia')}
              disabled={autoBar}
              hint={autoBar ? (slabChoice?.db ? 'chosen by the optimiser' : 'no compliant mat — see the ranking') : undefined} />
          </Card>

          <Card title="Span type">
            <Pick label="End span in x-dir?" value={f.extX} onChange={set('extX')}
              options={[['no', 'Interior (no disc. edge)'], ['yes', 'End span (one disc. edge)']]} />
            <Pick label="End span in y-dir?" value={f.extY} onChange={set('extY')}
              options={[['no', 'Interior (no disc. edge)'], ['yes', 'End span (one disc. edge)']]} />
            <Pick label="Beams on all edges?" value={f.withBeams} onChange={set('withBeams')}
              options={[['yes', 'Yes (grid beams)'], ['no', 'No (flat plate)']]} />
          </Card>
          {slabChoice && (
            <RebarRanking selection={slabChoice.selection} title="Mat selection — whole panel" name={nameMat} />
          )}
        </div>

        {/* ── RESULTS ── */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {r ? (
            <>
              {/* Summary */}
              <ResultCard title="Summary">
                {!r.applicable && (
                  <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠ DDM not fully applicable — review notes below.
                  </div>
                )}
                <Row label="Ratio l_y / l_x" value={f2(r.ratio)}
                  sub={r.twoWay ? 'two-way ✓' : 'one-way ✗'} />
                <Row label="Min. thickness h_min" value={`${Math.round(r.hmin)} mm`} />
                <Row label="Adopted thickness h" value={`${r.h} mm`}
                  alert={Number.isFinite(f.h) && f.h < r.hmin} />
                <Row label={<><KTex tex="w_u" /> (factored)</>} value={`${f1(r.wu)} kPa`} />
              </ResultCard>

              {/* DDM notes */}
              {r.notes.length > 0 && (
                <div className="space-y-1">
                  {r.notes.map((n, i) => (
                    <p key={i} className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                      {n}
                    </p>
                  ))}
                </div>
              )}

              {/* X direction */}
              <DirCard title={`Direction x (l₁ = ${f2(r.x.l1)} m)`} dir={r.x} barDia={dbEff} mats={mats} />

              {/* Y direction */}
              <DirCard title={`Direction y (l₁ = ${f2(r.y.l1)} m)`} dir={r.y} barDia={dbEff} mats={mats} />

              {/* ── Bar arrangement ─────────────────────────────────── */}
              <ResultCard title="Bar arrangement — section through the span">
                <div className="-mx-1 space-y-4">
                  {(['column', 'middle'] as const).map((strip) => {
                    const loc = r.x.locations.find((l) => l.name === '+M') ?? r.x.locations[0]
                    const neg = r.x.locations.find((l) => l.name.includes('−M')) ?? loc
                    const sec = strip === 'column' ? loc.column : loc.middle
                    const negSec = strip === 'column' ? neg.column : neg.middle
                    return (
                      <SlabBarSection key={strip} strip={strip}
                        l1={r.x.l1} support={f.colWidth / 1000} h={r.h} cover={f.cover}
                        topBars={`⌀${dbEff} @ ${f0(negSec.spacing)} mm`}
                        bottomBars={`⌀${dbEff} @ ${f0(sec.spacing)} mm`}
                        tempBars={`As ${f0(temp.As)} mm²/m · max s ${f0(tempSpacingMax(r.h))} mm`} />
                    )
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Sections are taken along <KTex tex="l_1" /> in the x-direction. Top steel is the
                  negative-moment mat over the supports; bottom steel is the positive-moment mat
                  through mid-span. The shrinkage and temperature bars run perpendicular, so a
                  section cuts them end-on. Cut-offs follow ACI 318-14
                  Fig. 8.7.4.1.3(a) for a flat plate without drop panels: top steel from the
                  FACE of support, the bottom remainder from the support CENTRELINE. The column
                  strip's bottom mat is 100% continuous — at least two bars pass through the
                  column core per §8.7.4.2.
                </p>
              </ResultCard>

              {/* Deflection */}
              {defl && (
                <ResultCard title="Deflection — §24.2 crossing-strip">
                  <Row label="Immediate (D+L)" value={`${f1(defl.immediate)} mm`} />
                  <Row label="Immediate live" value={`${f1(defl.immLive)} mm`}
                    alert={!defl.liveOK}
                    sub={`L/360 = ${f1(defl.limitLive)} mm${defl.liveOK ? ' ✓' : ' ✗'}`} />
                  <Row label={<>Long-term <KTex tex="\lambda_\Delta" /></>}
                    value={defl.lambdaDelta.toFixed(2)} sub="ξ=2.0, ρ′=0" />
                  <Row label="Long-term dead" value={`${f1(defl.longTerm)} mm`} />
                  <Row label="Total (LT dead + imm live)" value={`${f1(defl.total)} mm`}
                    alert={!defl.totalOK}
                    sub={`L/240 = ${f1(defl.limitTotal)} mm${defl.totalOK ? ' ✓' : ' ✗'}`} />
                  {defl.cracked && (
                    <p className="mt-1 text-xs text-slate-500">Slab cracks under service load — Branson I_e applied.</p>
                  )}
                </ResultCard>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Enter valid panel inputs to see results.</p>
          )}
        </div>
      </div>
      {/* The step-by-step already existed and only ever reached the PDF. */}
      {solution && solution.length > 0 && (
        <div className="mt-5">
          <WorkedSolution steps={solution} title="Calculation report — worked solution" />
        </div>
      )}
    </div>
    </div>
  )
}
