import { useMemo } from 'react'
import * as THREE from 'three'
import type { CageKind, RebarCage, RebarRole, RebarRun } from '../engine/rebarModel'
import { runPolylines, tubeFromPolyline, REBAR_ROLE_COLOR } from '../engine/rebarWire'

// ─────────────────────────────────────────────────────────────────────────
// THE REBAR CAGE IN 3D — solid bars, at the size they are actually made.
//
// It draws what `cageBuilder` places and nothing else: no geometry is invented
// here, so a bar that looks wrong in this view is wrong on the sheet and wrong
// on the bill too. That is the point of it.
//
// The shape comes from `rebarWire`, which is renderer-free — bends are rounded
// to the radius the bar is really bent to, hooks fold 135° into the core, and
// the centreline is swept as a tube of the bar's own diameter. Drawn as lines
// the cage read as a wire diagram: no thickness to judge cover against, hooks
// invisible at any distance, two bars in a plane indistinguishable.
//
// Every bar of one role is merged into a SINGLE mesh. One model is thousands
// of bars, and a mesh each would be thousands of draw calls; per role it is
// about five, and they share one material.
// ─────────────────────────────────────────────────────────────────────────

/** Sides on the swept circle. Six already reads round at bar scale; eight
 *  costs little and survives the close zoom a detail gets looked at from. */
const RADIAL = 8

function mergedGeometry(runs: RebarRun[]): THREE.BufferGeometry | null {
  const chunks: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }[] = []
  let nVert = 0, nIdx = 0
  for (const run of runs) {
    const r = run.dia / 2000                       // mm Ø → m radius
    for (const line of runPolylines(run)) {
      const t = tubeFromPolyline(line, r, RADIAL)
      if (t.indices.length === 0) continue
      chunks.push(t)
      nVert += t.positions.length
      nIdx += t.indices.length
    }
  }
  if (!chunks.length) return null

  const pos = new Float32Array(nVert)
  const nrm = new Float32Array(nVert)
  const idx = new Uint32Array(nIdx)
  let vo = 0, io = 0
  for (const c of chunks) {
    pos.set(c.positions, vo)
    nrm.set(c.normals, vo)
    const base = vo / 3
    for (let k = 0; k < c.indices.length; k++) idx[io + k] = c.indices[k] + base
    vo += c.positions.length
    io += c.indices.length
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  return g
}

function RoleMesh({ role, runs }: { role: RebarRole; runs: RebarRun[] }) {
  const geom = useMemo(() => mergedGeometry(runs), [runs])
  if (!geom) return null
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial color={REBAR_ROLE_COLOR[role] ?? '#64748b'} roughness={0.55} metalness={0.1} />
    </mesh>
  )
}

export interface RebarWireframeProps {
  cages: RebarCage[]
  /** Roles to draw. Omitted, everything is drawn. */
  roles?: RebarRole[]
  /** Only these members. Omitted, the whole structure. */
  members?: string[]
  /** Only cages of these kinds — beams, columns, slabs, … Omitted, every kind.
   *  A cage with no `kind` is always drawn: it has not claimed to be anything,
   *  so hiding it would be hiding steel on a guess. */
  kinds?: CageKind[]
}

/**
 * Every bar in the given cages, as solid bars grouped by role.
 *
 * Filtering happens here rather than in the builder so the same placed cages
 * feed the view, the sheets and the take-off — a view that rebuilt its own
 * subset is exactly how the three drifted apart in the first place.
 */
export function RebarWireframe({ cages, roles, members, kinds }: RebarWireframeProps) {
  const byRole = useMemo(() => {
    const roleSet = roles ? new Set(roles) : null
    const memSet = members ? new Set(members) : null
    const kindSet = kinds ? new Set(kinds) : null
    const map = new Map<RebarRole, RebarRun[]>()
    for (const c of cages) {
      if (memSet && !memSet.has(c.member)) continue
      if (kindSet && c.kind && !kindSet.has(c.kind)) continue
      for (const r of c.runs) {
        if (roleSet && !roleSet.has(r.role)) continue
        const list = map.get(r.role) ?? []
        list.push(r)
        map.set(r.role, list)
      }
    }
    return [...map]
  }, [cages, roles, members, kinds])
  return <group>{byRole.map(([role, runs]) => <RoleMesh key={role} role={role} runs={runs} />)}</group>
}
