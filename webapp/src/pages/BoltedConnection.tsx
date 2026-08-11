import { lazy, Suspense, useMemo, useState } from 'react'
// type-only imports — no engine code bundled into the browser from here
import type { BoltGrade } from '../engine/steelDesign'
import { calcConnection } from '../lib/calcApi'
import type { ConnectionCalcResult } from '../lib/calcApi'
import { useCalcResult } from '../lib/useCalcResult'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import { ConnectionDrawing } from '../components/ConnectionDrawing'
import type { SolutionStep } from '../lib/solution'
import { f1, f2, f3 } from '../lib/format'
import { sn1, sn2 } from '../lib/solution'
import { PageHeader } from '../components/calc'
import { CalcBadge, Spinner, Verdict } from '../components/steelUi'

const ConnectionViewer3D = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.ConnectionViewer3D })))

function BoltedConnectionCalc() {
  const [Vu,         setVu]         = useState(150)
  const [Hu,         setHu]         = useState(0)
  const [boltGrade,  setBoltGrade]  = useState<BoltGrade>('A325M')
  const [db,         setDb]         = useState(20)
  const [nRows,      setNRows]      = useState(3)
  const [nCols,      setNCols]      = useState(1)
  const [sy,         setSy]         = useState(70)
  const [sx,         setSx]         = useState(70)
  const [ey,         setEy]         = useState(40)
  const [ex_edge,    setExEdge]     = useState(35)
  const [threads,    setThreads]    = useState<'yes'|'no'>('yes')
  const [tPlate,     setTPlate]     = useState(10)
  const [FuPlate,    setFuPlate]    = useState(400)
  const [FyPlate,    setFyPlate]    = useState(248)
  const [ex_load,    setExLoad]     = useState(0)
  const [ey_load,    setEyLoad]     = useState(0)
  const [e_out,      setEOut]       = useState(0)
  const [b_gage,     setBGage]      = useState(0)

  const input = useMemo(
    () => ({
      Vu, Hu,
      boltGrade, db, nRows, nCols, sy, sx, ey, ex_edge,
      threads: threads === 'yes',
      tPlate, FuPlate, FyPlate,
      ex_load, ey_load, e_out, b_gage,
    }),
    [Vu, Hu, boltGrade, db, nRows, nCols, sy, sx, ey, ex_edge, threads,
     tPlate, FuPlate, FyPlate, ex_load, ey_load, e_out, b_gage]
  )
  const { data: res, loading, error } = useCalcResult<ConnectionCalcResult>(
    () => calcConnection(input), [input]
  )

  const govBlockShear = res
    ? res.blockShear.reduce((mn, c) => c.phiRn < mn.phiRn ? c : mn, res.blockShear[0])
    : null

  const boltSteps = useMemo((): SolutionStep[] => {
    if (!res) return []
    const { phiRnBolt, geom, eccentric, outOfPlane, prying, blockShear } = res
    const { Fnv, Ab, phiRn_shear, phiRn_bearing, phiRn } = phiRnBolt
    const { n, Ip } = geom
    const M = eccentric.M
    return [
      {
        title: `Bolt shear capacity §J3.6 — ${boltGrade}, d_b = ${db} mm`,
        lines: [
          { tex: `A_b = \\frac{\\pi}{4} d_b^2 = \\frac{\\pi}{4}(${db})^2 = ${Ab.toFixed(0)}\\text{ mm}^2` },
          { tex: `F_{nv} = ${Fnv}\\text{ MPa}\\quad (${threads==='yes'?'threads in shear plane, N':'threads excluded, X'})` },
          { tex: `\\phi R_{n,\\text{shear}} = 0.75 F_{nv} A_b = 0.75 \\times ${Fnv} \\times ${Ab.toFixed(0)} / 1000 = ${sn2(phiRn_shear)}\\text{ kN/bolt}` },
        ],
      },
      {
        title: `Bearing on plate §J3.10 — t = ${tPlate} mm, F_u = ${FuPlate} MPa`,
        lines: [
          { tex: `\\phi R_{n,\\text{br}} = 0.75 \\times 2.4 F_u d_b t = 0.75 \\times 2.4 \\times ${FuPlate} \\times ${db} \\times ${tPlate} / 1000 = ${sn2(phiRn_bearing)}\\text{ kN/bolt}` },
          { tex: `\\phi R_n\\text{ (governing)} = \\min(${sn2(phiRn_shear)},\\;${sn2(phiRn_bearing)}) = ${sn2(phiRn)}\\text{ kN/bolt}` },
        ],
      },
      {
        title: `Bolt group (${nRows} × ${nCols} = ${n} bolts) — in-plane eccentricity (elastic method)`,
        lines: [
          { tex: `I_p = \\sum(x_i^2 + y_i^2) = ${Ip.toFixed(0)}\\text{ mm}^2` },
          { tex: `M = V_u \\cdot e_x - H_u \\cdot e_y = ${Vu} \\times ${ex_load} - ${Hu} \\times ${ey_load} = ${M.toFixed(0)}\\text{ kN·mm}` },
          { text: `Direct shear per bolt: Vx = Hu/n = ${(Hu/n).toFixed(2)} kN,  Vy = Vu/n = ${(Vu/n).toFixed(2)} kN` },
          { tex: `V_{x,i} = H_u/n - M y_i / I_p\\quad V_{y,i} = V_u/n + M x_i / I_p` },
          { tex: `R_{\\max} = ${sn2(eccentric.Rmax)}\\text{ kN on bolt }\\textit{${eccentric.critical}}` },
          { tex: `\\text{Utilisation} = R_{\\max} / (\\phi R_n) = ${sn2(eccentric.Rmax)} / ${sn2(phiRn)} = ${sn2(eccentric.Rmax/phiRn)}\\quad ${eccentric.Rmax<=phiRn?'\\checkmark':'\\times'}` },
        ],
      },
      {
        title: 'Bearing stress and shear stress on critical bolt',
        lines: (() => {
          const crit = eccentric.bolts.find(b => b.id === eccentric.critical)
          if (!crit) return []
          const Ab2 = (Math.PI/4)*db*db
          return [
            { tex: `f_{br} = \\frac{R_{\\max}}{d_b \\cdot t} = \\frac{${sn2(eccentric.Rmax)} \\times 1000}{${db} \\times ${tPlate}} = ${sn1(crit.fbr)}\\text{ MPa}\\quad \\phi F_{br} = 0.75 \\times 2.4 \\times ${FuPlate} = ${sn1(0.75*2.4*FuPlate)}\\text{ MPa}\\quad ${crit.fbr <= 0.75*2.4*FuPlate ? '\\checkmark':'\\times'}` },
            { tex: `f_v = \\frac{R_{\\max}}{A_b} = \\frac{${sn2(eccentric.Rmax)} \\times 1000}{${Ab2.toFixed(0)}} = ${sn1(crit.fv)}\\text{ MPa}\\quad \\phi F_{nv} = 0.75 \\times ${Fnv} = ${sn1(0.75*Fnv)}\\text{ MPa}\\quad ${crit.fv <= 0.75*Fnv ? '\\checkmark':'\\times'}` },
          ]
        })(),
      },
      ...(outOfPlane ? [{
        title: `Out-of-plane eccentricity §J3.7 — e_out = ${e_out} mm`,
        lines: [
          { tex: `M_{op} = V_u \\cdot e_{out} = ${Vu} \\times ${e_out} = ${outOfPlane.M_op.toFixed(0)}\\text{ kN·mm}` },
          { tex: `\\text{Neutral axis at bottom bolt. }\\sum y_i^2 = ${outOfPlane.sumYi2.toFixed(0)}\\text{ mm}^2` },
          { tex: `T_i = \\frac{M_{op} \\cdot y_i}{\\sum y_i^2}\\quad (y_i \\text{ measured from lowest bolt})` },
          { tex: `T_{\\max} = ${f2(outOfPlane.Tmax)}\\text{ kN on bolt }\\textit{${outOfPlane.critical}}` },
          { tex: `\\text{AISC Table J3.2: } F_{nt} = ${outOfPlane.Fnt}\\text{ MPa},\\; F_{nv} = ${outOfPlane.Fnv}\\text{ MPa}` },
          { tex: `\\phi F_{nt}' = \\min\\!\\left(1.3 F_{nt} - \\frac{F_{nt}}{\\phi F_{nv}} f_{rv},\\; F_{nt}\\right) \\geq 0\\quad \\S J3.7` },
          { tex: `\\phi T_n = \\phi F_{nt}' A_b / 1000 = ${f2(outOfPlane.phiTn_crit)}\\text{ kN/bolt}` },
          { tex: `\\text{Utilisation} = T_{\\max} / (\\phi T_n) = ${(outOfPlane.Tmax / outOfPlane.phiTn_crit * 100).toFixed(0)}\\%\\quad ${outOfPlane.ok ? '\\checkmark' : '\\times'}` },
        ],
      },
      ...(prying ? [{
        title: `Prying action §J3.9 — b = ${b_gage} mm`,
        lines: [
          { tex: `b' = b - d_b/2 = ${b_gage} - ${db}/2 = ${prying.b_prime.toFixed(1)}\\text{ mm}` },
          { tex: `a' = \\min(a,\\; 1.25b) = \\min(${ex_edge},\\; ${(1.25*b_gage).toFixed(1)}) = ${prying.a_prime.toFixed(1)}\\text{ mm}` },
          { tex: `\\rho = b'/a' = ${prying.rho.toFixed(3)},\\quad \\delta = 1 - d_h/p = 1 - ${db+2}/${sy} = ${prying.delta.toFixed(3)}` },
          { tex: `\\beta = \\frac{1}{\\rho}\\left(\\frac{\\phi B_n}{T_{\\max}} - 1\\right) = ${prying.beta.toFixed(3)},\\quad \\alpha = ${prying.alpha.toFixed(3)}` },
          { tex: `Q = \\alpha \\delta \\rho T_{\\max} = ${f2(prying.Q)}\\text{ kN}\\quad\\Rightarrow\\quad T_{\\text{total}} = ${f2(prying.T_total)}\\text{ kN}` },
          { tex: `t_{\\text{req}} = \\sqrt{\\frac{4 T b'}{\\phi_f F_y p (1+\\delta\\alpha)}} = ${prying.t_req.toFixed(1)}\\text{ mm}\\quad(\\text{plate }t=${tPlate}\\text{ mm}\\quad${tPlate>=prying.t_req?'\\checkmark':'\\times'})` },
          { tex: `t_0 = \\sqrt{\\frac{4\\phi B_n b'}{\\phi_f F_y p}} = ${prying.t_no_prying.toFixed(1)}\\text{ mm}\\quad(\\text{min for zero prying})` },
        ],
      }] : [])] : []),
      {
        title: 'Block shear §J4.3 (shear tab, single bolt line)',
        lines: blockShear.flatMap(c => [
          { text: c.label },
          { tex: `A_{gv} = ${c.Agv.toFixed(0)}\\text{ mm}^2\\quad A_{nv} = ${c.Anv.toFixed(0)}\\text{ mm}^2\\quad A_{nt} = ${c.Ant.toFixed(0)}\\text{ mm}^2` },
          { tex: `R_{n,\\text{fract}} = 0.6 F_u A_{nv} + U_{bs} F_u A_{nt} = ${sn1(c.Rn_fract)}\\text{ kN}` },
          { tex: `\\text{cap } = 0.6 F_y A_{gv} + U_{bs} F_u A_{nt} = ${sn1(c.Rn_cap)}\\text{ kN}` },
          { tex: `\\phi R_n = 0.75 \\times ${sn1(Math.min(c.Rn_fract,c.Rn_cap))} = ${sn1(c.phiRn)}\\text{ kN}\\quad ${Vu<=c.phiRn?'\\checkmark':'\\times'}` },
        ]),
      },
    ]
  }, [res, boltGrade, db, nRows, nCols, sy, ex_edge, tPlate, FuPlate, threads, Vu, Hu, ex_load, ey_load, e_out, b_gage])

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.9fr_1fr]">
      {/* ── inputs ── */}
      <div className="space-y-5">
        <Card title={<>Applied load<CalcBadge loading={loading} error={error} /></>}>
          <Num label="Applied Vu" unit="kN" value={Vu} onChange={setVu} />
          <Num label="Applied Hu (horizontal)" unit="kN" value={Hu} onChange={setHu} />
        </Card>
        <Card title="Bolt properties">
            <Pick label="Grade" value={boltGrade} onChange={v => setBoltGrade(v as BoltGrade)}
              options={[['A325M','A325M (F10T)'],['A490M','A490M (F13T)']]} />
            <Num label="Diameter db" unit="mm" value={db} onChange={setDb} />
            <Pick label="Threads in shear plane" value={threads} onChange={v => setThreads(v as 'yes'|'no')}
              options={[['yes','Yes (N)'],['no','No (X)']]} />
          </Card>
          <Card title="Bolt pattern">
            <Num label="Rows (vertical) nR" value={nRows} onChange={setNRows} />
            <Num label="Cols (horizontal) nC" value={nCols} onChange={setNCols} />
            <Num label="Vertical spacing sv" unit="mm" value={sy} onChange={setSy} />
            <Num label="Horizontal spacing sh" unit="mm" value={sx} onChange={setSx} />
            <Num label="Edge dist vertical ey" unit="mm" value={ey} onChange={setEy} />
            <Num label="Edge dist horiz ex" unit="mm" value={ex_edge} onChange={setExEdge} />
          </Card>
          <Card title="Eccentricity (load point from bolt centroid)">
            <Num label="In-plane e_x" unit="mm" value={ex_load} onChange={setExLoad} />
            <Num label="In-plane e_y" unit="mm" value={ey_load} onChange={setEyLoad} />
            <Num label="Out-of-plane e_out" unit="mm" value={e_out} onChange={setEOut} />
            <p className="col-span-full text-[10px] text-slate-500">
              e_x/e_y: in-plane offset (§J3.6 elastic method).
              e_out: perpendicular to plate → bolt tension + §J3.7 interaction.
            </p>
          </Card>
          {e_out > 0 && (
            <Card title="Prying action §J3.9">
              <Num label="Gage b (bolt CL → web face)" unit="mm" value={b_gage} onChange={setBGage} />
              <p className="col-span-full text-[10px] text-slate-500">
                b = distance from bolt centreline to face of the connecting web or stem.
                Set 0 to skip prying check. Edge dist a = ex, pitch p = sv, plate tf/Fy reused from above.
              </p>
            </Card>
          )}
          <Card title="Plate / connected part">
            <Num label="Plate thickness t" unit="mm" value={tPlate} onChange={setTPlate} />
            <Num label="Plate Fy" unit="MPa" value={FyPlate} onChange={setFyPlate} />
            <Num label="Plate Fu" unit="MPa" value={FuPlate} onChange={setFuPlate} />
        </Card>
      </div>

      {/* ── 2D drawing + 3D ── */}
      <div className="space-y-4">
        {res && (
          <ConnectionDrawing
            geom={res.geom} db={db}
            boltForces={res.eccentric.bolts}
            critical={res.eccentric.critical}
            Vu={Vu} Hu={Hu} ex_load={res.geom.Cx + ex_load} ey_load={res.geom.Cy + ey_load}
            connType="bolt"
          />
        )}
        {res && (
          <Suspense fallback={<Spinner />}>
            <ConnectionViewer3D geom={res.geom} db={db} t_plate={tPlate} critical={res.eccentric.critical} />
          </Suspense>
        )}
      </div>

      {/* ── results ── */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        {res && (<>
          <ResultCard title="Bolt capacity / bolt">
            <Row label="φRn shear" value={`${f2(res.phiRnBolt.phiRn_shear)} kN`} />
            <Row label="φRn bearing" value={`${f2(res.phiRnBolt.phiRn_bearing)} kN`} />
            <Row label="φRn governing" value={<b>{f2(res.phiRnBolt.phiRn)} kN</b>} />
          </ResultCard>
          <ResultCard title={`Eccentric group (${res.geom.n} bolts)`}>
            <Row label="Ip" value={`${res.geom.Ip.toFixed(0)} mm²`} />
            <Row label="In-plane M" value={`${res.eccentric.M.toFixed(0)} kN·mm`} />
            <Row label="Critical bolt" value={res.eccentric.critical} sub={`R = ${f2(res.eccentric.Rmax)} kN`} />
            <Row alert={res.eccentric.Rmax > res.phiRnBolt.phiRn}
              label="Rmax / φRn"
              value={<Verdict pass={res.eccentric.Rmax <= res.phiRnBolt.phiRn} value={`${(res.eccentric.Rmax/res.phiRnBolt.phiRn*100).toFixed(0)} %`} />} />
          </ResultCard>
          <ResultCard title="Per-bolt forces">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500">
                  <th className="pr-2 pb-1">id</th><th className="pr-2 pb-1">Vx kN</th><th className="pr-2 pb-1">Vy kN</th>
                  <th className="pr-2 pb-1">R kN</th><th className="pb-1">fbr MPa</th>
                </tr></thead>
                <tbody>
                  {res.eccentric.bolts.map(b => (
                    <tr key={b.id} className={b.id === res.eccentric.critical ? 'font-semibold text-amber-700' : ''}>
                      <td className="pr-2">{b.id}</td>
                      <td className="pr-2">{f2(b.Vx)}</td>
                      <td className="pr-2">{f2(b.Vy)}</td>
                      <td className="pr-2">{f2(b.R)}</td>
                      <td>{f1(b.fbr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ResultCard>
          <ResultCard title="Block shear §J4.3">
            {res.blockShear.map(c => (
              <Row key={c.label} alert={Vu > c.phiRn}
                label={<span className="text-[10px]">{c.label.replace('§J4.3 ', '')}</span>}
                value={<Verdict pass={Vu <= c.phiRn} value={`φRn = ${f1(c.phiRn)} kN`} />} />
            ))}
            {govBlockShear && (
              <Row alert={Vu > govBlockShear.phiRn}
                label="Governing block shear"
                value={<Verdict pass={Vu <= govBlockShear.phiRn} value={`${f1(govBlockShear.phiRn)} kN`} />} />
            )}
          </ResultCard>

          {res.outOfPlane && (
            <ResultCard title="Out-of-plane eccentricity §J3.7 (critical bolt)">
              <Row label="M_op = Vu·e_out" value={`${res.outOfPlane.M_op.toFixed(0)} kN·mm`} />
              <Row label="Σyi²" value={`${res.outOfPlane.sumYi2.toFixed(0)} mm²`} />
              <Row label="Critical bolt (max T)" value={res.outOfPlane.critical}
                sub={`T = ${f2(res.outOfPlane.Tmax)} kN`} />
              <Row label="φTn (reduced)" value={`${f2(res.outOfPlane.phiTn_crit)} kN`}
                sub={`φFnt' = ${res.outOfPlane.bolts.find(b=>b.id===res.outOfPlane!.critical)?.phiFnt_prime.toFixed(0)} MPa`} />
              <Row alert={!res.outOfPlane.ok}
                label="Combined check (§J3.7)"
                value={<Verdict pass={res.outOfPlane.ok} value={res.outOfPlane.ok ? 'PASS' : 'FAIL'} />} />
              <div className="col-span-full overflow-x-auto">
                <table className="mt-1 w-full text-xs">
                  <thead><tr className="text-left text-slate-500">
                    <th className="pr-2 pb-1">id</th><th className="pr-2 pb-1">yi mm</th>
                    <th className="pr-2 pb-1">T kN</th><th className="pr-2 pb-1">frv MPa</th><th className="pb-1">util</th>
                  </tr></thead>
                  <tbody>
                    {res.outOfPlane.bolts.map(b => (
                      <tr key={b.id} className={b.id === res.outOfPlane!.critical ? 'font-semibold text-amber-700' : ''}>
                        <td className="pr-2">{b.id}</td>
                        <td className="pr-2">{b.yi.toFixed(0)}</td>
                        <td className="pr-2">{f2(b.T)}</td>
                        <td className="pr-2">{f1(b.frv)}</td>
                        <td className={b.util > 1 ? 'text-red-600' : ''}>{(b.util*100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ResultCard>
          )}

          {res.prying && (
            <ResultCard title="Prying action §J3.9 (critical bolt)">
              <Row label="b' = b − db/2" value={`${res.prying.b_prime.toFixed(1)} mm`} />
              <Row label="a' = min(a, 1.25b)" value={`${res.prying.a_prime.toFixed(1)} mm`} />
              <Row label="ρ = b'/a'" value={f3(res.prying.rho)} />
              <Row label="δ = 1 − dh/p" value={f3(res.prying.delta)} />
              <Row label="β (prying potential)" value={f3(res.prying.beta)} />
              <Row label="α (prying fraction)" value={f3(res.prying.alpha)} sub="0 = none, 1 = full" />
              <Row label="Prying force Q" value={`${f2(res.prying.Q)} kN`} />
              <Row label="T_total = T + Q" value={`${f2(res.prying.T_total)} kN`} />
              <Row label="Required plate t" value={`${res.prying.t_req.toFixed(1)} mm`}
                sub={`t_no_prying = ${res.prying.t_no_prying.toFixed(1)} mm`} />
              <Row alert={!res.prying.ok}
                label="T_total ≤ φTn (§J3.9)"
                value={<Verdict pass={res.prying.ok} value={res.prying.ok ? 'PASS' : 'FAIL'} />} />
            </ResultCard>
          )}
        </>)}
      </div>
      </div>

      {/* Outside the grid on purpose: inside it, the sticky results rail's
          containing block covers this row and floats over the equations
          (see #560). */}
      {res && (
        <div>
          <WorkedSolution steps={boltSteps} title="Bolted Connection — step-by-step (AISC 360-16 §J3, §J4)" />
        </div>
      )}
    </div>
  )
}

export default function BoltedConnection() {
  return (
    <div>
      <PageHeader title="Bolted Connection" badges={['AISC 360-16 LRFD']} />
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <p className="no-print mt-1 text-slate-600">
          Eccentrically-loaded bolt group by the elastic method — φRn per bolt in shear and
          bearing (§J3.6 / §J3.10), block shear on the shear tab (§J4.3), out-of-plane tension
          with the §J3.7 interaction, and prying (§J3.9). 2D layout, 3D scene and a
          step-by-step solution.
        </p>
        <ReportControls title="Bolted Connection Report" />
        <div className="mt-5">
          <BoltedConnectionCalc />
        </div>
      </div>
    </div>
  )
}
