// ─────────────────────────────────────────────────────────────────────────
// The short text in a CPM node box, after the activity id.
//
// Activity names read "<where> — <what>" (`Columns L2 — concrete pour`), and
// the id already says where (CP2). The box used to strip a leading "Floor " /
// "Columns " / … and keep the part BEFORE the dash, so a column node read
// "CP2 · L2" — the id twice — and a footing node, whose "Footings " left the
// dash leading, read "FTGF · — formwork & reb". The box shows the work
// instead, and says it was cut when it was.
// ─────────────────────────────────────────────────────────────────────────

/** `max` counts characters including the ellipsis. */
export function cpmNodeLabel(name: string, max = 18): string {
  const k = name.indexOf(' — ')
  const what = (k >= 0 ? name.slice(k + 3) : name).trim()
  return what.length <= max ? what : what.slice(0, max - 1).trimEnd() + '…'
}
