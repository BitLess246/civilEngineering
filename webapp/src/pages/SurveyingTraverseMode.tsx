import { useState } from 'react'
import { solveTraverse, type TraverseCourse, type TraverseResult, type TraverseInput } from '../engine/traverse'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, FAIL, MUTED, HAIR, f2, f3, signed } from '../lib/influenceStyle'

// Surveying toolbox — TRAVERSE mode. Courses in (length, bearing/azimuth);
// the engine closes the figure, adjusts it by Bowditch (or transit), walks
// the DMD chain and returns the enclosed area (engine/traverse.ts).

interface CourseRowUI {
  name: string
  length: string
  dir: string
}

const SAMPLE: CourseRowUI[] = [
  { name: 'AB', length: '100', dir: 'N 0 E' },
  { name: 'BC', length: '100', dir: 'S 90 E' },
  { name: 'CD', length: '80', dir: 'S 30 W' },
  { name: 'DA', length: '67.40', dir: 'S 62-52 W' },
]

export function TraverseMode() {
  const [courses, setCourses] = useState<CourseRowUI[]>(SAMPLE)
  const [rule, setRule] = useState<'bowditch' | 'transit'>('bowditch')

  const setCourse = (i: number, patch: Partial<CourseRowUI>) =>
    setCourses((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const addCourse = () => setCourses((cs) => [...cs, { name: `S${cs.length + 1}`, length: '', dir: '' }])
  const delCourse = (i: number) => setCourses((cs) => cs.filter((_, k) => k !== i))
  const loadSample = () => setCourses(SAMPLE.map((c) => ({ ...c })))

  const parsed: TraverseCourse[] = courses.map((c, i) => ({
    name: c.name || `C${i + 1}`,
    length: parseFloat(c.length) || 0,
    dir: c.dir,
  }))
  const input: TraverseInput = { courses: parsed, rule }
  const res: TraverseResult | null = (() => { try { return solveTraverse(input) } catch { return null } })()

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
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Traverse Report" badges={['Bowditch · DMD']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Close a figure from its courses: latitudes and departures, linear misclosure and precision,
          a Bowditch (or transit) adjustment, and the area by double-meridian distances — the whole
          board-exam chain in one pass.
        </p>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Courses" hint="bearing like N 45-30 E, or azimuth degrees">
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button" onClick={loadSample}
                  className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                  Load the sample lot — ABCD, 4 courses
                </button>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
                {courses.map((c, i) => (
                  <div key={i} className="grid grid-cols-[3.4rem_minmax(0,1fr)_minmax(0,1.4fr)_1.4rem] items-end gap-1.5">
                    <label className="flex flex-col text-sm">
                      <span className="mb-1 text-[11.5px] font-semibold text-muted">Course {i + 1}</span>
                      <input value={c.name} onChange={(e) => setCourse(i, { name: e.target.value })} className="text-[13px]" />
                    </label>
                    <Num label="Dist (m)" value={parseFloat(c.length) || 0} onChange={(v) => setCourse(i, { length: String(v) })} step="0.01" />
                    <label className="flex flex-col text-sm">
                      <span className="mb-1 text-[11.5px] font-semibold text-muted">Bearing / azimuth</span>
                      <input value={c.dir} onChange={(e) => setCourse(i, { dir: e.target.value })} placeholder="N 45-30 E" className="text-[13px]" />
                    </label>
                    <button type="button" onClick={() => delCourse(i)} disabled={courses.length <= 3}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={addCourse}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add course</button>
              </div>
            </Card>

            <Card title="Adjustment">
              <Pick label="Rule" value={rule} onChange={(v) => setRule(v as 'bowditch' | 'transit')}
                options={[['bowditch', 'Bowditch (compass) — ∝ length'], ['transit', 'Transit — ∝ |lat|/|dep|']]} />
            </Card>
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Closure & area">
                  <Row label="Linear misclosure" value={`${f3(res.linear)} m`} sub={`eLat ${signed(res.eLat)} · eDep ${signed(res.eDep)} m`} alert={res.linear > 0} />
                  <Row label="Precision" value={res.precisionN === 0 ? 'perfectly closed' : `1 in ${Math.round(res.precisionN).toLocaleString()}`} sub={`perimeter ${f2(res.perimeter)} m`} />
                  <Row label="Enclosed area" value={`${f3(res.areaM2)} m²`} sub={`${f3(res.areaHa)} ha · ${f2(res.areaM2 / 10000 * 2.47105)} acres`} />
                  <Row label="Adjusted rule" value={rule === 'bowditch' ? 'Bowditch (compass)' : 'Transit'} sub={`${res.n} courses · chain sums to zero`} />
                </ResultCard>

                <DrawingCard title="Adjusted figure" meta="x east, y north · vertices from the adjusted coordinates">
                  <DrawingFrame label="Adjusted traverse polygon">
                    <TraversePlot res={res} />
                  </DrawingFrame>
                </DrawingCard>

                <ResultCard title="Course table (all in metres, adjusted values after the rule)">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted">
                        <tr className="text-left">
                          <th className="py-1 pr-2 font-semibold">Course</th>
                          <th className="pr-2 text-right font-semibold">Length</th>
                          <th className="pr-2 font-semibold">Bearing</th>
                          <th className="pr-2 text-right font-semibold">Lat</th>
                          <th className="pr-2 text-right font-semibold">Dep</th>
                          <th className="pr-2 text-right font-semibold">c·Lat</th>
                          <th className="pr-2 text-right font-semibold">c·Dep</th>
                          <th className="pr-2 text-right font-semibold">Adj bearing</th>
                          <th className="text-right font-semibold">DMD</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {res.rows.map((r, k) => (
                          <tr key={k} className="border-t border-hairline-2">
                            <td className="py-1 pr-2 font-semibold">{r.name}</td>
                            <td className="pr-2 text-right">{f3(r.length)}</td>
                            <td className="pr-2">{r.dirLabel}</td>
                            <td className="pr-2 text-right">{signed(r.lat)}</td>
                            <td className="pr-2 text-right">{signed(r.dep)}</td>
                            <td className={`pr-2 text-right ${Math.abs(r.cLat) > 1e-9 ? 'text-brand' : 'text-faint'}`}>{signed(r.cLat)}</td>
                            <td className={`pr-2 text-right ${Math.abs(r.cDep) > 1e-9 ? 'text-brand' : 'text-faint'}`}>{signed(r.cDep)}</td>
                            <td className="pr-2">{r.adjDirLabel}</td>
                            <td className="text-right">{f3(r.dmd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ResultCard>
              </>
            ) : (
              <ResultCard title="The traverse will not close">
                <p className="text-sm text-fail">
                  Give every course a positive distance and a readable direction — a quadrant bearing
                  like “N 45-30 E” or an azimuth in degrees. At least three courses are needed.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {res && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Traverse — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── polygon drawing ───────────────────────────────────────────────────────

function TraversePlot({ res }: { res: TraverseResult }) {
  const W = 640
  const H = 480
  const pad = 52

  const xs = res.vertices.map((v) => v.x)
  const ys = res.vertices.map((v) => v.y)
  const xMin = Math.min(...xs); const xMax = Math.max(...xs)
  const yMin = Math.min(...ys); const yMax = Math.max(...ys)
  const spanX = Math.max(xMax - xMin, 1e-6)
  const spanY = Math.max(yMax - yMin, 1e-6)
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY)
  const cx = (x: number) => pad + (x - xMin) * scale + ((W - 2 * pad) - spanX * scale) / 2
  const cy = (y: number) => H - pad - (y - yMin) * scale - ((H - 2 * pad) - spanY * scale) / 2

  // plot north arrow direction (x east → screen right, y north → screen up)
  const verts = res.vertices
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Adjusted traverse polygon">
      {/* grid */}
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke={HAIR} />
      <line x1={pad} x2={pad} y1={pad} y2={H - pad} stroke={HAIR} />
      <text x={W - pad} y={H - pad + 16} textAnchor="end" fontSize="10" fill={MUTED}>E (m)</text>
      <text x={pad - 8} y={pad - 8} fontSize="10" fill={MUTED}>N (m)</text>

      {/* polygon */}
      <polygon
        points={verts.slice(0, res.n).map((v) => `${cx(v.x)},${cy(v.y)}`).join(' ')}
        fill="rgba(15,76,146,0.06)" stroke={INK} strokeWidth="1.8"
      />
      {/* courses with names */}
      {res.rows.map((r, i) => {
        const a = verts[i]
        const b = verts[i + 1]
        const mx = (cx(a.x) + cx(b.x)) / 2
        const my = (cy(a.y) + cy(b.y)) / 2
        return (
          <g key={i}>
            <text x={mx} y={my - 5} textAnchor="middle" fontSize="10" fill={BRAND} fontFamily="var(--font-mono, monospace)">
              {r.name} · {f2(r.adjLength)} m
            </text>
          </g>
        )
      })}
      {/* vertices */}
      {verts.slice(0, res.n).map((v, i) => (
        <g key={i}>
          <circle cx={cx(v.x)} cy={cy(v.y)} r="3" fill={INK} />
          <text x={cx(v.x) + 7} y={cy(v.y) - 6} fontSize="11" fontWeight="700" fill={INK} fontFamily="var(--font-mono, monospace)">{v.name}</text>
        </g>
      ))}
      {/* north arrow */}
      <g transform={`translate(${W - 34}, ${pad + 14})`}>
        <line x1="0" y1="18" x2="0" y2="0" stroke={BRAND} strokeWidth="1.6" />
        <polygon points="0,-4 3.4,4 -3.4,4" fill={BRAND} />
        <text x="0" y="30" textAnchor="middle" fontSize="10" fill={BRAND}>N</text>
      </g>
      {/* area stamp */}
      <text x={pad} y={pad - 12} fontSize="11" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        A = {f3(res.areaM2)} m² = {f3(res.areaHa)} ha
      </text>
      {res.linear > 1e-9 && (
        <text x={W - pad} y={pad - 12} textAnchor="end" fontSize="10" fill={FAIL} fontFamily="var(--font-mono, monospace)">
          misclosure {f3(res.linear)} m → {res.rule === 'bowditch' ? 'Bowditch' : 'transit'} adjusted
        </text>
      )}
    </svg>
  )
}
