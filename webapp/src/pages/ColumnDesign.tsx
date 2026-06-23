import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  designAxialColumn, interaction, capacityAtEccentricity, momentMagnificationNonsway,
  type ColumnShape, type LateralSystem,
} from '../engine/columnDesign'
import { factoredLoad } from '../engine/loads'
import { ColumnSchematic } from '../components/ColumnSchematic'
import { InteractionDiagram } from '../components/InteractionDiagram'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import { axialColumnSolution, eccentricColumnSolution, slendernessSolution } from '../lib/columnSolution'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { Math as KTex } from '../lib/math'
import { f0, f1, f2 } from '../lib/format'
import type { SolutionStep } from '../lib/solution'
import 'katex/dist/katex.min.css'

type Mode = 'axial' | 'eccentric'
type LoadInput = 'direct' | 'individual'
type BarMode = 'design' | 'analyze'

export default function ColumnDesign() {
  const [mode, setMode] = useState<Mode>('axial')
  const [shape, setShape] = useState<ColumnShape>('tied')
  const [b, setB] = useState(400); const [h, setH] = useState(400); const [D, setD] = useState(400)
  const [cover, setCover] = useState(40)
  const [barDia, setBarDia] = useState(28); const [tieDia, setTieDia] = useState(10)
  const [fc, setFc] = useState(28); const [fy, setFy] = useState(415); const [fyt, setFyt] = useState(415)
  const [loadInput, setLoadInput] = useState<LoadInput>('individual')
  const [dead, setDead] = useState(1400); const [live, setLive] = useState(790)
  const [PuDirect, setPuDirect] = useState(2944)
  const [Mu, setMu] = useState(200)
  const [barMode, setBarMode] = useState<BarMode>('design')
  const [numBars, setNumBars] = useState(8)
  // Seismic / lateral system
  const [system, setSystem] = useState<LateralSystem>('gravity')
  const [colLen, setColLen] = useState(3000)  // mm clear height
  const [hx, setHx]         = useState(0)     // mm, max lateral tie spacing (0 = use bMin)
  // Slenderness (nonsway)
  const [slenderOn, setSlenderOn] = useState(false)
  const [kEff, setKEff] = useState(1.0); const [Lu, setLu] = useState(3.0)
  const [M1, setM1] = useState(-150); const [M2, setM2] = useState(200)
  const [EIin, setEIin] = useState(0)   // kN·m², 0 → derive 0.4EcIg/(1+βd)

  const eccentric = mode === 'eccentric'
  const tied = shape === 'tied' || eccentric    // eccentric pilot is tied-rect only
  const Pu = loadInput === 'individual' ? factoredLoad({ dead, live }) : PuDirect

  const axial = useMemo(() => {
    if (!(fc > 0 && fy > 0 && Pu > 0)) return null
    try {
      return designAxialColumn({
        shape: tied ? 'tied' : 'spiral', b, h, D, cover, barDia, tieDia, fc, fy, fyt, Pu,
        numBars: barMode === 'analyze' || eccentric ? numBars : undefined,
        system, columnLength: colLen, hx: hx > 0 ? hx : undefined,
      })
    } catch { return null }
  }, [tied, b, h, D, cover, barDia, tieDia, fc, fy, fyt, Pu, barMode, numBars, eccentric, system, colLen, hx])

  const slender = useMemo(() => {
    if (!eccentric || !slenderOn) return null
    return momentMagnificationNonsway({
      Pu, M1, M2, k: kEff, Lu, h, shape: 'tied',
      EI: EIin > 0 ? EIin : undefined, fc, b, betaD: 0.6,
    })
  }, [eccentric, slenderOn, Pu, M1, M2, kEff, Lu, h, EIin, fc, b])

  const MuEff = slender ? slender.Mc : Mu
  const inter = useMemo(() => {
    if (!eccentric || !(b > 0 && h > 0)) return null
    try { return interaction({ b, h, cover, barDia, tieDia, fc, fy, numBars }) } catch { return null }
  }, [eccentric, b, h, cover, barDia, tieDia, fc, fy, numBars])
  const cap = useMemo(() => {
    if (!inter || !(Pu > 0) || !(MuEff > 0)) return null
    return capacityAtEccentricity({ b, h, cover, barDia, tieDia, fc, fy, numBars }, MuEff / Pu)
  }, [inter, Pu, MuEff, b, h, cover, barDia, tieDia, fc, fy, numBars])

  const solution = useMemo(() => {
    const steps: SolutionStep[] = []
    if (slender) steps.push(...slendernessSolution({ Pu, M1, M2, k: kEff, Lu, h, EI: EIin > 0 ? EIin : undefined, fc, b }, slender))
    if (eccentric && inter && cap) steps.push(...eccentricColumnSolution({ b, h, cover, barDia, tieDia, fc, fy, numBars }, inter, Pu, MuEff, cap))
    if (axial) steps.push(...axialColumnSolution({
      shape: tied ? 'tied' : 'spiral', b, h, D, cover, barDia, tieDia, fc, fy, fyt, Pu,
      numBars: barMode === 'analyze' || eccentric ? numBars : undefined,
    }, axial))
    return steps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slender, eccentric, inter, cap, axial, Pu, MuEff])

  const util = cap && cap.phi * cap.Pn > 1e-9 ? Pu / (cap.phi * cap.Pn) : null

  // ~12 representative rows for the P-M table, balanced point always included.
  const tableRows = useMemo(() => {
    if (!inter) return []
    const { curve, PnMax } = inter
    const compCap = 0.65 * PnMax
    const balIdx = curve.reduce(
      (b, _, i) => Math.abs(curve[i].c - inter.balanced.c) < Math.abs(curve[b].c - inter.balanced.c) ? i : b, 0,
    )
    const selected = new Set([80, 72, 63, 54, balIdx, 45, 36, 27, 18, 9, 2, 0])
    return [...selected]
      .sort((a, z) => z - a)   // high c first (compression at top of table)
      .map((idx) => ({
        ...curve[idx],
        phiPn: Math.min(curve[idx].phi * curve[idx].Pn, compCap),
        phiMn: curve[idx].phi * curve[idx].Mn,
        isBalanced: idx === balIdx,
        label: idx === 80 ? 'Pure axial' : idx === balIdx ? 'Balanced' : idx === 0 ? 'Pure flexure' : '—',
      }))
      .filter((p) => p.Pn > -100)   // drop deep-tension rows
  }, [inter])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Column Design</h1>
      <p className="no-print mt-1 text-slate-600">
        RC column — short axial (tied / spiral with §425.7 detailing), eccentric via strain-compatibility
        P–M interaction (balanced condition, φ transition), and nonsway moment magnification for slender
        columns. NSCP 2015 / ACI 318-14.
      </p>
      <ReportControls title="Column Design Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Column">
            <Pick label="Loading" value={mode} onChange={(v) => setMode(v as Mode)}
              options={[['axial', 'Concentric (axial)'], ['eccentric', 'Eccentric (P + M)']]} />
            <Pick label="Shape" value={eccentric ? 'tied' : shape} onChange={(v) => setShape(v as ColumnShape)}
              options={eccentric ? [['tied', 'Tied rectangular']] : [['tied', 'Tied rectangular'], ['spiral', 'Spiral circular']]} />
            {tied ? <>
              <Num label="Width b" unit="mm" value={b} onChange={setB} />
              <Num label="Depth h (bending dir.)" unit="mm" value={h} onChange={setH} />
            </> : (
              <Num label="Diameter D" unit="mm" value={D} onChange={setD} />
            )}
            <Num label="Clear cover" unit="mm" value={cover} onChange={setCover} />
            <Num label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={barDia} onChange={setBarDia} />
            <Num label={tied ? <>Tie <KTex tex="d_t" /></> : <>Spiral <KTex tex="d_s" /></>} unit="mm" value={tieDia} onChange={setTieDia} />
            <Pick label="Bars" value={eccentric ? 'analyze' : barMode} onChange={(v) => setBarMode(v as BarMode)}
              options={eccentric ? [['analyze', 'Given count']] : [['design', 'Design automatically'], ['analyze', 'Given count']]} />
            {(barMode === 'analyze' || eccentric) && (
              <Num label="No. of bars" value={numBars} onChange={setNumBars} />
            )}
          </Card>

          <Card title="Materials">
            <Num label={<KTex tex="f'_c" />} unit="MPa" value={fc} onChange={setFc} />
            <Num label={<KTex tex="f_y" />} unit="MPa" value={fy} onChange={setFy} />
            <Num label={<KTex tex="f_{yt}" />} unit="MPa" value={fyt} onChange={setFyt} />
          </Card>

          <Card title="Lateral system / seismic">
            <Pick label="System" value={system} onChange={v => setSystem(v as LateralSystem)}
              options={[
                ['gravity', 'Gravity only (§425.7.2)'],
                ['imf', 'IMF — Intermediate MF (§418.4.3)'],
                ['smf', 'SMF — Special MF (§418.7.5)'],
              ]} />
            {system !== 'gravity' && (
              <Num label="Clear height Lu" unit="mm" value={colLen} onChange={setColLen} />
            )}
            {system === 'smf' && (
              <>
                <Num label="Max lateral bar spacing hx" unit="mm" value={hx} onChange={setHx} />
                <p className="col-span-full text-[10px] text-slate-400">
                  hx = centre-to-centre of outermost laterally restrained bars (≤ 350 mm).
                  Set 0 to use the column least dimension as the default.
                </p>
              </>
            )}
          </Card>

          <Card title="Loads">
            <Pick label="Load entry" value={loadInput} onChange={(v) => setLoadInput(v as LoadInput)}
              options={[['individual', 'Individual (D & L)'], ['direct', 'Factored Pu']]} />
            {loadInput === 'individual' ? <>
              <Num label={<>Dead <KTex tex="D" /></>} unit="kN" value={dead} onChange={setDead} />
              <Num label={<>Live <KTex tex="L" /></>} unit="kN" value={live} onChange={setLive} />
              <p className="col-span-full text-xs text-slate-400">Pu = max(1.4D, 1.2D+1.6L) = {f0(Pu)} kN</p>
            </> : (
              <Num label={<KTex tex="P_u" />} unit="kN" value={PuDirect} onChange={setPuDirect} />
            )}
            {eccentric && <Num label={<KTex tex="M_u" />} unit="kN·m" value={Mu} onChange={setMu} />}
          </Card>

          {eccentric && (
            <Card title="Slenderness (nonsway)">
              <Pick label="Consider slenderness" value={slenderOn ? 'yes' : 'no'} onChange={(v) => setSlenderOn(v === 'yes')}
                options={[['no', 'No — short column'], ['yes', 'Yes — magnify moment']]} />
              {slenderOn && <>
                <Num label="k" value={kEff} onChange={setKEff} />
                <Num label={<KTex tex="L_u" />} unit="m" value={Lu} onChange={setLu} />
                <Num label={<KTex tex="M_1" />} unit="kN·m" value={M1} onChange={setM1} />
                <Num label={<KTex tex="M_2" />} unit="kN·m" value={M2} onChange={setM2} />
                <Num label="EI (0 = 0.4EcIg/1.6)" unit="kN·m²" value={EIin} onChange={setEIin} />
                <p className="col-span-full text-xs text-slate-400">
                  Sheet convention: M1/M2 negative for single curvature.
                </p>
              </>}
            </Card>
          )}
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Section</h2>
            <ColumnSchematic shape={tied ? 'tied' : 'spiral'} b={b} h={h} D={D} cover={cover}
              barDia={barDia} tieDia={tieDia} bars={axial?.bars ?? numBars}
              tieSpacing={axial ? (tied ? axial.tieSpacingFinal : axial.spiralPitch) : undefined} />
          </div>

          {axial && (
            <ResultCard title="Results">
              {eccentric && slender && (
                <Row label="Magnified Mc" value={`${f2(slender.Mc)} kN·m`}
                  sub={`δ=${slender.delta.toFixed(3)} · ${slender.slender ? 'slender' : 'short'}`} />
              )}
              {eccentric && util !== null && cap && (
                <Row alert={util > 1} label="Utilisation" value={`${(util * 100).toFixed(0)} %`}
                  sub={`φPn=${f1(cap.phi * cap.Pn)} kN @ e=${f0((MuEff / Pu) * 1000)} mm`} />
              )}
              <Row label="Bars" value={`${axial.bars} ⌀${barDia} mm`}
                sub={`ρ=${(axial.rho * 100).toFixed(2)}% ${axial.rhoOK ? '✓' : '✗ (1–8%)'}`} />
              <Row alert={!axial.axialOK && !eccentric} label={<KTex tex="\phi P_{n,max}" />}
                value={`${f1(axial.phiPnMax)} kN`}
                sub={`Po=${f1(axial.Po)} · ${axial.alpha.toFixed(2)}Po cap`} />
              {tied ? (<>
                <Row label="Ties" value={`⌀${Math.max(tieDia, axial.tieDiaMin)} @ ${f0(axial.tieSpacingFinal)} mm`}
                  sub={axial.tieSpacingLabel} />
                {system !== 'gravity' && axial.seismicSConf !== undefined && (<>
                  <Row label="Conf. zone length lo" value={`${f0(axial.seismicLoZone ?? 0)} mm`}
                    sub={system === 'smf' ? '§418.7.5.1' : '§418.4.3'} />
                  <Row label="s (in conf. zone)" value={`${f0(axial.seismicSConf)} mm`}
                    sub={system === 'smf' ? '§418.7.5.4' : '§418.4.3'} />
                  {system === 'smf' && axial.seismicSOut !== undefined && (
                    <Row label="s (outside lo)" value={`${f0(axial.seismicSOut)} mm`} sub="§418.7.5.5" />
                  )}
                </>)}
              </>) : (
                <Row alert={!axial.pitchClearOK} label="Spiral" value={`⌀${tieDia} @ ${f0(axial.spiralPitch)} mm pitch`}
                  sub={`ρs=${axial.rhoS.toFixed(4)}`} />
              )}
              {eccentric && inter && (
                <Row label="Balanced point" value={`Pb=${f1(inter.balanced.Pb)} kN`}
                  sub={`Mb=${f1(inter.balanced.Mb)} · eb=${f0(inter.balanced.eb * 1000)} mm`} />
              )}
            </ResultCard>
          )}

          {eccentric && inter && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <InteractionDiagram r={inter} Pu={Pu} Mu={MuEff} />
            </div>
          )}
        </div>
      </div>

      {eccentric && inter && tableRows.length > 0 && (
        <div className="mt-6 print-avoid-break rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-[1.02rem] font-bold text-[#0056b3]">P–M Interaction Table — Design Envelope (φP<sub>n</sub>, φM<sub>n</sub>)</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                  <th className="pb-1.5 pr-3 font-semibold">Point</th>
                  <th className="pb-1.5 pr-3 font-semibold">c (mm)</th>
                  <th className="pb-1.5 pr-3 font-semibold">εt</th>
                  <th className="pb-1.5 pr-3 font-semibold">φ</th>
                  <th className="pb-1.5 pr-3 font-semibold">Pn (kN)</th>
                  <th className="pb-1.5 pr-3 font-semibold">Mn (kN·m)</th>
                  <th className="pb-1.5 pr-3 font-semibold">φPn (kN)</th>
                  <th className="pb-1.5 font-semibold">φMn (kN·m)</th>
                </tr>
              </thead>
              <tbody>
                {/* Compression cap */}
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td className="py-1 pr-3 font-semibold text-slate-600">Max. axial cap</td>
                  <td className="py-1 pr-3 text-slate-500">—</td>
                  <td className="py-1 pr-3 text-slate-500">—</td>
                  <td className="py-1 pr-3 text-slate-500">0.65</td>
                  <td className="py-1 pr-3 text-slate-500">{f1(inter.PnMax)}</td>
                  <td className="py-1 pr-3 text-slate-500">0</td>
                  <td className="py-1 pr-3 font-semibold text-slate-800">{f1(0.65 * inter.PnMax)}</td>
                  <td className="py-1 font-semibold text-slate-800">0</td>
                </tr>
                {tableRows.map((row, i) => (
                  <tr key={i}
                    className={`border-b border-slate-100 last:border-0 ${row.isBalanced ? 'bg-purple-50' : ''}`}>
                    <td className={`py-1 pr-3 ${row.isBalanced ? 'font-semibold text-purple-700' : 'text-slate-600'}`}>
                      {row.label}
                    </td>
                    <td className="py-1 pr-3 text-slate-600">{f0(row.c)}</td>
                    <td className="py-1 pr-3 text-slate-600">{row.et.toFixed(4)}</td>
                    <td className="py-1 pr-3 text-slate-600">{row.phi.toFixed(2)}</td>
                    <td className="py-1 pr-3 text-slate-600">{f1(row.Pn)}</td>
                    <td className="py-1 pr-3 text-slate-600">{f1(Math.abs(row.Mn))}</td>
                    <td className={`py-1 pr-3 font-semibold ${row.isBalanced ? 'text-purple-700' : 'text-slate-800'}`}>
                      {f1(Math.max(0, row.phiPn))}
                    </td>
                    <td className={`py-1 font-semibold ${row.isBalanced ? 'text-purple-700' : 'text-slate-800'}`}>
                      {f1(Math.max(0, row.phiMn))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cap && (
            <p className="mt-2 text-[11px] text-slate-500">
              Demand: P<sub>u</sub>={f1(Pu)} kN · M<sub>u</sub>={f1(MuEff)} kN·m —
              capacity at e={f0((MuEff / Pu) * 1000)} mm: φP<sub>n</sub>={f1(cap.phi * cap.Pn)} kN,
              utilisation {util !== null ? `${(util * 100).toFixed(0)}%` : '—'}.
              Balanced: P<sub>b</sub>={f1(inter.balanced.Pb)} kN, M<sub>b</sub>={f1(inter.balanced.Mb)} kN·m.
            </p>
          )}
        </div>
      )}

      {solution.length > 0 && <WorkedSolution steps={solution} />}
    </div>
  )
}
