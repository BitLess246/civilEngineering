import { describe, it, expect } from 'vitest'
import {
  optimizeTruss, groupMembers, sizeGroup, candidateSections, rejectionNote,
  SLENDER_LIMIT_COMPRESSION, SLENDER_PREFERENCE_TENSION, type TrussGroup,
} from './trussOptimize'
import { designTrussMember } from './trussDesign'
import { generateTruss, solveTrussEnvelope, type MemberForce } from './truss'
import { shapeByName, effectiveSection } from './aiscSections'

const MAT = { E: 200000, Fy: 248, K: 1.0 }
const f = (id: string, N: number, L: number, kind: MemberForce['kind']): MemberForce =>
  ({ id, N, L, kind, i: 'a', j: 'b' })

describe('grouping', () => {
  const forces = [
    f('t1', -200, 2, 'top'), f('t2', -180, 2, 'top'),
    f('b1', 190, 2, 'bottom'),
    f('d1', 60, 2.8, 'diagonal'),      // tie
    f('d2', -55, 2.8, 'diagonal'),     // strut
    f('v1', 0, 1.5, 'vertical'),       // zero force
  ]

  it("'role' splits chords from webs and webs by sign", () => {
    const g = groupMembers(forces, 'role')
    expect(g.map((x) => x.id)).toEqual(['top', 'bottom', 'web-compression', 'web-tension'])
    expect(g.find((x) => x.id === 'top')!.members).toHaveLength(2)
    expect(g.find((x) => x.id === 'web-tension')!.members.map((m) => m.id)).toEqual(['d1'])
  })

  it('puts a ZERO-FORCE member in the compression group, not the tension one', () => {
    // A member carrying nothing still has to hold its own length. Grouped
    // with the ties, a zero force would select the smallest section made.
    const g = groupMembers(forces, 'role')
    expect(g.find((x) => x.id === 'web-compression')!.members.map((m) => m.id))
      .toEqual(['d2', 'v1'])
  })

  it("'sign' collapses to two groups and 'uniform' to one", () => {
    expect(groupMembers(forces, 'sign').map((x) => x.id)).toEqual(['compression', 'tension'])
    const u = groupMembers(forces, 'uniform')
    expect(u).toHaveLength(1)
    expect(u[0].members).toHaveLength(forces.length)
  })

  it('marks a group as buckling-limited when ANY member is in compression', () => {
    // A chord that flips sign across the envelope still needs a section that
    // can buckle safely at its length.
    const mixed = [f('t1', -100, 2, 'top'), f('t2', 120, 2, 'top')]
    expect(groupMembers(mixed, 'role')[0].compression).toBe(true)
  })

  it('keeps every member — no one is dropped or duplicated', () => {
    for (const mode of ['role', 'sign', 'uniform'] as const) {
      const ids = groupMembers(forces, mode).flatMap((g) => g.members.map((m) => m.id)).sort()
      expect(ids).toEqual(forces.map((m) => m.id).sort())
    }
  })
})

describe('candidateSections', () => {
  it('is sorted lightest first, which is what makes the first survivor optimal', () => {
    const c = candidateSections(['L'])
    for (let i = 1; i < c.length; i++) expect(c[i].A).toBeGreaterThanOrEqual(c[i - 1].A)
  })

  it('adds double angles only when asked, and they weigh twice the single', () => {
    const single = candidateSections(['L'])
    const withDouble = candidateSections(['L'], { doubleAngles: true, gap: 10 })
    expect(withDouble.length).toBe(single.length * 2)
    const d = withDouble.find((s) => s.double)!
    expect(d.A).toBeCloseTo(2 * d.base.A, 6)
  })

  it('is deterministic', () => {
    expect(candidateSections(['HSS']).map((s) => s.label))
      .toEqual(candidateSections(['HSS']).map((s) => s.label))
  })
})

describe('sizeGroup — the gates, in order', () => {
  const group = (members: MemberForce[]): TrussGroup =>
    ({ id: 'g', label: 'g', compression: members.some((m) => m.N <= 0), members })

  it('adopts the lightest section that carries every member', () => {
    const g = group([f('a', 300, 3, 'bottom')])
    const cands = candidateSections(['L'])
    const r = sizeGroup(g, cands, MAT)
    expect(r.ok).toBe(true)
    // Everything rejected before it must be lighter, and must actually fail.
    for (const rej of r.rejected) {
      const c = cands.find((x) => x.label === rej.label)!
      expect(c.A).toBeLessThan(r.section!.A)
    }
    // And the one adopted really does pass.
    const d = designTrussMember(g.members[0], { A: r.section!.A, r: r.section!.rmin, ...MAT })
    expect(d.util).toBeLessThanOrEqual(1)
  })

  it('reports STRENGTH as the reason when a section is simply too small', () => {
    const r = sizeGroup(group([f('a', 900, 3, 'bottom')]), candidateSections(['L']), MAT)
    expect(r.rejected.length).toBeGreaterThan(0)
    expect(r.rejected[0].gate).toBe('strength')
  })

  it('rejects on SLENDERNESS when the member is long and unloaded', () => {
    // 9 m strut carrying almost nothing. Strength is never the problem; the
    // small sections are simply far past KL/r = 200. The gate that fires has
    // to be the slenderness one — reporting "strength" would send someone off
    // to check a force of 1 kN that is perfectly fine.
    const r = sizeGroup(group([f('a', -1, 9, 'vertical')]), candidateSections(['HSS']), MAT)
    expect(r.ok).toBe(true)
    expect(r.maxSlenderness).toBeLessThanOrEqual(SLENDER_LIMIT_COMPRESSION)
    // Slenderness is what is doing the rejecting here — it must be the gate
    // on the last section turned down before the adopted one, not "strength"
    // on a force of 1 kN.
    expect(r.rejected.length).toBeGreaterThan(0)
    expect(r.rejected[r.rejected.length - 1].gate).toBe('slenderness')
    expect(r.rejected.filter((x) => x.gate === 'slenderness').length)
      .toBeGreaterThan(r.rejected.filter((x) => x.gate === 'strength').length)
  })

  it('is sized by the LONGEST compression member, not the largest force', () => {
    // A short member at high force and a long one at low force. Buckling on
    // the long one governs, so the adopted section must satisfy it.
    const g = group([f('short', -400, 1.0, 'diagonal'), f('long', -40, 6.0, 'diagonal')])
    const r = sizeGroup(g, candidateSections(['HSS']), MAT)
    expect(r.ok).toBe(true)
    const long = designTrussMember(g.members[1], { A: r.section!.A, r: r.section!.rmin, ...MAT })
    expect(long.slenderness).toBeLessThanOrEqual(SLENDER_LIMIT_COMPRESSION)
    expect(long.util).toBeLessThanOrEqual(1)
  })

  it('never rescues a failing section for being lighter', () => {
    const g = group([f('a', 900, 3, 'bottom')])
    const r = sizeGroup(g, candidateSections(['L']), MAT)
    if (r.section) {
      for (const rej of r.rejected) {
        expect(candidateSections(['L']).find((x) => x.label === rej.label)!.A)
          .toBeLessThan(r.section.A)
      }
    }
  })

  it('reports failure rather than adopting an inadequate section', () => {
    // Far beyond anything in the angle catalogue.
    const r = sizeGroup(group([f('a', 100000, 3, 'bottom')]), candidateSections(['L']), MAT)
    expect(r.ok).toBe(false)
    expect(r.section).toBeNull()
    expect(r.weightKg).toBe(0)
  })

  it('fails a strut too long for ANY section in the chosen family', () => {
    // KL/r ≤ 200 over 9 m needs r ≥ 45 mm, which no single angle reaches.
    // The optimiser must say so rather than adopting the biggest angle made
    // and quietly leaving a 400-slenderness strut in the drawing.
    const r = sizeGroup(group([f('a', -1, 9, 'vertical')]), candidateSections(['L']), MAT)
    expect(r.ok).toBe(false)
    expect(r.section).toBeNull()
    // The very smallest angles fail STRENGTH first — at KL/r ≈ 900, φPn is
    // under a kilonewton — and everything above them fails on slenderness.
    // Once a candidate is big enough to carry the force, slenderness is the
    // only gate left, so the tail of the list is all slenderness.
    expect(r.rejected[r.rejected.length - 1].gate).toBe('slenderness')
    const firstSlender = r.rejected.findIndex((x) => x.gate === 'slenderness')
    expect(firstSlender).toBeGreaterThanOrEqual(0)
    expect(r.rejected.slice(firstSlender).every((x) => x.gate === 'slenderness')).toBe(true)
    // The same member IS buildable in a family with a larger radius.
    expect(sizeGroup(group([f('a', -1, 9, 'vertical')]), candidateSections(['HSS']), MAT).ok)
      .toBe(true)
  })

  it('weighs the group from its total length and the section area', () => {
    const g = group([f('a', 100, 2, 'bottom'), f('b', 100, 3, 'bottom')])
    const r = sizeGroup(g, candidateSections(['L']), MAT)
    expect(r.lengthM).toBe(5)
    expect(r.weightKg).toBeCloseTo((r.section!.A / 1e6) * 5 * 7850, 6)
  })
})

describe('optimizeTruss on a real solved truss', () => {
  const model = generateTruss({ type: 'pratt', span: 12, height: 2, panels: 6, panelLoad: 20 })
  const nodes = [...new Set(model.loads.map((l) => l.node))]
  const dead = nodes.map((n) => ({ node: n, fx: 0, fy: -8 }))
  const live = nodes.map((n) => ({ node: n, fx: 0, fy: -20 }))
  const env = solveTrussEnvelope(model, dead, live)!
  const r = optimizeTruss(env.forces, 'HSS')

  it('solves and sizes every group', () => {
    expect(env.stable).toBe(true)
    expect(r.ok).toBe(true)
    for (const g of r.groups) expect(g.section).not.toBeNull()
  })

  it('covers every member exactly once', () => {
    expect(r.members.map((m) => m.id).sort()).toEqual(env.forces.map((m) => m.id).sort())
  })

  it('every member passes under the section its group adopted', () => {
    for (const m of r.members) {
      expect(m.ok, `${m.id} (${m.group}) util ${m.util.toFixed(2)}`).toBe(true)
    }
  })

  it('gives the tension chord a LIGHTER section than the compression chord', () => {
    // The whole point: a bottom chord limited by Fy·Ag does not need the area
    // a buckling-limited top chord of the same length does.
    const top = r.groups.find((g) => g.group.id === 'top')!
    const bot = r.groups.find((g) => g.group.id === 'bottom')!
    expect(bot.section!.A).toBeLessThan(top.section!.A)
  })

  it('weighs less than one section for the whole truss', () => {
    expect(r.uniformWeightKg).not.toBeNull()
    expect(r.totalWeightKg).toBeLessThan(r.uniformWeightKg!)
    expect(r.savedFraction).toBeGreaterThan(0)
    expect(r.savedFraction).toBeLessThan(1)
  })

  it('a finer grouping is never heavier than a coarser one', () => {
    // More groups can only ever relax a constraint, so weight is monotone.
    const role = optimizeTruss(env.forces, 'HSS', { grouping: 'role' })
    const sign = optimizeTruss(env.forces, 'HSS', { grouping: 'sign' })
    const uni = optimizeTruss(env.forces, 'HSS', { grouping: 'uniform' })
    expect(role.totalWeightKg).toBeLessThanOrEqual(sign.totalWeightKg + 1e-6)
    expect(sign.totalWeightKg).toBeLessThanOrEqual(uni.totalWeightKg + 1e-6)
  })

  it('drives utilisation UP — that is what optimising means', () => {
    // A hand-picked section that passes everything comfortably wastes steel.
    // The optimiser should land near the limit, not far below it.
    const best = Math.max(...r.groups.map((g) => g.maxUtil))
    expect(best).toBeGreaterThan(0.5)
    expect(best).toBeLessThanOrEqual(1)
  })

  it('searching more families is never worse than searching one', () => {
    const one = optimizeTruss(env.forces, 'HSS')
    const many = optimizeTruss(env.forces, 'HSS', { families: ['HSS', 'PIPE', 'W'] })
    expect(many.totalWeightKg).toBeLessThanOrEqual(one.totalWeightKg + 1e-6)
  })

  it('is deterministic', () => {
    const a = optimizeTruss(env.forces, 'HSS')
    const b = optimizeTruss(env.forces, 'HSS')
    expect(a.groups.map((g) => g.section?.label)).toEqual(b.groups.map((g) => g.section?.label))
  })

  it('the reported weight matches the sections it actually chose', () => {
    const sum = r.groups.reduce((s, g) => s + (g.section!.A / 1e6) * g.lengthM * 7850, 0)
    expect(r.totalWeightKg).toBeCloseTo(sum, 6)
  })
})

describe('a known section, checked by hand', () => {
  it('reproduces φPn for a tension member — 0.90·Fy·Ag', () => {
    const sec = effectiveSection(shapeByName('L64x64x6.4')!)
    const d = designTrussMember(f('a', 100, 2, 'bottom'), { A: sec.A, r: sec.rmin, ...MAT })
    expect(d.phiPn).toBeCloseTo((0.9 * 248 * sec.A) / 1000, 6)
  })

  it('rejectionNote names the section and the gate', () => {
    expect(rejectionNote('L50x50x5', 'strength')).toContain('L50x50x5')
    expect(rejectionNote('L50x50x5', 'slenderness')).toContain('200')
  })
})

describe('§D1 tension slenderness is REPORTED, never enforced', () => {
  const group = (members: MemberForce[]): TrussGroup =>
    ({ id: 'g', label: 'g', compression: false, members })

  it('flags a tension group past L/r = 300 but still adopts the section', () => {
    // A long, lightly loaded tie is strong in the smallest angle made and far
    // past 300. §D1 calls 300 a preference — about sag, vibration and handling
    // damage, not strength — so the optimiser must adopt the section and say
    // so, rather than silently buying steel the code does not require.
    const r = sizeGroup(group([f('tie', 20, 6, 'diagonal')]), candidateSections(['L']), MAT)
    expect(r.ok).toBe(true)
    expect(r.section).not.toBeNull()
    expect(r.maxTensionSlenderness).toBeGreaterThan(SLENDER_PREFERENCE_TENSION)
    expect(r.tensionSlendernessOK).toBe(false)
  })

  it('is satisfied by a short tie', () => {
    const r = sizeGroup(group([f('tie', 200, 1.0, 'bottom')]), candidateSections(['L']), MAT)
    expect(r.tensionSlendernessOK).toBe(true)
    expect(r.maxTensionSlenderness).toBeLessThanOrEqual(SLENDER_PREFERENCE_TENSION)
  })

  it('ignores compression members — they have their own §E2 limit', () => {
    // A compression-only group reports zero tension slenderness rather than
    // borrowing the compression figure and flagging a preference that does
    // not apply to it.
    const r = sizeGroup(
      { id: 'g', label: 'g', compression: true, members: [f('s', -50, 2, 'diagonal')] },
      candidateSections(['L']), MAT,
    )
    expect(r.maxTensionSlenderness).toBe(0)
    expect(r.tensionSlendernessOK).toBe(true)
  })
})
