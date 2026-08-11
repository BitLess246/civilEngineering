// POST /api/steel/beam — Edge runtime. The engine runs HERE, not in the browser.
import { guard, solve } from '../_lib/respond'
import { localBeam } from '../../src/lib/calcLocal'
import type { BeamCalcInput } from '../../src/lib/calcApi'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const g = await guard<BeamCalcInput>(req, process.env as Record<string, string | undefined>)
  if ('error' in g) return g.error
  return solve(localBeam, g.input)
}
