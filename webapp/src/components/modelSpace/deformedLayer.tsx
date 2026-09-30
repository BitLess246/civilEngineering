// ─────────────────────────────────────────────────────────────────────────
// DEFORMED SHAPE LAYER — the structure drawn where the analysis says it went,
// coloured by how far.
//
// The geometry is built by a pure, tested module (`lib/deformedContour`) from
// fields that are themselves checked against closed forms and the solver's own
// interior nodes (`engine/deformedShape`); this only hands it to the GPU. Same
// material as the stress contours — a data surface, unlit — so the three read
// in one colour language.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { DeformedGeometry } from '../../lib/deformedContour'
import { contourMaterial } from '../../lib/contourMaterial'

export function DeformedShape3D({ geo, bands }: { geo: DeformedGeometry; bands: number }) {
  const g = useMemo(() => {
    const b = new THREE.BufferGeometry()
    b.setAttribute('position', new THREE.BufferAttribute(geo.position, 3))
    b.setAttribute('aValue', new THREE.BufferAttribute(geo.value, 1))
    b.setIndex(geo.index)
    b.computeVertexNormals()
    return b
  }, [geo])
  useEffect(() => () => { g.dispose() }, [g])
  const mat = useMemo(() => contourMaterial({ signed: geo.domain.signed, bands }), [geo.domain.signed, bands])
  useEffect(() => () => { mat.dispose() }, [mat])
  return <mesh geometry={g} material={mat} renderOrder={2} />
}

/** The undeformed frame as faint lines — the reference a deformation is read
 *  against. Node to node; one draw call. */
export function UndeformedGhost({ segments }: { segments: Float32Array }) {
  const obj = useMemo(() => {
    const b = new THREE.BufferGeometry()
    b.setAttribute('position', new THREE.BufferAttribute(segments, 3))
    return new THREE.LineSegments(b, new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.55 }))
  }, [segments])
  useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose() }, [obj])
  return <primitive object={obj} />
}
