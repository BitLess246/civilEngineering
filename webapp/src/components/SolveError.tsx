/**
 * A solver run that threw, said out loud.
 *
 * Every launch in Model Space ended `.catch((e) => console.error(...))`, so a
 * failed analyse, design, optimise, pushover or time history left the button
 * un-spinning and the page unchanged — indistinguishable from a run that had
 * not been clicked. The console is not a user interface.
 *
 * Deliberately a strip and not a dialog: the run failed, the model is intact,
 * and the user's next move is to change something and try again. Nothing here
 * needs dismissing.
 */
export function SolveError({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
      <p className="text-[11.5px] font-semibold text-red-800">The solver could not finish this run</p>
      <p className="mt-0.5 font-mono text-[10.5px] leading-snug text-red-700">{message}</p>
      <p className="mt-1 text-[10.5px] text-red-700/80">
        The model is unchanged. Check the mesh warnings and the section properties, then run it again.
      </p>
    </div>
  )
}
