import { useState } from 'react'
import { solveTraverse, type TraverseCourse, type TraverseResult, type TraverseInput } from '../engine/traverse'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DrawingFrame } from '../components/DrawingFrame'
import { TraversePlot } from '../components/surveyingSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Traverse — courses in (length, bearing/azimuth); the engine closes the
// figure, adjusts it by Bowditch (or transit), walks the DMD chain and
// returns the enclosed area (engine/traverse.ts). Lengths in m.

interface CourseRowUI { name: string; length: string; dir: string }

const SAMPLE: CourseRowUI[] = [
  { name: 'AB', length: '100', dir: 'N 0 E' },
  { name: 'BC', length: '100', dir: 'S 90 E' },
  { name: 'CD', length: '80', dir: 'S 30 W' },
  { name: 'DA', length: '67.40', dir: 'S 62-52 W' },
]
/** Precision a property survey is ordinarily held to. */
const PRECISION_SPEC = 5000
const signed = (v: number) => `${v > 0 ? '+' : ''}${f3(v)}`

export default function Traverse() {
  const [courses, setCourses] = useState<CourseRowUI[]>(SAMPLE)
  const [rule, setRule] = useState<'bowditch' | 'transit'>('bowditch')
  const setCourse = (i: number, patch: Partial<CourseRowUI>) => setCourses((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)))

  const parsed: TraverseCourse[] = courses.map((c, i) => ({ name: c.name || `C${i + 1}`, length: parseFloat(c.length) || 0, dir: c.dir }))
  const input: TraverseInput = { courses: parsed, rule }
  let res: TraverseResult | null = null
  let err = ''
  try { res = solveTraverse(input) } catch (e) { err = (e as Error).message }
  const closedExact = !!res && res.precisionN === 0
  const precise = !!res && (closedExact || res.precisionN >= PRECISION_SPEC)
  const precisionText = !res ? '—' : closedExact ? 'closed exactly' : `1 in ${Math.round(res.precisionN).toLocaleString()}`

  const steps: SolutionStep[] = res ? [
    {
      title: 'Latitudes and departures of the raw chain',
      lines: [
        { text: 'With the azimuth measured clockwise from north, each course contributes lat = L·cos(az) (north+) and dep = L·sin(az) (east+).' },
        { tex: `${res.rows[0].name}:\\ \\text{lat} = ${f3(res.rows[0].length)}\\cos(${f2(res.rows[0].azDeg)}^\\circ) = ${f3(res.rows[0].lat)}\\text{ m},\\quad \\text{dep} = ${f3(res.rows[0].length)}\\sin(${f2(res.rows[0].azDeg)}^\\circ) = ${f3(res.rows[0].dep)}\\text{ m}` },
        { tex: `\\Sigma \\text{lat} = ${f3(res.eLat)}\\text{ m},\\qquad \\Sigma \\text{dep} = ${f3(res.eDep)}\\text{ m}` },
        { text: 'A closed figure needs both sums to be zero, so these ARE the closure errors.' },
      ],
    },
    {
      title: 'Linear misclosure and precision',
      lines: [
        { tex: `e = \\sqrt{e_{lat}^2 + e_{dep}^2} = \\sqrt{${f3(res.eLat)}^2 + ${f3(res.eDep)}^2} = ${f3(res.linear)}\\text{ m}` },
        { tex: `P = ${res.rows.map((r) => f2(r.length)).join('+')} = ${f3(res.perimeter)}\\text{ m} \\;\\Rightarrow\\; \\text{precision} = 1\\text{ in } ${res.precisionN === 0 ? '\\infty' : Math.round(res.precisionN).toLocaleString()}` },
        { text: res.precisionN >= 5000 ? 'At 1-in-5000 or better this is ordinary practice for a transit/theodolite lot survey.' : 'Common practice wants ~1 in 5000 or better for property surveys — re-measure the weakest course if the spec requires it.' },
      ],
    },
    {
      title: `${rule === 'bowditch' ? 'Bowditch (compass)' : 'Transit'} rule adjustment`,
      lines: rule === 'bowditch'
        ? [
            { text: 'The Bowditch rule assumes the angles and distances are about equally reliable: each course is corrected in proportion to its LENGTH.' },
            { tex: `C_{lat,i} = -e_{lat}\\cdot \\frac{L_i}{P},\\qquad C_{dep,i} = -e_{dep}\\cdot \\frac{L_i}{P}` },
            { tex: `${res.rows[0].name}:\\ C_{lat} = -(${f3(res.eLat)})\\times\\frac{${f2(res.rows[0].length)}}{${f3(res.perimeter)}} = ${signed(res.rows[0].cLat)}\\text{ m},\\quad C_{dep} = -(${f3(res.eDep)})\\times\\frac{${f2(res.rows[0].length)}}{${f3(res.perimeter)}} = ${signed(res.rows[0].cDep)}\\text{ m}` },
            { text: `The adjusted chain sums to exactly zero on both axes, so the figure closes on the drawing.` },
          ]
        : [
            { tex: `C_{lat,i} = -e_{lat}\\cdot\\frac{|lat_i|}{\\sum|lat|},\\qquad C_{dep,i} = -e_{dep}\\cdot\\frac{|dep_i|}{\\sum|dep|}` },
            { tex: `${res.rows[0].name}:\\ C_{lat} = -(${f3(res.eLat)})\\times\\frac{${f3(Math.abs(res.rows[0].lat))}}{${f3(res.rows.reduce((s, r) => s + Math.abs(r.lat), 0))}} = ${signed(res.rows[0].cLat)}\\text{ m},\\quad C_{dep} = -(${f3(res.eDep)})\\times\\frac{${f3(Math.abs(res.rows[0].dep))}}{${f3(res.rows.reduce((s, r) => s + Math.abs(r.dep), 0))}} = ${signed(res.rows[0].cDep)}\\text{ m}` },
            { text: 'The transit rule assumes the angles were measured better than the distances: corrections are shared in proportion to each course\u2019s own |lat| and |dep|.' },
            { text: 'It is rarely used in practice (it depends on the traverse orientation) but it is the classic comparison the exam asks for.' },
          ],
    },
    {
      title: 'Area by double-meridian distances',
      lines: [
        { tex: `DMD_1 = dep_1,\\qquad DMD_i = DMD_{i-1} + dep_{i-1} + dep_i` },
        { tex: `${res.rows[0].name}:\\ DMD_1\\cdot lat_1 = ${f3(res.rows[0].dmd)}\\times ${f3(res.rows[0].adjLat)} = ${f3(res.rows[0].doubleArea)}\\text{ m}^2` },
        { tex: `A = \\left|\\sum DMD_i \\cdot lat_i\\right| / 2 = ${f3(res.areaM2)}\\text{ m}^2 = ${f3(res.areaHa)}\\text{ ha}` },
        { text: 'The DMD chain is algebraically identical to the shoelace formula over the adjusted coordinates — two routes to the same number.' },
      ],
    },
  ] : [{ title: 'The traverse will not close', lines: [{ text: err }] }]

  return (
    <WorkspacePage title="Traverse" badges={['Surveying', rule === 'bowditch' ? 'Bowditch · DMD' : 'Transit · DMD']}
      intro="Close a figure from its courses: latitudes and departures, the linear misclosure and precision, a Bowditch (or transit) adjustment, and the area by double-meridian distances."
      inputs={<>
        <InputGroup title="Courses" hint="Direction as a quadrant bearing (N 45-30 E) or an azimuth in degrees from north.">
          <div className="col-span-2 space-y-1.5">
            {courses.map((c, i) => (
              <div key={i} className="space-y-1 rounded-md border border-hairline-2 p-2">
                <div className="flex items-center gap-2">
                  <input value={c.name} onChange={(e) => setCourse(i, { name: e.target.value })} aria-label={`Course ${i + 1} name`} className="w-20 min-w-0 text-[13px] font-semibold" />
                  <span className="flex-1" />
                  <button type="button" aria-label={`Remove course ${i + 1}`} onClick={() => setCourses((cs) => cs.filter((_, k) => k !== i))} disabled={courses.length <= 3}
                    className="text-muted hover:text-fail disabled:opacity-30">✕</button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-1.5">
                  <Num label="Length (m)" value={parseFloat(c.length) || 0} onChange={(v) => setCourse(i, { length: String(v) })} min={0} step="0.01" />
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 text-[11.5px] font-semibold text-muted">Bearing / azimuth</span>
                    <input value={c.dir} onChange={(e) => setCourse(i, { dir: e.target.value })} placeholder="N 45-30 E" className="min-w-0 text-[13px]" />
                  </label>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCourses((cs) => [...cs, { name: `S${cs.length + 1}`, length: '', dir: '' }])}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add course</button>
              <button type="button" onClick={() => setCourses(SAMPLE.map((c) => ({ ...c })))}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: four-sided lot</button>
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Adjustment">
          <div className="col-span-2">
            <Pick label="Rule" value={rule} onChange={(v) => setRule(v as 'bowditch' | 'transit')}
              options={[['bowditch', 'Bowditch (compass) — ∝ length'], ['transit', 'Transit — ∝ |lat|, |dep|']]} />
          </div>
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Precision" basis={`against 1 in ${PRECISION_SPEC.toLocaleString()}`} status={precise ? 'pass' : 'fail'} pillLabel={precise ? 'PASS' : 'RE-MEASURE'}
          value={precisionText} formula="1 in P / e"
          ratio={closedExact ? 0 : PRECISION_SPEC / res.precisionN} ratioLabel="Spec ÷ achieved"
          pairs={[{ label: 'Perimeter P', value: `${f2(res.perimeter)} m` }, { label: 'Misclosure e', value: `${f3(res.linear)} m` }]} />
        <CheckCard title="Linear misclosure" basis="before adjustment" status="info" value={f3(res.linear)} unit="m" formula="e = √(e_lat² + e_dep²)"
          pairs={[{ label: 'e_lat', value: `${signed(res.eLat)} m` }, { label: 'e_dep', value: `${signed(res.eDep)} m` }]} />
        <CheckCard title="Enclosed area" basis={`${res.n} courses, adjusted by ${rule === 'bowditch' ? 'Bowditch' : 'transit'}`} status="info" value={f3(res.areaM2)} unit="m²" formula="A = |Σ DMD·lat| / 2"
          pairs={[{ label: 'Hectares', value: `${f3(res.areaHa)} ha` }, { label: 'Acres', value: `${f2((res.areaM2 / 10000) * 2.47105)} ac` }]} />
      </> : (
        <CheckCard title="The traverse will not close" basis="check the courses" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Courses', value: `${courses.length}` },
        { label: 'Adjustment rule', value: rule === 'bowditch' ? 'Bowditch (compass)' : 'Transit' },
        { label: 'Perimeter', value: res ? `${f2(res.perimeter)} m` : '—' },
      ]}
      drawing={res ? { title: 'Adjusted figure and course table', node: <>
        <div data-pdf-drawing className="mx-auto max-w-[680px]">
          <DrawingFrame label="Adjusted traverse polygon"><TraversePlot res={res} /></DrawingFrame>
        </div>
        <p className="mt-1 text-[10.5px] text-faint">x east, y north · vertices from the adjusted coordinates.</p>
        <div className="mt-3 overflow-x-auto rounded-md border border-hairline bg-sheet">
          <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
            <thead><tr className="bg-sheet-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
              {['Course', 'Length', 'Bearing', 'Lat', 'Dep', 'c·Lat', 'c·Dep', 'Adj bearing', 'DMD'].map((h, k) => (
                <th key={h} className={`px-2.5 py-1.5 ${k === 0 || k === 2 || k === 7 ? '' : 'text-right'}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className="font-mono">
              {res.rows.map((r, k) => (
                <tr key={k} className="border-t border-hairline-2">
                  <td className="px-2.5 py-1 font-sans font-semibold text-ink">{r.name}</td>
                  <td className="px-2.5 py-1 text-right">{f3(r.length)}</td>
                  <td className="px-2.5 py-1">{r.dirLabel}</td>
                  <td className="px-2.5 py-1 text-right">{signed(r.lat)}</td>
                  <td className="px-2.5 py-1 text-right">{signed(r.dep)}</td>
                  <td className={`px-2.5 py-1 text-right ${Math.abs(r.cLat) > 1e-9 ? 'text-brand' : 'text-faint'}`}>{signed(r.cLat)}</td>
                  <td className={`px-2.5 py-1 text-right ${Math.abs(r.cDep) > 1e-9 ? 'text-brand' : 'text-faint'}`}>{signed(r.cDep)}</td>
                  <td className="px-2.5 py-1">{r.adjDirLabel}</td>
                  <td className="px-2.5 py-1 text-right">{f3(r.dmd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10.5px] text-faint">All values in metres; c·Lat and c·Dep are the corrections the rule applied.</p>
      </> } : undefined}
      results={res ? [
        { check: 'Precision', basis: '1 in P/e', demand: precisionText, limit: `1 in ${PRECISION_SPEC.toLocaleString()}`, ratio: closedExact ? 0 : PRECISION_SPEC / res.precisionN, status: precise ? 'pass' : 'fail' },
        { check: 'Linear misclosure', basis: '√(e_lat² + e_dep²)', demand: `${f3(res.linear)} m`, status: 'info' },
        { check: 'Enclosed area', basis: 'DMD method', demand: `${f3(res.areaM2)} m²`, status: 'info' },
      ] : [{ check: 'Closure', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Latitudes and departures', basis: 'lat = L cos(az), dep = L sin(az); Σlat = Σdep = 0 for a closed figure', source: 'Plane surveying — traverse computation' },
        { topic: 'Bowditch rule', basis: 'C = −e·Lᵢ/P on each axis', source: 'Plane surveying — compass rule' },
        { topic: 'Transit rule', basis: 'C_lat = −e_lat·|latᵢ|/Σ|lat|, C_dep = −e_dep·|depᵢ|/Σ|dep|', source: 'Plane surveying — transit rule' },
        { topic: 'Area', basis: 'DMD₁ = dep₁; DMDᵢ = DMDᵢ₋₁ + depᵢ₋₁ + depᵢ; A = |Σ DMD·lat|/2', source: 'Plane surveying — double-meridian distances' },
        { topic: 'Precision', basis: '1 in 5,000 is the ordinary target for property surveys', source: 'Surveying practice' },
      ]}
    />
  )
}
