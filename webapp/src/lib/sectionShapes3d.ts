// Build true-scale THREE.Shape profiles (metres, centred on the member axis) for
// an AISC EffectiveSection, so each member can be extruded into its actual
// cross-section in the 3D view. Double angles are drawn BACK-TO-BACK: the longer
// (connected) legs face each other across the separator/gusset gap, the shorter
// outstanding legs point away.
//
// The outline itself is `engine/steelSection.steelProfile` — the same one the
// section sheet draws — so the model and the drawing set describe one shape.
import * as THREE from 'three'
import type { EffectiveSection } from '../engine/aiscSections'
import { steelProfile } from '../engine/steelSection'

const MM = 1 / 1000

const path = <T extends THREE.Path>(target: T, pts: [number, number][]): T => {
  target.moveTo(pts[0]![0] * MM, pts[0]![1] * MM)
  for (let i = 1; i < pts.length; i++) target.lineTo(pts[i]![0] * MM, pts[i]![1] * MM)
  target.closePath()
  return target
}

/** Profiles for the section, in metres, centred on (0,0). Usually one shape;
 *  a double angle returns two. HSS/Pipe carry an inner hole. */
export function buildSectionShapes(eff: EffectiveSection): THREE.Shape[] {
  return steelProfile(eff).map((p) => {
    const shape = path(new THREE.Shape(), p.outer)
    for (const h of p.holes) shape.holes.push(path(new THREE.Path(), h))
    return shape
  })
}
