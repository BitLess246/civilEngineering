import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D } from './frame3d'
import type { F3Load } from './frame3d'
import type { RectSection, StructuralModel } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

function topDriftX(m: StructuralModel): { dx: number; struts: number } {
  const br = modelToFrame3D(m)
  const loads: F3Load[] = [{ kind: 'node', node: 'n0.0.1', Fx: 100, cat: 'E' }]
  const sol = solveFrame3D(br.nodes, br.members, br.supports, loads)!
  const idx = br.nodes.findIndex((n) => n.id === 'n0.0.1')
  return { dx: Math.abs(sol.d[6 * idx]), struts: br.members.filter((x) => x.id.startsWith('wallstrut')).length }
}

describe('shear wall lateral stiffness (equivalent diagonal struts)', () => {
  const base = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })

  it('a bare frame has no struts', () => {
    const r = topDriftX(base)
    expect(r.struts).toBe(0)
    expect(r.dx).toBeGreaterThan(0)
  })

  it('tagging a shear wall on a beam injects an X of struts and stiffens the frame', () => {
    const bare = topDriftX(base)
    const withWall: StructuralModel = {
      ...base,
      walls: [{ id: 'w0', member: 'bx0.0.1', height: 3, thickness: 200, shearWall: true }],
    }
    const r = topDriftX(withWall)
    expect(r.struts).toBe(2)                       // bottom-left→top-right + bottom-right→top-left
    expect(r.dx).toBeLessThan(bare.dx * 0.5)       // markedly stiffer in-plane
  })

  it('a non-shear (gravity-only) wall adds no lateral stiffness', () => {
    const bare = topDriftX(base)
    const gravWall: StructuralModel = {
      ...base,
      walls: [{ id: 'w0', member: 'bx0.0.1', height: 3, thickness: 200, shearWall: false }],
    }
    const r = topDriftX(gravWall)
    expect(r.struts).toBe(0)
    expect(r.dx).toBeCloseTo(bare.dx, 9)
  })
})
