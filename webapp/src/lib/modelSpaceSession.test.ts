import { describe, it, expect, beforeEach } from 'vitest'
import {
  AUTOSAVE_KEY, INPUTS_KEY, DESIGN_KEY,
  readSession, writeSession, readSessionDesign, writeSessionDesign,
  readOpenId, writeOpenId,
} from './modelSpaceSession'
import type { StructureDesign } from '../engine/pipeline'

// The session snapshot is sessionStorage by construction — Model Space's
// autosave must die with the tab. The tests install a Map-backed fake, which
// is enough: the module only ever calls getItem/setItem/removeItem.
const fake = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
}
const storage = fake()
;(globalThis as { sessionStorage?: Storage }).sessionStorage = storage as unknown as Storage

const design = { beams: [], columns: [], ok: true } as unknown as StructureDesign

beforeEach(() => storage.clear())

describe('modelSpaceSession — the design result key', () => {
  it('round-trips a design through its own key', () => {
    expect(readSessionDesign()).toBeNull()
    writeSessionDesign(design)
    expect(readSessionDesign()).not.toBeNull()
    expect(readSessionDesign()!.beams).toEqual([])
    writeSessionDesign(null)
    expect(readSessionDesign()).toBeNull()
  })

  it('a corrupt design entry reads as none, not a crash', () => {
    storage.setItem(DESIGN_KEY, '{not json')
    expect(readSessionDesign()).toBeNull()
    storage.setItem(DESIGN_KEY, '"a string"')
    expect(readSessionDesign()).toBeNull()
  })

  it('writeSession seeds the design from the snapshot when present', () => {
    writeSession({ model: null, inputs: { a: 1 }, design })
    expect(readSessionDesign()).not.toBeNull()
    // null means "clear" — opening a project without results must clear, not keep
    writeSession({ model: null, inputs: {}, design: null })
    expect(readSessionDesign()).toBeNull()
    // absent means "leave whatever is recorded"
    writeSessionDesign(design)
    writeSession({ model: null, inputs: {} })
    expect(readSessionDesign()).not.toBeNull()
  })

  it('readSession still returns the two original keys', () => {
    writeSessionDesign(design)
    const snap = readSession()
    expect(snap.model).toBeNull()
    expect(snap.inputs).toEqual({})
  })

  it('open id round-trips, and clearing removes it', () => {
    expect(readOpenId()).toBeNull()
    writeOpenId('abc')
    expect(readOpenId()).toBe('abc')
    writeOpenId(null)
    expect(readOpenId()).toBeNull()
  })

  it('the keys stay distinct — a model save does not touch the design', () => {
    writeSessionDesign(design)
    writeSession({ model: { nodes: [], members: [] } as never, inputs: {} })
    expect(readSessionDesign()).not.toBeNull()
    expect(globalThis.sessionStorage.getItem(AUTOSAVE_KEY)).not.toBeNull()
    expect(globalThis.sessionStorage.getItem(INPUTS_KEY)).not.toBeNull()
  })
})
