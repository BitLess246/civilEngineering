// Shared plumbing for the calculation endpoints. Edge runtime.

import { authConfig, bearer, identify, type Caller } from './auth'

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Same-origin only. These endpoints are called by this app's own pages;
      // there is no third party to open them to, and the calculation is the
      // product.
      'cache-control': 'no-store',
    },
  })

/**
 * Method check, auth, and body parse, in that order — so an unauthenticated
 * caller never gets a parse error that tells them what the body should look
 * like.
 *
 * Returns either a ready `Response` to send back, or the parsed input.
 */
export async function guard<T>(
  req: Request,
  env: Record<string, string | undefined>,
): Promise<{ error: Response } | { input: T; caller: Caller }> {
  if (req.method === 'OPTIONS') return { error: new Response(null, { status: 204 }) }
  if (req.method !== 'POST') return { error: json({ error: 'method' }, 405) }

  const cfg = authConfig(env)
  if (!cfg) {
    // Deliberately loud. A deployment missing these silently computing for
    // anyone is worse than one that refuses and says why in the logs.
    console.error('calc api: SUPABASE_URL / SUPABASE_ANON_KEY not set')
    return { error: json({ error: 'unconfigured' }, 503) }
  }

  const token = bearer(req.headers.get('authorization'))
  if (!token) return { error: json({ error: 'unauthenticated' }, 401) }
  const caller = await identify(token, cfg)
  if (!caller) return { error: json({ error: 'unauthenticated' }, 401) }

  let input: T
  try { input = (await req.json()) as T } catch { return { error: json({ error: 'body' }, 400) } }
  if (input === null || typeof input !== 'object') return { error: json({ error: 'body' }, 400) }

  return { input, caller }
}

/** Run a solver, turning a throw into a 400 rather than a 500 — bad numbers in
 *  a request are the caller's problem, and the message is the engine's own. */
export function solve<I, R>(fn: (i: I) => R, input: I): Response {
  try {
    return json(fn(input))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'calculation failed'
    return json({ error: message }, 400)
  }
}
