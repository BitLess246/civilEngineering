import { describe, it, expect } from 'vitest'
import { createStore, memoryBackend, canSaveNew } from './store'
import { emptyProject, isProject, cleanName, summaryOf, NAME_MAX, type Project } from './model'
import type { StructuralModel } from '../model'

const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()

const withModel = (p: Project, nodes: number, members: number): Project => ({
  ...p,
  model: {
    nodes: Array.from({ length: nodes }, (_, i) => ({ id: `n${i}`, x: i, y: 0, z: 0 })),
    members: Array.from({ length: members }, (_, i) => ({ id: `m${i}`, i: 'n0', j: 'n1', role: 'beam' })),
  } as unknown as StructuralModel,
})

describe('isProject', () => {
  it('accepts a project with no model — that is a real state, not a placeholder', () => {
    // A project can be named and given a client before a grid exists. Refusing
    // to save that means the first thing an engineer does is the one thing
    // they cannot keep.
    expect(isProject(emptyProject('Bridge B', T(0)))).toBe(true)
  })

  it('rejects records missing the fields a listing depends on', () => {
    const good = emptyProject('x', T(0))
    expect(isProject({ ...good, meta: { ...good.meta, name: 42 } })).toBe(false)
    expect(isProject({ ...good, meta: { ...good.meta, updatedAt: undefined } })).toBe(false)
    expect(isProject({ ...good, inputs: [] })).toBe(false)
    expect(isProject({ ...good, model: { nodes: [] } })).toBe(false)
    expect(isProject(null)).toBe(false)
    expect(isProject('a project')).toBe(false)
  })

  it('does not judge the model deeply', () => {
    // Deep validation is meshValidation's job and the solver runs it anyway.
    // Duplicating it here would make a project that fails a NEW rule
    // unopenable rather than openable-and-flagged.
    const dangling = withModel(emptyProject('x', T(0)), 1, 1)
    expect(isProject(dangling)).toBe(true)
  })
})

describe('cleanName', () => {
  it('trims and caps', () => {
    expect(cleanName('  Tower 3  ')).toBe('Tower 3')
    expect(cleanName('x'.repeat(NAME_MAX + 40))).toHaveLength(NAME_MAX)
  })
})

describe('the local store', () => {
  it('round-trips a project', () => {
    const s = createStore(memoryBackend())
    const p = withModel(emptyProject('Tower 3', T(0)), 8, 12)
    s.save('a', p, T(5))
    const back = s.load('a')
    expect(back?.meta.name).toBe('Tower 3')
    expect(back?.model?.members).toHaveLength(12)
  })

  it('stamps updatedAt on every save, and leaves createdAt alone', () => {
    const s = createStore(memoryBackend())
    s.save('a', emptyProject('x', T(0)), T(0))
    const later = s.save('a', s.load('a')!, T(90))
    expect(later.ok).toBe(true)
    expect(later.project.meta.createdAt).toBe(T(0))
    expect(later.project.meta.updatedAt).toBe(T(90))
  })

  it('lists newest first', () => {
    const s = createStore(memoryBackend())
    s.save('old', emptyProject('Old', T(0)), T(0))
    s.save('new', emptyProject('New', T(60)), T(60))
    s.save('mid', emptyProject('Mid', T(30)), T(30))
    expect(s.list().map((r) => r.id)).toEqual(['new', 'mid', 'old'])
  })

  it('survives a corrupt entry rather than losing the whole listing', () => {
    const b = memoryBackend({
      'projects:good': JSON.stringify({ version: 1, project: emptyProject('Fine', T(0)) }),
      'projects:broken': '{not json',
      'projects:wrong-shape': JSON.stringify({ version: 1, project: { meta: {} } }),
    })
    const s = createStore(b)
    expect(s.list().map((r) => r.id)).toEqual(['good'])
    expect(s.count()).toBe(1)
    expect(s.load('broken')).toBeNull()
  })

  it('ignores keys that are not ours', () => {
    const b = memoryBackend({
      'soils:investigation:x': '{}',
      'model-space-autosave': '{}',
      'projects:mine': JSON.stringify({ version: 1, project: emptyProject('Mine', T(0)) }),
    })
    expect(createStore(b).list().map((r) => r.id)).toEqual(['mine'])
  })

  it('removes', () => {
    const s = createStore(memoryBackend())
    s.save('a', emptyProject('x', T(0)), T(0))
    expect(s.exists('a')).toBe(true)
    s.remove('a')
    expect(s.exists('a')).toBe(false)
    expect(s.count()).toBe(0)
  })
})

describe('summaryOf', () => {
  it('counts an absent model as zero rather than omitting the fields', () => {
    const s = summaryOf('a', emptyProject('x', T(0)))
    expect(s.nodeCount).toBe(0)
    expect(s.memberCount).toBe(0)
  })

  it('never yields a blank name — an untitled row is unclickable', () => {
    expect(summaryOf('a', emptyProject('   ', T(0))).name).toBe('Untitled project')
  })
})

describe('canSaveNew', () => {
  it('lets Free keep three and refuses the fourth', () => {
    expect(canSaveNew('free', 2).ok).toBe(true)
    expect(canSaveNew('free', 3).ok).toBe(false)
  })

  it('never blocks re-saving a project that already exists', () => {
    // A Free account at its limit must still be able to keep an edit to a
    // project it already has. Meeting a paywall mid-edit, holding changes you
    // cannot store, is the worst possible moment for it.
    expect(canSaveNew('free', 99, 'existing-id').ok).toBe(true)
    expect(canSaveNew('guest', 99, 'existing-id').ok).toBe(true)
  })

  it('lets the paid tiers save without limit', () => {
    expect(canSaveNew('pro', 5_000).ok).toBe(true)
    expect(canSaveNew('max', 5_000).ok).toBe(true)
  })

  it('names the plan and the numbers in the refusal', () => {
    const v = canSaveNew('free', 3)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.limit).toBe(3)
    expect(v.saved).toBe(3)
    expect(v.message).toContain('Free')
    expect(v.message).toContain('3')
  })

  it('tells a guest to make an account rather than to pay', () => {
    const v = canSaveNew('guest', 0)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.message).toContain('free account')
  })
})
