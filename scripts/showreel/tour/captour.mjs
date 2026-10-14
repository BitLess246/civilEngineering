// Model Space tour capture → cap/tour/: stills (2×, JPEG) + element boxes
// (CSS px) for the compositor's cursor and highlight boxes, plus orbit and
// deformation sequences of the 3D canvas.
import { open, clean } from '../lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
const OUT = 'cap/tour'; mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
const { b, p } = await open({ dpr: 2, w: 1600, h: 900 })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const btn = (re) => p.getByRole('button', { name: re }).first()
const click = async (re, wait = 800) => { await btn(re).click(); await p.waitForTimeout(wait) }
const idle = async (t = 600000) => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: t, polling: 1000 }); await p.waitForTimeout(1500) }
const setField = async (re, v) => { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
const box = async (loc) => { const r = await loc.boundingBox().catch(() => null); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }
const boxes = {}
const still = async (name, marks = {}) => {
  await clean(p); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })
  boxes[name] = {}
  for (const [k, loc] of Object.entries(marks)) boxes[name][k] = await box(loc)
  writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1)); log('still', name, JSON.stringify(boxes[name]))
}
const canvasBox = async () => p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
const orbit = async (name, n, dx = 6) => {
  const bx = await canvasBox(); mkdirSync(`${OUT}/${name}`, { recursive: true })
  const cx = bx.x + bx.width * 0.5, cy = bx.y + bx.height * 0.6
  await p.mouse.move(cx, cy); await p.mouse.down()
  for (let k = 0; k < n; k++) {
    await p.mouse.move(cx - (k + 1) * dx, cy + Math.sin(k / n * Math.PI) * 6, { steps: 2 }); await p.waitForTimeout(120)
    await p.screenshot({ path: `${OUT}/${name}/${String(k).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 88, clip: bx })
  }
  await p.mouse.up(); boxes[name] = { canvas: { x: bx.x, y: bx.y, w: bx.width, h: bx.height }, n }
  writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1)); log('orbit', name, n)
}

await p.goto((process.env.APP || 'http://localhost:5192') + '/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000); await clean(p)
// ── 1 geometry ──
await tab('Geometry').click(); await p.waitForTimeout(600)
await still('s01_open', { bays: p.getByLabel(/Bays X/i).first(), regen: btn(/Regenerate grid model/) })
await setField(/Bays X/i, '6, 6, 6'); await setField(/Bays Z/i, '6, 6'); await setField(/Storey heights/i, '3.5, 3, 3, 3, 3, 3')
await still('s02_typed', { bays: p.getByLabel(/Bays X/i).first(), baysZ: p.getByLabel(/Bays Z/i).first(), storeys: p.getByLabel(/Storey heights/i).first(), regen: btn(/Regenerate grid model/) })
await click(/Regenerate grid model/, 5000)
await still('s03_model', { regen: btn(/Regenerate grid model/) })
await orbit('o1_model', 48, 7)
// ── 2 loads ──
await tab('Loading').click(); await p.waitForTimeout(900)
await click(/Generate E cases$/, 4000)
await still('s04_loads', { gen: btn(/Generate E cases$/), table: p.locator('table').first() })
// ── 3 analysis ──
await tab('Analysis').click(); await p.waitForTimeout(700)
await click(/Analyze \(3D FEM\)/, 1500); await idle()
await still('s05_analysis', { analyze: btn(/Analyze \(3D FEM\)/), forces: p.getByText(/Member Forces/).first() })
await tab('Display').click(); await p.waitForTimeout(900)
await p.locator('input[name="contour"][value="member"]').check().catch((e) => log('contour', e.message)); await p.waitForTimeout(5000)
await still('s06_stress', { contour: p.locator('input[name="contour"][value="member"]') })
const bxc = await canvasBox(); mkdirSync(`${OUT}/d_deform`, { recursive: true })
const vals = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]
for (let k = 0; k < vals.length; k++) {
  await p.evaluate((v) => { const el = document.querySelector('input[aria-label="Deformation exaggeration"]'); if (!el) return
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }, vals[k])
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${OUT}/d_deform/${String(k).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 88, clip: bxc })
}
boxes.d_deform = { canvas: { x: bxc.x, y: bxc.y, w: bxc.width, h: bxc.height }, n: vals.length }
await p.evaluate(() => { const el = document.querySelector('input[aria-label="Deformation exaggeration"]'); if (!el) return
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '0'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
await orbit('o2_stress', 60, 6)
await p.locator('input[name="contour"][value="off"]').check().catch(() => {}); await p.waitForTimeout(1500)
// ── 4 modal ──
await tab('Modal').click(); await p.waitForTimeout(700)
await click(/Run modal analysis/, 1500); await idle()
await still('s07_modal', { run: btn(/Run modal analysis/), table: p.getByText(/natural periods/i).first() })
// ── 5 design → fail → optimise → pass ──
await tab('Design').click(); await p.waitForTimeout(700)
await click(/Design structure/, 1500); await idle()
await still('s08_design_top', { design: btn(/Design structure/), optimise: btn(/Optimi[sz]e design/) })
const sched = p.getByText(/RC beam & girder schedule/).first()
await sched.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 260)); await p.waitForTimeout(800)
await still('s09_schedule_fail', { heading: sched, chip: p.getByText(/\d+ failed/).first(), firstFail: p.locator('tr:has-text("End i (hog)")').first() })
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500)
await click(/Optimi[sz]e design/, 1500); await idle()
await still('s10_optimised_top', { optimise: btn(/Optimi[sz]e design/) })
await sched.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 260)); await p.waitForTimeout(800)
await still('s11_schedule_pass', { heading: sched, chip: p.getByText(/\d+ failed/).first() })
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500)
// ── 6 cages ──
await tab('Display').click(); await p.waitForTimeout(800)
await p.getByLabel(/Show reinforcement cages/).check().catch((e) => log('cages', e.message)); await p.waitForTimeout(6000)
await still('s12_cages', { cages: p.getByLabel(/Show reinforcement cages/) })
await orbit('o3_cages', 48, 6)
await p.getByLabel(/Show reinforcement cages/).uncheck().catch(() => {}); await p.waitForTimeout(2000)
// ── 7 plans ──
await tab('Plans').click(); await p.waitForTimeout(6000)
await still('s13_plans', { framing: p.getByText(/Ground Floor framing plan/i).first(), notes: p.getByText(/GENERAL NOTES/i).first() })
// ── 8 report ──
await p.getByRole('button', { name: /^PDF/ }).first().click(); await p.waitForTimeout(1500)
await still('s14_pdf_dialog', { dialog: p.getByRole('dialog').first() })
const dl = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.getByRole('dialog').getByRole('button', { name: /Download|Export|Generate|Create/i }).last().click()]).then(([d]) => d).catch((e) => { log('pdf', e.message.split('\n')[0]); return null })
if (dl) { await dl.saveAs(`${OUT}/report.pdf`); log('pdf saved') }
await p.keyboard.press('Escape'); await p.waitForTimeout(800)
// ── 9 exchange ──
await click(/^Exchange$/, 700)
await still('s15_exchange', { menu: p.getByRole('menu').first(), etabs: p.getByRole('menuitem', { name: /ETABS/ }), staad: p.getByRole('menuitem', { name: /Export to STAAD/ }), excel: p.getByRole('menuitem', { name: /Excel/ }) })
await p.keyboard.press('Escape')
await b.close()
