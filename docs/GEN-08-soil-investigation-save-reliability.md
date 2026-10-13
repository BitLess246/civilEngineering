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

## Status — fixed (October 2026)

Traced in `webapp/src/lib/useInvestigation.ts` (the hook) and `webapp/src/engine/soils/store.ts`. **This was a real data-loss bug.** `persist` called `store.save` *before* it updated state. On a full quota or blocked storage, `localStorage.setItem` threw out of the edit handler, the state update never ran, and the field snapped back. The edit was gone and nothing appeared on screen except an uncaught `quota` error in the console (reproduced in Chromium on `main`).

- The edit now goes to state first, then `trySave` writes it and returns `{ ok, savedAt } | { ok: false, error }` instead of throwing.
- The page shows a `role="alert"` banner with a **Retry save** action and a recovery hint (export JSON, or delete an old investigation).
- When the browser blocks site storage entirely, the reads of `localStorage` itself throw. `defaultBackend` now catches that, falls back to memory flagged `persistent: false`, and the page says that nothing will survive closing the tab.
- Writing the "active investigation" key is best-effort and can no longer throw out of an effect.
- Evidence: four new `store.test.ts` cases (quota, other error, success, blocked storage). A Chromium run with `setItem` forced to throw keeps the edit on screen and shows the banner; the same run on `main` loses the edit.
- Multi-tab or multi-user concurrency is out of scope here. Storage is per-browser, and cloud sync is explicit and manual (see the Cloud backup panel).
