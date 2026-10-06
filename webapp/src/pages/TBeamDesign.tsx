import { useMemo, useState } from 'react'
import { designTBeam, type TBeamKind } from '../engine/tbeam'
import { buildTBeamSolution } from '../lib/tbeamSolution'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { TSection } from '../components/TSection'

const f0 = (v: number) => v.toFixed(0)
const f1 = (v: number) => v.toFixed(1)


export default function TBeamDesign() {
  const [kind, setKind] = useState<TBeamKind>('interior')
  const [bw, setBw] = useState(300); const [h, setH] = useState(600); const [hf, setHf] = useState(100)
  const [bfGiven, setBfGiven] = useState(0)
  const [ln, setLn] = useState(6); const [sw, setSw] = useState(2.7)
  const [cover, setCover] = useState(40); const [stirrupDia, setStirrupDia] = useState(10); const [barDia, setBarDia] = useState(25)
  // A problem states d; a drawing states h and the cover. 0 = derive.
  const [dGiven, setDGiven] = useState(0)
  const [fc, setFc] = useState(21); const [fy, setFy] = useState(415)
  const [Mu, setMu] = useState(400)
  // ANALYSE, not only design. The engine has always taken a given As; the page
  // never offered it, so the one case where the steel may not reach fy — a
  // section handed to you, not one you sized — could not be entered at all.
  const [mode, setMode] = useState<'design' | 'analyze'>('design')
  const [AsGiven, setAsGiven] = useState(3000)

  const inp = useMemo(() => ({
    kind, bw, h, hf, bfGiven: bfGiven > 0 ? bfGiven : undefined, ln, sw,
    cover, stirrupDia, barDia, fc, fy, Mu,
    ...(dGiven > 0 ? { dGiven } : {}),
    ...(mode === 'analyze' && AsGiven > 0 ? { AsGiven } : {}),
  }), [kind, bw, h, hf, bfGiven, ln, sw, cover, stirrupDia, barDia, fc, fy, Mu, mode, AsGiven, dGiven])
  const r = useMemo(() => { try { return designTBeam(inp) } catch { return null } }, [inp])
  const steps = useMemo(() => (r ? buildTBeamSolution(inp, r) : []), [inp, r])
  // Steel the detailed cage actually has. The summary printed "6-⌀25 (2112 mm²)"
  // — the bar count beside the area REQUIRED, which reads as the area those bars
  // supply and is not. The tension-controlled ratio has the same problem: the cap
  // applies to the steel that gets built.
  const AsProv = mode === 'analyze' && AsGiven > 0
    ? AsGiven
    : r ? r.bars * (Math.PI / 4) * barDia ** 2 : 0

  const flexRatio = r ? Math.abs(Mu) / Math.max(r.phiMn, 1e-9) : NaN
  const tcRatio = r ? AsProv / Math.max(r.AsMax, 1e-9) : NaN
  const behaviour = r ? (r.tBehavior ? 'true T (a > hf)' : Mu < 0 ? 'web rectangle (hogging)' : 'rectangular (a ≤ hf)') : ''
  return (
    <WorkspacePage title="T-Beam Design" badges={['Concrete', 'ACI 318-14 · NSCP 2015']}
      intro="Flanged-beam flexure, both ways. Design solves the compression block from the moment and the steel from C = T — the block fills the flange before it enters the web. Analysis takes the steel as given and solves C(c) = T(c) for the neutral axis with fs = min(fy, 600(d − c)/c), so an over-reinforced section settles below yield. §6.3.2 effective width, §9.6.1.2 minimum steel, εt and φ per §21.2.2. Positive Mu = flange in compression."
      report={r ? {
        docCode: 'TB-01', ok: r.ok,
        governing: `${r.tBehavior ? 'true T behaviour' : 'rectangular behaviour'} · utilization ${flexRatio.toFixed(2)}`,
        stats: [
          { label: 'Steel', value: `${r.bars}-⌀${barDia}`, unit: `(${f0(AsProv)} mm²)` },
          { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
          { label: 'bf', value: f0(r.bf), unit: 'mm' },
        ],
        checks: [
          { name: 'Flexure Mu/φMn', ratio: flexRatio, ok: r.phiMn >= Math.abs(Mu) },
          { name: 'Tension-controlled', ratio: tcRatio, ok: AsProv <= r.AsMax },
        ],
        data: [
          ['Type', kind], ['Web bw × h', `${bw} × ${h} mm`], ['Flange bf × hf', `${f0(r.bf)} × ${hf} mm`],
          ["f'c / fy", `${fc} / ${fy} MPa`], ['Mu', `${Mu} kN·m`], ['d / dt', `${f1(r.d)} / ${f1(r.dt)} mm`],
          ['As req / prov', `${f0(r.As)} / ${f0(AsProv)} mm²`],
          ['fs', `${f1(r.fs)} MPa ${r.fsYields ? '(yields)' : `< fy = ${f0(fy)} — over-reinforced`}`],
          ['Mn / φMn', `${f1(r.Mn)} / ${f1(r.phiMn)} kN·m`],
          ['a req / prov / max', `${f1(r.aReq)} / ${f1(r.a)} / ${f1(r.aMax)} mm`],
        ],
        steps, drawingTitle: kind === 'edge' ? 'Edge (L) beam section' : 'T-beam section',
      } : undefined}
      inputs={<>
        <InputGroup title="Section">
          <div className="col-span-2">
            <Pick label="Beam type" value={kind} onChange={(v) => setKind(v as TBeamKind)} options={[['interior', 'Interior T'], ['edge', 'Edge (L-beam)'], ['isolated', 'Isolated T']]} />
          </div>
          <Num label="Web bw" unit="mm" value={bw} onChange={setBw} />
          <Num label="Total depth h" unit="mm" value={h} onChange={setH} />
          <Num label="Flange hf" unit="mm" value={hf} onChange={setHf} />
          <Num label="bf (0 = §6.3.2)" unit="mm" value={bfGiven} onChange={setBfGiven} />
          <Num label="Clear span ln" unit="m" value={ln} onChange={setLn} />
          <Num label="Web spacing sw" unit="m" value={sw} onChange={setSw} />
        </InputGroup>
        <InputGroup title="Materials and detailing">
          <Num label="f′c" unit="MPa" value={fc} onChange={setFc} />
          <Num label="fy" unit="MPa" value={fy} onChange={setFy} />
          <Num label="Cover" unit="mm" value={cover} onChange={setCover} />
          <Num label="Stirrup ⌀" unit="mm" value={stirrupDia} onChange={setStirrupDia} />
          <Num label="Bar ⌀" unit="mm" value={barDia} onChange={setBarDia} />
          <Num label="Depth d (0 = derive)" unit="mm" value={dGiven} onChange={setDGiven} />
        </InputGroup>
        <InputGroup title="Demand" hint="+ sagging (flange in compression), − hogging.">
          <div className="col-span-2">
            <Pick label="Mode" value={mode} onChange={(v) => setMode(v as 'design' | 'analyze')} options={[['design', 'Design — size As from Mu'], ['analyze', 'Analyse — φMn of a given As']]} />
          </div>
          <Num label="Mu" unit="kN·m" value={Mu} onChange={setMu} />
          {mode === 'analyze' && <Num label="As provided" unit="mm²" value={AsGiven} onChange={setAsGiven} />}
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title={mode === 'analyze' ? 'Analysis' : 'Design'} basis={behaviour} status={r.ok ? 'pass' : 'fail'} pillLabel={r.ok ? (mode === 'analyze' ? 'ANALYSIS OK' : 'DESIGN OK') : 'REVISE'}
          value={mode === 'analyze' ? `${f0(AsProv)} mm²` : `${r.bars}-⌀${barDia}`} unit={mode === 'analyze' ? 'given' : `${f0(AsProv)} mm²`}
          pairs={[{ label: 'bf', value: `${f0(r.bf)} mm` }, { label: 'd', value: `${f1(r.d)} mm` }]} />
        <CheckCard title="Flexure" basis="Mu ≤ φMn" status={flexRatio <= 1.0001 ? 'pass' : 'fail'} value={f1(r.phiMn)} unit="kN·m φMn"
          ratio={flexRatio} ratioLabel="Mu ÷ φMn" pairs={[{ label: 'εt / φ', value: `${r.et.toFixed(4)} / ${r.phi.toFixed(2)}` }, { label: 'fs', value: `${f1(r.fs)} MPa${r.fsYields ? ' (yields)' : ' < fy'}` }]} />
        <CheckCard title="Tension-controlled" basis="As,prov ≤ As,max" status={tcRatio <= 1.0001 ? 'pass' : 'fail'} value={f0(r.AsMax)} unit="mm² As,max"
          ratio={tcRatio} ratioLabel="As,prov ÷ As,max" pairs={[{ label: 'Block a req / prov', value: `${f1(r.aReq)} / ${f1(r.a)} mm` }, { label: 'a max', value: `${f1(r.aMax)} mm` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="T-beam" status="warn" pillLabel="CHECK" value="—" formula="Positive section dimensions and materials; hf < h." />
      )}
      summary={[
        { label: 'Type', value: kind },
        { label: 'Web bw × h', value: `${bw} × ${h} mm` },
        { label: 'Flange hf', value: `${hf} mm${bfGiven > 0 ? `, bf ${bfGiven} mm given` : ''}` },
        { label: "f'c / fy", value: `${fc} / ${fy} MPa` },
        { label: 'Demand', value: `Mu ${Mu} kN·m (${mode})` },
      ]}
      drawing={r ? { title: kind === 'edge' ? 'Edge (L) beam section and stress block' : 'T-beam section and stress block', node: <div data-pdf-drawing>
        <TSection bf={r.bf} bw={bw} h={h} hf={hf} a={r.a} aReq={r.aReq} edge={kind === 'edge'} bars={r.bars} barDia={barDia} layers={r.layers} cover={cover} stirrupDia={stirrupDia} />
      </div> } : undefined}
      resultsCaption={r && r.notes.length ? r.notes.join(' · ') : undefined}
      results={r ? [
        { check: 'Effective flange width', basis: bfGiven > 0 ? 'given' : '§6.3.2', demand: `${f0(r.bf)} mm`, status: 'info' as const },
        { check: 'Depths d / dt', basis: `${r.layers.length} layer${r.layers.length > 1 ? 's' : ''}`, demand: `${f1(r.d)} / ${f1(r.dt)} mm`, status: 'info' as const },
        { check: 'Steel required / provided', basis: mode === 'analyze' ? 'given' : `${r.bars}-⌀${barDia}`, demand: `${f0(r.As)} / ${f0(AsProv)} mm²`, status: 'info' as const },
        { check: 'Steel stress fs', basis: r.fsYields ? 'yields' : 'over-reinforced: below fy', demand: `${f1(r.fs)} MPa`, limit: `${f0(fy)} MPa`, status: r.fsYields ? 'pass' as const : 'warn' as const },
        { check: 'Flexure', basis: 'Mu ≤ φMn', demand: `${f1(Math.abs(Mu))} kN·m`, limit: `${f1(r.phiMn)} kN·m`, ratio: flexRatio, status: flexRatio <= 1.0001 ? 'pass' as const : 'fail' as const },
        { check: 'Tension-controlled', basis: 'As,prov ≤ As,max', demand: `${f0(AsProv)} mm²`, limit: `${f0(r.AsMax)} mm²`, ratio: tcRatio, status: tcRatio <= 1.0001 ? 'pass' as const : 'fail' as const },
      ] : [{ check: 'Section', basis: 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps.length ? steps : [{ title: 'Check the inputs', lines: [{ text: 'Positive section dimensions and materials; hf < h.' }] }]}
      references={[
        { topic: 'Effective flange width', basis: 'interior, edge and isolated T', source: 'ACI 318-14 §6.3.2; NSCP 2015 §406.3.2' },
        { topic: 'Flexure', basis: 'rectangular stress block, C = T', source: 'ACI 318-14 §22.2.2' },
        { topic: 'Strength reduction', basis: 'εt and φ', source: 'ACI 318-14 §21.2.2' },
        { topic: 'Minimum steel', basis: 'As,min', source: 'ACI 318-14 §9.6.1.2' },
      ]}
    />
  )
}
