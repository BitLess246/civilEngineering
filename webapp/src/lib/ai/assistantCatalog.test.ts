// The assistant may only ever name a calculator that exists in this app.
//
// `ASSISTANT_TOOLS` (supabase/functions/_shared/aiAssistant.ts) is a snapshot
// of `ALL_TOOLS` for the Edge Function, which cannot import the SPA. This
// suite pins the two together: adding, renaming or removing a tool fails here
// until the snapshot follows — so "only the calculators available from the
// webapp" is a CI-enforced property, not a comment.
import { describe, it, expect } from 'vitest'
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/aiAssistant'
import { ALL_TOOLS } from '../tools'

describe('assistant catalog parity', () => {
  it('covers every app tool exactly once, with matching names', () => {
    const app = new Map(ALL_TOOLS.map((t) => [t.to, t]))
    expect(ASSISTANT_TOOLS.length).toBe(ALL_TOOLS.length)
    for (const a of ASSISTANT_TOOLS) {
      const t = app.get(a.route)
      expect(t, `assistant route with no app tool: ${a.route}`).toBeDefined()
      expect(a.name).toBe(t!.name)
      expect(a.sub).toBe(t!.sub)
      expect(a.group).toBe(t!.groupLabel)
    }
  })

  it('has no duplicate routes', () => {
    const routes = ASSISTANT_TOOLS.map((t) => t.route)
    expect(new Set(routes).size).toBe(routes.length)
  })
})
