// ── Zeta how-to reel: one calculator, five steps, 30 s, 1080×1920 ──────────
// 120 BPM: bars are 2 s, beats 0.5 s. Steps land on bar downbeats; fields type
// on kicks; PASS chips stamp on the snares (beats 2 and 4). Every component is
// rebuilt from the calculator's capture (C[cfg.calc]) — values, ratios, chips,
// the drawing SVG and the worked-solution KaTeX are the app's own.
const CFG = D.cfg
const K = C[CFG.calc]
const M = 72                     // side margin
const CW = W - 2 * M             // content width
const BRANDC = '#0f4c92', AMBER = '#f2b53a', INK = '#0f1b2a', PAPER = '#f4f3ef'

/** The step header every plate shares: amber number, label, one sentence. */
function stepHead(root, n, label, line, dark) {
  const box = h('div', { class: 'abs', style: { left: M + 'px', top: '250px', width: CW + 'px' } }, root)
  const tag = h('div', { class: 'mono', style: { fontSize: '22px', color: dark ? '#9eb0c5' : '#5c6675', display: 'flex', gap: '16px', alignItems: 'center' } }, box)
  const num = h('span', { style: { color: dark ? AMBER : BRANDC, fontWeight: 600 } }, tag, `STEP ${n}`)
  const lab = h('span', {}, tag, label)
  const head = h('div', { class: 'disp', style: { marginTop: '22px', fontSize: '74px', color: dark ? '#f2f5f9' : INK, lineHeight: '1.0', letterSpacing: '-.03em', overflow: 'hidden', paddingBottom: '12px' } }, box, `<span style="display:inline-block">${line}</span>`)
  return { box, num, lab, head, set(t, a) {
    lab.textContent = scramble(label, seg(t, a, a + 0.4), n * 7)
    const p = spring(t - a - 0.05, 2.6, 0.55)
    tf(head.firstChild, `translateY(${(1 - clamp(p, 0, 1.05)) * 110}%)`)
    op(box, t >= a ? 1 : 0)
  } }
}
/** A captured drawing cropped to its ink and fitted, centred, into a w × hMax
 *  slot. The capture's viewBox is the screen canvas, sized for the app's
 *  column rather than the drawing, so fitting it whole left the ink small and
 *  off to one side of whatever held it. */
function fitDrawing(parent, id, x, y, w, hMax, order = 'xy', pad = 10) {
  const probe = drawing(parent, id, 0, 0, w, order)
  const vb = probe.vb, bb = probe.svg.getBBox(); probe.box.remove()
  const x0 = Math.max(vb.x, bb.x - pad), y0 = Math.max(vb.y, bb.y - pad)
  const x1 = Math.min(vb.x + vb.width, bb.x + bb.width + pad), y1 = Math.min(vb.y + vb.height, bb.y + bb.height + pad)
  const crop = bb.width > 0 && bb.height > 0 ? [x0, y0, x1 - x0, y1 - y0] : [vb.x, vb.y, vb.width, vb.height]
  const dw = Math.min(w, hMax * crop[2] / crop[3])
  return drawing(parent, id, x + (w - dw) / 2, y, dw, order, crop)
}
/** Plates hold, then snap out on the last eighth of their final bar. */
function snapOut(root, t, b) {
  const k = ease(t, b - 0.22, b, E.inExpo)
  root.style.transform = `translateY(${-k * 260}px) scale(${1 - 0.04 * k})`
  root.style.filter = k > 0.01 ? `blur(${k * 10}px)` : ''
  root.style.opacity = 1 - k
}

// ════════════════════════════════════════════════════════════════════════
// 0 · HOOK (0–2): the question, FREE stamps on beat 3
// ════════════════════════════════════════════════════════════════════════
const S0 = scene(0, 2.0, (root) => {
  darkGround(root)
  const box = h('div', { class: 'abs', style: { left: M + 'px', top: '640px' } }, root)
  const lines = CFG.hook.map((txt, i) => h('div', { class: 'disp', style: { fontSize: i === 1 ? '156px' : '112px', color: i === CFG.accent ? '#6ba4dc' : '#f2f5f9', whiteSpace: 'nowrap', overflow: 'hidden', paddingBottom: '18px', marginBottom: '-6px', letterSpacing: '-.04em' } }, box, `<span style="display:inline-block">${txt}</span>`))
  const free = h('div', { class: 'abs chip', style: { left: M + 'px', top: '1180px', fontSize: '30px', padding: '12px 26px', background: 'rgba(242,181,58,.12)', border: '1.5px solid ' + AMBER, color: AMBER } }, root, 'FREE CALCULATOR')
  const tag = h('div', { class: 'abs mono', style: { left: M + 'px', top: '540px', fontSize: '22px', color: '#9eb0c5' } }, root)
  return { lines, free, tag }
})
S0.update = (t) => {
  const s = S0
  s.lines.forEach((l, i) => tf(l.firstChild, `translateY(${(1 - E.outExpo(seg(t, 0.05 + i * 0.12, 0.6 + i * 0.12))) * 110}%)`))
  s.tag.textContent = scramble(`ZETA · ${CFG.group} · HOW-TO`, seg(t, 0.1, 0.6), 3)
  const st = t >= 1.0 ? spring(t - 1.0, 3.2, 0.42) : 0
  tf(s.free, `scale(${t >= 1.0 ? 1 + 1.2 * (1 - clamp(st, 0, 1.2)) : 0})`); op(s.free, t >= 1.0 ? 1 : 0)
  s.free.style.boxShadow = t >= 1.0 ? `0 0 ${18 + 30 * Math.exp(-(t - 1) * 5)}px rgba(242,181,58,.45)` : 'none'
  snapOut(s.root, t, 2.0)
}

// ════════════════════════════════════════════════════════════════════════
// 1 · WHERE (2–4): the calculator's title, its URL, the guest banner
// ════════════════════════════════════════════════════════════════════════
const S1 = scene(2.0, 4.0, (root) => {
  paperGround(root)
  const ws = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const banner = h('div', { class: 'abs', style: { left: '0px', top: '520px', width: W + 'px', height: '74px', background: '#fbf3df', borderTop: '1px solid #efdfb8', borderBottom: '1px solid #efdfb8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#5a4a1f' } }, ws,
    '5 free runs left on this calculator.&nbsp;<u style="font-weight:700;color:#5a4a1f">Create a free account</u>')
  const colm = h('div', { class: 'abs', style: { left: M + 'px', top: '690px', width: CW + 'px', display: 'flex', flexDirection: 'column', gap: '30px' } }, ws)
  const title = h('div', { style: { fontSize: '92px', fontWeight: 800, color: INK, letterSpacing: '-.035em', lineHeight: '1', overflow: 'hidden', paddingBottom: '14px' } }, colm, `<span style="display:inline-block">${K.title}</span>`)
  const codes = h('div', { style: { display: 'flex', gap: '14px' } }, colm)
  const chips = [CFG.group.charAt(0) + CFG.group.slice(1).toLowerCase(), 'ACI 318-14 · NSCP 2015'].map((x, i) =>
    h('span', { class: 'chip', style: { fontSize: '22px', padding: '6px 16px', background: '#e6eef7', border: '1px solid #c9d7e8', color: BRANDC, fontWeight: 600, letterSpacing: i ? '.04em' : '0' } }, codes, x))
  const desc = h('div', { style: { fontSize: '30px', lineHeight: '1.45', color: '#5c6675' } }, colm, K.desc.split('. ')[0] + '.')
  const url = h('div', { class: 'abs mono', style: { left: M + 'px', top: '1330px', fontSize: '30px', color: BRANDC, letterSpacing: '.06em', textTransform: 'none' } }, ws)
  const rule = h('div', { class: 'abs', style: { left: M + 'px', top: '1390px', height: '2px', background: BRANDC } }, ws)
  const note = h('div', { class: 'abs mono', style: { left: M + 'px', top: '1420px', fontSize: '20px', color: '#5c6675' } }, ws, 'NO ACCOUNT NEEDED · NO INSTALL')
  return { banner, title, chips, desc, url, rule, note }
})
S1.update = (t) => {
  const s = S1
  tf(s.title.firstChild, `translateY(${(1 - clamp(spring(t - 2.0, 2.4, 0.55), 0, 1.04)) * 110}%)`)
  s.chips.forEach((c, i) => { const p = ease(t, 2.15 + i * 0.08, 2.5 + i * 0.08); tf(c, `translateY(${(1 - p) * 30}px)`); op(c, p) })
  op(s.desc, ease(t, 2.3, 2.7)); tf(s.desc, `translateY(${(1 - ease(t, 2.3, 2.8)) * 30}px)`)
  s.url.textContent = 'zetastruct.app' + typed(CFG.route, seg(t, 2.5, 2.95))
  css(s.rule, { width: CW * ease(t, 2.5, 3.0) + 'px' })
  // the banner drops in on beat 3 — the guest allowance is the first thing a visitor sees
  const bp = spring(t - 3.0, 2.8, 0.5)
  tf(s.banner, `translateY(${(1 - clamp(bp, 0, 1.1)) * -120}px)`); op(s.banner, t >= 3.0 ? 1 : 0)
  op(s.note, ease(t, 3.2, 3.5))
  snapOut(s.root, t, 4.0)
}

// ════════════════════════════════════════════════════════════════════════
// 2 · STEP 1 (4–8): the inputs type in on the kicks
// ════════════════════════════════════════════════════════════════════════
const S2 = scene(4.0, 8.0, (root) => {
  paperGround(root)
  const hd = stepHead(root, '01', 'ENTER THE INPUTS', CFG.s1, false)
  const ws = h('div', { class: 'abs ws', style: { left: M + 'px', top: '560px', width: '440px', transformOrigin: '0 0', transform: 'scale(2.12)' } }, root)
  const cardEl = card(ws, 0, 0, 440, null, { padding: '18px 20px 20px' })
  const fl = CFG.fields.map((i) => K.fields[i])
  const fs = [], secs = []
  let yy = 0, last = null, col = 0
  fl.forEach((f, i) => {
    if (f.sec !== last) { if (col === 1) { yy += 60; col = 0 } secs.push({ el: secTitle(cardEl, f.sec, 20, 18 + yy, 400), i }); yy += 28; last = f.sec }
    fs.push(field(cardEl, f, 20 + col * 204, 18 + yy, 196))
    col = 1 - col
    if (col === 0 || fl[i + 1]?.sec !== f.sec) { yy += 60; col = 0 }
  })
  cardEl.style.height = yy + 34 + 'px'
  const calc = h('div', { class: 'abs', style: { left: '20px', top: yy + 46 + 'px', width: '400px', height: '40px', borderRadius: '7px', background: BRANDC, color: '#fff', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, ws, 'Live — results update as you type')
  return { hd, ws, cardEl, fs, secs, calc }
})
S2.update = (t) => {
  const s = S2
  s.hd.set(t, 4.0)
  const cp = clamp(spring(t - 4.1, 2.2, 0.55), 0, 1.04)
  tf(s.cardEl, `translateY(${(1 - cp) * 160}px)`); op(s.cardEl, t >= 4.1 ? 1 : 0)
  s.secs.forEach((x, i) => op(x.el, ease(t, 4.2 + x.i * 0.36, 4.45 + x.i * 0.36)))
  // one field per kick from beat 2 of bar 3: typed in a quarter of a beat
  s.fs.forEach((f, i) => {
    const a = 4.5 + i * 0.36
    const p = seg(t, a, a + 0.24)
    f.set(p, t >= a && t < a + 0.36)
    op(f.el, ease(t, a - 0.12, a + 0.05))
  })
  op(s.calc, ease(t, 7.3, 7.5)); tf(s.calc, `translateY(${(1 - ease(t, 7.3, 7.6)) * 20}px)`)
  // sub-cut: on bar 4's downbeat the camera pushes into the lower half of the card
  const push = ease(t, 6.0, 6.35, E.inOutCubic) * (1 - ease(t, 7.25, 7.6, E.inOutCubic))
  tf(s.ws, `translateY(${-push * 260}px) scale(${2.12 + push * 0.18})`)
  snapOut(s.root, t, 8.0)
}

// ════════════════════════════════════════════════════════════════════════
// 3 · STEP 2 (8–12): the live drawing strokes on
// ════════════════════════════════════════════════════════════════════════
const S3 = scene(8.0, 12.0, (root) => {
  paperGround(root)
  const hd = stepHead(root, '02', 'WATCH THE DRAWING', CFG.s2, false)
  const meta = K.draw[0]
  // as wide as the column allows, but never taller than the space above the HUD
  const dw = Math.min(CW - 48, 1100 * meta.w / meta.h), dh = meta.h * dw / meta.w
  const cw = dw + 48
  const box = h('div', { class: 'abs', style: { left: (W - cw) / 2 + 'px', top: '560px', width: cw + 'px', height: dh + 90 + 'px', transformOrigin: '55% 0%' } }, root)
  const cd = card(box, 0, 0, cw, dh + 90, { boxShadow: '0 30px 90px -40px rgba(15,27,42,.5)' })
  const live = h('div', { class: 'abs chip', style: { right: '24px', top: '20px', fontSize: '15px', padding: '4px 12px', background: '#ddefe3', border: '1px solid #c2ddcb', color: '#14603a' } }, cd, 'LIVE')
  h('div', { class: 'abs mono', style: { left: '24px', top: '24px', fontSize: '15px', color: INK, fontWeight: 600 } }, cd, 'DRAWING SHEET')
  const d = drawing(cd, meta.id, 24, 66, dw, 'xy')
  root.appendChild(hd.box)
  return { hd, box, cd, d, live }
})
S3.update = (t) => {
  const s = S3
  s.hd.set(t, 8.0)
  const cp = clamp(spring(t - 8.05, 2.2, 0.55), 0, 1.04)
  tf(s.cd, `translateY(${(1 - cp) * 180}px)`); op(s.cd, t >= 8.05 ? 1 : 0)
  s.d.draw(ease(t, 8.2, 10.0, E.outCubic), 0.3)
  const lp = t >= 9.0 ? spring(t - 9.0, 3, 0.45) : 0
  tf(s.live, `scale(${t >= 9.0 ? 1 + (1 - clamp(lp, 0, 1.2)) : 0})`)
  // sub-cut on bar 6's downbeat: punch into the dimensioned detail, hold, release on beat 4
  const z = ease(t, 10.0, 10.3, E.outExpo) * (1 - ease(t, 11.4, 11.75, E.inOutCubic))
  tf(s.box, `scale(${1 + 0.38 * z}) translate(${-40 * z}px, ${0}px)`)
  snapOut(s.root, t, 12.0)
}

/** Measure the cards at their final content (values in, chips shown). */
function cards_full(s) { s.cards.forEach((c) => c.set(1, 1)) }

// ════════════════════════════════════════════════════════════════════════
// 4 · STEP 3 (12–16): the checks — values count up, chips stamp on snares
// ════════════════════════════════════════════════════════════════════════
const S4 = scene(12.0, 16.0, (root) => {
  paperGround(root)
  const hd = stepHead(root, '03', 'READ THE CHECKS', CFG.s3, false)
  const ws = h('div', { class: 'abs ws', style: { left: M + 'px', top: '560px', width: '400px', transformOrigin: '0 0', transform: `scale(${CW / 400})` } }, root)
  const col = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, ws)
  const cards = CFG.cards.map((i) => rcard(col, K.cards[i], null, null, 400))
  return { hd, ws, col, cards, fitted: false }
})
S4.update = (t) => {
  const s = S4
  if (!s.fitted) {
    cards_full(s)
    const k = Math.min(CW / 400, 1180 / s.col.offsetHeight)
    css(s.ws, { transform: `scale(${k})`, left: (W - 400 * k) / 2 + 'px' }); s.fitted = true
  }
  s.hd.set(t, 12.0)
  s.cards.forEach((c, i) => {
    const a = 12.15 + i * 0.12
    const p = clamp(spring(t - a, 2.4, 0.55), 0, 1.04)
    tf(c.el, `translateY(${(1 - p) * 120}px)`); op(c.el, t >= a ? 1 : 0)
    // the stamp lands on the snare: 12.5, 13.5, 14.5, 15.5
    const st = 12.5 + i
    c.set(seg(t, a + 0.1, a + 1.0), t >= st ? (t - st) : 0)
    const gov = i === CFG.gov && t >= 14.75
    c.el.style.boxShadow = gov ? `0 0 0 ${2 + 2 * Math.exp(-(t - 14.75) * 6)}px ${BRANDC}` : 'none'
  })
  snapOut(s.root, t, 16.0)
}

/** Shrink an equation to maxW from its CURRENT size (stable when called every
 *  frame — comp.js's fit() scales from the base size and would oscillate). */
function fitTo(e, maxW) {
  e.el.style.width = 'max-content'
  const w = e.el.offsetWidth, cur = parseFloat(e.el.style.fontSize)
  if (w > maxW) e.el.style.fontSize = cur * maxW / w + 'px'
}
/** Stack the solution cards and their equations by measured height. KaTeX's
 *  fonts arrive on first use, so this runs every frame rather than once. */
function layoutSolution(s) {
  let y = 0
  s.steps.forEach((st) => {
    let ey = 108
    st.eqs.forEach((e) => { fitTo(e, CW - 70); e.el.style.top = ey + 'px'; ey += e.el.offsetHeight + 12 })
    st.el.style.height = ey + 12 + 'px'; st.el.style.top = y + 'px'
    y += ey + 12 + 24
  })
}

// ════════════════════════════════════════════════════════════════════════
// 5 · STEP 4 (16–20): the Calculations tab — the worked solution assembles
// ════════════════════════════════════════════════════════════════════════
const S5 = scene(16.0, 20.0, (root) => {
  paperGround(root)
  const hd = stepHead(root, '04', 'OPEN CALCULATIONS', CFG.s4, false)
  const tabs = h('div', { class: 'abs', style: { left: M + 'px', top: '540px', width: CW + 'px', height: '78px', background: '#fff', border: '1px solid #e3e1da', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '44px', padding: '0 34px' } }, root)
  const names = ['DRAWING SHEET', 'CALCULATIONS', 'REFERENCES'].map((x) => h('span', { class: 'mono', style: { fontSize: '20px', fontWeight: 600, color: INK, letterSpacing: '.1em' } }, tabs, x))
  const ul = h('div', { class: 'abs', style: { top: '74px', height: '3px', background: BRANDC } }, tabs)
  const list = h('div', { class: 'abs', style: { left: M + 'px', top: '660px', width: CW + 'px' } }, root)
  const steps = CFG.steps.map((si, k) => {
    const st = K.steps[si]
    const el = h('div', { class: 'abs', style: { left: 0, top: k * 345 + 'px', width: CW + 'px', height: '320px', background: '#fff', border: '1px solid #e3e1da', borderRadius: '14px', overflow: 'hidden' } }, list)
    const ttl = h('div', { class: 'abs', style: { left: '30px', top: '24px', fontSize: '30px', fontWeight: 700, color: INK, whiteSpace: 'nowrap' } }, el, `<span class="mono" style="color:${BRANDC};font-size:22px;margin-right:14px">${String(st.n).padStart(2, '0')}</span>${st.title}`)
    const ref = h('div', { class: 'abs mono', style: { left: '30px', top: '74px', fontSize: '16px', color: '#5c6675', letterSpacing: '.08em', textTransform: 'none' } }, el, st.ref.replace(/^PASS\s+/, '').split('\n')[0])
    const eqs = st.eqs.slice(0, k === 2 ? 1 : 2).map((e, j) => eqBox(el, e.html, 30, 112 + j * 100, 28))
    return { el, ttl, ref, eqs }
  })
  return { hd, tabs, names, ul, steps, fitted: false }
})
S5.update = (t) => {
  const s = S5
  layoutSolution(s)
  s.hd.set(t, 16.0)
  op(s.tabs, ease(t, 16.05, 16.3))
  // the underline slides from Drawing sheet to Calculations on beat 2
  const pos = (i) => ({ x: s.names[i].offsetLeft, w: s.names[i].offsetWidth })
  const a = pos(0), b = pos(1), k = ease(t, 16.5, 16.75, E.inOutCubic)
  css(s.ul, { left: lerp(a.x, b.x, k) + 'px', width: lerp(a.w, b.w, k) + 'px' })
  s.names.forEach((n, i) => { n.style.color = (i === 1 ? k > 0.5 : i === 0 ? k <= 0.5 : false) ? BRANDC : '#5c6675' })
  s.steps.forEach((st, i) => {
    const a0 = 16.75 + i * 1.0
    const p = clamp(spring(t - a0, 2.4, 0.55), 0, 1.04)
    tf(st.el, `translateY(${(1 - p) * 140}px)`); op(st.el, t >= a0 ? 1 : 0)
    op(st.ref, ease(t, a0 + 0.2, a0 + 0.45))
    st.eqs.forEach((e, j) => e.set(seg(t, a0 + 0.2 + j * 0.25, a0 + 0.85 + j * 0.25)))
  })
  snapOut(s.root, t, 20.0)
}

// ════════════════════════════════════════════════════════════════════════
// 6 · STEP 5 (20–24): Export PDF report — the calc sheet fans out
// ════════════════════════════════════════════════════════════════════════
const S6 = scene(20.0, 24.0, (root) => {
  darkGround(root)
  const hd = stepHead(root, '05', 'EXPORT THE CALC SHEET', 'Signed-off format, ready to print.', true)
  const btn = h('div', { class: 'abs', style: { left: M + 'px', top: '560px', width: CW + 'px', height: '104px', borderRadius: '14px', background: BRANDC, color: '#fff', fontSize: '38px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' } }, root,
    '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#fff" stroke-width="2"><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z"/></svg>Export PDF report')
  const ripple = h('div', { class: 'abs', style: { left: W / 2 - 60 + 'px', top: 612 - 60 + 'px', width: '120px', height: '120px', borderRadius: '50%', border: '2px solid rgba(255,255,255,.7)' } }, root)
  const stack = h('div', { class: 'abs', style: { left: '0px', top: '760px', width: W + 'px', height: '1000px' } }, root)
  const pw = 600, ph = 820
  const pages = [0, 1, 2].map(() => h('div', { class: 'abs card', style: { left: (W - pw) / 2 + 'px', top: '40px', width: pw + 'px', height: ph + 'px', borderRadius: '8px', overflow: 'hidden' } }, stack))
  // page 3 (front): title block — rebuilt from the app's sheet header
  pages[2].innerHTML = `<div style="padding:34px 34px 0">
    <div class="mono" style="font-size:12px;color:#5c6675">PREPARED BY —</div>
    <div style="font-size:34px;font-weight:800;color:${BRANDC};letter-spacing:-.03em;margin-top:8px">${K.title}</div>
    <div style="height:2px;background:${BRANDC};margin-top:16px"></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e3e1da;border-radius:6px;margin-top:16px">
      ${['PROJECT', 'SHEET', 'PREPARED BY', 'DATE'].map((x, i) => `<div style="padding:10px;${i ? 'border-left:1px solid #e3e1da' : ''}"><div class="mono" style="font-size:9px;color:#5c6675">${x}</div><div style="font-size:12px;font-weight:600;margin-top:6px;color:${INK}">${['Lot 12 Residence', 'H-01 · Rev A', 'Engineer, CE', '2026-10-07'][i]}</div></div>`).join('')}
    </div>
    <div style="font-size:17px;font-weight:700;color:${INK};margin-top:22px">1. Input summary</div>
    <div style="margin-top:10px;border:1px solid #e3e1da;border-radius:6px;font-size:12px">
      ${CFG.fields.slice(0, 6).map((i) => K.fields[i]).map((f, j) => `<div style="display:flex;justify-content:space-between;padding:7px 10px;${j ? 'border-top:1px solid #eeece5' : ''}"><span style="color:#5c6675">${f.label}</span><span style="font-family:'IBM Plex Mono';font-weight:500;color:${INK}">${f.value} ${f.unit}</span></div>`).join('')}
    </div>
    <div data-h="draw" style="font-size:17px;font-weight:700;color:${INK};margin-top:22px">2. Drawing</div></div>`
  // the drawing fills the page under its heading: measured, not a fixed slot
  const dh = pages[2].querySelector('[data-h=draw]')
  const top = dh.offsetTop + dh.offsetHeight + 14
  fitDrawing(pages[2], K.draw[0].id, 34, top, pw - 68, ph - top - 34)
  // pages behind: the worked solution and the checks
  pages[1].innerHTML = `<div style="padding:34px"><div style="font-size:17px;font-weight:700;color:${INK}">${K.solTitle}</div>${K.steps.slice(0, 7).map((s) => `<div style="margin-top:16px;font-size:12px;font-weight:600;color:${INK}"><span class="mono" style="color:${BRANDC};margin-right:8px">${String(s.n).padStart(2, '0')}</span>${s.title}</div><div style="height:30px;margin-top:6px;border-radius:5px;background:#f6f5f1"></div>`).join('')}</div>`
  pages[0].innerHTML = `<div style="padding:34px"><div style="font-size:17px;font-weight:700;color:${INK}">3. Results summary</div>${K.cards.slice(0, 4).map((c) => `<div style="display:flex;justify-content:space-between;margin-top:16px;font-size:13px;color:${INK}"><span>${c.title}</span><b style="font-family:'IBM Plex Mono'">${c.value} ${c.unit || ''}</b></div>`).join('')}</div>`
  return { hd, btn, ripple, stack, pages }
})
S6.update = (t) => {
  const s = S6
  s.hd.set(t, 20.0)
  op(s.btn, ease(t, 20.05, 20.25))
  // the press on beat 2: down, release, ripple
  const press = t >= 20.5 && t < 20.62 ? 0.955 : 1 + 0.02 * Math.exp(-(t - 20.62) * 14) * (t >= 20.62 ? 1 : 0)
  tf(s.btn, `scale(${press})`)
  const r = seg(t, 20.5, 21.1)
  tf(s.ripple, `scale(${0.2 + E.outExpo(r) * 7})`); op(s.ripple, t >= 20.5 ? (1 - r) * 0.8 : 0)
  // three pages spring in and fan: on beats 1, 2, 3 of bar 11
  const fan = [[-26, -8, -150], [0, 0, 0], [26, 8, 150]]
  s.pages.forEach((p, i) => {
    const a = 21.0 + i * 0.5
    const k = clamp(spring(t - a, 2.2, 0.55), 0, 1.05)
    const [rz, dy, dx] = fan[i]
    const spread = ease(t, 22.6, 23.1, E.inOutCubic)
    tf(p, `translate(${dx * spread}px, ${(1 - k) * 700 + dy * spread}px) rotate(${rz * 0.3 * spread}deg)`)
    op(p, t >= a ? 1 : 0)
  })
  snapOut(s.root, t, 24.0)
}

// ════════════════════════════════════════════════════════════════════════
// 7 · ALSO INSIDE (24–26): the feature chips, one per eighth
// ════════════════════════════════════════════════════════════════════════
const S7 = scene(24.0, 26.0, (root) => {
  darkGround(root)
  const ttl = h('div', { class: 'abs disp', style: { left: M + 'px', top: '420px', fontSize: '96px', color: '#f2f5f9', overflow: 'hidden', paddingBottom: '14px' } }, root, '<span style="display:inline-block">Also inside.</span>')
  const list = h('div', { class: 'abs', style: { left: M + 'px', top: '620px', width: CW + 'px', display: 'flex', flexDirection: 'column', gap: '22px' } }, root)
  const chips = CFG.features.map((f) => {
    const [txt, tag] = f.split('|')
    const el = h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px', padding: '24px 30px', border: '1px solid rgba(158,176,197,.3)', borderRadius: '14px', background: 'rgba(15,27,42,.6)', fontSize: '38px', fontWeight: 600, color: '#e8eaed' } }, list,
      `<span style="width:12px;height:12px;border-radius:50%;background:${tag ? AMBER : '#6ba4dc'};flex:none"></span><span style="flex:1">${txt}</span>` + (tag ? `<span class="mono" style="font-size:20px;color:${AMBER};border:1px solid ${AMBER};border-radius:999px;padding:4px 14px">${tag}</span>` : ''))
    return el
  })
  return { ttl, chips }
})
S7.update = (t) => {
  const s = S7
  tf(s.ttl.firstChild, `translateY(${(1 - E.outExpo(seg(t, 24.0, 24.4))) * 110}%)`)
  s.chips.forEach((c, i) => {
    const a = 24.25 + i * 0.25
    const k = E.outExpo(seg(t, a, a + 0.35))
    tf(c, `translateX(${(1 - k) * 140}px)`); op(c, k)
  })
  snapOut(s.root, t, 26.0)
}

// ════════════════════════════════════════════════════════════════════════
// 8 · PLAN + END (26–30): what it costs, then the lockup
// ════════════════════════════════════════════════════════════════════════
const S8 = scene(26.0, 30.01, (root) => {
  darkGround(root)
  const free = h('div', { class: 'abs disp', style: { left: M + 'px', top: '420px', fontSize: '200px', color: AMBER, letterSpacing: '-.05em', overflow: 'hidden', paddingBottom: '20px' } }, root, '<span style="display:inline-block">Free.</span>')
  const rows = [['GUEST', '5 runs per calculator — no account'], ['FREE ACCOUNT', 'Unlimited runs · 3 saved projects'], ['PRO · MAX', '3D Model Space, design pipeline & more']].map(([a, b], i) => {
    const el = h('div', { class: 'abs', style: { left: M + 'px', top: 690 + i * 120 + 'px', width: CW + 'px', display: 'flex', alignItems: 'baseline', gap: '24px', borderTop: '1px solid rgba(158,176,197,.3)', paddingTop: '22px' } }, root)
    h('span', { class: 'mono', style: { fontSize: '22px', color: i === 2 ? '#9eb0c5' : AMBER, width: '260px', flex: 'none' } }, el, a)
    h('span', { style: { fontSize: '34px', fontWeight: 600, color: i === 2 ? '#9eb0c5' : '#f2f5f9' } }, el, b)
    return el
  })
  const WM = WORD(92)
  const LX = (W - (172 + 34 + WM.width())) / 2
  const lb = h('div', { class: 'abs', style: { left: LX + 'px', top: '1200px', width: '172px', height: '172px' } }, root, LOGO('lgH'))
  const lg = $('#lgH', lb); lg.setAttribute('width', 172); lg.setAttribute('height', 172)
  root.appendChild(WM.el); css(WM.el, { left: LX + 206 + 'px', top: 1200 + 86 - 46 + 'px' })
  const tag = h('div', { class: 'abs', style: { left: 0, width: W + 'px', top: '1420px', textAlign: 'center', fontSize: '34px', fontWeight: 600, color: '#e8eaed' } }, root)
  const url = h('div', { class: 'abs mono', style: { left: 0, width: W + 'px', top: '1500px', textAlign: 'center', fontSize: '30px', color: '#6ba4dc', letterSpacing: '.12em', textTransform: 'none' } }, root)
  const ring = h('div', { class: 'abs', style: { left: LX + 86 - 300 + 'px', top: 1286 - 300 + 'px', width: '600px', height: '600px', borderRadius: '50%', border: '1.5px solid rgba(242,181,58,.85)' } }, root)
  const black = h('div', { class: 'layer', style: { background: '#000', opacity: 0 } }, root)
  return { free, rows, lb, lg, WM, tag, url, ring, black }
})
S8.update = (t) => {
  const s = S8
  tf(s.free.firstChild, `translateY(${(1 - clamp(spring(t - 26.0, 2.6, 0.45), 0, 1.05)) * 110}%)`)
  s.free.style.textShadow = `0 0 ${20 + 30 * Math.exp(-(t - 26) * 4)}px rgba(242,181,58,.35)`
  s.rows.forEach((r, i) => { const k = E.outExpo(seg(t, 26.5 + i * 0.5, 26.9 + i * 0.5)); tf(r, `translateY(${(1 - k) * 50}px)`); op(r, k) })
  // the lockup unfolds from the amber point on bar 15's downbeat
  const L0 = 28.0
  markFromCentre(s.lg, { diag: t >= L0 ? clamp(spring(t - L0, 2.6, 0.45), 0, 1.06) : 0, top: ease(t, L0 + 0.12, L0 + 0.4), bot: ease(t, L0 + 0.18, L0 + 0.46), shade: ease(t, L0 + 0.4, L0 + 0.75) })
  markFlash(s.lg, t >= L0 - 0.25 ? (t < L0 ? 0.5 : 1.5 * Math.exp(-(t - L0) * 4.5)) : 0, 1.4)
  s.WM.set([0, 1, 2, 3].map((i) => ease(t, L0 + 0.3 + i * 0.05, L0 + 0.8 + i * 0.05)), lerp(0.2, 0.04, ease(t, L0 + 0.3, L0 + 1.1)))
  const r1 = seg(t, L0, L0 + 1.0); tf(s.ring, `scale(${0.05 + E.outExpo(r1) * 1.8})`); op(s.ring, t >= L0 ? (1 - r1) * 0.9 : 0)
  s.tag.textContent = typed('Structural engineering made clearer.', seg(t, L0 + 0.6, L0 + 1.2))
  s.url.textContent = scramble('zetastruct.app' + CFG.route, seg(t, L0 + 0.9, L0 + 1.4), 41)
  op(s.black, ease(t, 29.55, 30.0, E.inCubic))
}
