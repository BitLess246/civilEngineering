import { describe, it, expect } from 'vitest'
import { solveTriangle, type SolvedTriangle, type Triangle } from './triangle'
import { lineText } from '../lib/solution'

const rad = (d: number) => (d * Math.PI) / 180

/** Every solution of every solve must close all three identities. */
const expectCloses = (s: SolvedTriangle) => {
  for (const t of s.solutions) {
    // angle sum
    expect(t.A + t.B + t.C).toBeCloseTo(180, 8)
    // law of sines: one shared ratio
    const ratio = t.a / Math.sin(rad(t.A))
    expect(t.b / Math.sin(rad(t.B))).toBeCloseTo(ratio, 8)
    expect(t.c / Math.sin(rad(t.C))).toBeCloseTo(ratio, 8)
    // law of cosines, each side against ITS OWN opposite angle
    expect(t.a * t.a).toBeCloseTo(t.b * t.b + t.c * t.c - 2 * t.b * t.c * Math.cos(rad(t.A)), 6)
    expect(t.b * t.b).toBeCloseTo(t.c * t.c + t.a * t.a - 2 * t.c * t.a * Math.cos(rad(t.B)), 6)
    expect(t.c * t.c).toBeCloseTo(t.a * t.a + t.b * t.b - 2 * t.a * t.b * Math.cos(rad(t.C)), 6)
  }
}

/** No baked step may print NaN or undefined. */
const expectCleanSteps = (s: SolvedTriangle) => {
  for (const sol of s.solutions) {
    expect(sol.steps.length).toBeGreaterThanOrEqual(3)
    for (const st of sol.steps)
      for (const ln of st.lines) {
        const text = lineText(ln)
        expect(text).not.toMatch(/NaN|undefined/)
      }
  }
}

/** The 3-4-5 triangle with C = 90°, A = 36.8699°, B = 53.1301°. */
const expect345 = (t: Triangle) => {
  expect(t.a).toBeCloseTo(3, 10)
  expect(t.b).toBeCloseTo(4, 10)
  expect(t.c).toBeCloseTo(5, 10)
  expect(t.A).toBeCloseTo(36.86989764584402, 5)
  expect(t.B).toBeCloseTo(53.13010235415598, 5)
  expect(t.C).toBeCloseTo(90, 8)
}

describe('solveTriangle — SSS, three sides', () => {
  it('3-4-5: the right angle falls out of the cosine law, nothing is hardcoded', () => {
    const s = solveTriangle({ a: 3, b: 4, c: 5 })
    expect(s.caseName).toBe('SSS')
    expect(s.ambiguous).toBe(false)
    expect345(s.solutions[0])
    // the longest side c was read first by arccos, the second by arccos, A by the sum
    expect(s.solutions[0].basis.C).toBe('law of cosines')
    expect(s.solutions[0].basis.B).toBe('law of cosines')
    expect(s.solutions[0].basis.A).toBe('angle sum')
    expect(s.solutions[0].basis.a).toBe('given')
  })

  it('an obtuse triangle: 2-3-4 puts 104.48° opposite the longest side', () => {
    const s = solveTriangle({ a: 2, b: 3, c: 4 })
    expectCloses(s)
    expect(s.solutions[0].C).toBeCloseTo(104.47751218592992, 5)
  })

  it('equilateral 2-2-2: every angle 60°', () => {
    const s = solveTriangle({ a: 2, b: 2, c: 2 })
    expectCloses(s)
    expect(s.solutions[0].A).toBeCloseTo(60, 8)
    expect(s.solutions[0].B).toBeCloseTo(60, 8)
    expect(s.solutions[0].C).toBeCloseTo(60, 8)
  })

  it('refuses sides that cannot close', () => {
    expect(() => solveTriangle({ a: 1, b: 2, c: 10 })).toThrow(/cannot close/)
    expect(() => solveTriangle({ a: 2, b: 1, c: 1 })).toThrow(/cannot close/)
  })
})

describe('solveTriangle — SAS, two sides with the included angle', () => {
  it('a=8, b=5, C=60° closes c=7 exactly', () => {
    const s = solveTriangle({ a: 8, b: 5, C: 60 })
    expect(s.caseName).toBe('SAS')
    expect(s.solutions[0].c).toBeCloseTo(7, 8)
    expect(s.solutions[0].A).toBeCloseTo(81.78678929, 4) // arccos(1/7)
    expect(s.solutions[0].B).toBeCloseTo(38.21321071, 4)
    expectCloses(s)
    expectCleanSteps(s)
  })

  it('the right-triangle special case: a=3, b=4, C=90° is the old 3-4-5', () => {
    const s = solveTriangle({ a: 3, b: 4, C: 90 })
    expect345(s.solutions[0])
    expectCloses(s)
    // the steps say so: the cosine law collapses to Pythagoras
    const first = s.solutions[0].steps[0]
    expect(first.lines.some((ln) => 'text' in ln && /Pythagoras/.test(ln.text))).toBe(true)
  })

  it('an obtuse included angle: a=7, b=8, C=120° closes c=13 exactly', () => {
    const s = solveTriangle({ a: 7, b: 8, C: 120 })
    expect(s.solutions[0].c).toBeCloseTo(13, 8)
    expect(s.solutions[0].A).toBeCloseTo(27.7957725, 4)
    expectCloses(s)
    expectCleanSteps(s)
  })

  it('the included angle may sit at any vertex: b=5, c=7, A=60° closes a=√39', () => {
    const s = solveTriangle({ b: 5, c: 7, A: 60 })
    expect(s.solutions[0].a).toBeCloseTo(Math.sqrt(39), 8)
    expectCloses(s)
    expectCleanSteps(s)
  })

  it('the second angle goes to the cosine law even when the sine would be ambiguous', () => {
    // 2-3-4 as SAS: sides 3, 4 with included 104.48° — the angle opposite 4 is obtuse-safe
    const s = solveTriangle({ b: 3, c: 4, C: 104.47751218592992 })
    expect(s.solutions[0].a).toBeCloseTo(2, 6)
    expectCloses(s)
  })
})

describe('solveTriangle — ASA/AAS, a side with two angles', () => {
  it('A=30, B=70, c=10 closes the ASA pair', () => {
    const s = solveTriangle({ A: 30, B: 70, c: 10 })
    expect(s.caseName).toBe('ASA/AAS')
    expect(s.solutions[0].C).toBeCloseTo(80, 8)
    expect(s.solutions[0].a).toBeCloseTo(5.0771331, 5)
    expect(s.solutions[0].b).toBeCloseTo(9.5418889, 5)
    expectCloses(s)
    expectCleanSteps(s)
    expect(s.solutions[0].basis.C).toBe('angle sum')
    expect(s.solutions[0].basis.a).toBe('law of sines')
  })

  it('AAS: the known side may sit opposite one of the known angles', () => {
    const s = solveTriangle({ A: 30, C: 80, a: 5.0771331 })
    expect(s.solutions[0].B).toBeCloseTo(70, 6)
    expect(s.solutions[0].c).toBeCloseTo(10, 4)
    expect(s.solutions[0].b).toBeCloseTo(9.5418889, 4)
    expectCloses(s)
    expectCleanSteps(s)
  })

  it('and opposite the third: B=70, C=80, b=9.5418889', () => {
    const s = solveTriangle({ B: 70, C: 80, b: 9.5418889 })
    expect(s.solutions[0].A).toBeCloseTo(30, 6)
    expect(s.solutions[0].a).toBeCloseTo(5.0771331, 4)
    expectCloses(s)
  })

  it('refuses two angles that already exhaust 180°', () => {
    expect(() => solveTriangle({ A: 100, B: 90, a: 5 })).toThrow(/no triangle can close/)
  })
})

describe('solveTriangle — SSA, two sides with a non-included angle', () => {
  it('unique when the given side is the longer: a=5, b=3, A=40°', () => {
    const s = solveTriangle({ a: 5, b: 3, A: 40 })
    expect(s.caseName).toBe('SSA')
    expect(s.ambiguous).toBe(false)
    expect(s.solutions).toHaveLength(1)
    expect(s.solutions[0].B).toBeCloseTo(22.6855, 3)
    expectCloses(s)
    expectCleanSteps(s)
  })

  it('the ambiguous case: a=5, b=7, A=30° fits TWO triangles, both returned', () => {
    const s = solveTriangle({ a: 5, b: 7, A: 30 })
    expect(s.ambiguous).toBe(true)
    expect(s.solutions).toHaveLength(2)
    // asin(0.7) and its supplement, acute solution first
    expect(s.solutions[0].B).toBeCloseTo(44.4270040008, 5)
    expect(s.solutions[1].B).toBeCloseTo(135.5729959992, 5)
    // B1 + B2 = 180 — the same sine
    expect(s.solutions[0].B + s.solutions[1].B).toBeCloseTo(180, 8)
    expectCloses(s)
    expectCleanSteps(s)
    // the supplement is announced
    expect(s.solutions[1].steps[0].title).toMatch(/supplement/)
    // the bigger angle B2 leaves a smaller C2 and a much shorter c2
    expect(s.solutions[0].C).toBeGreaterThan(s.solutions[1].C)
    expect(s.solutions[0].c).toBeGreaterThan(s.solutions[1].c)
    expect(s.solutions[1].basis.B).toMatch(/supplement/)
  })

  it('the right-triangle limit: a=3, c=5, A=36.8699° lands on exactly one 90° solution', () => {
    const s = solveTriangle({ a: 3, c: 5, A: 36.86989764584402 })
    expect(s.ambiguous).toBe(false)
    expect(s.solutions).toHaveLength(1)
    expect(s.solutions[0].C).toBeCloseTo(90, 6)
    expect(s.solutions[0].B).toBeCloseTo(53.13010235415598, 5)
    expectCloses(s)
  })

  it('refuses a side too short to reach: a=2, b=7, A=30°', () => {
    expect(() => solveTriangle({ a: 2, b: 7, A: 30 })).toThrow(/too short to reach/)
  })

  it('refuses an obtuse known angle whose opposite side is not the longest', () => {
    expect(() => solveTriangle({ a: 5, b: 5.01, A: 100 })).toThrow(/past 180/)
  })

  it('one solution when the known angle is obtuse and its side IS the longest', () => {
    const s = solveTriangle({ a: 8, b: 5, A: 100 })
    expect(s.ambiguous).toBe(false)
    expect(s.solutions).toHaveLength(1)
    expectCloses(s)
  })
})

describe('solveTriangle — refuses what geometry refuses', () => {
  it('three angles fix only the shape', () => {
    expect(() => solveTriangle({ A: 30, B: 60, C: 90 })).toThrow(/side is required/)
  })

  it('exactly three knowns, no more no less', () => {
    expect(() => solveTriangle({ a: 3, b: 4 })).toThrow(/exactly three/)
    expect(() => solveTriangle({ a: 3, b: 4, c: 5, A: 30 })).toThrow(/exactly three/)
  })

  it('sides must be positive, angles strictly inside (0, 180)', () => {
    expect(() => solveTriangle({ a: 0, b: 4, C: 60 })).toThrow(/positive/)
    expect(() => solveTriangle({ a: -3, b: 4, C: 60 })).toThrow(/positive/)
    expect(() => solveTriangle({ a: 3, b: 4, C: 0 })).toThrow(/strictly between/)
    expect(() => solveTriangle({ a: 3, b: 4, C: 180 })).toThrow(/strictly between/)
  })

  it('a blank field is a missing known, not a zero', () => {
    expect(() => solveTriangle({ a: NaN, b: 4, C: 60 })).toThrow(/exactly three/)
  })
})

describe('solveTriangle — the worked steps name the law actually used', () => {
  it('SSS speaks of the cosine law and the arccos', () => {
    const s = solveTriangle({ a: 3, b: 4, c: 5 })
    const joined = s.solutions[0].steps.map((st) => st.title).join(' | ')
    expect(joined).toMatch(/Law of Cosines/)
    expect(s.solutions[0].steps.some((st) => st.lines.some((ln) => 'tex' in ln && ln.tex.includes('\\arccos')))).toBe(true)
  })

  it('SAS opens with the cosine-law side closure', () => {
    const s = solveTriangle({ a: 8, b: 5, C: 60 })
    expect(s.solutions[0].steps[0].title).toMatch(/Law of Cosines/)
    expect(s.solutions[0].steps[0].lines[0]).toHaveProperty('tex')
  })

  it('ASA closes the third angle first, then two sine-law sides', () => {
    const s = solveTriangle({ A: 30, B: 70, c: 10 })
    expect(s.solutions[0].steps[0].title).toMatch(/C closes the sum/)
    expect(s.solutions[0].steps[1].title).toMatch(/Law of Sines/)
    expect(s.solutions[0].steps[2].title).toMatch(/Law of Sines/)
  })

  it('SSA leads with the sine law for the angle opposite the second side', () => {
    const s = solveTriangle({ a: 5, b: 3, A: 40 })
    expect(s.solutions[0].steps[0].title).toMatch(/Law of Sines/)
    expect(s.solutions[0].steps.some((st) => st.lines.some((ln) => 'tex' in ln && ln.tex.includes('\\arcsin')))).toBe(true)
  })
})
