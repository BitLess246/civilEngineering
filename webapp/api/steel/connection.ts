// POST /api/steel/connection — Edge runtime. The engine runs HERE, not in the browser.
import { guard, solve } from '../_lib/respond'
import { TRIAL_ROUTE } from '../_lib/routes'
import { localConnection } from '../../src/lib/calcLocal'
import type { ConnectionCalcInput } from '../../src/lib/calcApi'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const g = await guard<ConnectionCalcInput>(req, process.env as Record<string, string | undefined>, TRIAL_ROUTE.connection)
  if ('error' in g) return g.error
  return solve(localConnection, g.input, g.headers)
}
