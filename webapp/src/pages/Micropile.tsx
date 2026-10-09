import { useState } from 'react'
import { designMicropile } from '../engine/micropile'
import { buildMicropileSolution } from '../lib/geotechSolutions'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { MicropileDrawing } from '../components/pileSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

export default function Micropile() {
  const [barDia, setBarDia] = useState(32)
  const [fyBar, setFyBar] = useState(520)
  const [groutDia, setGroutDia] = useState(150)
  const [fcGrout, setFcGrout] = useState(28)
  const [casing, setCasing] = useState(false)
  const [casingOD, setCasingOD] = useState(140)
  const [casingID, setCasingID] = useState(125)
  const [fyCasing, setFyCasing] = useState(552)
  const [mode, setMode] = useState<'compression' | 'tension'>('compression')
  const [bondDia, setBondDia] = useState(0.15)
  const [bondLength, setBondLength] = useState(8)
  const [alphaBond, setAlphaBond] = useState(150)
  const [P, setP] = useState(400)

  const r = designMicropile({
    section: { barDia, fyBar, groutDia, fcGrout, ...(casing ? { casingOD, casingID, fyCasing } : {}) },
    mode, bondDia, bondLength, alphaBond, FS: 2, P,
  })

  const solution = buildMicropileSolution({ mode, barDia, fyBar, groutDia, fcGrout, casing, casingOD, casingID, fyCasing, bondDia, bondLength, alphaBond, P }, r)

  const util = r.allowable > 0 ? P / r.allowable : Infinity
  return (
    <WorkspacePage title="Micropile" badges={['Geotechnical', 'FHWA-NHI-05-039']}
      intro="FHWA-NHI-05-039 allowable-stress check: the structural capacity of the bar, casing and grout against the grout-to-ground bond capacity of the bonded zone; the governing allowable is the smaller of the two."
      inputs={<>
        <InputGroup title="Section">
          <Num label="Bar ⌀" unit="mm" value={barDia} onChange={setBarDia} />
          <Num label="Bar Fy" unit="MPa" value={fyBar} onChange={setFyBar} />
          <Num label="Grout ⌀ (drill)" unit="mm" value={groutDia} onChange={setGroutDia} />
          <Num label="Grout f′c" unit="MPa" value={fcGrout} onChange={setFcGrout} />
          <label className="col-span-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <input type="checkbox" checked={casing} onChange={(e) => setCasing(e.target.checked)} className="accent-brand" />
            Permanent steel casing
          </label>
          {casing && <>
            <Num label="Casing OD" unit="mm" value={casingOD} onChange={setCasingOD} />
            <Num label="Casing ID" unit="mm" value={casingID} onChange={setCasingID} />
            <Num label="Casing Fy" unit="MPa" value={fyCasing} onChange={setFyCasing} />
          </>}
        </InputGroup>
        <InputGroup title="Bond zone and demand">
          <div className="col-span-2">
            <Pick label="Load mode" value={mode} onChange={(v) => setMode(v as 'compression' | 'tension')} options={[['compression', 'Compression'], ['tension', 'Tension']]} />
          </div>
          <Num label="Bond ⌀" unit="m" value={bondDia} onChange={setBondDia} step="0.01" />
          <Num label="Bond length" unit="m" value={bondLength} onChange={setBondLength} />
          <Num label="αbond" unit="kPa" value={alphaBond} onChange={setAlphaBond} />
          <Num label="Axial demand P" unit="kN" value={P} onChange={setP} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Governing capacity" basis={`${r.governs === 'bond' ? 'grout-to-ground bond' : 'structural'} governs`} status={r.ok ? 'pass' : 'fail'}
          value={f0(r.allowable)} unit="kN allowable" ratio={Number.isFinite(util) ? util : undefined} ratioLabel="P ÷ allowable"
          pairs={[{ label: 'Structural', value: `${f0(r.structural)} kN` }, { label: 'Bond (FS 2)', value: `${f0(r.Qbond)} kN` }]} />
        <CheckCard title="Bond length" basis="for FS = 2 on the bond" status={bondLength >= r.bondLengthReq ? 'pass' : 'fail'}
          value={f2(r.bondLengthReq)} unit="m required" formula="Lb = 2 P / (π Db αbond)"
          pairs={[{ label: 'Provided', value: `${f2(bondLength)} m` }, { label: 'Ultimate bond', value: `${f0(r.Qult)} kN` }]} />
      </>}
      summary={[
        { label: 'Bar', value: `⌀${barDia} mm, Fy ${fyBar} MPa` },
        { label: 'Grout', value: `⌀${groutDia} mm, f′c ${fcGrout} MPa` },
        { label: 'Casing', value: casing ? `${casingOD}/${casingID} mm, Fy ${fyCasing} MPa` : 'none' },
        { label: 'Bond zone', value: `⌀${f2(bondDia)} m × ${f2(bondLength)} m, α ${f2(alphaBond)} kPa` },
      ]}
      drawing={{ title: 'Bond zone and section', node: <div data-pdf-drawing><MicropileDrawing barDia={barDia} groutDia={groutDia} casing={casing} casingOD={casingOD} casingID={casingID}
        bondDia={bondDia} bondLength={bondLength} mode={mode} P={P} /></div> }}
      resultsCaption="Structural: 0.40·f′c·Agrout + 0.47·Fy·As (compression), 0.55·Fy·As (tension). Bond: π·Db·Lb·αbond / FS. Verify buckling in very soft soils, and group and settlement effects, separately."
      results={[
        { check: 'Structural allowable', basis: mode === 'compression' ? '0.40 f′c Ag + 0.47 Fy As' : '0.55 Fy As', demand: `${f0(r.structural)} kN`, status: 'info' as const },
        { check: 'Bond allowable', basis: 'π Db Lb αbond / 2', demand: `${f0(r.Qbond)} kN`, status: 'info' as const },
        { check: 'Demand vs governing', basis: r.governs, demand: `${f0(P)} kN`, limit: `${f0(r.allowable)} kN`, ratio: Number.isFinite(util) ? util : undefined, status: r.ok ? 'pass' as const : 'fail' as const },
        { check: 'Bond length', basis: 'required for FS 2', demand: `${f2(r.bondLengthReq)} m`, limit: `${f2(bondLength)} m`, status: bondLength >= r.bondLengthReq ? 'pass' as const : 'fail' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Structural capacity', basis: 'allowable-stress bar + casing + grout', source: 'FHWA-NHI-05-039, Micropile Design and Construction, Ch. 5' },
        { topic: 'Grout-to-ground bond', basis: 'αbond by soil and grouting method', source: 'FHWA-NHI-05-039, Ch. 5' },
      ]}
    />
  )
}
