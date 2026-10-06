import { useMemo, useState } from 'react'
import {
  bromsClay, bromsSand, pyAnalysis,
  type PileHead, type SoilModel,
} from '../engine/lateralPile'
import { buildLateralPileSolution } from '../lib/lateralPileSolution'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { PyPanels } from '../components/pileSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

export default function LateralPile() {
  const [soilKind, setSoilKind] = useState<'clay' | 'sand'>('clay')
  const [L, setL] = useState(12)
  const [D, setD] = useState(0.6)
  const [EI, setEI] = useState(180000)
  const [My, setMy] = useState(900)
  const [H, setH] = useState(150)
  const [e, setE] = useState(0.5)
  const [head, setHead] = useState<PileHead>('free')
  // clay
  const [cu, setCu] = useState(40)
  const [e50, setE50] = useState(0.01)
  // sand
  const [phi, setPhi] = useState(33)
  const [k, setK] = useState(25000)
  const [gamma, setGamma] = useState(9)
  // the head-deflection limit is a serviceability decision, entered rather than asserted
  const [yLimit, setYLimit] = useState(25)

  const soil: SoilModel = soilKind === 'clay'
    ? { kind: 'clay', cu, gamma, e50 }
    : { kind: 'sand', gamma, phiDeg: phi, k }

  const broms = useMemo(() => (soilKind === 'clay'
    ? bromsClay({ L, d: D, cu, My, e, head })
    : bromsSand({ L, d: D, gamma, phiDeg: phi, My, e, head })),
  [soilKind, L, D, cu, My, e, head, gamma, phi])

  const py = useMemo(
    () => pyAnalysis({ L, D, EI, H, e: head === 'free' ? e : 0, head, soil, elements: 60 }),
    [L, D, EI, H, e, head, soilKind, cu, e50, gamma, phi, k], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const util = broms.Hu > 0 ? H / broms.Hu : Infinity
  const headOK = Math.abs(py.yHead) <= yLimit

  const solution = buildLateralPileSolution(
    { soilKind, L, D, EI, My, H, e, head, cu, e50, phiDeg: phi, k, gamma }, broms, py,
  )

  const mUtil = My > 0 ? py.Mmax / My : Infinity
  return (
    <WorkspacePage title="Laterally Loaded Pile" badges={['Geotechnical', 'Broms · p-y']}
      intro="Two questions, two methods. Broms gives the ultimate lateral capacity in closed form and says whether the soil or the pile section fails first; p-y solves the pile as a beam on nonlinear soil springs and gives what Broms cannot — head deflection, and where the maximum moment sits."
      inputs={<>
        <InputGroup title="Pile">
          <Num label="Embedded length L" unit="m" value={L} onChange={setL} step="0.5" />
          <Num label="Diameter D" unit="m" value={D} onChange={setD} step="0.05" />
          <Num label="Rigidity EI" unit="kN·m²" value={EI} onChange={setEI} step="10000" />
          <Num label="Yield moment My" unit="kN·m" value={My} onChange={setMy} step="50" />
        </InputGroup>
        <InputGroup title="Loading" hint={head === 'fixed' ? 'A fixed head has no free rotation, so the load height e is not used.' : undefined}>
          <Num label="Lateral load H" unit="kN" value={H} onChange={setH} step="10" />
          <Num label="Load height e" unit="m" value={e} onChange={setE} step="0.25" />
          <div className="col-span-2">
            <Pick label="Head condition" value={head} onChange={(v) => setHead(v as PileHead)} options={[['free', 'Free (rotates)'], ['fixed', 'Fixed (capped)']]} />
          </div>
          <Num label="Deflection limit" unit="mm" value={yLimit} onChange={setYLimit} step="5" hint="a project decision" />
        </InputGroup>
        <InputGroup title="Soil">
          <div className="col-span-2">
            <Pick label="Soil type" value={soilKind} onChange={(v) => setSoilKind(v as 'clay' | 'sand')} options={[['clay', 'Clay (Matlock)'], ['sand', 'Sand (API)']]} />
          </div>
          <Num label="Unit weight γ′" unit="kN/m³" value={gamma} onChange={setGamma} step="0.5" />
          {soilKind === 'clay' ? <>
            <Num label="Undrained cu" unit="kPa" value={cu} onChange={setCu} step="5" />
            <Num label="Strain ε₅₀" value={e50} onChange={setE50} step="0.005" />
          </> : <>
            <Num label="Friction φ′" unit="°" value={phi} onChange={setPhi} step="1" />
            <Num label="Subgrade k" unit="kN/m³" value={k} onChange={setK} step="5000" />
          </>}
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Ultimate capacity" basis={`Broms, ${broms.mode === 'short' ? 'soil failure' : 'pile hinge'} governs`} status={util <= 1 ? 'pass' : 'fail'}
          value={f1(broms.Hu)} unit="kN" ratio={util} ratioLabel="Applied H ÷ Hu"
          pairs={[{ label: 'Short-pile (soil)', value: `${f1(broms.shortPile)} kN` }, { label: 'Long-pile (hinge)', value: `${f1(broms.longPile)} kN` }]} />
        <CheckCard title="Head deflection" basis={`p-y, limit ${f0(yLimit)} mm`} status={!py.converged ? 'warn' : headOK ? 'pass' : 'fail'}
          pillLabel={!py.converged ? 'NOT CONVERGED' : undefined} value={f2(py.yHead)} unit="mm"
          ratio={yLimit > 0 ? Math.abs(py.yHead) / yLimit : undefined} ratioLabel="Deflection ÷ limit"
          pairs={[{ label: 'Iterations', value: `${py.iterations}` }, { label: 'Residual', value: py.residual.toExponential(1) }]} />
        <CheckCard title="Section moment" basis="p-y Mmax ≤ My" status={mUtil <= 1 ? 'pass' : 'fail'} value={f1(py.Mmax)} unit="kN·m"
          ratio={Number.isFinite(mUtil) ? mUtil : undefined} ratioLabel="Mmax ÷ My"
          pairs={[{ label: 'At depth', value: `${f2(py.zMmax)} m` }, { label: 'My', value: `${f1(My)} kN·m` }]} />
      </>}
      summary={[
        { label: 'Pile', value: `L ${f2(L)} m, D ${f2(D)} m, EI ${f0(EI)} kN·m²` },
        { label: 'Load', value: `H ${f1(H)} kN at e ${f2(e)} m, ${head} head` },
        { label: 'Soil', value: soilKind === 'clay' ? `clay, cu ${f1(cu)} kPa, ε₅₀ ${f2(e50)}` : `sand, φ′ ${f1(phi)}°, k ${f0(k)} kN/m³` },
        { label: 'γ′', value: `${f1(gamma)} kN/m³` },
      ]}
      drawing={{ title: 'Response at working load (p-y)', node: <div data-pdf-drawing><PyPanels stations={py.stations} L={L} yHead={py.yHead} Mmax={py.Mmax} zMmax={py.zMmax} /></div> }}
      resultsCaption="Broms is an ultimate check: apply your own factor of safety, typically 2 to 3 on Hu for a working load. Clay uses Matlock's soft-clay curve, sand the API RP 2A curve; the residual is reported so a solve that fell short is visible."
      results={[
        { check: 'Broms short-pile', basis: soilKind === 'clay' ? '9 cu d below 1.5d' : '3 Kp γ z d', demand: `${f1(broms.shortPile)} kN`, status: 'info' as const },
        { check: 'Broms long-pile', basis: 'plastic hinge at My', demand: `${f1(broms.longPile)} kN`, status: 'info' as const },
        { check: 'Applied / ultimate', basis: `${broms.mode} pile governs`, demand: `${f1(H)} kN`, limit: `${f1(broms.Hu)} kN`, ratio: util, status: util <= 1 ? 'pass' as const : 'fail' as const },
        { check: 'Head deflection', basis: `limit ${f0(yLimit)} mm`, demand: `${f2(py.yHead)} mm`, limit: `${f0(yLimit)} mm`, ratio: yLimit > 0 ? Math.abs(py.yHead) / yLimit : undefined, status: headOK ? 'pass' as const : 'fail' as const },
        { check: 'Maximum moment', basis: `at z = ${f2(py.zMmax)} m`, demand: `${f1(py.Mmax)} kN·m`, limit: `${f1(My)} kN·m`, ratio: Number.isFinite(mUtil) ? mUtil : undefined, status: mUtil <= 1 ? 'pass' as const : 'fail' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Ultimate lateral capacity', basis: 'short and long pile in clay and sand', source: 'Broms (1964a, 1964b)' },
        { topic: 'p-y in soft clay', basis: 'Matlock curve with ε₅₀', source: 'Matlock (1970)' },
        { topic: 'p-y in sand', basis: 'hyperbolic tangent curve', source: 'API RP 2A-WSD' },
      ]}
    />
  )
}
