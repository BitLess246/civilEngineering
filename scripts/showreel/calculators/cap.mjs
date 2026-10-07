// Capture each standalone calculator as components: its fields, its result
// cards, its drawing-sheet SVGs (computed styles inlined) and the KaTeX of its
// worked solution. Also the sidebar, for the tool catalogue.
//   node cap.mjs            every route below
//   node cap.mjs /slope     just those routes
// A route may carry input overrides, `/route+ok|Label=value`: the reel shows
// the steel beam and the weld at inputs that pass (their defaults fail), and
// keeps the weld's failing default too, for the FAIL → PASS beat.
import { open, clean } from '../lib.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const APP = process.env.APP || 'http://localhost:5192'
const ROUTES = [
  '/beam-design', '/tbeam-design', '/column-design', '/foundation', '/punching-shear', '/pile-cap', '/combined', '/stair', '/dev-length', '/water-tank',
  '/steel/beam', '/steel/beam+ok|W-shape=W460x74', '/bolted-connection', '/welded-connection', '/welded-connection+ok|Fillet leg w=12',
  '/slope', '/retaining-wall', '/earth-pressure', '/bearing-capacity', '/lateral-pile', '/settlement', '/pile-capacity',
  '/hydraulic-jump', '/gvf-profiles', '/pipe-flow', '/weir-flow', '/hydrostatic-force', '/curved-gate', '/buoyancy', '/culvert', '/detention', '/do-sag', '/muskingum',
  '/simple-curve', '/traverse', '/vertical-curves', '/superelevation', '/signal-timing', '/interest-factors', '/cash-flow-analysis', '/break-even', '/projectile-motion',
  '/beam-analysis', '/section-properties',
]
const only = process.argv.slice(2)
mkdirSync('cap/calc', { recursive: true })
const { b, p } = await open({ dpr: 1, w: 1600, h: 1000 })
if (!only.length) {
  // the sidebar: group headings with their counts, and the tools under them
  await p.goto(APP + '/slope', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500)
  const side = await p.evaluate(() => {
    const nav = document.querySelector('nav') ?? document.querySelector('aside')
    return [...nav.querySelectorAll('a, button')].map((el) => ({ t: el.innerText.trim().replace(/\s+/g, ' '), svg: el.querySelector('svg')?.outerHTML ?? null })).filter((x) => x.t)
  })
  writeFileSync('cap/side.json', JSON.stringify(side))
}
for (const arg of only.length ? ROUTES.filter((x) => only.includes(x.split('|')[0])) : ROUTES) {
  const [r0, ...sets] = arg.split('|')
  const ok = r0.endsWith('+ok'), r = r0.replace('+ok', '')
  const slug = r.replace(/^\//, '').replace(/\//g, '_') + (ok ? '_ok' : '')
  try {
    await p.goto(APP + r, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500); await clean(p)
    for (const kv of sets) {
      const [lab, val] = kv.split('=')
      const el = p.getByLabel(lab, { exact: false }).first()
      if (await el.evaluate((e) => e.tagName) === 'SELECT') await el.selectOption({ label: val }); else { await el.fill(val); await el.press('Tab') }
      await p.waitForTimeout(500)
    }
    await p.waitForTimeout(800)
    const main = await p.evaluate(() => {
      const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing']
      const ser = (svg) => {
        const q = svg.getBoundingClientRect()
        const c = svg.cloneNode(true)
        const src = [svg, ...svg.querySelectorAll('*')], dst = [c, ...c.querySelectorAll('*')]
        src.forEach((e, i) => {
          const cs = getComputedStyle(e), d = dst[i]
          if (cs.display === 'none') { d.setAttribute('data-x', '1'); return }
          for (const k of PROPS) { const v = cs.getPropertyValue(k); if (v) d.style.setProperty(k, v) }
          d.removeAttribute('class')
        })
        c.querySelectorAll('[data-x]').forEach((e) => e.remove())
        if (!c.getAttribute('viewBox')) c.setAttribute('viewBox', `0 0 ${q.width} ${q.height}`)
        c.setAttribute('width', Math.round(q.width)); c.setAttribute('height', Math.round(q.height))
        return { w: Math.round(q.width), h: Math.round(q.height), y: Math.round(q.y + scrollY), svg: c.outerHTML }
      }
      const title = document.querySelector('h1')?.innerText.trim()
      const desc = document.querySelector('h1')?.closest('div')?.parentElement?.querySelector('p')?.innerText.trim()
      // fields, in document order, with the section heading they sit under
      const form = [...document.querySelectorAll('label')].filter((l) => l.querySelector('input,select') && l.getBoundingClientRect().x < 560)
      const fields = form.map((l) => {
        const inp = l.querySelector('input,select')
        const spans = [...l.querySelectorAll(':scope > span')]
        let sec = ''
        for (let e = l; e && !sec; e = e.parentElement) {
          let s = e.previousElementSibling
          while (s && !sec) { const t = s.innerText?.trim(); if (t && t === t.toUpperCase() && /[A-Z]/.test(t) && t.length < 50 && !s.querySelector('input')) sec = t; s = s.previousElementSibling }
        }
        const val = inp.tagName === 'SELECT' ? inp.options[inp.selectedIndex]?.text : inp.type === 'checkbox' ? (inp.checked ? '✓' : '—') : inp.value
        const unit = l.querySelector('span.font-mono, span.border-l')?.innerText.trim() ?? ''
        return { sec, label: spans[0]?.innerText.trim() ?? '', value: val, unit, sel: inp.tagName === 'SELECT' }
      }).filter((f) => f.label && !/^(Project|Prepared by|Sheet|Date)$/.test(f.label))
      const cards = [...document.querySelectorAll('aside[aria-label=Checks] section')].map((s) => {
        const big = s.querySelector('p.font-mono')
        const unit = big?.querySelector('span')?.innerText.trim() ?? ''
        const bar = s.querySelector('.h-full[style]')
        const req = s.querySelector('.mt-3 .flex')
        return {
          title: s.querySelector('h3')?.innerText.trim(), sub: s.querySelector('h3 + p')?.innerText.trim() ?? '',
          chip: [...s.querySelectorAll('span')].find((x) => /rounded-full/.test(x.className))?.innerText.trim() ?? '',
          value: big ? big.innerText.replace(unit, '').trim() : '', unit,
          formula: big?.nextElementSibling?.tagName === 'P' ? big.nextElementSibling.innerText.trim() : '',
          req: req ? [...req.children].map((x) => x.innerText.trim()) : null, pct: bar ? parseFloat(bar.style.width) : null,
          col: bar ? getComputedStyle(bar).backgroundColor : null,
          dl: [...s.querySelectorAll('dl > div')].map((d) => [d.querySelector('dt')?.innerText.trim(), d.querySelector('dd')?.innerText.trim()]),
        }
      })
      const sheet = [...document.querySelectorAll('svg')].filter((s) => { const q = s.getBoundingClientRect(); return q.width > 220 && q.height > 120 && q.x > 540 && q.x < 1300 })
      const heads = [...document.querySelectorAll('h2,h3')].filter((x) => /^\d+\./.test(x.innerText.trim())).map((x) => ({ t: x.innerText.trim(), y: Math.round(x.getBoundingClientRect().y + scrollY) }))
      return { title, desc, fields, cards, drawings: sheet.map(ser), heads }
    })
    await p.screenshot({ path: `cap/calc/${slug}.png`, fullPage: true })
    // the worked solution
    await p.getByText(/^Calculations$/i).first().click(); await p.waitForTimeout(1800)
    const sol = await p.evaluate(() => {
      const steps = [...document.querySelectorAll('#panel-calc ol > li')].map((li) => {
        const h3 = li.querySelector('h3'), num = h3?.querySelector('span')?.innerText.trim() ?? ''
        const eqs = [...li.querySelectorAll('.katex')].filter((k) => !k.parentElement.closest('.katex')).map((k) => ({ html: (k.querySelector('.katex-html') ?? k).outerHTML, w: Math.round(k.getBoundingClientRect().width), disp: !!k.closest('.katex-display') }))
        return { n: num, title: h3 ? h3.innerText.trim().slice(num.length).trim() : '', text: li.querySelector('p')?.innerText.trim() ?? '', ref: li.children[1]?.innerText.trim() ?? '', eqs }
      })
      return { steps, solTitle: document.querySelector('#panel-calc h2')?.innerText.trim() ?? '' }
    })
    writeFileSync(`cap/calc/${slug}.json`, JSON.stringify({ route: r, ...main, ...sol }))
    console.log(r, 'fields', main.fields.length, 'cards', main.cards.length, 'drawings', main.drawings.length, 'steps', sol.steps.length, 'eqs', sol.steps.reduce((n, x) => n + x.eqs.length, 0))
  } catch (e) { console.log('FAIL', r, e.message.split('\n')[0]) }
}
await b.close()
