import { useState } from 'react'
import { websterTiming, type WebsterResult, type PhaseInput } from '../engine/websterSignal'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { CycleBar } from '../components/trafficSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Signal Timing — Webster's optimal cycle for a fixed-time signal: flow
// ratios, cycle length, green splits, degrees of saturation, and the HCM
// delay with its LOS letter (engine/websterSignal.ts).

interface PhaseUI {
  name: string
  q: string
  s: string
  lost: string
}

const SAMPLE: PhaseUI[] = [
  { name: 'NS through', q: '800', s: '3200', lost: '4' },
  { name: 'EW through', q: '400', s: '3200', lost: '4' },
]

export default function SignalTiming() {
  const [phases, setPhases] = useState<PhaseUI[]>(SAMPLE)
  const [useOverride, setUseOverride] = useState(false)
  const [cycle, setCycle] = useState(60)

  const setPhase = (i: number, patch: Partial<PhaseUI>) =>
    setPhases((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const addPhase = () => setPhases((ps) => [...ps, { name: `Phase ${ps.length + 1}`, q: '', s: '3200', lost: '4' }])
  const delPhase = (i: number) => setPhases((ps) => ps.filter((_, k) => k !== i))
  const loadSample = () => setPhases(SAMPLE.map((p) => ({ ...p })))

  const parsed: PhaseInput[] = phases.map((p, i) => ({
    name: p.name || `Phase ${i + 1}`,
    q: parseFloat(p.q) || 0,
    s: parseFloat(p.s) || 0,
    lost: parseFloat(p.lost) || 0,
  }))
  const res: WebsterResult | null = (() => {
    try { return websterTiming({ phases: parsed, cycleOverride: useOverride ? cycle : undefined }) } catch { return null }
  })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Critical flow ratios',
      lines: [
        ...res.phases.map((p) => ({
          item: `${p.name}: y = q/s = ${f3(p.q)}/${f3(p.s)} = ${f3(p.y)} · lost ${f2(p.lost)} s`,
        })),
        { tex: `Y = \\sum y_i = ${f3(res.Y)} < 1,\\qquad L = \\sum l_i = ${f2(res.L)}\\text{ s}` },
        { text: 'Y below 1 is the existence condition for any fixed-time cycle; each phase here uses its CRITICAL movement (the busiest approach it serves).' },
      ],
    },
    {
      title: "Webster's optimal cycle",
      lines: [
        { tex: `C_0 = \\frac{1.5L + 5}{1 - Y} = \\frac{1.5\\times ${f2(res.L)} + 5}{1 - ${f3(res.Y)}} = ${f3(res.C0)}\\text{ s}` },
        ...(useOverride ? [{ text: `The page uses your override C = ${f2(cycle)} s instead of C₀ — the splits scale with it, but Webster's delay math is calibrated near C₀.` }] : []),
      ],
    },
    {
      title: 'Effective greens and saturation degrees',
      lines: [
        { tex: `g_i = \\frac{y_i}{Y}\\,(C - L) = \\frac{y_i}{${f3(res.Y)}}\\,(${f2(res.C)} - ${f2(res.L)})` },
        ...res.phases.map((p) => ({
          item: `${p.name}: g = ${f3(p.y)}/${f3(res.Y)}×(${f2(res.C)}−${f2(res.L)}) = ${f3(p.g)} s (λ = ${f3(p.lambda)}) · X = ${f3(p.q)}/(${f3(p.s)}×${f3(p.lambda)}) = ${f3(p.x)}${p.x >= 1 ? ' — OVERSATURATED' : ''}`,
        })),
        { text: 'Greens are shared out in proportion to the flow ratios, after the lost time is taken off the cycle.' },
      ],
    },
    {
      title: 'Delay and level of service',
      lines: [
        { tex: `d = \\frac{C(1-\\lambda)^2}{2(1-\\lambda X)} + \\frac{X^2}{2q(1-X)} - 0.65\\left(\\frac{C}{q^2}\\right)^{1/3}X^{2+5\\lambda}` },
        ...res.phases.map((p) => ({
          item: `${p.name}: d = f(C = ${f2(res.C)}, λ = ${f3(p.lambda)}, X = ${f3(p.x)}, q = ${f2(p.q)}) = ${Number.isNaN(p.delay) ? '— (X ≥ 1, unbounded)' : `${f3(p.delay)} s/veh`}`,
        })),
        { text: 'Webster\u2019s uniform + overflow + empirical terms, per phase; the intersection delay is the flow-weighted average. A saturated phase (X ≥ 1) has no finite delay, so the average is undefined — lengthen the cycle or add capacity instead of reading a number.' },
        { tex: `d_{\\text{avg}} = \\frac{\\sum q_i d_i}{\\sum q_i} = \\frac{${res.phases.map((p) => `${f2(p.q)}\\times${Number.isNaN(p.delay) ? '—' : f3(p.delay)}`).join('+')}}{${f2(res.phases.reduce((s, p) => s + p.q, 0))}} = ${f3(res.avgDelay)}\\text{ s/veh} \\;\\Rightarrow\\; \\text{LOS } ${res.los}` },
        { text: 'HCM signalized bands: A ≤ 10 · B ≤ 20 · C ≤ 35 · D ≤ 55 · E ≤ 80 s/veh; F beyond, or whenever a phase sits at X ≥ 1.' },
      ],
    },
  ] : [{ title: 'No fixed-time cycle exists', lines: [{ text: 'Either Σ(q/s) has reached 1 — the intersection needs phasing changes, better geometry, or actuated control — or a phase has non-positive q or s.' }] }]

  const btn = 'rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint'
  const worstX = res ? Math.max(...res.phases.map((p) => p.x)) : 0
  return (
    <WorkspacePage title="Signal Timing" badges={['Traffic', 'Webster · HCM LOS']}
      intro="Webster's method end to end: critical flow ratios, the optimal cycle, effective greens, saturation degrees, and the delay and level of service of a pre-timed signal."
      inputs={<>
        {phases.map((p, i) => (
          <InputGroup key={i} title={`Phase ${i + 1}`} hint={i === 0 ? 'q = critical arrival flow, s = saturation flow.' : undefined}>
            <label className="col-span-2 flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
              Name
              <input value={p.name} onChange={(e) => setPhase(i, { name: e.target.value })}
                className="w-full rounded-md border border-field-line bg-surface px-2.5 py-1.5 text-sm font-normal" aria-label={`Phase ${i + 1} name`} />
            </label>
            <Num label="Flow q" unit="veh/h" value={parseFloat(p.q) || 0} onChange={(v) => setPhase(i, { q: String(v) })} step="50" />
            <Num label="Saturation s" unit="veh/h" value={parseFloat(p.s) || 0} onChange={(v) => setPhase(i, { s: String(v) })} step="100" />
            <Num label="Lost time" unit="s" value={parseFloat(p.lost) || 0} onChange={(v) => setPhase(i, { lost: String(v) })} step="1" />
            {phases.length > 1 && <div className="flex items-end"><button type="button" onClick={() => delPhase(i)} className={btn}>Remove</button></div>}
          </InputGroup>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addPhase} className={btn}>+ Add phase</button>
          <button type="button" onClick={loadSample} className={btn}>Sample: two phases, 800/400 of 3200</button>
        </div>
        <InputGroup title="Cycle length" hint="Agencies round the cycle to a workable 30–120 s; the splits follow whatever cycle is used.">
          <label className="col-span-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <input type="checkbox" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} className="accent-brand" />
            Override C₀ with a fixed cycle
          </label>
          {useOverride && <Num label="Cycle C" unit="s" value={cycle} onChange={setCycle} min={10} max={180} step="5" />}
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Level of service" basis="HCM signalized bands" status={res.los === 'F' ? 'fail' : res.los === 'E' ? 'warn' : 'pass'} pillLabel={`LOS ${res.los}`}
          value={Number.isNaN(res.avgDelay) ? '—' : f2(res.avgDelay)} unit="s/veh" formula="d_avg = Σ q d / Σ q"
          pairs={[{ label: 'Bands', value: 'A ≤ 10 … E ≤ 80' }, { label: 'Phases', value: `${res.phases.length}` }]} />
        <CheckCard title="Cycle" basis={useOverride ? 'fixed override' : "Webster's optimum"} status="info" value={f2(res.C)} unit="s"
          formula="C₀ = (1.5L + 5) / (1 − Y)"
          pairs={[{ label: 'Lost time L', value: `${f2(res.L)} s` }, { label: 'Effective green', value: `${f2(res.C - res.L)} s` }]} />
        <CheckCard title="Saturation" basis="every phase X < 1" status={worstX >= 1 ? 'fail' : worstX > 0.9 ? 'warn' : 'pass'} value={f3(worstX)} unit="highest X"
          ratio={worstX} ratioLabel="Highest degree of saturation"
          pairs={[{ label: 'Σy = Y', value: f3(res.Y) }, { label: 'Headroom', value: f3(1 - res.Y) }]} />
      </> : (
        <CheckCard title="No fixed-time cycle" basis="Y = Σ q/s must stay below 1" status="fail" pillLabel="Y ≥ 1" value="—" formula="Change the phasing, the geometry, or use actuated control." />
      )}
      summary={phases.map((p, i) => ({ label: p.name || `Phase ${i + 1}`, value: `q ${p.q || 0}, s ${p.s || 0}, lost ${p.lost || 0} s` }))}
      drawing={res ? { title: 'Cycle diagram', node: <div data-pdf-drawing><CycleBar res={res} /></div> } : undefined}
      results={res ? res.phases.map((p) => ({
        check: p.name, basis: `y ${f3(p.y)} · g ${f2(p.g)} s · λ ${f3(p.lambda)}`,
        demand: Number.isNaN(p.delay) ? 'unbounded' : `${f2(p.delay)} s/veh`, limit: `X ${f3(p.x)}`, ratio: p.x,
        status: p.x >= 1 || p.los === 'F' ? 'fail' as const : p.x > 0.9 ? 'warn' as const : 'pass' as const,
      })) : [{ check: 'Cycle', basis: 'Y ≥ 1 or a non-positive flow', demand: '—', status: 'fail' as const }]}
      steps={steps}
      references={[
        { topic: 'Optimal cycle', basis: 'C₀ = (1.5L + 5) / (1 − Y)', source: 'Webster (1958), Road Research Technical Paper 39' },
        { topic: 'Green split', basis: 'gᵢ = (yᵢ / Y)(C − L)', source: 'Webster (1958); Garber & Hoel, Traffic and Highway Engineering' },
        { topic: 'Delay', basis: 'uniform + overflow − empirical correction', source: 'Webster (1958)' },
        { topic: 'Level of service', basis: 'signalized: A ≤ 10, B ≤ 20, C ≤ 35, D ≤ 55, E ≤ 80 s/veh', source: 'HCM 6th ed., Ch. 19 (signalized LOS table)' },
      ]}
    />
  )
}
