# GEN-05 — Billing Webhook Read-Check-Write Race

**Priority:** High  
**Area:** Billing webhook processing and subscription state

## Observation

The earlier audit flagged a read-check-write sequence in webhook processing that may be vulnerable to concurrent deliveries. Two deliveries can potentially read the same old state, both pass the check, and then perform conflicting updates or duplicate side effects.

## Risks

- Duplicate or out-of-order subscription changes.
- Repeated side effects such as quota changes or notifications.
- Incorrect account entitlement when events are delivered more than once or concurrently.

## Recommended actions

1. Treat webhook delivery as at-least-once; assume duplicates and retries will occur.
2. Store provider event IDs under a unique constraint and process each event idempotently.
3. Use database transactions, conditional updates, row locks, or another atomic ordering strategy appropriate to the data model.
4. Verify event signatures and reject invalid payloads before state changes.
5. Handle event ordering explicitly; do not assume arrival order equals provider event order.
6. Separate event receipt from side effects when appropriate, using a durable job/outbox pattern.
7. Add concurrency tests that submit the same event and conflicting events simultaneously.
8. Log processing outcomes and safely retry transient failures.

## Acceptance criteria

- Duplicate delivery does not duplicate entitlement changes or side effects.
- Concurrent events cannot leave the account in an invalid intermediate state.
- Event processing is auditable and retry-safe.
- Signature verification and event ordering rules are documented.

## Status — fixed (October 2026)

- `apply_billing_event` (migration `20261013000000_apply_billing_event.sql`) does the duplicate check, the ordering check and the write in one transaction behind `select … for update` on the user row. Concurrent deliveries for one user serialise, and the second one checks against what the first one wrote. Timestamps compare as `timestamptz`, not as text.
- `billing-webhook` calls it and maps `applied / duplicate / stale / no-user` to its responses. Until the migration is applied by hand, the RPC returns PGRST202 and the function falls back to the old non-atomic path with a warning, so a deploy that lands first doesn't stop plans being granted.
- Evidence: `apply_billing_event.spec.sql` (18 single-session rules: duplicate, stale redelivery, equal timestamps, precision, untimed events, id preservation, grants) and `apply_billing_event_race.spec.sh` (a cancel held open while an older purchase arrives; the purchase blocks on the lock and answers `stale`). Both were run against Postgres 16 with a stub `auth.users`.
- Signature verification already ran before any state change; that is unchanged.
