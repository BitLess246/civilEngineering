import { useState } from 'react'
import { solveWeldedConnection, weldedConnectionSolution, type WeldSegment } from '../engine/weldedConnection'
import { FEXX_BY_CLASS, type ElectrodeClass } from '../engine/steelDesign'
import { basisFactor, SAFETY, demandLabel, type DesignBasis } from '../engine/designBasis'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { WeldGroupPlan } from '../components/connectionSketches'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')

// Bracket plate: two vertical fillet lines 200 apart, 250 mm tall.
const DEFAULT_SEGS: WeldSegment[] = [
  { id: 'L', x1: 0, y1: 0, x2: 0, y2: 250 },
  { id: 'R', x1: 200, y1: 0, x2: 200, y2: 250 },
]

export default function WeldedConnection() {
  const [segs, setSegs] = useState<WeldSegment[]>(DEFAULT_SEGS)
  const [size, setSize] = useState(6)
  const [P, setP] = useState(120)
  const [angle, setAngle] = useState(90)
  const [px, setPx] = useState(400)
  const [py, setPy] = useState(125)
  // Electrode CLASS rather than a bare F_EXX number. The Steel Design page had
  // a weld tab whose only advantage over this page was that it named the
  // electrode instead of asking for a stress; that tab is gone, so the naming
  // moves here. 'custom' keeps the raw entry for a filler not in the table.
  const [electrode, setElectrode] = useState<ElectrodeClass | 'custom'>('E70')
  const [FEXX, setFEXX] = useState(FEXX_BY_CLASS.E70)
  // The raw phi box is gone: 0.75 is the LRFD resistance factor for §J2, and
  // typing 0.5 into it was the only way to get an ASD answer — with nothing on
  // the sheet saying which basis the number belonged to. The basis is now the
  // control, and it sets the factor (phi = 0.75, or 1/Omega = 1/2.00).
  const [basis, setBasis] = useState<DesignBasis>('LRFD')
  const phi = basisFactor(basis, 'connection')

  const r = solveWeldedConnection({ segments: segs, size, FEXX, phi, load: { P, angleDeg: angle, px, py } })

  const setSeg = (i: number, k: keyof Omit<WeldSegment, 'id'>, v: number) =>
    setSegs((ss) => ss.map((s, j) => (j === i ? { ...s, [k]: v } : s)))
  const addSeg = () => setSegs((ss) => [...ss, { id: `W${ss.length + 1}`, x1: 0, y1: 0, x2: 100, y2: 0 }])
  const delSeg = (i: number) => setSegs((ss) => ss.filter((_, j) => j !== i).map((s, k) => ({ ...s, id: `W${k + 1}` })))

  const steps = weldedConnectionSolution({ segments: segs, size, FEXX, phi, load: { P, angleDeg: angle, px, py } }, r)
  const ratio = r.capacityPerLen > 0 ? r.fMax / r.capacityPerLen : undefined
  const report = {
    docCode: 'S-WC',
    ok: r.ok,
    governing: `f_max ${f2(r.fMax)} / ${f2(r.capacityPerLen)} N/mm (${basis}) · ${segs.length} segments, ${f2(r.Lw)} mm of weld`,
    stats: [
      { label: `Maximum ${demandLabel(basis, 'P')}`, value: f2(r.maxP), unit: 'kN' },
      { label: 'Required leg', value: f2(r.reqSize), unit: 'mm' },
      { label: 'Torsion T', value: f2(r.T / 1000), unit: 'kN·m' },
    ],
    checks: [{ name: 'Peak force per length f_max ≤ available', ratio: ratio ?? 0, ok: r.ok }],
    data: [
      ['Segments', segs.map((s) => `${s.id} (${s.x1},${s.y1})→(${s.x2},${s.y2})`).join('; ')],
      ['Fillet leg w', `${size} mm`], ['Electrode', electrode === 'custom' ? `F_EXX ${FEXX} MPa` : `${electrode}XX (${FEXX} MPa)`],
      ['Design basis', basis], [`Load ${demandLabel(basis, 'P')}`, `${f2(P)} kN at ${f2(angle)}°`], ['Load point', `(${px}, ${py}) mm`],
    ] as [string, string][],
    steps,
  }
  const cell = 'w-14 rounded border border-hairline bg-sheet px-1 py-0.5 text-right font-mono'
  return (
    <WorkspacePage title="Eccentric Weld Group" badges={['Steel', 'AISC 360-16 §J2 · NSCP 2015']}
      intro="Elastic (weld-as-a-line) method for an eccentrically loaded fillet weld group. Each unit length carries the direct share P/Lw plus a torsional share T·ρ/(J/t), with T = Py·ex − Px·ey about the group centroid. The throat is 0.707w, so the available strength per length is φ·0.60·F_EXX·0.707w (LRFD) or the same over Ω (ASD), and the load must be on the same basis."
      report={report}
      inputs={<>
        <InputGroup title="Weld segments (mm)">
          <div className="col-span-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted"><tr className="text-left"><th className="py-1 pr-2">Weld</th><th className="pr-2">x₁</th><th className="pr-2">y₁</th><th className="pr-2">x₂</th><th className="pr-2">y₂</th><th className="pr-2 text-right">L</th><th /></tr></thead>
              <tbody>
                {segs.map((s, i) => (
                  <tr key={s.id} className="border-t border-hairline-2">
                    <td className="py-1 pr-2 font-medium">{s.id}</td>
                    {(['x1', 'y1', 'x2', 'y2'] as const).map((k) => (
                      <td key={k} className="pr-2"><input type="number" aria-label={`${s.id} ${k}`} value={s[k]} onChange={(e) => setSeg(i, k, num(e.target.value))} className={cell} /></td>
                    ))}
                    <td className="pr-2 text-right font-mono">{f2(Math.hypot(s.x2 - s.x1, s.y2 - s.y1))}</td>
                    <td className="text-right"><button type="button" aria-label={`Remove ${s.id}`} onClick={() => delSeg(i)} className="text-muted hover:text-fail">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={addSeg} className="mt-2 rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">+ Add segment</button>
          </div>
        </InputGroup>
        <InputGroup title="Weld">
          <Pick label="Design basis" value={basis} onChange={(v) => setBasis(v as DesignBasis)}
            options={[['LRFD', `LRFD — φ ${SAFETY.connection.phi.toFixed(2)}`], ['ASD', `ASD — Ω ${SAFETY.connection.omega.toFixed(2)}`]]} />
          <Pick label="Electrode" value={electrode}
            onChange={(v) => { const k = v as ElectrodeClass | 'custom'; setElectrode(k); if (k !== 'custom') setFEXX(FEXX_BY_CLASS[k]) }}
            options={[...(Object.keys(FEXX_BY_CLASS) as ElectrodeClass[]).map((k) => [k, `${k}XX (${FEXX_BY_CLASS[k]} MPa)`] as [ElectrodeClass | 'custom', string]), ['custom', 'Custom F_EXX…']]} />
          <Num label="Fillet leg w" unit="mm" value={size} onChange={setSize} />
          {electrode === 'custom' && <Num label="F_EXX" unit="MPa" value={FEXX} onChange={setFEXX} />}
        </InputGroup>
        <InputGroup title="Load">
          <Num label={`Load ${demandLabel(basis, 'P')}`} unit="kN" value={P} onChange={setP} />
          <Num label="Angle from +x" unit="°" value={angle} onChange={setAngle} />
          <Num label="Load at x" unit="mm" value={px} onChange={setPx} />
          <Num label="Load at y" unit="mm" value={py} onChange={setPy} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Weld stress" basis={`${basis} · §J2.4`} status={r.ok ? 'pass' : 'fail'}
          value={f2(r.fMax)} unit="N/mm" ratio={ratio} ratioLabel="f_max ÷ available"
          pairs={[{ label: 'Available', value: `${f2(r.capacityPerLen)} N/mm` }, { label: 'Required w', value: `${f2(r.reqSize)} mm` }]} />
        <CheckCard title="Capacity" basis="largest load at this geometry" status="info"
          value={f2(r.maxP)} unit="kN"
          pairs={[{ label: 'Torsion T', value: `${f2(r.T / 1000)} kN·m` }, { label: 'Lw', value: `${f2(r.Lw)} mm` }]} />
      </>}
      summary={[
        { label: 'Weld', value: `${segs.length} segments, ${f2(r.Lw)} mm, ${size} mm fillet, ${electrode === 'custom' ? `F_EXX ${FEXX}` : `${electrode}XX`}` },
        { label: 'Load', value: `${demandLabel(basis, 'P')} ${f2(P)} kN at ${f2(angle)}°, applied at (${px}, ${py})` },
      ]}
      drawing={{ title: 'Weld group', node: <div data-pdf-drawing>
        <WeldGroupPlan segs={segs} r={r} px={px} py={py} P={P} angleDeg={angle} Plabel={demandLabel(basis, 'P')} />
      </div> }}
      results={[
        { check: 'Weld length and centroid', basis: 'Σ L, Σ L·x / Lw', demand: `${f2(r.Lw)} mm`, limit: `C (${f2(r.Cx)}, ${f2(r.Cy)})`, status: 'info' as const },
        { check: 'Load components', basis: 'Px / Py', demand: `${f2(r.Px)} / ${f2(r.Py)} kN`, status: 'info' as const },
        { check: 'Eccentricity', basis: 'ex / ey from C', demand: `${f2(r.ex)} / ${f2(r.ey)} mm`, status: 'info' as const },
        { check: 'Torsion', basis: 'T = Py·ex − Px·ey', demand: `${f2(r.T / 1000)} kN·m`, status: 'info' as const },
        { check: 'Polar inertia', basis: 'J/t = Σ[L³/12 + Lρ²]', demand: `${f2(r.Jt / 1e6)} ×10⁶ mm³`, status: 'info' as const },
        { check: 'Effective throat', basis: '0.707w', demand: `${f2(r.throat)} mm`, status: 'info' as const },
        { check: 'Peak force per length', basis: `${basis}, φ·0.60·F_EXX·throat`, demand: `${f2(r.fMax)} N/mm`, limit: `${f2(r.capacityPerLen)} N/mm`, ratio, status: r.ok ? 'pass' as const : 'fail' as const },
        { check: 'Required fillet leg', basis: 'at f_max', demand: `${f2(r.reqSize)} mm`, limit: `${size} mm`, status: r.reqSize <= size ? 'pass' as const : 'fail' as const },
      ]}
      steps={steps}
      references={[
        { topic: 'Fillet weld strength', basis: '0.60F_EXX on the effective throat', source: 'AISC 360-16 §J2.4, Table J2.5 · NSCP 2015 §510.2' },
        { topic: 'Eccentric weld groups', basis: 'elastic (weld-as-a-line) method', source: 'Salmon & Johnson, Steel Structures; AISC Manual Part 8' },
      ]}
    />
  )
}
