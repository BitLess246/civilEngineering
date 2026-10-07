import { useMemo, useState } from 'react'
// type-only imports — no engine code bundled into the browser from here
import type { BoltGrade, ElectrodeClass } from '../engine/steelDesign'
import { FEXX_BY_CLASS } from '../engine/steelDesign'
import { calcConnection } from '../lib/calcApi'
import type { ConnectionCalcResult } from '../lib/calcApi'
import { useCalcResult } from '../lib/useCalcResult'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard, ResultsTable, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { ShearTabMechanics } from '../components/ShearTabMechanics'
import { defaultBeamFor, defaultColumn } from '../lib/connectionMechanics'
import { W_SORTED, shapeByName } from '../engine/aiscSections'
import type { SolutionStep } from '../lib/solution'
import { f1, f2, f3 } from '../lib/format'
import { sn1, sn2 } from '../lib/solution'
import { CalcBadge, TrialWall, BasisPick, BasisNote } from '../components/steelUi'
import { capacityLabel, demandLabel, factorLabel, SAFETY, type DesignBasis } from '../engine/designBasis'


/** Every W in the catalogue, light to heavy — for the drawing's member picks. */
const W_OPTIONS: [string, string][] = W_SORTED.map((w) => [w.name, w.name])

export default function BoltedConnection() {
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
  const [nShear,     setNShear]     = useState<1 | 2>(1)
  const [basis,      setBasis]      = useState<DesignBasis>('LRFD')
  // Free-form pattern. `null` means "use the grid above"; the editor seeds
  // itself FROM the grid on the way in, so switching to custom starts from the
  // pattern already on screen rather than from an empty table.
  const [custom, setCustom] = useState<{ id: string; x: number; y: number }[] | null>(null)
  // The supported beam: its WEB is a ply the bolts bear on (§J3.10(a)), so it
  // is an input to the check, not decoration. 'auto' picks the lightest W
  // whose clear web takes the tab. The column is drawn (W250 class by default).
  const [beamName, setBeamName] = useState('auto')
  const [FuWeb, setFuWeb] = useState(450)
  const [colName, setColName] = useState('auto')
  // Tab-to-support fillets, one on each face of the tab (§J2.4).
  const [weldSize, setWeldSize] = useState(6)
  const [electrode, setElectrode] = useState<ElectrodeClass>('E70')

  const gridBolts = useMemo(() => {
    const out: { id: string; x: number; y: number }[] = []
    for (let r = 0; r < Math.max(1, nRows); r++)
      for (let c = 0; c < Math.max(1, nCols); c++)
        out.push({ id: `B${r * Math.max(1, nCols) + c + 1}`, x: ex_edge + c * sx, y: ey + r * sy })
    return out
  }, [nRows, nCols, sx, sy, ex_edge, ey])

  const setBolt = (i: number, k: 'x' | 'y', v: number) =>
    setCustom((bs) => (bs ?? []).map((b, j) => (j === i ? { ...b, [k]: v } : b)))
  const addBolt = () => setCustom((bs) => [...(bs ?? []), { id: `B${(bs ?? []).length + 1}`, x: ex_edge, y: ey }])
  const delBolt = (i: number) =>
    setCustom((bs) => (bs ?? []).filter((_, j) => j !== i).map((b, k) => ({ ...b, id: `B${k + 1}` })))

  // the tab height straight from the pattern, so the auto beam does not wait on the result
  const tabH = useMemo(() => {
    const ys = (custom && custom.length > 0 ? custom : gridBolts).map((b) => b.y)
    return Math.max(...ys) + ey
  }, [custom, gridBolts, ey])
  const beam = (beamName !== 'auto' && shapeByName(beamName)) || defaultBeamFor(tabH)!
  const column = (colName !== 'auto' && shapeByName(colName)) || defaultColumn()!
  const FEXX = FEXX_BY_CLASS[electrode]

  const input = useMemo(
    () => ({
      Vu, Hu,
      boltGrade, db, nRows, nCols, sy, sx, ey, ex_edge,
      threads: threads === 'yes',
      tPlate, FuPlate, FyPlate,
      twWeb: beam.tw ?? 0, FuWeb, weldSize, FEXX,
      ex_load, ey_load, e_out, b_gage,
      nShear, basis, ...(custom && custom.length > 0 ? { bolts: custom } : {}),
    }),
    [Vu, Hu, boltGrade, db, nRows, nCols, sy, sx, ey, ex_edge, threads,
     tPlate, FuPlate, FyPlate, beam, FuWeb, weldSize, FEXX, ex_load, ey_load, e_out, b_gage, nShear, basis, custom]
  )
  const { data: res, loading, error, cause } = useCalcResult<ConnectionCalcResult>(
    // No debounce: the connection solver is cheap and the 250 ms default just
    // held the answer back a quarter of a second behind every keystroke, with
    // a "computing…" badge sitting where the number should be — the same call
    // the beam and column pages already make. 0 still defers to a task, so a
    // burst of synchronous changes coalesces into one call.
    () => calcConnection(input), [input], 0,
  )

  // The governing path on the CHOSEN basis. Picking it off the LRFD `phiRn`
  // and then printing an ASD number beside it would name the wrong case
  // whenever the two orders differ.
  const govAvailBlockShear = res && res.availBlockShear.length
    ? Math.min(...res.availBlockShear)
    : null

  const boltSteps = useMemo((): SolutionStep[] => {
    if (!res) return []
    const { phiRnBolt, geom, eccentric, outOfPlane, prying, blockShear } = res
    const { Fnv, Ab, Rn_shear, Rn_bearing } = phiRnBolt
    const { basis, avail } = res
    const F = basis === 'LRFD' ? SAFETY.connection.phi : 1 / SAFETY.connection.omega
    const fTex = basis === 'LRFD' ? `\\phi` : `1/\\Omega`
    const { n, Ip } = geom
    const M = eccentric.M
    return [
      {
        title: `Bolt shear capacity §J3.6 — ${boltGrade}, d_b = ${db} mm`,
        lines: [
          { tex: `A_b = \\frac{\\pi}{4} d_b^2 = \\frac{\\pi}{4}(${db})^2 = ${Ab.toFixed(0)}\\text{ mm}^2` },
          { tex: `F_{nv} = ${Fnv}\\text{ MPa}\\quad (${threads==='yes'?'threads in shear plane, N':'threads excluded, X'})` },
          { tex: `R_{n,\\text{shear}} = F_{nv} A_b n_s = ${sn2(Rn_shear)}\\text{ kN/bolt}` },
          { tex: `${fTex} R_{n,\\text{shear}} = ${F.toFixed(3)} \\times ${sn2(Rn_shear)} = ${sn2(avail.shear)}\\text{ kN/bolt}\\quad(${basis})` },
        ],
      },
      {
        title: `Bearing and tear-out on the tab §J3.10(a) — t = ${tPlate} mm, F_u = ${FuPlate} MPa`,
        lines: [
          { text: 'Per bolt, in the direction it pushes the tab: lc is the clear distance from the hole edge to the free edge or the next hole (hole d + 2).' },
          { tex: `R_n = 1.2\\,l_c\\,t\\,F_u \\le 2.4\\,d_b\\,t\\,F_u = ${sn2(Rn_bearing)}\\text{ kN}` },
          ...res.bearing.map((b) => ({
            tex: Number.isFinite(b.lc)
              ? `${b.id}:\\; l_c = ${sn1(b.lc)},\\; 1.2 \\times ${sn1(b.lc)} \\times ${tPlate} \\times ${FuPlate} / 1000 = ${sn2(b.Rn_tear)} \\Rightarrow R_n = ${sn2(b.Rn)},\\; ${fTex}R_n = ${sn2(b.availBearing)}\\text{ kN}`
              : `${b.id}:\\; \\text{nothing in front of the bolt} \\Rightarrow R_n = 2.4 d_b t F_u = ${sn2(b.Rn)},\\; ${fTex}R_n = ${sn2(b.availBearing)}\\text{ kN}`,
          })),
          ...(res.webBearing ? [
            { text: `Beam web (${beam.name}, tw ${beam.tw} mm, Fu ${FuWeb} MPa), pushed UP by the bolts — it runs on into the flanges, so it tears only toward the next hole:` },
            ...res.webBearing.map((b) => ({
              tex: Number.isFinite(b.lc)
                ? `${b.id}:\\; l_c = ${sn1(b.lc)} \\Rightarrow R_n = \\min(${sn2(b.Rn_tear)},\\; ${sn2(b.Rn_bear)}) = ${sn2(b.Rn)},\\; ${fTex}R_n = ${sn2(b.availBearing)}\\text{ kN}`
                : `${b.id}:\\; R_n = 2.4 d_b t_w F_u = ${sn2(b.Rn)},\\; ${fTex}R_n = ${sn2(b.availBearing)}\\text{ kN}`,
            })),
          ] : []),
          { tex: `\\text{Each bolt: available} = \\min(\\text{shear } ${sn2(avail.shear)},\\;\\text{tab},\\;\\text{web})` },
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
          { text: 'Each bolt is checked against its OWN available strength — an edge bolt can govern by tear-out while carrying less than the most-loaded one.' },
          ...(() => {
            const g = res.bearing.find((b) => b.id === res.boltGoverning)
            const f = eccentric.bolts.find((b) => b.id === res.boltGoverning)
            return g && f ? [{ tex: `\\text{Governing } ${g.id}:\\; R = ${sn2(f.R)} / ${sn2(g.avail)} = ${sn2(res.boltUtil)}\\quad ${res.boltUtil <= 1 ? '\\checkmark' : '\\times'}` }] : []
          })(),
        ],
      },
      {
        title: 'Bearing stress and shear stress on critical bolt',
        lines: (() => {
          const crit = eccentric.bolts.find(b => b.id === eccentric.critical)
          if (!crit) return []
          const Ab2 = (Math.PI/4)*db*db
          return [
            { tex: `f_v = \\frac{R_{\\max}}{A_b} = \\frac{${sn2(eccentric.Rmax)} \\times 1000}{${Ab2.toFixed(0)}} = ${sn1(crit.fv)}\\text{ MPa}\\quad \\text{available } F_{nv} = ${F.toFixed(3)} \\times ${Fnv} = ${sn1(F*Fnv)}\\text{ MPa}\\quad ${crit.fv <= F*Fnv ? '\\checkmark':'\\times'}` },
          ]
        })(),
      },
      ...(res.weld ? [{
        title: `Tab welds §J2.4 — 2 × ${res.weld.w} mm fillets, ${electrode}XX (F_EXX ${res.weld.FEXX} MPa)`,
        lines: [
          { text: `Both fillets run the tab height at the support face, L = ${sn1(res.weld.L)} mm, and carry the bolt group's load where it acts — so V, H and the moment about the weld line (elastic weld-line method, as on Welded Connection). Two fillets on one line = twice the throat.` },
          { tex: `f_{\\max} = ${sn1(res.weld.fMax)}\\text{ N/mm}\\quad ${fTex}\\,0.60 F_{EXX}\\,(0.707 \\times 2 \\times ${res.weld.w}) = ${sn1(res.weld.availPerLen)}\\text{ N/mm}\\quad ${res.weld.util <= 1 ? '\\checkmark' : '\\times'}` },
          { tex: `w_{\\min} = ${res.weld.wMin}\\ (\\text{Table J2.4}) \\le w = ${res.weld.w} \\le w_{\\max} = t - 2 = ${res.weld.wMax}\\quad ${res.weld.sizeOk ? '\\checkmark' : '\\times'}` },
        ],
      }] : []),
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
        lines: blockShear.flatMap((c, k) => [
          { text: c.label },
          { tex: `A_{gv} = ${c.Agv.toFixed(0)}\\text{ mm}^2\\quad A_{nv} = ${c.Anv.toFixed(0)}\\text{ mm}^2\\quad A_{nt} = ${c.Ant.toFixed(0)}\\text{ mm}^2` },
          { tex: `R_{n,\\text{fract}} = 0.6 F_u A_{nv} + U_{bs} F_u A_{nt} = ${sn1(c.Rn_fract)}\\text{ kN}` },
          { tex: `\\text{cap } = 0.6 F_y A_{gv} + U_{bs} F_u A_{nt} = ${sn1(c.Rn_cap)}\\text{ kN}` },
          { tex: `${fTex} R_n = ${F.toFixed(3)} \\times ${sn1(Math.min(c.Rn_fract,c.Rn_cap))} = ${sn1(res.availBlockShear[k])}\\text{ kN}\\quad ${Vu<=res.availBlockShear[k]?'\\checkmark':'\\times'}` },
        ]),
      },
    ]
  }, [res, boltGrade, db, nRows, nCols, sy, ex_edge, tPlate, FuPlate, threads, Vu, Hu, ex_load, ey_load, e_out, b_gage, FuWeb, beam.name, beam.tw, electrode])

  // each bolt against its own §J3.6/§J3.10 strength — the worst ratio governs
  const availOf = (id: string) => res?.bearing.find((x) => x.id === id)?.avail ?? res?.avail.governing ?? 0
  const boltRatio = res ? res.boltUtil : undefined
  const boltOK = boltRatio != null && boltRatio <= 1
  const bsOK = govAvailBlockShear == null || Vu <= govAvailBlockShear
  const oop = res?.outOfPlane ?? null
  const pry = res?.prying ?? null
  const allOK = boltOK && bsOK && (oop ? oop.ok : true) && (pry ? pry.ok : true) && (res?.weld ? res.weld.ok : true)
  const R = res ? capacityLabel(res.basis, 'R') : ''
  const report = res ? {
    docCode: 'S-BC',
    ok: allOK,
    governing: `governing bolt ${res.boltGoverning}: R ${f2(res.eccentric.bolts.find((b) => b.id === res.boltGoverning)?.R ?? 0)} / ${R} ${f2(availOf(res.boltGoverning))} kN · ${res.geom.n} × ⌀${db} ${boltGrade}`,
    stats: [
      { label: `${R} per bolt`, value: f2(res.avail.governing), unit: 'kN' },
      { label: `Maximum ${demandLabel(res.basis, 'V')}`, value: f2(res.maxVu), unit: 'kN' },
      { label: 'In-plane M', value: res.eccentric.M.toFixed(0), unit: 'kN·mm' },
    ],
    checks: [
      { name: 'Each bolt R ≤ its own available §J3.6/§J3.10(a)', ratio: boltRatio ?? 0, ok: boltOK },
      ...(govAvailBlockShear != null ? [{ name: 'Block shear §J4.3', ratio: govAvailBlockShear > 0 ? Vu / govAvailBlockShear : 0, ok: bsOK }] : []),
      ...(oop ? [{ name: 'Tension–shear interaction §J3.7', ratio: oop.phiTn_crit > 0 ? oop.Tmax / oop.phiTn_crit : 0, ok: oop.ok }] : []),
      ...(pry ? [{ name: 'Prying §J3.9', ratio: null, ok: pry.ok }] : []),
    ],
    data: [
      ['Applied V / H', `${f2(Vu)} / ${f2(Hu)} kN (${basis})`],
      ['Bolts', `${boltGrade} ⌀${db}, threads ${threads === 'yes' ? 'included (N)' : 'excluded (X)'}, ${nShear === 2 ? 'double' : 'single'} shear`],
      ['Pattern', custom ? `free-form, ${custom.length} bolts` : `${nRows} × ${nCols}, sv ${sy}, sh ${sx}, edges ${ey} / ${ex_edge} mm`],
      ['Eccentricity ex / ey / e_out', `${ex_load} / ${ey_load} / ${e_out} mm`],
      ['Plate', `t ${tPlate} mm, Fy ${FyPlate}, Fu ${FuPlate} MPa`],
    ] as [string, string][],
    steps: boltSteps,
  } : undefined

  const boltForceRows: ResultRow[] = res ? res.eccentric.bolts.map((b) => ({
    check: b.id, basis: `Vx ${f2(b.Vx)} · Vy ${f2(b.Vy)} kN · fbr ${f1(b.fbr)} MPa`,
    demand: `${f2(b.R)} kN`, limit: `${f2(availOf(b.id))} kN`,
    ratio: availOf(b.id) > 0 ? b.R / availOf(b.id) : undefined,
    status: b.R > availOf(b.id) + 1e-9 ? 'fail' : b.id === res.boltGoverning ? 'pass' : 'info',
  })) : []
  const oopRows: ResultRow[] = oop ? oop.bolts.map((b) => ({
    check: b.id, basis: `yi ${b.yi.toFixed(0)} mm · frv ${f1(b.frv)} MPa`, demand: `T ${f2(b.T)} kN`,
    ratio: b.util, status: b.util > 1 ? 'fail' : b.id === oop.critical ? 'pass' : 'info',
  })) : []
  const cell = 'w-16 rounded border border-hairline bg-sheet px-1 py-0.5 text-right font-mono'

  return (
    <WorkspacePage title="Bolted Connection" badges={['Steel', 'AISC 360-16 §J3–J4 · NSCP 2015']}
      intro="An eccentrically loaded bolt group by the elastic method: available strength per bolt in shear and bearing (§J3.6, §J3.10), block shear on a shear tab (§J4.3), out-of-plane tension with the §J3.7 interaction, and prying (§J3.9). The load is entered directly, so it must match the basis — factored for LRFD, service for ASD."
      report={report}
      inputs={<>
        <TrialWall cause={cause} />
        <InputGroup title="Applied load">
          <BasisPick value={basis} onChange={setBasis} />
          <Num label={`${demandLabel(basis, 'V')} (vertical)`} unit="kN" value={Vu} onChange={setVu} />
          <Num label={`${demandLabel(basis, 'H')} (horizontal)`} unit="kN" value={Hu} onChange={setHu} />
          <div className="col-span-2"><BasisNote basis={basis} /></div>
        </InputGroup>
        <InputGroup title="Bolts" hint="§J3.6 counts bolt shear per plane, so double shear doubles it; bearing is a plate check and does not change.">
          <Pick label="Grade" value={boltGrade} onChange={v => setBoltGrade(v as BoltGrade)}
            options={[['A325M','A325M (F10T)'],['A490M','A490M (F13T)']]} />
          <Num label="Diameter db" unit="mm" value={db} onChange={setDb} />
          <Pick label="Threads in shear plane" value={threads} onChange={v => setThreads(v as 'yes'|'no')}
            options={[['yes','Yes (N)'],['no','No (X)']]} />
          <Pick label="Shear planes" value={String(nShear)} onChange={v => setNShear(Number(v) as 1 | 2)}
            options={[['1','Single shear'],['2','Double shear']]} />
        </InputGroup>
        <InputGroup title="Bolt pattern">
          <div className="col-span-2">
            <Pick label="Layout" value={custom ? 'custom' : 'grid'}
              onChange={v => setCustom(v === 'custom' ? gridBolts : null)}
              options={[['grid','Rectangular grid'],['custom','Free-form (any x, y)']]} />
          </div>
          {custom ? (
            <div className="col-span-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted"><tr className="text-left">
                    <th className="py-1 pr-2">Bolt</th><th className="pr-2">x</th><th className="pr-2">y</th>
                    <th className="pr-2 text-right">R (kN)</th><th />
                  </tr></thead>
                  <tbody>
                    {custom.map((b, i) => {
                      const force = res?.eccentric.bolts.find(f => f.id === b.id)
                      const crit = force && res && b.id === res.eccentric.critical
                      return (
                        <tr key={b.id} className={`border-t border-hairline-2 ${crit ? 'font-semibold text-warn' : ''}`}>
                          <td className="py-1 pr-2 font-medium">{b.id}</td>
                          {(['x','y'] as const).map(k => (
                            <td key={k} className="pr-2">
                              <input type="number" aria-label={`${b.id} ${k}`} value={b[k]} onChange={e => setBolt(i, k, Number(e.target.value))} className={cell} />
                            </td>
                          ))}
                          <td className="pr-2 text-right font-mono">{force ? f2(force.R) : '—'}</td>
                          <td className="text-right">
                            <button type="button" aria-label={`Remove ${b.id}`} onClick={() => delBolt(i)} disabled={custom.length <= 1}
                              className="text-muted hover:text-fail disabled:opacity-30">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addBolt}
                className="mt-2 rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">+ Add bolt</button>
              <p className="mt-1.5 text-[10px] text-muted">
                Coordinates in mm from the plate corner, seeded from the grid. Block shear is not
                reported for a free-form pattern — the shear-tab paths assume one vertical bolt line.
              </p>
            </div>
          ) : (<>
            <Num label="Rows nR" value={nRows} onChange={setNRows} />
            <Num label="Columns nC" value={nCols} onChange={setNCols} />
            <Num label="Vertical spacing sv" unit="mm" value={sy} onChange={setSy} />
            <Num label="Horizontal spacing sh" unit="mm" value={sx} onChange={setSx} />
            <Num label="Edge distance ey" unit="mm" value={ey} onChange={setEy} />
            <Num label="Edge distance ex" unit="mm" value={ex_edge} onChange={setExEdge} />
          </>)}
        </InputGroup>
        <InputGroup title="Eccentricity" hint="ex, ey: in-plane offset of the load from the bolt centroid. e_out: perpendicular to the plate — bolt tension and the §J3.7 interaction.">
          <Num label="In-plane ex" unit="mm" value={ex_load} onChange={setExLoad} />
          <Num label="In-plane ey" unit="mm" value={ey_load} onChange={setEyLoad} />
          <Num label="Out-of-plane e_out" unit="mm" value={e_out} onChange={setEOut} />
          {e_out > 0 && <Num label="Prying gage b" unit="mm" value={b_gage} onChange={setBGage} hint="bolt CL to web face; 0 skips prying" />}
        </InputGroup>
        <InputGroup title="Plate / connected part">
          <Num label="Thickness t" unit="mm" value={tPlate} onChange={setTPlate} />
          <Num label="Fy" unit="MPa" value={FyPlate} onChange={setFyPlate} />
          <Num label="Fu" unit="MPa" value={FuPlate} onChange={setFuPlate} />
        </InputGroup>
        <InputGroup title="Supported beam">
          <Pick label="Beam" value={beamName} onChange={setBeamName}
            options={[['auto', `Auto — ${defaultBeamFor(tabH)?.name ?? '—'}`], ...W_OPTIONS]} />
          <Num label={`Web Fu · tw ${beam.tw ?? '—'} mm`} unit="MPa" value={FuWeb} onChange={setFuWeb} />
          <Pick label="Supporting column" value={colName} onChange={setColName}
            options={[['auto', 'Auto — W250 class'], ...W_OPTIONS]} />
        </InputGroup>
        <InputGroup title="Tab welds">
          <Num label="Fillet leg w" unit="mm" value={weldSize} onChange={setWeldSize} />
          <Pick label="Electrode" value={electrode} onChange={(v) => setElectrode(v as ElectrodeClass)}
            options={(Object.keys(FEXX_BY_CLASS) as ElectrodeClass[]).map((k) => [k, `${k}XX (${FEXX_BY_CLASS[k]} MPa)`])} />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Governing bolt" basis={`${res.boltGoverning} · elastic method · own shear/bearing/tear-out · ${factorLabel(res.basis, 'connection')}`} status={boltOK ? 'pass' : 'fail'}
          value={f2(res.eccentric.bolts.find((b) => b.id === res.boltGoverning)?.R ?? res.eccentric.Rmax)} unit="kN" ratio={boltRatio} ratioLabel={`R ÷ ${R} (that bolt)`}
          pairs={[{ label: `${R} shear / bearing`, value: `${f2(res.avail.shear)} / ${f2(res.avail.bearing)} kN` }, { label: `Max ${demandLabel(res.basis, 'V')}`, value: `${f2(res.maxVu)} kN` }]} />
        <CheckCard title="Block shear §J4.3" basis="shear tab, one bolt line" status={govAvailBlockShear == null ? 'info' : bsOK ? 'pass' : 'fail'}
          pillLabel={govAvailBlockShear == null ? 'NOT RUN' : undefined}
          value={govAvailBlockShear == null ? '—' : f1(govAvailBlockShear)} unit={govAvailBlockShear == null ? '' : 'kN'}
          ratio={govAvailBlockShear ? Vu / govAvailBlockShear : undefined} ratioLabel={`${demandLabel(res.basis, 'V')} ÷ ${R}`} />
        {res.weld && <CheckCard title="Tab welds §J2.4" basis={`2 × ${res.weld.w} mm ${electrode}XX · V, H and V·a about the weld line`} status={res.weld.ok ? 'pass' : 'fail'}
          value={f1(res.weld.fMax)} unit="N/mm" ratio={res.weld.util} ratioLabel={`f ÷ ${R}`}
          pairs={[{ label: `${R} (2 fillets)`, value: `${f1(res.weld.availPerLen)} N/mm` }, { label: 'Size range §J2.2b', value: `${res.weld.wMin}–${res.weld.wMax} mm ${res.weld.sizeOk ? '✓' : '✗'}` }]} />}
        {oop && <CheckCard title="Out-of-plane §J3.7" basis={`critical ${oop.critical}`} status={oop.ok ? 'pass' : 'fail'}
          value={f2(oop.Tmax)} unit="kN" ratio={oop.phiTn_crit > 0 ? oop.Tmax / oop.phiTn_crit : undefined} ratioLabel="T ÷ reduced Tn"
          pairs={[{ label: 'M_op', value: `${oop.M_op.toFixed(0)} kN·mm` }, { label: 'Reduced Tn', value: `${f2(oop.phiTn_crit)} kN` }]} />}
        {pry && <CheckCard title="Prying §J3.9" basis={`α ${f3(pry.alpha)}`} status={pry.ok ? 'pass' : 'fail'}
          value={f2(pry.T_total)} unit="kN T + Q"
          pairs={[{ label: 'Q', value: `${f2(pry.Q)} kN` }, { label: 'Required t', value: `${pry.t_req.toFixed(1)} mm` }]} />}
        <CalcBadge loading={loading} error={error} cause={cause} />
      </> : <CalcBadge loading={loading} error={error} cause={cause} />}
      summary={[
        { label: 'Load', value: `${demandLabel(basis, 'V')} ${f2(Vu)}, ${demandLabel(basis, 'H')} ${f2(Hu)} kN (${basis})` },
        { label: 'Bolts', value: `${custom ? `${custom.length} free-form` : `${nRows} × ${nCols}`} ${boltGrade} ⌀${db}, ${nShear === 2 ? 'double' : 'single'} shear` },
        { label: 'Plate', value: `t ${tPlate} mm, Fu ${FuPlate} MPa` },
      ]}
      drawing={res ? { title: 'Connection — what each check checks', node: <div data-pdf-drawing>
        <ShearTabMechanics geom={res.geom} db={db} t={tPlate} Fu={FuPlate} nShear={nShear}
          forces={res.eccentric.bolts} critical={res.eccentric.critical}
          blockShear={res.blockShear} availBlockShear={res.availBlockShear}
          avail={res.avail} R={R} Vu={Vu} Hu={Hu} ex_load={ex_load} ey_load={ey_load}
          beam={beam} column={column} weld={res.weld} webBearing={res.webBearing}
          bearing={res.bearing} />
      </div> } : undefined}
      results={res ? [
        { check: 'Bolt shear', basis: `§J3.6 · ${nShear === 2 ? 'double' : 'single'} shear`, demand: `${f2(res.avail.shear)} kN`, status: 'info' as const },
        { check: 'Bearing / tear-out', basis: '§J3.10(a) · weakest bolt on tab or web, 1.2·lc·t·Fu ≤ 2.4·d·t·Fu', demand: `${f2(res.avail.bearing)} kN`, status: 'info' as const },
        ...(res.webBearing ? [{ check: 'Beam web bearing', basis: `§J3.10(a) · ${beam.name}, tw ${beam.tw} mm, Fu ${FuWeb} MPa`, demand: `${f2(Math.min(...res.webBearing.map((b) => b.availBearing)))} kN`, status: 'info' as const }] : []),
        ...(res.weld ? [
          { check: 'Tab welds', basis: `§J2.4 · 2 × ${res.weld.w} mm, ${f1(res.weld.L)} mm long, elastic weld-line`, demand: `${f1(res.weld.fMax)} N/mm`, limit: `${f1(res.weld.availPerLen)} N/mm`, ratio: res.weld.util, status: res.weld.util <= 1 ? 'pass' as const : 'fail' as const },
          { check: 'Weld size', basis: '§J2.2b · Table J2.4 min, t − 2 max along the tab edge', demand: `${res.weld.w} mm`, limit: `${res.weld.wMin}–${res.weld.wMax} mm`, status: res.weld.sizeOk ? 'pass' as const : 'fail' as const },
        ] : []),
        { check: 'Polar moment', basis: 'Ip = Σ(x² + y²)', demand: `${res.geom.Ip.toFixed(0)} mm²`, status: 'info' as const },
        { check: 'In-plane moment', basis: 'about the centroid', demand: `${res.eccentric.M.toFixed(0)} kN·mm`, status: 'info' as const },
        { check: 'Governing bolt', basis: `${res.boltGoverning} · most loaded ${res.eccentric.critical}, τmax ${f1(res.tauMax)} MPa`, demand: `${f2(res.eccentric.bolts.find((b) => b.id === res.boltGoverning)?.R ?? 0)} kN`, limit: `${f2(availOf(res.boltGoverning))} kN`, ratio: boltRatio, status: boltOK ? 'pass' as const : 'fail' as const },
        ...res.blockShear.map((c, k) => ({ check: 'Block shear', basis: c.label.replace('§J4.3 ', ''), demand: `${f2(Vu)} kN`, limit: `${f1(res.availBlockShear[k]!)} kN`, ratio: res.availBlockShear[k]! > 0 ? Vu / res.availBlockShear[k]! : undefined, status: Vu <= res.availBlockShear[k]! ? 'pass' as const : 'fail' as const })),
        ...(pry ? [
          { check: 'Prying geometry', basis: "b' · a' · ρ · δ · β", demand: `${pry.b_prime.toFixed(1)} · ${pry.a_prime.toFixed(1)} · ${f3(pry.rho)} · ${f3(pry.delta)} · ${f3(pry.beta)}`, status: 'info' as const },
          { check: 'Prying', basis: `α ${f3(pry.alpha)} · Q ${f2(pry.Q)} kN`, demand: `${f2(pry.T_total)} kN`, limit: `t req ${pry.t_req.toFixed(1)} mm`, status: pry.ok ? 'pass' as const : 'fail' as const },
        ] : []),
      ] : []}
      extraSections={res ? [
        { title: 'Per-bolt forces', node: <ResultsTable rows={boltForceRows} /> },
        ...(oop ? [{ title: 'Out-of-plane bolt tension §J3.7', node: <ResultsTable rows={oopRows} /> }] : []),
      ] : []}
      steps={boltSteps}
      references={[
        { topic: 'Bolt shear and bearing', basis: 'Fnv·Ab per plane; bearing at bolt holes', source: 'AISC 360-16 §J3.6, §J3.10 · NSCP 2015 §510.3' },
        { topic: 'Combined tension and shear', basis: 'reduced Fnt′', source: 'AISC 360-16 §J3.7' },
        { topic: 'Prying', basis: 'tee / angle flange bending', source: 'AISC 360-16 §J3.9 commentary; AISC Manual Part 9' },
        { topic: 'Block shear', basis: 'shear + tension rupture paths', source: 'AISC 360-16 §J4.3' },
        { topic: 'Eccentric bolt groups', basis: 'elastic method', source: 'AISC Manual Part 7' },
      ]}
    />
  )
}
