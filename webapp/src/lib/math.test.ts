import { describe, it, expect } from 'vitest'
import { sanitizeTex } from './math'

describe('sanitizeTex — KaTeX-incompatible glyph replacement', () => {
  it('bare ⌀ (math mode) becomes \\varnothing', () => {
    expect(sanitizeTex(String.raw`4~⌀20~\text{mm}`)).toBe(String.raw`4~\varnothing 20~\text{mm}`)
  })

  it('\\text{⌀} is lifted out of text mode (\\varnothing throws there)', () => {
    expect(sanitizeTex(String.raw`8\ \text{⌀}28`)).toBe(String.raw`8\ \varnothing 28`)
  })

  it('§ becomes \\S (valid in both math and text mode)', () => {
    expect(sanitizeTex(String.raw`\text{§407.7}`)).toBe(String.raw`\text{\S 407.7}`)
  })

  it('clean input passes through untouched', () => {
    const tex = String.raw`\phi M_n = 187.3\ \text{kN·m}`
    expect(sanitizeTex(tex)).toBe(tex)
  })
})
