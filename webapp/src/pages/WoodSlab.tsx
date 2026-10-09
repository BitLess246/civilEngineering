import { useState } from 'react'
import { designWoodSlab, woodSlabSolution, woodSlabTimberSizes, type DeckMaterial, type FlexuralCheck, type SlabSupport, type WoodSlabInput } from '../engine/woodSlab'
import { speciesList, gradesOf, resolveWoodSpecies } from '../engine/woodDesign'
import type { LoadDuration } from '../engine/woodDesign'
import { costTimberRows } from '../engine/takeoff'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { WoodDeckSection } from '../components/woodSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')
const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '—')
const st = (ok: boolean) => (ok ? 'pass' as const : 'fail' as const)

const SUPPORT: [SlabSupport, string][] = [['simple', 'Simple span'], ['continuous', 'Continuous (≥3)']]
const DURATION: [LoadDuration, string][] = [
  ['permanent', 'Permanent (0.9)'], ['ten-year', 'Occupancy live (1.0)'], ['two-month', 'Snow (1.15)'],
  ['seven-day', 'Construction (1.25)'], ['ten-minute', 'Wind/seismic (1.6)'],
]

/** The three result rows one flexural run contributes (deck or joist). */
function runRows(name: string, c: FlexuralCheck): ResultRow[] {
  return [
    { check: `${name} bending`, basis: `M = ${f3(c.M)} kN·m · f_b ≤ F′b`, demand: `${f2(c.fb)} MPa`, limit: `${f2(c.FbPrime)} MPa`, ratio: c.bendingRatio, status: st(c.bendingRatio <= 1) },
    { check: `${name} shear`, basis: `V = ${f2(c.V)} kN · f_v ≤ F′v`, demand: `${f2(c.fv)} MPa`, limit: `${f2(c.FvPrime)} MPa`, ratio: c.shearRatio, status: st(c.shearRatio <= 1) },
    { check: `${name} Δ live`, basis: 'L/360', demand: `${f2(c.deflLive)} mm`, limit: `${f2(c.deflLiveAllow)} mm`, ratio: c.deflLiveRatio, status: st(c.deflLiveRatio <= 1) },
    { check: `${name} Δ total`, basis: 'L/240', demand: `${f2(c.deflTotal)} mm`, limit: `${f2(c.deflTotalAllow)} mm`, ratio: c.deflTotalRatio, status: st(c.deflTotalRatio <= 1) },
  ]
}

export default function WoodSlab() {
  // plan
  const [Lx, setLx] = useState(3.0)
  const [Ly, setLy] = useState(3.6)
  // joist material
  const [species, setSpecies] = useState('DFL')
  const [grade, setGrade] = useState('2')
  // joist section
  const [joistB, setJoistB] = useState(50)
  const [joistD, setJoistD] = useState(200)
  const [joistSpacing, setJoistSpacing] = useState(400)
  const [joistSupport, setJoistSupport] = useState<SlabSupport>('simple')
  // deck
  const [deckMaterial, setDeckMaterial] = useState<DeckMaterial>('plank')
  const [deckThickness, setDeckThickness] = useState(25)
  const [deckWidth, setDeckWidth] = useState(140)
  const [deckSupport, setDeckSupport] = useState<SlabSupport>('continuous')
  // loads
  const [deadKpa, setDeadKpa] = useState(0.5)
  const [liveKpa, setLiveKpa] = useState(1.9)
  // options
  const [duration, setDuration] = useState<LoadDuration>('ten-year')
  const [wet, setWet] = useState(false)
  const [timberRate, setTimberRate] = useState(55)   // ₱ / board-foot (shared wood-frame rate)

  const sp = resolveWoodSpecies(species, grade)
  const joistRef = sp?.ref
  const speciesOptions: [string, string][] = speciesList().map((s) => [s.species, s.label])
  const gradeOptions: [string, string][] = gradesOf(species).map((g) => [g.grade, g.gradeLabel])

  // Kept as one object so the worked solution is generated from exactly the
  // input the solve used, not a re-assembled copy of it.
  const input: WoodSlabInput | null = joistRef ? {
    Lx, Ly, joistRef, joistKind: sp!.kind, joistB, joistD, joistSpacing, joistSupport,
    deckMaterial, deckThickness, deckWidth, deckSupport,
    deadKpa, liveKpa, opts: { duration, wet },
  } : null
  const r = input ? designWoodSlab(input) : null

  const sizes = input && r
    ? woodSlabTimberSizes(input, r, { joist: sp?.label, deck: deckMaterial === 'bamboo-slat' ? 'bamboo' : sp?.label })
    : []
  const bom = costTimberRows(sizes, timberRate)
  const bomTotal = bom.reduce((s, x) => s + x.amount, 0)
  const deckName = deckMaterial === 'bamboo-slat' ? 'Bamboo slat' : 'Plank'
  const governs = r ? (r.joist.ratio >= r.deck.ratio ? 'joist' : 'deck') : '—'

  const report = r ? {
    docCode: 'W-SL',
    ok: r.ok,
    governing: `${governs} governs at ${f2(r.ratio)} · ${f0(joistB)}×${f0(joistD)} @ ${f0(joistSpacing)} over ${f2(Lx)} m`,
    stats: [
      { label: 'Total pressure', value: f2(r.loads.totalKpa), unit: 'kPa' },
      { label: 'Joists', value: `${f0(r.takeoff.joistCount)} @ ${f0(joistSpacing)}`, unit: 'mm' },
      { label: 'Timber', value: f0(sizes.reduce((s, x) => s + x.boardFeet, 0)), unit: 'bd·ft' },
    ],
    checks: [
      { name: 'Deck utilisation', ratio: r.deck.ratio, ok: r.deck.ok },
      { name: 'Joist utilisation', ratio: r.joist.ratio, ok: r.joist.ok },
    ],
    data: [
      ['Plan Lx × Ly', `${f2(Lx)} × ${f2(Ly)} m`],
      ['Joist species / grade', sp?.label ?? '—'],
      ['Joist b × d @ spacing', `${f0(joistB)} × ${f0(joistD)} @ ${f0(joistSpacing)} mm`],
      ['Joist support', SUPPORT.find(([k]) => k === joistSupport)?.[1] ?? joistSupport],
      ['Deck', `${deckName} ${f0(deckWidth)} × ${f0(deckThickness)} mm, ${deckSupport}`],
      ['Superimposed dead / live', `${f2(deadKpa)} / ${f2(liveKpa)} kPa`],
      ['Load duration', DURATION.find(([k]) => k === duration)?.[1] ?? duration],
      ['Moisture', wet ? 'Wet service (C_M)' : 'Dry (MC ≤ 19%)'],
      ['Self-weight deck / joists', `${f2(r.loads.deckSelfKpa)} / ${f2(r.loads.joistSelfKpa)} kPa`],
      ['Timber sub-total', `₱${bomTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
    ] as [string, string][],
    steps: woodSlabSolution(input!, r),
  } : undefined

  const flexCard = (title: string, c: FlexuralCheck, basis: string) => (
    <CheckCard title={title} basis={basis} status={st(c.ok)}
      value={f2(c.ratio)} ratio={c.ratio} ratioLabel="governing"
      pairs={[
        { label: 'f_b / F′b', value: `${f2(c.fb)} / ${f2(c.FbPrime)} MPa` },
        { label: 'f_v / F′v', value: `${f2(c.fv)} / ${f2(c.FvPrime)} MPa` },
        { label: 'Δ total', value: `${f2(c.deflTotal)} / ${f2(c.deflTotalAllow)} mm` },
      ]} />
  )

  return (
    <WorkspacePage title="Wood Slab" badges={['Timber', 'NDS 2018 · NSCP 2015 Ch. 6']}
      intro="ASD design of a wood floor: decking (planks or bamboo slats) spanning between repetitive joists. Both are checked for bending, horizontal shear and service deflection (L/360 live, L/240 total); the joist gets the repetitive-member factor Cr and continuous lateral support from the decking (C_L = 1). Bamboo values are preliminary (ISO 22156 / published)."
      report={report}
      inputs={<>
        <InputGroup title="Plan and loads">
          <Num label="Lx (joist span)" unit="m" value={Lx} onChange={setLx} min={0.1} />
          <Num label="Ly (joists repeat)" unit="m" value={Ly} onChange={setLy} min={0.1} />
          <Num label="Superimposed dead" unit="kPa" value={deadKpa} onChange={setDeadKpa} min={0} />
          <Num label="Live load" unit="kPa" value={liveKpa} onChange={setLiveKpa} min={0} />
        </InputGroup>
        <InputGroup title="Joists">
          <Pick label="Species" value={species} options={speciesOptions}
            onChange={(v) => { setSpecies(v); const g = gradesOf(v); if (g.length) setGrade(g[0].grade) }} />
          <Pick label="Grade" value={grade} onChange={setGrade} options={gradeOptions} />
          <Num label="Width b" unit="mm" value={joistB} onChange={setJoistB} min={1} />
          <Num label="Depth d" unit="mm" value={joistD} onChange={setJoistD} min={1} />
          <Num label="Spacing" unit="mm" value={joistSpacing} onChange={setJoistSpacing} min={1} />
          <Pick label="Support" value={joistSupport} onChange={setJoistSupport} options={SUPPORT} />
        </InputGroup>
        <InputGroup title="Decking">
          <Pick label="Material" value={deckMaterial} options={[['plank', 'Plank (sawn)'], ['bamboo-slat', 'Bamboo slat']]}
            onChange={(m) => { setDeckMaterial(m); setDeckWidth(m === 'bamboo-slat' ? 50 : 140) }} />
          <Pick label="Support" value={deckSupport} onChange={setDeckSupport} options={[SUPPORT[1], SUPPORT[0]]} />
          <Num label="Thickness t" unit="mm" value={deckThickness} onChange={setDeckThickness} min={1} />
          <Num label="Board/slat width" unit="mm" value={deckWidth} onChange={setDeckWidth} min={1} />
        </InputGroup>
        <InputGroup title="Service conditions">
          <Pick label="Load duration (C_D)" value={duration} onChange={setDuration} options={DURATION} />
          <Pick label="Moisture" value={wet ? 'wet' : 'dry'} onChange={(v) => setWet(v === 'wet')}
            options={[['dry', 'Dry (MC ≤ 19%)'], ['wet', 'Wet service (C_M)']]} />
        </InputGroup>
      </>}
      checks={r ? <>
        {flexCard('Decking', r.deck, `spans the ${f0(joistSpacing)} mm joist spacing`)}
        {flexCard('Joist', r.joist, `${f0(joistB)}×${f0(joistD)} over ${f2(Lx)} m`)}
      </> : <CheckCard title="Joist grade" basis="species / grade lookup" status="warn" value="—" pillLabel="NOT RUN" />}
      summary={[
        { label: 'Floor', value: `${f2(Lx)} × ${f2(Ly)} m, joists span Lx` },
        { label: 'Joists', value: `${f0(joistB)}×${f0(joistD)} @ ${f0(joistSpacing)} mm, ${sp?.label ?? '—'}` },
        { label: 'Deck', value: `${deckName.toLowerCase()} ${f0(deckWidth)} × ${f0(deckThickness)} mm` },
        { label: 'Loads', value: `dead ${f2(deadKpa)} kPa, live ${f2(liveKpa)} kPa` },
      ]}
      drawing={{ title: 'Section across the joists', node: <div data-pdf-drawing>
        <WoodDeckSection b={joistB} d={joistD} s={joistSpacing} t={deckThickness} boardWidth={deckWidth}
          deck={deckMaterial} deckSupport={deckSupport} Lx={Lx} joistLabel={`joist ${f0(joistB)} × ${f0(joistD)}`} />
      </div> }}
      resultsCaption="Demands wL²/8 (simple) or wL²/10 (continuous ≥3 spans); deflection on the service modulus E′. Verify joist-to-support bearing, the fastener schedule and diaphragm action separately."
      results={r ? [
        { check: 'Self-weight', basis: `deck ${f2(r.loads.deckSelfKpa)} + joists ${f2(r.loads.joistSelfKpa)}`, demand: `${f2(r.loads.deckSelfKpa + r.loads.joistSelfKpa)} kPa`, status: 'info' as const },
        { check: 'Total pressure', basis: 'D + L (ASD)', demand: `${f2(r.loads.totalKpa)} kPa`, status: 'info' as const },
        ...runRows('Deck', r.deck),
        ...runRows('Joist', r.joist),
      ] : []}
      extraSections={r ? [{
        title: 'Bill of materials',
        node: <div>
          <label className="no-print mb-2 flex items-center justify-end gap-1 text-xs text-muted">
            ₱/bd·ft
            <input type="number" step="any" value={timberRate} onChange={(e) => { const v = parseFloat(e.target.value); setTimberRate(Number.isFinite(v) ? v : 55) }}
              className="w-16 rounded border border-field-line px-1.5 py-0.5 text-right font-mono" />
          </label>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-muted">
                  <th className="py-1 pr-3 font-medium">Item</th>
                  <th className="py-1 pr-3 text-right font-medium">Board feet</th>
                  <th className="py-1 text-right font-medium">Amount (₱)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {bom.map((row, k) => (
                  <tr key={k} className="border-b border-hairline-2">
                    <td className="py-1 pr-3">
                      {row.item}
                      <span className="ml-1 text-[11px] text-faint">
                        {k === 0
                          ? `${f0(sizes[0].count)} pc · ${f2(sizes[0].L)} m · ${f3(sizes[0].m3)} m³`
                          : `${f2(r.takeoff.deckAreaM2)} m² · ${f3(sizes[1].m3)} m³${r.takeoff.bambooSlatCount != null ? ` · ${f0(r.takeoff.bambooSlatCount)} slats` : ''}`}
                      </span>
                    </td>
                    <td className="py-1 pr-3 text-right">{f0(row.qty)}</td>
                    <td className="py-1 text-right">{row.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-ink-2">
                  <td className="py-1 pr-3">Timber sub-total</td>
                  <td className="py-1 pr-3 text-right">{f0(sizes.reduce((s, x) => s + x.boardFeet, 0))}</td>
                  <td className="py-1 text-right">{bomTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Board feet = m³ × 423.776, priced with the same <code>costTimberRows</code> (₱/board-foot) as the
            wood-frame model bill of materials.
          </p>
        </div>,
      }] : []}
      steps={input && r ? woodSlabSolution(input, r) : []}
      references={[
        { topic: 'Bending and shear', basis: 'f_b ≤ F′b, f_v = 3V/2bd ≤ F′v', source: 'NDS 2018 §3.3, §3.4' },
        { topic: 'Repetitive-member factor', basis: 'Cr = 1.15, ≥3 members ≤ 610 mm o.c.', source: 'NDS 2018 §4.3.9' },
        { topic: 'Adjustment factors', basis: 'C_D load duration, C_M wet service', source: 'NDS 2018 §2.3, Table 4.3.1' },
        { topic: 'Wood design', basis: 'allowable-stress design of sawn lumber', source: 'NSCP 2015 Chapter 6' },
        { topic: 'Bamboo slats', basis: 'preliminary reference values', source: 'ISO 22156' },
      ]}
    />
  )
}
