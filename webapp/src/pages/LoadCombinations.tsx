import { useMemo, useState } from 'react'
import { calcLoadCombinations, type LoadDemands } from '../engine/loadCombinations'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { ComboBars } from '../components/loadSketches'
import { f2 } from '../lib/format'
import { usePendingCalculatorInputs } from '../lib/ai/pendingAction'
import { usePublishPageSnapshot, type PageSnapshot } from '../lib/ai/pageContext'

const DEFAULTS: LoadDemands = { D: 0, L: 0, Lr: 0, W: 0, E: 0 }

/** Keep only finite numbers the page knows — the assistant must never set a field to a string. */
function sanitiseLoads(raw: Partial<LoadDemands> | null): Partial<LoadDemands> {
  if (!raw) return {}
  const out: Partial<LoadDemands> = {}
  for (const k of ['D', 'L', 'Lr', 'W', 'E'] as const) {
    const v: unknown = raw[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

export default function LoadCombinations() {
  // Assistant prefill pilot: `open_calculator('/load-combinations', {D, L, …})`
  // lands here via sessionStorage and becomes the initial state (consumed once).
  const initialLoads = usePendingCalculatorInputs('/load-combinations', DEFAULTS)
  const [d, setD] = useState<LoadDemands>(() => ({ ...DEFAULTS, ...sanitiseLoads(initialLoads()) }))
  const set = <K extends keyof LoadDemands>(k: K) => (v: number) =>
    setD(s => ({ ...s, [k]: v }))

  const allFinite = Object.values(d).every(Number.isFinite)
  // `d` is a fresh object every render, so memoize on its VALUE identity
  const dKey = JSON.stringify(d)
  const r = useMemo(
    () => (allFinite ? calcLoadCombinations(d) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dKey, allFinite],
  )

  // Assistant snapshot — `d` is state and `r` is memoised, so both deps are
  // stable and this republishes only when the numbers actually change.
  const comboSnapshot = useMemo<PageSnapshot>(() => ({
    route: '/load-combinations',
    tool: 'Load Combinations',
    inputs: (['D', 'L', 'Lr', 'W', 'E'] as const).map((k) => ({ label: k, value: f2(d[k]) })),
    results: r
      ? [
          { label: 'governing max', value: `${r.maxCombo.id} = ${f2(r.maxCombo.value)}` },
          { label: 'governing min', value: `${r.minCombo.id} = ${f2(r.minCombo.value)}` },
        ]
      : [{ label: 'results', value: 'enter finite loads' }],
    notes: ['NSCP 2015 §203.3 LRFD, any consistent unit'],
  }), [d, r])
  usePublishPageSnapshot('/load-combinations', comboSnapshot)

  const report = r ? {
    docCode: 'L-01',
    ok: true,
    governing: `Max ${f2(r.maxCombo.value)} (combo ${r.maxCombo.id}) · min ${f2(r.minCombo.value)} (combo ${r.minCombo.id})`,
    stats: [
      { label: 'Governing max', value: f2(r.maxCombo.value), unit: `combo ${r.maxCombo.id}` },
      { label: 'Governing min', value: f2(r.minCombo.value), unit: `combo ${r.minCombo.id}` },
    ],
    data: (['D', 'L', 'Lr', 'W', 'E'] as const).map((k) => [k, f2(d[k])]) as [string, string][],
    steps: [{
      title: 'Factored combinations — NSCP 2015 §203.3',
      lines: r.combos.map((c) => ({ text: `${c.id}: ${c.label} = ${f2(c.value)}` })),
    }],
  } : undefined

  return (
    <WorkspacePage title="Load Combinations" badges={['Loads', 'NSCP 2015 §203.3']}
      intro="The strength-design (LRFD) combinations of NSCP 2015 §203.3 for one set of unfactored load effects. Enter characteristic values in any consistent unit; W and E enter as positive magnitudes and each combination applies its own ± sign."
      report={report}
      inputs={
        <InputGroup title="Unfactored loads" hint="Any consistent unit — kN, kN/m, kPa, kN·m.">
          <Num label="D — dead" value={d.D} onChange={set('D')} />
          <Num label="L — floor live" value={d.L} onChange={set('L')} />
          <Num label="Lr — roof live" value={d.Lr} onChange={set('Lr')} />
          <Num label="W — wind" value={d.W} onChange={set('W')} />
          <Num label="E — earthquake" value={d.E} onChange={set('E')} />
        </InputGroup>
      }
      checks={r ? <>
        <CheckCard title="Governing maximum" basis={`combination ${r.maxCombo.id}`} status="info" value={f2(r.maxCombo.value)}
          pairs={[{ label: 'Expression', value: r.maxCombo.label }]} />
        <CheckCard title="Governing minimum" basis={`combination ${r.minCombo.id}`} status={r.minCombo.value < 0 ? 'warn' : 'info'}
          pillLabel={r.minCombo.value < 0 ? 'REVERSAL' : undefined} value={f2(r.minCombo.value)}
          pairs={[{ label: 'Expression', value: r.minCombo.label }]} />
      </> : <p className="text-sm text-muted">Fill in load values to see the combinations.</p>}
      summary={(['D', 'L', 'Lr', 'W', 'E'] as const).map((k) => ({ label: k, value: f2(d[k]) }))}
      drawing={r ? { title: 'Factored combinations', node: <div data-pdf-drawing>
        <ComboBars combos={r.combos} maxId={r.maxCombo.id} minId={r.minCombo.id} />
      </div> } : undefined}
      resultsCaption={r && r.minCombo.value < 0 ? 'A negative minimum is a reversal — uplift, overturning or tension where the gravity case gives compression — and has to be designed for, not just noted.' : undefined}
      results={r ? r.combos.map((c) => ({
        check: `Combination ${c.id}`, basis: c.label, demand: f2(c.value),
        status: c.id === r.minCombo.id && c.value < 0 ? 'warn' as const : 'info' as const,
      })) : []}
      steps={report?.steps ?? []}
      references={[
        { topic: 'Strength-design combinations', basis: 'LRFD factored load combinations', source: 'NSCP 2015 §203.3' },
      ]}
    />
  )
}
