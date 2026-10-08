import { describe, it, expect } from 'vitest'
import { solveRightTriangle, inverseUsed, type RightTriangleInput } from './rightTriangle'

/** The 3-4-5 triangle with A = 36.8699°, B = 53.1301°. */
const expect345 = (r: { a: number; b: number; c: number; A: number; B: number }) => {
  expect(r.a).toBeCloseTo(3, 10)
  expect(r.b).toBeCloseTo(4, 10)
  expect(r.c).toBeCloseTo(5, 10)
  expect(r.A).toBeCloseTo(36.86989764584402, 5)
  expect(r.B).toBeCloseTo(53.13010235415598, 5)
}

describe('solveRightTriangle — every known pair', () => {
  it('a-b: two legs close with Pythagoras and arctan', () => {
    expect345(solveRightTriangle({ known: 'a-b', a: 3, b: 4 }))
    // and the mirrored 4-3-5: the angles swap
    const r = solveRightTriangle({ known: 'a-b', a: 4, b: 3 })
    expect(r.A).toBeCloseTo(53.13010235415598, 5)
    expect(r.B).toBeCloseTo(36.86989764584402, 5)
  })

  it('a-c: leg and hypotenuse close with Pythagoras and arcsin', () => {
    expect345(solveRightTriangle({ known: 'a-c', a: 3, c: 5 }))
  })

  it('b-c: the other leg and hypotenuse', () => {
    expect345(solveRightTriangle({ known: 'b-c', b: 4, c: 5 }))
  })

  it('a-A: leg and its opposite angle via sine/tangent', () => {
    expect345(solveRightTriangle({ known: 'a-A', a: 3, A: 36.86989764584402 }))
  })

  it('a-B: leg and the adjacent angle', () => {
    expect345(solveRightTriangle({ known: 'a-B', a: 3, B: 53.13010235415598 }))
  })

  it('b-A: leg b and the adjacent angle', () => {
    expect345(solveRightTriangle({ known: 'b-A', b: 4, A: 36.86989764584402 }))
  })

  it('b-B: leg b and its opposite angle', () => {
    expect345(solveRightTriangle({ known: 'b-B', b: 4, B: 53.13010235415598 }))
  })

  it('c-A: hypotenuse and angle via the forward functions', () => {
    expect345(solveRightTriangle({ known: 'c-A', c: 5, A: 36.86989764584402 }))
  })

  it('c-B: hypotenuse and the other angle', () => {
    expect345(solveRightTriangle({ known: 'c-B', c: 5, B: 53.13010235415598 }))
  })
})

describe('solveRightTriangle — the identities hold on every branch', () => {
  const cases: RightTriangleInput[] = [
    { known: 'a-b', a: 7.5, b: 2.1 },
    { known: 'a-c', a: 7.5, c: 9.03 },
    { known: 'b-c', b: 2.1, c: 9.03 },
    { known: 'a-A', a: 7.5, A: 38.4 },
    { known: 'a-B', a: 7.5, B: 51.6 },
    { known: 'b-A', b: 2.1, A: 38.4 },
    { known: 'b-B', b: 2.1, B: 51.6 },
    { known: 'c-A', c: 9.03, A: 38.4 },
    { known: 'c-B', c: 9.03, B: 51.6 },
  ]
  for (const k of cases) {
    it(`${k.known}: a²+b²=c² and A+B=90`, () => {
      const r = solveRightTriangle(k)
      expect(r.a * r.a + r.b * r.b).toBeCloseTo(r.c * r.c, 6)
      expect(r.A + r.B).toBeCloseTo(90, 9)
      expect(r.A).toBeGreaterThan(0)
      expect(r.B).toBeLessThan(90)
    })
  }
})

describe('solveRightTriangle — refuses what geometry refuses', () => {
  it('a leg may not equal or exceed the hypotenuse', () => {
    expect(() => solveRightTriangle({ known: 'a-c', a: 5, c: 5 })).toThrow(/shorter than the hypotenuse/)
    expect(() => solveRightTriangle({ known: 'a-c', a: 6, c: 5 })).toThrow(/shorter than the hypotenuse/)
    expect(() => solveRightTriangle({ known: 'b-c', b: 6, c: 5 })).toThrow(/shorter than the hypotenuse/)
  })

  it('an angle must sit strictly inside (0, 90) — C owns the right angle', () => {
    expect(() => solveRightTriangle({ known: 'a-A', a: 3, A: 90 })).toThrow(/right angle/)
    expect(() => solveRightTriangle({ known: 'a-A', a: 3, A: 0 })).toThrow(/right angle/)
    expect(() => solveRightTriangle({ known: 'c-B', c: 5, B: 120 })).toThrow(/right angle/)
  })

  it('a side must be positive', () => {
    expect(() => solveRightTriangle({ known: 'a-b', a: 0, b: 4 })).toThrow(/positive/)
    expect(() => solveRightTriangle({ known: 'c-A', c: -5, A: 30 })).toThrow(/positive/)
  })

  it('a blank field is a missing known, not a zero', () => {
    expect(() => solveRightTriangle({ known: 'a-b', a: NaN, b: 4 })).toThrow(/not a number/)
  })
})

describe('inverseUsed — what the worked steps announce', () => {
  it('names the inverse for the side-side pairs', () => {
    expect(inverseUsed('a-b')).toEqual({ target: 'A', fn: 'arctan', from: 'a/b' })
    expect(inverseUsed('a-c')).toEqual({ target: 'A', fn: 'arcsin', from: 'a/c' })
    expect(inverseUsed('b-c')).toEqual({ target: 'B', fn: 'arcsin', from: 'b/c' })
  })

  it('no inverse is needed when the angle was given', () => {
    expect(inverseUsed('c-A').from).toBe('')
    expect(inverseUsed('b-B').from).toBe('')
  })
})
