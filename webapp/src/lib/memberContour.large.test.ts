/**
 * The member contour on a building people actually model.
 *
 * Every other test in `memberContour.test.ts` runs on one to four members,
 * which is how an 8-storey frame could fail outright and nothing notice: the
 * domain spread ~255 000 values into Math.max and overflowed the call stack.
 * This builds that frame through the real solver and asks the whole pipeline —
 * domain, peak, exact mesh, averaged mesh — to finish, and to finish in time.
 */
import { describe, it, expect } from 'vitest'
import { memberContourDomain, memberContourGeometry, memberPeak, type ContourMember } from './memberContour'
import { stressSection } from '../engine/memberStress'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support, type F3Load } from '../engine/frame3d'

/** 4 × 3 bays (6 m × 5 m), 8 storeys: 180 nodes, 408 members. */
function tower(): ContourMember[] {
  const X = [0, 6, 12, 18, 24], Z = [0, 5, 10, 15], Y = [0, 4, 7.5, 11, 14.5, 18, 21.5, 25, 28.5]
  const b = 300, h = 500, E = 25000
  const props = { E, G: E / 2.4, A: b * h, Iz: (b * h ** 3) / 12, Iy: (h * b ** 3) / 12, J: rectJ(b, h) }
  const S = stressSection({ id: 'S', name: '300×500', b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })
  const nodes: F3Node[] = [], mem: F3Member[] = [], sup: F3Support[] = [], loads: F3Load[] = []
  const id = (i: number, j: number, k: number) => `n${i}_${j}_${k}`
  X.forEach((x, i) => Y.forEach((y, j) => Z.forEach((z, k) => {
    nodes.push({ id: id(i, j, k), x, y, z })
    if (j === 0) sup.push({ node: id(i, j, k), fixity: 'fixed' })
  })))
  X.forEach((_, i) => Z.forEach((_, k) => {
    for (let j = 0; j < Y.length - 1; j++) mem.push({ id: `c${i}_${j}_${k}`, i: id(i, j, k), j: id(i, j + 1, k), ...props, rot: 90 } as F3Member)
  }))
  for (let j = 1; j < Y.length; j++) {
    for (let i = 0; i < X.length - 1; i++) Z.forEach((_, k) => {
      const m = `bx${i}_${j}_${k}`
      mem.push({ id: m, i: id(i, j, k), j: id(i + 1, j, k), ...props } as F3Member)
      loads.push({ kind: 'member-udl', member: m, w: 20, cat: 'D' })
    })
    X.forEach((_, i) => { for (let k = 0; k < Z.length - 1; k++) {
      const m = `bz${i}_${j}_${k}`
      mem.push({ id: m, i: id(i, j, k), j: id(i, j, k + 1), ...props } as F3Member)
      loads.push({ kind: 'member-udl', member: m, w: 20, cat: 'D' })
    } })
  }
  const r = solveFrame3D(nodes, mem, sup, loads)
  expect(r, 'the tower must solve').toBeTruthy()
  const at = new Map(nodes.map((n) => [n.id, [n.x, n.y, n.z] as [number, number, number]]))
  const f = new Map(r!.members.map((m) => [m.id, m]))
  return mem.map((m) => ({
    id: m.id, a: at.get(m.i)!, b: at.get(m.j)!, rotDeg: (m as { rot?: number }).rot ?? 0,
    section: S, forces: f.get(m.id)!, drop: 0, ni: m.i, nj: m.j,
  }))
}

describe('an 8-storey, 408-member frame', () => {
  const ms = tower()
  it('is the size the defect needed', () => {
    expect(ms).toHaveLength(408)
  })
  it('builds a domain, a peak, and both meshes without throwing', () => {
    const dom = memberContourDomain(ms, 'sigma')
    expect(Number.isFinite(dom.max) && dom.max > 0).toBe(true)
    expect(memberPeak(ms, 'sigma')).not.toBeNull()
    const exact = memberContourGeometry(ms, 'sigma', dom)!
    const avg = memberContourGeometry(ms, 'sigma', dom, { blendJoints: true })!
    expect(exact.position.length / 3).toBeGreaterThan(200_000)
    expect(avg.position.length).toBeGreaterThan(exact.position.length)
    let lo = Infinity, hi = -Infinity
    for (const v of avg.value) { if (v < lo) lo = v; if (v > hi) hi = v }
    expect(lo).toBeGreaterThanOrEqual(0)
    expect(hi).toBeLessThanOrEqual(1)
  }, 30_000)
  it('does it in interactive time', () => {
    // Measured ~0.6 s for domain + peak + averaged mesh on the dev container;
    // the ceiling is loose on purpose (CI runners vary) but a return to
    // anything super-linear would blow straight through it.
    const t = performance.now()
    const dom = memberContourDomain(ms, 'vonMises')
    memberPeak(ms, 'vonMises')
    memberContourGeometry(ms, 'vonMises', dom, { blendJoints: true })
    expect(performance.now() - t).toBeLessThan(8000)
  }, 30_000)
})
