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
 * Free models ONLY, most capable first. Anything not on this list is refused
 * with `model` before any upstream call is made, so a paid model id can never
 * ride this key.
 *
 * Every id below was verified 0/0 pricing with `tools` in
 * `supported_parameters` on /api/v1/models — extend ONLY the same way, plus a
 * test row — AND answered a code question correctly through the live function.
 *
 * Order is MEASURED, not assumed (Oct 2026, through the deployed function):
 * the first two answer correctly in ~16 s and ~26 s; Lightning answers but
 * times out about half the time; Qwen and Gemma are capable but were
 * rate-limited (429) on every probe, so they sit behind the ones that answer.
 * The rotation is hedged (`callWithRotation`), so order decides who STARTS
 * first, not who is waited on.
 *
 * Removed, and why:
 *   inclusionai/ling-3.0-flash-fin:free — gone from OpenRouter (404).
 *   liquid/lfm-2.5-2.6b:free — a 2.6 B model that answered "minimum cover for
 *     a cast-in-place beam" with 4 in (102 mm) under a clause that does not say
 *     so. A confidently wrong code value is worse than no answer.
 */
export const FREE_CHAT_MODELS = [
  'stealth/space-bunny-alpha',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-31b-it:free',
] as const

export type FreeChatModel = (typeof FREE_CHAT_MODELS)[number]
export type FreeModel = FreeChatModel

/** Every model the rotation may offer. The widget no longer names one. */
export const FREE_MODELS: readonly FreeModel[] = [...FREE_CHAT_MODELS]

export const isFreeModel = (m: unknown): m is FreeModel =>
  typeof m === 'string' && (FREE_CHAT_MODELS as readonly string[]).includes(m)

/**
 * Context window per model, tokens. A long conversation can genuinely exceed
 * the small models, so rotation skips an entry that cannot fit the request —
 * capability routing by measurement, not by guessing strengths.
 */
const MODEL_CONTEXT_TOKENS: Readonly<Record<FreeModel, number>> = {
  'stealth/space-bunny-alpha': 1000000,
  'nvidia/nemotron-3-ultra-550b-a55b:free': 1000000,
  'nvidia/nemotron-3.5-lightning:free': 1000000,
  'qwen/qwen3.8-27b:free': 262144,
  'google/gemma-4-31b-it:free': 262144,
}

/** Rough chars-per-token headroom: skip a model the estimate cannot fit. */
export function fitsContext(model: FreeModel, chars: number): boolean {
  return chars <= (MODEL_CONTEXT_TOKENS[model] ?? 0) * 3
}

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
  { route: '/surveying', name: 'Surveying Toolbox', sub: 'Leveling · traverse · curves · earthwork', group: 'Surveying' },
  { route: '/open-channel', name: 'Open Channel Flow', sub: 'Manning · critical · jump', group: 'Water' },
  { route: '/pipe-flow', name: 'Pipe Flow', sub: 'Hazen–Williams · Darcy', group: 'Water' },
  { route: '/concrete-mix', name: 'Concrete Mix Design', sub: 'ACI 211 · absolute volume', group: 'Concrete' },
  { route: '/section-properties', name: 'Section Properties', sub: 'A · I · S · r · built-up', group: 'Analysis' },
  { route: '/bridge-loading', name: 'Bridge Loading', sub: 'HL-93 · lever rule · envelope', group: 'Bridge' },
  { route: '/bridge-rating', name: 'Bridge Rating', sub: 'MBE · RF · HL-93 rated', group: 'Bridge' },
  { route: '/pile-capacity', name: 'Pile Capacity', sub: 'α method · Meyerhof · layers', group: 'Geotechnical' },
  { route: '/geometric-design', name: 'Geometric Design', sub: 'SSD · vertical curves · superelevation', group: 'Transportation' },
  { route: '/pavement', name: 'Flexible Pavement', sub: 'AASHTO 93 · ESALs · SN', group: 'Transportation' },
  { route: '/weir-flow', name: 'Weir Flow', sub: 'Francis · Cipolletti · V-notch', group: 'Water' },
  { route: '/culvert', name: 'Culvert Hydraulics', sub: 'HDS-5 · inlet & outlet control', group: 'Water' },
  { route: '/gvf-profiles', name: 'GVF Profiles', sub: 'Chow M/S/C/H/A · water surface', group: 'Water' },
  { route: '/muskingum', name: 'Muskingum Routing', sub: 'K·X · flood wave · lag', group: 'Water' },
  { route: '/detention', name: 'Detention Pond', sub: 'storage indication · stage', group: 'Water' },
  { route: '/do-sag', name: 'DO Sag Curve', sub: 'Streeter–Phelps · critical DO', group: 'Water' },
  { route: '/runoff', name: 'SCS Runoff', sub: 'CN · Tc · TR-55 UH peak', group: 'Water' },
  { route: '/traffic-volume', name: 'Traffic Volume', sub: 'PHF · DHV · AADT growth', group: 'Transportation' },
  { route: '/signal-timing', name: 'Signal Timing', sub: 'Webster cycle · splits · LOS', group: 'Transportation' },
  { route: '/traffic-queue', name: 'Traffic Queues', sub: 'D/D/1 · M/M/1 · delay', group: 'Transportation' },
  { route: '/rational-method', name: 'Rational Method', sub: 'Q = CiA · Tc · IDF', group: 'Water' },
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
  { route: '/docs', name: 'Documentation', sub: 'User guide', group: 'Reference' },
  { route: '/validation', name: 'Validation', sub: 'Engine vs hand calc', group: 'Reference' },
  { route: '/pricing', name: 'Plans', sub: 'Pricing · PHP', group: 'Reference' },
  { route: '/rigid-pavement', name: 'Rigid Pavement', sub: 'AASHTO 93 · D-slab · J', group: 'Transportation' },
  { route: '/roundabout', name: 'Roundabout Capacity', sub: 'HCM 2010 · entry · LOS', group: 'Transportation' },
  { route: '/esal', name: 'Axle Load ESALs', sub: 'Fourth-power · LEF · W18', group: 'Transportation' },
  { route: '/storm-sewer', name: 'Storm Sewer', sub: 'Rational · Manning · tc chain', group: 'Water' },
  { route: '/water-demand', name: 'Water Demand', sub: 'Forecast · peaking · storage', group: 'Water' },
  { route: '/pump-station', name: 'Pump Station', sub: 'System × pump · NPSH · power', group: 'Water' },
  { route: '/eng-economy', name: 'Engineering Economy', sub: 'Time value · NPV/IRR · depreciation', group: 'Mathematics' },
  { route: '/hydrostatics', name: 'Hydrostatics', sub: 'Plane force · gates · buoyancy · vessels', group: 'Mathematics' },
  { route: '/dynamics', name: 'Dynamics', sub: 'Kinematics · kinetics · work-energy · impulse', group: 'Mathematics' },
  { route: '/drafting3d', name: 'Drafting3D', sub: 'Floor plans → 3D → ModelSpace', group: 'Mathematics' },
]

/** The refusal the model is instructed to give off-topic questions, verbatim. */
export const OFF_TOPIC_REFUSAL =
  'I can only help with this app\u2019s calculators, their inputs and results, and the design codes behind them (NSCP 2015, ACI 318-14, AISC 360). Please ask about one of those.'

/**
 * The server-built system prompt. The browser never sends one — any `system`
 * or `developer` message in the request is dropped by validation — so prompt
 * injection from the client side cannot widen the scope.
 *
 * `pageContext` is the open page as the browser read it — the page's own
 * snapshot and/or its on-screen fields and text (client-formatted,
 * length-capped, validated below). It is DATA, quoted as
 * the current page — what grounds "why did THIS come out like that?".
 */
export function buildAssistantSystemPrompt(
  tools: readonly AssistantToolRef[] = ASSISTANT_TOOLS,
  pageContext: string | null = null,
): string {
  const catalog = tools.map((t) => `- ${t.route} — ${t.name} (${t.sub}) [${t.group}]`).join('\n')
  const page = pageContext
    ? [
        '',
        'CURRENT PAGE — what the user has open RIGHT NOW: the page\'s own summary of its live inputs and results when it has one, and the fields and text visible on screen. In Model Space it summarises the 3D frame, its loads, and the analysis and design results, including failing members and the selected member:',
        pageContext,
        '',
        'The user is looking at this page, so "this", "my", "here" and unnamed questions are about it. Answer from THESE numbers, citing the clause behind each check. Never invent values: anything not shown here is unknown until the user gives it or opens the page that computes it. Never claim you cannot see the page — you are given it above.',
      ].join('\n')
    : ''
  return [
    'You are the calculation helper inside Zeta, a structural-engineering web app (NSCP 2015 / ACI 318-14 / AISC 360-16) operated by CIVENGG WEBSITE APPLICATION SERVICE.',
    '',
    'SCOPE. You answer questions about: (a) the app calculators listed below, their inputs, and how to use them; (b) the meaning of their answers, solutions and results; (c) structural, geotechnical and construction engineering as the design codes treat it — NSCP 2015, ACI 318-14, AISC 360-16, NDS — including requirements, clauses, limits, typical values and how a design is done, whether or not a calculator is involved.',
    'IN SCOPE, answer them: "What is the minimum cover for a beam?", "How do I design a footing?", "What does phi mean in ACI?", "Why is my column failing?", "What is the drift limit in NSCP?". When a question is about engineering or the codes, ANSWER it — refusing a genuine engineering question is a failure. Only a question with nothing to do with engineering, the codes or this app — weather, general chat, coding, current events, other subjects — gets EXACTLY this reply and nothing more:',
    `"${OFF_TOPIC_REFUSAL}"`,
    '',
    'CALCULATORS — the complete set. Never name, link or describe any other tool or page; if no listed calculator fits, say so and suggest the closest one:',
    catalog,
    '',
    'RUNNING CALCULATORS. When the user gives enough details to run one, call the `open_calculator` function with the calculator route and the inputs as field names and numbers (with units as documented: geometry m, sections mm/mm², forces kN, stress MPa). Only include inputs the user actually gave — never invent values. If details are missing, ask for them instead of calling.',
    'Explain results from what the calculator returns or computes — never fabricate numbers, and cite the code clause (e.g. NSCP §203.3.1, ACI §22.6, AISC §E3) behind each check. Keep answers short.',
    page,
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
/** Cap on the page snapshot: it is context, and the client caps first. */
export const MAX_PAGE_CHARS = 12_000

export type RequestError = 'body' | 'model' | 'messages'

/** The live page snapshot as plain text, or null when absent or unusable. */
export function cleanPageContext(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const text = v.trim()
  if (!text) return null
  return text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}…` : text
}

export function validateAssistantRequest(body: unknown): {
  ok: true
  /** A client-named model is honoured ONLY when allowlisted (old widget
   *  during the deploy window); otherwise the rotation picks. Never trusted
   *  for anything but membership in the list below. */
  model: FreeModel | null
  messages: AssistantChatMessage[]
  page: string | null
} | { ok: false; error: RequestError } {
  if (body === null || typeof body !== 'object') return { ok: false, error: 'body' }
  const { model, messages, page } = body as { model?: unknown; messages?: unknown; page?: unknown }
  // Absent is the normal case now (the widget sends none); present-but-foreign
  // is refused, never silently replaced — a caller must know what they asked.
  let named: FreeModel | null = null
  if (model !== undefined) {
    if (!isFreeModel(model)) return { ok: false, error: 'model' }
    named = model
  }
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
  return { ok: true, model: named, messages: clean, page: cleanPageContext(page) }
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

/** Shared shape check for one parsed `open_calculator` call. */
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

/**
 * Whether an upstream 200 actually answered: some text, or a well-formed
 * calculator action. A free endpoint can return 200 with an empty message —
 * measured on the live function, a reasoning model that spent its whole token
 * budget thinking — and the user then gets "…". Rotation treats that like a
 * failure and hands over.
 */
export function hasUsableAnswer(json: unknown): boolean {
  const choice = (json as { choices?: UpstreamChoice[] } | null)?.choices?.[0]
  const { reply, actions } = extractAssistantActions(choice)
  return reply.trim().length > 0 || actions.length > 0
}

// ── Model rotation (server side) ─────────────────────────────────────────────

export interface UpstreamResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type UpstreamFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<UpstreamResponse>

export type RotationResult =
  | { ok: true; model: FreeModel; json: unknown }
  | { ok: false; status: number | null }

/** One fully-built upstream call. The function fills in the key-bearing headers. */
export interface UpstreamCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

/** One upstream attempt, for the function's logs — model, outcome, time. Never content. */
export interface AttemptLog { model: FreeModel; withTools: boolean; status: number | 'transport' | 'aborted' | 'timeout' | 'empty'; ms: number }

export interface RotationOptions {
  /** Start the next model alongside a pending one after this long, ms. */
  hedgeMs?: number
  /** Most attempts in flight at once. */
  maxParallel?: number
  /** Give up on the whole rotation after this long, ms. */
  deadlineMs?: number
  log?: (a: AttemptLog) => void
  now?: () => number
  /** Whether a 200 body is an answer; one that is not hands over like a 5xx. */
  accept?: (json: unknown) => boolean
}

/** Free endpoints answer in 15–30 s when they answer at all (measured Oct 2026). */
export const HEDGE_MS = 6000
export const MAX_PARALLEL = 3
export const ROTATION_DEADLINE_MS = 55_000

type AttemptOutcome =
  | { kind: 'ok'; json: unknown }
  | { kind: 'next'; status: number | null }
  | { kind: 'fatal'; status: number }

/**
 * Walk the rotation list until one model answers — HEDGED, not serial.
 *
 * Free endpoints are slow and flaky: measured on the live function, the
 * capable models take 15–30 s and any of them can time out or 429. Walked
 * one after another with a 30 s timeout each, a bad minute stacked two or
 * three of those and the user waited 50 s+ (or got nothing). So: start the
 * first model; if it has not answered within `hedgeMs`, start the next ALONGSIDE
 * it (up to `maxParallel` in flight); the first good answer wins and every
 * other attempt is aborted. A model that fails retryably hands over at once,
 * without waiting for the hedge timer.
 *
 * Per model the policy is unchanged: skip it when the request cannot fit its
 * context window; POST with tools; on 400 retry ONCE without tools (an entry
 * can list tool support the serving endpoint does not honour); on 404
 * (rotated away), 408, 429, 5xx, a transport failure, or a 200 that `accept`
 * says is no answer, move on. Fail FAST on
 * 401 (bad key), 402 (no credit) and 403 (forbidden) — those describe the
 * account, not the model — and on any other 4xx, which is our request.
 *
 * `fetchImpl` is injected so the whole policy is unit-testable; the function
 * passes the real fetch.
 */
export function callWithRotation(
  models: readonly FreeModel[],
  chars: number,
  buildCall: (model: FreeModel, withTools: boolean) => UpstreamCall,
  fetchImpl: UpstreamFetch,
  timeoutMs: number,
  opts: RotationOptions = {},
): Promise<RotationResult> {
  const hedgeMs = opts.hedgeMs ?? HEDGE_MS
  const maxParallel = Math.max(1, opts.maxParallel ?? MAX_PARALLEL)
  const deadlineMs = opts.deadlineMs ?? ROTATION_DEADLINE_MS
  const now = opts.now ?? (() => Date.now())
  const queue = models.filter((m) => fitsContext(m, chars))
  const controllers: AbortController[] = []
  let lastStatus: number | null = null

  const attempt = async (model: FreeModel, ctl: AbortController): Promise<AttemptOutcome> => {
    for (const withTools of [true, false]) {
      const t0 = now()
      let res: UpstreamResponse
      try {
        const call = buildCall(model, withTools)
        res = await fetchImpl(call.url, {
          method: call.method, headers: call.headers, body: call.body,
          signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(timeoutMs)]),
        })
      } catch (e) {
        const status = ctl.signal.aborted ? 'aborted' : (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'transport'
        opts.log?.({ model, withTools, status, ms: now() - t0 })
        return { kind: 'next', status: null } // tools are not the suspect
      }
      if (res.ok) {
        let json: unknown
        try {
          json = await res.json()
        } catch {
          opts.log?.({ model, withTools, status: 'empty', ms: now() - t0 })
          return { kind: 'next', status: null } // unparseable body
        }
        const usable = opts.accept ? opts.accept(json) : true
        opts.log?.({ model, withTools, status: usable ? res.status : 'empty', ms: now() - t0 })
        return usable ? { kind: 'ok', json } : { kind: 'next', status: null }
      }
      opts.log?.({ model, withTools, status: res.status, ms: now() - t0 })
      if (res.status === 400 && withTools) continue // downgrade: same model, no tools
      if (res.status === 404 || res.status === 408 || res.status === 429 || res.status >= 500) {
        return { kind: 'next', status: res.status }
      }
      return { kind: 'fatal', status: res.status } // 401/402/403/other 4xx
    }
    return { kind: 'next', status: 400 }
  }

  return new Promise<RotationResult>((resolve) => {
    let next = 0, inFlight = 0, done = false
    let hedge: ReturnType<typeof setTimeout> | undefined
    const finish = (r: RotationResult) => {
      if (done) return
      done = true
      clearTimeout(hedge); clearTimeout(deadline)
      for (const c of controllers) c.abort()
      resolve(r)
    }
    const deadline = setTimeout(() => finish({ ok: false, status: lastStatus ?? 408 }), deadlineMs)
    const armHedge = () => {
      clearTimeout(hedge)
      if (next < queue.length) hedge = setTimeout(() => { launch(); armHedge() }, hedgeMs)
    }
    const launch = () => {
      if (done || next >= queue.length || inFlight >= maxParallel) return
      const model = queue[next++]!
      const ctl = new AbortController()
      controllers.push(ctl)
      inFlight++
      void attempt(model, ctl).then((o) => {
        inFlight--
        if (done) return
        if (o.kind === 'ok') return finish({ ok: true, model, json: o.json })
        if (o.kind === 'fatal') return finish({ ok: false, status: o.status })
        if (o.status !== null) lastStatus = o.status
        // hand over at once, and restart the hedge clock for the newcomer
        if (next < queue.length) { launch(); armHedge() }
        else if (inFlight === 0) finish({ ok: false, status: lastStatus })
      })
    }
    if (!queue.length) return finish({ ok: false, status: null })
    launch(); armHedge()
  })
}
