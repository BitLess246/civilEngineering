# GEN-08 — Soil Investigation Data Persistence and Save-Failure Handling

**Priority:** Medium–High  
**Area:** Soil investigation state persistence

## Observation

The earlier audit flagged soil-investigation persistence for review, specifically:

- `webapp/src/engine/soils/store.ts`
- `webapp/src/engine/soils/useInvestigation.ts`

The concern is that a failed save may cause edits to be lost, reverted, or presented as if they were saved without a clear warning.

## Risks

- Users may lose entered borehole, soil-layer, or investigation data.
- The UI may display stale persisted data after a failed save.
- Users may continue calculations based on a state different from the state they believe was saved.

## Recommended actions

1. Trace the full lifecycle of investigation state: local edits, save request, server response, error handling, reload, and navigation.
2. Preserve unsaved local edits after save failures.
3. Display a clear unsaved/error status and provide a retry action.
4. Distinguish “saved,” “saving,” “unsaved changes,” and “save failed” states.
5. Avoid replacing newer local state with stale server responses.
6. If multiple tabs or users can edit the same record, consider versioning or optimistic concurrency checks.
7. Test network loss, server errors, validation errors, duplicate submissions, reloads, and navigation while changes are unsaved.
8. Where appropriate, provide a safe recovery path for unsaved work without persisting sensitive data insecurely.

## Acceptance criteria

- A failed save never silently discards the user's latest edits.
- The UI accurately communicates whether changes are persisted.
- Retry and reload behavior are tested.
- Concurrent or stale updates are handled deliberately where relevant.
