// ════════════════════════════════════════════════════════════════════════
// F+G · DESIGN (24–34): 54 columns fail; the optimizer; the derivations
// ════════════════════════════════════════════════════════════════════════
const COLS = ['COLUMN', 'SECTION', 'PU (KN)', 'MUX', 'MUY', 'BARS', 'UTIL', 'CASE']
function schedRow(parent, cells, i) {
  const r = h('div', { style: { display: 'grid', gridTemplateColumns: '150px 120px 110px 100px 100px 260px 90px 1fr', alignItems: 'center', height: '46px', padding: '0 22px', borderTop: '1px solid #eeece5', fontSize: '17px', color: '#0f1b2a', fontVariantNumeric: 'tabular-nums', position: 'relative', transformOrigin: '50% 50%', backfaceVisibility: 'hidden' } }, parent)
  const cs = cells.map((c, k) => h('div', { style: { fontFamily: k >= 2 && k <= 6 ? 'IBM Plex Mono' : 'Archivo', fontWeight: k === 0 || k === 6 ? 600 : 500, fontSize: k === 7 ? '14px' : '17px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r, c.replace('▸ ', '')))
  return { r, cs }
}
const F = scene(24, 34, (root) => {
  const grid = paperGround(root)
  const sheet = h('div', { class: 'abs card', style: { left: '120px', top: '190px', width: '1240px', borderRadius: '14px', overflow: 'hidden', transformOrigin: '30% 30%' } }, root)
  const head = h('div', { style: { padding: '22px 22px 14px', display: 'flex', alignItems: 'center', gap: '14px' } }, sheet)
  h('div', { style: { fontSize: '24px', fontWeight: 700, color: '#0f4c92' } }, head, 'RC column schedule')
  const status = h('div', { class: 'chip', style: { fontSize: '14px', padding: '5px 12px' } }, head)
  const thead = h('div', { style: { display: 'grid', gridTemplateColumns: '150px 120px 110px 100px 100px 260px 90px 1fr', padding: '0 22px 10px', fontFamily: 'IBM Plex Mono', fontSize: '12.5px', letterSpacing: '.12em', color: '#5c6675', fontWeight: 600 } }, sheet)
  COLS.forEach((c) => h('div', {}, thead, c))
  const before = D.tb[1].rows.slice(0, 13), after = D.ta[1].rows.slice(0, 13)
  const rows = before.map((rw, i) => ({ ...schedRow(sheet, rw.cells, i), b: rw, a: after[i] }))
  // the counter
  const ctr = h('div', { class: 'abs', style: { left: '1420px', top: '250px', width: '420px' } }, root)
  const num = h('div', { class: 'disp', style: { fontSize: '260px', fontWeight: 900, color: '#c2402a', letterSpacing: '-.05em', lineHeight: '.85', fontVariantNumeric: 'tabular-nums' } }, ctr, '0')
  const lab = h('div', { class: 'mono', style: { fontSize: '17px', color: '#0f1b2a', marginTop: '18px' } }, ctr)
  const sub2 = h('div', { class: 'mono', style: { fontSize: '14px', color: '#5c6675', marginTop: '10px' } }, ctr)
  const opt = h('div', { style: { marginTop: '40px', height: '64px', width: '300px', borderRadius: '12px', background: '#0f4c92', color: '#fff', fontSize: '22px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', position: 'relative', overflow: 'hidden', boxShadow: '0 18px 40px -16px rgba(15,76,146,.7)' } }, ctr, '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M4 20 L10 14 L14 18 L20 6"/><path d="M14 6 H20 V12"/></svg>Optimize design')
  const ripple = h('div', { class: 'abs', style: { width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,.35)', left: '50%', top: '50%', marginLeft: '-15px', marginTop: '-15px' } }, opt)
  const cursor = h('div', { class: 'abs', style: { width: '30px', height: '30px', zIndex: 9 } }, root, `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2 L4 19 L8.6 15 L11.6 22 L14.4 20.8 L11.4 14 L17.6 14 Z" fill="#fff" stroke="#0f1b2a" stroke-width="1.4" stroke-linejoin="round"/></svg>`)
  const scanline = h('div', { class: 'abs', style: { left: '0', width: '1240px', height: '3px', background: '#14603a', boxShadow: '0 0 16px rgba(20,96,58,.6)' } }, sheet)
  // derivations
  const der = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '1800px' } }, root)
  const stack = h('div', { class: 'abs', style: { left: '760px', top: '0px', width: '900px', transformStyle: 'preserve-3d' } }, der)
  const steps = ['1  Effective depths', '2  Reinforcement-ratio limits', '3  SRRB / DRRB classification', '4  Tension steel (DRRB)', '5  Compression steel', '6  Bar layout — spacing & layers', '7  Shear strength of concrete', '8  Stirrup design']
  const eqIdx = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13]
  const eqs = eqIdx.map((k, i) => {
    const im = h('img', { src: 'assets/eq/' + D.eq[k], class: 'abs', style: { width: '820px', left: '0px', borderRadius: '10px', boxShadow: '0 20px 50px -18px rgba(15,27,42,.35)' } }, stack)
    return im
  })
  const stepT = h('div', { class: 'abs', style: { left: '150px', top: '300px', width: '560px' } }, der)
  const stepEls = steps.map((s) => h('div', { style: { fontSize: '30px', fontWeight: 700, color: '#0f1b2a', height: '62px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '16px' } }, stepT, s))
  const passes = stepEls.map((e) => h('span', { class: 'chip', style: { background: '#ddefe3', color: '#14603a', fontSize: '14px', padding: '4px 10px' } }, e, 'PASS'))
  const derHead = h('div', { class: 'abs mono', style: { left: '150px', top: '220px', fontSize: '15px', color: '#5c6675' } }, der)
  // defensible
  const def = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const defH = h('div', { class: 'abs disp', style: { left: '150px', top: '300px', fontSize: '112px', color: '#0f1b2a' } }, def)
  const defL1 = h('div', { style: { overflow: 'hidden', height: '150px', marginBottom: '-22px' } }, defH, '<span style="display:inline-block">Every number,</span>')
  const defL2 = h('div', { style: { overflow: 'hidden', height: '150px', color: '#0f4c92' } }, defH, '<span style="display:inline-block">defensible.</span>')
  const defSub = h('div', { class: 'abs mono', style: { left: '156px', top: '600px', fontSize: '15px', color: '#5c6675', width: '640px', lineHeight: '1.8', textTransform: 'none', letterSpacing: '.04em' } }, def)
  const card = h('div', { class: 'abs card', style: { left: '1010px', top: '220px', width: '790px', overflow: 'hidden' } }, def)
  const ch = h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px', padding: '20px 26px', background: '#f9f8f4', borderBottom: '1px solid #eeece5' } }, card)
  h('div', { style: { fontFamily: 'IBM Plex Mono', fontWeight: 600, color: '#0f4c92', fontSize: '19px' } }, ch, 'B-201')
  h('div', { style: { fontSize: '17px', color: '#3d4a5c' } }, ch, '300×500 · f′c 28 · fy 415')
  h('div', { style: { fontSize: '17px', color: '#3d4a5c' } }, ch, 'Mu 180 kN·m · Vu 120 kN')
  const passB = h('div', { class: 'chip', style: { marginLeft: 'auto', background: '#ddefe3', color: '#14603a', fontSize: '15px' } }, ch, 'PASS')
  const LINES = [
    ['Effective depth d = 500 − 40 − 10 − 20/2 = 440 mm', '§409.3.1'],
    ['ρmin = 0.0034 ≤ ρ = 0.0090 ≤ ρmax = 0.0183', '§409.6.1.2'],
    ['As required = 1188.6 mm² → 4-⌀20 in one layer', '§422.2'],
    ['Clear spacing 40 mm ≥ minimum 26.7 mm', '§425.2.1'],
    ['φVc = 89.1 kN < Vu = 120 kN — stirrups required', '§422.5.5.1'],
    ['s = min(695, 220) = 220 mm — 2-leg ⌀10 @ 220', '§409.7.6.2.2'],
  ]
  const dl = LINES.map(([a, b]) => {
    const r = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', padding: '17px 26px', borderBottom: '1px solid #eeece5' } }, card)
    const tx = h('div', { style: { fontSize: '19px', color: '#0f1b2a', fontWeight: 500, whiteSpace: 'nowrap' } }, r)
    const cl = h('div', { class: 'mono', style: { fontSize: '13px', color: '#0f4c92', letterSpacing: '.06em', whiteSpace: 'nowrap' } }, r, b)
    return { r, tx, cl, a }
  })
  // elevation sheet
  const elev = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '2200px' } }, root)
  const esheet = h('div', { class: 'abs card', style: { left: '110px', top: '170px', width: '1700px', padding: '26px', transformOrigin: '50% 40%' } }, elev)
  const esvg = tpl('t_plan_elevA'); esvg.style.width = '1648px'; esvg.style.height = 'auto'; esvg.style.color = '#0f1b2a'; esheet.appendChild(esvg)
  const escan = h('div', { class: 'abs', style: { top: '0px', width: '2px', height: '100%', background: '#0f4c92', boxShadow: '0 0 14px rgba(15,76,146,.6)' } }, esheet)
  return { grid, sheet, status, rows, ctr, num, lab, sub2, opt, ripple, cursor, scanline, der, stack, eqs, stepT, stepEls, passes, derHead, def, defL1, defL2, defSub, card, passB, dl, elev, esheet, esvg, escan }
})
F.update = (t) => {
  const s = F
  tf(s.grid, `translate(${-(t - 24) * 12}px, ${-(t - 24) * 5}px)`)
  const tab = t < 28.0, der = t >= 28 && t < 30, def = t >= 30 && t < 32, el = t >= 32
  show(s.sheet, tab); show(s.ctr, tab); show(s.cursor, tab && t < 26.4); show(s.der, der); show(s.def, def); show(s.elev, el)
  if (tab) {
    const flipAt = (i) => 26.0 + i * 0.045
    s.rows.forEach((r, i) => {
      const at = 24.05 + i * 0.065
      const p = ease(t, at, at + 0.3)
      const flipped = t >= flipAt(i)
      const fp = seg(t, flipAt(i) - 0.06, flipAt(i) + 0.12)
      const rot = fp < 0.5 ? fp * 180 : (1 - fp) * 180
      tf(r.r, `translateX(${(1 - p) * -60}px) rotateX(${t >= flipAt(i) - 0.06 && t < flipAt(i) + 0.12 ? rot * 0.5 : 0}deg)`); op(r.r, p)
      const src = flipped ? r.a : r.b
      src.cells.forEach((c, k) => { if (r.cs[k]) r.cs[k].textContent = c.replace('▸ ', '') })
      const fail = !flipped && r.b.fail
      r.r.style.background = fail ? '#fbeeea' : (flipped && t < flipAt(i) + 0.5 ? `rgba(221,239,227,${1 - seg(t, flipAt(i) + 0.1, flipAt(i) + 0.5)})` : '#fff')
      r.r.style.color = fail ? '#c2402a' : '#0f1b2a'
      r.cs[6].style.color = fail ? '#c2402a' : '#14603a'
    })
    const cnt = t < 26 ? Math.round(54 * ease(t, 24.15, 25.0)) : Math.round(54 * (1 - ease(t, 26.0, 26.55)))
    const passed = t >= 26.55
    s.num.textContent = passed ? '✓' : String(cnt)
    s.num.style.color = t >= 26 ? '#14603a' : '#c2402a'
    tf(s.num, `scale(${passed ? 1 + 0.25 * Math.exp(-(t - 26.55) * 8) : 1})`)
    s.lab.textContent = passed ? 'ALL PASSED' : t >= 26 ? 'OPTIMIZING…' : scramble('COLUMNS FAILED', seg(t, 24.2, 24.7), 3)
    s.lab.style.color = t >= 26 ? '#14603a' : '#0f1b2a'
    s.sub2.textContent = passed ? 'EVERY SCHEDULE · RE-ANALYSED, RE-DESIGNED' : scramble('RC COLUMN SCHEDULE · ALSO 30 SLABS', seg(t, 24.5, 25.1), 6)
    s.status.textContent = t >= 26.55 ? 'all passed' : '54 failed'
    css(s.status, t >= 26.55 ? { background: '#ddefe3', color: '#14603a' } : { background: '#fbeeea', color: '#c2402a' })
    const op_ = ease(t, 25.0, 25.35); tf(s.opt, `translateY(${(1 - op_) * 30}px) scale(${1 - 0.05 * (t >= 25.75 ? Math.exp(-(t - 25.75) * 14) : 0)})`); op(s.opt, op_ * (1 - ease(t, 26.6, 26.9)))
    const rp = seg(t, 25.75, 26.2); tf(s.ripple, `scale(${E.outExpo(rp) * 18})`); op(s.ripple, t >= 25.75 ? 1 - rp : 0)
    const ob = s.opt.getBoundingClientRect()
    const cp = ease(t, 25.3, 25.7, E.inOutCubic)
    css(s.cursor, { left: lerp(1700, ob.left + ob.width * 0.55, cp) + 'px', top: lerp(960, ob.top + ob.height * 0.55, cp) + 'px' })
    op(s.cursor, ease(t, 25.2, 25.3))
    s.scanline.style.top = 120 + ease(t, 26.0, 26.7, E.inOutCubic) * 600 + 'px'
    op(s.scanline, t >= 26 && t < 26.75 ? 1 : 0)
    // camera: a slow push through the break, the snap on the drop, a zoom on a row
    const push = ease(t, 24, 26, E.inCubic)
    const zoom = ease(t, 27.0, 27.3) * (1 - ease(t, 27.6, 27.9))
    tf(s.sheet, `perspective(2000px) rotateY(${lerp(6, 0, ease(t, 24, 24.6))}deg) scale(${(1 + 0.04 * push) * (1 - 0.03 * (t >= 26 ? Math.exp(-(t - 26) * 6) : 0)) * (1 + 0.55 * zoom)}) translate(${zoom * 160}px, ${zoom * 60}px)`)
    tf(s.ctr, `translateX(${zoom * 500}px)`); op(s.ctr, 1 - zoom)
    const ex = ease(t, 27.85, 28.0, E.inExpo); op(s.sheet, 1 - ex)
  }
  if (der) {
    const n = s.eqs.length
    s.eqs.forEach((im, i) => {
      const at = 27.9 + i * 0.13
      const p = ease(t, at, at + 0.5)
      const y = 120 + i * 120
      tf(im, `translate3d(${(1 - p) * 700}px, ${y}px, ${(1 - p) * -400}px) rotateY(${(1 - p) * -40}deg)`); op(im, clamp(p * 2))
    })
    const cam = ease(t, 28.0, 30.0, E.inOutCubic)
    tf(s.stack, `translateY(${-cam * 520}px) rotateY(-14deg) rotateX(8deg)`)
    s.stepEls.forEach((e, i) => {
      const at = 28.05 + i * 0.22, p = ease(t, at, at + 0.35)
      tf(e, `translateX(${(1 - p) * -40}px)`); op(e, p * (i <= (t - 28) / 0.22 + 1 ? 1 : 0))
      const ps = clamp(spring(t - at - 0.2, 3.5, 0.4), 0, 1.3); tf(s.passes[i], `scale(${ps})`)
    })
    s.derHead.textContent = scramble('BX0.0.1 · END I — WORKED SOLUTION', seg(t, 28.0, 28.5), 12)
    const ex = ease(t, 29.85, 30, E.inExpo); op(s.der, 1 - ex)
  }
  if (def) {
    const p1 = ease(t, 29.92, 30.35), p2 = ease(t, 30.1, 30.55)
    tf(s.defL1.firstChild, `translateY(${(1 - p1) * 140}px)`); tf(s.defL2.firstChild, `translateY(${(1 - p2) * 150}px)`)
    s.defSub.textContent = typed('Every row in every schedule opens like this — beams, columns, slabs, footings, steel members and connections. The same derivation prints in the PDF report.', seg(t, 30.5, 31.6))
    const cp = ease(t, 29.95, 30.4)
    tf(s.card, `translateX(${(1 - cp) * 400}px) perspective(1600px) rotateY(${(1 - cp) * -20}deg)`)
    s.dl.forEach((d, i) => {
      const at = 30.25 + i * 0.25
      d.tx.textContent = typed(d.a, seg(t, at, at + 0.22))
      op(d.cl, ease(t, at + 0.15, at + 0.3)); tf(d.cl, `translateX(${(1 - ease(t, at + 0.15, at + 0.35)) * 20}px)`)
      d.r.style.background = t >= at && t < at + 0.25 ? '#eaf1f9' : '#fff'
    })
    const ps = t >= 31.75 ? spring(t - 31.75, 3.2, 0.35) : 0; tf(s.passB, `scale(${t >= 31.75 ? 1.8 - 0.8 * ps : 0})`)
    const ex = ease(t, 31.85, 32, E.inExpo); op(s.def, 1 - ex)
  }
  if (el) {
    if (!s.ed) s.ed = prepDraw(s.esvg, 'x')
    const p = seg(t, 32.0, 33.3)
    drawAt(s.ed, p, 0.18)
    css(s.escan, { left: 26 + 1648 * E.inOutCubic(p) + 'px' }); op(s.escan, p > 0 && p < 1 ? 1 : 0)
    const ent = ease(t, 32, 32.4)
    const pull = ease(t, 33.4, 34, E.inCubic)
    tf(s.esheet, `rotateX(${lerp(22, 8, ent) - pull * 6}deg) rotateY(${lerp(-10, 4, ease(t, 32, 34, E.inOutCubic))}deg) scale(${lerp(1.18, 1.04, ent) * (1 - pull * 0.15)}) translateY(${(1 - ent) * 140}px)`)
    op(s.esheet, 1 - ease(t, 33.8, 34))
  }
}

// ════════════════════════════════════════════════════════════════════════
// H · DETAILING (34–40): connections drawn, plates solved
// ════════════════════════════════════════════════════════════════════════
function sheetCard(parent, id, w, x, y) {
  const c = h('div', { class: 'abs card', style: { left: x + 'px', top: y + 'px', width: w + 'px', padding: '22px', transformOrigin: '50% 50%' } }, parent)
  const sv = tpl(id); sv.style.width = w - 44 + 'px'; sv.style.height = 'auto'; sv.style.color = '#0f1b2a'; c.appendChild(sv)
  return { c, sv }
}
function feCard(parent, id, w, x, y, label) {
  const c = h('div', { class: 'abs', style: { left: x + 'px', top: y + 'px', width: w + 'px', transformOrigin: '50% 50%' } }, parent)
  const sv = tpl(id); sv.style.width = w + 'px'; sv.style.height = 'auto'; sv.style.color = '#e8eaed'; c.appendChild(sv)
  const polys = [...sv.querySelectorAll('polygon')].map((p) => ({ p, t: jetT(p.getAttribute('fill')) })).filter((x) => x.t >= 0)
  const others = [...sv.children].filter((e) => e.tagName !== 'defs').flatMap((g) => [...g.querySelectorAll ? g.querySelectorAll('line,circle,polyline') : []])
  const lab = h('div', { class: 'mono', style: { fontSize: '14px', color: '#9eb0c5', marginTop: '14px' } }, c, label)
  return { c, sv, polys, others, lab }
}
const Hd = scene(34, 40, (root) => {
  const grid = darkGround(root)
  const mf = sheetCard(root, 't_det_mf1', 1180, 370, 150)
  const mech = sheetCard(root, 't_det_mech', 1180, 370, 160)
  const tab = feCard(root, 't_fe_tab', 520, 700, 120, 'TAB PL 12 × 230 · VON MISES · Q6 PLANE STRESS')
  const tabInfo = h('div', { class: 'abs', style: { left: '170px', top: '330px', width: '470px' } }, root)
  const tiH = h('div', { class: 'disp', style: { fontSize: '76px', color: '#f2f5f9', lineHeight: '.95' } }, tabInfo, 'The plate,<br>solved.')
  const tiL = ['LINEAR ELASTIC FE', 'O-GRID AROUND EVERY HOLE', 'BOLT BEARING · COSINE', 'KT → 3.00 · HOWLAND'].map((x) => h('div', { class: 'mono', style: { fontSize: '15px', color: '#9eb0c5', marginTop: '16px' } }, tabInfo))
  const gd = sheetCard(root, 't_det_gusset_corner', 760, 150, 220)
  const gf = feCard(root, 't_fe_gusset1', 560, 1180, 190, 'GUSSET PL 10 · BRACE FORCE ALONG THE SLOT WELDS')
  const cap = h('div', { class: 'abs mono', style: { left: '170px', top: '160px', fontSize: '15px', color: '#9eb0c5' } }, root)
  return { grid, mf, mech, tab, tabInfo, tiH, tiL, gd, gf, cap }
})
function feReveal(f, p) {
  for (const x of f.polys) { const on = x.t <= p * 1.1; x.p.style.opacity = on ? 1 : 0 }
}
Hd.update = (t) => {
  const s = Hd
  tf(s.grid, `translate(${-(t - 34) * 14}px, 0)`)
  const a = t < 35.5, b = t >= 35.5 && t < 36, c = t >= 36 && t < 37.5, d = t >= 37.5
  show(s.mf.c, a); show(s.mech.c, b); show(s.tab.c, c); show(s.tabInfo, c); show(s.gd.c, d); show(s.gf.c, d)
  if (a) {
    if (!s.mfD) s.mfD = prepDraw(s.mf.sv, 'xy')
    drawAt(s.mfD, seg(t, 34.0, 35.1), 0.25)
    const ent = ease(t, 34, 34.4)
    tf(s.mf.c, `perspective(1800px) rotateX(${(1 - ent) * 30}deg) scale(${lerp(0.9, 1, ent) * (1 + 0.04 * seg(t, 34, 35.5))})`)
  }
  if (b) {
    if (!s.meD) s.meD = prepDraw(s.mech.sv, 'y')
    drawAt(s.meD, seg(t, 35.5, 35.95), 0.3)
    tf(s.mech.c, `scale(${1.12 - 0.06 * seg(t, 35.5, 36)})`)
  }
  if (c) {
    // bands come up from blue to red, one 16th at a time
    const p = Math.floor(seg(t, 36.0, 36.85) * 12) / 12
    feReveal(s.tab, t >= 36.85 ? 1.2 : p)
    const ent = ease(t, 36, 36.35)
    tf(s.tab.c, `perspective(1600px) rotateY(${(1 - ent) * 25}deg) scale(${lerp(1.25, 1, ent)})`)
    op(s.tiH, ease(t, 36.1, 36.4)); tf(s.tiH, `translateY(${(1 - ease(t, 36.1, 36.5)) * 40}px)`)
    const tl = ['LINEAR ELASTIC FE', 'O-GRID AROUND EVERY HOLE', 'BOLT BEARING · COSINE', 'KT → 3.00 · HOWLAND']
    s.tiL.forEach((e, i) => { e.textContent = scramble(tl[i], seg(t, 36.4 + i * 0.15, 36.8 + i * 0.15), 50 + i) })
    const ex = ease(t, 37.35, 37.5, E.inExpo); op(s.tab.c, 1 - ex); op(s.tabInfo, 1 - ex)
  }
  if (d) {
    if (!s.gdD) s.gdD = prepDraw(s.gd.sv, 'xy')
    drawAt(s.gdD, seg(t, 37.5, 38.4), 0.25)
    const e1 = ease(t, 37.5, 37.85)
    tf(s.gd.c, `perspective(1600px) rotateY(${(1 - e1) * -25}deg) translateX(${(1 - e1) * -200}px)`)
    const p = Math.floor(seg(t, 38.0, 38.8) * 12) / 12
    feReveal(s.gf, t >= 38.8 ? 1.2 : p)
    const e2 = ease(t, 37.95, 38.3); tf(s.gf.c, `perspective(1600px) rotateY(${(1 - e2) * 25}deg) translateX(${(1 - e2) * 200}px)`); op(s.gf.c, e2)
    const pull = ease(t, 39.4, 40, E.inCubic)
    s.gd.c.style.opacity = 1 - pull; s.gf.c.style.opacity = e2 * (1 - pull)
  }
  s.cap.textContent = a ? scramble('MF1 · MOMENT CONNECTION · CJP FLANGES · §J10', seg(t, 34, 34.6), 61) : d ? scramble('BRACE GUSSET · WHITMORE IN THE PLATE · UFM', seg(t, 37.5, 38.1), 62) : ''
}

// ════════════════════════════════════════════════════════════════════════
// I · DRAWINGS & REPORT (40–48)
// ════════════════════════════════════════════════════════════════════════
const Iw = scene(40, 48, (root) => {
  const grid = paperGround(root)
  const plan = sheetCard(root, 't_plan_framing', 980, 470, 110)
  const wall = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '2400px' } }, root)
  const plane = h('div', { class: 'abs', style: { left: '0', top: '0', width: W + 'px', height: H + 'px', transformStyle: 'preserve-3d' } }, wall)
  const ids = ['t_plan_framing', 't_plan_foundation', 't_det_base', 't_plan_elev1', 't_plan_cutting']
  const sheets = ids.map((id, i) => { const sc = sheetCard(plane, id, 560, 0, 0); sc.c.style.padding = '16px'; return sc })
  const big = h('div', { class: 'abs', style: { left: '150px', top: '330px' } }, root)
  const bigN = h('div', { class: 'disp', style: { fontSize: '300px', fontWeight: 900, color: '#0f1b2a', letterSpacing: '-.05em', lineHeight: '.85', fontVariantNumeric: 'tabular-nums' } }, big, '0')
  const bigL = h('div', { class: 'mono', style: { fontSize: '18px', color: '#0f1b2a', marginTop: '24px' } }, big)
  const bigS = h('div', { class: 'mono', style: { fontSize: '14px', color: '#5c6675', marginTop: '10px', width: '640px', lineHeight: '1.7' } }, big)
  // the report stack
  const rep = h('div', { class: 'abs', style: { left: '1180px', top: '170px', width: '560px', height: '760px' } }, root)
  const pages = Array.from({ length: 7 }, (_, i) => h('div', { class: 'abs card', style: { left: '0px', top: '0px', width: '560px', height: '740px', borderRadius: '6px' } }, rep))
  const cover = pages[6]
  cover.innerHTML = `<div style="padding:46px 44px">
    <div style="display:flex;align-items:center;gap:14px">${LOGO('lgR').replace('width="64" height="64"', 'width="44" height="44"')}<span style="font-weight:900;letter-spacing:.14em;font-size:22px;color:#0f1b2a">ZETA</span></div>
    <div class="mono" style="font-size:12px;color:#5c6675;margin-top:60px">STRUCTURAL DESIGN REPORT</div>
    <div style="font-size:44px;font-weight:800;color:#0f1b2a;letter-spacing:-.03em;line-height:1;margin-top:14px">3×2 Bay ·<br>5 Storeys</div>
    <div class="mono" style="font-size:12px;color:#5c6675;margin-top:26px;line-height:1.9">NSCP 2015 · ACI 318-14 · AISC 360-16<br>GEOMETRY · LOADS · ANALYSIS · DESIGN<br>SCHEDULES · WORKED SOLUTIONS · DRAWINGS</div>
    <div style="position:absolute;left:44px;right:44px;bottom:60px;border-top:1px solid #0f1b2a;padding-top:12px;display:flex;justify-content:space-between" class="mono"><span style="font-size:11px;color:#0f1b2a">PREPARED BY</span><span style="font-size:11px;color:#0f1b2a">SIGNED · PRC</span></div></div>`
  const stamp = h('div', { class: 'abs', style: { left: '330px', top: '520px', width: '170px', height: '170px', borderRadius: '50%', border: '3px solid #0f4c92', color: '#0f4c92', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: 'IBM Plex Mono', fontWeight: 600, fontSize: '15px', letterSpacing: '.12em', transform: 'rotate(-14deg)' } }, rep, 'SIGNED<br>PDF')
  // the workflow strip
  const flow = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const fh = h('div', { class: 'abs disp', style: { left: '150px', top: '250px', fontSize: '104px', color: '#0f1b2a', whiteSpace: 'nowrap' } }, flow)
  const steps = [['Geometry', 'grid → frame'], ['Loading', 'D · L · E · W'], ['Analysis', '3D FEM'], ['Design', 'every member'], ['Schedules', 'worked solutions'], ['Report', 'signed PDF']]
  const boxes = steps.map(([a, b], i) => {
    const bx = h('div', { class: 'abs', style: { left: 150 + i * 280 + 'px', top: '560px', width: '236px', height: '118px', borderRadius: '12px', border: '2px solid #0f1b2a', background: i === 5 ? '#0f4c92' : '#fff', color: i === 5 ? '#fff' : '#0f1b2a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', borderColor: i === 5 ? '#0f4c92' : '#0f1b2a' } }, flow)
    h('div', { style: { fontSize: '26px', fontWeight: 700 } }, bx, a); h('div', { style: { fontSize: '16px', opacity: .75 } }, bx, b)
    const ar = i < 5 ? h('div', { class: 'abs', style: { left: 150 + i * 280 + 244 + 'px', top: '612px', width: '28px', height: '14px' } }, flow, '<svg width="28" height="14"><path d="M0 7 H22 M16 2 L22 7 L16 12" stroke="#5c6675" stroke-width="2" fill="none"/></svg>') : null
    return { bx, ar }
  })
  return { grid, plan, wall, plane, sheets, big, bigN, bigL, bigS, rep, pages, stamp, flow, fh, boxes }
})
Iw.update = (t) => {
  const s = Iw
  tf(s.grid, `translate(${-(t - 40) * 10}px, ${-(t - 40) * 4}px)`)
  const a = t < 42, b = t >= 42 && t < 45, c = t >= 44 && t < 46, d = t >= 46
  show(s.plan.c, a); show(s.wall, b); show(s.big, c); show(s.rep, c); show(s.flow, d)
  if (a) {
    if (!s.pd) s.pd = prepDraw(s.plan.sv, 'r')
    drawAt(s.pd, seg(t, 40.0, 41.4), 0.22)
    const ent = ease(t, 40, 40.4)
    tf(s.plan.c, `perspective(2000px) rotateX(${(1 - ent) * 35}deg) scale(${lerp(1.3, 1, ent) * (1 + 0.05 * seg(t, 40.4, 42))})`)
    op(s.plan.c, 1 - ease(t, 41.85, 42, E.inExpo))
  }
  if (b) {
    s.sheets.forEach((sc, i) => {
      const at = 41.9 + i * 0.18, p = ease(t, at, at + 0.45)
      const col = i < 3 ? i : i - 3, row = i < 3 ? 0 : 1
      const tx = row ? 470 + col * 600 : 170 + col * 600, ty = row ? 560 : 110
      tf(sc.c, `translate3d(${tx + (1 - p) * 900}px, ${ty + (1 - p) * -300}px, ${(1 - p) * 600}px) rotateZ(${(1 - p) * 14}deg) rotateY(${(1 - p) * -35}deg)`)
      op(sc.c, clamp(p * 2))
      if (!sc.d) sc.d = prepDraw(sc.sv, 'xy')
      drawAt(sc.d, seg(t, at - 0.12, at + 0.6), 0.3)
    })
    const cam = ease(t, 42, 45, E.inOutCubic)
    tf(s.plane, `rotateX(${lerp(14, 6, cam)}deg) rotateY(${lerp(-12, 10, cam)}deg) translateZ(${lerp(-200, 40, cam)}px) translateY(${lerp(40, -30, cam)}px)`)
    op(s.wall, 1 - ease(t, 43.85, 44.0, E.inExpo))
  }
  if (c) {
    const ent = ease(t, 44, 44.8)
    s.bigN.textContent = String(Math.round(97 * ent))
    s.bigL.textContent = scramble('DRAWING SHEETS · FROM ONE MODEL', seg(t, 44.1, 44.6), 7)
    s.bigS.textContent = scramble('FRAMING · FOUNDATION · ELEVATIONS · BAR CUTTING LISTS · CONNECTION DETAILS', seg(t, 44.3, 45.0), 8)
    tf(s.big, `translateX(${(1 - ease(t, 44, 44.35)) * -100}px)`)
    s.pages.forEach((pg, i) => {
      const at = 44.1 + i * 0.09, p = ease(t, at, at + 0.4)
      tf(pg, `translate(${(6 - i) * -7 + (1 - p) * 700}px, ${(6 - i) * 7 + (1 - p) * 200}px) rotate(${(1 - p) * 20 + (6 - i) * -0.6}deg)`); op(pg, clamp(p * 2))
    })
    const sp = t >= 45.25 ? spring(t - 45.25, 3.2, 0.32) : 0
    tf(s.stamp, `rotate(-14deg) scale(${t >= 45.25 ? 2.4 - 1.4 * sp : 0})`); op(s.stamp, t >= 45.25 ? 1 : 0)
    const ex = ease(t, 45.85, 46, E.inExpo); op(s.big, 1 - ex); op(s.rep, 1 - ex)
  }
  if (d) {
    s.fh.textContent = typed('Model to signed report.', seg(t, 45.92, 46.35))
    s.boxes.forEach((x, i) => {
      const at = 46.25 + i * 0.25, p = clamp(spring(t - at, 3, 0.45), 0, 1.2)
      tf(x.bx, `translateY(${(1 - p) * 60}px) scale(${0.85 + 0.15 * p})`); op(x.bx, clamp(p * 1.5))
      if (x.ar) op(x.ar, ease(t, at + 0.15, at + 0.3))
    })
    const pull = ease(t, 47.6, 48, E.inCubic)
    tf(s.flow, `scale(${1 - pull * 0.08})`); op(s.flow, 1 - pull)
  }
}

// ════════════════════════════════════════════════════════════════════════
// J · BREADTH (48–54): 108 tools, 16 disciplines, checked
// ════════════════════════════════════════════════════════════════════════
const Jb = scene(48, 54, (root) => {
  const grid = darkGround(root)
  const wall = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '2000px' } }, root)
  const plane = h('div', { class: 'abs', style: { left: '0px', top: '0px', width: '3400px', transformStyle: 'preserve-3d' } }, wall)
  const groups = D.tools
  const cols = 8, cw = 400
  const heights = new Array(cols).fill(0)
  const items = []
  groups.forEach((g) => {
    let c = heights.indexOf(Math.min(...heights))
    const x = c * cw, y = heights[c]
    const gEl = h('div', { class: 'abs', style: { left: x + 'px', top: y + 'px', width: cw - 40 + 'px' } }, plane)
    const hd = h('div', { class: 'mono', style: { fontSize: '14px', color: '#6ba4dc', borderBottom: '1px solid rgba(158,176,197,.25)', paddingBottom: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' } }, gEl, `<span>${g.g}</span><span>${String(g.n).padStart(2, '0')}</span>`)
    items.push({ el: hd, x, y })
    g.tools.forEach((tn, i) => { const e = h('div', { style: { fontSize: '25px', fontWeight: 500, color: '#e8eaed', height: '38px', whiteSpace: 'nowrap' } }, gEl, tn); items.push({ el: e, x, y: y + 40 + i * 38 }) })
    heights[c] += 40 + g.tools.length * 38 + 50
  })
  const ctr = h('div', { class: 'abs', style: { left: '150px', top: '260px' } }, root)
  const n1 = h('div', { class: 'disp', style: { fontSize: '380px', fontWeight: 900, color: '#f2f5f9', letterSpacing: '-.05em', lineHeight: '.8', fontVariantNumeric: 'tabular-nums' } }, ctr, '0')
  const l1 = h('div', { class: 'mono', style: { fontSize: '20px', color: '#e8eaed', marginTop: '34px' } }, ctr)
  const l2 = h('div', { class: 'mono', style: { fontSize: '15px', color: '#9eb0c5', marginTop: '12px' } }, ctr)
  const side = h('div', { class: 'abs', style: { left: '1060px', top: '300px', width: '700px' } }, root)
  const sideRows = [['16', 'DISCIPLINES'], ['3', 'DESIGN CODES'], ['1', 'TYPED ENGINE']].map(([a, b]) => {
    const r = h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '26px', borderTop: '1px solid rgba(158,176,197,.25)', padding: '18px 0' } }, side)
    const n = h('div', { style: { fontSize: '96px', fontWeight: 900, color: '#f2f5f9', width: '140px', letterSpacing: '-.04em', lineHeight: '.9' } }, r, a)
    h('div', { class: 'mono', style: { fontSize: '17px', color: '#9eb0c5' } }, r, b)
    return r
  })
  // validation
  const val = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const vh = h('div', { class: 'abs disp', style: { left: '150px', top: '170px', fontSize: '84px', color: '#f2f5f9', whiteSpace: 'nowrap' } }, val)
  const vtab = h('div', { class: 'abs', style: { left: '150px', top: '330px', width: '1620px' } }, val)
  const vhead = h('div', { class: 'mono', style: { display: 'grid', gridTemplateColumns: '1fr 160px 160px 90px 60px', fontSize: '13px', color: '#9eb0c5', padding: '0 0 12px', borderBottom: '1px solid rgba(158,176,197,.3)' } }, vtab)
  ;['BENCHMARK', 'MANUAL', 'SOFTWARE', 'Δ', 'OK'].forEach((x) => h('div', {}, vhead, x))
  const pick = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [7, 0], [0, 2], [3, 3]]
  const vrows = pick.map(([ti, ri]) => {
    const r = D.val[ti].rows[ri]
    const row = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 160px 160px 90px 60px', alignItems: 'center', height: '62px', borderBottom: '1px solid rgba(158,176,197,.14)', fontSize: '21px', color: '#e8eaed' } }, vtab)
    h('div', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '30px' } }, row, r[0].replace(/ (NSCP|AISC|ACI|Hibbeler|Chopra).*$/, ''))
    h('div', { class: 'mono', style: { letterSpacing: '0' } }, row, r[2])
    h('div', { class: 'mono', style: { letterSpacing: '0' } }, row, r[3])
    h('div', { class: 'mono', style: { letterSpacing: '0', color: '#9eb0c5' } }, row, r[5])
    const ok = h('div', { style: { color: '#4cc38a', fontSize: '24px', fontWeight: 700 } }, row, '✓')
    return { row, ok }
  })
  return { grid, wall, plane, items, ctr, n1, l1, l2, side, sideRows, val, vh, vrows }
})
Jb.update = (t) => {
  const s = Jb
  tf(s.grid, `translate(${-(t - 48) * 20}px, 0)`)
  const a = t < 50, b = t >= 50 && t < 52, c = t >= 52
  show(s.wall, a); show(s.ctr, b); show(s.side, b); show(s.val, c)
  if (a) {
    for (const it of s.items) {
      const at = 47.9 + it.x / 3200 * 0.9 + it.y / 1800 * 0.25
      const p = ease(t, at, at + 0.35)
      tf(it.el, `translateY(${(1 - p) * 30}px)`); op(it.el, p)
      const hl = hash(Math.floor(t * 8), it.x * 7 + it.y)
      if (it.el.className !== 'mono') it.el.style.color = hl > 0.965 ? '#f2b53a' : '#e8eaed'
    }
    const cam = ease(t, 48, 50, E.inOutCubic)
    tf(s.plane, `translate3d(${lerp(200, -1350, cam)}px, ${lerp(300, 120, cam)}px, 0) rotateY(${lerp(18, -8, cam)}deg) rotateX(${lerp(10, 4, cam)}deg)`)
    op(s.wall, 1 - ease(t, 49.85, 50, E.inExpo))
  }
  if (b) {
    s.n1.textContent = String(Math.round(108 * ease(t, 50.0, 50.7)))
    tf(s.n1, `scale(${1 + 0.06 * (t >= 50.7 ? Math.exp(-(t - 50.7) * 8) : 0)})`)
    s.l1.textContent = scramble('CODE-CHECKED CALCULATORS', seg(t, 50.1, 50.6), 3)
    s.l2.textContent = scramble('CONCRETE · STEEL · TIMBER · GEOTECHNICAL · WATER · TRANSPORTATION', seg(t, 50.3, 51.0), 4)
    s.sideRows.forEach((r, i) => { const at = 50.5 + i * 0.5, p = ease(t, at, at + 0.35); tf(r, `translateX(${(1 - p) * 80}px)`); op(r, p) })
    const ex = ease(t, 51.85, 52, E.inExpo); op(s.ctr, 1 - ex); op(s.side, 1 - ex)
  }
  if (c) {
    s.vh.textContent = typed('Checked against closed forms.', seg(t, 51.93, 52.35))
    s.vrows.forEach((r, i) => {
      const at = 52.2 + i * 0.125, p = ease(t, at, at + 0.35)
      tf(r.row, `translateX(${(1 - p) * 120}px)`); op(r.row, p)
      const sp = t >= at + 0.2 ? spring(t - at - 0.2, 3.4, 0.4) : 0; tf(r.ok, `scale(${sp})`)
    })
    const pull = ease(t, 53.6, 54, E.inCubic); tf(s.val, `scale(${1 - pull * 0.06})`); op(s.val, 1 - pull)
  }
}

// ════════════════════════════════════════════════════════════════════════
// K · LIFT (54–56): the reel rewinds to a point
// ════════════════════════════════════════════════════════════════════════
const Kl = scene(54, 56, (root) => {
  h('div', { class: 'abs', style: { inset: '0', background: '#0a131e' } }, root)
  const imgs = ['orbit_30.png', 'canvas_stress.png', 'duo_exag_10.png', 'orbit_10.png', 'duo_canvas_disp.png', 'orbit_44.png'].map((src) => h('img', { src: 'assets/' + src, class: 'abs', style: { left: '460px', top: '170px', width: '1000px' } }, root))
  const dot = h('div', { class: 'abs', style: { left: W / 2 - 9 + 'px', top: H / 2 - 9 + 'px', width: '18px', height: '18px', borderRadius: '50%', background: '#f2b53a' } }, root)
  const ring = h('div', { class: 'abs', style: { left: W / 2 - 60 + 'px', top: H / 2 - 60 + 'px', width: '120px', height: '120px', borderRadius: '50%', border: '1px solid rgba(242,181,58,.6)' } }, root)
  return { imgs, dot, ring }
})
Kl.update = (t) => {
  const s = Kl
  const k = Math.floor((t - 54) / 0.125)
  s.imgs.forEach((im, i) => {
    const on = t < 54.75 && k % s.imgs.length === i
    show(im, on)
    if (on) { const f = (t - 54) % 0.125 / 0.125; tf(im, `scale(${1.1 - 0.1 * f + 0.6 * seg(t, 54.4, 54.75)})`); im.style.filter = `blur(${seg(t, 54.4, 54.75) * 10}px)`; op(im, 1 - seg(t, 54.5, 54.75)) }
  })
  const pulse = 1 + 0.25 * Math.max(0, Math.sin((t - 54.75) * Math.PI * 4))
  const grow = ease(t, 54.75, 55.0, E.outBack)
  tf(s.dot, `scale(${grow * pulse * (1 - 0.7 * ease(t, 55.7, 56, E.inExpo))})`)
  s.dot.style.boxShadow = `0 0 ${20 + 40 * seg(t, 55, 56)}px rgba(242,181,58,.8), 0 0 120px rgba(242,181,58,${0.15 + 0.3 * seg(t, 55, 56)})`
  const r = (t - 54.75) % 0.5 / 0.5
  tf(s.ring, `scale(${0.2 + r * 2.2})`); op(s.ring, t >= 54.75 ? (1 - r) * 0.7 : 0)
}

// ════════════════════════════════════════════════════════════════════════
// L · END (56–60)
// ════════════════════════════════════════════════════════════════════════
const Le = scene(56, 60.1, (root) => {
  darkGround(root)
  const glow = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', background: 'radial-gradient(700px 500px at 50% 46%, rgba(107,164,220,.14), transparent 70%)' } }, root)
  const lb = h('div', { class: 'abs', style: { left: W / 2 - 420 + 'px', top: '330px', width: '230px', height: '230px' } }, root, LOGO('lgE'))
  const lg = $('#lgE', lb); lg.setAttribute('width', 230); lg.setAttribute('height', 230)
  const word = h('div', { class: 'abs disp', style: { left: W / 2 - 160 + 'px', top: '342px', fontSize: '210px', fontWeight: 900, letterSpacing: '.04em', color: '#f2f5f9', height: '200px', lineHeight: '200px', overflow: 'hidden', whiteSpace: 'nowrap' } }, root)
  const letters = [...'ZETA'].map((c) => h('span', { style: { display: 'inline-block' } }, word, c))
  const tag = h('div', { class: 'abs', style: { left: '0px', width: W + 'px', top: '640px', textAlign: 'center', fontSize: '40px', fontWeight: 500, color: '#e8eaed', letterSpacing: '-.01em' } }, root)
  const rule = h('div', { class: 'abs', style: { left: W / 2 + 'px', top: '720px', height: '1px', background: 'rgba(158,176,197,.5)' } }, root)
  const url = h('div', { class: 'abs mono', style: { left: '0px', width: W + 'px', top: '748px', textAlign: 'center', fontSize: '24px', color: '#f2b53a', letterSpacing: '.24em', fontWeight: 600 } }, root)
  const codes = h('div', { class: 'abs mono', style: { left: '0px', width: W + 'px', top: '800px', textAlign: 'center', fontSize: '14px', color: '#9eb0c5' } }, root)
  const ring = h('div', { class: 'abs', style: { left: W / 2 - 305 - 300 + 'px', top: 330 + 115 - 76 - 300 + 'px', width: '600px', height: '600px', borderRadius: '50%', border: '1.5px solid rgba(242,181,58,.8)' } }, root)
  const black = h('div', { class: 'abs', style: { inset: '0', background: '#05090f', opacity: 0 } }, root)
  return { glow, lb, lg, word, letters, tag, rule, url, codes, ring, black }
})
Le.update = (t) => {
  const s = Le
  const imp = spring(t - 56, 2.4, 0.4)
  tf(s.lb, `scale(${0.6 + 0.4 * imp})`)
  const node = $('.lg-node', s.lg); node.style.transformOrigin = '32px 22px'
  node.style.transform = `scale(${1 + 1.4 * Math.exp(-(t - 56) * 7)})`
  node.style.filter = `drop-shadow(0 0 ${3 + 3 * Math.sin((t - 56) * 3) ** 2}px rgba(242,181,58,.95))`
  s.letters.forEach((l, i) => { const p = ease(t, 56.08 + i * 0.05, 56.6 + i * 0.05); tf(l, `translateY(${(1 - p) * 210}px)`) })
  s.word.style.letterSpacing = lerp(0.2, 0.04, ease(t, 56.05, 56.9)) + 'em'
  s.tag.textContent = typed('The structural workbench for Philippine practice.', seg(t, 56.5, 57.2))
  const rp = ease(t, 57.0, 57.5); css(s.rule, { left: W / 2 - 300 * rp + 'px', width: 600 * rp + 'px' })
  s.url.textContent = scramble('ZETASTRUCT.APP', seg(t, 57.1, 57.6), 77)
  s.url.style.textShadow = t > 57.6 ? `0 0 ${10 + 8 * Math.sin((t - 57.6) * 4) ** 2}px rgba(242,181,58,.55)` : 'none'
  s.codes.textContent = scramble('NSCP 2015 · ACI 318-14 · AISC 360-16', seg(t, 57.4, 58.0), 78)
  const r1 = seg(t, 56.0, 57.0); tf(s.ring, `scale(${0.05 + E.outExpo(r1) * 1.7})`); op(s.ring, t >= 56 ? (1 - r1) * 0.9 : 0)
  s.root.style.transform = `scale(${1 + 0.03 * ease(t, 56.2, 60, E.outCubic)})`
  op(s.black, ease(t, 59.55, 60.0, E.inCubic))
}
