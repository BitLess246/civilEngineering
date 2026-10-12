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
