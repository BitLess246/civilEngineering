// ─────────────────────────────────────────────────────────────────────────
// CORS — without this, none of the user-facing functions can be called at all.
//
// FOUND THE HARD WAY. `billing-portal`, `billing-change-plan` and
// `billing-history` are called from the browser by `supabase-js`, which sends
// `authorization` and `content-type` headers. That makes the request
// non-simple, so the browser sends an OPTIONS PREFLIGHT FIRST — and every one
// of these functions answered it with `405 method-not-allowed` and no
// `Access-Control-Allow-Origin`, because they only ever expected a POST.
//
// The browser then refuses to send the real request, `functions.invoke` throws
// a network error, and the page shows its generic "could not be completed"
// message. Nothing in the logs, nothing wrong with the auth, nothing wrong with
// Paddle: the call never left the tab. It went unnoticed because none of the
// three could be exercised until an account had a real subscription, which
// happened for the first time today.
//
// `billing-webhook` is deliberately NOT changed. Its caller is Paddle's server,
// which sends no Origin and needs no preflight; adding CORS there would widen
// the one endpoint that authenticates by signature rather than by JWT.
//
// WHY `*` IS THE RIGHT ORIGIN HERE. These endpoints carry no cookies and no
// ambient authority — every one of them requires a bearer token that only the
// signed-in tab holds. A wildcard therefore grants a hostile page nothing it
// could not already do, while an allowlist would have to be kept in step with
// every preview deployment Vercel mints. Should any of these ever start
// accepting cookie auth, this decision has to be revisited in the same commit.
// ─────────────────────────────────────────────────────────────────────────

/** Attached to every response, preflight or not. */
export const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  // `apikey` and `x-client-info` are supabase-js's own; omitting either makes
  // the preflight fail on a header the caller did not choose to send.
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
}

/**
 * The preflight response, or null when this is the real request.
 *
 * Called first in every handler, BEFORE the method check — an OPTIONS request
 * that falls through to `method-not-allowed` is exactly the bug this file
 * exists to fix.
 */
export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  // 204: there is no body, and a preflight must not be cached as a real answer.
  return new Response(null, { status: 204, headers: corsHeaders })
}

/** A JSON response with the CORS headers already on it. */
export const jsonWithCors = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
