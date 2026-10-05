import { describe, it, expect } from 'vitest'
import {
  nearestDraftNode,
  canMergeDraftNodes,
  mergeDraftNodes,
  type DraftLevel,
  type DraftNode,
  type DraftElement,
} from './drafting3d'

const n = (id: string, x: number, y: number, z: number): DraftNode => ({ id, x, y, z })
const el = (id: string, type: DraftElement['type'], nodes: [string, string],
  sectionId = 'beam-300x500', extra: Partial<DraftElement> = {}): DraftElement =>
  ({
    id, type, nodes, sectionId,
    ...(type === 'door' || type === 'window' ? {} : { role: type }),
    ...extra,
  })

/** One storey with four corner joints; callers add more. */
function level(nodes: DraftNode[], elements: DraftElement[] = []): DraftLevel {
  return {
    id: 'L1', name: 'Level 1', elevation: 0, height: 3.5,
    nodes: new Map(nodes.map(nn => [nn.id, nn])),
    elements: new Map(elements.map(e => [e.id, e])),
    grids: { x: [0, 3, 6], y: [0, 3, 6] },
  }
}

describe('nearestDraftNode — the auto-connect target for drawn/dragged ends', () => {
  const nodes = new Map([
    ['a', n('a', 3.02, 2.98, 0)],   // deliberately OFF grid
    ['b', n('b', 6, 6, 0)],
    ['top', n('top', 3.02, 2.98, 3.5)],  // a column-top joint directly above `a`
  ])

  it('finds the nearest joint within tolerance — even off grid', () => {
    expect(nearestDraftNode(nodes, 3.05, 3.0, 0.2)?.id).toBe('a')
  })

  it('returns null when nothing is within tolerance', () => {
    expect(nearestDraftNode(nodes, 4.5, 4.5, 0.2)).toBeNull()
  })

  it('prefers the strictly closer of two candidates', () => {
    expect(nearestDraftNode(nodes, 5.9, 6.05, 0.5)?.id).toBe('b')
  })

  it('never welds to a joint on another storey when z is given', () => {
    // `top` sits exactly at the plan point but one storey up — invisible here
    const hit = nearestDraftNode(nodes, 3.02, 2.98, 0.5, { z: 0, zTolerance: 0.01 })
    expect(hit?.id).toBe('a')
    expect(nearestDraftNode(nodes, 3.02, 2.98, 0.5, { z: 3.5, zTolerance: 0.01 })?.id).toBe('top')
    expect(nearestDraftNode(nodes, 3.02, 2.98, 0.5, { z: 1.75, zTolerance: 0.01 })).toBeNull()
  })

  it('honours the exclude set — a moving selection cannot snap onto itself', () => {
    // same call shape the canvas makes: storey-restricted AND self-excluded
    expect(nearestDraftNode(nodes, 3.02, 2.98, 0.5, { z: 0, zTolerance: 0.01, exclude: new Set(['a']) })).toBeNull()
  })

  it('handles an empty joint map', () => {
    expect(nearestDraftNode(new Map(), 0, 0, 1)).toBeNull()
  })
})

describe('canMergeDraftNodes — the degenerate-geometry guard', () => {
  const L = level(
    [n('a', 0, 0, 0), n('b', 3, 0, 0), n('c', 3, 3, 0), n('d', 0, 3, 0)],
    [el('w1', 'wall', ['a', 'b'], 'wall-200'),
     el('s1', 'slab', ['b', 'c'], 'slab-200', { corners: ['a', 'b', 'c', 'd'] })],
  )

  it('refuses to merge a joint into itself', () => {
    expect(canMergeDraftNodes(L, 'a', 'a')).toBe(false)
  })

  it('refuses when a member references both ends — it would collapse', () => {
    expect(canMergeDraftNodes(L, 'a', 'b')).toBe(false)
  })

  it('refuses when a panel has both as corners — it would lose a corner', () => {
    expect(canMergeDraftNodes(L, 'a', 'c')).toBe(false)
  })

  it('allows unrelated joints — the drag-onto-another-joint case', () => {
    const L2 = level(
      [n('a', 0, 0, 0), n('b', 3, 0, 0), n('t', 3, 3, 0)],
      [el('w1', 'wall', ['a', 'b'], 'wall-200')],
    )
    expect(canMergeDraftNodes(L2, 'a', 't')).toBe(true)
  })

  it('allows merging when only hosted components (no structural ref) touch them', () => {
    const L3 = level(
      [n('a', 0, 0, 0), n('b', 3, 0, 0), n('t', 6, 0, 0)],
      [el('w1', 'wall', ['a', 'b'], 'wall-200'),
       el('d1', 'door', ['a', 'b'], 'wall-200', { hostId: 'w1', at: 1.5, width: 0.9 })],
    )
    expect(canMergeDraftNodes(L3, 'b', 't')).toBe(true)
  })
})

describe('mergeDraftNodes — dropping a joint onto another welds the model', () => {
  it('rewrites member ends and removes the merged joint', () => {
    // two walls meeting NEAR (3,0): b at (3.02,0) dragged onto t at (3,0)
    const L = level(
      [n('a', 0, 0, 0), n('b', 3.02, 0, 0), n('t', 3, 0, 0), n('c', 3, 3, 0)],
      [el('w1', 'wall', ['a', 'b'], 'wall-200'),
       el('w2', 'wall', ['t', 'c'], 'wall-200')],
    )
    const merged = mergeDraftNodes(L, new Map([['b', 't']]))
    expect(merged.nodes.has('b')).toBe(false)
    expect(merged.nodes.has('t')).toBe(true)
    expect(merged.elements.get('w1')!.nodes).toEqual(['a', 't'])
    expect(merged.elements.get('w2')!.nodes).toEqual(['t', 'c'])
  })

  it('rewrites slab corners and hosted components alike', () => {
    const L = level(
      [n('a', 0, 0, 0), n('b', 3.02, 0, 0), n('t', 3, 0, 0), n('c', 3, 3, 0), n('d', 0, 3, 0)],
      [el('s1', 'slab', ['a', 'b'], 'slab-200', { corners: ['a', 'b', 'c', 'd'] }),
       el('w1', 'wall', ['a', 'b'], 'wall-200'),
       el('d1', 'door', ['a', 'b'], 'wall-200', { hostId: 'w1', at: 1.5, width: 0.9 })],
    )
    const merged = mergeDraftNodes(L, new Map([['b', 't']]))
    expect(merged.elements.get('s1')!.corners).toEqual(['a', 't', 'c', 'd'])
    expect(merged.elements.get('d1')!.nodes).toEqual(['a', 't'])
    expect(merged.elements.get('d1')!.hostId).toBe('w1')  // host is an ELEMENT ref — untouched
  })

  it('drops a member that would collapse to zero length', () => {
    const L = level(
      [n('a', 0, 0, 0), n('b', 3, 0, 0), n('t', 3.02, 0, 0)],
      [el('w1', 'wall', ['b', 't'], 'wall-200'),   // b→t is the whole wall
       el('w2', 'wall', ['a', 'b'], 'wall-200')],
    )
    const merged = mergeDraftNodes(L, new Map([['t', 'b']]))
    expect(merged.elements.has('w1')).toBe(false)  // collapsed — dropped
    expect(merged.elements.has('w2')).toBe(true)
    expect(merged.nodes.has('t')).toBe(false)
    expect(merged.nodes.has('a')).toBe(true)
    expect(merged.nodes.has('b')).toBe(true)
  })

  it('drops a panel that would carry duplicate corners', () => {
    const L = level(
      [n('a', 0, 0, 0), n('b', 3, 0, 0), n('c', 3, 3, 0), n('t', 0.02, 3, 0)],
      [el('s1', 'slab', ['a', 'b'], 'slab-200', { corners: ['a', 'b', 'c', 't'] }),
       el('w1', 'wall', ['a', 'b'], 'wall-200')],   // keeps a/b referenced
    )
    const merged = mergeDraftNodes(L, new Map([['t', 'a']]))
    expect(merged.elements.has('s1')).toBe(false)
    // orphan sweep: with the panel gone nothing references c
    expect(merged.nodes.has('c')).toBe(false)
    expect(merged.nodes.has('a')).toBe(true)
  })

  it('does not mutate the input level', () => {
    const L = level(
      [n('a', 0, 0, 0), n('b', 3.02, 0, 0), n('t', 3, 0, 0)],
      [el('w1', 'wall', ['a', 'b'], 'wall-200')],
    )
    const nodesBefore = new Map(L.nodes)
    const elsBefore = new Map(L.elements)
    mergeDraftNodes(L, new Map([['b', 't']]))
    expect(L.nodes).toEqual(nodesBefore)
    expect(L.elements).toEqual(elsBefore)
    expect(L.elements.get('w1')!.nodes).toEqual(['a', 'b'])  // original refs intact
  })

  it('sweeps joints orphaned by the merge', () => {
    const L = level(
      [n('a', 0, 0, 0), n('b', 3.02, 0, 0), n('t', 3, 0, 0), n('lonely', 9, 9, 0)],
      [el('w1', 'wall', ['a', 'b'], 'wall-200')],
    )
    const merged = mergeDraftNodes(L, new Map([['b', 't']]))
    expect(merged.nodes.has('lonely')).toBe(false)  // already unreferenced
    expect(merged.nodes.has('a')).toBe(true)
  })
})
