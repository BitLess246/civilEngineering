import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { analyzeEntry, circulatingFromLegs, type EntryResult } from '../engine/roundabout'
import { Card, Num, ResultCard, Row, Pick } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, BRAND, f2, f3 } from '../lib/influenceStyle'

// Roundabout — HCM 2010 entry capacity and level of service for one entry,
// with a four-leg helper that assembles each entry's circulating flow from
// the leg volumes (the Exhibit 21-2 conflict pattern).

const SAMPLE_LEGS = [600, 140, 120, 108]

export default function Roundabout() {
  const [lanes, setLanes] = useState<'1' | '2'>('1')
  const [ve, setVe] = useState(600)
  const [vc, setVc] = useState(400)
  const [phf, setPhf] = useState(0.92)
  const [legs, setLegs] = useState<number[]>(SAMPLE_LEGS)
  const [useHelper, setUseHelper] = useState(true)

  // The helper: the entry analysed is leg 1 (westbound) and its circulating
  // flow is the sum of the other three legs.
  const vcHelper = useHelper ? circulatingFromLegs(legs)[0] : vc

  let r: EntryResult | null = null
  let err: string | null = null
  try { r = analyzeEntry({ ve, vc: vcHelper, lanes: lanes === '1' ? 1 : 2, phf }) }
  catch (e) { err = e instanceof Error ? e.message : 'Check the inputs' }

  const setLeg = (i: number, v: number) => setLegs((ls) => ls.map((x, j) => (j === i ? v : x)))

  const steps: SolutionStep[] = r ? [
    {
      title: 'Circulating flow across the entry',
      lines: useHelper ? [
        { text: `The entry from leg 1 is crossed by every other movement: the three upstream entries pass in front of it (HCM 2010 Exhibit 21-2 pattern).` },
        { tex: `v_c = v_2 + v_3 + v_4 = ${legs[1]} + ${legs[2]} + ${legs[3]} = ${Math.round(vcHelper)}\\ \\text{pc/h}` },
      ] : [
        { tex: `v_c = ${Math.round(vcHelper)}\\ \\text{pc/h} \\quad \\text{(entered directly)}` },
      ],
    },
    {
      title: 'Peak-15 flow rates and lane capacities',
      lines: [
        { tex: `v_e = ${ve}\\,\\text{/}\\,${f2(phf)} = ${f2(r.veAdj)}\\ \\text{pc/h} \\qquad v_c = ${Math.round(vcHelper)}\\,\\text{/}\\,${f2(phf)} = ${f2(r.vcAdj)}\\ \\text{pc/h}` },
        ...(r.laneCaps.length === 1
          ? [{ tex: `c = 1130\\,e^{-1.02\\times 10^{-3}\\cdot ${f2(r.vcAdj)}} = ${f2(r.capacity)}\\ \\text{pc/h}` }]
          : [
              { tex: `c_{\\text{right}} = 1130\\,e^{-0.70\\times 10^{-3} v_c} = ${f2(r.laneCaps[0].cap)},\\quad c_{\\text{left}} = 1130\\,e^{-0.75\\times 10^{-3} v_c} = ${f2(r.laneCaps[1].cap)}\\ \\text{pc/h}` },
              { text: `The entry splits 55/45 to the right/left lane; the entry capacity is the governing lane's share-corrected ceiling (${f2(r.capacity)} pc/h).` },
            ]),
      ],
    },
    {
      title: 'v/c and control delay',
      lines: [
        { tex: `x = \\frac{v_e}{c} = ${f3(r.xc)} \\qquad d = \\frac{3600}{c} + \\frac{900\\,T\\left[(x-1) + \\sqrt{(x-1)^2 + \\frac{8k B x}{cT}}\\right]}{x}` },
        { tex: `d = ${f2(r.delay)}\\ \\text{s/veh} \\;\\Rightarrow\\; \\text{LOS } ${r.los}` },
        { text: r.xc > 1
          ? 'Demand exceeds capacity — the entry is oversaturated. HCM flags LOS F and the queue must be cleared geometrically (add an entry lane or a bypass lane), not by timing.'
          : 'T = 0.25 h (15-min analysis), k = 1.0, B = 1.0 per the HCM unsignalized delay procedure the Manual applies to roundabouts. Thresholds: A ≤ 10, B ≤ 20, C ≤ 35, D ≤ 55, E ≤ 80 s/veh.' },
      ],
    },
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Roundabout Analysis Report" badges={[r ? `LOS ${r.los}` : 'HCM 2010']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        One entry of a roundabout under the HCM 2010 capacity model: the circulating
        stream that crosses the entry sets each lane's capacity, and the entry's v/c
        drives the control delay and level of service. The leg-volume helper assembles
        the conflicts the way Exhibit 21-2 draws them.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Entry">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setLegs(SAMPLE_LEGS); setVe(600); setPhf(0.92); setLanes('1') }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — leg volumes 600/140/120/108 · ve 600
              </button>
            </div>
            <Pick label="Entry lanes" value={lanes} onChange={setLanes} options={[['1', 'Single-lane entry'], ['2', 'Two-lane entry']]} />
            <Num label="Entry demand ve" unit="pc/h" value={ve} onChange={setVe} min={0} step="10" />
            <Num label="Peak-hour factor" unit="—" value={phf} onChange={setPhf} min={0.55} max={1} step="0.01" />
          </Card>

          <Card title="Circulating flow">
            <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={useHelper} onChange={(e) => setUseHelper(e.target.checked)} />
                assemble from the four leg volumes
              </label>
            </div>
            {useHelper ? (
              legs.map((v, i) => (
                <Num key={i} label={`Leg ${i + 1} entry volume`} unit="pc/h" value={v}
                  onChange={(x) => setLeg(i, x)} min={0} step="10" />
              ))
            ) : (
              <Num label="Circulating flow vc" unit="pc/h" value={vc} onChange={setVc} min={0} step="10" />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {r ? (
            <>
              <ResultCard title="Entry performance">
                <Row label="Entry capacity c" value={`${f2(r.capacity)} pc/h`}
                  sub={r.laneCaps.length === 1
                    ? `single lane · 1130·e^(−1.02×10⁻³·${f2(r.vcAdj)})`
                    : `right ${f2(r.laneCaps[0].cap)} / left ${f2(r.laneCaps[1].cap)} pc/h`} />
                <Row label="v/c" value={f3(r.xc)} alert={r.xc > 1}
                  sub={`reserve ${f2(r.reserve)} pc/h`} />
                <Row label="Control delay" value={`${f2(r.delay)} s/veh`}
                  sub="HCM unsignalized procedure · T = 15 min" />
                <Row label="Level of service" value={r.los} alert={r.los === 'F'}
                  sub={r.los === 'F' ? 'oversaturated — regeometry' : 'delay thresholds A ≤ 10 … E ≤ 80'} />
              </ResultCard>

              <DrawingCard title="Conflict diagram" meta="the entry and the circulating stream that crosses it">
                <DrawingFrame label="Roundabout conflict diagram">
                  <Plan legs={legs} veAdj={r.veAdj} vcAdj={r.vcAdj} lanes={lanes === '1' ? 1 : 2} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="HCM 2010 roundabout — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{err}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

function Plan({ legs, veAdj, vcAdj, lanes }: { legs: number[]; veAdj: number; vcAdj: number; lanes: number }) {
  const W = 700, Hh = 340
  const cx = W / 2, cy = Hh / 2 + 6
  const R = 58
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Roundabout conflict diagram">
      {/* circulating roadway */}
      <circle cx={cx} cy={cy} r={R + 34} fill="none" stroke={INK} strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r={R} fill="rgba(115,109,94,0.14)" stroke={INK} strokeWidth="1.4" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill={MUTED} fontFamily="var(--font-mono, monospace)">island</text>
      {/* circulating flow arrow (counterclockwise for right-hand traffic) */}
      <path d={`M ${cx + R + 28} ${cy} A ${R + 28} ${R + 28} 0 0 0 ${cx - R - 20} ${cy - 46}`} fill="none" stroke={BRAND} strokeWidth="2" strokeDasharray="6 4" />
      <polygon points={`${cx - R - 20},${cy - 46} ${cx - R - 12},${cy - 36} ${cx - R - 30},${cy - 34}`} fill={BRAND} />
      <text x={cx + R + 34} y={cy - 96} fontSize="11" fill={BRAND} fontFamily="var(--font-mono, monospace)">
        vc = {f2(vcAdj)} pc/h
      </text>
      {/* four legs */}
      {[
        { dx: 0, dy: -1, label: `Leg 2 · ${legs[1]}` },
        { dx: 1, dy: 0, label: `Leg 3 · ${legs[2]}` },
        { dx: 0, dy: 1, label: `Leg 4 · ${legs[3]}` },
        { dx: -1, dy: 0, label: `Leg 1 (entry) · ${legs[0]}` },
      ].map((l, i) => {
        const x1 = cx + l.dx * (R + 34), y1 = cy + l.dy * (R + 34)
        const x2 = cx + l.dx * (R + 108), y2 = cy + l.dy * (R + 108)
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={i === 3 ? BRAND : INK} strokeWidth={i === 3 ? 2.4 : 1.6} />
            <text x={x2 + l.dx * 4} y={y2 + l.dy * 4 + (l.dy === 0 ? 4 : l.dy < 0 ? -6 : 14)}
              textAnchor={l.dx === 0 ? 'middle' : l.dx > 0 ? 'start' : 'end'}
              fontSize={i === 3 ? '11.5' : '10.5'}
              fill={i === 3 ? BRAND : MUTED} fontFamily="var(--font-mono, monospace)">
              {l.label}
            </text>
          </g>
        )
      })}
      {/* the analysed entry, westbound from the left */}
      <line x1={cx - (R + 34)} y1={cy} x2={cx - (R + 108)} y2={cy} stroke={BRAND} strokeWidth="2.4" />
      <text x={cx - (R + 34)} y={cy + 26} fontSize="11" fill={BRAND} fontFamily="var(--font-mono, monospace)">
        ve = {f2(veAdj)} pc/h · {lanes === 1 ? '1' : '2'} lane{lanes > 1 ? 's' : ''}
      </text>
    </svg>
  )
}
