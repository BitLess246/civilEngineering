# GEN-03 — Guest Quota Enforcement May Fail Open

**Priority:** High  
**Area:** Guest quota / usage enforcement

## Observation

The earlier audit identified guest-quota paths that may fail open when a required salt or IP-derived identifier is missing, an RPC call fails, or a quota table reaches a ceiling. If an error or missing value causes the request to proceed without enforcing a quota, users may be able to bypass intended guest limits.

## Risks

- Guest usage can exceed the intended quota.
- Backend errors may silently disable an abuse-control mechanism.
- Operational incidents may be hard to notice if failures are treated as allowed requests.

## Recommended actions

1. Enumerate every code path that reads, increments, or checks guest quota.
2. Define the intended behavior for missing salt, missing/invalid client identity, RPC failure, database errors, and quota-table limits.
3. Use a deliberate fail-closed or bounded-degradation policy for quota-critical operations. If availability requirements require fail-open behavior, make it time-limited, observable, and explicitly approved.
4. Add metrics and alerts for quota-check failures and fallback paths.
5. Add tests for each failure condition, including concurrency and retry behavior.
6. Avoid relying on a client-provided IP header unless the deployment proxy configuration makes the trusted source unambiguous.
7. Ensure quota updates are atomic where concurrent requests could exceed a limit.

## Acceptance criteria

- Each error/fallback path has an explicit documented policy.
- Quota-check failures are observable and alertable.
- Tests prove that errors cannot silently grant unlimited use.
- Concurrent requests cannot exceed the quota beyond a documented and acceptable bound.
