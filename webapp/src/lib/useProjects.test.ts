import { describe, it, expect } from 'vitest'
import { projectByName } from './useProjects'

// The name is a save's identity: saving over an existing name overwrites that
// project, a new name starts a new one. The lookup behind that rule has to be
// exact — trimming is kind, case-folding is how the wrong tower gets clobbered.
const LIST = [
  { id: 'p_old', name: 'Tower A' },
  { id: 'p_two', name: 'Tower B' },
  { id: 'p_two2', name: 'Tower B' },
]

describe('projectByName — which save a name points at', () => {
  it('matches the exact trimmed name', () => {
    expect(projectByName(LIST, 'Tower A')?.id).toBe('p_old')
    expect(projectByName(LIST, '  Tower A  ')?.id).toBe('p_old')
  })
  it('a different case, or a different name, is a NEW project — no match', () => {
    expect(projectByName(LIST, 'tower a')).toBeUndefined()
    expect(projectByName(LIST, 'Tower C')).toBeUndefined()
  })
  it('an empty (or whitespace) name never matches', () => {
    expect(projectByName(LIST, '')).toBeUndefined()
    expect(projectByName(LIST, '   ')).toBeUndefined()
  })
  it('when legacy duplicates exist, the first listing wins deterministically', () => {
    expect(projectByName(LIST, 'Tower B')?.id).toBe('p_two')
  })
})
