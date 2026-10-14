// Tour v3 capture → cap/tour3/: the long, explained walkthrough. Same tape
// format as tape.mjs (one screenshot per UI change + the box of every control
// touched) plus what the v2 cut was missing:
//   · panelScroll — the side panel is its own scroll box; scroll it in steps,
//     so the view travels to a section instead of jumping there
//   · point — the pointer rests on an option and a note says what it does
//   · hold — a zoom target (box + width) to read a result table at
//   · anim — the modal mode shape, stepped on Playwright's fake clock so the
//     sine the viewport plays is sampled evenly (scene.tsx: sin(t·1.2π))
// Chapters run in one of three modes: REC (shots), SILENT (same actions, no
// shots: rebuilds state for a resumed run) or STATE (only what later chapters
// depend on). The cage chapter renders slowly at 2×, so it is captured on its
// own pass at 1×:
//   SKIP=c07b,c13 node tour/tape3.mjs         (everything else, 2×)
//   ONLY=c07b node tour/tape3.mjs             (the mode animation, appended)
//   ONLY=c13 DPR=1 node tour/tape3.mjs        (cages, appended)
import { open, clean } from '../lib.mjs'
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs'
const OUT = 'cap/tour3', ONLY = process.env.ONLY, SKIP = (process.env.SKIP || '').split(',').filter(Boolean)
if (!ONLY) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const { b, p } = await open({ dpr: +(process.env.DPR || 2), w: 1600, h: 900 })
p.setDefaultTimeout(180000)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const tape = ONLY ? JSON.parse(readFileSync(`${OUT}/tape.json`, 'utf8')) : []
let n = Math.max(0, ...readdirSync(OUT).map((f) => +(f.match(/^f(\d+)\.jpg$/)?.[1] ?? 0))), chapter = 'c01', mode = 'rec'
const rec = () => mode === 'rec'
const save = () => writeFileSync(`${OUT}/tape.json`, JSON.stringify(tape, null, 1))
const push = (s) => { if (rec()) { tape.push({ chapter, ...s }); save() } return s }
const shot = async () => {
  if (!rec()) return null
  await clean(p)
  const f = `f${String(++n).padStart(4, '0')}.jpg`
  await p.screenshot({ path: `${OUT}/${f}`, type: 'jpeg', quality: 88, timeout: 300000 })
  return f
}
const boxOf = async (loc) => { const r = await loc.boundingBox(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }
const tab = (name) => p.getByRole('button', { name, exact: true }).first()
const btn = (re) => p.getByRole('button', { name: re }).first()
const lab = (re) => p.locator('label', { hasText: re }).first()
const busy = () => p.evaluate(() => /⏳/.test(document.body.innerText))
const idle = async () => { await p.waitForTimeout(600); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: 900000, polling: 800 }); await p.waitForTimeout(1500) }

/** The nearest scrolling ancestor of an element (the side panel, or the page). */
const scrollerOf = (loc) => loc.evaluate((el) => {
  let e = el.parentElement
  while (e && e !== document.body) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4) break; e = e.parentElement }
  if (!e || e === document.body) return null
  e.dataset.tourScroll = '1'; return true
})
/** Bring an element to `top` px from the top of its scroller, in visible steps. */
async function panelScroll(loc, top = 170, steps = 9) {
  const own = await scrollerOf(loc)
  const r = await loc.boundingBox()
  const step = push({ kind: 'scroll', frames: [] })
  if (!own) {                                                   // the page itself
    const dy = r.y - top
    for (let k = 0; k < steps; k++) { await p.evaluate((d) => scrollBy(0, d), dy / steps); await p.waitForTimeout(160); step.frames.push({ f: await shot() }) }
  } else {
    const dy = await p.evaluate(({ y, top }) => { const e = document.querySelector('[data-tour-scroll]'); const c = e.getBoundingClientRect(); return y - c.y - (top - c.y) }, { y: r.y, top })
    for (let k = 0; k < steps; k++) {
      await p.evaluate((d) => { const e = document.querySelector('[data-tour-scroll]'); e.scrollTop += d }, dy / steps)
      await p.waitForTimeout(160); step.frames.push({ f: await shot() })
    }
    await p.evaluate(() => document.querySelector('[data-tour-scroll]')?.removeAttribute('data-tour-scroll'))
  }
  save(); log('scroll', Math.round(r.y - top))
}
/** Click a real control: the pointer goes to its box, the callout names it. */
async function click(loc, label, { wait = 900, long = false, note = null, download = null } = {}) {
  const box = await boxOf(loc)
  const step = push({ kind: 'click', label, note, box, frames: [] })
  if (download) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 600000 }), loc.click()])
    await dl.saveAs(`${OUT}/${download}`); await p.waitForTimeout(800)
  } else await loc.click()
  if (long) {
    await p.waitForTimeout(700)
    if (await busy()) step.frames.push({ f: await shot(), busy: true })
    await idle()
  } else if (!download) await p.waitForTimeout(wait)
  step.frames.push({ f: await shot() }); save(); log('click', label)
}
/** Rest the pointer on an option and say what it does. */
async function point(loc, label, note, { dwell = 2.4 } = {}) {
  const box = await boxOf(loc)
  await loc.hover().catch(() => {}); await p.waitForTimeout(250)
  push({ kind: 'hover', label, note, box, dwell, frames: [{ f: await shot() }] }); log('point', label)
}
/** Type into a field, one frame per keystroke. */
async function type(loc, text, label) {
  const box = await boxOf(loc)
  push({ kind: 'click', label, box, frames: [] })
  await loc.click(); await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace')
  const step = push({ kind: 'type', box, text, frames: [{ f: await shot() }] })
  for (const ch of text) { await p.keyboard.type(ch); step.frames.push({ f: await shot() }) }
  await loc.press('Tab'); save(); log('type', text)
}
/** Zoom in on a result and read it. `grow` extends the box (css px). */
async function hold(label, loc, { w = 900, dur = 2.6, grow = {} } = {}) {
  const r = await boxOf(loc)
  const box = r && { x: r.x - (grow.l ?? 0), y: r.y - (grow.t ?? 0), w: r.w + (grow.l ?? 0) + (grow.r ?? 0), h: r.h + (grow.t ?? 0) + (grow.b ?? 0) }
  push({ kind: 'hold', label, focus: box, w, dur, frames: [{ f: await shot() }] }); log('hold', label)
}
/** Orbit the 3D view: a press-drag that starts on empty canvas (a press on a member selects it). */
async function orbit(frames, dx, label) {
  const c = await p.evaluate(() => { const el = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const x0 = c.x + c.w * 0.9, y0 = c.y + c.h * 0.25
  const step = push({ kind: 'drag', label, frames: [] })
  await p.mouse.move(x0, y0); await p.mouse.down()
  for (let k = 0; k < frames; k++) {
    const x = x0 - (k + 1) * dx, y = y0 + Math.sin((k / frames) * Math.PI) * 6
    await p.mouse.move(x, y, { steps: 2 }); await p.waitForTimeout(90)
    step.frames.push({ f: await shot(), pos: { x, y } })
  }
  await p.mouse.up(); save(); log('orbit', frames)
}
/** The mode shape, sampled evenly over `cycles` periods (T = 1/0.6 s in scene.tsx). */
async function anim(frames, cycles, label) {
  const step = push({ kind: 'anim', label, frames: [] })
  const T = 1000 / 0.6, dt = (T * cycles) / frames
  await p.clock.install()                                    // late: a fake clock from page load slows every WebGL frame
  await p.clock.pauseAt(await p.evaluate(() => Date.now() + 500))
  for (let k = 0; k < frames; k++) { await p.clock.runFor(dt); step.frames.push({ f: await shot() }) }
  await p.clock.resume(); save(); log('anim', frames)
}
const panel = () => p.locator('[class*="no-print"][class*="rounded-lg"][class*="border-hairline"]').filter({ has: p.locator('button') }).last()

// ── the chapters ───────────────────────────────────────────────────────────
const CH = {}
CH.c01 = async () => {                                       // the grid
  push({ kind: 'start', frames: [{ f: await shot() }] })
  await click(tab('Geometry'), 'Geometry')
  await type(p.getByLabel(/Bays X/i).first(), '5, 5, 5', 'Bays X')
  await type(p.getByLabel(/Bays Z/i).first(), '5, 5', 'Bays Z')
  await type(p.getByLabel(/Storey heights/i).first(), '3.5, 3, 3, 3', 'Storey heights')
  await click(btn(/Regenerate grid model/), 'Regenerate grid model', { wait: 4500 })
}
CH.c02 = async () => { await orbit(64, 4, 'Drag to orbit') }  // smooth: 64 small steps
CH.c03 = async () => {                                       // seismic
  await click(tab('Loading'), 'Loading')
  await panelScroll(btn(/Seismic — NSCP 208/i), 170, 12)
  await point(p.getByLabel('Ca', { exact: true }).first(), 'Ca · Cv', 'Seismic coefficients for the soil profile and zone — Tables 208-7 and 208-8')
  await point(p.getByLabel('R', { exact: true }).first(), 'R · I', 'R = 8.5 for a special RC moment frame · I = occupancy importance')
  await point(lab(/^\s*\+X\s*$/), 'Directions', 'Each ticked direction (±X, ±Z) becomes its own earthquake case')
  await point(lab(/Method-B period/), 'Method-B period', 'Uses the modal period, capped at 1.3·Ta (§208.5.2.2)')
  await point(lab(/Accidental torsion/), 'Accidental torsion', 'Shifts each storey force ±5% of the plan width (§208.7.2.7)')
  await click(lab(/Orthogonal effects/), 'Orthogonal effects', { note: 'Adds 30% of the perpendicular direction to every case (§208.8.1)' })
  await point(lab(/Vertical component Ev/), 'Vertical Ev', 'Ev = 0.5·Ca·I·D folded into the E combinations (§208.4.1)')
  await click(btn(/Generate E cases$/), 'Generate E cases', { wait: 3500 })
  await hold('E cases', btn(/Generate E cases$/), { w: 760, dur: 3, grow: { b: 300, r: 0 } })
}
CH.c04 = async () => {                                       // wind
  await panelScroll(btn(/Wind — NSCP 207B/i), 170, 10)
  await point(p.getByLabel(/V \(basic speed\)/).first(), 'Basic wind speed V', 'From the NSCP wind map — with exposure and topography Kzt')
  await point(p.getByLabel(/Exposure/).first(), 'Exposure', 'B suburban · C open terrain · D flat coastal')
  await click(btn(/Generate W cases/), 'Generate W cases', { wait: 3500 })
  await hold('W cases', btn(/Generate W cases/), { w: 760, dur: 3, grow: { b: 140 } })
}
CH.c05 = async () => {                                       // analysis options
  await click(tab('Analysis'), 'Analysis')
  await point(lab(/Cracked sections/), 'Cracked sections', 'Stiffness of cracked concrete: 0.35 Ig beams, 0.70 Ig columns (ACI 6.6.3.1.1)')
  await point(lab(/Shear deformation/), 'Shear deformation', 'Timoshenko members — shear flexibility, not just bending')
  await click(lab(/P-Δ second-order analysis/), 'P-Δ second order', { note: 'Gravity acting on the swayed frame — the second-order moments' })
  await click(lab(/Rigid floor diaphragm/), 'Rigid floor diaphragm', { note: 'Each floor moves as one rigid plate in its own plane' })
  await click(btn(/Analyze \(3D FEM\)/), 'Analyze (3D FEM)', { long: true })
}
CH.c06 = async () => {                                       // the results
  await panelScroll(p.getByRole('heading', { name: /Member Forces/ }), 170, 10)
  await hold('Member forces', p.getByRole('heading', { name: /Member Forces/ }), { w: 700, dur: 3.2, grow: { b: 520, l: 20 } })
  await panelScroll(p.getByRole('heading', { name: /Support Reactions/ }), 170, 14)
  await hold('Statics check', p.getByRole('heading', { name: /Support Reactions/ }), { w: 640, dur: 3.2, grow: { b: 330, l: 20 } })
  await panelScroll(p.getByRole('heading', { name: /Nodal Displacements/ }), 170, 9)
  await hold('Displacements', p.getByRole('heading', { name: /Nodal Displacements/ }), { w: 700, dur: 2.4, grow: { b: 480, l: 20 } })
  await click(tab('Display'), 'Display')
  await click(p.locator('label:has(input[name="contour"][value="member"])').first(), 'Beam / column stress', { wait: 5000 })
}
CH.c07 = async () => {                                       // modal
  await click(tab('Modal'), 'Modal')
  await click(btn(/Run modal analysis/), 'Run modal analysis', { long: true })
  await panelScroll(p.getByRole('heading', { name: /Modal Analysis — natural periods/ }), 160, 8)
  await hold('Periods & mass', p.getByRole('heading', { name: /Modal Analysis — natural periods/ }), { w: 640, dur: 3.4, grow: { b: 470, l: 20 } })
}
// The mode animation keeps the viewport rendering every frame from then on (and
// the fake clock it needs stays installed), so every later screenshot crawls in
// software WebGL. It gets its own pass, and is never replayed silently.
CH.c07b = async () => {
  await click(btn(/◎ 3D/), 'Animate mode 1 in 3D', { wait: 1500 })
  await anim(72, 2, 'Mode 1')
}
CH.c08 = async () => {                                       // pushover
  await click(tab('Pushover'), 'Pushover')
  await point(p.getByLabel(/Push direction/).first(), 'Push direction', 'Push +X with an inverted-triangle load pattern')
  await click(btn(/Run pushover/), 'Run pushover', { long: true })
  await panelScroll(p.getByRole('heading', { name: /Pushover capacity/ }), 160, 10)
  await hold('Capacity curve', p.getByRole('heading', { name: /Pushover capacity/ }), { w: 560, dur: 3.6, grow: { b: 420, l: 20 } })
  await panelScroll(p.locator('table', { hasText: 'Hinge' }).first(), 200, 8)
  await hold('Hinge events', p.locator('table', { hasText: 'Hinge' }).first(), { w: 640, dur: 2.6, grow: { t: 10 } })
}
CH.c09 = async () => {                                       // design → failures
  await click(tab('Design'), 'Design')
  await click(btn(/Design structure/), 'Design structure', { long: true })
  await panelScroll(p.getByText(/RC column schedule/).first(), 140, 10)
  const chip = p.locator('text=/\\d+ failed/').first()
  await hold('failures', p.getByText(/RC column schedule/).first(), { w: 1150, dur: 2.8, grow: { b: 420, r: 900 } })
  if (rec()) { tape.at(-1).failText = await p.evaluate(() => [...document.body.innerText.matchAll(/(RC [a-z &]+schedule|Slab schedule|Footing schedule)\s*(\d+) failed/gi)].map((m) => `${m[1]}: ${m[2]}`)); save(); log('fails', JSON.stringify(tape.at(-1).failText)) }
  void chip
}
CH.c10 = async () => {                                       // optimise → pass → one row's solution
  await panelScroll(p.locator('main').first(), 0, 10)
  await click(btn(/Optimi[sz]e design/), 'Optimize design', { long: true })
  await panelScroll(p.getByText(/RC column schedule/).first(), 140, 10)
  await hold('all passed', p.getByText(/RC column schedule/).first(), { w: 1150, dur: 2.4, grow: { b: 420, r: 900 } })
  if (rec()) { tape.at(-1).failText = await p.evaluate(() => [...document.body.innerText.matchAll(/(\d+) failed/g)].map((m) => m[0])); save(); log('after optimise', JSON.stringify(tape.at(-1).failText)) }
  const row = p.locator('tr', { hasText: /^\s*▸?\s*c0\.0\.0/ }).first()
  await click(row.locator('td').first(), 'Open column c0.0.0', { wait: 3000, note: 'Every row opens its worked solution — steps, clauses and drawings' })
  const head = p.getByRole('heading', { name: /c0\.0\.0 — worked solution/ })
  await panelScroll(head, 120, 8)
  await hold('Bar layout', head, { w: 1150, dur: 2.8, grow: { b: 560, r: 600 } })
  for (const re of [/Capacity along the strong-axis/, /Biaxial check — Bresler/, /Bar selection & limits/]) {
    const h = p.getByRole('heading', { name: re }).first()
    await panelScroll(h, 120, 8)
    await hold(re.source, h, { w: 1150, dur: 2.6, grow: { b: 560, r: 600 } })
  }
  await panelScroll(p.locator('main').first(), 0, 12)
}
CH.c13 = async () => {                                       // cages, loads hidden
  await click(tab('Display'), 'Display')
  await click(p.locator('input[name="contour"][value="none"]').locator('xpath=ancestor::label[1]'), 'Contour: None', { wait: 2500 })
  await click(lab(/Show load diagrams on the model/), 'Hide the loads', { wait: 2500, note: 'Load arrows off — a clean view of the steel' })
  if (!rec()) return                                          // STATE mode: contour off + loads off is all later chapters see
  await click(lab(/Show reinforcement cages/), 'Show reinforcement cages', { wait: 12000 })
  await click(p.locator('label', { hasText: /^\s*Slabs/ }).first(), 'Slabs off', { wait: 6000, note: 'Pick which cages to show — beams, columns, slabs, footings' })
  await orbit(40, 5, 'Drag to orbit')
  await click(lab(/Show reinforcement cages/), 'Show reinforcement cages', { wait: 3000 })
}
CH.c14 = async () => {                                       // plans, sheet by sheet
  await click(tab('Plans'), 'Plans', { wait: 7000 })
  await click(p.getByRole('button', { name: '⛶' }).nth(1), 'Open a sheet', { wait: 2500 })
  for (let k = 0; k < 6; k++) await click(p.getByRole('button', { name: /^(›|next)/i }).last(), 'Next sheet', { wait: 1800 })
  await click(p.getByRole('button', { name: /Close/ }).first(), 'Close', { wait: 1200 })
}
CH.c15 = async () => {                                       // the report
  await click(p.getByRole('button', { name: /^PDF/ }).first(), 'PDF report', { wait: 1500 })
  const d = p.getByRole('dialog')
  await point(d.locator('label', { hasText: /Analysis & design status/ }), 'Design status', 'Every analysis and check, exactly as the engine reported it', { dwell: 2 })
  await point(d.locator('label', { hasText: /Traceability/ }), 'Traceability', 'Governing case → demand → required steel → the bars scheduled', { dwell: 2 })
  await point(d.locator('label', { hasText: /Worked solutions/ }), 'Worked solutions', 'Every member, step by step, with its cage figures', { dwell: 2 })
  await point(d.locator('label', { hasText: /^\s*Drawings/ }), 'Drawings', 'The plan and detail sheet set', { dwell: 1.8 })
  await point(d.locator('label', { hasText: /D · Modal/ }), 'Appendix D · Modal', 'Unlocked because modal was run — periods, modes, spectrum', { dwell: 2 })
  await point(d.locator('label', { hasText: /F · Pushover/ }), 'Appendix F · Pushover', 'Unlocked because pushover was run — curve and hinge sequence', { dwell: 2 })
  await click(d.locator('label', { hasText: /Combined PDF/ }), 'Combined PDF', { note: 'Report and appendix bound as one document' })
  await click(d.getByRole('button', { name: /^Generate$/ }), 'Generate', { download: 'report.pdf' })
  await p.keyboard.press('Escape'); await p.waitForTimeout(800)
}
CH.c16 = async () => {                                       // exchange
  await click(btn(/^Exchange$/), 'Exchange', { wait: 800 })
  const et = p.getByRole('menuitem', { name: /ETABS/ })
  await point(et, 'Export to ETABS (.e2k)', 'Also STAAD.Pro (.std) both ways, and every table to Excel', { dwell: 2.6 })
  await p.keyboard.press('Escape')
}

await p.goto((process.env.APP || 'http://localhost:5192') + '/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000)
await p.evaluate(() => scrollTo(0, 0))
for (const [id, fn] of Object.entries(CH)) {
  chapter = id
  mode = ONLY ? (id === ONLY ? 'rec' : 'silent') : SKIP.includes(id) ? 'state' : 'rec'
  if (id === 'c07b' && mode !== 'rec') continue
  if (ONLY && id > ONLY) break
  log('──', id, mode)
  await fn()
}
await b.close()
log('done', n, 'frames')
