import { describe, it, expect } from 'vitest'
import type { StructuralModel, RectSection, Member, Node, NodeSupport } from '../engine/model'
import type { F3Result, F3MemberResult, F3Reaction } from '../engine/frame3d'
import type { ModalResult, Mode } from '../engine/modal'
import {
  extractAnalyticalModel,
  extractLoadCases,
  extractEquilibrium,
  extractModal,
  buildAnalysisReport,
} from './analysisReport'

// ── Test fixtures ──────────────────────────────────────────────────────────

const makeNode = (id: string, x: number, y: number, z: number): Node => ({
  id,
  x,
  y,
  z,
})

const makeSection = (id: string, name: string, b = 300, h = 500): RectSection => ({
  id,
  name,
  b,
  h,
  fc: 28,
  fy: 415,
  barDia: 20,
  tieDia: 10,
  cover: 40,
})

const makeMember = (id: string, i: string, j: string, section: string, role = 'beam'): Member => ({
  id,
  i,
  j,
  role: role as any,
  section,
})

const makeSupport = (node: string, fixity: string): NodeSupport => ({
  node,
  fixity: fixity as any,
})

const makeReaction = (node: string): F3Reaction => ({
  node,
  fixity: 'fixed',
  F: [0, 250, 0],
  M: [0, 0, 0],
})

const makeMemberResult = (id: string, L = 5): F3MemberResult => ({
  id,
  L,
  xs: [0, 1.25, 2.5, 3.75, 5],
  N: [-100, -100, -100, -100, -100],
  Vy: [0, 0, 0, 0, 0],
  Vz: [50, 25, 0, -25, -50],
  Mx: [0, 0, 0, 0, 0],
  My: [0, 0, 0, 0, 0],
  Mz: [0, 62.5, 100, 62.5, 0],
  Mmax: 100,
  Vmax: 50,
  Nmax: 100,
})

const makeModalMode = (mode: number, period: number): Mode => ({
  period,
  omega: (2 * Math.PI) / period,
  freq: 1 / period,
  effMass: [100 * Math.random(), 100 * Math.random(), 0],
  effMassRatio: [0.1 * mode, 0.1 * mode, 0],
  shape: { N1: [0.5, 0, 0], N2: [1, 0, 0] },
})

const makeModalResult = (): ModalResult => ({
  modes: [makeModalMode(1, 1.0), makeModalMode(2, 0.5), makeModalMode(3, 0.33)],
  totalMass: [1000, 1000, 0],
  cumRatio: [0.3, 0.3, 0],
})

// ── extractAnalyticalModel tests ───────────────────────────────────────────

describe('extractAnalyticalModel', () => {
  it('extracts nodes with no support', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [makeNode('N1', 0, 0, 0)],
      sections: [],
      members: [],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
    }
    const { nodes } = extractAnalyticalModel(model)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({
      id: 'N1',
      x: 0,
      y: 0,
      z: 0,
    })
  })

  it('extracts nodes with pinned support', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [makeNode('N1', 0, 5, 0)],
      sections: [],
      members: [],
      plates: [],
      supports: [makeSupport('N1', 'pin')],
      loads: [],
      storeys: [],
    }
    const { nodes } = extractAnalyticalModel(model)
    expect(nodes[0].support).toEqual({
      fixity: 'pin',
    })
  })

  it('extracts spring support with stiffnesses', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [makeNode('N1', 0, 0, 0)],
      sections: [],
      members: [],
      plates: [],
      supports: [{ node: 'N1', fixity: 'spring', kx: 1000, ky: 2000, kz: 3000 }],
      loads: [],
      storeys: [],
    }
    const { nodes } = extractAnalyticalModel(model)
    expect(nodes[0].support?.springs).toEqual({
      kx: 1000,
      ky: 2000,
      kz: 3000,
    })
  })

  it('extracts members with correct length', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [makeNode('N1', 0, 0, 0), makeNode('N2', 3, 4, 0)],
      sections: [makeSection('S1', '300×500')],
      members: [makeMember('B1', 'N1', 'N2', 'S1', 'beam')],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
    }
    const { members } = extractAnalyticalModel(model)
    expect(members[0].length).toBeCloseTo(5, 6) // 3-4-5 triangle
  })

  it('extracts member releases', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [makeNode('N1', 0, 0, 0), makeNode('N2', 5, 0, 0)],
      sections: [makeSection('S1', '300×500')],
      members: [
        {
          ...makeMember('B1', 'N1', 'N2', 'S1', 'beam'),
          releases: {
            iEnd: { My: true, Mz: true },
          },
        },
      ],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
    }
    const { members } = extractAnalyticalModel(model)
    expect(members[0].releases).toContain('i-My')
    expect(members[0].releases).toContain('i-Mz')
  })

  it('extracts rigid zone offsets', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [makeNode('N1', 0, 0, 0), makeNode('N2', 5, 0, 0)],
      sections: [makeSection('S1', '300×500')],
      members: [
        {
          ...makeMember('B1', 'N1', 'N2', 'S1', 'beam'),
          offsets: {
            iEnd: [0.1, 0, 0],
            jEnd: [0.1, 0, 0],
          },
        },
      ],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
    }
    const { members } = extractAnalyticalModel(model)
    expect(members[0].rigidzones).toContain('i: [0.10, 0.00, 0.00] m')
    expect(members[0].rigidzones).toContain('j: [0.10, 0.00, 0.00] m')
  })
})

// ── extractLoadCases tests ─────────────────────────────────────────────────

describe('extractLoadCases', () => {
  it('returns standard NSCP load combinations', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [],
      sections: [],
      members: [],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
    }
    const cases = extractLoadCases(model)
    expect(cases.length).toBeGreaterThan(0)
    expect(cases[0].name).toBe('1.4D')
    expect(cases[0].D).toBe(1.4)
  })

  it('includes both gravity and lateral combinations', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [],
      sections: [],
      members: [],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
    }
    const cases = extractLoadCases(model)
    const withW = cases.some((c) => c.W !== undefined)
    const withE = cases.some((c) => c.E !== undefined)
    expect(withW).toBe(true)
    expect(withE).toBe(true)
  })
})

// ── extractEquilibrium tests ───────────────────────────────────────────────

describe('extractEquilibrium', () => {
  it('extracts reactions from frame result', () => {
    const result: F3Result = {
      d: new Float64Array(12),
      reactions: [makeReaction('N1'), makeReaction('N2')],
      members: [makeMemberResult('B1')],
      Mmax: 100,
      Vmax: 50,
      Nmax: 100,
    }
    const eq = extractEquilibrium('1.2D + 1.6L', result)
    expect(eq.loadCase).toBe('1.2D + 1.6L')
    expect(eq.reactions).toHaveLength(2)
    expect(eq.reactions[0]).toMatchObject({
      node: 'N1',
      Fy: 250,
      Fx: 0,
      Fz: 0,
    })
  })

  it('extracts member envelope forces (N, M, V)', () => {
    const result: F3Result = {
      d: new Float64Array(12),
      reactions: [makeReaction('N1')],
      members: [makeMemberResult('B1', 5)],
      Mmax: 100,
      Vmax: 50,
      Nmax: 100,
    }
    const eq = extractEquilibrium('1.2D + 1.6L', result)
    expect(eq.memberForces).toHaveLength(1)
    expect(eq.memberForces[0]).toMatchObject({
      memberId: 'B1',
      Nmax: -100,
      Mzmax: 100,
      Vymax: 0,
      Vzmax: 50,
    })
  })
})

// ── extractModal tests ─────────────────────────────────────────────────────

describe('extractModal', () => {
  it('extracts first N natural modes', () => {
    const modal = makeModalResult()
    const result = extractModal(modal)
    expect(result.modes.length).toBeGreaterThan(0)
    expect(result.modes[0].mode).toBe(1)
    expect(result.modes[0].period).toBeCloseTo(1.0, 6)
  })

  it('accumulates cumulative mass participation', () => {
    const modal = makeModalResult()
    const result = extractModal(modal)
    expect(result.cumRatioX).toBeLessThanOrEqual(1)
    expect(result.cumRatioY).toBeLessThanOrEqual(1)
  })

  it('caps mode count at 12', () => {
    const modes = Array.from({ length: 20 }, (_, i) => makeModalMode(i + 1, 2 / (i + 1)))
    const modal: ModalResult = {
      modes,
      totalMass: [1000, 1000, 0],
      cumRatio: [0.5, 0.5, 0],
    }
    const result = extractModal(modal)
    expect(result.modes).toHaveLength(12)
  })
})

// ── buildAnalysisReport tests ──────────────────────────────────────────────

describe('buildAnalysisReport', () => {
  it('assembles complete analysis report', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test Building',
      nodes: [makeNode('N1', 0, 0, 0), makeNode('N2', 5, 0, 0)],
      sections: [makeSection('S1', '300×500')],
      members: [makeMember('B1', 'N1', 'N2', 'S1', 'beam')],
      plates: [],
      supports: [makeSupport('N1', 'pin'), makeSupport('N2', 'pin')],
      loads: [],
      storeys: [],
      rigidEndZones: true,
      rigidZoneFactor: 0.5,
    }

    const result: F3Result = {
      d: new Float64Array(12),
      reactions: [makeReaction('N1'), makeReaction('N2')],
      members: [makeMemberResult('B1')],
      Mmax: 100,
      Vmax: 50,
      Nmax: 100,
      pDelta: { converged: true, iterations: 3 },
    }

    const modal = makeModalResult()

    const report = buildAnalysisReport(model, result, '1.2D + 1.6L', modal, {
      pDelta: true,
      shearDeformation: false,
      crackedSections: true,
      f1: 1.0,
      seismicSystem: 'gravity',
    })

    expect(report.modelName).toBe('Test Building')
    expect(report.nodes).toHaveLength(2)
    expect(report.members).toHaveLength(1)
    expect(report.equilibrium.loadCase).toBe('1.2D + 1.6L')
    expect(report.modal).toBeDefined()
    expect(report.metadata.pDelta).toBe(true)
    expect(report.metadata.pDeltaConverged).toBe(true)
    expect(report.metadata.crackedSections).toBe(true)
    expect(report.metadata.rigidEndZones).toBe(true)
  })

  it('handles absent modal result', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [makeNode('N1', 0, 0, 0)],
      sections: [makeSection('S1', '300×500')],
      members: [],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
    }

    const result: F3Result = {
      d: new Float64Array(12),
      reactions: [makeReaction('N1')],
      members: [],
      Mmax: 0,
      Vmax: 0,
      Nmax: 0,
    }

    const report = buildAnalysisReport(model, result, 'Gravity', null, {})
    expect(report.modal).toBeUndefined()
  })

  it('includes solver metadata (P-Δ, cracked sections, etc.)', () => {
    const model: StructuralModel = {
      version: 1,
      name: 'Test',
      nodes: [],
      sections: [],
      members: [],
      plates: [],
      supports: [],
      loads: [],
      storeys: [],
      diaphragm: true,
    }

    const result: F3Result = {
      d: new Float64Array(0),
      reactions: [],
      members: [],
      Mmax: 0,
      Vmax: 0,
      Nmax: 0,
    }

    const report = buildAnalysisReport(model, result, 'Test', null, {
      pDelta: true,
      shearDeformation: true,
      crackedSections: true,
      seismicSystem: 'smf',
    })

    expect(report.metadata).toMatchObject({
      pDelta: true,
      shearDeformation: true,
      crackedSections: true,
      seismicSystem: 'smf',
      diaphragm: true,
    })
  })
})
