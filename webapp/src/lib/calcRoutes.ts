// Which calculator PAGE each calculation endpoint serves.
//
// The guest allowance is counted per page — "5 free runs of this calculator" is
// what the pricing page promises and what `GUEST_TRIAL_ROUTES` lists — but the
// endpoint is not the page, so the correspondence has to be written down.
//
// It lives here, in a module with NO imports, because both sides need it: the
// browser tags each request with the page it belongs to, and the Edge function
// meters against the same string (`api/_lib/routes.ts` re-exports this). One
// constant rather than two is the point — a mismatch would meter a route the UI
// thinks is free, and the visitor would meet a paywall with "3 free runs left"
// still on screen.
//
// The SERVER's copy is the one that decides; the client's is only for caching
// the run ticket per page. A request cannot name its own route.
export const TRIAL_ROUTE = {
  beam: '/steel/beam',
  column: '/steel/column',
  connection: '/bolted-connection',
} as const

export type TrialRouteKey = keyof typeof TRIAL_ROUTE
