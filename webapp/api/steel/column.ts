// POST /api/steel/column — Edge runtime. The engine runs HERE, not in the browser.
import { guard, solve } from '../_lib/respond'
import { localColumn } from '../../src/lib/calcLocal'
import type { ColumnCalcInput } from '../../src/lib/calcApi'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const g = await guard<ColumnCalcInput>(req, process.env as Record<string, string | undefined>)
  if ('error' in g) return g.error
  return solve(localColumn, g.input)
}
