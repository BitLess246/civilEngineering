import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { shapesOf, shapeByName } from '../engine/aiscSections'
import type { AiscShape } from '../engine/aiscSections'
import {
  deriveWSection, beamFlexure, beamShear, columnAxial,
  weakAxisFlexure, combinedLoading, boltShear, weldStrength,
  beamLoadingSimple,
} from '../engine/steelDesign'
import type { BoltGrade, ElectrodeClass } from '../engine/steelDesign'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f1, f2, f3 } from '../lib/format'

type Tab = 'beam' | 'column' | 'connection'
type Grade = 'A36' | 'A572G50'
type ConnType = 'bolt' | 'weld'

const GRADES: Record<Grade, { Fy: number; Fu: number; label: string }> = {
  A36:    { Fy: 248, Fu: 400, label: 'A36 / SS400 (Fy = 248 MPa)' },
  A572G50: { Fy: 345, Fu: 448, label: 'A572 Gr50 / A992 (Fy = 345 MPa)' },
}

const W_SHAPES = shapesOf('W')
const wName = (s: AiscShape) => s.name

function shapeOrFirst(name: string): AiscShape {
  return shapeByName(name) ?? W_SHAPES[0]
}

const badge = (zone: string) => {
  const cls = zone === 'plastic' ? 'bg-green-100 text-green-800'
            : zone === 'inelastic' ? 'bg-amber-100 text-amber-800'
            : 'bg-red-100 text-red-800'
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{zone} LTB</span>
}

const ok = (pass: boolean, val: string) => (
  <span className={pass ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>{val} {pass ? '✓' : '✗'}</span>
)

// ─── Beam Tab ──────────────────────────────────────────────────────────────
function BeamTab() {
  const [shapeName, setShapeName] = useState('W310x39')
  const [grade, setGrade]         = useState<Grade>('A572G50')
  const [span, setSpan]           = useState(6)
  const [Lb, setLb]               = useState(2)
  const [Cb, setCb]               = useState(1.0)
  const [wDead, setWDead]         = useState(15)
  const [wLive, setWLive]         = useState(25)

  const { Fy } = GRADES[grade]
  const shape = useMemo(() => shapeOrFirst(shapeName), [shapeName])
  const props = useMemo(() => deriveWSection(shape), [shape])

  const flex  = useMemo(() => beamFlexure(shape, props, Fy, Lb * 1000, Cb), [shape, props, Fy, Lb, Cb])
  const shear = useMemo(() => beamShear(shape, props, Fy), [shape, props, Fy])
  const loads = useMemo(() => beamLoadingSimple({ wDead, wLive, L: span }, props.Ix), [wDead, wLive, span, props])

  const utilM = flex.phiMn > 0 ? loads.Mu / flex.phiMn : Infinity
  const utilV = shear.phiVn > 0 ? loads.Vu / shear.phiVn : Infinity

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title="Section">
          <label className="flex flex-col text-sm col-span-full">
            <span className="mb-1 font-medium text-slate-600">W-shape</span>
            <select value={shapeName} onChange={(e) => setShapeName(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none">
              {W_SHAPES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <Pick label="Steel grade" value={grade} onChange={(v) => setGrade(v as Grade)}
            options={Object.entries(GRADES).map(([k, v]) => [k as Grade, v.label])} />
        </Card>

        <Card title="Span & bracing">
          <Num label="Span L" unit="m" value={span} onChange={setSpan} />
          <Num label="Unbraced Lb" unit="m" value={Lb} onChange={setLb} />
          <Num label="Cb (moment gradient)" value={Cb} onChange={setCb} />
        </Card>

        <Card title="Uniform loads (service)">
          <Num label="Dead wD" unit="kN/m" value={wDead} onChange={setWDead} />
          <Num label="Live wL" unit="kN/m" value={wLive} onChange={setWLive} />
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <ResultCard title="Section properties">
          <Row label="A" value={`${shape.A.toLocaleString()} mm²`} />
          <Row label="Ix" value={`${(props.Ix / 1e6).toFixed(1)} × 10⁶ mm⁴`} />
          <Row label="Sx" value={`${(props.Sx / 1e3).toFixed(0)} × 10³ mm³`} />
          <Row label="Zx" value={`${(props.Zx / 1e3).toFixed(0)} × 10³ mm³`} />
          <Row label="ry" value={`${shape.ry} mm`} />
          <Row label="Lp" value={`${f2(flex.Lp / 1000)} m`} sub="yielding limit" />
          <Row label="Lr" value={`${f2(flex.Lr / 1000)} m`} sub="elastic LTB limit (conservative J)" />
        </ResultCard>

        <ResultCard title="Compact section (Table B4.1b)">
          <Row label="λf = bf/2tf" value={f2(flex.lambdaF)} sub={`λpf = ${f2(flex.lambdaPF)}`} />
          <Row label="Flange" value={ok(flex.compactFlange, flex.compactFlange ? 'compact' : 'non-compact')} />
          <Row label="λw = hw/tw" value={f1(flex.lambdaW)} sub={`λpw = ${f1(flex.lambdaPW)}`} />
          <Row label="Web" value={ok(flex.compactWeb, flex.compactWeb ? 'compact' : 'non-compact')} />
        </ResultCard>

        <ResultCard title="Factored demands">
          <Row label="wu" value={`${f2(loads.wu)} kN/m`} sub="max(1.4D, 1.2D+1.6L)" />
          <Row label="Mu" value={`${f1(loads.Mu)} kN·m`} />
          <Row label="Vu" value={`${f1(loads.Vu)} kN`} />
        </ResultCard>

        <ResultCard title="Flexure §F2">
          <Row label={<>φMn {badge(flex.ltbZone)}</>} value={`${f1(flex.phiMn)} kN·m`} />
          <Row alert={utilM > 1} label="Mu / φMn" value={ok(utilM <= 1, `${(utilM * 100).toFixed(0)} %`)} />
        </ResultCard>

        <ResultCard title="Shear §G2.1">
          <Row label="Aw = d·tw" value={`${shear.Aw.toFixed(0)} mm²`} />
          <Row label="φv" value={shear.phiV.toFixed(1)} sub={`Cv1 = ${shear.Cv1.toFixed(2)}`} />
          <Row label="φVn" value={`${f1(shear.phiVn)} kN`} />
          <Row alert={utilV > 1} label="Vu / φVn" value={ok(utilV <= 1, `${(utilV * 100).toFixed(0)} %`)} />
        </ResultCard>

        <ResultCard title="Deflection (unfactored)">
          <Row label="δD (dead)" value={`${f2(loads.deltaD)} mm`} />
          <Row label="δL (live)" value={`${f2(loads.deltaL)} mm`} sub={`limit L/360 = ${f2(loads.limL360)} mm`} />
          <Row alert={loads.deltaL > loads.limL360}
            label="δL ≤ L/360" value={ok(loads.deltaL <= loads.limL360, `${f2(loads.deltaL)} mm`)} />
          <Row alert={loads.deltaD + loads.deltaL > loads.limL240}
            label="δtotal ≤ L/240" value={ok(loads.deltaD + loads.deltaL <= loads.limL240,
              `${f2(loads.deltaD + loads.deltaL)} mm`)} sub={`limit = ${f2(loads.limL240)} mm`} />
        </ResultCard>
      </div>
    </div>
  )
}

// ─── Column Tab ────────────────────────────────────────────────────────────
function ColumnTab() {
  const [shapeName, setShapeName] = useState('W250x67')
  const [grade, setGrade]         = useState<Grade>('A572G50')
  const [L, setL]                 = useState(4)
  const [Kx, setKx]               = useState(1.0)
  const [Ky, setKy]               = useState(1.0)
  const [loadInput, setLoadInput] = useState<'direct' | 'DL'>('DL')
  const [dead, setDead]           = useState(800)
  const [live, setLive]           = useState(500)
  const [PuDir, setPuDir]         = useState(1944)
  const [Mux, setMux]             = useState(80)
  const [Muy, setMuy]             = useState(0)

  const { Fy } = GRADES[grade]
  const shape = useMemo(() => shapeOrFirst(shapeName), [shapeName])
  const props = useMemo(() => deriveWSection(shape), [shape])
  const Pu  = loadInput === 'DL' ? Math.max(1.4 * dead, 1.2 * dead + 1.6 * live) : PuDir

  const axial  = useMemo(() => columnAxial(shape, Fy, L, Kx, Ky), [shape, Fy, L, Kx, Ky])
  const flexX  = useMemo(() => beamFlexure(shape, props, Fy, L * 1000, 1.0), [shape, props, Fy, L])
  const flexY  = useMemo(() => weakAxisFlexure(shape, props, Fy), [shape, props, Fy])
  const comb   = useMemo(
    () => combinedLoading(Pu, axial.phiPn, Mux, flexX.phiMn, Muy, flexY.phiMny),
    [Pu, axial, Mux, flexX, Muy, flexY]
  )

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title="Section">
          <label className="flex flex-col text-sm col-span-full">
            <span className="mb-1 font-medium text-slate-600">W-shape</span>
            <select value={shapeName} onChange={(e) => setShapeName(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none">
              {W_SHAPES.map((s) => <option key={s.name} value={wName(s)}>{s.name}</option>)}
            </select>
          </label>
          <Pick label="Steel grade" value={grade} onChange={(v) => setGrade(v as Grade)}
            options={Object.entries(GRADES).map(([k, v]) => [k as Grade, v.label])} />
        </Card>

        <Card title="Column geometry">
          <Num label="Height L" unit="m" value={L} onChange={setL} />
          <Num label="Kx (x-axis)" value={Kx} onChange={setKx} />
          <Num label="Ky (y-axis)" value={Ky} onChange={setKy} />
        </Card>

        <Card title="Loads">
          <Pick label="Axial input" value={loadInput} onChange={(v) => setLoadInput(v as 'direct' | 'DL')}
            options={[['DL', 'Service D & L'], ['direct', 'Factored Pu']]} />
          {loadInput === 'DL' ? <>
            <Num label="Dead D" unit="kN" value={dead} onChange={setDead} />
            <Num label="Live L" unit="kN" value={live} onChange={setLive} />
          </> : (
            <Num label="Pu" unit="kN" value={PuDir} onChange={setPuDir} />
          )}
          <Num label="Mux (strong)" unit="kN·m" value={Mux} onChange={setMux} />
          <Num label="Muy (weak)" unit="kN·m" value={Muy} onChange={setMuy} />
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <ResultCard title="Section properties">
          <Row label="A" value={`${shape.A.toLocaleString()} mm²`} />
          <Row label="rx" value={`${shape.rx} mm`} />
          <Row label="ry" value={`${shape.ry} mm`} />
          <Row label="Zx" value={`${(props.Zx / 1e3).toFixed(0)} × 10³ mm³`} />
        </ResultCard>

        <ResultCard title="Axial §E3">
          <Row label="KxL/rx" value={f1(axial.slendernessX)} />
          <Row label="KyL/ry" value={f1(axial.slendernessY)} />
          <Row alert={!axial.slenderOK}
            label="KL/r (governing)" value={`${f1(axial.slenderness)}${axial.slenderOK ? '' : ' > 200 ✗'}`} />
          <Row label="Fcr" value={`${f1(axial.Fcr)} MPa`} />
          <Row label="φPn" value={`${f1(axial.phiPn)} kN`} />
          <Row label="Pu" value={`${f1(Pu)} kN`} sub={`${(Pu / axial.phiPn * 100).toFixed(0)} %`} />
        </ResultCard>

        <ResultCard title="Flexure">
          <Row label="φMnx (strong)" value={`${f1(flexX.phiMn)} kN·m`} sub={flexX.ltbZone} />
          <Row label="φMny (weak §F6)" value={`${f1(flexY.phiMny)} kN·m`} />
        </ResultCard>

        <ResultCard title={`Combined §${comb.equation}`}>
          <Row label="Pu / φPn" value={f3(Pu / axial.phiPn)} />
          <Row label="Mux / φMnx" value={f3(Mux / flexX.phiMn)} />
          {Muy > 0 && <Row label="Muy / φMny" value={f3(Muy / flexY.phiMny)} />}
          <Row alert={!comb.ok}
            label="Combined ratio" value={ok(comb.ok, `${(comb.ratio * 100).toFixed(0)} %`)} />
        </ResultCard>
      </div>
    </div>
  )
}

// ─── Connection Tab ─────────────────────────────────────────────────────────
function ConnectionTab() {
  const [connType, setConnType]       = useState<ConnType>('bolt')
  const [Vu, setVu]                   = useState(150)
  // bolt
  const [boltGrade, setBoltGrade]     = useState<BoltGrade>('A325M')
  const [db, setDb]                   = useState(19)
  const [nBolts, setNBolts]           = useState(3)
  const [tConn, setTConn]             = useState(10)
  const [FuConn, setFuConn]           = useState(400)
  const [threads, setThreads]         = useState<'yes' | 'no'>('yes')
  // weld
  const [electrode, setElectrode]     = useState<ElectrodeClass>('E70')
  const [wSize, setWSize]             = useState(8)
  const [weldLen, setWeldLen]         = useState(200)

  const bolt = useMemo(
    () => boltShear(boltGrade, db, Vu, tConn, FuConn, threads === 'yes'),
    [boltGrade, db, Vu, tConn, FuConn, threads]
  )
  const weld = useMemo(() => weldStrength(electrode, wSize, Vu), [electrode, wSize, Vu])

  const boltCapacity = nBolts * bolt.phiRn
  const weldCapacity = weldLen * weld.phiRnw
  const utilBolt = Vu / boltCapacity
  const utilWeld = Vu / weldCapacity

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title="Connection">
          <Pick label="Type" value={connType} onChange={(v) => setConnType(v as ConnType)}
            options={[['bolt', 'Bolted (§J3)'], ['weld', 'Fillet weld (§J2.4)']]} />
          <Num label="Applied Vu" unit="kN" value={Vu} onChange={setVu} />
        </Card>

        {connType === 'bolt' ? (
          <Card title="Bolt group">
            <Pick label="Grade" value={boltGrade} onChange={(v) => setBoltGrade(v as BoltGrade)}
              options={[['A325M', 'A325M (F10T equiv)'], ['A490M', 'A490M (F13T equiv)']]} />
            <Num label="Bolt diameter db" unit="mm" value={db} onChange={setDb} />
            <Num label="Number of bolts n" value={nBolts} onChange={setNBolts} />
            <Pick label="Threads in shear plane" value={threads} onChange={(v) => setThreads(v as 'yes' | 'no')}
              options={[['yes', 'Yes (N)'], ['no', 'No (X)']]} />
            <Num label="Plate thickness t" unit="mm" value={tConn} onChange={setTConn} />
            <Num label="Plate Fu" unit="MPa" value={FuConn} onChange={setFuConn} />
          </Card>
        ) : (
          <Card title="Fillet weld">
            <Pick label="Electrode" value={electrode} onChange={(v) => setElectrode(v as ElectrodeClass)}
              options={[['E70', 'E70XX (Fexx 482 MPa)'], ['E80', 'E80XX (550 MPa)'],
                        ['E90', 'E90XX (620 MPa)'],    ['E100', 'E100XX (690 MPa)']]} />
            <Num label="Weld size w" unit="mm" value={wSize} onChange={setWSize} />
            <Num label="Total weld length" unit="mm" value={weldLen} onChange={setWeldLen} />
          </Card>
        )}
      </div>

      <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        {connType === 'bolt' ? (
          <ResultCard title="Bolt design §J3.6 / §J3.10">
            <Row label="Ab (bolt area)" value={`${bolt.Ab.toFixed(0)} mm²`} />
            <Row label="Fnv" value={`${bolt.Fnv} MPa`} />
            <Row label="φRn shear / bolt" value={`${f2(bolt.phiRn_shear)} kN`} />
            <Row label="φRn bearing / bolt" value={`${f2(bolt.phiRn_bearing)} kN`} sub="governs if shown bold" />
            <Row label="φRn / bolt (governing)" value={<b>{f2(bolt.phiRn)} kN</b>} />
            <Row label="Bolts required" value={`${bolt.n_reqd}`} sub={`for Vu = ${Vu} kN`} />
            <Row label={`Capacity (${nBolts} bolts)`} value={`${f1(boltCapacity)} kN`} />
            <Row alert={utilBolt > 1}
              label={`Vu / (${nBolts} × φRn)`}
              value={ok(utilBolt <= 1, `${(utilBolt * 100).toFixed(0)} %`)} />
          </ResultCard>
        ) : (
          <ResultCard title="Fillet weld §J2.4">
            <Row label="Fexx" value={`${weld.Fexx} MPa`} />
            <Row label="Throat (0.707w)" value={`${(0.707 * wSize).toFixed(1)} mm`} />
            <Row label="φRnw / mm length" value={`${f3(weld.phiRnw)} kN/mm`} />
            <Row label="Required length" value={`${f1(weld.L_reqd)} mm`} sub={`for Vu = ${Vu} kN`} />
            <Row label={`Capacity (${weldLen} mm)`} value={`${f1(weldCapacity)} kN`} />
            <Row alert={utilWeld > 1}
              label={`Vu / (${weldLen} mm × φRnw)`}
              value={ok(utilWeld <= 1, `${(utilWeld * 100).toFixed(0)} %`)} />
            <p className="mt-2 text-[10px] text-slate-400">
              Divide total length by 2 for two-sided welds. Check minimum weld size
              per AISC Table J2.4 (governed by thicker connected part).
            </p>
          </ResultCard>
        )}

        <div className="print-avoid-break rounded-xl border border-slate-100 bg-slate-50 p-4 text-[11px] text-slate-500 space-y-1">
          <p className="font-semibold text-slate-600">Notes</p>
          <p>• Bolt shear: one shear plane. Multiply n by number of shear planes for lap/splice.</p>
          <p>• Bearing per bolt: standard holes, no deformation limit state (§J3.10). Check edge distance ≥ 1.5d, spacing ≥ 3d (§J3.3).</p>
          <p>• Weld capacity is for a single pass, direct shear (θ = 0°). §J2.4(b) allows a 50% increase for transverse loading.</p>
          <p>• Block shear (§J4.3) and net section (§J4.1) should be checked separately.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function SteelDesign() {
  const [tab, setTab] = useState<Tab>('beam')

  const tabBtn = (t: Tab, label: string) => (
    <button type="button"
      onClick={() => setTab(t)}
      className={`rounded-md px-4 py-1.5 text-sm font-semibold transition
        ${tab === t ? 'bg-[#0056b3] text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Steel Design</h1>
      <p className="no-print mt-1 text-slate-600">
        AISC 360-16 LRFD — steel beams (§F/G, flexure + shear + deflection),
        columns (§E3 + §H1-1 combined), and connections (bolts §J3, fillet welds §J2.4).
        W-shapes from the same AISC library used in Truss Space.
      </p>
      <ReportControls title="Steel Design Report" />

      <div className="no-print mt-5 mb-6 flex gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm w-fit">
        {tabBtn('beam',       'Beam')}
        {tabBtn('column',     'Column')}
        {tabBtn('connection', 'Connection')}
      </div>

      <div className="mt-2">
        {tab === 'beam'       && <BeamTab />}
        {tab === 'column'     && <ColumnTab />}
        {tab === 'connection' && <ConnectionTab />}
      </div>
    </div>
  )
}
