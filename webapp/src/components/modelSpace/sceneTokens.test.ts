import { describe, it, expect } from 'vitest'
import { memberColor, ROLE_COLOR, SEL } from './sceneTokens'

describe('memberColor — the solid and the skeleton have to agree', () => {
  // This is shared rather than repeated because the wireframe draws the same
  // member as a LINE: a member that is red-tinted as a box has to be
  // red-tinted as a line, or switching to wireframe quietly loses the
  // utilisation reading the analysis just produced.
  it('is the role colour when there is nothing else to say', () => {
    expect(memberColor('beam', false)).toBe(ROLE_COLOR.beam)
    expect(memberColor('column', false)).toBe(ROLE_COLOR.column)
    expect(memberColor('girder', false)).toBe(ROLE_COLOR.girder)
  })

  it('falls back to slate for a role it does not know', () => {
    expect(memberColor('brace', false)).toBe('#64748b')
  })

  it('is the selection colour whatever else is true of the member', () => {
    // Selection is the strongest statement on screen and it has to survive
    // the tint: a highly stressed member that stayed red when clicked is a
    // click that looks like it did nothing.
    expect(memberColor('beam', true)).toBe(SEL)
    expect(memberColor('beam', true, 1)).toBe(SEL)
    expect(memberColor('beam', true, 0.5, 'wood')).toBe(SEL)
  })

  it('moves toward red as the member works harder', () => {
    const none = memberColor('beam', false, 0)
    const some = memberColor('beam', false, 0.5)
    const full = memberColor('beam', false, 1)
    expect(some).not.toBe(none)
    expect(full).toBe('#dc2626')            // all the way to the tint colour
  })

  it('browns a timber member before the tint is applied', () => {
    expect(memberColor('beam', false, 0, 'wood')).not.toBe(ROLE_COLOR.beam)
    expect(memberColor('beam', false, 0, 'steel')).toBe(ROLE_COLOR.beam)
  })

  it('does not mutate the shared role colours', () => {
    // `THREE.Color.lerp` writes in place, so a colour built straight from the
    // ROLE_COLOR table and then lerped would tint every member of that role
    // for the rest of the session, cumulatively.
    const before = ROLE_COLOR.beam
    memberColor('beam', false, 1)
    memberColor('beam', false, 1, 'wood')
    expect(ROLE_COLOR.beam).toBe(before)
    expect(memberColor('beam', false, 0)).toBe(before)
  })
})
