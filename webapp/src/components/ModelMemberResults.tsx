import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProjects } from '../lib/useProjects'
import { readOpenId } from '../lib/modelSpaceSession'
import {
  memberRows, memberSection, columnSectionAtNode, soilFromInputs,
  type MemberKind, type MemberRowView, type MemberLoadRequest,
} from '../lib/modelMemberResults'
import type { Project } from '../engine/projects/model'
import { Card } from './qty'

// ─────────────────────────────────────────────────────────────────────────
// A calculator's window onto a saved 3D model project.
//
// When the project a user has open in Model Space (or picks here) carries
// design results, this card offers that design's members of the calculator's
// kind in a dropdown. Picking one hands the member to the page — geometry,
// materials and demands land in the page's own fields, and the page's OWN
// worked solution runs on them. This card deliberately has no solution of
// its own: one worked solution per page, the one the page's fields drive.
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
  beam: 'governing section · Mu, Vu · section and cage as scheduled',
  column: 'Pu, Mu · section, cage and ties as scheduled',
  slab: 'DDM panel · dimensions, thickness and mat as scheduled',
  steelBeam: 'AISC §F2/§F3 flexure · shape and unbraced length as scheduled',
  steelColumn: 'AISC §E3 axial · §H1-1 interaction · shape as scheduled',
  footing: 'bearing · one- and two-way shear · pad as scheduled',
  combined: 'rigid-body distribution · pad as scheduled',
}

const optionLabel = (r: MemberRowView): string => {
  const util = r.util === null ? '—' : `${(r.util * 100).toFixed(0)}%`
  const check = r.ok === null ? '' : r.ok ? ' · PASS' : ' · FAIL'
  return `${r.id} — ${r.section} · ${r.detail} · ${util}${check}`
}

export function ModelMemberResults({ kind, onLoad }: {
  kind: MemberKind
  /** Called when the engineer picks a member: the page loads it into its
   *  fields and its own worked solution takes over from there. */
  onLoad?: (req: MemberLoadRequest) => void
}) {
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
  const soil = useMemo(() => (project ? soilFromInputs(project.inputs) : null), [project])
  const rows: MemberRowView[] = useMemo(
    () => project?.model && design ? memberRows(project.model, design, kind) : [],
    [project, design, kind],
  )
  const sel = rows.find((r) => r.id === selId) ?? null

  /** One section per kind: the member's own — or, for a footing, the column
   *  standing on the pad; a combined pad names BOTH of its columns. */
  const sectionsFor = (id: string) => {
    if (!project?.model) return {}
    const model = project.model
    if (kind === 'footing') return { section: columnSectionAtNode(model, id) }
    if (kind === 'combined') {
      const [n1, n2] = id.split(' + ')
      return { section: n1 ? columnSectionAtNode(model, n1) : undefined, section2: n2 ? columnSectionAtNode(model, n2) : undefined }
    }
    return { section: memberSection(model, id) }
  }

  const pick = (id: string) => {
    setSelId(id)
    if (onLoad && project?.model && design && soil && rows.some((r) => r.id === id)) {
      onLoad({ model: project.model, design, kind, id, soil, ...sectionsFor(id) })
    }
  }

  if (!project) {
    return (
      <Card title={`From your saved project — ${TITLES[kind]}`} grid={false}>
        <p className="text-[12.5px] leading-relaxed text-[#5b5648]">
          No saved project yet. Model your structure in{' '}
          <Link to="/model" className="font-semibold text-[#0f4c92] hover:underline">3D Model Space</Link>, run the
          design, and save it — this calculator will then offer every {TITLES[kind].toLowerCase()} of that project
          in the dropdown below, ready to load into the fields.
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
          project — its members will appear here.
        </p>
      )}

      {design && rows.length === 0 && (
        <p className="text-[12.5px] leading-relaxed text-[#5b5648]">
          The saved design has no {TITLES[kind].toLowerCase()} — the model has none of these members, or that part of
          the design produced nothing to check.
        </p>
      )}

      {design && rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11.5px] text-[#8a8574]">
            Results from the last design run on <span className="font-semibold text-[#5b5648]">{project.meta.name}</span> ·{' '}
            {HINTS[kind]} · picking a member fills this calculator's fields and its worked solution below.
          </p>
          <div className="flex items-center gap-2">
            <label className="flex-none text-[12px] text-[#5c6675]" htmlFor={`mmr-member-${kind}`}>Member</label>
            <select
              id={`mmr-member-${kind}`}
              className="min-w-0 flex-1 rounded border border-[#cddcf0] bg-white px-2 py-1.5 text-[12.5px]"
              value={selId ?? ''}
              onChange={(e) => { if (e.target.value) pick(e.target.value) }}
            >
              <option value="">Select a member…</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>{optionLabel(r)}</option>
              ))}
            </select>
            {sel && (
              <span className={`flex-none font-mono text-[12px] font-semibold ${utilTone(sel.util)}`}>
                {utilText(sel.util)}
              </span>
            )}
          </div>

          {sel && sel.ok === false && (
            <p className="rounded border border-[#efd4cc] bg-[#fbeeea] px-3 py-2 text-[12px] text-[#7a2c1c]">
              {sel.id} fails its check in the saved design. Model Space marks the same member — fix it there and save,
              or open the optimizer.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
