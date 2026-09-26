// Browser side of the `ai-chat` Edge Function. Thin on purpose: the scope,
// the model allowlist and the system prompt all live server-side — this sends
// messages and a model id, and renders what comes back.
//
// Auth follows `calcToken` in calcApi.ts: a member's access token, or the anon
// key for a guest (a real JWT, public by design). No token means Supabase is
// not configured at all, and the widget says the assistant is off rather than
// showing a 401 nobody can act on.

export interface AssistantChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantAction {
  route: string
  inputs: Record<string, unknown>
  note: string
}

export type AssistantFailure =
  | 'not-configured'
  | 'unauthenticated'
  | 'assistant-off'
  | 'bad-request'
  | 'bad-key'
  | 'failed'

export type AssistantResult =
  | { ok: true; reply: string; actions: AssistantAction[]; model: string }
  | { ok: false; reason: AssistantFailure }

export const AI_CHAT_FUNCTION = 'ai-chat'

/** The slice of supabase-js this module needs — narrow so tests inject a fake. */
export interface FunctionsInvoker {
  functions: {
    // `body` is `Record` rather than `unknown` so the real SupabaseClient
    // stays assignable (its `FunctionInvokeOptions.body` excludes `unknown`).
    invoke: (
      name: string,
      opts: { body: Record<string, unknown>; headers?: Record<string, string> },
    ) => Promise<{ data: unknown; error: unknown }>
  }
}

interface FunctionPayload {
  reply?: unknown
  actions?: unknown
  model?: unknown
  error?: unknown
}

/** What to tell the visitor for each failure. Kept beside the mapping so the two cannot drift. */
export function assistantFailureMessage(reason: AssistantFailure): string {
  switch (reason) {
    case 'not-configured':
      return 'The assistant needs sign-in configured for this deployment first.'
    case 'unauthenticated':
      return 'Please sign in again — your session has expired.'
    case 'assistant-off':
      return 'The assistant is not switched on for this deployment yet (its server key is missing).'
    case 'bad-request':
      return 'That message could not be sent. Try a shorter one.'
    case 'bad-key':
      return 'The assistant could not reach its model service — its server key was rejected. An admin needs to re-check it.'
    case 'failed':
      return 'The assistant could not answer right now. Please try again.'
  }
}

function contextStatus(error: unknown): number | null {
  const ctx = (error as { context?: { status?: unknown } })?.context
  return typeof ctx?.status === 'number' ? ctx.status : null
}

/**
 * The upstream status the function attached to its 502, if any. Read defensively
 * like `reasonFromError` in billing/portal.ts — the context body may already
 * be consumed, in which case there is simply no number to report.
 */
async function upstreamStatus(error: unknown): Promise<number | null> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context
  try {
    const body = (await ctx?.json?.()) as { status?: unknown } | undefined
    return typeof body?.status === 'number' ? body.status : null
  } catch {
    return null
  }
}

export async function chatWithAssistant(
  client: FunctionsInvoker,
  token: string | null,
  req: { model: string; messages: AssistantChatMessage[]; page?: string },
): Promise<AssistantResult> {
  if (!token) return { ok: false, reason: 'not-configured' }
  let data: unknown
  let error: unknown
  try {
    // The token travels explicitly so guests (anon key, no session) are
    // admitted exactly like members — see `calcToken`.
    const res = await client.functions.invoke(AI_CHAT_FUNCTION, {
      body: req,
      headers: { Authorization: `Bearer ${token}` },
    })
    data = res.data
    error = res.error
  } catch {
    return { ok: false, reason: 'failed' }
  }
  if (error) {
    const status = contextStatus(error)
    if (status === 401) return { ok: false, reason: 'unauthenticated' }
    if (status === 400) return { ok: false, reason: 'bad-request' }
    // A 503 is the missing server key; anything else is generic. The function
    // distinguishes them in its body, but the status alone is enough to word
    // the widget correctly without parsing an already-consumed error context.
    if (status === 503) return { ok: false, reason: 'assistant-off' }
    // A 502 carries the upstream status the function saw: 401 means the server key
    // itself was rejected, which is an admin action rather than a retry.
    if (status === 502 && (await upstreamStatus(error)) === 401) {
      return { ok: false, reason: 'bad-key' }
    }
    return { ok: false, reason: 'failed' }
  }
  const payload = (data ?? {}) as FunctionPayload
  if (typeof payload.reply !== 'string' || typeof payload.model !== 'string') {
    return { ok: false, reason: 'failed' }
  }
  const actions = Array.isArray(payload.actions)
    ? (payload.actions as AssistantAction[]).filter(
        (a) => a && typeof a.route === 'string' && typeof a.inputs === 'object' && a.inputs !== null,
      )
    : []
  return { ok: true, reply: payload.reply, actions, model: payload.model }
}

/**
 * The bearer token for an assistant call. Lazily imports the auth client so
 * pages that never open the widget never pay for it.
 */
export async function assistantToken(): Promise<string | null> {
  const { getClient, isAuthConfigured } = await import('../auth/authClient')
  if (!isAuthConfigured()) return null
  const client = getClient()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? null
}
