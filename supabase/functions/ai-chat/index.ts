// ─────────────────────────────────────────────────────────────────────────
// AI-CHAT — the server half of the in-app calculation helper.
//
// The browser posts { model, messages }; this function validates both,
// prepends its OWN system prompt (the client can never widen the scope),
// forwards to OpenRouter's free models, and returns { reply, actions }.
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
  buildAssistantSystemPrompt,
  openCalculatorToolSchema,
  validateAssistantRequest,
  extractAssistantActions,
  type AssistantChatMessage,
  type UpstreamChoice,
} from '../_shared/aiAssistant.ts'

const env = (k: string) => Deno.env.get(k)

/** Referer OpenRouter attributes usage to. Its own rankings page, not an auth boundary. */
const APP_REFERER = 'https://github.com/BitLess246/civilEngineering'
const APP_TITLE = 'civilEngineering calculation helper'

/** The upstream gets this long to answer before the edge gives up. */
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

  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM_CHAT_COMPLETIONS_URL, {
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
        model: parsed.model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: buildAssistantSystemPrompt() }, ...messages],
        tools: [openCalculatorToolSchema()],
        tool_choice: 'auto',
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (e) {
    console.error('ai-chat: upstream unreachable:', e instanceof Error ? e.message : e)
    return jsonWithCors({ error: 'upstream', status: null }, 502)
  }

  if (!upstream.ok) {
    // The STATUS goes back to the browser; the body never does. It is the
    // provider's wording, not ours, and must never carry a hint of the key
    // back — but the bare number is what tells a bad key (401) from denied
    // credit (402) from a limit (429) without dashboard access.
    console.error(`ai-chat: upstream answered ${upstream.status}`)
    return jsonWithCors({ error: 'upstream', status: upstream.status }, 502)
  }

  let payload: { choices?: UpstreamChoice[] } | null
  try {
    payload = (await upstream.json()) as typeof payload
  } catch {
    return jsonWithCors({ error: 'upstream', status: null }, 502)
  }

  const { reply, actions } = extractAssistantActions(payload?.choices?.[0])
  return jsonWithCors({ reply, actions, model: parsed.model })
})
