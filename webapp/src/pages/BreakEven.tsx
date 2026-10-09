import { useState } from 'react'
import { breakEven } from '../engine/engEconomy'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { BreakEvenSketch } from '../components/economySketches'
import { peso, amount } from '../lib/money'
import { f2 } from '../lib/influenceStyle'

// Break-even analysis — the volume at which contribution margin covers fixed
// cost, and the profit and margin of safety at an expected volume
// (engine/engEconomy.ts · breakEven). Amounts in ₱ per period.

export default function BreakEven() {
  const [fixed, setFixed] = useState(50000)
  const [price, setPrice] = useState(120)
  const [variable, setVariable] = useState(70)
  const [volume, setVolume] = useState(1500)

  const cm = price - variable
  let qBE = NaN
  let err = ''
  try { qBE = breakEven(fixed, price, variable) } catch (e) { err = (e as Error).message }
  const ok = Number.isFinite(qBE)
  const profit = cm * volume - fixed
  const safety = volume > 0 && ok ? (volume - qBE) / volume : NaN

  return (
    <WorkspacePage title="Break-Even Analysis" badges={['Engineering economy', 'Cost–volume–profit']}
      intro="The output at which revenue just covers fixed and variable cost: each unit sold contributes its price less its variable cost toward the fixed cost, and past the break-even volume that contribution is profit."
      inputs={<>
        <InputGroup title="Costs">
          <Num label="Fixed cost F" unit="₱/period" value={fixed} onChange={setFixed} min={0} step="1000" />
          <Num label="Variable cost v" unit="₱/unit" value={variable} onChange={setVariable} min={0} step="1" />
        </InputGroup>
        <InputGroup title="Sales">
          <Num label="Price p" unit="₱/unit" value={price} onChange={setPrice} min={0} step="1" />
          <Num label="Expected volume Q" unit="units" value={volume} onChange={setVolume} min={0} step="100" />
        </InputGroup>
      </>}
      checks={ok ? <>
        <CheckCard title="Break-even volume" basis={`${peso(fixed)} fixed per period`} status="info" value={amount(qBE)} unit="units" formula="Q_BE = F / (p − v)"
          pairs={[{ label: 'Break-even revenue', value: peso(qBE * price) }, { label: 'Contribution margin', value: `${peso(cm)}/unit` }]} />
        <CheckCard title={`Profit at ${amount(volume)} units`} basis="expected volume" status={profit >= 0 ? 'pass' : 'fail'} pillLabel={profit >= 0 ? 'PROFIT' : 'LOSS'}
          value={peso(profit)} formula="Profit = (p − v)Q − F" ratio={volume > 0 ? qBE / volume : undefined} ratioLabel="Break-even ÷ expected"
          pairs={[{ label: 'Revenue', value: peso(price * volume) }, { label: 'Total cost', value: peso(fixed + variable * volume) }]} />
        <CheckCard title="Margin of safety" basis="how far sales can fall before a loss" status={safety >= 0 ? 'info' : 'warn'} value={Number.isFinite(safety) ? f2(safety * 100) : '—'} unit="%" formula="(Q − Q_BE) / Q"
          pairs={[{ label: 'Contribution ratio', value: price > 0 ? `${f2((cm / price) * 100)} %` : '—' }, { label: 'Units of headroom', value: amount(volume - qBE) }]} />
      </> : (
        <CheckCard title="No break-even" basis="price does not cover variable cost" status="fail" pillLabel="LOSS" value="—" formula={err || 'Every unit sold loses money, so no volume recovers the fixed cost.'} />
      )}
      summary={[
        { label: 'Fixed cost F', value: `${peso(fixed)}/period` }, { label: 'Variable cost v', value: `${peso(variable)}/unit` },
        { label: 'Price p', value: `${peso(price)}/unit` }, { label: 'Expected volume Q', value: `${amount(volume)} units` },
      ]}
      drawing={{ title: 'Break-even chart', node: <BreakEvenSketch fixed={fixed} price={price} variable={variable} qBE={qBE} /> }}
      results={[
        { check: 'Break-even volume', basis: 'F/(p − v)', demand: ok ? `${amount(qBE)} units` : '—', status: ok ? 'info' : 'fail' },
        { check: 'Break-even revenue', basis: 'p·Q_BE', demand: ok ? peso(qBE * price) : '—', status: ok ? 'info' : 'fail' },
        { check: 'Profit at expected volume', basis: '(p − v)Q − F', demand: peso(profit), limit: '≥ 0', ratio: ok && volume > 0 ? qBE / volume : undefined, status: profit >= 0 ? 'pass' : 'fail' },
      ]}
      steps={[
        { title: 'Break-even volume', lines: ok ? [
          { tex: `Q_{BE} = \\frac{F}{p - v} = \\frac{${f2(fixed)}}{${f2(price)} - ${f2(variable)}} = ${f2(qBE)}\\ \\text{units}` },
          { tex: `R_{BE} = p\\,Q_{BE} = ${f2(price)}\\times${f2(qBE)} = ${f2(qBE * price)}` },
        ] : [{ text: err || 'Price must exceed the variable cost per unit.' }] },
        { title: 'At the expected volume', pass: profit >= 0, lines: [
          { tex: `\\text{Profit} = (p - v)Q - F = ${f2(cm)}\\times${f2(volume)} - ${f2(fixed)} = ${f2(profit)}` },
          ...(ok && volume > 0 ? [{ tex: `\\text{margin of safety} = \\frac{Q - Q_{BE}}{Q} = \\frac{${f2(volume)} - ${f2(qBE)}}{${f2(volume)}} = ${f2(safety * 100)}\\%` }] : []),
          { text: 'Below the break-even volume the contribution does not yet cover the fixed cost; every unit beyond it adds its full contribution margin to profit.' },
        ] },
      ]}
      references={[
        { topic: 'Break-even', basis: 'Q_BE = F/(p − v); revenue pQ = F + vQ', source: 'Engineering economy — break-even analysis' },
        { topic: 'Margin of safety', basis: '(Q − Q_BE)/Q', source: 'Cost–volume–profit analysis' },
      ]}
    />
  )
}
