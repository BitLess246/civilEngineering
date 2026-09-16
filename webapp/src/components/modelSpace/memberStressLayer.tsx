// ─────────────────────────────────────────────────────────────────────────
// MEMBER STRESS CONTOUR LAYER — beams and columns painted with the stress the
// analysis already found in them.
//
// The counterpart of `shellStress.tsx` for frame members, and it shares that
// file's two reasons for existing: stress is drawn WHERE THE MEMBER IS rather
// than in a separate panel, and the geometry is built by a pure, tested module
// (`lib/memberContour`) because a WebGL screenshot is not evidence in this repo.
//
// `meshBasicMaterial` on purpose: this is a data surface, not geometry to be
// lit. Shading it would multiply the ramp by the lighting and the colour would
// no longer mean the number it is keyed to.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  memberContourGeometry, type ContourMember, type MemberStressKey,
} from '../../lib/memberContour'
import type { Domain } from '../../lib/stressScale'
import { contourMaterial } from '../../lib/contourMaterial'

export function MemberStress3D({ members, contourKey, domain, bands }: {
  members: readonly ContourMember[]
  contourKey: MemberStressKey
  /** Passed in rather than derived, so the legend beside the picture and the
   *  picture itself cannot be labelled with different numbers. */
  domain: Domain
  /** Discrete colour bands; 0 draws the field smooth. */
  bands: number
}) {
  const geo = useMemo(() => {
    const built = memberContourGeometry(members, contourKey, domain)
    if (!built) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(built.position, 3))
    g.setAttribute('aValue', new THREE.BufferAttribute(built.value, 1))
    g.setIndex(built.index)
    g.computeVertexNormals()
    return g
  }, [members, contourKey, domain])

  // Rebuilt when the ramp or the band count changes, and DISPOSED when it is
  // replaced — a ShaderMaterial is a compiled GPU program, and leaking one per
  // band-count change is a real leak rather than a tidiness point.
  const mat = useMemo(
    () => contourMaterial({ signed: domain.signed, bands }), [domain.signed, bands])
  useEffect(() => () => { mat.dispose() }, [mat])

  if (!geo) return null
  return <mesh geometry={geo} material={mat} renderOrder={2} />
}
