// Which calculator PAGE each endpoint meters, re-exported from the single
// definition in `src/lib/calcRoutes.ts`.
//
// One constant, two consumers: the browser tags a request with the page it came
// from (to cache that page's run ticket), and the handler below meters against
// the same string. Two copies would drift, and the drift is silent — the server
// would refuse a guest on a page whose banner still reads "3 free runs left".
//
// The value the ENDPOINT passes is the one that counts. It is a compile-time
// constant per handler and never read from the request, because a caller who
// could name their own route would name a fresh one on every request and never
// run out.
//
// `routes.test.ts` checks each of these is really in `GUEST_TRIAL_ROUTES` and
// really judged `trial` for a guest.
export { TRIAL_ROUTE, type TrialRouteKey } from '../../src/lib/calcRoutes'
