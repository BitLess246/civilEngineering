import { describe, it, expect } from 'vitest'
import { parseMarkdown, parseInline, type Block, type Inline } from './markdown'

/** The readable text of an inline run, with markers for the structure. */
const flat = (ns: Inline[]): string => ns.map((n) =>
  n.t === 'text' ? n.v : n.t === 'br' ? '⏎' : n.t === 'code' ? `‹${n.v}›` : n.t === 'math' ? `⟨${n.v}⟩`
    : n.t === 'link' ? `[a ${n.href}:${flat(n.c)}]` : `[${n.t === 'strong' ? 'b' : 'i'}:${flat(n.c)}]`).join('')

describe('parseInline', () => {
  it('bold, italic, code and nesting', () => {
    expect(flat(parseInline('Use **Beam Design** with *f′c* = `28` MPa'))).toBe('Use [b:Beam Design] with [i:f′c] = ‹28› MPa')
    expect(flat(parseInline('**φMn ≥ *Mu* holds**'))).toBe('[b:φMn ≥ [i:Mu] holds]')
    expect(flat(parseInline('__strong__ and _em_'))).toBe('[b:strong] and [i:em]')
  })

  it('every math delimiter the models use', () => {
    expect(flat(parseInline(String.raw`so \(M_u = 1.2D + 1.6L\) governs`))).toBe('so ⟨M_u = 1.2D + 1.6L⟩ governs')
    expect(flat(parseInline('where $\\phi = 0.9$ for flexure'))).toBe('where ⟨\\phi = 0.9⟩ for flexure')
    expect(flat(parseInline('inline $$a^2$$ too'))).toBe('inline ⟨a^2⟩ too')
  })

  it('leaves money, snake_case, lone asterisks and stray dollars as text', () => {
    expect(flat(parseInline('costs $5 and $10 each'))).toBe('costs $5 and $10 each')
    expect(flat(parseInline('the bar_dia and x_1 fields'))).toBe('the bar_dia and x_1 fields')
    expect(flat(parseInline('2 * 3 * 4 = 24'))).toBe('2 * 3 * 4 = 24')
    expect(flat(parseInline(String.raw`a literal \*star\*`))).toBe('a literal *star*')
  })

  it('keeps only http(s) links as links', () => {
    expect(flat(parseInline('see [ACI](https://www.concrete.org)'))).toBe('see [a https://www.concrete.org:ACI]')
    // a javascript: target never becomes a link — only text comes out
    expect(parseInline('[click](javascript:alert(1))').every((n) => n.t === 'text')).toBe(true)
    expect(parseInline('[x](data:text/html,hi)')).toEqual([{ t: 'text', v: 'x' }])
  })

  it('never produces markup: tags stay literal text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', v: '<img src=x onerror=alert(1)>' }])
  })
})

describe('parseMarkdown — a real reply shape', () => {
  const reply = [
    '### Required steel area',
    '',
    'For a **300 × 500** beam:',
    '1. Compute the effective depth \\(d = h - c - d_b/2\\)',
    '2. Solve for $R_n$',
    '   - then $\\rho$',
    '',
    '$$',
    'A_s = \\rho b d',
    '$$',
    '',
    '| Quantity | Value |',
    '|---|---:|',
    '| d | 440 mm |',
    '| As | **1 120** mm² |',
    '',
    '---',
    '```',
    'As = 1120',
    '```',
    'Open **Beam Design** to run it.',
  ].join('\n')
  const b = parseMarkdown(reply)
  const kinds = (bs: Block[]) => bs.map((x) => x.t)

  it('splits into the right blocks', () => {
    expect(kinds(b)).toEqual(['heading', 'para', 'list', 'math', 'table', 'hr', 'code', 'para'])
  })
  it('heading, list with a nested item, display math', () => {
    expect(b[0]).toMatchObject({ t: 'heading', level: 3 })
    const list = b[2] as Extract<Block, { t: 'list' }>
    expect(list.ordered).toBe(true)
    // the indented bullet is item 2's sub-list — not a third numbered step
    expect(list.items.map((it) => flat(it.c))).toEqual(['Compute the effective depth ⟨d = h - c - d_b/2⟩', 'Solve for ⟨R_n⟩'])
    expect(list.items[1].sub).toMatchObject({ ordered: false })
    expect(list.items[1].sub!.items.map((it) => flat(it.c))).toEqual(['then ⟨\\rho⟩'])
    expect(b[3]).toEqual({ t: 'math', v: 'A_s = \\rho b d' })
  })
  it('table cells parse inline', () => {
    const t = b[4] as Extract<Block, { t: 'table' }>
    expect(t.head.map(flat)).toEqual(['Quantity', 'Value'])
    expect(t.rows.map((r) => r.map(flat))).toEqual([['d', '440 mm'], ['As', '[b:1 120] mm²']])
  })
  it('code is kept verbatim', () => {
    expect(b[6]).toEqual({ t: 'code', v: 'As = 1120' })
  })
  it('single-line \\[ … \\] display math and soft line breaks in a paragraph', () => {
    expect(parseMarkdown('\\[ V_c = 0.17\\sqrt{f_c} b d \\]')).toEqual([{ t: 'math', v: 'V_c = 0.17\\sqrt{f_c} b d' }])
    expect(flat((parseMarkdown('line one\nline two')[0] as Extract<Block, { t: 'para' }>).c)).toBe('line one⏎line two')
  })
  it('a bullet list keeps its numbers and nests two levels deep', () => {
    const [l] = parseMarkdown('- a\n  - a1\n    - a1x\n- b\n\n3. three\n4. four') as Extract<Block, { t: 'list' }>[]
    expect(l.items.map((it) => flat(it.c))).toEqual(['a', 'b'])
    expect(l.items[0].sub!.items[0].sub!.items.map((it) => flat(it.c))).toEqual(['a1x'])
    const ol = parseMarkdown('- a\n\n3. three\n4. four')[1] as Extract<Block, { t: 'list' }>
    expect([ol.ordered, ol.start, ol.items.length]).toEqual([true, 3, 2])
  })
  it('an unclosed $$ stays text instead of swallowing the reply', () => {
    expect(kinds(parseMarkdown('$$ a = b\nand more'))).toEqual(['para'])
  })
})
