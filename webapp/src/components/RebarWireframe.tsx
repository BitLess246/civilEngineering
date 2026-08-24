import { useMemo } from 'react'
import * as THREE from 'three'
import type { RebarCage, RebarRole, RebarRun } from '../engine/rebarModel'
import { runPoints, REBAR_ROLE_COLOR } from '../engine/rebarWire'

// ─────────────────────────────────────────────────────────────────────────
// THE REBAR WIREFRAME — the cages, in the 3D scene.
//
// It draws what `cageBuilder` places and nothing else: no geometry is invented
// here, so a bar that looks wrong in this view is wrong on the sheet and wrong
// on the bill too. That is the point of it.
//
// The shape itself comes from `rebarWire`, which is renderer-free — bends are
// rounded to the radius the bar is actually made to, not shown as a mitre no
// bender could produce.
// ─────────────────────────────────────────────────────────────────────────

function RunLine({ run, opacity }: { run: RebarRun; opacity: number }) {
  const obj = useMemo(() => {
    const pts = runPoints(run).map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({
      color: REBAR_ROLE_COLOR[run.role] ?? '#64748b',
      transparent: opacity < 1, opacity,
    })
    return new THREE.Line(geom, mat)
  }, [run, opacity])
  return <primitive object={obj} />
}

export interface RebarWireframeProps {
  cages: RebarCage[]
  /** Roles to draw. Omitted, everything is drawn. */
  roles?: RebarRole[]
  /** Only these members. Omitted, the whole structure. */
  members?: string[]
  opacity?: number
}

/**
 * Every bar in the given cages, as lines.
 *
 * Filtering happens here rather than in the builder so the same placed cages
 * feed the view, the sheets and the take-off — a view that rebuilt its own
 * subset is exactly how the three drifted apart in the first place.
 */
export function RebarWireframe({ cages, roles, members, opacity = 1 }: RebarWireframeProps) {
  const runs = useMemo(() => {
    const roleSet = roles ? new Set(roles) : null
    const memSet = members ? new Set(members) : null
    return cages
      .filter((c) => !memSet || memSet.has(c.member))
      .flatMap((c) => c.runs)
      .filter((r) => !roleSet || roleSet.has(r.role))
  }, [cages, roles, members])
  return <group>{runs.map((r) => <RunLine key={`${r.member}/${r.mark}`} run={r} opacity={opacity} />)}</group>
}
