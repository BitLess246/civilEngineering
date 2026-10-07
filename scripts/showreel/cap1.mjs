import { open, clean } from './lib.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = 'cap/m'; mkdirSync(OUT, { recursive: true }); mkdirSync('svg', { recursive: true })
const { b, p } = await open({ dpr: 2 })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const click = async (re, wait = 800) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(wait) }
const idle = async (t = 600000) => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: t, polling: 1000 }); await p.waitForTimeout(1500) }
const setField = async (re, v) => { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
const canvasBox = async () => p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
const step = async (name, fn) => { const t = Date.now(); try { await fn(); log('OK', name, ((Date.now() - t) / 1000).toFixed(0) + 's') } catch (e) { log('FAIL', name, e.message.split('\n')[0]) } }

await p.goto((process.env.APP || 'http://localhost:5192') + '/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000); await clean(p)

await step('chrome', async () => {
  // ribbon buttons and group labels; sidebar groups — as vector markup
  const ribbon = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((x) => { const r = x.getBoundingClientRect(); return r.top < 110 && r.left > 235 && x.querySelector('svg') && x.innerText.trim() })
    return btns.map((x) => { const r = x.getBoundingClientRect(); return { label: x.innerText.trim(), svg: x.querySelector('svg').outerHTML, x: r.x, y: r.y, w: r.width, h: r.height, active: getComputedStyle(x).backgroundColor } })
  })
  const groups = await p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /^(MODEL|ANALYSE|RESULTS|UTILITIES|FILE)$/.test(e.textContent.trim()) && e.getBoundingClientRect().top < 120).map((e) => ({ label: e.textContent.trim(), x: e.getBoundingClientRect().x })))
  const side = await p.evaluate(() => {
    const nav = document.querySelector('nav') ?? document.querySelector('aside')
    const out = []
    for (const el of nav.querySelectorAll('a, button')) { const r = el.getBoundingClientRect(); const t = el.innerText.trim().replace(/\s+/g, ' '); if (t) out.push({ t, svg: el.querySelector('svg')?.outerHTML ?? null, y: r.y, h: r.height }) }
    return out
  })
  writeFileSync('svg/chrome.json', JSON.stringify({ ribbon, groups, side }, null, 1))
  await p.screenshot({ path: `${OUT}/rail.png`, clip: { x: 0, y: 0, width: 230, height: 1000 } })
  await p.screenshot({ path: `${OUT}/ribbon.png`, clip: { x: 230, y: 44, width: 1370, height: 77 } })
})
await step('geometry', async () => {
  await tab('Geometry').click(); await p.waitForTimeout(600)
  await setField(/Bays X/i, '6, 6, 6'); await setField(/Bays Z/i, '6, 6'); await setField(/Storey heights/i, '3.5, 3, 3, 3, 3')
  await p.screenshot({ path: `${OUT}/panel_geometry.png`, clip: { x: 1204, y: 137, width: 380, height: 240 } })
  await click(/Regenerate grid model/, 5000)
  await clean(p)
  await p.screenshot({ path: `${OUT}/full_model.png` })
  const bx = await canvasBox()
  const cx = bx.x + bx.width / 2, cy = bx.y + bx.height / 2
  await p.mouse.move(cx, cy); await p.mouse.down()
  for (let k = 0; k < 48; k++) {
    await p.mouse.move(cx - (k + 1) * 7, cy, { steps: 2 }); await p.waitForTimeout(150)
    await p.screenshot({ path: `${OUT}/orbit_${String(k).padStart(2, '0')}.png`, clip: bx })
  }
  await p.mouse.up()
  writeFileSync(`${OUT}/canvas.json`, JSON.stringify(bx))
})
await step('loading', async () => {
  await tab('Loading').click(); await p.waitForTimeout(900); await clean(p)
  await p.screenshot({ path: `${OUT}/full_loading.png` })
  await click(/Generate E cases$/, 4000)
  await p.screenshot({ path: `${OUT}/full_loading_E.png` })
})
await step('analysis', async () => {
  await tab('Analysis').click(); await p.waitForTimeout(700)
  await click(/Analyze \(3D FEM\)/, 1500); await idle()
  await clean(p)
  await p.screenshot({ path: `${OUT}/full_analysis.png` })
  const bx = await canvasBox()
  await tab('Display').click(); await p.waitForTimeout(900)
  await p.screenshot({ path: `${OUT}/full_display.png` })
  await p.locator('input[name="contour"][value="member"]').check().catch((e) => log('no member contour', e.message)); await p.waitForTimeout(5000)
  await p.screenshot({ path: `${OUT}/canvas_stress.png`, clip: bx })
  await p.locator('input[name="contour"][value="displacement"]').check().catch(() => {}); await p.waitForTimeout(5000)
  await p.screenshot({ path: `${OUT}/canvas_disp.png`, clip: bx })
  const vals = [0, 0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4]
  for (let k = 0; k < vals.length; k++) {
    await p.evaluate((v) => {
      const el = document.querySelector('input[aria-label="Deformation exaggeration"]'); if (!el) return
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
    }, vals[k])
    await p.waitForTimeout(1500)
    await p.screenshot({ path: `${OUT}/exag_${String(k).padStart(2, '0')}.png`, clip: bx })
  }
  await p.locator('input[name="contour"][value="off"]').check().catch(() => {}); await p.waitForTimeout(1500)
})
await step('modal', async () => {
  await tab('Modal').click(); await p.waitForTimeout(700)
  await click(/Run modal analysis/, 1500); await idle()
  await clean(p)
  await p.screenshot({ path: `${OUT}/full_modal.png` })
  const svgs = await p.evaluate(() => [...document.querySelectorAll('svg')].filter((s) => s.getBoundingClientRect().width > 250).map((s) => s.outerHTML))
  writeFileSync('svg/modal.json', JSON.stringify(svgs))
})
await step('design', async () => {
  await tab('Design').click(); await p.waitForTimeout(700)
  await click(/Design structure/, 1500); await idle()
  await clean(p)
  await p.screenshot({ path: `${OUT}/full_design.png` })
  await p.screenshot({ path: `${OUT}/full_design_page.png`, fullPage: true })
})
await b.close()
