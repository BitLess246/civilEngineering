import { useState } from 'react'
import { designSewer, sewerProfile, type RunRow, type SewerResult } from '../engine/stormSewer'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { SewerProfile } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Storm Sewer — a linear network sized by the Rational Method and Manning
// full-flow capacity: per-run Q, standard diameter, part-full velocity,
// travel time fed downstream into the tc chain, and warnings — drawn as a
// longitudinal profile with crowns matched at the manholes.

interface UiRun {
  name: string
  L: number
  slopePct: number
  n: number
  areaHa: number
  C: number
  tcMin: number
}

const SAMPLE: UiRun[] = [
  { name: 'Line 1', L: 200, slopePct: 0.5, n: 0.013, areaHa: 2.0, C: 0.60, tcMin: 15 },
  { name: 'Line 2', L: 250, slopePct: 0.5, n: 0.013, areaHa: 3.0, C: 0.50, tcMin: 20 },
  { name: 'Outfall line', L: 180, slopePct: 0.4, n: 0.013, areaHa: 1.5, C: 0.75, tcMin: 25 },
]

export default function StormSewer() {
  const [runs, setRuns] = useState<UiRun[]>(SAMPLE)
  const [a, setA] = useState(800)
  const [b, setB] = useState(10)
  const [c, setC] = useState(0.75)
  const [Vmin, setVmin] = useState(0.75)
  const [Vwarn, setVwarn] = useState(3)

  const rows: RunRow[] = runs.map((r, i) => ({
    name: r.name, upstream: i - 1, L: r.L, slopePct: r.slopePct, n: r.n,
    inlet: { name: `Inlet ${i + 1}`, areaHa: r.areaHa, C: r.C, tcMin: r.tcMin },
  }))

  const out: { res: SewerResult | null; err: string | null } = (() => {
    try {
      return { res: designSewer(rows, { a, b, c }, { Vmin, Vwarn }), err: null }
    } catch (e) {
      return { res: null, err: e instanceof Error ? e.message : 'Check the inputs' }
    }
  })()
  const { res, err } = out

  const setRun = (i: number, patch: Partial<UiRun>) =>
    setRuns((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const steps: SolutionStep[] = res ? [
    {
      title: 'Intensity at the point of concentration',
      lines: [
        { tex: `i(t_c) = \\frac{${f2(a)}}{(t_c + ${f2(b)})^{${f3(c)}}} \\;\\; \\text{mm/h}` },
        { tex: `${res.runs[0].name}:\\; i = \\frac{${f2(a)}}{(${f2(res.runs[0].tcHead)} + ${f2(b)})^{${f3(c)}}} = ${f2(res.runs[0].iDesign)}\\ \\text{mm/h}` },
        ...res.runs.slice(1).map((r) => ({ item: `${r.name}: tc = ${f2(r.tcHead)} min → i = ${f2(a)}/(${f2(r.tcHead)} + ${f2(b)})^${f3(c)} = ${f2(r.iDesign)} mm/h` })),
        { text: `tc at each run's head is the later of its own inlet time and the upstream arrival (upstream tc + travel time L/V) — intensity falls as the network accumulates, which is why Line 2 is not sized at Inlet 2's minute.` },
      ],
    },
    {
      title: 'Rational accumulation at each head',
      lines: [
        { tex: 'Q = C_{comp}\\cdot i(t_c)\\cdot \\Sigma A / 360 \\qquad C_{comp} = \\frac{\\Sigma(C\\cdot A)}{\\Sigma A}' },
        ...res.runs.map((r) => ({ tex: `${r.name}:\\; Q = \\frac{${f2(r.Ccomp)}\\times ${f2(r.iDesign)}\\times ${f2(r.areaHa)}}{360} = ${f3(r.Qdesign)}\\ \\text{m}^3/\\text{s}` })),
        { text: `Q in m³/s with i in mm/h and A in hectares — the 1/360 unit chain on ${res.runs[0].name}: ${f2(res.runs[0].Ccomp)} × ${f2(res.runs[0].iDesign)} × ${f2(res.runs[0].areaHa)}/360 = ${f3(res.runs[0].Qdesign)} m³/s.` },
      ],
    },
    {
      title: 'Manning sizing and self-cleansing',
      lines: [
        { tex: 'Q_f = \\frac{1}{n}\\cdot\\frac{\\pi D^2}{4}\\cdot\\left(\\frac{D}{4}\\right)^{2/3}\\sqrt{S}' },
        ...res.runs.map((r, i) => ({ tex: `${r.name}~\\text{(DN ${r.dn})}:\\; Q_f = \\frac{1}{${f3(runs[i]?.n ?? 0)}}\\cdot\\frac{\\pi\\times ${f3(r.dn / 1000)}^2}{4}\\cdot\\left(\\frac{${f3(r.dn / 1000)}}{4}\\right)^{2/3}\\sqrt{${f3(r.slopePct / 100)}} = ${f3(r.Qfull)}\\ \\text{m}^3\\text{/s} \\ge Q = ${f3(r.Qdesign)},\\; V_{part} = ${f2(r.Vpart)}\\text{ m/s}` })),
        { text: `The smallest commercial size whose full-flow capacity covers Q and whose PART-FULL (normal-depth) velocity keeps ≥ ${f2(Vmin)} m/s for self-cleansing. Part-full velocity falls as the pipe grows at fixed Q and grade, so when no size clears the floor the picker holds the smallest sufficient DN and flags the run — steepen the grade, do not upsize. Travel time uses the full-flow velocity — the standard simplification. Erosion checks at ${f2(Vwarn)} m/s.` },
      ],
    },
    ...res.runs.flatMap((r) => r.warnings.map((w) => ({ title: `${r.name} — check`, lines: [{ text: w }] }))),
  ] : [{ title: 'Check the inputs', lines: [{ text: err ?? 'Add at least one run.' }] }]

  const profile = res ? sewerProfile(res.runs.map((r, i) => ({ L: runs[i].L, slopePct: r.slopePct, dn: r.dn }))) : []
  const maxUtil = res ? Math.max(...res.runs.map((r) => r.utilization)) : 0
  const minVpart = res ? Math.min(...res.runs.map((r) => r.Vpart)) : 0
  const maxVfull = res ? Math.max(...res.runs.map((r) => r.Vfull)) : 0
  const outfall = res ? res.runs[res.runs.length - 1] : null
  const btn = 'rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint'
  return (
    <WorkspacePage title="Storm Sewer" badges={['Drainage', 'Rational · Manning']}
      intro="A linear storm-sewer ladder sized the classic way: Rational Method flows with travel-time accumulation, Manning full-flow capacity against the commercial diameter ladder, part-full velocity for self-cleansing, and the tc chain carried from inlet to outfall."
      inputs={<>
        <InputGroup title="IDF curve" hint="i = a / (tc + b)^c, mm/h with tc in minutes.">
          <Num label="Coefficient a" value={a} onChange={setA} min={10} step="10" />
          <Num label="Coefficient b" unit="min" value={b} onChange={setB} min={0} step="1" />
          <Num label="Exponent c" value={c} onChange={setC} min={0.2} max={1.2} step="0.05" />
        </InputGroup>
        <InputGroup title="Velocity policy">
          <Num label="Self-cleansing" unit="m/s" value={Vmin} onChange={setVmin} min={0.3} max={1.5} step="0.05" />
          <Num label="Erosion check" unit="m/s" value={Vwarn} onChange={setVwarn} min={1.5} max={6} step="0.5" />
        </InputGroup>
        {runs.map((r, i) => (
          <InputGroup key={i} title={`Run ${i + 1}`} hint={i === 0 ? 'Head of the network.' : `Receives run ${i}.`}>
            <label className="col-span-2 flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
              Name
              <input value={r.name} onChange={(e) => setRun(i, { name: e.target.value })}
                className="w-full rounded-md border border-field-line bg-surface px-2.5 py-1.5 text-sm font-normal" aria-label={`Run ${i + 1} name`} />
            </label>
            <Num label="Length L" unit="m" value={r.L} onChange={(v) => setRun(i, { L: v })} min={5} step="10" />
            <Num label="Slope S" unit="%" value={r.slopePct} onChange={(v) => setRun(i, { slopePct: v })} min={0.05} step="0.1" />
            <Num label="Manning n" value={r.n} onChange={(v) => setRun(i, { n: v })} min={0.008} step="0.001" />
            <Num label="Inlet area A" unit="ha" value={r.areaHa} onChange={(v) => setRun(i, { areaHa: v })} min={0.1} step="0.5" />
            <Num label="Runoff C" value={r.C} onChange={(v) => setRun(i, { C: v })} min={0.05} max={1} step="0.05" />
            <Num label="Inlet time" unit="min" value={r.tcMin} onChange={(v) => setRun(i, { tcMin: v })} min={1} step="1" />
            {runs.length > 1 && (
              <div className="col-span-2">
                <button type="button" onClick={() => setRuns((rs) => rs.filter((_, j) => j !== i))} className={btn}>Remove run {i + 1}</button>
              </div>
            )}
          </InputGroup>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn}
            onClick={() => setRuns((rs) => [...rs, { name: `Line ${rs.length + 1}`, L: 150, slopePct: 0.5, n: 0.013, areaHa: 1, C: 0.6, tcMin: 20 }])}>+ Add run</button>
          <button type="button" className={btn}
            onClick={() => { setRuns(SAMPLE.map((r) => ({ ...r }))); setA(800); setB(10); setC(0.75); setVmin(0.75); setVwarn(3) }}>Sample: 3 runs, i = 800/(tc+10)^0.75</button>
        </div>
      </>}
      checks={res && outfall ? <>
        <CheckCard title="Capacity" basis="Q ≤ Qfull in every run" status={maxUtil <= 1 ? 'pass' : 'fail'} value={`DN ${outfall.dn}`} unit="at the outfall"
          formula="Qf = (1/n)(πD²/4)(D/4)^(2/3)√S" ratio={maxUtil} ratioLabel="Highest Q ÷ Qfull"
          pairs={[{ label: 'Outfall Q', value: `${f3(outfall.Qdesign)} m³/s` }, { label: 'Outfall tc', value: `${f2(outfall.tcHead)} min` }]} />
        <CheckCard title="Self-cleansing" basis={`part-full V ≥ ${f2(Vmin)} m/s`} status={minVpart >= Vmin - 1e-9 ? 'pass' : 'fail'} value={f2(minVpart)} unit="m/s lowest"
          ratio={minVpart > 0 ? Vmin / minVpart : undefined} ratioLabel="Floor ÷ lowest V"
          pairs={[{ label: 'Runs below', value: `${res.runs.filter((r) => !r.meetsVelocity).length}` }, { label: 'Fix', value: 'steepen, not upsize' }]} />
        <CheckCard title="Erosion" basis={`full V ≤ ${f2(Vwarn)} m/s`} status={maxVfull <= Vwarn ? 'pass' : 'warn'} value={f2(maxVfull)} unit="m/s highest"
          ratio={maxVfull / Vwarn} ratioLabel="Highest V ÷ check"
          pairs={[{ label: 'Runs', value: `${res.runs.length}` }, { label: 'Total length', value: `${f2(profile[profile.length - 1]?.chainD ?? 0)} m` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="storm sewer" status="warn" pillLabel="CHECK" value="—" formula={err ?? 'Add at least one run.'} />
      )}
      summary={[
        { label: 'IDF', value: `i = ${f2(a)}/(tc + ${f2(b)})^${f3(c)}` },
        { label: 'Runs', value: `${runs.length}` },
        { label: 'Self-cleansing', value: `${f2(Vmin)} m/s` },
        { label: 'Erosion check', value: `${f2(Vwarn)} m/s` },
      ]}
      drawing={res ? { title: 'Longitudinal profile', node: <div data-pdf-drawing><SewerProfile runs={res.runs.map((r, i) => ({ name: r.name, dn: r.dn, slopePct: r.slopePct, Q: r.Qdesign, p: profile[i] }))} /></div> } : undefined}
      resultsCaption={res ? res.runs.flatMap((r) => r.warnings.map((w) => `${r.name}: ${w}`)).join(' ') || undefined : undefined}
      results={res ? res.runs.map((r) => ({
        check: `${r.name} — DN ${r.dn}`,
        basis: `i ${f2(r.iDesign)} mm/h at tc ${f2(r.tcHead)} min · V part ${f2(r.Vpart)} m/s`,
        demand: `${f3(r.Qdesign)} m³/s`, limit: `${f3(r.Qfull)} m³/s`, ratio: r.utilization,
        status: r.utilization > 1 || !r.meetsVelocity ? 'fail' as const : r.warnings.length ? 'warn' as const : 'pass' as const,
      })) : [{ check: 'Sizing', basis: err ?? 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Design flow', basis: 'Q = C·i·A/360 with tc = max(inlet, upstream arrival)', source: 'Rational Method; ASCE MOP 77, Design and Construction of Urban Stormwater Management Systems' },
        { topic: 'Pipe capacity', basis: 'Manning, circular pipe running full', source: 'Chow, Open-Channel Hydraulics' },
        { topic: 'Self-cleansing velocity', basis: '≥ 0.75 m/s part-full (typical; set above)', source: 'ASCE MOP 77' },
        { topic: 'Profile', basis: 'crowns matched where the pipe grows', source: 'ASCE MOP 60 / WEF MOP FD-5' },
      ]}
    />
  )
}
