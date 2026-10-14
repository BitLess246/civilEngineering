// Continuous tour capture → cap/tour2/: one screenshot per UI change (2×,
// JPEG) and a TAPE of every interaction — the box of each button clicked, the
// text typed key by key, scrolls and drags step by step — so the compositor can
// replay it as ONE unbroken screen recording: the cursor travels to each real
// button, clicks it, the page changes under it. No cuts between views.
//   node tour/tape.mjs   (dev server on :5192)
// Resume a capture with FROM=c08 [UNTIL=c08] [DPR=1]: the chapters before FROM
// replay silently to rebuild the model state, the tape keeps what it had before
// FROM, and frame numbers carry on. (The cage view hangs a 2× WebGL screenshot,
// so c08 is captured at 1×; the compositor scales every frame to 1600 css.)
import { open, clean } from '../lib.mjs'
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs'
const OUT = 'cap/tour2', FROM = process.env.FROM, UNTIL = process.env.UNTIL || 'c99'
if (!FROM) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const { b, p } = await open({ dpr: +(process.env.DPR || 2), w: 1600, h: 900 })
p.setDefaultTimeout(180000)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const kept = FROM ? JSON.parse(readFileSync(`${OUT}/tape.json`, 'utf8')).filter((s) => s.chapter < FROM) : []
const real = [...kept]
let n = Math.max(0, ...readdirSync(OUT).map((f) => +(f.match(/^f(\d+)\.jpg$/)?.[1] ?? 0))), chapter = 'c01'
const rec = () => !FROM || (chapter >= FROM && chapter <= UNTIL)
const scratch = []
const tape = new Proxy(real, { get: (t, k) => { const a = rec() ? real : scratch; const v = a[k]; return typeof v === 'function' ? v.bind(a) : v } })
const shot = async () => {
  if (!rec()) return null
  const f = `f${String(++n).padStart(4, '0')}.jpg`
  await p.screenshot({ path: `${OUT}/${f}`, type: 'jpeg', quality: 88, timeout: 240000 })
  return f
}
const boxOf = async (loc) => { const r = await loc.boundingBox(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }
const save = () => writeFileSync(`${OUT}/tape.json`, JSON.stringify(real, null, 1))
const tab = (name) => p.getByRole('button', { name, exact: true }).first()
const btn = (re) => p.getByRole('button', { name: re }).first()
const busy = () => p.evaluate(() => /⏳/.test(document.body.innerText))
const idle = async () => { await p.waitForTimeout(600); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: 900000, polling: 800 }); await p.waitForTimeout(1500) }

/** Click a real control: the cursor goes to its box, the callout names it. */
async function click(loc, label, { wait = 900, long = false, after = null } = {}) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const box = await boxOf(loc)
  const step = { chapter, kind: 'click', label, box, frames: [] }
  tape.push(step)
  await loc.click()
  if (long) {
    await p.waitForTimeout(700)
    if (await busy()) step.frames.push({ f: await shot(), busy: true })
    await idle()
  } else await p.waitForTimeout(wait)
  if (after) await after()
  await clean(p)
  step.frames.push({ f: await shot() })
  save(); log('click', label, step.frames.length)
}
/** Type into a field, one frame per keystroke. */
async function type(loc, text, label) {
  const box = await boxOf(loc)
  tape.push({ chapter, kind: 'click', label, box, frames: [] })
  await loc.click(); await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace')
  const step = { chapter, kind: 'type', box, text, frames: [{ f: await shot() }] }
  tape.push(step)
  for (const ch of text) { await p.keyboard.type(ch); step.frames.push({ f: await shot() }) }
  await loc.press('Tab'); save(); log('type', text)
}
/** Scroll the page in visible steps. */
async function scroll(dy, steps = 8) {
  const step = { chapter, kind: 'scroll', dy, frames: [] }
  tape.push(step)
  for (let k = 0; k < steps; k++) { await p.evaluate((d) => scrollBy(0, d), dy / steps); await p.waitForTimeout(250); step.frames.push({ f: await shot(), y: await p.evaluate(() => scrollY) }) }
  save(); log('scroll', dy)
}
/** Scroll so an element sits near the top, in visible steps. */
async function scrollTo(loc, top = 120, steps = 8) {
  const r = await loc.boundingBox(); await scroll(r.y - top, steps)
}
/** Orbit the 3D view: a press-drag with the cursor on the canvas. */
async function orbit(frames, dx, label) {
  const c = await p.evaluate(() => { const el = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const x0 = c.x + c.w * 0.62, y0 = c.y + c.h * 0.55
  const step = { chapter, kind: 'drag', label, box: { x: x0 - 1, y: y0 - 1, w: 2, h: 2 }, frames: [] }
  tape.push(step)
  await p.mouse.move(x0, y0); await p.mouse.down()
  for (let k = 0; k < frames; k++) {
    const x = x0 - (k + 1) * dx, y = y0 + Math.sin((k / frames) * Math.PI) * 8
    await p.mouse.move(x, y, { steps: 2 }); await p.waitForTimeout(120)
    step.frames.push({ f: await shot(), pos: { x, y } })
  }
  await p.mouse.up(); save(); log('orbit', frames)
}
const hold = async (label) => { tape.push({ chapter, kind: 'hold', label, frames: [{ f: await shot() }] }); save() }

await p.goto((process.env.APP || 'http://localhost:5192') + '/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000); await clean(p)
await p.evaluate(() => scrollTo(0, 0))
tape.push({ chapter: 'c01', kind: 'start', frames: [{ f: await shot() }] })

// 01 — the grid
chapter = 'c01'
await click(tab('Geometry'), 'Geometry')
await type(p.getByLabel(/Bays X/i).first(), '5, 5, 5', 'Bays X')
await type(p.getByLabel(/Bays Z/i).first(), '5, 5', 'Bays Z')
await type(p.getByLabel(/Storey heights/i).first(), '3.5, 3, 3, 3', 'Storey heights')
await click(btn(/Regenerate grid model/), 'Regenerate grid model', { wait: 4500 })
// 02 — orbit
chapter = 'c02'
await orbit(28, 9, 'Drag to orbit')
// 03 — loads
chapter = 'c03'
await click(tab('Loading'), 'Loading')
await click(btn(/Generate E cases$/), 'Generate E cases', { wait: 3500 })
// 04 — analysis + stress
chapter = 'c04'
await click(tab('Analysis'), 'Analysis')
await click(btn(/Analyze \(3D FEM\)/), 'Analyze (3D FEM)', { long: true })
await click(tab('Display'), 'Display')
await click(p.locator('label:has(input[name="contour"][value="member"])').first(), 'Beam / column stress', { wait: 5000 })
// 05 — modal
chapter = 'c05'
await click(tab('Modal'), 'Modal')
await click(btn(/Run modal analysis/), 'Run modal analysis', { long: true })
// 06 — design → the failures
chapter = 'c06'
await click(tab('Design'), 'Design')
await click(btn(/Design structure/), 'Design structure', { long: true })
const colHead = p.getByText(/RC column schedule/).first()
await scrollTo(colHead, 140, 10)
await hold('failures')
tape.at(-1).marks = { chip: await boxOf(p.locator('text=/\\d+ failed/').first()) }
tape.at(-1).failText = await p.evaluate(() => [...new Set([...document.body.innerText.matchAll(/(RC [a-z &]+schedule|Slab schedule)\s*(\d+) failed/gi)].map((m) => `${m[1]}: ${m[2]}`))])
save(); log('fails', JSON.stringify(tape.at(-1).failText))
// 07 — optimise → pass
chapter = 'c07'
await scroll(-(await p.evaluate(() => scrollY)), 10)
await click(btn(/Optimi[sz]e design/), 'Optimize design', { long: true })
await scrollTo(p.getByText(/RC column schedule/).first(), 140, 10)
await hold('passes')
tape.at(-1).marks = { heading: await boxOf(p.getByText(/RC column schedule/).first()) }
tape.at(-1).failText = await p.evaluate(() => [...document.body.innerText.matchAll(/(\d+) failed/g)].map((m) => m[0]))
save(); log('after optimise', JSON.stringify(tape.at(-1).failText))
await scroll(-(await p.evaluate(() => scrollY)), 10)
// 08 — cages
chapter = 'c08'
await click(tab('Display'), 'Display')
await click(p.locator('input[name="contour"][value="none"]').locator('xpath=ancestor::label[1]'), 'None', { wait: 2500 })
await click(p.getByLabel(/Show reinforcement cages/).locator('xpath=ancestor::label[1]'), 'Show reinforcement cages', { wait: 12000 })
await orbit(20, 11, 'Drag to orbit')
await click(p.getByLabel(/Show reinforcement cages/).locator('xpath=ancestor::label[1]'), 'Show reinforcement cages', { wait: 3000 })
if (UNTIL === 'c08') { await b.close(); log('done', n, 'frames'); process.exit(0) }
// 09 — plans
chapter = 'c09'
await click(tab('Plans'), 'Plans', { wait: 7000 })
// 10 — report
chapter = 'c10'
await click(p.getByRole('button', { name: /^PDF/ }).first(), 'PDF report', { wait: 1500 })
const dlBtn = p.getByRole('dialog').getByRole('button', { name: /Download|Export|Generate|Create/i }).last()
const box = await boxOf(dlBtn)
const stepDl = { chapter, kind: 'click', label: (await dlBtn.innerText()).trim() || 'Download', box, frames: [] }
tape.push(stepDl)
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), dlBtn.click()])
await dl.saveAs(`${OUT}/report.pdf`); await p.waitForTimeout(800)
stepDl.frames.push({ f: await shot() }); save(); log('pdf saved')
await p.keyboard.press('Escape'); await p.waitForTimeout(800)
// 11 — exchange
chapter = 'c11'
await click(btn(/^Exchange$/), 'Exchange', { wait: 800 })
const et = p.getByRole('menuitem', { name: /ETABS/ })
await et.hover(); await p.waitForTimeout(500)
tape.push({ chapter, kind: 'hover', label: 'Export to ETABS (.e2k)', box: await boxOf(et), frames: [{ f: await shot() }] })
save()
await p.keyboard.press('Escape')
await b.close()
log('done', n, 'frames')
