import { lazy, Suspense, useMemo, useState } from 'react'
// type-only imports — no engine code bundled into the browser from here
import { calcColumn } from '../lib/calcApi'
import type { ColumnCalcResult } from '../lib/calcApi'
import { useCalcResult } from '../lib/useCalcResult'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import type { SolutionStep } from '../lib/solution'
import { f1, f2 } from '../lib/format'
import { sn1, sn2, sn3 } from '../lib/solution'
import { ModelMemberResults } from '../components/ModelMemberResults'
import type { MemberLoadRequest } from '../lib/modelMemberResults'
import { ShapePick, CalcBadge, TrialWall, Spinner, BasisPick, BasisNote } from '../components/steelUi'
import { WShapeSection, SteelColumnElevation } from '../components/steelSketches'
import { capacityLabel, demandLabel, factorLabel, comboLabel, requiredFromDL, SAFETY, type DesignBasis } from '../engine/designBasis'
import { GRADES, shapeOrFirst, type Grade } from '../lib/steelShapes'

const ColumnViewer3D = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.ColumnViewer3D })))

export default function SteelColumn() {
  const [shapeName, setShapeName] = useState('W250x67')
  const [grade, setGrade]         = useState<Grade>('A572G50')
  const [L,     setL]             = useState(4)
  const [Kx,    setKx]            = useState(1.0)
  const [Ky,    setKy]            = useState(1.0)
  const [dlMode, setDlMode]       = useState<'DL'|'direct'>('DL')
  const [dead,  setDead]          = useState(800)
  const [live,  setLive]          = useState(500)
  const [PuDir, setPuDir]         = useState(1944)
  const [Mux,   setMux]           = useState(80)
  const [Muy,   setMuy]           = useState(0)

  const { Fy } = GRADES[grade]
  const shape  = useMemo(() => shapeOrFirst(shapeName), [shapeName])
  // Factor axial demand client-side (trivial arithmetic, not proprietary)
  const [basis, setBasis] = useState<DesignBasis>('LRFD')
  // The demand side of the dual format: factored under LRFD, the service sum
  // under ASD. A direct entry is taken as already being on the chosen basis.
  const Pu     = dlMode === 'DL' ? requiredFromDL(basis, dead, live) : PuDir

  const input = useMemo(
    () => ({ shapeName, Fy, L, Kx, Ky, Pu, Mux, Muy, basis }),
    [shapeName, Fy, L, Kx, Ky, Pu, Mux, Muy, basis]
  )
  const { data: res, loading, error, cause } = useCalcResult<ColumnCalcResult>(
    // No debounce: the steel calculators are cheap and the 250 ms default
    // just held the answer back a quarter of a second behind every
    // keystroke, with a "computing…" badge sitting where the number
    // should be. 0 still defers to a task, so a burst of synchronous
    // changes coalesces into one call.
    () => calcColumn(input), [input], 0,
  )

  const steps = useMemo((): SolutionStep[] => {
    if (!res) return []
    const { axial, flexX, comb } = res
    const E = 200000
    return [
      {
        title: 'Factored axial load',
        lines: dlMode === 'DL' ? [
          { text: `Load combination: ${comboLabel(res.basis)}.` },
          { tex: res.basis === 'LRFD'
              ? `P_u = \\max(1.4D,\\;1.2D+1.6L) = \\max(${sn1(1.4*dead)},\\;${sn1(1.2*dead+1.6*live)}) = ${sn1(Pu)}\\text{ kN}`
              : `P_a = D + L = ${sn1(dead)} + ${sn1(live)} = ${sn1(Pu)}\\text{ kN}` },
        ] : [{ tex: `P_u = ${sn1(Pu)}\\text{ kN (direct input)}` }],
      },
      {
        title: 'Slenderness and critical stress §E3',
        lines: [
          { tex: `KL/r_x = \\frac{${Kx}\\times${L*1000}}{${shape.rx}} = ${sn1(axial.slendernessX)}` },
          { tex: `KL/r_y = \\frac{${Ky}\\times${L*1000}}{${shape.ry}} = ${sn1(axial.slendernessY)}\\quad \\text{(governing = }${sn1(axial.slenderness)})` },
          { tex: `4.71\\sqrt{E/F_y} = 4.71\\sqrt{${E}/${Fy}} = ${sn1(4.71*Math.sqrt(E/Fy))}` },
          { tex: `F_{cr} = ${sn2(axial.Fcr)}\\text{ MPa}\\quad P_n = F_{cr} A_g = ${sn1(axial.Pn)}\\text{ kN}` },
          { tex: res.basis === 'LRFD'
              ? `\\phi_c P_n = ${SAFETY.compression.phi.toFixed(2)} \\times ${sn1(axial.Pn)} = ${sn1(res.avail.Pn)}\\text{ kN}`
              : `\\frac{P_n}{\\Omega_c} = \\frac{${sn1(axial.Pn)}}{${SAFETY.compression.omega.toFixed(2)}} = ${sn1(res.avail.Pn)}\\text{ kN}` },
        ],
        note: axial.slenderOK ? undefined : 'KL/r > 200 — slenderness exceeds §E2 advisory limit.',
      },
      {
        title: 'Flexural capacities',
        lines: [
          { tex: `${res.basis === 'LRFD' ? '\\phi M_{nx}' : 'M_{nx}/\\Omega_b'} = ${sn1(res.avail.Mnx)}\\text{ kN·m}\\quad (\\text{${flexX.ltbZone} zone, §F2})` },
          { tex: `${res.basis === 'LRFD' ? '\\phi M_{ny}' : 'M_{ny}/\\Omega_b'} = ${sn1(res.avail.Mny)}\\text{ kN·m}\\quad (\\text{§F6, weak-axis})` },
        ],
      },
      {
        title: `Combined loading §H1-1 (equation ${comb.equation})`,
        lines: comb.equation === 'H1-1a' ? [
          { tex: `P_u/\\phi P_n = ${sn3(Pu/res.avail.Pn)} \\geq 0.2 \\Rightarrow \\text{use §H1-1a}` },
          { tex: `\\frac{P_u}{\\phi P_n} + \\frac{8}{9}\\!\\left(\\frac{M_{ux}}{\\phi M_{nx}} + \\frac{M_{uy}}{\\phi M_{ny}}\\right) = ${sn3(Pu/res.avail.Pn)} + \\frac{8}{9}(${sn3(Mux/res.avail.Mnx)} + ${sn3(Muy > 0 ? Muy/res.avail.Mny : 0)}) = ${sn3(comb.ratio)}\\quad${comb.ok?'\\checkmark':'\\times'}` },
        ] : [
          { tex: `P_u/\\phi P_n = ${sn3(Pu/res.avail.Pn)} < 0.2 \\Rightarrow \\text{use §H1-1b}` },
          { tex: `\\frac{P_u}{2\\phi P_n} + \\left(\\frac{M_{ux}}{\\phi M_{nx}} + \\frac{M_{uy}}{\\phi M_{ny}}\\right) = ${sn3(comb.ratio)}\\quad${comb.ok?'\\checkmark':'\\times'}` },
        ],
      },
    ]
  }, [res, shape, Pu, Mux, Muy, Kx, Ky, L, Fy, dead, live, dlMode])

  /** Saved-model column → the page's own fields. Shape, length, effective
   *  length factors and the P/M demands all come straight from the schedule —
   *  direct-input mode, so the §E3/§H1-1 check is the schedule's own. */
  const loadSaved = (req: MemberLoadRequest) => {
    const c = req.design.steelColumns.find((x) => x.id === req.id)
    if (!c) return
    setShapeName(c.shape)
    const sec = req.section
    if (sec?.steelFy) setGrade(sec.steelFy >= 300 ? 'A572G50' : 'A36')
    setL(c.L); setKx(c.Kx); setKy(c.Ky)
    setDlMode('direct')
    setPuDir(c.Pu); setMux(c.Mu); setMuy(c.Muy)
  }

  const axialRatio = res && res.avail.Pn > 0 ? Pu / res.avail.Pn : undefined
  const report = res ? {
    docCode: 'S-SC',
    ok: res.comb.ok && res.axial.slenderOK,
    governing: `${shapeName} · §${res.comb.equation} interaction ${(res.comb.ratio * 100).toFixed(0)}% · KL/r ${f1(res.axial.slenderness)}`,
    stats: [
      { label: capacityLabel(res.basis, 'P'), value: f1(res.avail.Pn), unit: 'kN' },
      { label: capacityLabel(res.basis, 'M', 'x'), value: f1(res.avail.Mnx), unit: 'kN·m' },
      { label: 'Fcr', value: f1(res.axial.Fcr), unit: 'MPa' },
    ],
    checks: [
      { name: 'Slenderness KL/r ≤ 200', ratio: res.axial.slenderness / 200, ok: res.axial.slenderOK },
      { name: `Combined §${res.comb.equation}`, ratio: res.comb.ratio, ok: res.comb.ok },
    ],
    data: [
      ['Shape', shapeName], ['Grade', `${GRADES[grade].label} (Fy ${Fy} MPa)`], ['Design basis', res.basis],
      ['Height L', `${f2(L)} m`], ['Kx / Ky', `${f2(Kx)} / ${f2(Ky)}`],
      [demandLabel(res.basis, 'P'), `${f1(Pu)} kN${dlMode === 'DL' ? ` (D ${f1(dead)}, L ${f1(live)})` : ''}`],
      ['Mux / Muy', `${f1(Mux)} / ${f1(Muy)} kN·m`],
    ] as [string, string][],
    steps,
  } : undefined

  return (
    <WorkspacePage title="Steel Column" badges={['Steel', 'AISC 360-16 · NSCP 2015']}
      intro="A rolled W column under axial load and biaxial bending: §E3 flexural buckling about each axis, §F2 strong-axis and §F6 weak-axis flexure, and the §H1-1 interaction. LRFD or ASD."
      report={report}
      inputs={<>
        <div className="no-print"><ModelMemberResults kind="steelColumn" onLoad={loadSaved} /></div>
        <TrialWall cause={cause} />
        <InputGroup title="Section and grade">
          <ShapePick value={shapeName} onChange={setShapeName} />
          <BasisPick value={basis} onChange={setBasis} />
          <Pick label="Steel grade" value={grade} onChange={v => setGrade(v as Grade)}
            options={Object.entries(GRADES).map(([k, v]) => [k as Grade, v.label])} />
          <div className="col-span-2"><BasisNote basis={basis} /></div>
        </InputGroup>
        <InputGroup title="Column geometry">
          <Num label="Height L" unit="m" value={L} onChange={setL} />
          <Num label="Kx" value={Kx} onChange={setKx} />
          <Num label="Ky" value={Ky} onChange={setKy} />
        </InputGroup>
        <InputGroup title="Loads">
          <div className="col-span-2">
            <Pick label="Axial input" value={dlMode} onChange={v => setDlMode(v as 'DL'|'direct')}
              options={[['DL','Service D & L'],['direct', basis === 'LRFD' ? 'Factored Pu' : 'Service Pa']]} />
          </div>
          {dlMode === 'DL' ? <>
            <Num label="Dead D" unit="kN" value={dead} onChange={setDead} />
            <Num label="Live L" unit="kN" value={live} onChange={setLive} />
          </> : <Num label={demandLabel(basis, 'P')} unit="kN" value={PuDir} onChange={setPuDir} />}
          <Num label="Mux (strong axis)" unit="kN·m" value={Mux} onChange={setMux} />
          <Num label="Muy (weak axis)" unit="kN·m" value={Muy} onChange={setMuy} />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Axial §E3" basis={`KL/r ${f1(res.axial.slenderness)} · Fcr ${f1(res.axial.Fcr)} MPa`}
          status={res.axial.slenderOK ? (axialRatio != null && axialRatio <= 1 ? 'pass' : 'fail') : 'fail'}
          value={f1(res.avail.Pn)} unit="kN" ratio={axialRatio} ratioLabel={`${demandLabel(res.basis, 'P')} ÷ ${capacityLabel(res.basis, 'P')}`}
          pairs={[{ label: 'KL/rx', value: f1(res.axial.slendernessX) }, { label: 'KL/ry', value: f1(res.axial.slendernessY) }]} />
        <CheckCard title="Flexure" basis={`strong axis ${res.flexX.ltbZone}`} status="info"
          value={f1(res.avail.Mnx)} unit="kN·m"
          pairs={[{ label: capacityLabel(res.basis, 'M', 'y'), value: `${f1(res.avail.Mny)} kN·m` }, { label: 'Mux / Muy', value: `${f1(Mux)} / ${f1(Muy)}` }]} />
        <CheckCard title={`Combined §${res.comb.equation}`} basis="axial + biaxial bending" status={res.comb.ok ? 'pass' : 'fail'}
          value={`${(res.comb.ratio * 100).toFixed(0)} %`} ratio={res.comb.ratio} ratioLabel="Interaction" />
        <CalcBadge loading={loading} error={error} cause={cause} />
      </> : <CalcBadge loading={loading} error={error} cause={cause} />}
      summary={[
        { label: 'Section', value: `${shapeName}, ${GRADES[grade].label}` },
        { label: 'Length', value: `${f2(L)} m, Kx ${f2(Kx)}, Ky ${f2(Ky)}` },
        { label: 'Demand', value: `${demandLabel(basis, 'P')} ${f1(Pu)} kN, Mux ${f1(Mux)}, Muy ${f1(Muy)} kN·m` },
      ]}
      drawing={{ title: 'Elevation and section', node: <div data-pdf-drawing className="grid items-end gap-3 sm:grid-cols-2">
        <SteelColumnElevation L={L} Kx={Kx} Ky={Ky} P={Pu} Plabel={demandLabel(basis, 'P')} />
        {shape.d && shape.bf && shape.tf && shape.tw
          ? <WShapeSection name={shape.name} d={shape.d} bf={shape.bf} tf={shape.tf} tw={shape.tw} /> : null}
      </div> }}
      results={res ? [
        { check: 'Slenderness', basis: 'KL/rx · KL/ry, ≤ 200', demand: `${f1(res.axial.slendernessX)} · ${f1(res.axial.slendernessY)}`, limit: '200', ratio: res.axial.slenderness / 200, status: res.axial.slenderOK ? 'pass' as const : 'fail' as const },
        { check: 'Axial §E3', basis: `Pn ${f1(res.axial.Pn)} · ${factorLabel(res.basis, 'compression')}`, demand: `${f1(Pu)} kN`, limit: `${f1(res.avail.Pn)} kN`, ratio: axialRatio, status: axialRatio != null && axialRatio <= 1 ? 'pass' as const : 'fail' as const },
        { check: 'Strong-axis flexure', basis: `§F2 · ${res.flexX.ltbZone}`, demand: `${f1(Mux)} kN·m`, limit: `${f1(res.avail.Mnx)} kN·m`, ratio: res.avail.Mnx > 0 ? Mux / res.avail.Mnx : undefined, status: 'info' as const },
        { check: 'Weak-axis flexure', basis: '§F6', demand: `${f1(Muy)} kN·m`, limit: `${f1(res.avail.Mny)} kN·m`, ratio: res.avail.Mny > 0 ? Muy / res.avail.Mny : undefined, status: 'info' as const },
        { check: `Combined §${res.comb.equation}`, basis: 'H1-1a / H1-1b', demand: res.comb.ratio.toFixed(3), limit: '1.000', ratio: res.comb.ratio, status: res.comb.ok ? 'pass' as const : 'fail' as const },
      ] : []}
      extraSections={[{ title: '3D view', node: (
        <Suspense fallback={<Spinner />}>
          <ColumnViewer3D shape={shape} L={L} Pu={Pu} Mux={Mux} Muy={Muy} />
        </Suspense>
      ) }]}
      steps={steps}
      references={[
        { topic: 'Compression', basis: 'flexural buckling, Fcr', source: 'AISC 360-16 §E3 · NSCP 2015 §505' },
        { topic: 'Flexure', basis: 'strong axis §F2, weak axis §F6', source: 'AISC 360-16 §F2, §F6' },
        { topic: 'Combined forces', basis: 'doubly symmetric members', source: 'AISC 360-16 §H1.1' },
      ]}
    />
  )
}
