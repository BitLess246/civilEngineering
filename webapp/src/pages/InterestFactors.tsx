import { useState } from 'react'
import { pf, fp, pa, ap, fa, af, arithGradientPW, arithGradientAW, geomGradientPW, effRate, capitalizedCost } from '../engine/engEconomy'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { EquivalenceSketch } from '../components/economySketches'
import { peso } from '../lib/money'
import { f2, f3 } from '../lib/influenceStyle'

// Interest factors — single-payment and uniform-series factors, arithmetic
// and geometric gradients, the effective rate and capitalized cost
// (engine/engEconomy.ts). Rates in % at the page edge, decimals inside.

const f4 = (v: number) => (Number.isFinite(v) ? v.toFixed(4) : '—')

export default function InterestFactors() {
  const [ratePct, setRatePct] = useState(8)
  const [n, setN] = useState(5)
  const [A, setA] = useState(1000)
  const [G, setG] = useState(100)
  const [A1, setA1] = useState(1000)
  const [gPct, setGPct] = useState(5)
  const [nominal, setNominal] = useState(12)
  const [m, setM] = useState(12)

  const i = ratePct / 100, g = gPct / 100
  const nn = Math.max(1, Math.round(n))
  const P = A * pa(i, nn), F = A * fa(i, nn)
  const PG = arithGradientPW(i, G, nn), AG = arithGradientAW(i, G, nn)
  const Pgeo = geomGradientPW(i, g, A1, nn)
  const iEff = effRate(nominal / 100, Math.max(1, Math.round(m)))
  const Pcap = capitalizedCost(A, i)
  const fac = `${f2(ratePct)}\\%,${nn}`

  return (
    <WorkspacePage title="Interest Factors" badges={['Engineering economy', 'Time value of money']}
      intro="The compound-interest factors that move money through time — single payment, uniform series, arithmetic and geometric gradients — with the effective rate of a nominal one and the capitalized cost of a perpetual series."
      inputs={<>
        <InputGroup title="Rate and horizon">
          <Num label="Interest rate i" unit="%/period" value={ratePct} onChange={setRatePct} min={0.01} max={100} step="0.5" />
          <Num label="Periods n" unit="periods" value={nn} onChange={setN} min={1} max={500} step="1" />
        </InputGroup>
        <InputGroup title="Uniform series">
          <Num label="Amount A" unit="₱/period" value={A} onChange={setA} step="100" />
        </InputGroup>
        <InputGroup title="Gradients">
          <Num label="Arithmetic step G" unit="₱/period" value={G} onChange={setG} step="10" />
          <Num label="Geometric first A₁" unit="₱" value={A1} onChange={setA1} step="100" />
          <Num label="Geometric growth g" unit="%/period" value={gPct} onChange={setGPct} min={-99} max={100} step="0.5" />
        </InputGroup>
        <InputGroup title="Nominal rate">
          <Num label="Nominal rate r" unit="%/yr" value={nominal} onChange={setNominal} min={0} max={200} step="0.5" />
          <Num label="Compounding m" unit="/yr" value={m} onChange={setM} min={1} max={365} step="1" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Present worth of A" basis={`${peso(A)} for ${nn} periods at ${f2(ratePct)} %`} status="info" value={peso(P)} formula="P = A·(P/A, i, n)"
          pairs={[{ label: '(P/A)', value: f4(pa(i, nn)) }, { label: '(A/P)', value: f4(ap(i, nn)) }]} />
        <CheckCard title="Future worth of A" basis="at the end of period n" status="info" value={peso(F)} formula="F = A·(F/A, i, n)"
          pairs={[{ label: '(F/A)', value: f4(fa(i, nn)) }, { label: '(A/F)', value: f4(af(i, nn)) }]} />
        <CheckCard title="Single payment" basis={`one peso moved ${nn} periods`} status="info" value={f4(pf(i, nn))} unit="(P/F)" formula="(P/F) = 1/(1 + i)ⁿ"
          pairs={[{ label: '(F/P)', value: f4(fp(i, nn)) }, { label: 'Doubling time', value: `${f2(Math.log(2) / Math.log(1 + i))} periods` }]} />
        <CheckCard title="Effective rate" basis={`${f2(nominal)} % compounded ${Math.round(m)}× a year`} status="info" value={f3(iEff * 100)} unit="% per year" formula="i_eff = (1 + r/m)ᵐ − 1"
          pairs={[{ label: 'Rate per subperiod', value: `${f3(nominal / Math.max(1, Math.round(m)))} %` }, { label: 'Continuous limit', value: `${f3((Math.exp(nominal / 100) - 1) * 100)} %` }]} />
        <CheckCard title="Capitalized cost" basis={`${peso(A)} every period, forever`} status="info" value={peso(Pcap)} formula="P = A / i"
          pairs={[{ label: 'vs n-period P', value: peso(P) }, { label: 'Share in first n', value: `${f2((P / Pcap) * 100)} %` }]} />
      </>}
      summary={[
        { label: 'Interest rate i', value: `${f2(ratePct)} % per period` }, { label: 'Periods n', value: `${nn}` },
        { label: 'Uniform amount A', value: peso(A) }, { label: 'Arithmetic step G', value: peso(G) },
        { label: 'Geometric A₁, g', value: `${peso(A1)}, ${f2(gPct)} %` }, { label: 'Nominal r, m', value: `${f2(nominal)} %, ${Math.round(m)}/yr` },
      ]}
      drawing={{ title: 'Uniform series and its equivalents', node: <EquivalenceSketch n={nn} A={A} P={P} F={F} /> }}
      results={[
        { check: '(P/F, i, n)', basis: '1/(1 + i)ⁿ', demand: f4(pf(i, nn)), status: 'info' },
        { check: '(P/A, i, n)', basis: '[(1 + i)ⁿ − 1]/[i(1 + i)ⁿ]', demand: f4(pa(i, nn)), status: 'info' },
        { check: '(A/P, i, n)', basis: 'capital recovery', demand: f4(ap(i, nn)), status: 'info' },
        { check: '(F/A, i, n)', basis: '[(1 + i)ⁿ − 1]/i', demand: f4(fa(i, nn)), status: 'info' },
        { check: 'Arithmetic gradient P', basis: 'G·(P/G, i, n)', demand: peso(PG), status: 'info' },
        { check: 'Geometric gradient P', basis: 'A₁[1 − ((1 + g)/(1 + i))ⁿ]/(i − g)', demand: peso(Pgeo), status: 'info' },
        { check: 'Effective rate', basis: '(1 + r/m)ᵐ − 1', demand: `${f3(iEff * 100)} %`, status: 'info' },
        { check: 'Capitalized cost', basis: 'A/i', demand: peso(Pcap), status: 'info' },
      ]}
      steps={[
        { title: 'Single payment and uniform series', lines: [
          { tex: `(P/F,${fac}) = \\frac{1}{(1+${f3(i)})^{${nn}}} = ${f4(pf(i, nn))} \\qquad (F/P,${fac}) = ${f4(fp(i, nn))}` },
          { tex: `(P/A,${fac}) = \\frac{(1+i)^n-1}{i(1+i)^n} = ${f4(pa(i, nn))} \\qquad (A/P,${fac}) = ${f4(ap(i, nn))}` },
          { tex: `(F/A,${fac}) = \\frac{(1+i)^n-1}{i} = ${f4(fa(i, nn))} \\qquad (A/F,${fac}) = ${f4(af(i, nn))}` },
          { tex: `P = ${f2(A)}\\times${f4(pa(i, nn))} = ${f2(P)} \\qquad F = ${f2(A)}\\times${f4(fa(i, nn))} = ${f2(F)}` },
          { text: 'Each factor is the reciprocal of its partner: (A/P) recovers a present sum as an annuity, (A/F) builds a sinking fund toward a future one. The A payments fall at the END of each period, the first one period after P.' },
        ] },
        { title: 'Gradients', lines: [
          { tex: `P_G = G\\,\\frac{(1+i)^n - in - 1}{i^2(1+i)^n} = ${f2(G)}\\times${f4(arithGradientPW(i, 1, nn))} = ${f2(PG)} \\qquad A_G = ${f2(AG)}` },
          { tex: Math.abs(i - g) < 1e-12
            ? `P_{geo} = \\frac{n A_1}{1+i} = ${f2(Pgeo)}`
            : `P_{geo} = A_1\\,\\frac{1-\\left(\\frac{1+g}{1+i}\\right)^n}{i-g} = ${f2(A1)}\\times\\frac{1-(${f3(1 + g)}/${f3(1 + i)})^{${nn}}}{${f3(i)}-${f3(g)}} = ${f2(Pgeo)}` },
          { text: 'The arithmetic gradient is 0 at period 1, G at period 2, 2G at period 3 — add any base amount separately as a uniform series. The geometric series starts at A₁ in period 1 and grows by g each period.' },
        ] },
        { title: 'Effective rate and capitalized cost', lines: [
          { tex: `i_{eff} = \\left(1+\\frac{${f3(nominal / 100)}}{${Math.round(m)}}\\right)^{${Math.round(m)}} - 1 = ${f3(iEff * 100)}\\%` },
          { tex: `P_{cap} = \\frac{A}{i} = \\frac{${f2(A)}}{${f3(i)}} = ${f2(Pcap)}` },
          { text: 'Compare nominal rates only through their effective rates. Capitalized cost prices a service kept forever — a road, a dam — as the sum that, invested at i, pays A every period without ever being drawn down.' },
        ] },
      ]}
      references={[
        { topic: 'Single payment', basis: '(F/P) = (1 + i)ⁿ; (P/F) = 1/(1 + i)ⁿ', source: 'Engineering economy — compound interest' },
        { topic: 'Uniform series', basis: '(P/A), (A/P), (F/A), (A/F); end-of-period payments', source: 'Engineering economy — annuities' },
        { topic: 'Gradients', basis: '(P/G) = [(1 + i)ⁿ − in − 1]/[i²(1 + i)ⁿ]; geometric P = A₁[1 − ((1 + g)/(1 + i))ⁿ]/(i − g)', source: 'Engineering economy — gradient series' },
        { topic: 'Effective rate', basis: 'i_eff = (1 + r/m)ᵐ − 1; continuous e^r − 1', source: 'Engineering economy — nominal and effective rates' },
        { topic: 'Capitalized cost', basis: 'P = A/i for a perpetual series', source: 'Engineering economy — perpetuities' },
      ]}
    />
  )
}
