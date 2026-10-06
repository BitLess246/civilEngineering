import { useState } from 'react'
import { analyzeEntry, circulatingFromLegs, type EntryResult } from '../engine/roundabout'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { RoundaboutPlan } from '../components/trafficSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Roundabout — HCM 2010 entry capacity and level of service for one entry,
// with a four-leg helper that assembles each entry's circulating flow from
// the leg volumes (the Exhibit 21-2 conflict pattern).

const SAMPLE_LEGS = [600, 140, 120, 108]

export default function Roundabout() {
  const [lanes, setLanes] = useState<'1' | '2'>('1')
  const [ve, setVe] = useState(600)
  const [vc, setVc] = useState(400)
  const [phf, setPhf] = useState(0.92)
  const [legs, setLegs] = useState<number[]>(SAMPLE_LEGS)
  const [useHelper, setUseHelper] = useState(true)

  // The helper: the entry analysed is leg 1 (westbound) and its circulating
  // flow is the sum of the other three legs.
  const vcHelper = useHelper ? circulatingFromLegs(legs)[0] : vc

  const out: { r: EntryResult | null; err: string | null } = (() => {
    try {
      return { r: analyzeEntry({ ve, vc: vcHelper, lanes: lanes === '1' ? 1 : 2, phf }), err: null }
    } catch (e) {
      return { r: null, err: e instanceof Error ? e.message : 'Check the inputs' }
    }
  })()
  const { r, err } = out

  const setLeg = (i: number, v: number) => setLegs((ls) => ls.map((x, j) => (j === i ? v : x)))

  const steps: SolutionStep[] = r ? [
    {
      title: 'Circulating flow across the entry',
      lines: useHelper ? [
        { text: `The entry from leg 1 is crossed by every other movement: the three upstream entries pass in front of it (HCM 2010 Exhibit 21-2 pattern).` },
        { tex: `v_c = v_2 + v_3 + v_4 = ${legs[1]} + ${legs[2]} + ${legs[3]} = ${Math.round(vcHelper)}\\ \\text{pc/h}` },
      ] : [
        { tex: `v_c = ${Math.round(vcHelper)}\\ \\text{pc/h} \\quad \\text{(entered directly)}` },
      ],
    },
    {
      title: 'Peak-15 flow rates and lane capacities',
      lines: [
        { tex: `v_e = ${ve}\\,\\text{/}\\,${f2(phf)} = ${f2(r.veAdj)}\\ \\text{pc/h} \\qquad v_c = ${Math.round(vcHelper)}\\,\\text{/}\\,${f2(phf)} = ${f2(r.vcAdj)}\\ \\text{pc/h}` },
        ...(r.laneCaps.length === 1
          ? [{ tex: `c = 1130\\,e^{-1.02\\times 10^{-3}\\cdot ${f2(r.vcAdj)}} = ${f2(r.capacity)}\\ \\text{pc/h}` }]
          : [
              { tex: `c_{\\text{right}} = 1130\\,e^{-0.70\\times 10^{-3} v_c} = ${f2(r.laneCaps[0].cap)},\\quad c_{\\text{left}} = 1130\\,e^{-0.75\\times 10^{-3} v_c} = ${f2(r.laneCaps[1].cap)}\\ \\text{pc/h}` },
              { text: `The entry splits 55/45 to the right/left lane; the entry capacity is the governing lane's share-corrected ceiling (${f2(r.capacity)} pc/h).` },
            ]),
      ],
    },
    {
      title: 'v/c and control delay',
      lines: [
        { tex: `x = \\frac{v_e}{c} = \\frac{${f2(r.veAdj)}}{${f2(r.capacity)}} = ${f3(r.xc)} \\qquad d = \\frac{3600}{c} + 900\\,T\\left[(x-1) + \\sqrt{(x-1)^2 + \\frac{8k B x}{cT}}\\right]` },
        { tex: `d = \\frac{3600}{${f2(r.capacity)}} + 900\\times 0.25\\left[(${f3(r.xc)}-1) + \\sqrt{(${f3(r.xc)}-1)^2 + \\frac{8\\times 1.0\\times 1.0\\times ${f3(r.xc)}}{${f2(r.capacity)}\\times 0.25}}\\right] = ${f2(r.delay)}\\ \\text{s/veh} \\;\\Rightarrow\\; \\text{LOS } ${r.los}` },
        { text: r.xc > 1
          ? 'Demand exceeds capacity — the entry is oversaturated. HCM flags LOS F and the queue must be cleared geometrically (add an entry lane or a bypass lane), not by timing.'
          : 'T = 0.25 h (15-min analysis), k = 1.0, B = 1.0 per the HCM unsignalized delay procedure the Manual applies to roundabouts. Unsignalized thresholds: A ≤ 10, B ≤ 15, C ≤ 25, D ≤ 35, E ≤ 50 s/veh (and F whenever x > 1).' },
      ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: err ?? 'Check the inputs.' }] }]

  return (
    <WorkspacePage title="Roundabout" badges={['Traffic', 'HCM 2010 entry']}
      intro="One entry of a roundabout under the HCM 2010 capacity model: the circulating stream that crosses the entry sets each lane's capacity, and the entry's v/c drives the control delay and level of service."
      inputs={<>
        <InputGroup title="Entry">
          <div className="col-span-2">
            <Pick label="Entry lanes" value={lanes} onChange={setLanes} options={[['1', 'Single-lane entry'], ['2', 'Two-lane entry']]} />
          </div>
          <Num label="Entry demand ve" unit="pc/h" value={ve} onChange={setVe} min={0} step="10" />
          <Num label="Peak-hour factor" value={phf} onChange={setPhf} min={0.55} max={1} step="0.01" />
        </InputGroup>
        <InputGroup title="Circulating flow" hint={useHelper ? 'Leg 1 is the analysed entry; the other three legs pass in front of it.' : undefined}>
          <label className="col-span-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <input type="checkbox" checked={useHelper} onChange={(e) => setUseHelper(e.target.checked)} className="accent-brand" />
            Assemble from the four leg volumes
          </label>
          {useHelper
            ? legs.map((v, i) => <Num key={i} label={`Leg ${i + 1} entry`} unit="pc/h" value={v} onChange={(x) => setLeg(i, x)} min={0} step="10" />)
            : <div className="col-span-2"><Num label="Circulating flow vc" unit="pc/h" value={vc} onChange={setVc} min={0} step="10" /></div>}
          <div className="col-span-2">
            <button type="button" onClick={() => { setLegs(SAMPLE_LEGS); setVe(600); setPhf(0.92); setLanes('1') }}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: legs 600/140/120/108, ve 600</button>
          </div>
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Level of service" basis="HCM unsignalized bands" status={r.los === 'F' ? 'fail' : r.los === 'E' ? 'warn' : 'pass'} pillLabel={`LOS ${r.los}`}
          value={f2(r.delay)} unit="s/veh" formula="d = 3600/c + 900T[(x − 1) + √((x − 1)² + 8kBx / cT)]"
          pairs={[{ label: 'Bands', value: 'A ≤ 10 … E ≤ 50' }, { label: 'T', value: '0.25 h' }]} />
        <CheckCard title="Capacity" basis="v/c ≤ 1" status={r.xc > 1 ? 'fail' : r.xc > 0.85 ? 'warn' : 'pass'} value={f2(r.capacity)} unit="pc/h"
          formula={lanes === '1' ? 'c = 1130 e^(−1.02×10⁻³ vc)' : 'c = 1130 e^(−0.70/0.75×10⁻³ vc)'} ratio={r.xc} ratioLabel="Entry v/c"
          pairs={[{ label: 'Reserve', value: `${f2(r.reserve)} pc/h` }, { label: 'vc', value: `${f2(r.vcAdj)} pc/h` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="roundabout" status="warn" pillLabel="CHECK" value="—" formula={err ?? 'Check the inputs.'} />
      )}
      summary={[
        { label: 'Entry', value: `${lanes === '1' ? 'single' : 'two'}-lane, ve ${f2(ve)} pc/h` },
        { label: 'PHF', value: f2(phf) },
        { label: 'Circulating', value: useHelper ? `legs ${legs.join(' / ')} pc/h` : `${f2(vc)} pc/h` },
      ]}
      drawing={r ? { title: 'Conflict diagram', node: <div data-pdf-drawing><RoundaboutPlan legs={legs} veAdj={r.veAdj} vcAdj={r.vcAdj} lanes={lanes === '1' ? 1 : 2} /></div> } : undefined}
      results={r ? [
        { check: 'Circulating flow', basis: useHelper ? 'v₂ + v₃ + v₄, ÷ PHF' : 'entered, ÷ PHF', demand: `${f2(r.vcAdj)} pc/h`, status: 'info' as const },
        ...r.laneCaps.map((lc, i) => ({ check: r.laneCaps.length > 1 ? `Lane capacity ${i === 0 ? 'right' : 'left'}` : 'Lane capacity', basis: 'HCM 2010 Ch. 21', demand: `${f2(lc.cap)} pc/h`, status: 'info' as const })),
        { check: 'Entry v/c', basis: '≤ 1.00', demand: f3(r.xc), limit: '1.000', ratio: r.xc, status: r.xc > 1 ? 'fail' as const : 'pass' as const },
        { check: 'Control delay', basis: `LOS ${r.los}`, demand: `${f2(r.delay)} s/veh`, status: r.los === 'F' ? 'fail' as const : 'info' as const },
      ] : [{ check: 'Entry', basis: err ?? 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Entry capacity', basis: 'c = 1130 e^(−k vc), single and two-lane forms', source: 'HCM 2010, Ch. 21' },
        { topic: 'Conflicting flow', basis: 'movements passing in front of the entry', source: 'HCM 2010, Exhibit 21-2' },
        { topic: 'Control delay and LOS', basis: 'unsignalized bands A ≤ 10 … E ≤ 50 s/veh', source: 'HCM 2010, Ch. 21 (unsignalized LOS table)' },
      ]}
    />
  )
}
