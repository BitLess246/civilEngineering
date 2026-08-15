// Everything the schedule routes have to say about whether the document is
// actually saved, in one place. View layer.
//
// It replaces a bare `<SaveAlert>` in each of the seven pages. The trigger was
// adding a SECOND condition — another tab got there first — and finding that
// it meant editing all seven again. One component per page means the next one
// costs nothing.
//
// THE TWO CONDITIONS ARE NOT THE SAME and are not styled the same:
//
//   • A failed WRITE (a full disk) is informational. There is nothing to
//     decide; the work is on screen and the user needs to get it somewhere
//     else. Amber, dismissible.
//
//   • A CONFLICT is a question, and it is blocking. Nothing is being saved
//     until it is answered, so it is not dismissible — dismissing it would
//     leave the user editing a document that silently is not being stored,
//     which is the failure this whole area exists to remove. Red, with the two
//     answers as buttons.
//
// There is deliberately no merge. Two versions of a construction programme
// differ in durations, logic and resourcing; a machine choosing between them
// field by field produces a schedule nobody wrote and everybody trusts. The
// cloud sync made the same call for the same reason — see
// `engine/projects/remoteStore.ts`.

import { SaveAlert } from './SaveAlert'
import type { TabConflict } from '../lib/useScheduleProject'

interface Props {
  saveError: string | null
  clearSaveError(): void
  conflict?: TabConflict | null
  reloadTheirs?(): void
  overwriteWithMine?(): void
}

export function PersistenceAlerts({
  saveError, clearSaveError, conflict, reloadTheirs, overwriteWithMine,
}: Props) {
  return (
    <>
      <SaveAlert message={saveError} onDismiss={clearSaveError} />
      {conflict && (
        <div role="alert"
          className="no-print mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2.5">
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-px flex-none rounded bg-red-200 px-1.5 py-px font-mono text-[9px] font-bold text-red-900">
              NOT SAVED
            </span>
            <p className="flex-1 text-[12.5px] leading-5 text-red-950">
              This schedule was changed in another tab
              {conflict.theirSavedAt ? ` at ${new Date(conflict.theirSavedAt).toLocaleTimeString()}` : ''}.
              Your change here is <strong>not being saved</strong>, because storing it
              would discard theirs. Pick one to carry on.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 pl-[68px]">
            <button type="button" onClick={reloadTheirs}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-red-800 hover:bg-red-100">
              Load their version
            </button>
            <button type="button" onClick={overwriteWithMine}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-red-700">
              Keep mine and overwrite
            </button>
          </div>
          {/* Say what each button costs BEFORE it is pressed. Neither is
              recoverable, and "Load their version" in particular throws away
              whatever the user just typed. */}
          <p className="mt-1.5 pl-[68px] text-[11px] text-red-800">
            Loading theirs discards your change here. Overwriting discards
            theirs. Export first if you need both.
          </p>
        </div>
      )}
    </>
  )
}
