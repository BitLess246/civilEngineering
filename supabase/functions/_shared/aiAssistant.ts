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
 * Preferred free models, in the order they START. Free endpoints come and go
 * by the week — between Oct 1 and Oct 6 2026 two of the five then on this list
 * started answering 404 and the assistant went dark for everyone — so this is
 * no longer the allowlist itself. The allowlist is the LIVE catalogue
 * (`selectFreeModels` over OpenRouter's /api/v1/models): anything free there
 * is usable, these go first when they are present, and when the catalogue
 * cannot be fetched this list is the fallback.
 *
 * A paid model still can never ride the key: an id is used only when it is
 * literally free in the catalogue (`:free` suffix AND 0/0 pricing), or it is
 * one of these, each of which was verified that way.
 *
 * Not preferred (still used if the catalogue lists it): inkling:free answered
 * 403 on every request on 2026-10-06 — 403 hands over, so it costs ~25 ms.
 */
export const FREE_CHAT_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
] as const

/** An OpenRouter model id that the catalogue (or the list above) says is free. */
export type FreeModel = string

/** The fallback rotation when the live catalogue is unavailable. */
export const FREE_MODELS: readonly FreeModel[] = [...FREE_CHAT_MODELS]

/** The shape of a free id: `vendor/name:free`. Membership is decided by the catalogue. */
export const isFreeModel = (m: unknown): m is FreeModel =>
  typeof m === 'string' && /^[a-z0-9][\w.-]*\/[\w.:-]+:free$/i.test(m) && m.length <= 120

/**
 * Free models that are not general chat models, or that were measured giving
 * wrong engineering answers. Pattern-matched so a new version of the same
 * family stays out too.
 *   lfm-2.5-2.6b — a 2.6 B model that answered "minimum cover for a
 *     cast-in-place beam" with 4 in (102 mm) under a clause that does not say
 *     so. A confidently wrong code value is worse than no answer.
 *   content-safety — a classifier, not a chat model.
 *   north-mini-code, laguna — code models.
 */
export const EXCLUDED_MODEL_PATTERNS: readonly RegExp[] = [/\/lfm-/i, /content-safety/i, /north-mini-code/i, /\/laguna-/i]

/** Context window of a fallback entry, tokens, for when the catalogue is unavailable. */
const FALLBACK_CONTEXT_TOKENS: Readonly<Record<string, number>> = {
  'nvidia/nemotron-3-ultra-550b-a55b:free': 1000000,
  'nvidia/nemotron-3-super-120b-a12b:free': 262144,
  'nvidia/nemotron-3.5-lightning:free': 1000000,
  'google/gemma-4-31b-it:free': 262144,
}

/** One row of OpenRouter's /api/v1/models, as far as selection reads it. */
export interface CatalogModel {
  id: string
  context_length?: number | null
  pricing?: { prompt?: string; completion?: string; request?: string } | null
  supported_parameters?: string[] | null
  expiration_date?: string | null
  created?: number
}

/** Rotation candidates from the live catalogue, and each one's context window. */
export interface FreeModelSelection { models: FreeModel[]; context: Record<string, number> }

/** Most candidates one request will walk. */
export const MAX_CANDIDATES = 8

const isZero = (v: string | undefined) => v === undefined || Number(v) === 0

/**
 * The rotation, from the live catalogue: every model that is free (`:free`
 * id AND zero prompt/completion/request price), takes tools, has not expired
 * and is not excluded — the preferred list first in its own order, then the
 * rest by context window and recency. Pure, so the rule is unit-tested.
 */
export function selectFreeModels(
  catalog: readonly CatalogModel[], preferred: readonly string[] = FREE_CHAT_MODELS, now = Date.now(),
): FreeModelSelection {
  const ok = catalog.filter((m) =>
    typeof m?.id === 'string' && m.id.endsWith(':free') && isFreeModel(m.id)
    && !!m.pricing && isZero(m.pricing.prompt) && isZero(m.pricing.completion) && isZero(m.pricing.request)
    && (m.pricing.prompt !== undefined && m.pricing.completion !== undefined)
    && (m.supported_parameters ?? []).includes('tools')
    && !(m.expiration_date && Date.parse(m.expiration_date) <= now)
    && !EXCLUDED_MODEL_PATTERNS.some((re) => re.test(m.id)))
  const rank = (id: string) => { const i = preferred.indexOf(id); return i < 0 ? Infinity : i }
  ok.sort((a, b) => rank(a.id) - rank(b.id)
    || (b.context_length ?? 0) - (a.context_length ?? 0) || (b.created ?? 0) - (a.created ?? 0))
  const models = ok.slice(0, MAX_CANDIDATES)
  return { models: models.map((m) => m.id), context: Object.fromEntries(models.map((m) => [m.id, m.context_length ?? 0])) }
}

/** The fallback selection: the preferred list with its recorded windows. */
export const FALLBACK_SELECTION: FreeModelSelection = { models: [...FREE_CHAT_MODELS], context: { ...FALLBACK_CONTEXT_TOKENS } }

/** OpenRouter's public model catalogue — no key needed, so nothing secret goes with it. */
export const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
/** How long one isolate trusts a fetched catalogue. */
export const CATALOG_TTL_MS = 30 * 60_000
/** A catalogue slower than this is skipped for this request; the last one (or the fallback) serves. */
export const CATALOG_TIMEOUT_MS = 4000

export type CatalogFetch = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
export type FreeModelSource = 'live' | 'cached' | 'stale' | 'fallback'

/**
 * The live free-model selection, cached per isolate for `CATALOG_TTL_MS`.
 * A failed or empty fetch never takes the assistant down: the last good
 * selection keeps serving ('stale'), and with none the preferred list does
 * ('fallback'). A failed fetch is retried on the next request, not after a TTL.
 */
export function createFreeModelSource(fetchImpl: CatalogFetch, now: () => number = () => Date.now()) {
  let last: { at: number; sel: FreeModelSelection } | null = null
  return async (): Promise<FreeModelSelection & { source: FreeModelSource }> => {
    if (last && now() - last.at < CATALOG_TTL_MS) return { ...last.sel, source: 'cached' }
    try {
      const res = await fetchImpl(CATALOG_URL, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) })
      if (res.ok) {
        const data = (await res.json() as { data?: unknown } | null)?.data
        const sel = Array.isArray(data) ? selectFreeModels(data as CatalogModel[], FREE_CHAT_MODELS, now()) : null
        if (sel && sel.models.length) {
          last = { at: now(), sel }
          return { ...sel, source: 'live' }
        }
      }
    } catch { /* fall through: stale, then fallback */ }
    return last ? { ...last.sel, source: 'stale' } : { ...FALLBACK_SELECTION, source: 'fallback' }
  }
}

/** Rough chars-per-token headroom: skip a model the estimate cannot fit. */
export function fitsContext(model: FreeModel, chars: number, context: Readonly<Record<string, number>> = FALLBACK_CONTEXT_TOKENS): boolean {
  return chars <= (context[model] ?? 0) * 3
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
  { route: '/drafting3d', name: 'Drafting3D', sub: 'Floor plans → 3D → ModelSpace', group: 'Analysis' },
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
  { route: '/leveling', name: 'Differential Leveling', sub: 'HI · rise & fall · misclosure', group: 'Surveying' },
  { route: '/traverse', name: 'Traverse', sub: 'Bowditch · transit · DMD area', group: 'Surveying' },
  { route: '/simple-curve', name: 'Simple Curve', sub: 'Elements · deflection staking', group: 'Surveying' },
  { route: '/earthwork', name: 'Earthwork', sub: 'End area · prismoidal · mass haul', group: 'Surveying' },
  { route: '/open-channel', name: 'Normal Depth', sub: 'Manning · uniform flow · Fr', group: 'Water' },
  { route: '/critical-depth', name: 'Critical Depth', sub: 'Specific energy · E–y curve', group: 'Water' },
  { route: '/hydraulic-jump', name: 'Hydraulic Jump', sub: 'Sequent depth · ΔE · power', group: 'Water' },
  { route: '/pipe-flow', name: 'Pipe Flow', sub: 'Hazen–Williams · Darcy', group: 'Water' },
  { route: '/concrete-mix', name: 'Concrete Mix Design', sub: 'ACI 211 · absolute volume', group: 'Concrete' },
  { route: '/section-properties', name: 'Section Properties', sub: 'A · I · S · r · built-up', group: 'Analysis' },
  { route: '/bridge-loading', name: 'Bridge Loading', sub: 'HL-93 · lever rule · envelope', group: 'Bridge' },
  { route: '/bridge-rating', name: 'Bridge Rating', sub: 'MBE · RF · HL-93 rated', group: 'Bridge' },
  { route: '/pile-capacity', name: 'Pile Capacity', sub: 'α method · Meyerhof · layers', group: 'Geotechnical' },
  { route: '/sight-distance', name: 'Stopping Sight Distance', sub: 'Reaction · braking · grade', group: 'Transportation' },
  { route: '/vertical-curves', name: 'Vertical Curves', sub: 'Crest · sag · K · sight checks', group: 'Transportation' },
  { route: '/superelevation', name: 'Superelevation', sub: 'e + f = V²/127R · Rmin', group: 'Transportation' },
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
  { route: '/interest-factors', name: 'Interest Factors', sub: 'P/F · P/A · gradients · i_eff', group: 'Mathematics' },
  { route: '/cash-flow-analysis', name: 'Cash-Flow Analysis', sub: 'NPV · IRR · B/C · payback', group: 'Mathematics' },
  { route: '/depreciation', name: 'Depreciation', sub: 'SL · SYD · declining balance', group: 'Mathematics' },
  { route: '/break-even', name: 'Break-Even Analysis', sub: 'Q = F/(p − v) · margin of safety', group: 'Mathematics' },
  { route: '/hydrostatic-force', name: 'Hydrostatic Force', sub: 'Plane surfaces · center of pressure', group: 'Water' },
  { route: '/curved-gate', name: 'Curved Gate', sub: 'Quarter circle · Fh · Fv · resultant', group: 'Water' },
  { route: '/buoyancy', name: 'Buoyancy & Stability', sub: 'Displacement · metacentric height', group: 'Water' },
  { route: '/manometer', name: 'Manometer', sub: 'Multi-fluid pressure walk', group: 'Water' },
  { route: '/relative-equilibrium', name: 'Accelerating & Rotating Vessels', sub: 'Surface tilt · paraboloid', group: 'Water' },
  { route: '/bernoulli', name: 'Energy Equation', sub: 'Bernoulli · pumps · turbines · losses', group: 'Water' },
  { route: '/jet-on-vane', name: 'Jet on a Vane', sub: 'Impulse–momentum · power · efficiency', group: 'Water' },
  { route: '/rectilinear-motion', name: 'Rectilinear Motion', sub: 'Constant acceleration · any three of u, a, t, v, s', group: 'Mathematics' },
  { route: '/projectile-motion', name: 'Projectile Motion', sub: 'Range · height · time of flight', group: 'Mathematics' },
  { route: '/curvilinear-motion', name: 'Curvilinear Motion', sub: 'Normal & tangential acceleration', group: 'Mathematics' },
  { route: '/kinetics', name: 'Kinetics', sub: 'ΣF = ma · velocity · displacement', group: 'Mathematics' },
  { route: '/work-energy', name: 'Work–Energy', sub: 'ΔKE = W + Wnc − ΔPE', group: 'Mathematics' },
  { route: '/impulse-momentum', name: 'Impulse–Momentum', sub: 'I = m(v₂ − v₁) = F·t', group: 'Mathematics' },
  { route: '/friction', name: 'Friction', sub: 'Block on an incline · holds or slides', group: 'Mathematics' },
  { route: '/belt-friction', name: 'Belt Friction', sub: 'Capstan T₁ = T₂e^(μβ)', group: 'Mathematics' },
  { route: '/method-of-joints', name: 'Method of Joints', sub: 'Concurrent forces · Rx, Ry, R', group: 'Mathematics' },
  { route: '/trigonometry', name: 'Trigonometry', sub: 'Any triangle · any three knowns', group: 'Mathematics' },
  { route: '/spherical-triangle', name: 'Spherical Triangle', sub: 'Cosines · excess · Girard area', group: 'Mathematics' },
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
  /** A client-named model, shape-checked here (`vendor/name:free`). The
   *  function honours it ONLY if the live selection contains it; otherwise
   *  the rotation picks. Never trusted for anything but that membership. */
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
  /** Context window per model, tokens (the live catalogue's); defaults to the fallback table. */
  context?: Readonly<Record<string, number>>
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
 * (rotated away), 403, 408, 429, 5xx, a transport failure, or a 200 that
 * `accept` says is no answer, move on. Fail FAST on 401 (bad key) and 402 (no
 * credit) — those describe the account, not the model — and on any other 4xx,
 * which is our request.
 *
 * 403 is per MODEL on OpenRouter (moderation, or a provider whose data policy
 * the account has not opted into), not per account: measured on the live
 * function, `inkling:free` answered 403 in 25 ms on every request while the
 * nemotrons were fine, and treating it as fatal aborted them mid-answer. A key
 * that is forbidden everywhere still ends as 403 — every model says so.
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
  const queue = models.filter((m) => fitsContext(m, chars, opts.context))
  const controllers: AbortController[] = []
  let lastStatus: number | null = null

  const attempt = async (model: FreeModel, ctl: AbortController): Promise<AttemptOutcome> => {
    for (const withTools of [true, false]) {
      const t0 = now()
      let res: UpstreamResponse
      const timeout = AbortSignal.timeout(timeoutMs)
      // why a fetch or a body read stopped: we cancelled it, it ran out of time, or the wire broke
      const failure = (e: unknown) =>
        ctl.signal.aborted ? 'aborted' as const : timeout.aborted || (e as Error)?.name === 'TimeoutError' ? 'timeout' as const : 'transport' as const
      try {
        const call = buildCall(model, withTools)
        res = await fetchImpl(call.url, {
          method: call.method, headers: call.headers, body: call.body,
          signal: AbortSignal.any([ctl.signal, timeout]),
        })
      } catch (e) {
        opts.log?.({ model, withTools, status: failure(e), ms: now() - t0 })
        return { kind: 'next', status: null } // tools are not the suspect
      }
      if (res.ok) {
        let json: unknown
        try {
          json = await res.json()
        } catch (e) {
          // a body that stopped arriving is a timeout, not an empty answer
          const f = failure(e)
          opts.log?.({ model, withTools, status: f === 'transport' ? 'empty' : f, ms: now() - t0 })
          return { kind: 'next', status: null }
        }
        // OpenRouter can report a provider failure INSIDE a 200: { error: { code } }.
        // The code is a number, never content, so it is what gets logged.
        const code = (json as { error?: { code?: unknown } } | null)?.error?.code
        const usable = opts.accept ? opts.accept(json) : true
        opts.log?.({ model, withTools, status: usable ? res.status : typeof code === 'number' ? code : 'empty', ms: now() - t0 })
        if (usable) return { kind: 'ok', json }
        return { kind: 'next', status: typeof code === 'number' && code >= 400 ? code : null }
      }
      opts.log?.({ model, withTools, status: res.status, ms: now() - t0 })
      if (res.status === 400 && withTools) continue // downgrade: same model, no tools
      if (res.status === 403 || res.status === 404 || res.status === 408 || res.status === 429 || res.status >= 500) {
        return { kind: 'next', status: res.status }
      }
      return { kind: 'fatal', status: res.status } // 401/402/other 4xx
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
