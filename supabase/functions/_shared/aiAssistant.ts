// ─────────────────────────────────────────────────────────────────────────
// AI ASSISTANT — pure shared logic (vitest + the `ai-chat` Edge Function).
//
// Plain TypeScript, no Deno / Node / browser APIs: the same file runs in the
// Supabase function and in CI. Everything that decides SCOPE lives here —
// the free-model allowlist, the server-built system prompt, and the
// `open_calculator` tool schema — so neither the browser nor a hand-written
// request can widen what the assistant answers or which models it may use.
//
// Upstream is OpenRouter (OpenAI-compatible /chat/completions), free models
// only. Was OpenCode Zen: Zen's free tier refuses raw API calls
// (`FreeTierError` — usable only from inside OpenCode), so the proxy moved.
// The allowlist below is the enforcement; extend it ONLY with a verified-free
// id (0/0 pricing on /api/v1/models) that lists `tools` in
// `supported_parameters`, plus a test row.
// The key never reaches the browser. The function reads it from its
// own secrets (`supabase secrets set OPENROUTER_API_KEY=…`).
// ─────────────────────────────────────────────────────────────────────────

/** OpenRouter's OpenAI-compatible chat endpoint — the only upstream this proxy talks to. */
export const UPSTREAM_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * Free models ONLY. Anything not on this list is refused with `model` before
 * any upstream call is made, so a paid model id can never ride this key.
 */
export const FREE_CHAT_MODELS = [
  'stealth/space-bunny-alpha',
] as const

export type FreeChatModel = (typeof FREE_CHAT_MODELS)[number]
export type FreeModel = FreeChatModel

/** Every model the widget may offer. */
export const FREE_MODELS: readonly FreeModel[] = [...FREE_CHAT_MODELS]

export const DEFAULT_FREE_MODEL: FreeChatModel = 'stealth/space-bunny-alpha'

export const isFreeModel = (m: unknown): m is FreeModel =>
  typeof m === 'string' && (FREE_CHAT_MODELS as readonly string[]).includes(m)

/** A calculator the assistant may reference or open. Mirrors `ALL_TOOLS`. */
export interface AssistantToolRef {
  route: string
  name: string
  sub: string
  group: string
}

/**
 * Snapshot of the app's tool catalog (`src/lib/tools.ts` → `ALL_TOOLS`).
 *
 * Duplicated here because the Edge Function cannot import the SPA, and pinned
 * by `assistantCatalog.test.ts`: any route added, renamed or removed there
 * fails the suite until this list follows. That test is the "only calculators
 * available from the webapp" guarantee — the model can only ever name a route
 * from this list, and `extractAssistantActions` drops anything else.
 */
export const ASSISTANT_TOOLS: readonly AssistantToolRef[] = [
  { route: '/beam-design', name: 'Beam Design', sub: 'RC beam · ACI 318-14', group: 'Concrete' },
  { route: '/tbeam-design', name: 'T-Beam Design', sub: 'flanged beam · §6.3.2', group: 'Concrete' },
  { route: '/prestressed-beam', name: 'Prestressed Beam', sub: 'PCI losses · §24.5 · fps', group: 'Concrete' },
  { route: '/column-design', name: 'Column Design', sub: 'RC column · biaxial', group: 'Concrete' },
  { route: '/slab-design', name: 'Slab Design', sub: 'Two-way DDM · ACI 318', group: 'Concrete' },
  { route: '/stair', name: 'Stair Design', sub: 'RC waist slab · NSCP', group: 'Concrete' },
  { route: '/lintel', name: 'Lintel Beam', sub: 'opening · masonry arching', group: 'Concrete' },
  { route: '/water-tank', name: 'Water Tank', sub: 'Circular · IS 3370/ACI 350', group: 'Concrete' },
  { route: '/torsion', name: 'Torsion Design', sub: 'RC torsion · ACI 318-14', group: 'Concrete' },
  { route: '/dev-length', name: 'Dev & Splice', sub: 'ACI 318-14 §25.4–25.5', group: 'Concrete' },
  { route: '/punching-shear', name: 'Punching Shear', sub: 'Two-way §22.6 · ACI 318', group: 'Concrete' },
  { route: '/model', name: '3D Model Space', sub: 'BIM-lite viewer', group: 'Analysis' },
  { route: '/frame', name: 'Frame Analysis', sub: '2D stiffness method', group: 'Analysis' },
  { route: '/beam-analysis', name: 'Beam Analysis', sub: 'FEM multi-span', group: 'Analysis' },
  { route: '/truss', name: 'Truss Space', sub: 'Plane truss solver', group: 'Analysis' },
  { route: '/load-path', name: 'Slab Load Path', sub: 'Two-way tributary', group: 'Analysis' },
  { route: '/influence-lines', name: 'Influence Lines', sub: 'Truss & beam · moving load', group: 'Analysis' },
  { route: '/steel/beam', name: 'Steel Beam', sub: 'AISC §F2–F3 / §G2.1', group: 'Steel' },
  { route: '/steel/column', name: 'Steel Column', sub: 'AISC §E3 / §H1-1', group: 'Steel' },
  { route: '/bolted-connection', name: 'Bolted Connection', sub: 'Eccentric bolt group', group: 'Steel' },
  { route: '/welded-connection', name: 'Welded Connection', sub: 'Eccentric weld group', group: 'Steel' },
  { route: '/foundation', name: 'Foundation Design', sub: 'Isolated pad footing', group: 'Foundations' },
  { route: '/pile-cap', name: 'Pile Cap Design', sub: 'Group pile cap', group: 'Foundations' },
  { route: '/combined', name: 'Combined Footing', sub: 'Two-column footing', group: 'Foundations' },
  { route: '/retaining-wall', name: 'Retaining Wall', sub: 'Cantilever · Rankine', group: 'Geotechnical' },
  { route: '/earth-pressure', name: 'Earth Pressure', sub: 'Rankine · Coulomb · M-O', group: 'Geotechnical' },
  { route: '/bearing-capacity', name: 'Bearing Capacity', sub: 'Meyerhof · Hansen · Vesić', group: 'Geotechnical' },
  { route: '/soil-nail', name: 'Soil-Nail Wall', sub: 'FHWA · tensile · pullout', group: 'Geotechnical' },
  { route: '/micropile', name: 'Micropile', sub: 'FHWA · structural · bond', group: 'Geotechnical' },
  { route: '/rock-anchor', name: 'Rock Anchor', sub: 'PTI · tendon · bond', group: 'Geotechnical' },
  { route: '/shotcrete-facing', name: 'Shotcrete Facing', sub: 'FHWA · flexure · punching', group: 'Geotechnical' },
  { route: '/slope', name: 'Slope Stability', sub: 'Slices · Bishop/Fellenius/Janbu', group: 'Geotechnical' },
  { route: '/settlement', name: 'Settlement', sub: 'Boussinesq · Terzaghi · Schmertmann', group: 'Geotechnical' },
  { route: '/lateral-pile', name: 'Lateral Pile', sub: 'Broms · p-y (Matlock/API)', group: 'Geotechnical' },
  { route: '/soils', name: 'Soil Investigation', sub: 'Boreholes · SPT · USCS', group: 'Geotechnical' },
  { route: '/seismic-wizard', name: 'Seismic Wizard', sub: 'NSCP 208 Ca/Cv/I/R', group: 'Seismic & Loads' },
  { route: '/load-combinations', name: 'Load Combinations', sub: 'NSCP 2015 §203.3 LRFD', group: 'Seismic & Loads' },
  { route: '/wood-slab', name: 'Wood Slab', sub: 'Deck-on-joist · NDS §3 / NSCP §6', group: 'Timber' },
  { route: '/plumbing', name: 'Plumbing Design', sub: 'Water · DWV · septic · RNPCP', group: 'Plumbing & Sanitary' },
  { route: '/schedule', name: 'Project Schedule', sub: 'CPM · PERT · progress', group: 'Planning' },
  { route: '/schedule/gantt', name: 'Gantt Chart', sub: 'Timeline · baseline', group: 'Planning' },
  { route: '/schedule/network', name: 'Network Diagram', sub: 'AON · critical path', group: 'Planning' },
  { route: '/schedule/dashboard', name: 'Dashboard', sub: 'Progress · EVM · SPI/CPI', group: 'Planning' },
  { route: '/schedule/resources', name: 'Resource Loading', sub: 'Histogram · over-allocation', group: 'Planning' },
  { route: '/schedule/reports', name: 'Reports', sub: 'PDF · Excel · CSV', group: 'Planning' },
  { route: '/schedule/daily', name: 'Daily & Delays', sub: 'Actuals · baseline · delay', group: 'Planning' },
  { route: '/estimate/slab', name: 'Slab', sub: 'Concrete + rebar', group: 'Estimates' },
  { route: '/estimate/beam', name: 'Beam', sub: 'Volume & weight', group: 'Estimates' },
  { route: '/estimate/column', name: 'Column', sub: 'Concrete + rebar', group: 'Estimates' },
  { route: '/estimate/chb', name: 'CHB Wall', sub: 'Block count', group: 'Estimates' },
  { route: '/estimate/box-culvert', name: 'Box Culvert', sub: 'Culvert estimate', group: 'Estimates' },
  { route: '/docs', name: 'Documentation', sub: 'Toolkit guide', group: 'Reference' },
  { route: '/validation', name: 'Validation', sub: 'Engine vs hand calc', group: 'Reference' },
  { route: '/pricing', name: 'Plans', sub: 'Pricing · PHP', group: 'Reference' },
]

/** The refusal the model is instructed to give off-topic questions, verbatim. */
export const OFF_TOPIC_REFUSAL =
  'I can only help with this app\u2019s calculators, their inputs and results, and the design codes behind them (NSCP 2015, ACI 318-14, AISC 360). Please ask about one of those.'

/**
 * The server-built system prompt. The browser never sends one — any `system`
 * or `developer` message in the request is dropped by validation — so prompt
 * injection from the client side cannot widen the scope.
 */
export function buildAssistantSystemPrompt(tools: readonly AssistantToolRef[] = ASSISTANT_TOOLS): string {
  const catalog = tools.map((t) => `- ${t.route} — ${t.name} (${t.sub}) [${t.group}]`).join('\n')
  return [
    'You are the calculation helper inside a structural-engineering web app (NSCP 2015 / ACI 318-14 / AISC 360-16).',
    '',
    'SCOPE — the hard rule. You answer ONLY questions about: (a) the app calculators listed below, their inputs, and how to use them; (b) the meaning of their answers, solutions and results; (c) the design-code clauses behind them. Any question outside that — general chat, homework unrelated to these tools, coding, current events, anything else — gets EXACTLY this reply and nothing more:',
    `"${OFF_TOPIC_REFUSAL}"`,
    '',
    'CALCULATORS — the complete set. Never name, link or describe any other tool or page; if no listed calculator fits, say so and suggest the closest one:',
    catalog,
    '',
    'RUNNING CALCULATORS. When the user gives enough details to run one, call the `open_calculator` function with the calculator route and the inputs as field names and numbers (with units as documented: geometry m, sections mm/mm², forces kN, stress MPa). Only include inputs the user actually gave — never invent values. If details are missing, ask for them instead of calling.',
    'Explain results from what the calculator returns or computes — never fabricate numbers, and cite the code clause (e.g. NSCP §203.3.1, ACI §22.6, AISC §E3) behind each check. Keep answers short.',
  ].join('\n')
}

/** The single function the model may call. One function, so it cannot reach anything but a calculator page. */
export const OPEN_CALCULATOR_TOOL = 'open_calculator'

export function openCalculatorToolSchema(routes: readonly string[] = ASSISTANT_TOOLS.map((t) => t.route)) {
  return {
    type: 'function' as const,
    function: {
      name: OPEN_CALCULATOR_TOOL,
      description:
        'Open one of the app calculators with the inputs the user gave, so the page runs with their data prefilled. Use ONLY for a route from the enum.',
      parameters: {
        type: 'object',
        properties: {
          route: { type: 'string', enum: [...routes], description: 'The calculator page to open.' },
          inputs: {
            type: 'object',
            description: 'Input field names to numbers/strings exactly as the user gave them. Omit anything not given.',
            additionalProperties: true,
          },
          note: { type: 'string', description: 'One short sentence saying what was filled in.' },
        },
        required: ['route', 'inputs'],
        additionalProperties: false,
      },
    },
  }
}

// ── Request validation (server side) ─────────────────────────────────────────

export interface AssistantChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const MAX_MESSAGES = 20
export const MAX_MESSAGE_CHARS = 4000

export type RequestError = 'body' | 'model' | 'messages'

export function validateAssistantRequest(body: unknown): {
  ok: true
  model: FreeModel
  messages: AssistantChatMessage[]
} | { ok: false; error: RequestError } {
  if (body === null || typeof body !== 'object') return { ok: false, error: 'body' }
  const { model, messages } = body as { model?: unknown; messages?: unknown }
  if (!isFreeModel(model)) return { ok: false, error: 'model' }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return { ok: false, error: 'messages' }
  }
  const clean: AssistantChatMessage[] = []
  for (const m of messages) {
    // Roles are closed: a client-supplied `system`/`developer`/`tool` message
    // is REJECTED, not folded in — the system prompt is server-built above.
    if (m === null || typeof m !== 'object') return { ok: false, error: 'messages' }
    const { role, content } = m as { role?: unknown; content?: unknown }
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return { ok: false, error: 'messages' }
    }
    const text = content.trim()
    if (text.length === 0 || text.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'messages' }
    clean.push({ role, content: text })
  }
  return { ok: true, model, messages: clean }
}

// ── Response parsing (server side) ───────────────────────────────────────────

export interface CalculatorAction {
  route: string
  inputs: Record<string, unknown>
  note: string
}

export interface UpstreamToolCall {
  function?: { name?: unknown; arguments?: unknown }
}

export interface UpstreamChoice {
  message?: { content?: unknown; tool_calls?: UpstreamToolCall[] }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Shared shape check for one parsed `open_calculator` call — both protocols end here. */
function toCalculatorAction(
  args: unknown,
  routes: readonly string[],
): CalculatorAction | null {
  if (!isPlainObject(args) || typeof args.route !== 'string' || !routes.includes(args.route)) return null
  return {
    route: args.route,
    inputs: isPlainObject(args.inputs) ? args.inputs : {},
    note: typeof args.note === 'string' ? args.note.slice(0, 500) : '',
  }
}

/**
 * Split an upstream chat-completions choice into display text plus validated
 * calculator actions. A tool call naming an unknown route, a foreign function,
 * or unparseable arguments is DROPPED — the model proposes, this list disposes.
 */
export function extractAssistantActions(
  choice: UpstreamChoice | null | undefined,
  routes: readonly string[] = ASSISTANT_TOOLS.map((t) => t.route),
): { reply: string; actions: CalculatorAction[] } {
  const message = choice?.message
  const rawContent = typeof message?.content === 'string' ? message.content : ''
  const actions: CalculatorAction[] = []
  for (const call of message?.tool_calls ?? []) {
    if (call?.function?.name !== OPEN_CALCULATOR_TOOL) continue
    let args: unknown = null
    try {
      args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : null
    } catch {
      continue
    }
    const action = toCalculatorAction(args, routes)
    if (action) actions.push(action)
  }
  return { reply: rawContent, actions }
}
