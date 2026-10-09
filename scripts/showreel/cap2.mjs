import { open, clean } from './lib.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = 'cap/d'; mkdirSync(OUT, { recursive: true })
const { b, p } = await open({ dpr: 2 })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const click = async (re, wait = 800) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(wait) }
const idle = async (t = 1200000) => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: t, polling: 1000 }); await p.waitForTimeout(1500) }
const setField = async (re, v) => { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
const step = async (name, fn) => { const t = Date.now(); try { await fn(); log('OK', name, ((Date.now() - t) / 1000).toFixed(0) + 's') } catch (e) { log('FAIL', name, e.message.split('\n')[0]) } }
const tables = () => p.evaluate(() => [...document.querySelectorAll('h3')].filter((h) => /schedule|ratios|weak beam/i.test(h.textContent)).map((h) => {
  const box = h.parentElement, t = box.querySelector('table'); if (!t) return null
  const head = [...t.querySelectorAll('thead th')].map((x) => x.innerText.trim())
  const rows = [...t.querySelectorAll('tbody > tr')].filter((r) => r.children.length >= 3).slice(0, 40).map((r) => ({ cells: [...r.children].map((c) => c.innerText.trim().replace(/\s+/g, ' ')), fail: /fail/.test(r.className) }))
  return { title: h.innerText.trim().replace(/\s+/g, ' '), head, rows }
}).filter(Boolean))

await p.goto((process.env.APP || 'http://localhost:5192') + '/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000); await clean(p)
await step('build', async () => {
  await tab('Geometry').click(); await p.waitForTimeout(600)
  await setField(/Bays X/i, '6, 6, 6'); await setField(/Bays Z/i, '6, 6'); await setField(/Storey heights/i, '3.5, 3, 3, 3, 3')
  await click(/Regenerate grid model/, 5000)
  await tab('Loading').click(); await p.waitForTimeout(900); await click(/Generate E cases$/, 4000)
  await tab('Analysis').click(); await p.waitForTimeout(700); await click(/Analyze \(3D FEM\)/, 1500); await idle()
  await tab('Design').click(); await p.waitForTimeout(700); await click(/Design structure/, 1500); await idle()
})
await step('tables-before', async () => { writeFileSync(`${OUT}/tables_before.json`, JSON.stringify(await tables(), null, 1)) })
await step('solution', async () => {
  await clean(p)
  const row = p.locator('h3:has-text("RC beam") ~ table tbody tr, h3:has-text("RC beam") + * tbody tr').first()
  const r0 = (await row.count()) ? row : p.locator('table tbody tr.cursor-pointer').first()
  await r0.scrollIntoViewIfNeeded(); await r0.click(); await p.waitForTimeout(3000)
  // every solution step card and every svg drawing in the opened row
  const det = p.locator('tr:has(td[colspan]) >> nth=0')
  const svgs = await p.evaluate(() => [...document.querySelectorAll('td[colspan] svg')].filter((s) => s.getBoundingClientRect().width > 200).map((s) => s.outerHTML))
  writeFileSync(`${OUT}/row_svgs.json`, JSON.stringify(svgs))
  const steps = p.locator('td[colspan] h3, td[colspan] [class*="step"]')
  const cards = await p.evaluate(() => {
    const hs = [...document.querySelectorAll('td[colspan] h3, td[colspan] h4')]
    return hs.map((h, i) => { h.setAttribute('data-cap', 'c' + i); return h.innerText.trim() })
  })
  log('steps', cards.length, cards.slice(0, 12).join(' | '))
  for (let i = 0; i < Math.min(cards.length, 14); i++) {
    const h = p.locator(`[data-cap="c${i}"]`)
    const card = h.locator('xpath=ancestor::*[contains(@class,"rounded")][1]')
    const el = (await card.count()) ? card : h
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(150)
    await el.screenshot({ path: `${OUT}/sol_${String(i).padStart(2, '0')}.png` }).catch((e) => log('sol fail', i, e.message.slice(0, 80)))
  }
  writeFileSync(`${OUT}/sol_titles.json`, JSON.stringify(cards))
  await r0.click(); await p.waitForTimeout(800)
})
await step('optimize', async () => {
  await p.evaluate(() => scrollTo(0, 0))
  await tab('Design').click(); await p.waitForTimeout(700)
  await click(/Optimize design/, 1500); await idle()
  await clean(p)
  await p.screenshot({ path: `${OUT}/full_optimized.png` })
  writeFileSync(`${OUT}/tables_after.json`, JSON.stringify(await tables(), null, 1))
  const summary = await p.evaluate(() => document.body.innerText.match(/.{0,200}(Optimi[sz]ed|optimi[sz]er).{0,400}/s)?.[0])
  writeFileSync(`${OUT}/opt_summary.txt`, summary ?? '')
})
await step('plans', async () => {
  await p.evaluate(() => scrollTo(0, 0))
  await tab('Plans').click(); await p.waitForTimeout(5000); await clean(p)
  await p.screenshot({ path: `${OUT}/full_plans.png` })
  const sheets = await p.evaluate(() => [...document.querySelectorAll('[aria-label^="View "]')].map((e) => ({ label: e.getAttribute('aria-label'), svg: e.querySelector('svg')?.outerHTML ?? null })).filter((x) => x.svg))
  log('sheets', sheets.length, sheets.map((s) => s.label).slice(0, 30).join(' | '))
  writeFileSync(`${OUT}/plans.json`, JSON.stringify(sheets))
})
await b.close()
