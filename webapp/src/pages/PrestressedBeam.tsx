import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { designPrestressed } from '../engine/prestressedBeam'
import { buildPrestressedSolution } from '../lib/prestressedSolution'
import { PageHeader, VerdictPanel, DrawingCard, LetterheadCard, PrintReport, type LetterheadState } from '../components/calc'
import { Num, Pick, Card } from '../components/qty'
import { WorkedSolution } from '../components/WorkedSolution'
import { DimBelow, DimSide } from '../components/dims'

const f1 = (v: number) => v.toFixed(1)

/** Elevation to scale-ish: beam on pin + roller supports, UDL arrows landing
 *  on the top edge, straight eccentric tendon, template dimension lines. */
function PSElevation({ h, e, span }: { h: number; e: number; span: number }) {
  const W = 340, HT = 220
  const x0 = 46, bw = 248
  const y0 = 74, H = 56
  const yc = y0 + H / 2, yTendon = Math.min(y0 + H - 5, yc + (e / h) * H)
  const arrows = [0.08, 0.26, 0.44, 0.62, 0.8, 0.96].map((f) => x0 + f * bw)
  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block w-full max-w-[380px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* UDL: top line + arrows touching the beam's top edge */}
      <line x1={x0} y1={y0 - 26} x2={x0 + bw} y2={y0 - 26} stroke="#5c6675" strokeWidth="1.4" />
      {arrows.map((x) => (
        <g key={x} stroke="#5c6675" strokeWidth="1.4">
          <line x1={x} y1={y0 - 26} x2={x} y2={y0 - 5} />
          <path d={`M${x - 3.2} ${y0 - 6.5} L${x} ${y0 - 0.5} L${x + 3.2} ${y0 - 6.5} z`} fill="#5c6675" stroke="none" />
        </g>
      ))}
      <text x={x0 + bw / 2} y={y0 - 32} fontSize="8.5" fill="#5c6675" textAnchor="middle">w (D + L)</text>
      {/* beam */}
      <rect x={x0} y={y0} width={bw} height={H} fill="#eef3f8" stroke="#37526e" strokeWidth="1.6" />
      <line x1={x0} y1={yc} x2={x0 + bw} y2={yc} stroke="#a39d8d" strokeWidth="0.8" strokeDasharray="3 4" />
      <line x1={x0} y1={yTendon} x2={x0 + bw} y2={yTendon} stroke="#0f4c92" strokeWidth="2.2" strokeDasharray="8 4" />
      <text x={x0 + bw / 2} y={y0 + H + 12} fontSize="8.5" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92" textAnchor="middle">
        Aps · e = {e} mm below cg
      </text>
      {/* supports ON the soffit: pin (triangle apex at the beam) + roller */}
      <g stroke="#37526e" strokeWidth="1.4" fill="#fff">
        <path d={`M${x0 + 10} ${y0 + H} L${x0 + 1} ${y0 + H + 15} L${x0 + 19} ${y0 + H + 15} z`} />
        <line x1={x0 - 5} y1={y0 + H + 15} x2={x0 + 25} y2={y0 + H + 15} />
        <circle cx={x0 + bw - 10} cy={y0 + H + 7.5} r={7} />
        <line x1={x0 + bw - 25} y1={y0 + H + 15} x2={x0 + bw + 5} y2={y0 + H + 15} />
      </g>
      {/* dimensions (shared template) */}
      <DimBelow xA={x0} xB={x0 + bw} featY={y0 + H + 18} dY={y0 + H + 40} label={`L = ${span} m`} />
      <DimSide yA={y0} yB={y0 + H} featX={x0 + bw} dX={x0 + bw + 20} label={`h = ${h} mm`} side="right" />
      <DimSide yA={yc} yB={yTendon} featX={x0} dX={x0 - 18} label={`e`} side="left" />
    </svg>
  )
}

export default function PrestressedBeam() {
  const [b, setB] = useState(400); const [h, setH] = useState(800)
  const [span, setSpan] = useState(12)
  const [fc, setFc] = useState(40); const [fci, setFci] = useState(32)
  const [Aps, setAps] = useState(987); const [fpu, setFpu] = useState(1860)
  const [e, setE] = useState(250); const [fpjPct, setFpjPct] = useState(74)
  const [wSDL, setWSDL] = useState(6); const [wLL, setWLL] = useState(12)
  const [RH, setRH] = useState(75)
  const [klass, setKlass] = useState<'U' | 'T'>('U')
  const [lh, setLh] = useState<LetterheadState>({ project: '', sheet: '', preparedBy: '' })

  const inp = useMemo(() => ({
    b, h, span, fc, fci, Aps, fpu, e, fpj: (fpjPct / 100) * fpu, wSDL, wLL, RH, klass,
  }), [b, h, span, fc, fci, Aps, fpu, e, fpjPct, wSDL, wLL, RH, klass])
  const r = useMemo(() => { try { return designPrestressed(inp) } catch { return null } }, [inp])
  const steps = useMemo(() => (r ? buildPrestressedSolution(inp, r) : []), [inp, r])
  const badges = ['ACI 318-14', 'PCI', 'NSCP 2015']

  return (
    <div className="min-h-screen">
      <PageHeader title="Prestressed Beam" badges={[...badges, `class ${klass}`]} />
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <p className="no-print text-[13px] text-[#5c6675]">
          <Link to="/" className="font-semibold text-[#0f4c92]">← Home</Link> · Pretensioned bonded beam: PCI losses
          (ES/CR/SH/RE), §24.5 transfer & service stress limits, fps per §20.3.2.3.1, φMn ≥ 1.2Mcr, Vci/Vcw, camber.
        </p>
        <div className="no-print mt-4 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(330px,1fr)]">
          <div className="space-y-4">
            <Card title="Section & span">
              <Num label="Width b" unit="mm" value={b} onChange={setB} />
              <Num label="Depth h" unit="mm" value={h} onChange={setH} />
              <Num label="Simple span L" unit="m" value={span} onChange={setSpan} />
              <Num label="f'c (28-day)" unit="MPa" value={fc} onChange={setFc} />
              <Num label="f'ci (transfer)" unit="MPa" value={fci} onChange={setFci} />
            </Card>
            <Card title="Tendons" hint="pretensioned · bonded">
              <Num label="Aps" unit="mm²" value={Aps} onChange={setAps} />
              <Num label="fpu" unit="MPa" value={fpu} onChange={setFpu} />
              <Num label="Eccentricity e" unit="mm" value={e} onChange={setE} />
              <Num label="Jacking (% fpu)" unit="%" value={fpjPct} onChange={setFpjPct} />
              <Num label="Ambient RH" unit="%" value={RH} onChange={setRH} />
              <Pick label="Class (§24.5.2)" value={klass} onChange={(v) => setKlass(v as 'U' | 'T')}
                options={[['U', 'U — uncracked'], ['T', 'T — transition']]} />
            </Card>
            <Card title="Loads" hint="unfactored, self-weight auto">
              <Num label="Superimposed DL" unit="kN/m" value={wSDL} onChange={setWSDL} />
              <Num label="Live load" unit="kN/m" value={wLL} onChange={setWLL} />
            </Card>
          </div>
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {r && (
              <VerdictPanel ok={r.ok} headline={r.ok ? 'DESIGN OK' : 'CHECK FAILED'}
                governing={`losses ${r.lossPct.toFixed(1)}% · fse ${f1(r.fse)} MPa · ${r.shearNote}`}
                stats={[
                  { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
                  { label: 'Pe', value: f1(r.Pe), unit: 'kN' },
                  { label: 'Net Δ', value: f1(r.deltaNet), unit: 'mm' },
                ]}
                checks={[
                  { name: 'Strength Mu/φMn', ratio: r.phiMn > 0 ? r.Mu / r.phiMn : 99 },
                  { name: 'Service σ,bot / limit', ratio: Number.isFinite(r.limServiceT) ? Math.max(0, -r.service.bot) / r.limServiceT : 0 },
                  { name: 'Transfer σ,bot / 0.60f\'ci', ratio: r.transfer.bot / r.limTransferC },
                  { name: '1.2Mcr / φMn', ratio: r.phiMn > 0 ? (1.2 * r.Mcr) / r.phiMn : 99 },
                ]} />
            )}
            {r && (
              <DrawingCard title="Elevation & tendon profile" meta={`${b}×${h} · L = ${span} m`}>
                <PSElevation h={h} e={e} span={span} />
              </DrawingCard>
            )}
            <LetterheadCard lh={lh} onChange={(p) => setLh((s) => ({ ...s, ...p }))} />
          </div>
        </div>
        {r && (
          <div className="no-print mt-5">
            <WorkedSolution steps={steps} title="Prestressed beam — worked solution" />
          </div>
        )}
      </div>
      {r && (
        <PrintReport docTitle="Prestressed Beam" docCode="PS-01" badges={badges} ok={r.ok}
          governing={`losses ${r.lossPct.toFixed(1)}% · utilization ${(r.Mu / Math.max(r.phiMn, 1e-9)).toFixed(2)}`}
          lh={lh}
          stats={[
            { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
            { label: 'fse', value: f1(r.fse), unit: 'MPa' },
            { label: 'Pe', value: f1(r.Pe), unit: 'kN' },
          ]}
          checks={[
            { name: 'Transfer stresses §24.5.3', ratio: r.transfer.bot / r.limTransferC, ok: r.transferOK },
            { name: 'Service stresses §24.5.4', ratio: Number.isFinite(r.limServiceT) ? Math.max(0, -r.service.bot) / r.limServiceT : 0, ok: r.serviceOK },
            { name: 'Strength Mu/φMn', ratio: r.Mu / Math.max(r.phiMn, 1e-9), ok: r.strengthOK },
            { name: 'φMn ≥ 1.2Mcr', ratio: (1.2 * r.Mcr) / Math.max(r.phiMn, 1e-9), ok: r.crackingOK },
          ]}
          data={[
            ['Section', `${b} × ${h} mm`], ['Span', `${span} m`], ["f'c / f'ci", `${fc} / ${fci} MPa`],
            ['Tendons', `Aps ${Aps} mm² · fpu ${fpu} · e ${e} mm`], ['Loads', `SDL ${wSDL} · LL ${wLL} kN/m`],
            ['Losses', `${r.lossPct.toFixed(1)} % → fse ${f1(r.fse)} MPa`],
          ]}
          steps={steps}
          drawing={<PSElevation h={h} e={e} span={span} />}
          drawingTitle="Prestressed beam" />
      )}
    </div>
  )
}
