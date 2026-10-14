// ── Zeta social set 2: a Facebook cover (1640×924) and 4:5 feed posts ──────
// Every artifact on these is real app output: the 3D viewport and the .std and
// .xlsx come from one Model Space session (capx.mjs → cap/x), the PDF pages are
// the calculators' own exports, rasterised, and the drawing/equations/cards are
// the calculator captures the reels use. Nothing on a sheet is mocked up.
const X = D.x, K = C.foundation
const M = 80
const INK = '#0f1b2a', BRANDC = '#0f4c92', ACC = '#6ba4dc', AMBER = '#f2b53a', MUTED = '#5c6675', FOG = '#9eb0c5', WHITE = '#f2f5f9'
const SIZES = { cover: [1640, 924] }

function corners(root, w, hh, color, I = 40, L = 24) {
  const sv = h('svg', { width: w, height: hh, class: 'abs', style: { left: 0, top: 0, color } }, root)
  ;[[I, I, 1, 1], [w - I, I, -1, 1], [I, hh - I, 1, -1], [w - I, hh - I, -1, -1]].forEach(([x, y, sx, sy]) =>
    h('path', { d: `M${x + sx * L},${y} L${x},${y} L${x},${y + sy * L}`, fill: 'none', 'stroke-width': 1.5, stroke: 'currentColor', opacity: 0.7 }, sv))
}
/** Post chrome: corner marks, the small lockup top-left, the URL bottom-left. */
function frame(root, dark, n, w = W, hh = H) {
  corners(root, w, hh, dark ? '#e8eaed' : INK)
  const tl = h('div', { class: 'abs mono', style: { left: M + 'px', top: '74px', fontSize: '17px', color: dark ? '#e8eaed' : INK, display: 'flex', gap: '14px', alignItems: 'center' } }, root)
  h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, tl, LOGO('m' + n).replace('width="64" height="64"', 'width="26" height="26"') + WORD_SVG(13, 'currentColor'))
  h('div', { class: 'abs mono', style: { left: M + 'px', bottom: '70px', fontSize: '17px', color: dark ? FOG : MUTED, textTransform: 'none', letterSpacing: '.1em' } }, root, 'zetastruct.app')
}
const kicker = (root, txt, dark, top = 150, left = M) => h('div', { class: 'abs mono', style: { left: left + 'px', top: top + 'px', fontSize: '19px', color: dark ? AMBER : BRANDC, fontWeight: 600 } }, root, txt)
const headline = (root, html, dark, top = 190, size = 76, left = M, width = W - 2 * M) =>
  h('div', { class: 'abs disp', style: { left: left + 'px', top: top + 'px', width: width + 'px', fontSize: size + 'px', color: dark ? WHITE : INK, lineHeight: '1.0', letterSpacing: '-.035em' } }, root, html)
const sub = (root, html, dark, top, left = M, width = W - 2 * M, size = 26) =>
  h('div', { class: 'abs', style: { left: left + 'px', top: top + 'px', width: width + 'px', fontSize: size + 'px', lineHeight: '1.45', color: dark ? FOG : MUTED } }, root, html)
function chip(root, txt, x, y, tone = 'blue') {
  const t = { blue: ['rgba(107,164,220,.12)', 'rgba(107,164,220,.6)', ACC], amber: ['rgba(242,181,58,.12)', AMBER, AMBER], ok: ['#ddefe3', '#c2ddcb', '#14603a'], ink: ['#e6eef7', '#c9d7e8', BRANDC] }[tone]
  return h('div', { class: 'abs chip', style: { left: x + 'px', top: y + 'px', fontSize: '17px', padding: '6px 15px', background: t[0], border: '1.5px solid ' + t[1], color: t[2] } }, root, txt)
}
/** A rasterised PDF page as a sheet of paper. */
function page(root, src, x, y, w, rot = 0, z = 0) {
  return h('img', { class: 'abs', src, style: { left: x + 'px', top: y + 'px', width: w + 'px', transform: `rotate(${rot}deg)`, zIndex: z, borderRadius: '3px',
    boxShadow: '0 2px 0 rgba(15,27,42,.08), 0 30px 70px -20px rgba(3,8,16,.65), 0 70px 140px -50px rgba(3,8,16,.6)' } }, root)
}
/** The Model Space viewport, cropped to the building (the capture is 1880×1690 at 2×). */
function viewport(root, x, y, w, crop = [360, 170, 1180, 1440], style = {}) {
  const [cx, cy, cw, ch] = crop, s = w / cw
  const box = h('div', { class: 'abs', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: ch * s + 'px', overflow: 'hidden', borderRadius: '14px', background: '#f6f7f9', ...style } }, root)
  h('img', { class: 'abs', src: '../cap/x/canvas_design.png', style: { left: -cx * s + 'px', top: -cy * s + 'px', width: 1880 * s + 'px' } }, box)
  return box
}
/** A calculator drawing in a white sheet card. */
function sheet(root, key, idx, x, y, w, label = 'DRAWING SHEET', live = true) {
  const meta = C[key].draw[idx], dw = w - 48, dh = meta.h * dw / meta.w
  const cd = card(root, x, y, w, dh + 84, { boxShadow: '0 30px 80px -36px rgba(3,8,16,.6)' })
  h('div', { class: 'abs mono', style: { left: '24px', top: '22px', fontSize: '13px', color: INK, fontWeight: 600 } }, cd, label)
  if (live) chip(cd, 'LIVE', w - 88, 16, 'ok').style.cssText += ';font-size:12px;padding:3px 10px'
  const d = drawing(cd, meta.id, 24, 60, dw)
  return { cd, d, h: dh + 84 }
}
/** A worked-solution step: number, title, its equations, its clause. */
function step(root, s, x, y, w, fs = 22, dark = true) {
  const el = h('div', { class: 'abs', style: { left: x + 'px', top: y + 'px', width: w + 'px' } }, root)
  h('div', { style: { display: 'flex', gap: '14px', alignItems: 'baseline' } }, el,
    `<span class="mono" style="font-size:18px;color:${dark ? AMBER : BRANDC};font-weight:600">${String(s.n).padStart(2, '0')}</span><span style="font-size:30px;font-weight:700;color:${dark ? WHITE : INK};letter-spacing:-.01em">${s.title}</span>`)
  return el
}
function dot(color) { return `<span style="flex:none;width:9px;height:9px;border-radius:50%;background:${color}"></span>` }

const POSTS = {
  // ── the Facebook cover, 1640×924 (16:9) ─────────────────────────────────
  // Measured off the page itself, not FB's spec sheet: the phone shows the
  // cover whole at 16:9, and the profile picture is a circle of r ≈ 370 cover
  // px centred at (404, 742) — it eats the lower-left third. Desktop shows
  // the middle band, y ≈ 158–766. So everything sits in that band, and below
  // y ≈ 370 nothing goes left of the circle's edge (avoid()).
  cover(root) {
    const w = 1640, hh = 924
    darkGround(root); corners(root, w, hh, '#e8eaed', 28, 20)
    const PIC = { x: 404, y: 742, r: 370 }
    // the artifacts, right: viewport → drawing → report, fanned like a desk
    const fan = h('div', { class: 'abs', style: { left: '1010px', top: '170px', width: '600px', height: '600px' } }, root)
    viewport(fan, 0, 30, 300, undefined, { transform: 'rotate(-4deg)', boxShadow: '0 40px 90px -30px rgba(3,8,16,.8)' })
    const sh = sheet(fan, 'foundation', 0, 170, 150, 270, 'DRAWING SHEET')
    sh.cd.style.transform = 'rotate(2deg)'; sh.cd.style.zIndex = 2
    page(fan, '../cap/x/pdf/foundation_p1.png', 345, 0, 255, -3, 3)
    // the thread through them, an amber dimension line with its three stops
    const ln = h('svg', { class: 'abs', width: 600, height: 60, style: { left: '1010px', top: '690px', zIndex: 5 } }, root)
    h('line', { x1: 10, y1: 20, x2: 590, y2: 20, stroke: AMBER, 'stroke-width': 1.6 }, ln)
    ;[[10, 'MODEL'], [300, 'DRAWING'], [590, 'REPORT']].forEach(([x, t]) => {
      h('line', { x1: x - 7, y1: 27, x2: x + 7, y2: 13, stroke: AMBER, 'stroke-width': 2 }, ln)
      h('text', { x, y: 48, fill: AMBER, 'font-family': 'IBM Plex Mono', 'font-size': 13, 'font-weight': 600, 'letter-spacing': '2.4', 'text-anchor': x === 10 ? 'start' : x === 590 ? 'end' : 'middle' }, ln, t)
    })
    // the words: upper-left above the circle, then a column right of it
    const L = 230
    h('div', { class: 'abs', style: { left: L + 'px', top: '172px', display: 'flex', alignItems: 'center', gap: '16px', color: '#e8eaed' } }, root,
      LOGO('cv').replace('width="64" height="64"', 'width="46" height="46"') + WORD_SVG(26, 'currentColor'))
    kicker(root, 'NSCP 2015 · ACI 318-14 · AISC 360-16', true, 240, L)
    headline(root, `Model it. Check it. <span style="color:${ACC}">Sign it.</span>`, true, 278, 60, L, 780)
    const C2 = 800
    const list = h('div', { class: 'abs', style: { left: C2 + 'px', top: '410px', width: '190px', display: 'flex', flexDirection: 'column', gap: '16px' } }, root)
    ;['Free calculators', '3D frame analysis', 'Calc sheets to sign'].forEach((t) =>
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', fontSize: '20px', fontWeight: 600, color: '#e8eaed', whiteSpace: 'nowrap' } }, list, dot(ACC) + t))
    chip(root, 'zetastruct.app', C2, 590, 'amber').style.fontSize = '17px'
    window.__pic = PIC
  },

  // 1 · the report, fanned — the thing an engineer actually hands over
  report(root) {
    darkGround(root); frame(root, true, 21)
    kicker(root, 'EXPORT PDF REPORT', true)
    headline(root, 'The calc sheet<br>writes itself.', true, 190, 92)
    page(root, '../cap/x/pdf/foundation_p5.png', 110, 500, 470, -9, 1)
    page(root, '../cap/x/pdf/foundation_p2.png', 300, 480, 480, 4, 2)
    page(root, '../cap/x/pdf/foundation_p1.png', 500, 470, 480, -2, 3)
    const tags = h('div', { class: 'abs', style: { left: M + 'px', top: '400px', display: 'flex', gap: '10px', flexWrap: 'wrap', width: '900px' } }, root)
    ;['DESIGN OK verdict', 'Every clause cited', 'Drawings to scale', 'Ready to sign'].forEach((t) =>
      h('span', { class: 'chip', style: { fontSize: '16px', padding: '6px 14px', background: 'rgba(107,164,220,.12)', border: '1.5px solid rgba(107,164,220,.6)', color: ACC } }, tags, t))
  },

  // 2 · the drawing, with the mat and the punching perimeter
  drawing(root) {
    paperGround(root); frame(root, false, 22)
    kicker(root, 'CONCRETE · ISOLATED FOOTING')
    headline(root, 'Drawn to the numbers.<br>Down to the bar.', false, 190, 70)
    const sh = sheet(root, 'foundation', 0, 150, 360, 780)
    // three of the checks the drawing answers, on the right edge of the sheet
    const col = h('div', { class: 'abs ws', style: { left: M + 'px', top: 360 + sh.h + 30 + 'px', width: W - 2 * M + 'px', display: 'flex', gap: '12px' } }, root)
    K.cards.slice(0, 3).forEach((c) => {
      const el = h('div', { class: 'rc', style: { flex: 1, width: 'auto' } }, col)
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3>${c.title}</h3><span class="chp">${c.chip}</span></div><div class="big">${c.value}<span>${c.unit}</span></div><div class="fm">${c.formula || c.sub}</div>`
    })
  },

  // 3 · one model, every deliverable
  pipeline(root) {
    darkGround(root); frame(root, true, 23)
    kicker(root, '3D MODEL SPACE', true)
    headline(root, 'One model.<br>Every deliverable.', true, 190, 92)
    viewport(root, M, 440, 480, undefined, { boxShadow: '0 40px 90px -30px rgba(3,8,16,.8)' })
    sub(root, 'The solver runs in your browser &mdash; nothing to install.', true, 1080, M, 900, 24)
    const s = X.summary
    const list = h('div', { class: 'abs', style: { left: '600px', top: '450px', width: '400px', display: 'flex', flexDirection: 'column', gap: '0' } }, root)
    ;[['FEM', '3D frame analysis', `${s['Nodes / members / plates'].split(' / ')[0]} nodes · ${s['Nodes / members / plates'].split(' / ')[1]} members`],
      ['SEISMIC', 'NSCP §208 static & modal', 'Drift · irregularity flags'],
      ['DESIGN', 'Beams · columns · slabs · footings', 'Schedules + rebar cages'],
      ['PLANS', 'Framing plans & elevations', 'DXF for CAD'],
      ['EXPORT', 'PDF · Excel · STAAD.Pro', 'Take-off & estimate']].forEach(([k, a, b], i) => {
      const el = h('div', { style: { borderTop: '1px solid rgba(158,176,197,.28)', padding: '18px 0 18px' } }, list)
      h('div', { class: 'mono', style: { fontSize: '14px', color: AMBER, fontWeight: 600 } }, el, k)
      h('div', { style: { fontSize: '25px', fontWeight: 700, color: WHITE, marginTop: '6px' } }, el, a)
      h('div', { style: { fontSize: '18px', color: FOG, marginTop: '4px' } }, el, b)
    })
    chip(root, 'PRO PLAN', M, 1140, 'amber')
  },

  // 4 · every table to Excel — the real workbook
  excel(root) {
    paperGround(root); frame(root, false, 24)
    kicker(root, 'EXPORT TABLES TO EXCEL')
    headline(root, `Every table.<br>One workbook.`, false, 190, 92)
    sub(root, `${X.sheets.length} sheets from a single Model Space run &mdash; nodes, members, reactions, drift, schedules. Real numbers, not screenshots.`, false, 400, M, 900, 25)
    const t = X.reactions, cols = [0, 1, 3, 4, 5, 8]
    const gx = M, gy = 540, gw = W - 2 * M
    const g = card(root, gx, gy, gw, 600, { borderRadius: '10px', overflow: 'hidden', height: 'auto' })
    // column letters + rows, set as a spreadsheet grid
    const colW = [150, 110, 140, 170, 130, 220]
    let html = `<div style="display:flex;background:#eef0f2;border-bottom:1px solid #d4d7db;font:500 13px 'IBM Plex Mono';color:#6b7280"><div style="width:46px"></div>${colW.map((w, i) => `<div style="width:${w}px;padding:6px 10px;border-left:1px solid #d4d7db">${'ABCDEF'[i]}</div>`).join('')}</div>`
    t.slice(0, 12).forEach((r, ri) => {
      html += `<div style="display:flex;border-bottom:1px solid #e6e8eb;font:${ri ? 400 : 600} 15px 'IBM Plex Mono';color:${INK};${ri ? '' : 'background:#f4f7fb'}"><div style="width:46px;padding:9px 0;text-align:center;background:#eef0f2;color:#6b7280;font-size:12px;border-right:1px solid #d4d7db">${ri + 1}</div>`
      cols.forEach((c, k) => {
        const v = r[c]; const num = typeof v === 'number'
        html += `<div style="width:${colW[k]}px;padding:9px 10px;border-left:1px solid #e6e8eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${num ? 'text-align:right' : ''}">${num ? v.toFixed(2) : v}</div>`
      })
      html += '</div>'
    })
    g.innerHTML = html
    // the sheet tabs along the foot — the workbook's real sheet names
    const tabs = h('div', { style: { display: 'flex', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap', background: '#f1f0ec', padding: '0 0 10px 52px' } }, g)
    X.sheets.slice(6, 16).forEach((n) => h('span', { style: { font: "600 14px 'IBM Plex Mono'", padding: '7px 12px', borderRadius: '0 0 6px 6px', background: n === 'Support reactions' ? '#fff' : '#e4e2dc', color: n === 'Support reactions' ? '#14603a' : MUTED, borderTop: n === 'Support reactions' ? '3px solid #14603a' : '3px solid transparent' } }, tabs, n))
  },

  // 5 · STAAD.Pro, both ways
  staad(root) {
    darkGround(root); frame(root, true, 25)
    kicker(root, 'EXCHANGE', true)
    headline(root, `Speaks<br><span style="color:${ACC}">STAAD.Pro.</span>`, true, 190, 100)
    sub(root, 'Export the model as a .std deck &mdash; joints, members, sections, supports, load cases and combinations. Or import one and keep working.', true, 420, M, 900, 25)
    const p = h('div', { class: 'abs card-dark', style: { left: M + 'px', top: '560px', width: W - 2 * M + 'px', padding: '26px 30px', overflow: 'hidden', background: '#0a131e' } }, root)
    h('div', { class: 'mono', style: { fontSize: '14px', color: FOG, marginBottom: '16px' } }, p, `GRID-FRAME.STD &nbsp;·&nbsp; ${X.std.lines} LINES`)
    const lines = [...X.std.head.slice(0, 3), ...X.std.head.slice(7, 10), '…', ...X.std.members.slice(0, 3), '…', ...X.std.tail.slice(3, 8)]
    const hl = (l) => l.replace(/^(STAAD SPACE|START JOB INFORMATION|JOB NAME|UNIT|JOINT COORDINATES|MEMBER INCIDENCES|LOAD COMB|LOAD|DEFINE MATERIAL START|CONSTANTS|SUPPORTS|INPUT WIDTH)/, `<span style="color:${ACC};font-weight:600">$1</span>`)
    h('pre', { style: { font: "500 19px/1.62 'IBM Plex Mono'", color: '#d8dee6', whiteSpace: 'pre', overflow: 'hidden' } }, p, lines.map((l) => l === '…' ? `<span style="color:#56657a">  ···</span>` : hl(l.length > 62 ? l.slice(0, 62) + '…' : l)).join('\n'))
  },

  // 6 · no black boxes — one step of the worked solution, big
  solution(root) {
    paperGround(root); frame(root, false, 26)
    kicker(root, 'WORKED SOLUTION · TWO-WAY SHEAR')
    headline(root, 'No black boxes.<br>Every step, every clause.', false, 190, 70)
    const s = K.steps[4]
    const el = card(root, M, 400, W - 2 * M, 760, { padding: '36px 40px' })
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, el,
      `<span style="display:flex;gap:14px;align-items:baseline"><span class="mono" style="font-size:18px;color:${BRANDC};font-weight:600">${String(s.n).padStart(2, '0')}</span><span style="font-size:30px;font-weight:700;color:${INK}">${s.title.replace(' — required depth', '')}</span></span><span class="chip" style="font-size:14px;background:#ddefe3;border:1px solid #c2ddcb;color:#14603a">PASS</span>`)
    h('div', { style: { fontSize: '19px', color: MUTED, lineHeight: 1.5, marginTop: '14px' } }, el, s.text.split('. ').slice(0, 2).join('. ') + '.')
    let y = 190
    s.eqs.slice(0, 5).forEach((e) => { const b = eqBox(el, e.html, 40, y, 22).fit(W - 2 * M - 80); y += b.el.offsetHeight + 14 })
    h('div', { class: 'abs mono', style: { left: '40px', top: y + 10 + 'px', fontSize: '15px', color: BRANDC, textTransform: 'none', letterSpacing: '.06em' } }, el, s.ref.replace(/^PASS\s*/, '').trim())
  },

  // 7a · the question (carousel slide 1)
  quiz(root) {
    darkGround(root); frame(root, true, 27)
    kicker(root, 'QUICK CHECK · SLIDE 1 / 2', true)
    headline(root, 'How thick is<br>this footing?', true, 190, 104)
    const f = (l) => K.fields.find((x) => x.label.replace(/<[^>]+>/g, '') === l)
    const given = [['Service load P', f('P').value + ' kN'], ['Factored Pu', f('Pu').value + ' kN'], ['Column', f('Column c (square)').value + ' mm square'], ['Allowable bearing qa', f('qa').value + ' kPa'], ['f′c · fy', `${f('fc′').value} · ${f('fy').value} MPa`], ['Bars · cover', `⌀${f('Bar db').value} · ${f('Clear cover').value} mm`]]
    given.forEach(([a, b], i) => {
      const el = h('div', { class: 'abs', style: { left: M + 'px', top: 470 + i * 88 + 'px', width: W - 2 * M + 'px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid rgba(158,176,197,.28)', paddingTop: '22px' } }, root)
      h('span', { style: { fontSize: '27px', color: FOG } }, el, a)
      h('span', { class: 'mono', style: { fontSize: '29px', color: WHITE, fontWeight: 600, letterSpacing: '.02em', textTransform: 'none' } }, el, b)
    })
    h('div', { class: 'abs', style: { left: M + 'px', top: '1030px', fontSize: '30px', fontWeight: 700, color: AMBER } }, root, 'Your answer in the comments →')
    sub(root, 'Square, concentric, interior column. NSCP 2015 / ACI 318-14.', true, 1084, M, 900, 22)
  },
  // 7b · the answer (carousel slide 2)
  answer(root) {
    paperGround(root); frame(root, false, 28)
    kicker(root, 'QUICK CHECK · SLIDE 2 / 2')
    const sh = sheet(root, 'foundation', 0, 230, 400, 620, 'DRAWING SHEET', false)
    // the answer is read off the app's own drawing and cards, not typed in
    const dc = [...sh.d.svg.querySelectorAll('text')].map((t) => t.textContent.match(/Dc\s*=\s*(\d+)/)).find(Boolean)[1]
    const gov = K.cards.slice(0, 3).reduce((a, c) => (c.pct > a.pct ? c : a))
    headline(root, `${dc} mm.<br><span style="color:${BRANDC}">${gov.title} governs.</span>`, false, 190, 76)
    const col = h('div', { class: 'abs ws', style: { left: M + 'px', top: 400 + sh.h + 26 + 'px', width: W - 2 * M + 'px', display: 'flex', gap: '12px' } }, root)
    K.cards.slice(0, 3).forEach((c) => {
      const el = h('div', { class: 'rc', style: { flex: 1, width: 'auto' } }, col)
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3>${c.title}</h3><span class="chp">${c.chip}</span></div><div class="big">${c.value}<span>${c.unit}</span></div>`
    })
    h('div', { class: 'abs', style: { left: M + 'px', top: '1200px', fontSize: '24px', fontWeight: 700, color: INK } }, root, 'Run it yourself — free, no account: zetastruct.app/foundation')
  },
}
window.show = (name) => {
  const [w, hh] = SIZES[name] ?? [W, H]
  document.documentElement.style.width = document.body.style.width = w + 'px'
  document.documentElement.style.height = document.body.style.height = hh + 'px'
  ROOT.innerHTML = ''
  const root = h('div', { class: 'layer' }, ROOT)
  POSTS[name](root)
  h('div', { class: 'vignette', style: { opacity: 0.45 } }, ROOT)
}
window.NAMES = Object.keys(POSTS)
window.SIZES = SIZES
window.READY = true
