// Map every panel the v3 tour touches: outline (headings, controls, tables)
// and a full-page screenshot per stage → cap/probe3/.   node tour/probe3.mjs
import { open, clean } from '../lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
const OUT = 'cap/probe3'; mkdirSync(OUT, { recursive: true })
const { b, p } = await open({ dpr: 1, w: 1600, h: 900 })
p.setDefaultTimeout(120000)
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const btn = (re) => p.getByRole('button', { name: re }).first()
const idle = async () => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: 900000, polling: 800 }); await p.waitForTimeout(1500) }
const outline = () => p.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const out = []
  for (const el of document.querySelectorAll('main h1,main h2,main h3,main h4,main legend,main label,main button,main select,main table,main summary,main [role=tab],main canvas,main svg[data-plan],main details')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect(), y = Math.round(r.y + scrollY), x = Math.round(r.x)
    const tag = el.tagName.toLowerCase()
    let s = ''
    if (tag === 'label') { const i = el.querySelector('input'); s = `${i ? `[${i.type}${i.checked ? ' ✓' : ''}${i.disabled ? ' disabled' : ''}]` : ''} ${el.innerText.trim().replace(/\s+/g, ' ').slice(0, 140)}` }
    else if (tag === 'select') s = `{${[...el.options].map((o) => (o.selected ? '*' : '') + o.text).join(' | ').slice(0, 300)}}`
    else if (tag === 'table') s = `TABLE ${[...el.querySelectorAll('th')].map((t) => t.innerText.trim()).join(' · ').slice(0, 200)} rows=${el.querySelectorAll('tbody tr').length}`
    else if (tag === 'canvas') s = `CANVAS ${Math.round(r.width)}x${Math.round(r.height)}`
    else s = el.innerText.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (s) out.push(`${String(y).padStart(5)} ${String(x).padStart(4)} ${tag.padEnd(7)} ${s}`)
  }
  return out.join('\n')
})
const scrollers = () => p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 20 }).map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName}.${(e.className + '').slice(0, 60)} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)} sh=${e.scrollHeight}` }))
async function dump(name) {
  await clean(p)
  writeFileSync(`${OUT}/${name}.txt`, (await outline()) + '\n\nSCROLLERS\n' + (await scrollers()).join('\n'))
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('dumped', name)
}
await p.goto('http://localhost:5192/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000)
await tab('Geometry').click(); await p.waitForTimeout(600)
for (const [re, v] of [[/Bays X/i, '5, 5, 5'], [/Bays Z/i, '5, 5'], [/Storey heights/i, '3.5, 3, 3, 3']]) { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
await btn(/Regenerate grid model/).click(); await p.waitForTimeout(4000)
await tab('Analysis').click(); await p.waitForTimeout(800); await btn(/Analyze \(3D FEM\)/).click(); await idle()
await tab('Modal').click(); await p.waitForTimeout(800); await btn(/Run modal analysis/).click(); await idle()
await p.getByRole('button', { name: /◎ 3D/ }).first().click(); await p.waitForTimeout(3000); await dump('31_modal_3d')
await tab('Pushover').click(); await p.waitForTimeout(800); await btn(/Run pushover/).click(); await idle(); await dump('41_pushover_after')
await tab('Design').click(); await p.waitForTimeout(800); await btn(/Design structure/).click(); await idle()
await btn(/Optimi[sz]e design/).click(); await idle()
const row = p.locator('tr', { hasText: /^\s*▸?\s*c0\.0\.0/ }).first(); await row.scrollIntoViewIfNeeded(); await row.click(); await p.waitForTimeout(3000); await dump('51_row_open')
await tab('Plans').click(); await p.waitForTimeout(6000)
await p.getByRole('button', { name: '⛶' }).nth(1).click(); await p.waitForTimeout(2500); await dump('61_plan_full')
await b.close()
