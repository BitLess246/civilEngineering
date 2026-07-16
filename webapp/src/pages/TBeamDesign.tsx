import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { designTBeam, type TBeamKind } from '../engine/tbeam'
import { buildTBeamSolution } from '../lib/tbeamSolution'
import { PageHeader, VerdictPanel, DrawingCard, LetterheadCard, PrintReport, type LetterheadState } from '../components/calc'
import { Num, Pick, Card } from '../components/qty'
import { WorkedSolution } from '../components/WorkedSolution'

const f0 = (v: number) => v.toFixed(0)
const f1 = (v: number) => v.toFixed(1)

/** T-section sketch with the stress block depth. */
function TSection({ bf, bw, h, hf, a }: { bf: number; bw: number; h: number; hf: number; a: number }) {
  const S = 260 / Math.max(bf, h)
  const W = bf * S, H = h * S, WF = bw * S, HF = hf * S, A = Math.min(a, h) * S
  const x0 = (300 - W) / 2
  return (
    <svg viewBox="0 0 300 300" className="mx-auto block w-full max-w-[340px]">
      <path d={`M${x0} 20 h${W} v${HF} h${-(W - WF) / 2} v${H - HF} h${-WF} v${-(H - HF)} h${-(W - WF) / 2} z`}
        fill="#fff" stroke="#0f1b2a" strokeWidth="2" />
      <rect x={x0} y={20} width={W} height={Math.min(A, HF)} fill="#0f4c92" opacity="0.18" />
      {A > HF && <rect x={x0 + (W - WF) / 2} y={20 + HF} width={WF} height={A - HF} fill="#0f4c92" opacity="0.18" />}
      <line x1={x0 - 8} y1={20 + A} x2={x0 + W + 8} y2={20 + A} stroke="#0f4c92" strokeWidth="1.5" strokeDasharray="5 3" />
      <text x={x0 + W + 10} y={24 + A} fontSize="10" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92">a = {f1(a)}</text>
      <text x="150" y={14} fontSize="10" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92">bf</text>
      <text x="150" y={20 + H + 14} fontSize="10" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92">bw</text>
    </svg>
  )
}

export default function TBeamDesign() {
  const [kind, setKind] = useState<TBeamKind>('interior')
  const [bw, setBw] = useState(300); const [h, setH] = useState(600); const [hf, setHf] = useState(100)
  const [bfGiven, setBfGiven] = useState(0)
  const [ln, setLn] = useState(6); const [sw, setSw] = useState(2.7)
  const [cover, setCover] = useState(40); const [stirrupDia, setStirrupDia] = useState(10); const [barDia, setBarDia] = useState(25)
  const [fc, setFc] = useState(21); const [fy, setFy] = useState(415)
  const [Mu, setMu] = useState(400)
  const [lh, setLh] = useState<LetterheadState>({ project: '', sheet: '', preparedBy: '' })

  const inp = useMemo(() => ({
    kind, bw, h, hf, bfGiven: bfGiven > 0 ? bfGiven : undefined, ln, sw,
    cover, stirrupDia, barDia, fc, fy, Mu,
  }), [kind, bw, h, hf, bfGiven, ln, sw, cover, stirrupDia, barDia, fc, fy, Mu])
  const r = useMemo(() => { try { return designTBeam(inp) } catch { return null } }, [inp])
  const steps = useMemo(() => (r ? buildTBeamSolution(inp, r) : []), [inp, r])
  const badges = ['ACI 318-14', 'NSCP 2015']

  return (
    <div className="min-h-screen">
      <PageHeader title="T-Beam Design" badges={[...badges, kind]} />
      <div className="mx-auto max-w-6xl px-5 py-5 sm:px-7">
        <p className="no-print text-[13px] text-[#5c6675]">
          <Link to="/" className="font-semibold text-[#0f4c92]">← Home</Link> · Flanged-beam flexure: §6.3.2 effective width,
          rectangular vs true-T stress block, §9.6.1.2 minimum steel, εt/φ per §21.2.2. Positive Mu = flange in compression.
        </p>
        <div className="no-print mt-4 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(330px,1fr)]">
          <div className="space-y-4">
            <Card title="Section" hint="web + flange">
              <Pick label="Beam type" value={kind} onChange={(v) => setKind(v as TBeamKind)}
                options={[['interior', 'Interior T'], ['edge', 'Edge (L-beam)'], ['isolated', 'Isolated T']]} />
              <Num label="Web bw" unit="mm" value={bw} onChange={setBw} />
              <Num label="Total depth h" unit="mm" value={h} onChange={setH} />
              <Num label="Flange hf" unit="mm" value={hf} onChange={setHf} />
              <Num label="bf override (0 = table)" unit="mm" value={bfGiven} onChange={setBfGiven} />
              <Num label="Clear span ln" unit="m" value={ln} onChange={setLn} />
              <Num label="Web clear spacing sw" unit="m" value={sw} onChange={setSw} />
            </Card>
            <Card title="Materials & detailing">
              <Num label="f'c" unit="MPa" value={fc} onChange={setFc} />
              <Num label="fy" unit="MPa" value={fy} onChange={setFy} />
              <Num label="Cover" unit="mm" value={cover} onChange={setCover} />
              <Num label="Stirrup ⌀" unit="mm" value={stirrupDia} onChange={setStirrupDia} />
              <Num label="Bar ⌀" unit="mm" value={barDia} onChange={setBarDia} />
            </Card>
            <Card title="Demand" hint="+ sagging / − hogging">
              <Num label="Mu" unit="kN·m" value={Mu} onChange={setMu} />
            </Card>
            {r && <WorkedSolution steps={steps} title="T-beam — worked solution" />}
          </div>
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {r && (
              <VerdictPanel ok={r.ok} headline={r.ok ? 'DESIGN OK' : 'CHECK FAILED'}
                governing={`${r.tBehavior ? 'true T (a > hf)' : Mu < 0 ? 'web rectangle (hogging)' : 'rectangular (a ≤ hf)'} · bf ${f0(r.bf)} mm`}
                stats={[
                  { label: 'Steel', value: `${r.bars}-⌀${barDia}`, unit: `mm (${f0(r.As)} mm²)` },
                  { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
                  { label: 'εt / φ', value: `${r.et.toFixed(4)} / ${r.phi.toFixed(2)}` },
                ]}
                checks={[
                  { name: 'Flexure Mu/φMn', ratio: r.phiMn > 0 ? Math.abs(Mu) / r.phiMn : 99 },
                  { name: 'Tension-controlled As/As,max', ratio: r.AsMax > 0 ? r.As / r.AsMax : 99 },
                ]}
                footnote={r.notes.join(' · ') || undefined} />
            )}
            {r && (
              <DrawingCard title="Section & stress block" meta={`${f0(r.bf)}×${hf} flange · ${bw}×${h} web`}>
                <TSection bf={r.bf} bw={bw} h={h} hf={hf} a={r.a} />
              </DrawingCard>
            )}
            <LetterheadCard lh={lh} onChange={(p) => setLh((s) => ({ ...s, ...p }))} />
          </div>
        </div>
      </div>
      {r && (
        <PrintReport docTitle="T-Beam" docCode="TB-01" badges={badges} ok={r.ok}
          governing={`${r.tBehavior ? 'true T behaviour' : 'rectangular behaviour'} · utilization ${(Math.abs(Mu) / Math.max(r.phiMn, 1e-9)).toFixed(2)}`}
          lh={lh}
          stats={[
            { label: 'Steel', value: `${r.bars}-⌀${barDia}` },
            { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
            { label: 'bf', value: f0(r.bf), unit: 'mm' },
          ]}
          checks={[
            { name: 'Flexure Mu/φMn', ratio: Math.abs(Mu) / Math.max(r.phiMn, 1e-9), ok: r.phiMn >= Math.abs(Mu) },
            { name: 'Tension-controlled', ratio: r.As / Math.max(r.AsMax, 1e-9), ok: r.As <= r.AsMax },
          ]}
          data={[
            ['Type', kind], ['Web bw × h', `${bw} × ${h} mm`], ['Flange bf × hf', `${f0(r.bf)} × ${hf} mm`],
            ["f'c / fy", `${fc} / ${fy} MPa`], ['Mu', `${Mu} kN·m`], ['d / dt', `${f1(r.d)} / ${f1(r.dt)} mm`],
          ]}
          steps={steps}
          drawing={<TSection bf={r.bf} bw={bw} h={h} hf={hf} a={r.a} />}
          drawingTitle="T-beam section" />
      )}
    </div>
  )
}
