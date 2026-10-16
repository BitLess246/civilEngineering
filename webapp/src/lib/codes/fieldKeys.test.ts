import { describe, it, expect } from 'vitest'
import { PROVISIONS } from './index'
import { runProvision } from './types'

// The Code Library edits a provision's inputs BY FIELD KEY (`fieldsFromQuery`,
// the input panel) and hands that record to the provision and its diagram. A
// field whose key is not one of the provision's own input keys edits a value
// nothing reads — the class of bug that printed the micropile's A_grout = 0.
describe('every provision field edits an input the provision actually has', () => {
  for (const p of PROVISIONS) {
    it(p.id, () => {
      const keys = Object.keys(p.defaults as object)
      for (const f of p.fields as { key: string }[]) expect(keys, `${p.id}: field "${f.key}"`).toContain(f.key)
      // and the example evaluates from its defaults without a missing input surfacing as NaN
      const ex = runProvision(p)
      for (const [k, v] of Object.entries(ex.values ?? {})) {
        if (typeof v === 'number') expect(Number.isNaN(v), `${p.id}: value "${k}" is NaN`).toBe(false)
      }
      // a variable the reader can click must name something the example has —
      // a computed value or an input — or its highlight reads `undefined`
      const known = new Set([...Object.keys(ex.values ?? {}), ...keys])
      for (const k of Object.keys((p as { variables?: object }).variables ?? {})) {
        expect(known.has(k), `${p.id}: variable "${k}" is neither a value nor an input`).toBe(true)
      }
    })
  }
})
