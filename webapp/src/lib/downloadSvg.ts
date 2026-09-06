/** Save an SVG string into the user's downloads.
 *
 * The Plans tab's per-sheet button and the fullscreen plan viewer both hand
 * the browser the same bytes for the same sheet — one download helper, so a
 * fix to how a file is named or typed lands in both places at once. */
export function downloadSvg(name: string, svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
