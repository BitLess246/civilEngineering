import { useState } from 'react'
import { npv, irr, payback, discountedPayback, benefitCost } from '../engine/engEconomy'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { CashFlowSketch } from '../components/economySketches'
import { peso } from '../lib/money'
import { f2, f3 } from '../lib/influenceStyle'

// Cash-flow analysis — NPV, IRR, benefit–cost ratio and payback on a
// year-by-year series at a hurdle rate (engine/engEconomy.ts). Amounts in ₱,
// t = 0 is today.

const SAMPLE = ['-1000', '300', '300', '300', '300', '300']
const num = (s: string) => parseFloat(s) || 0

export default function CashFlowAnalysis() {
  const [rows, setRows] = useState<string[]>(SAMPLE)
  const [hurdle, setHurdle] = useState(10)
  const setRow = (k: number, v: string) => setRows((rs) => rs.map((r, j) => (j === k ? v : r)))

  const cfs = rows.map(num)
  const r = hurdle / 100
  const enough = cfs.length >= 2
  const npvV = npv(r, cfs.length ? cfs : [0])
  const irrV = enough ? irr(cfs) : null
  const pb = enough ? payback(cfs) : null
  const dpb = enough ? discountedPayback(r, cfs) : null
  const pwIn = cfs.reduce((s, c, t) => s + (c > 0 ? c / Math.pow(1 + r, t) : 0), 0)
  const pwOut = cfs.reduce((s, c, t) => s + (c < 0 ? -c / Math.pow(1 + r, t) : 0), 0)
  const bc = pwOut > 0 ? benefitCost(pwIn, pwOut) : NaN
  const accept = npvV >= 0
  const yr = (v: number | null) => (v === null ? 'never' : `${f2(v)} yr`)

  return (
    <WorkspacePage title="Cash-Flow Analysis" badges={['Engineering economy', 'NPV · IRR · payback']}
      intro="Judge a project from its year-by-year cash flows: net present worth at the hurdle rate, the internal rate of return, the benefit–cost ratio and how long it takes to pay back. Outlays are negative, receipts positive, t = 0 is today."
      inputs={<>
        <InputGroup title="Cash flows">
          <div className="col-span-2 space-y-1.5">
            {rows.map((v, k) => (
              <div key={k} className="grid grid-cols-[3.2rem_minmax(0,1fr)_1.6rem] items-center gap-1.5">
                <span className="font-mono text-[11px] text-muted">t = {k}</span>
                <input value={v} onChange={(e) => setRow(k, e.target.value)} inputMode="decimal"
                  className="text-[13px]" aria-label={`Cash flow at t = ${k}`} />
                <button type="button" aria-label={`Remove t = ${k}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== k))}
                  disabled={rows.length <= 2} className="text-muted hover:text-fail disabled:opacity-30">✕</button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setRows((rs) => [...rs, rs[rs.length - 1] ?? '0'])}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add year</button>
              <button type="button" onClick={() => setRows(SAMPLE)}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: −1000 then 300 × 5</button>
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Hurdle">
          <Num label="Hurdle rate (MARR)" unit="%/yr" value={hurdle} onChange={setHurdle} min={0} max={100} step="0.5" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Net present worth" basis={`at the ${f2(hurdle)} % hurdle`} status={accept ? 'pass' : 'fail'} pillLabel={accept ? 'ACCEPT' : 'REJECT'}
          value={peso(npvV)} formula="NPV = Σ CFₜ / (1 + i)ᵗ"
          pairs={[{ label: 'PW of receipts', value: peso(pwIn) }, { label: 'PW of outlays', value: peso(pwOut) }]} />
        {irrV === null ? (
          <CheckCard title="Internal rate of return" basis="the rate where NPV = 0" status="warn" pillLabel="NO IRR" value="—"
            formula={enough ? 'The series never changes sign, so no rate makes its NPV zero.' : 'At least two cash flows are needed.'} />
        ) : (
          <CheckCard title="Internal rate of return" basis="the rate where NPV = 0" status={irrV * 100 > hurdle ? 'pass' : 'fail'} pillLabel={irrV * 100 > hurdle ? 'ACCEPT' : 'REJECT'}
            value={f2(irrV * 100)} unit="%" formula="Σ CFₜ / (1 + i*)ᵗ = 0"
            ratio={irrV > 0 ? hurdle / (irrV * 100) : undefined} ratioLabel="Hurdle ÷ IRR"
            pairs={[{ label: 'Hurdle', value: `${f2(hurdle)} %` }, { label: 'Margin', value: `${f2(irrV * 100 - hurdle)} points` }]} />
        )}
        <CheckCard title="Benefit–cost ratio" basis="present worths at the hurdle" status={!Number.isFinite(bc) ? 'warn' : bc >= 1 ? 'pass' : 'fail'} pillLabel={!Number.isFinite(bc) ? 'CHECK' : bc >= 1 ? 'ACCEPT' : 'REJECT'}
          value={Number.isFinite(bc) ? f3(bc) : '—'} formula="B/C = PW(receipts) / PW(outlays)"
          pairs={[{ label: 'Receipts', value: peso(pwIn) }, { label: 'Outlays', value: peso(pwOut) }]} />
        <CheckCard title="Payback" basis="when the running total turns positive" status="info" value={pb === null ? 'never' : f2(pb)} unit={pb === null ? undefined : 'years'} formula="Σ CFₜ ≥ 0"
          pairs={[{ label: 'Discounted payback', value: yr(dpb) }, { label: 'Horizon', value: `${cfs.length - 1} yr` }]} />
      </>}
      summary={[
        { label: 'Hurdle rate', value: `${f2(hurdle)} %/yr` }, { label: 'Horizon', value: `${cfs.length - 1} yr` },
        { label: 'Initial flow (t = 0)', value: peso(cfs[0] ?? 0) }, { label: 'Sum of flows', value: peso(cfs.reduce((s, c) => s + c, 0)) },
      ]}
      drawing={{ title: 'Cash-flow diagram', node: <CashFlowSketch cfs={cfs} rate={r} /> }}
      results={[
        { check: 'Net present worth', basis: `Σ CFₜ/(1 + ${f2(hurdle)} %)ᵗ`, demand: peso(npvV), limit: '≥ 0', status: accept ? 'pass' : 'fail' },
        { check: 'Internal rate of return', basis: 'NPV(i*) = 0', demand: irrV === null ? '—' : `${f2(irrV * 100)} %`, limit: `> ${f2(hurdle)} %`,
          ratio: irrV !== null && irrV > 0 ? hurdle / (irrV * 100) : undefined, status: irrV === null ? 'warn' : irrV * 100 > hurdle ? 'pass' : 'fail' },
        { check: 'Benefit–cost ratio', basis: 'PW(+)/PW(−)', demand: Number.isFinite(bc) ? f3(bc) : '—', limit: '≥ 1', status: !Number.isFinite(bc) ? 'warn' : bc >= 1 ? 'pass' : 'fail' },
        { check: 'Simple payback', basis: 'running total ≥ 0', demand: yr(pb), status: 'info' },
        { check: 'Discounted payback', basis: 'running present worth ≥ 0', demand: yr(dpb), status: 'info' },
      ]}
      steps={[
        { title: 'Net present worth', clause: 'Present-worth method', pass: accept, lines: [
          { tex: `NPV = \\sum_{t=0}^{${cfs.length - 1}} \\frac{CF_t}{(1+${f3(r)})^t} = ${cfs.slice(0, 6).map((c, t) => `\\frac{${f2(c)}}{${f3(1 + r)}^{${t}}}`).join(' + ')}${cfs.length > 6 ? ' + \\cdots' : ''} = ${f2(npvV)}` },
          { text: accept ? 'NPV ≥ 0: the project earns at least the hurdle rate — accept.' : 'NPV < 0: the project earns less than the hurdle rate — reject.' },
        ] },
        { title: 'Internal rate of return', lines: [
          irrV === null
            ? { text: 'No IRR: a series that never changes sign has no rate at which its present worth is zero.' }
            : { tex: `\\sum \\frac{CF_t}{(1+i^*)^t} = 0 \\Rightarrow i^* = ${f3(irrV * 100)}\\% \\quad (\\text{hurdle } ${f2(hurdle)}\\%)` },
          { text: 'Found by bisection on a widening bracket. A series that changes sign more than once can have several IRRs; then NPV is the measure to trust.' },
        ] },
        { title: 'Benefit–cost ratio and payback', lines: [
          { tex: `B/C = \\frac{${f2(pwIn)}}{${f2(pwOut)}} = ${Number.isFinite(bc) ? f3(bc) : '\\text{—}'}` },
          { tex: `\\text{payback} = ${pb === null ? '\\text{never}' : `${f2(pb)}\\ \\text{yr}`} \\qquad \\text{discounted} = ${dpb === null ? '\\text{never}' : `${f2(dpb)}\\ \\text{yr}`}` },
          { text: 'Payback ignores the time value of money and everything after the payback year; discounted payback fixes the first flaw only. Use them as a liquidity check beside NPV, not instead of it.' },
        ] },
      ]}
      references={[
        { topic: 'Present worth', basis: 'NPV = Σ CFₜ/(1 + i)ᵗ; accept when NPV ≥ 0 at the MARR', source: 'Engineering economy — present-worth analysis' },
        { topic: 'Rate of return', basis: 'IRR: NPV(i*) = 0; accept when i* > MARR', source: 'Engineering economy — rate-of-return analysis' },
        { topic: 'Benefit–cost', basis: 'B/C = PW(benefits)/PW(costs) ≥ 1', source: 'Engineering economy — public projects' },
        { topic: 'Payback', basis: 'first t with cumulative (discounted) cash flow ≥ 0, interpolated within the year', source: 'Engineering economy — payback period' },
      ]}
    />
  )
}
