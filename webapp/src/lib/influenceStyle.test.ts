/**
 * The influence-line formatters, and the page copy they feed.
 *
 * Two things are locked here. The FORMATTERS, because the defect they fix was
 * a hyphen and a minus sign meeting inside one card and inside one chart — the
 * kind of thing that survives review because both halves look right on their
 * own. And the PAGE WORDING, because the pages used to present their opening
 * layout as somebody else's exercise.
 */
import { describe, it, expect } from 'vitest'
import { f2, f3, signed } from './influenceStyle'

const HYPHEN = '-'      // U+002D, what toFixed emits
const MINUS = '−'       // U+2212, what a drawing should show

const TSX = import.meta.glob('../pages/Influence*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

describe('the minus sign', () => {
  it('is typographic, never a hyphen', () => {
    // The bug: `toFixed` gives U+002D while `signed` hand-wrote U+2212, so a
    // card read "IL maximum +2.000 / IL minimum -2.000" and a chart's y axis
    // read "−2.00" against an ordinate reading "-2.000".
    for (const s of [f2(-2), f3(-2), f2(-0.5), f3(-1.333), signed(-2)]) {
      expect(s, `${s} carries a hyphen`).not.toContain(HYPHEN)
      expect(s).toContain(MINUS)
    }
  })

  it('leaves positives and zero alone', () => {
    expect(f2(2)).toBe('2.00')
    // Not a tie value: (1.3335).toFixed(3) is '1.333' in V8, because the
    // binary double for 1.3335 sits just below the tie. My first expectation
    // here was '1.334' and the code was right — the rounding is toFixed's,
    // and this test is about the sign, not about rounding.
    expect(f3(1.3336)).toBe('1.334')
    expect(f3(4 / 3)).toBe('1.333')
    expect(f2(0)).toBe('0.00')
    expect(signed(2)).toBe('+2.00')
  })

  it('does not mangle a negative zero into a bare minus', () => {
    // `(-0).toFixed(2)` is "-0.00" in V8 — a real value the charts hit at the
    // ends of an influence line, where an ordinate is zero from below.
    expect(f2(-0)).toBe('0.00')
    expect(f3(-0)).toBe('0.000')
  })

  it('replaces only the SIGN, not a hyphen inside the digits', () => {
    // There is none to hit in a fixed-point number, which is why a blanket
    // replace is safe here — asserted so a future format change (ranges,
    // exponents) cannot silently rely on it.
    expect(f3(-1.5)).toBe('−1.500')
    expect(f3(-1.5).match(/−/g)).toHaveLength(1)
  })

  it('still reports a non-finite value as an em dash', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(f2(bad)).toBe('—')
      expect(f3(bad)).toBe('—')
    }
    expect(signed(NaN)).toBe('—')
  })
})

describe('the pages do not call their opening layout a sample problem', () => {
  const visible = (src: string) => src
    // strip comments: an assertion about what a page SAYS has to read the
    // strings it renders, not the notes explaining why the wording changed.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

  it('found both modes', () => {
    const names = Object.keys(TSX).map((f) => f.split('/').pop())
    expect(names).toContain('InfluenceBeamMode.tsx')
    expect(names).toContain('InfluenceTrussMode.tsx')
  })

  it('never says "sample" in anything it renders', () => {
    for (const [file, src] of Object.entries(TSX)) {
      expect(visible(src), `${file} still frames its data as a sample`)
        .not.toMatch(/[Ss]ample/)
    }
  })

  it('does not label its results as lettered exam answers', () => {
    // "answers (a)–(d)" made the page read as a worked exercise rather than
    // as the user's own calculation.
    for (const [file, src] of Object.entries(TSX)) {
      expect(visible(src), `${file} carries (a)–(d) answer labels`)
        .not.toMatch(/answers \(a\)|\(a\) |\(b\) |\(c\) |\(d\) /)
    }
  })

  it('reports the governing placement at the SELECTED section, not a fixed one', () => {
    // The card was hard-coded to x = 6 and the letter "C" — right only for
    // the layout the page opened with — and was hidden as soon as an input
    // changed. It follows `effXc` and `secName` now, so it is correct for
    // every layout and never needs hiding.
    const beam = Object.entries(TSX).find(([f]) => f.endsWith('InfluenceBeamMode.tsx'))![1]
    expect(beam).toMatch(/kind: 'moment', x: effXc/)
    expect(beam).toMatch(/kind: 'shear', x: effXc/)
    expect(beam, 'the fixed x = 6 section came back').not.toMatch(/kind: 'moment', x: 6 \}/)
    expect(beam).toMatch(/const secName =/)
  })
})

describe('the drawings keep their annotation readable', () => {
  const truss = Object.entries(TSX).find(([f]) => f.endsWith('InfluenceTrussMode.tsx'))![1]
  const beam = Object.entries(TSX).find(([f]) => f.endsWith('InfluenceBeamMode.tsx'))![1]

  it('cases the truss load arrow against the member it lands on', () => {
    // The load parks on a panel point, which is where a vertical is: at the
    // default (x = 14, L2) the amber shaft and member V2 were one stroke.
    expect(truss).toMatch(/stroke="#ffffff" strokeWidth=\{5\.5\}/)
    expect(truss).toMatch(/paintOrder="stroke"/)
  })

  it('does not put the truss load position in a truncating sub', () => {
    // `Row`'s sub is `w-32 truncate`; "unit load at x = 14.00 m" does not fit
    // 8rem and shipped ellipsised to "…x = 14.00…".
    expect(truss, 'the position is back in the truncating sub')
      .not.toMatch(/sub=\{`unit load at x/)
    expect(truss).toMatch(/IL maximum" value=\{`\+\$\{f3\(ext\.max\)\} kN\/kN at x/)
  })

  // THE EXPRESSION, AND ITS USE — not the identifier.
  //
  // Both of these first read `toMatch(/const atLeft =/)` and `/const onFloor =/`,
  // and both passed a sabotage that replaced the condition with `false`: the
  // declaration survives, so the name is still there and the guard goes quiet
  // while the defect is fully restored. Fourth time this session a guard
  // matched the notation instead of the thing, so it is worth naming again —
  // a file DECLARING a flag is not a file acting on one.

  it('anchors a plot label inward at the frame edges', () => {
    // A centred ordinate label at x = 0 reached past the y axis and printed
    // on the axis scale's own number.
    expect(beam).toMatch(/const atLeft = X\(p\.x\) - padL < \d+/)
    expect(beam).toMatch(/const atRight = W - padR - X\(p\.x\) < \d+/)
    // …and both must actually steer the anchor and the offset.
    expect(beam).toMatch(/atLeft \? 'start' : atRight \? 'end'/)
    expect(beam).toMatch(/atLeft \? 4 : atRight \? -4/)
  })

  it('keeps the deepest ordinate label off the x-axis tick row', () => {
    // Y(−vmax) is the plot floor, so a label 14 below it landed on the tick
    // labels 15 below it — one pixel apart, and they overprinted.
    expect(beam).toMatch(/const onFloor = Y\(p\.v\) > H - padB - \d+/)
    expect(beam).toMatch(/const above = p\.v >= 0 \|\| onFloor/)
    expect(beam).toMatch(/y=\{above \? Y\(p\.v\) - 7 : Y\(p\.v\) \+ 14\}/)
  })

  it('names the patch caption as a length, not a position', () => {
    // "load 3.00 m" under an axis of positions was unreadable as a length.
    expect(beam).toMatch(/patch \{f2\(r\.b - r\.a\)\} m long/)
    expect(beam).not.toMatch(/>load \{f2\(r\.b - r\.a\)\} m</)
  })
})
