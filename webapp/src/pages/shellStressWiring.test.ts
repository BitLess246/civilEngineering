// The shell stress contour reads the ANALYSIS's own solved DOF vector. It only
// can if the page rebuilds the bridge the solver worker used — same options,
// shells included — and only uses it when the result's DOF count matches.
// Gating that bridge on the design-solve switch (which the worker ignores)
// sent every model with the switch off to the isolated slab-only solve: dense,
// minutes on a tower, and a mechanism for any elevated slab. Pinned in source,
// since `/model` cannot be driven in a browser from the test runner.
import { describe, it, expect } from 'vitest'
import page from './ModelSpace.tsx?raw'
// the worker's analyze body lives in `modelAnalysis` (the worker only posts it)
import worker from '../engine/modelAnalysis.ts?raw'
import solverWorker from '../engine/solverWorker.ts?raw'

const memo = (name: string) => {
  const at = page.search(new RegExp(`const ${name} = useMemo[<(]`))
  expect(at, `${name} memo`).toBeGreaterThan(-1)
  return page.slice(at, page.indexOf('\n  }, [', at))
}

describe('shell stresses come from the analysis solve', () => {
  it('the page bridge is built with exactly the worker\'s bridge options', () => {
    const opts = (s: string) => s.match(/modelToFrame3D\([^,]+,\s*(\{[^}]*\})\)/)?.[1].replace(/req\./g, '').replace(/\s+/g, '')
    const w = opts(worker.slice(worker.indexOf('export function runModelAnalysis')))
    const p = opts(memo('anaBridge'))
    expect(w).toBe('{crackedSections:crackedSections,shearDeformation:shearDeformation,beamTopOfSteel:beamTopOfSteel}')
    expect(p).toBe('{crackedSections:cracked,shearDeformation:shearDef,beamTopOfSteel:beamTopSteel}')
    // …and the worker's analyze request really runs that function
    expect(solverWorker.slice(solverWorker.indexOf("msg.kind === 'analyze'"))).toMatch(/^[^]*?runModelAnalysis\(msg, onProgress\)/)
  })

  it('is not gated on the design-solve switch', () => {
    expect(memo('anaBridge')).not.toMatch(/designShells/)
  })

  it('reads the frame solve only when the DOF vector belongs to that bridge', () => {
    expect(memo('shellOut')).toMatch(/dispRes\.d\.length\s*===\s*6\s*\*\s*br\.nodes\.length/)
    expect(memo('shellOut')).toMatch(/recoverShellStress\(br\.nodes,\s*br\.shells,\s*\{\s*d:\s*dispRes\.d\s*\}\)/)
  })
})
