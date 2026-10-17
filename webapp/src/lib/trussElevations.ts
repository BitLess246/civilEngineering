// ─────────────────────────────────────────────────────────────────────────
// One roof truss elevation per truss the model carries — the model and the
// design reduced to `engine/trussElevation`'s input. The members are found by
// the ids `addRoofTrusses` gives them (`trussPart`), the grid line by the
// framing plans' own `gridLines`, and the forces from the design's brace
// schedule, so the sheet quotes the numbers S-07 prints.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import type { TrussElevationInput, TrussElevationMember } from '../engine/trussElevation'
import { trussPart, isPurlin } from '../engine/roofTruss'
import { gridLines } from './planDetails'

export interface TrussElevationBundle { key: string; truss: number; line: string; input: TrussElevationInput }

export function trussElevationBundles(model: StructuralModel, design: StructureDesign | null): TrussElevationBundle[] {
  const node = new Map(model.nodes.map((n) => [n.id, n]))
  const sec = new Map(model.sections.map((s) => [s.id, s]))
  const brace = new Map((design?.steelBraces ?? []).map((r) => [r.id, r]))
  const byTruss = new Map<number, { m: StructuralModel['members'][number]; part: TrussElevationMember['part'] }[]>()
  for (const m of model.members) {
    const t = trussPart(m.id)
    if (t) byTruss.set(t.truss, [...(byTruss.get(t.truss) ?? []), { m, part: t.part }])
  }
  const grids = gridLines(model)
  const roofPts = new Map((model.roofing?.points ?? []).map((p) => [p.node, p.area]))
  const out: TrussElevationBundle[] = []
  for (const [truss, list] of [...byTruss].sort((a, b) => a[0] - b[0])) {
    const ids = [...new Set(list.flatMap(({ m }) => [m.i, m.j]))]
    const ns = ids.map((id) => node.get(id)).filter((n): n is NonNullable<typeof n> => !!n)
    if (ns.length < 3) continue
    // the plane: the truss runs along whichever plan axis its nodes spread over
    const spreadX = Math.max(...ns.map((n) => n.x)) - Math.min(...ns.map((n) => n.x))
    const spreadZ = Math.max(...ns.map((n) => n.z)) - Math.min(...ns.map((n) => n.z))
    const along: 'x' | 'z' = spreadX >= spreadZ ? 'x' : 'z'
    const at = along === 'x' ? ns[0].z : ns[0].x
    const uOf = (n: { x: number; z: number }) => (along === 'x' ? n.x : n.z)
    // gridLines: axis 'x' is a line at constant z running along x
    const line = grids.find((g) => g.axis === along && Math.abs(g.at - at) < 1e-6)?.label ?? `T${truss}`
    const bearingY = Math.min(...ns.map((n) => n.y))
    const bearingUs = ns.filter((n) => Math.abs(n.y - bearingY) < 1e-6).map(uOf)
    const cross = grids.filter((g) => g.axis !== along && bearingUs.some((uu) => Math.abs(uu - g.at) < 1e-6))
      .map((g) => ({ label: g.label, u: g.at }))
    const members: TrussElevationMember[] = list.map(({ m, part }) => {
      const r = brace.get(m.id)
      return {
        id: m.id, i: m.i, j: m.j, part, shape: sec.get(m.section)?.shape ?? sec.get(m.section)?.name ?? '?',
        ...(r ? { Pu: r.Pu, Tu: r.Tu, util: r.member.util, ok: r.ok } : {}),
      }
    })
    const own = new Set(ids)
    const purlins = model.members.filter((m) => isPurlin(m.id) && (own.has(m.i) || own.has(m.j)))
    const purlinAt = [...new Set(purlins.map((m) => (own.has(m.i) ? m.i : m.j)))]
    // the strip this truss carries: its roofing area over its span
    const span = Math.max(...ns.map(uOf)) - Math.min(...ns.map(uOf))
    const area = ids.reduce((s, id) => s + (roofPts.get(id) ?? 0), 0)
    out.push({
      key: `roof-truss-${line.toLowerCase()}`, truss, line,
      input: {
        line, bearingY, grids: cross, members, purlinAt,
        nodes: ns.map((n) => ({ id: n.id, u: uOf(n), y: n.y })),
        purlinShape: purlins[0] ? sec.get(purlins[0].section)?.shape : undefined,
        roofing: model.roofing ? { qD: model.roofing.qD, qLr: model.roofing.qLr } : undefined,
        spacing: span > 0 && area > 0 ? area / span : undefined,
        ...(design?.trussJoints ? { joints: design.trussJoints.filter((j) => own.has(j.node))
          .map((j) => ({ node: j.node, covered: j.result.covered, ok: j.result.ok, util: j.result.util })) } : {}),
      },
    })
  }
  return out
}
