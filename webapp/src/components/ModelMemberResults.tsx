import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProjects } from '../lib/useProjects'
import { readOpenId } from '../lib/modelSpaceSession'
import { memberRows, memberSolution, soilFromInputs, type MemberKind, type MemberRowView } from '../lib/modelMemberResults'
import type { Project } from '../engine/projects/model'
import { WorkedSolution } from './WorkedSolution'
import { Card } from './qty'

// ─────────────────────────────────────────────────────────────────────────
// A calculator's window onto a saved 3D model project.
//
// When the project a user has open in Model Space (or picks here) carries
// design results, this card lists that design's members of the calculator's
// kind and expands the SAME worked solution the Model Space schedule
// expands — the rows are read, never recomputed, so the calculator cannot
// disagree with the schedule or the report about a number.
//
// Every empty state says what happened: no saved project, a project saved
// before results were kept, or a design with no members of this kind. None
// of them invent a check.
// ─────────────────────────────────────────────────────────────────────────

const utilTone = (u: number | null): string =>
  u === null ? 'text-[#5b5648]' : u > 1 ? 'text-[#c2402a]' : u > 0.9 ? 'text-[#b47a14]' : 'text-[#1a7f4b]'

const utilText = (u: number | null): string => (u === null ? '—' : `${(u * 100).toFixed(0)}%`)

const TITLES: Record<MemberKind, string> = {
  beam: 'RC beams', column: 'RC columns', slab: 'Slab panels',
  steelBeam: 'Steel beams', steelColumn: 'Steel columns',
  footing: 'Isolated footings', combined: 'Combined footings',
}

const HINTS: Record<MemberKind, string> = {
  beam: 'governing section · Mu, Vu · As · bars as scheduled',
  column: 'Pu, Mu, Muy · biaxial check · bars and ties',
  slab: 'DDM panels · factored wu · mats as scheduled',
  steelBeam: 'AISC §F2/§F3 flexure · §G2 shear · deflection',
  steelColumn: 'AISC §E3 axial · §H1-1 interaction',
  footing: 'bearing · one- and two-way shear · mat steel',
  combined: 'rigid-body distribution · shear · mat steel',
}

export function ModelMemberResults({ kind }: { kind: MemberKind }) {
  const api = useProjects()
  const [picked, setPicked] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)

  const projects = api.list
  /** The project this card shows: the one open in Model Space, unless the
   *  engineer picked another — or none is open and the newest stands in. */
  const openId = readOpenId()
  const { project, sourceId } = useMemo<{ project: Project | null; sourceId: string | null }>(() => {
    if (picked) return { project: api.load(picked), sourceId: picked }
    if (openId) { const p = api.load(openId); if (p) return { project: p, sourceId: openId } }
    return projects.length ? { project: api.load(projects[0].id), sourceId: projects[0].id } : { project: null, sourceId: null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, openId, projects])

  const design = project?.results?.design ?? null
  const rows: MemberRowView[] = useMemo(
    () => project?.model && design ? memberRows(project.model, design, kind) : [],
    [project, design, kind],
  )
  const sel = rows.find((r) => r.id === (selId && rows.some((r) => r.id === selId) ? selId : rows[0]?.id)) ?? null
  const steps = useMemo(
    () => project?.model && design && sel ? memberSolution(project.model, design, kind, sel.id, soilFromInputs(project.inputs)) : [],
    [project, design, sel, kind],
  )

  if (!project) {
    return (
      <Card title={`From your saved project — ${TITLES[kind]}`} grid={false}>
        <p className="text-[12.5px] leading-relaxed text-[#5b5648]">
          No saved project yet. Model your structure in{' '}
          <Link to="/model" className="font-semibold text-[#0f4c92] hover:underline">3D Model Space</Link>, run the
          design, and save it — this calculator will then list every {TITLES[kind].toLowerCase()} result from that project.
        </p>
      </Card>
    )
  }

  return (
    <Card title={`From your saved project — ${TITLES[kind]}`} grid={false}>
      {projects.length > 1 && (
        <div className="mb-2 flex items-center gap-2">
          <label className="text-[12px] text-[#5c6675]" htmlFor={`mmr-project-${kind}`}>Project</label>
          <select
            id={`mmr-project-${kind}`}
            className="min-w-0 flex-1 rounded border border-[#cddcf0] bg-white px-2 py-1 text-[12.5px]"
            value={sourceId ?? ''}
            onChange={(e) => { setPicked(e.target.value); setSelId(null) }}
          >
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {!design && (
        <p className="text-[12.5px] leading-relaxed text-[#5b5648]">
          <span className="font-semibold text-[#5b5648]">{project.meta.name}</span> was saved without design results.
          Run <span className="font-semibold">Design</span> (or <span className="font-semibold">Optimize</span>) in{' '}
          <Link to="/model" className="font-semibold text-[#0f4c92] hover:underline">Model Space</Link> and save the
          project — its member results will appear here.
        </p>
      )}

      {design && rows.length === 0 && (
        <p className="text-[12.5px] leading-relaxed text-[#5b5648]">
          The saved design has no {TITLES[kind].toLowerCase()} — the model has none of these members, or that part of
          the design produced nothing to check.
        </p>
      )}

      {design && rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11.5px] text-[#8a8574]">
            Results from the last design run on <span className="font-semibold text-[#5b5648]">{project.meta.name}</span> ·{' '}
            {HINTS[kind]} · read from the project, not recomputed here.
          </p>
          <div className="overflow-hidden rounded border border-[#e3e1da]">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#f4f2ec] text-left text-[#5b5648]">
                  <th className="px-2.5 py-1.5 font-semibold">Member</th>
                  <th className="px-2.5 py-1.5 font-semibold">Section</th>
                  <th className="px-2.5 py-1.5 font-semibold">Demand</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Util</th>
                  <th className="px-2.5 py-1.5 text-center font-semibold">Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelId(r.id)}
                    className={`cursor-pointer border-t border-[#eceae3] ${sel?.id === r.id ? 'bg-[#eaf1f9]' : 'hover:bg-[#f8f7f3]'}`}
                  >
                    <td className="px-2.5 py-1.5 font-semibold text-[#33312c]">{r.id}</td>
                    <td className="px-2.5 py-1.5 text-[#5b5648]">{r.section}</td>
                    <td className="px-2.5 py-1.5 text-[#5b5648]">{r.detail}</td>
                    <td className={`px-2.5 py-1.5 text-right font-mono ${utilTone(r.util)}`}>{utilText(r.util)}</td>
                    <td className="px-2.5 py-1.5 text-center">
                      {r.ok === null ? <span className="text-[#8a8574]">—</span>
                        : r.ok ? <span className="font-semibold text-[#1a7f4b]">PASS</span>
                          : <span className="font-semibold text-[#c2402a]">FAIL</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sel && sel.ok === false && (
            <p className="rounded border border-[#efd4cc] bg-[#fbeeea] px-3 py-2 text-[12px] text-[#7a2c1c]">
              {sel.id} fails its check in the saved design. Model Space marks the same member — fix it there and save,
              or open the optimizer.
            </p>
          )}

          {steps.length > 0 && <WorkedSolution steps={steps} title={`${sel?.id} — worked solution, as scheduled in the project`} />}
        </div>
      )}
    </Card>
  )
}
