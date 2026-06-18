// Build true-scale THREE.Shape profiles (metres, centred on the member axis) for
// an AISC EffectiveSection, so each truss member can be extruded into its actual
// cross-section in the 3D view. Double angles are drawn BACK-TO-BACK: the longer
// (connected) legs face each other across the separator/gusset gap, the shorter
// outstanding legs point away.
import * as THREE from 'three'
import type { EffectiveSection } from '../engine/aiscSections'

const poly = (pts: [number, number][]): THREE.Shape => {
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1])
  s.closePath()
  return s
}

/** One L-angle: heel at (hx, -legV/2); `dir` = +1 outstanding leg to the right,
 *  −1 to the left. Vertical (connected) leg of length legV sits at the heel. */
function angleShape(hx: number, dir: 1 | -1, t: number, legH: number, legV: number): THREE.Shape {
  const x0 = hx, top = legV / 2, bot = -legV / 2
  return poly([
    [x0, bot], [x0 + dir * legH, bot], [x0 + dir * legH, bot + t],
    [x0 + dir * t, bot + t], [x0 + dir * t, top], [x0, top],
  ])
}

/** Profiles for the section, in metres, centred on (0,0). Usually one shape;
 *  a double angle returns two. HSS/Pipe carry an inner hole. */
export function buildSectionShapes(eff: EffectiveSection): THREE.Shape[] {
  const s = eff.base, k = 1 / 1000   // mm → m
  if (eff.family === 'W' || eff.family === 'WT') {
    const bf = (s.bf ?? 100) * k, d = (s.d ?? 100) * k, tf = (s.tf ?? 8) * k, tw = (s.tw ?? 6) * k
    const X = bf / 2, Y = d / 2
    if (eff.family === 'WT') {
      return [poly([[-X, Y], [X, Y], [X, Y - tf], [tw / 2, Y - tf], [tw / 2, -Y], [-tw / 2, -Y], [-tw / 2, Y - tf], [-X, Y - tf]])]
    }
    return [poly([
      [-X, Y], [X, Y], [X, Y - tf], [tw / 2, Y - tf], [tw / 2, -(Y - tf)], [X, -(Y - tf)],
      [X, -Y], [-X, -Y], [-X, -(Y - tf)], [-tw / 2, -(Y - tf)], [-tw / 2, Y - tf], [-X, Y - tf],
    ])]
  }
  if (eff.family === 'C') {
    const bf = (s.bf ?? 60) * k, d = (s.d ?? 100) * k, tf = (s.tf ?? 9) * k, tw = (s.tw ?? 8) * k
    const X = bf / 2, Y = d / 2
    return [poly([[-X, Y], [X, Y], [X, Y - tf], [-X + tw, Y - tf], [-X + tw, -(Y - tf)], [X, -(Y - tf)], [X, -Y], [-X, -Y]])]
  }
  if (eff.family === 'L') {
    const legV = Math.max(s.leg1 ?? 50, s.leg2 ?? 50) * k   // longer = connected (vertical)
    const legH = Math.min(s.leg1 ?? 50, s.leg2 ?? 50) * k
    const t = (s.t ?? 8) * k
    if (eff.double) {
      const g = (eff.gap ?? 0) * k
      return [angleShape(-g / 2, -1, t, legH, legV), angleShape(g / 2, 1, t, legH, legV)]
    }
    return [angleShape(-legH / 2, 1, t, legH, legV)]   // single, centred-ish
  }
  if (eff.family === 'HSS') {
    const b = (s.b ?? 100) * k, h = (s.h ?? 100) * k, t = (s.t ?? 6) * k
    const outer = poly([[-b / 2, h / 2], [b / 2, h / 2], [b / 2, -h / 2], [-b / 2, -h / 2]])
    const hole = poly([[-b / 2 + t, h / 2 - t], [b / 2 - t, h / 2 - t], [b / 2 - t, -(h / 2 - t)], [-b / 2 + t, -(h / 2 - t)]])
    outer.holes.push(hole as unknown as THREE.Path)
    return [outer]
  }
  // pipe / round HSS
  const R = ((s.D ?? 100) / 2) * k, t = (s.t ?? 6) * k
  const o = new THREE.Shape(); o.absarc(0, 0, R, 0, Math.PI * 2, false)
  const hole = new THREE.Path(); hole.absarc(0, 0, R - t, 0, Math.PI * 2, true)
  o.holes.push(hole)
  return [o]
}
