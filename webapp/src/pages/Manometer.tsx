import { useState } from 'react'
import { manometer } from '../engine/hydrostatics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { ManometerSketch } from '../components/fluidSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Multi-fluid manometer: walk from a point of known pressure, +γh going down a
// leg, −γh going up (engine/hydrostatics.ts · manometer).

interface Leg { gamma: number; h: number; sign: 'down' | 'up' }

export default function Manometer() {
  const [pStart, setPStart] = useState(50)
  const [legs, setLegs] = useState<Leg[]>([
    { gamma: 133.1, h: 0.1, sign: 'down' },
    { gamma: 9.81, h: 0.2, sign: 'up' },
  ])
  const setLeg = (k: number, patch: Partial<Leg>) => setLegs((ls) => ls.map((l, j) => (j === k ? { ...l, ...patch } : l)))
  const p = manometer(pStart, legs.map((l) => ({ gamma: l.gamma, h: l.h, sign: l.sign === 'down' ? 1 as const : -1 as const })))
  const steps = legs.map((l, k) => ({ label: `leg ${k + 1}`, dp: (l.sign === 'down' ? 1 : -1) * l.gamma * l.h }))

  return (
    <WorkspacePage title="Manometer" badges={['Hydrostatics', 'Pressure walk']}
      intro="Walk a manometer from a point of known pressure through each fluid column: add γh going down a leg, subtract it going up. The far-end pressure is what remains."
      inputs={<>
        <InputGroup title="Start">
          <div className="col-span-2"><Num label="Starting pressure" unit="kPa" value={pStart} onChange={setPStart} step="1" /></div>
        </InputGroup>
        <InputGroup title="Legs">
          {legs.map((l, k) => (
            <div key={k} className="col-span-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <Num label={`γ leg ${k + 1}`} unit="kN/m³" value={l.gamma} onChange={(v) => setLeg(k, { gamma: v })} min={0.1} step="0.1" />
              <Num label="h" unit="m" value={l.h} onChange={(v) => setLeg(k, { h: v })} min={0} step="0.05" />
              <Pick label="Going" value={l.sign} onChange={(v) => setLeg(k, { sign: v as Leg['sign'] })} options={[['down', 'Down +'], ['up', 'Up −']]} />
              <button type="button" aria-label={`Remove leg ${k + 1}`} disabled={legs.length < 2}
                onClick={() => setLegs((ls) => ls.filter((_, j) => j !== k))}
                className="mb-1 rounded-md border border-field-line px-1.5 py-1 text-xs text-muted hover:text-fail disabled:opacity-40">✕</button>
            </div>
          ))}
          <div className="col-span-2">
            <button type="button" onClick={() => setLegs((ls) => [...ls, { gamma: 9.81, h: 0.1, sign: 'down' }])}
              className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">+ Add leg</button>
          </div>
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Far-end pressure" basis={`${legs.length} legs from ${f2(pStart)} kPa`} status="info"
          value={f2(p)} unit="kPa" formula="p = p₀ + Σ ±γ·h"
          pairs={[{ label: 'Change Δp', value: `${f2(p - pStart)} kPa` }, { label: 'Water head', value: `${f3(p / 9.81)} m` }]} />
      </>}
      summary={[
        { label: 'Starting pressure', value: `${f2(pStart)} kPa` },
        ...legs.map((l, k) => ({ label: `Leg ${k + 1}`, value: `${l.sign === 'down' ? '↓' : '↑'} γ ${f2(l.gamma)} kN/m³ · h ${f3(l.h)} m` })),
      ]}
      drawing={{ title: 'Pressure along the walk', node: <ManometerSketch pStart={pStart} steps={steps} /> }}
      results={[
        ...legs.map((l, k) => ({ check: `Leg ${k + 1} (${l.sign})`, basis: `${l.sign === 'down' ? '+' : '−'}γ·h`, demand: `${f2(steps[k]!.dp)} kPa`, status: 'info' as const })),
        { check: 'Far-end pressure', basis: 'p₀ + Σ', demand: `${f2(p)} kPa`, status: 'info' },
      ]}
      steps={[
        { title: 'The walk', lines: [
          { tex: `p = ${f2(pStart)}${legs.map((l) => ` ${l.sign === 'down' ? '+' : '-'} ${f2(l.gamma)}\\times${f3(l.h)}`).join('')} = ${f2(p)}\\ \\text{kPa}` },
          { text: 'Going down a column the pressure rises by γh; going up it falls. Levels joined by the same continuous fluid are at the same pressure, which is why the walk may jump across a U-tube at equal elevation.' },
        ] },
      ]}
      references={[
        { topic: 'Pressure variation', basis: 'dp = γ·dh in a fluid at rest', source: 'Hydrostatics — pressure measurement' },
      ]}
    />
  )
}
