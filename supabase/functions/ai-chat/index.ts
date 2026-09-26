// ─────────────────────────────────────────────────────────────────────────
// AI-CHAT — the server half of the in-app calculation helper.
//
// The browser posts { model, messages }; this function validates both,
// prepends its OWN system prompt (the client can never widen the scope),
// forwards to OpenCode Zen's free models, and returns { reply, actions }.
//
// Two Zen protocols behind one function: most free models speak
// /chat/completions, Muse-Spark free speaks /responses. `modelProtocol()`
// picks the endpoint, the tool schema and the parser together, so the two
// wire formats can never be mixed.
//
// Deploy normally — JWT verification ON is correct. A guest has no session
// but the SPA sends the anon key, which is a valid JWT (the same arrangement
// `guest-quota` relies on):
//     supabase functions deploy ai-chat
//
// Secrets (supabase secrets set …):
//   OPENCODE_ZEN_API_KEY   the Zen key. Server-only: it is read here and never
//                          leaves this function. Missing ⇒ 503 ai-unconfigured
//                          and the widget explains the assistant is off.
//
// What this does NOT do, on purpose:
//   • No paid models — `_shared/aiAssistant.ts` allowlists the free models and
//     validation refuses anything else before any upstream call.
//   • No trial metering — a question is not a calculator run. Rate limiting is
//     the known open item (audit S5) and is tracked as the Phase-2 follow-up,
//     not pretended at here.
// ─────────────────────────────────────────────────────────────────────────
import { preflight, jsonWithCors } from '../_shared/cors.ts'
import {
  ZEN_CHAT_COMPLETIONS_URL,
  ZEN_RESPONSES_URL,
  buildAssistantSystemPrompt,
  openCalculatorToolSchema,
  openCalculatorResponsesTool,
  validateAssistantRequest,
  extractAssistantActions,
  extractResponsesActions,
  modelProtocol,
  type AssistantChatMessage,
  type ResponsesPayload,
  type ZenChoice,
} from '../_shared/aiAssistant.ts'

const env = (k: string) => Deno.env.get(k)

/** Zen gets this long to answer before the edge gives up. Free models are small; 30 s covers a cold start. */
const ZEN_TIMEOUT_MS = 30_000
/** Upper bound on the completion so one answer cannot run away. */
const MAX_TOKENS = 1500

async function callZen(
  url: string, key: string, body: unknown,
): Promise<{ ok: true; json: unknown } | { ok: false }> {
  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ZEN_TIMEOUT_MS),
    })
  } catch (e) {
    console.error('ai-chat: zen unreachable:', e instanceof Error ? e.message : e)
    return { ok: false }
  }
  if (!upstream.ok) {
    // Log the status, return none of the body: it is Zen's wording, not ours,
    // and must never carry a hint of the key back to the browser.
    console.error(`ai-chat: zen answered ${upstream.status}`)
    return { ok: false }
  }
  try {
    return { ok: true, json: await upstream.json() }
  } catch {
    return { ok: false }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return jsonWithCors({ error: 'method' }, 405)

  const key = env('OPENCODE_ZEN_API_KEY')
  if (!key) {
    console.error('OPENCODE_ZEN_API_KEY is not set; refusing to call Zen')
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

  const system = buildAssistantSystemPrompt()
  const messages: AssistantChatMessage[] = parsed.messages

  // The protocol follows the model — one branch builds the request, the same
  // branch parses the answer. There is no path that sends a chat body to the
  // responses endpoint or reads one payload with the other's parser.
  if (modelProtocol(parsed.model) === 'responses') {
    const res = await callZen(ZEN_RESPONSES_URL, key, {
      model: parsed.model,
      instructions: system,
      input: messages,
      tools: [openCalculatorResponsesTool()],
      tool_choice: 'auto',
      max_output_tokens: MAX_TOKENS,
    })
    if (!res.ok) return jsonWithCors({ error: 'upstream' }, 502)
    const { reply, actions } = extractResponsesActions((res.json ?? {}) as ResponsesPayload)
    return jsonWithCors({ reply, actions, model: parsed.model })
  }

  const res = await callZen(ZEN_CHAT_COMPLETIONS_URL, key, {
    model: parsed.model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'system', content: system }, ...messages],
    tools: [openCalculatorToolSchema()],
    tool_choice: 'auto',
  })
  if (!res.ok) return jsonWithCors({ error: 'upstream' }, 502)
  const { reply, actions } = extractAssistantActions(
    (res.json as { choices?: ZenChoice[] } | null)?.choices?.[0],
  )
  return jsonWithCors({ reply, actions, model: parsed.model })
})
