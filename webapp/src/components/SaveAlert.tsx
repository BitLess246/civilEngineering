// The banner that appears when a change did not reach disk. View layer.
//
// It exists because the alternative was nothing: `store.save` threw on a full
// quota, the throw escaped into a React event handler, and the user's edit
// disappeared from the screen with no message at all. See
// `engine/storageWrite.ts` for the mechanism.
//
// WHAT IT HAS TO COMMUNICATE, in this order:
//   1. the change is NOT saved — the thing they would otherwise assume wrongly;
//   2. it is still on screen, so they have not lost the work yet;
//   3. what to do about it, specifically enough to act on.
//
// It is deliberately NOT dismissible-by-default-and-forgotten: dismissing it
// clears the notice, and the next failed save brings it straight back, because
// the condition has not gone away.
//
// `no-print` because a printed schedule report is a document about the project,
// not about this browser's disk.

interface Props {
  message: string | null
  onDismiss(): void
}

export function SaveAlert({ message, onDismiss }: Props) {
  if (!message) return null
  return (
    <div role="alert"
      className="no-print mb-3 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
      <span aria-hidden className="mt-px flex-none rounded bg-amber-200 px-1.5 py-px font-mono text-[9px] font-bold text-amber-900">
        NOT SAVED
      </span>
      <p className="flex-1 text-[12.5px] leading-5 text-amber-950">{message}</p>
      <button type="button" onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-none rounded px-1.5 text-[13px] font-semibold text-amber-900 hover:bg-amber-100">
        ×
      </button>
    </div>
  )
}
