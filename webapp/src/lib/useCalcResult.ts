import { useEffect, useRef, useState } from 'react'

/**
 * Async calc hook with debounce + stale-while-revalidating.
 * - `fetchFn` is called after `debounceMs` of quiet time following a deps change.
 * - `data` keeps the last successful result while the next fetch is in flight.
 * - `loading` is true only while a debounced fetch is pending or in-flight.
 * - `cause` is the rejection ITSELF, beside its string form.
 *
 * The last one exists because not every failure is a fault. The calculation
 * endpoint refuses a guest who has used their five free runs, and the right
 * answer to that is a sign-up prompt, not "API error — check console". Callers
 * need the error's TYPE to tell the two apart, and `String(e)` throws it away.
 */
export function useCalcResult<T>(
  fetchFn: () => Promise<T>,
  deps: readonly unknown[],
  debounceMs = 250,
): { data: T | null; loading: boolean; error: string | null; cause: unknown } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cause, setCause] = useState<unknown>(null)
  // Use a ref so the effect always calls the latest closure without re-running.
  // Written after commit — assigning during render would make the render impure.
  const latestFn = useRef(fetchFn)
  useEffect(() => { latestFn.current = fetchFn })

  useEffect(() => {
    let cancelled = false
    // Entering the debounce IS the loading state; there is nothing to derive it
    // from, because the trigger is a deps change rather than a value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const t = setTimeout(() => {
      latestFn.current()
        .then((d) => { if (!cancelled) { setData(d); setError(null); setCause(null); setLoading(false) } })
        .catch((e: unknown) => {
          console.error('calc failed:', e)   // UI badge says "check console" — keep that true
          if (!cancelled) { setError(String(e)); setCause(e); setLoading(false) }
        })
    }, debounceMs)
    return () => { cancelled = true; clearTimeout(t) }
    // deps is intentionally spread here; exhaustive-deps lint does not apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, cause }
}
