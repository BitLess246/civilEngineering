import type { Drawing } from '../engine/planRenderer'
import { planToDxf, planSetToDxf } from '../engine/planDxf'

/** Save a string into the user's downloads.
 *
 * The Plans tab's per-sheet buttons and the fullscreen plan viewer both hand
 * the browser the same bytes for the same sheet — one download helper, so a
 * fix to how a file is named or typed lands in both places at once. */
function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export function downloadSvg(name: string, svg: string): void {
  downloadText(name, svg, 'image/svg+xml')
}

/** A sheet as DXF for CAD — built on click, so the tab does not pay for a
 *  file nobody asked for. */
export function downloadDxf(name: string, drawing: Drawing): void {
  downloadText(name, planToDxf(drawing), 'application/dxf')
}

/** Every sheet in one DXF, laid out side by side at true scale. */
export function downloadDxfSet(name: string, drawings: Drawing[]): void {
  downloadText(name, planSetToDxf(drawings), 'application/dxf')
}
