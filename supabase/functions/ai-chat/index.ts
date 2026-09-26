// ─────────────────────────────────────────────────────────────────────────
// AI-CHAT — the server half of the in-app calculation helper.
//
// The browser posts { messages, page? } — NO model; the rotation below picks
// one and the widget never names it. (A client-named allowlisted model is
// still honoured, so the pre-rotation widget keeps working across the deploy
// window.) This function validates the messages, prepends its OWN system
// prompt (the client can never widen the scope), walks the free-model
// rotation until one answers, and returns { reply, actions, model }.
//
// Was OpenCode Zen: Zen's free tier refuses raw API calls (`FreeTierError` —
// usable only from inside OpenCode), so the upstream moved to OpenRouter.
// The model allowlist in `_shared/aiAssistant.ts` is what keeps this
// free-only; the secret below only ever pays for what the allowlist admits.
//
// Deploy normally — JWT verification ON is correct. A guest has no session
// but the SPA sends the anon key, which is a valid JWT (the same arrangement
// `guest-quota` relies on):
//     supabase functions deploy ai-chat
//
// Secrets (supabase secrets set …):
//   OPENROUTER_API_KEY   the OpenRouter key. Server-only: it is read here and
//                        never leaves this function. Missing ⇒ 503
//                        ai-unconfigured and the widget explains the assistant
//                        is off.
//
// What this does NOT do, on purpose:
//   • No paid models — validation refuses anything but the free allowlist
//     before any upstream call.
//   • No trial metering — a question is not a calculator run. Rate limiting is
//     the known open item (audit S5) and is tracked as the Phase-2 follow-up,
//     not pretended at here.
// ─────────────────────────────────────────────────────────────────────────
import { preflight, jsonWithCors } from '../_shared/cors.ts'
import {
  UPSTREAM_CHAT_COMPLETIONS_URL,
  FREE_MODELS,
  buildAssistantSystemPrompt,
  openCalculatorToolSchema,
  validateAssistantRequest,
  extractAssistantActions,
  callWithRotation,
  type AssistantChatMessage,
  type FreeModel,
  type UpstreamCall,
  type UpstreamChoice,
} from '../_shared/aiAssistant.ts'

const env = (k: string) => Deno.env.get(k)

/** Referer OpenRouter attributes usage to. Its own rankings page, not an auth boundary. */
const APP_REFERER = 'https://github.com/BitLess246/civilEngineering'
const APP_TITLE = 'civilEngineering calculation helper'

/** The upstream gets this long to answer before the edge gives up, per attempt. */
const UPSTREAM_TIMEOUT_MS = 30_000
/** Upper bound on the completion so one answer cannot run away. */
const MAX_TOKENS = 1500

Deno.serve(async (req: Request): Promise<Response> => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return jsonWithCors({ error: 'method' }, 405)

  const key = env('OPENROUTER_API_KEY')
  if (!key) {
    console.error('OPENROUTER_API_KEY is not set; refusing to call upstream')
    return jsonWithCors({ error: 'ai-unconfigured' }, 503)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonWithCors({ error: 'body' }, 400)
  }
  const parsed = validateAssistantRequest(body)
  if (!parsed.ok) return jsonWithCors({ error: parsed.error }, 400)

  const messages: AssistantChatMessage[] = parsed.messages
  // The live page snapshot, if the browser sent one: validated text the
  // prompt quotes as the current page. Absent on pages that never opted in.
  const system = buildAssistantSystemPrompt(undefined, parsed.page)
  const tools = [openCalculatorToolSchema()]

  const buildCall = (model: FreeModel, withTools: boolean): UpstreamCall => ({
    url: UPSTREAM_CHAT_COMPLETIONS_URL,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      // OpenRouter attribution headers. Optional for auth, sent so usage
      // shows up under the app rather than as unattributed traffic.
      'HTTP-Referer': APP_REFERER,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(withTools ? { tools, tool_choice: 'auto' as const } : {}),
    }),
  })

  // A client-named model narrows the rotation to itself; otherwise every
  // allowlisted entry is a candidate, most capable first.
  const candidates = parsed.model ? [parsed.model] : [...FREE_MODELS]
  // Rotation skips what cannot fit, so size it on the largest thing sent: the
  // system prompt plus the whole conversation plus the page snapshot.
  const chars =
    system.length + (parsed.page?.length ?? 0) +
    messages.reduce((n, m) => n + m.content.length, 0)

  const res = await callWithRotation(candidates, chars, buildCall, fetch, UPSTREAM_TIMEOUT_MS)
  if (!res.ok) {
    // The STATUS goes back to the browser; the body never does. It is the
    // provider's wording, not ours, and must never carry a hint of the key
    // back — but the bare number is what tells a bad key (401) from denied
    // credit (402) from a limit (429) without dashboard access.
    if (res.status !== null) console.error(`ai-chat: upstream answered ${res.status} (rotation exhausted)`)
    return jsonWithCors({ error: 'upstream', status: res.status }, 502)
  }

  const payload = (res.json ?? {}) as { choices?: UpstreamChoice[] }
  const { reply, actions } = extractAssistantActions(payload.choices?.[0])
  return jsonWithCors({ reply, actions, model: res.model })
})
