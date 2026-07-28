import { describe, it, expect } from 'vitest'
import { SOLVER_COVERAGE, SOLVER_TEST_COUNT } from './solverCoverage'
import { SOLVER_MODULES, parseTests } from './solverCoverageParse'

// Test sources read through Vite so the guard needs no node typings, and the
// engine sources so an entry cannot point at a module that does not exist.
const TEST_SRC = import.meta.glob('./*.test.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ENGINE_SRC = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/**
 * `solverCoverage.ts` is generated, so the thing worth testing is that it still
 * matches reality: a solver test added, renamed or deleted without regenerating
 * would otherwise leave the /validation page quietly overstating coverage.
 */
describe('solverCoverage — the published manifest is current', () => {
  it('covers exactly the declared modules, in declaration order', () => {
    expect(SOLVER_COVERAGE.map((m) => m.module)).toEqual(SOLVER_MODULES.map((m) => m.module))
  })

  it('every module re-parses to the same test list', () => {
    for (const mod of SOLVER_COVERAGE) {
      const src = TEST_SRC[`./${mod.module}.test.ts`]
      expect(src, `${mod.module}.test.ts not found`).toBeTruthy()
      expect(parseTests(src), `${mod.module}.test.ts drifted — run: npm run gen:coverage`)
        .toEqual(mod.tests)
    }
  })

  it('the published total matches the listed tests', () => {
    expect(SOLVER_TEST_COUNT).toBe(SOLVER_COVERAGE.reduce((n, m) => n + m.tests.length, 0))
  })

  it('carries the group and title the spec declares', () => {
    for (const spec of SOLVER_MODULES) {
      const got = SOLVER_COVERAGE.find((m) => m.module === spec.module)!
      expect(got.group).toBe(spec.group)
      expect(got.title).toBe(spec.title)
      expect(got.integration).toBe(!!spec.integration)
    }
  })

  it('every listed case names a suite and a case — no blanks reaching the page', () => {
    for (const mod of SOLVER_COVERAGE) {
      expect(mod.tests.length, `${mod.module} parsed to zero tests`).toBeGreaterThan(0)
      for (const t of mod.tests) {
        expect(t.name.trim().length).toBeGreaterThan(0)
        expect(t.suite.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('names no module twice', () => {
    const ids = SOLVER_COVERAGE.map((m) => m.module)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every non-integration entry has a real engine module behind it', () => {
    // integration files (frame3dShell) exercise several solvers together and
    // have no module of their own — they must be FLAGGED, not left silently
    // pointing at a file that does not exist
    for (const mod of SOLVER_COVERAGE) {
      const exists = `./${mod.module}.ts` in ENGINE_SRC
      expect(exists, `${mod.module}: integration=${mod.integration}, module file ${exists ? 'exists' : 'missing'}`)
        .toBe(!mod.integration)
    }
  })

  it('lists as many cases as each file actually declares', () => {
    // Counted a DIFFERENT way from how the names are extracted — a plain tally
    // of `it(` call sites — so a parser that silently dropped or invented a
    // case would disagree here even though the re-parse above matched itself.
    for (const mod of SOLVER_COVERAGE) {
      const src = TEST_SRC[`./${mod.module}.test.ts`]
      const declared = src.split('\n').filter((l) => /^\s*it\(/.test(l)).length
      expect(mod.tests.length, `${mod.module}.test.ts`).toBe(declared)
    }
  })

  it('accounts for every solver test the suite runs — 426 at the time of writing', () => {
    // A floor, not an equality: new solver tests should raise this, and the
    // per-file checks above are what keep the number honest.
    expect(SOLVER_TEST_COUNT).toBeGreaterThanOrEqual(426)
  })
})

describe('solverCoverage — the parser', () => {
  it('reads both quote styles and unescapes the name', () => {
    const src = [
      "describe('outer', () => {",
      "  it('plain case', () => {})",
      '  it("double quoted", () => {})',
      "  it('escaped \\' quote', () => {})",
      '})',
    ].join('\n')
    expect(parseTests(src)).toEqual([
      { suite: 'outer', name: 'plain case' },
      { suite: 'outer', name: 'double quoted' },
      { suite: 'outer', name: "escaped ' quote" },
    ])
  })

  it('attributes each case to the describe block above it', () => {
    const src = [
      "describe('first', () => {", "  it('a', () => {})", '})',
      "describe('second', () => {", "  it('b', () => {})", '})',
    ].join('\n')
    expect(parseTests(src).map((t) => t.suite)).toEqual(['first', 'second'])
  })

  it('ignores `it(` that is not the head of a call', () => {
    const src = [
      "describe('s', () => {",
      "  const s = \"prefix it('in a string')\"",
      "  it('real', () => {})",
      '})',
    ].join('\n')
    const names = parseTests(src).map((t) => t.name)
    expect(names).toEqual(['real'])
  })

  it('returns nothing for a file with no tests, rather than guessing', () => {
    expect(parseTests('export const x = 1\n')).toEqual([])
  })
})
