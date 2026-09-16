// ─────────────────────────────────────────────────────────────────────────
// PLATE STRESS CONTOUR — the recovered shell stresses, painted on the mesh
// they came from, in the model.
//
// The engine has recovered these since the shell phase (`recoverShellStress`)
// and `ShellContourPanel` has drawn them — but as ONE flat 2D projection of
// every plate at once. It picks the two axes with the widest spread and drops
// the third, so a three-storey frame stacks its slabs at y = 3, 6 and 9 on top
// of each other, and any wall lands on the same picture edge-on. On a single
// isolated panel that reads fine; on a real model it is a picture of
// everything superimposed.
//
// Here each element is drawn WHERE IT IS. The nodal averaging, the colour ramp
// and the domain are the same ones the 2D panel uses (`lib/stressScale`), so
// an element cannot be amber on the plan and red in the model.
//
// Units: model space in metres; stresses kN/m² (membrane) and kN·m/m (bending).
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ShellNode, ShellElem, ElementStress } from '../../engine/shell'
import { type StressKey } from '../../lib/stressScale'
import { contourData, contourGeometry } from '../../lib/shellContour'
import { contourMaterial } from '../../lib/contourMaterial'

/**
 * The contour mesh.
 *
 * Indexed geometry with one colour per NODE rather than per element: the mesh
 * is conforming, so neighbouring triangles share their nodes and the colour
 * interpolates across the edge. Per-element colouring would draw the same
 * field as a mosaic of flat facets, which reads as a step change in stress at
 * every element boundary — an artefact of the mesh, not of the structure.
 *
 * `meshBasicMaterial` on purpose: this is a data surface, not geometry to be
 * lit. Shading it would multiply the ramp by the lighting and the colour would
 * no longer mean the number it is keyed to.
 */
export function ShellStress3D({ nodes, elems, stresses, contourKey, bands, opacity = 0.95 }: {
  nodes: readonly ShellNode[]
  elems: readonly ShellElem[]
  stresses: readonly ElementStress[]
  contourKey: StressKey
  /** Discrete colour bands; 0 draws the field smooth. */
  bands: number
  opacity?: number
}) {
  const geo = useMemo(() => {
    const { nodal, domain } = contourData(nodes, elems, stresses, contourKey)
    const built = contourGeometry(nodes, elems, nodal, domain)
    if (!built) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(built.position, 3))
    g.setAttribute('aValue', new THREE.BufferAttribute(built.value, 1))
    g.setIndex(built.index)
    g.computeVertexNormals()
    return g
  }, [nodes, elems, stresses, contourKey])

  // The ramp is signed for everything except von Mises; the material needs to
  // know which, and it is the same question `contourData` already answered for
  // the domain, so ask it the same way.
  const signed = useMemo(
    () => contourData(nodes, elems, stresses, contourKey).domain.signed,
    [nodes, elems, stresses, contourKey])
  // DoubleSide (set by the factory): a slab contour has to be readable from
  // underneath, which is where you look at a soffit from. Disposed on replace —
  // a ShaderMaterial is a compiled GPU program.
  const mat = useMemo(() => contourMaterial({ signed, bands, opacity }), [signed, bands, opacity])
  useEffect(() => () => { mat.dispose() }, [mat])

  if (!geo) return null
  return <mesh geometry={geo} material={mat} renderOrder={2} />
}
