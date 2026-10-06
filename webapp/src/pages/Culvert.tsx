import { useState } from 'react'
import {
  CULVERT_INLETS, culvertCheck, minDiameter,
  type CulvertSection, type CulvertResult,
} from '../engine/culvert'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { CulvertProfile } from '../components/hydraulicsSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Culvert Hydraulics — FHWA HDS-5 headwater check for circular and box
// culverts: inlet control (unsubmerged / transition / submerged forms),
// outlet control (full-barrel energy equation), the governing regime and
// the outlet velocity, plus a standard-size sweep for the minimum diameter.

type Mode = 'check' | 'size'
type SecKind = 'circular' | 'box'

const INLET_OPTIONS: [string, string][] = CULVERT_INLETS.map((i) => [i.id, i.label])

interface CheckOut { res: CulvertResult | null }
interface SizeOut { res: CulvertResult | null; D: number }

export default function Culvert() {
  const [mode, setMode] = useState<Mode>('check')
  const [secKind, setSecKind] = useState<SecKind>('circular')
  const [inlet, setInlet] = useState('concrete-square-headwall')
  const [Q, setQ] = useState(1.0)
  const [D, setD] = useState(0.9)
  const [B, setB] = useState(1.8)
  const [rise, setRise] = useState(1.2)
  const [L, setL] = useState(30)
  const [S, setS] = useState(0.5) // percent, stored /100
  const [TW, setTW] = useState(0.5)
  const [barrels, setBarrels] = useState(1)
  const [nOverride, setNOverride] = useState(0) // 0 = material default
  const [allowableHW, setAllowableHW] = useState(1.0)

  const section: CulvertSection = secKind === 'circular' ? { kind: 'circular', D } : { kind: 'box', B, D: rise }
  const Sslope = S / 100

  const chk: CheckOut = (() => {
    try {
      return { res: culvertCheck({ Q, section, inlet, L, S: Sslope, TW, barrels, ...(nOverride > 0 ? { n: nOverride } : {}) }) }
    } catch { return { res: null } }
  })()
  const siz: SizeOut = (() => {
    if (secKind !== 'circular') return { res: null, D: NaN }
    try {
      const r = minDiameter({ Q, inlet, L, S: Sslope, TW, barrels, allowableHW })
      return { res: r.result, D: r.D }
    } catch { return { res: null, D: NaN } }
  })()
  const res = mode === 'check' ? chk.res : siz.res
  const sizedD = siz.D

  const kindLabel = (r: CulvertResult) =>
    r.section.kind === 'circular' ? `⌀ ${f3((r.section as { D: number }).D)} m circular` : `${f3(B)} × ${f3(rise)} m box`

  // Inlet-control ratio x = Q/(A·√D) replayed in US units (cfs, ft) —
  // the HDS-5 constants are dimensionless only there.
  const FT = 1 / 0.3048
  const qBarrel = res ? res.Q / res.barrels : 0
  const aFull = res
    ? res.section.kind === 'circular'
      ? Math.PI * res.section.D * res.section.D / 4
      : res.section.B * res.section.D
    : 0
  const dSize = res ? res.section.D : 0

  const steps: SolutionStep[] = res ? [
    {
      title: 'Inlet control — HDS-5 forms 1 and 2',
      lines: [
        { tex: '\\frac{HW_i}{D} = \\frac{E_c}{D} + K\\left[\\frac{Q}{A\\sqrt{D}}\\right]^{M} + s\\cdot S \\quad\\quad \\frac{HW_i}{D} = c\\left[\\frac{Q}{A\\sqrt{D}}\\right]^{2} + Y + s\\cdot S' },
        { tex: `x = \\frac{Q}{A\\sqrt{D}} = \\frac{${f3(qBarrel * FT ** 3)}}{${f3(aFull * FT ** 2)}\\times \\sqrt{${f3(dSize * FT)}}} = ${f2(res.inletHW.x)}\\;\\; (\\text{cfs, ft}^2\\text{, ft — one barrel})` },
        { text: `Constants for ${res.inlet.label}: K = ${res.inlet.K}, M = ${res.inlet.M}, c = ${res.inlet.c}, Y = ${res.inlet.Y}, slope coefficient s = ${res.inlet.slopeCoef}, entrance loss Ke = ${res.inlet.Ke}. The discharge ratio x = Q/(A·√D) is evaluated in US units (cfs, ft). Form 1 is the unsubmerged curve, form 2 the submerged one; between HW/D = 1.0 and 1.2 the nomograph interpolates linearly in Q between form 1 at the crown and form 2 at 1.2·D.` },
        { tex: `\\text{Result: } \\frac{HW_i}{D} = ${f3(res.inletHW.hw / res.section.D)} \\;\\Rightarrow\\; HW_i = ${f3(res.inletHW.hw)}\\ \\text{m} \\;\\; (${res.inletHW.form})` },
      ],
    },
    {
      title: 'Outlet control — full-barrel energy equation',
      lines: [
        { tex: 'H = \\left[1 + K_e + \\frac{2g\\,n^2 L}{R^{4/3}}\\right]\\frac{V^2}{2g} \\quad\\quad HW_o = h_o + H' },
        { text: `V = ${f3(res.outletHW.V)} m/s over the full barrel area, R = A/P of the full section, n = ${res.n}. The outlet depth ho is the greater of the tailwater TW = ${f3(TW)} m and (dc + D)/2 with dc = ${f3(res.outletHW.dc)} m — here ho = ${f3(res.outletHW.ho)} m.` },
        { tex: `\\frac{V^2}{2g} = \\frac{${f3(res.outletHW.V)}^2}{19.62} = ${f3((res.outletHW.V * res.outletHW.V) / 19.62)}\\ \\text{m}` },
        { tex: `H = h_f + (1+K_e)\\frac{V^2}{2g} = ${f3(res.outletHW.hf)} + (1+${f2(res.inlet.Ke)})\\times ${f3((res.outletHW.V * res.outletHW.V) / 19.62)} = ${f3(res.outletHW.H)}\\ \\text{m} \\;\\Rightarrow\\; HW_o = ${f3(res.outletHW.hw)}\\ \\text{m}` },
      ],
    },
    {
      title: 'Controlling regime',
      lines: [
        { tex: `HW = \\max(HW_i, HW_o) = ${f3(res.hw)}\\ \\text{m} \\quad\\Rightarrow\\quad \\frac{HW}{D} = ${f2(res.hwOverD)} \\;\\; (${res.controlling}\\text{ control})` },
        { text: `HDS-5 control: the deeper headwater governs because the culvert must pass Q under whichever limit is harsher. Outlet velocity ${f2(res.outletVelocity)} m/s at a velocity depth of ${f3(res.velocityDepth)} m.` },
        ...res.notes.map((nt) => ({ text: nt })),
      ],
    },
    mode === 'size' && Number.isFinite(sizedD) ? {
      title: 'Standard-size sweep',
      lines: [
        { tex: `D_{\\min} = ${f2(sizedD)}\\ \\text{m} \\quad (HW \\le ${f2(allowableHW)}\\ \\text{m})` },
        { text: 'The sweep walks the standard concrete pipe diameters (0.30 m … 3.00 m) and returns the first whose governing headwater stays under the allowable depth.' },
      ],
    } : { title: 'Sizing', lines: [{ text: mode === 'size' ? 'No standard diameter holds the headwater under the allowable depth — try multiple barrels or a higher allowable headwater.' : 'Switch the mode to "size D" to sweep the standard diameters against an allowable headwater.' }] },
  ] : [{ title: 'Check the inputs', lines: [{ text: mode === 'size' ? 'No standard diameter holds the headwater under the allowable depth — try more barrels, a higher allowable headwater, or a more efficient entrance.' : 'Give a positive discharge and barrel length and a non-negative tailwater; a box needs a positive span and rise.' }] }]

  const sized = mode === 'size' && res !== null
  const hwOk = sized ? res!.hw <= allowableHW + 1e-9 : res ? res.hwOverD <= 1.5 : false
  const vHigh = !!res && res.outletVelocity > 4.5
  return (
    <WorkspacePage title="Culvert Hydraulics" badges={['Hydraulics', 'FHWA HDS-5']}
      intro="The HDS-5 headwater check: inlet control (unsubmerged, transition and submerged forms) against outlet control (full-barrel friction, entrance and exit losses over the tailwater), the governing headwater and the outlet velocity — or the smallest standard diameter that holds an allowable headwater."
      inputs={<>
        <InputGroup title="Task">
          <div className="col-span-2"><Pick label="Task" value={mode} onChange={(v) => setMode(v as Mode)} options={[['check', 'Check headwater for a size'], ['size', 'Size D for an allowable HW']]} /></div>
          {mode === 'size' && <Num label="Allowable headwater" unit="m" value={allowableHW} onChange={setAllowableHW} min={0.2} max={6} step="0.05" />}
        </InputGroup>
        <InputGroup title="Barrel">
          <div className="col-span-2"><Pick label="Entrance" value={inlet} onChange={setInlet} options={INLET_OPTIONS} /></div>
          <div className="col-span-2"><Pick label="Section" value={secKind} onChange={(v) => setSecKind(v as SecKind)} options={[['circular', 'Circular pipe'], ['box', 'Concrete box']]} /></div>
          {secKind === 'circular'
            ? mode === 'check' && <Num label="Diameter D" unit="m" value={D} onChange={setD} min={0.2} max={3.6} step="0.05" />
            : <>
                <Num label="Span B" unit="m" value={B} onChange={setB} min={0.6} max={4.0} step="0.1" />
                <Num label="Rise D" unit="m" value={rise} onChange={setRise} min={0.4} max={4.0} step="0.1" />
              </>}
          <Num label="Length L" unit="m" value={L} onChange={setL} min={2} max={300} step="1" />
          <Num label="Slope S" unit="%" value={S} onChange={setS} min={0} max={10} step="0.1" />
          <Num label="Barrels" value={barrels} onChange={setBarrels} min={1} max={10} step="1" />
          <Num label="Manning n" value={nOverride} onChange={setNOverride} min={0} max={0.05} step="0.001" hint="0 = by material" />
        </InputGroup>
        <InputGroup title="Flow">
          <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={100} step="0.1" />
          <Num label="Tailwater TW" unit="m" value={TW} onChange={setTW} min={0} max={5} step="0.05" />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title={sized ? 'Minimum diameter' : 'Headwater'} basis={sized ? `HW ≤ ${f2(allowableHW)} m` : `${res.controlling} control`}
          status={hwOk ? 'pass' : 'fail'} pillLabel={sized ? 'SIZED' : hwOk ? 'PASS' : 'HIGH'}
          value={sized ? f2(sizedD) : f3(res.hw)} unit="m" formula="HW = max(HW_inlet, HW_outlet)"
          ratio={sized ? res.hw / allowableHW : res.hwOverD / 1.5} ratioLabel={sized ? 'HW ÷ allowable' : 'HW/D ÷ 1.5'}
          pairs={[{ label: 'HW / D', value: f2(res.hwOverD) }, { label: sized ? 'Headwater' : 'Section', value: sized ? `${f3(res.hw)} m` : kindLabel(res) }]} />
        <CheckCard title="Controlling regime" basis="the deeper headwater governs" status="info" pillLabel={res.controlling === 'inlet' ? 'INLET' : 'OUTLET'}
          value={res.controlling === 'inlet' ? f3(res.inletHW.hw) : f3(res.outletHW.hw)} unit="m"
          pairs={[{ label: 'Inlet control', value: `${f3(res.inletHW.hw)} m (${res.inletHW.form})` }, { label: 'Outlet control', value: `${f3(res.outletHW.hw)} m` }]} />
        <CheckCard title="Outlet velocity" basis={`at depth ${f3(res.velocityDepth)} m`} status={vHigh ? 'warn' : 'info'} pillLabel={vHigh ? 'PROTECT' : undefined}
          value={f2(res.outletVelocity)} unit="m/s" pairs={[{ label: 'Scour protection', value: vHigh ? 'needed above ≈ 4.5 m/s' : 'not indicated' }, { label: 'Barrels', value: `${res.barrels}` }]} />
      </> : (
        <CheckCard title={mode === 'size' ? 'No standard size works' : 'Check the inputs'} basis="HDS-5" status="fail" pillLabel="CHECK" value="—"
          formula={mode === 'size' ? 'Try more barrels, a higher allowable headwater, or a better entrance.' : 'Positive Q and L, non-negative TW.'} />
      )}
      summary={[
        { label: 'Entrance', value: res ? res.inlet.label : inlet },
        { label: 'Section', value: res ? kindLabel(res) : secKind },
        { label: 'Barrel L, S', value: `${f2(L)} m, ${f2(S)} %` },
        { label: 'Discharge Q', value: `${f3(Q)} m³/s${barrels > 1 ? ` over ${barrels} barrels` : ''}` },
        { label: 'Tailwater TW', value: `${f3(TW)} m` },
        ...(mode === 'size' ? [{ label: 'Allowable HW', value: `${f2(allowableHW)} m` }] : []),
      ]}
      drawing={res ? { title: 'Longitudinal profile', node: <div data-pdf-drawing>
        <CulvertProfile D={res.section.D} L={L} S={Sslope} HW={res.hw} TW={TW} control={res.controlling} velocityDepth={res.velocityDepth} V={res.outletVelocity} />
      </div> } : undefined}
      resultsCaption={res && res.notes.length ? res.notes.join(' ') : undefined}
      results={res ? [
        { check: 'Inlet-control HW', basis: `HDS-5 ${res.inletHW.form} form`, demand: `${f3(res.inletHW.hw)} m`, status: 'info' },
        { check: 'Outlet-control HW', basis: 'ho + H (full barrel)', demand: `${f3(res.outletHW.hw)} m`, status: 'info' },
        { check: 'Governing headwater', basis: `${res.controlling} control`, demand: `${f3(res.hw)} m`, limit: sized ? `≤ ${f2(allowableHW)} m` : 'HW/D ≤ 1.5', ratio: sized ? res.hw / allowableHW : res.hwOverD / 1.5, status: hwOk ? 'pass' : 'fail' },
        { check: 'Outlet velocity', basis: 'Q / A at the velocity depth', demand: `${f2(res.outletVelocity)} m/s`, limit: '≈ 4.5 m/s', status: vHigh ? 'warn' : 'info' },
      ] : [{ check: 'Headwater', basis: 'no solution', demand: '—', status: 'fail' }]}
      steps={steps}
      references={[
        { topic: 'Inlet control', basis: 'HW/D = Ec/D + K[Q/(A√D)]^M + sS (unsubmerged); c[Q/(A√D)]² + Y + sS (submerged)', source: 'FHWA HDS-5 (2012) Appendix A' },
        { topic: 'Outlet control', basis: 'H = [1 + Ke + 2gn²L/R^4/3]V²/2g; HW = ho + H − S·L', source: 'FHWA HDS-5 §3.2' },
        { topic: 'Design headwater', basis: 'HW/D ≈ 1.2–1.5 is the usual practical ceiling', source: 'FHWA HDS-5 §2' },
      ]}
    />
  )
}
