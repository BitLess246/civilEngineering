// ════════════════════════════════════════════════════════════════════════
// J · EVERY CHECK (44–50): the result cards of every calculator, as a field
// ════════════════════════════════════════════════════════════════════════
const ALLCARDS = (() => {
  const out = []
  for (const [k, c] of Object.entries(C)) {
    if (k.endsWith('_ok')) continue
    const src = C[k + '_ok'] || c
    for (const cd of src.cards) if (cd.value && !/FAIL|NOT RUN/.test(cd.chip)) out.push(cd)
  }
  return out.map((c, i) => [hash(i, 41), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
})()
const PS = scene(44, 50.05, (root) => {
  darkGround(root)
  const NX = 9, NY = 6
  const view = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '2200px' } }, root)
  const plane = h('div', { class: 'abs ws', style: { left: '0px', top: '0px', width: NX * 330 + 'px', height: NY * 250 + 'px', transformStyle: 'preserve-3d' } }, view)
  const hero = ALLCARDS.findIndex((c) => c.title === 'Critical circle')
  const order = [...ALLCARDS]
  if (hero >= 0) { const [hc] = order.splice(hero, 1); order.splice(2 * NX + 4, 0, hc) }
  const cells = []
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = order[(j * NX + i) % order.length]
    const rc = rcard(plane, c, i * 330, j * 250, 306)
    cells.push({ rc, i, j })
  }
  const band = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', background: 'linear-gradient(90deg, rgba(11,20,32,.92) 0%, rgba(11,20,32,.75) 45%, rgba(11,20,32,0) 80%)' } }, root)
  const words = ['Pass or fail.', 'Utilization.', 'Clause.'].map((w, k) => h('div', { class: 'abs disp', style: { left: '130px', top: 250 + k * 190 + 'px', fontSize: '170px', color: k === 2 ? '#6ba4dc' : '#f2f5f9', height: '180px', overflow: 'hidden', whiteSpace: 'nowrap', paddingBottom: '24px' } }, root, `<span style="display:inline-block">${w}</span>`))
  const note = h('div', { class: 'abs mono', style: { left: '138px', top: '200px', fontSize: '15px', color: '#9eb0c5' } }, root, 'EVERY CHECK, EVERY CALCULATOR')
  return { view, plane, cells, band, words, note, NX, NY }
})
PS.update = (t) => {
  const s = PS
  // the plane: tilted, trucking; bar 24 snaps flat onto one card, bar 24 + 2 back out
  const st = kf(t, [
    [44.0, { x: 200, y: 60, rx: 30, rz: -12, s: 0.95 }], [45.95, { x: -340, y: -60, rx: 28, rz: -10, s: 0.9 }, E.inOutCubic],
    [46.25, { x: -1350 + 960 - 150, y: -500 + 540 - 90, rx: 0, rz: 0, s: 1.0 }, E.outExpo], [46.9, { x: -1350 + 960 - 150, y: -500 + 540 - 90, rx: 0, rz: 0, s: 1.0 }, E.lin],
    [47.2, { x: -260, y: -40, rx: 34, rz: -14, s: 0.7 }, E.outExpo], [49.6, { x: -720, y: -160, rx: 30, rz: -12, s: 0.66 }, E.inOutCubic],
  ])
  const zoom = ease(t, 45.95, 46.25, E.outExpo) * (1 - ease(t, 46.9, 47.2, E.outExpo))
  s.plane.style.transformOrigin = '50% 50%'
  s.plane.style.transform = `translate3d(${st.x}px, ${st.y}px, 0) rotateX(${st.rx}deg) rotateZ(${st.rz}deg) scale(${st.s * (1 + zoom * 0.9)})`
  s.cells.forEach((c) => {
    const a = 44.0 + (c.i + c.j) * 0.045
    const p = spring(t - a, 2.6, 0.5)
    c.rc.el.style.transform = `translateZ(${(1 - clamp(p, 0, 1.15)) * 500}px)`
    c.rc.el.style.opacity = clamp((t - a) * 5)
    c.rc.set(seg(t, a, a + 0.7), t - a - 0.35)
  })
  // bar 25: the three words, one a beat
  const dark = ease(t, 47.9, 48.1)
  op(s.band, dark)
  s.view.style.filter = dark > 0.01 ? `brightness(${1 - dark * 0.45})` : ''
  ;[48.0, 48.5, 49.0].forEach((a, k) => { const p = ease(t, a, a + 0.4); tf(s.words[k].firstChild, `translateY(${(1 - p) * 200}px)`); op(s.words[k], t >= a ? 1 : 0) })
  op(s.note, ease(t, 48.0, 48.3)); s.note.textContent = scramble('EVERY CHECK, EVERY CALCULATOR', seg(t, 48.0, 48.5), 9)
  const ex = ease(t, 49.7, 50.0, E.inExpo)
  s.root.style.transform = `translateY(${-ex * 300}px)`; s.root.style.opacity = 1 - ex
}

// ════════════════════════════════════════════════════════════════════════
// K · 108 TOOLS (50–54): the catalogue as moving type, then the search
// ════════════════════════════════════════════════════════════════════════
const TL = scene(50, 54.05, (root) => {
  darkGround(root)
  const groups = D.tools.tools.filter((g) => g.g !== 'REFERENCE')
  const flat = []
  for (const g of groups) { flat.push({ g: g.g, n: g.n }); for (const x of g.tools) flat.push({ t: x }) }
  const NR = 8, rows = []
  const per = Math.ceil(flat.length / NR)
  for (let r = 0; r < NR; r++) {
    const row = h('div', { class: 'abs', style: { left: '0px', top: 70 + r * 118 + 'px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: '34px' } }, root)
    const items = []
    const chunk = flat.slice(r * per, (r + 1) * per)
    for (let rep = 0; rep < 3; rep++) for (const it of chunk) {
      if (it.g) items.push({ el: h('span', { class: 'mono', style: { fontSize: '17px', color: '#6ba4dc', letterSpacing: '.18em' } }, row, `${it.g} ${String(it.n).padStart(2, '0')}`), name: '' })
      else items.push({ el: h('span', { style: { fontSize: '62px', fontWeight: 800, letterSpacing: '-.025em', color: '#f2f5f9' } }, row, it.t), name: it.t.toLowerCase() })
    }
    rows.push({ row, items, dir: r % 2 ? 1 : -1, sp: 70 + (r * 37) % 60 })
  }
  const box = h('div', { class: 'abs', style: { left: W / 2 - 330 + 'px', top: H / 2 - 44 + 'px', width: '660px', height: '88px', borderRadius: '14px', background: '#fff', display: 'flex', alignItems: 'center', gap: '18px', padding: '0 26px', boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' } }, root)
  box.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#5c6675" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'
  const q = h('div', { style: { flex: 1, fontSize: '36px', fontWeight: 600, color: '#0f1b2a' } }, box)
  h('div', { class: 'mono', style: { fontSize: '15px', color: '#736d5e', border: '1px solid #e3e1da', borderRadius: '6px', padding: '4px 8px' } }, box, '⌘K')
  const hit = h('div', { class: 'abs', style: { left: W / 2 - 330 + 'px', top: H / 2 + 60 + 'px', width: '660px', borderRadius: '12px', background: '#fff', padding: '18px 26px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' } }, root)
  hit.innerHTML = `<span style="display:flex;width:44px;height:44px;border-radius:10px;background:#0f4c92;align-items:center;justify-content:center">${(D.tools.icons.GEOTECHNICAL || '').replace(/width="\d+" height="\d+"/, 'width="24" height="24"').replace(/stroke="[^"]*"/g, 'stroke="#fff"')}</span><span style="display:flex;flex-direction:column"><b style="font-size:26px;color:#0f1b2a">Slope Stability</b><span style="font-family:'IBM Plex Mono';font-size:13px;color:#0f4c92;letter-spacing:.08em">GEOTECHNICAL · BISHOP / FELLENIUS / JANBU</span></span><span style="margin-left:auto;font-family:'IBM Plex Mono';font-size:14px;color:#736d5e">↵</span>`
  const big = h('div', { class: 'abs', style: { left: '0px', top: '0px', width: W + 'px', height: H + 'px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }, root)
  const n108 = h('div', { class: 'disp', style: { fontSize: '420px', fontWeight: 900, color: '#f2f5f9', letterSpacing: '-.06em', lineHeight: '.8', height: '340px', overflow: 'hidden' } }, big, '<span style="display:inline-block">108</span>')
  const lab = h('div', { class: 'mono', style: { fontSize: '26px', color: '#9eb0c5', marginTop: '46px', letterSpacing: '.3em' } }, big)
  return { rows, box, q, hit, big, n108, lab }
})
TL.update = (t) => {
  const s = TL
  const QUERY = 'slope'
  const typedN = [51.0, 51.125, 51.25, 51.375, 51.5].filter((a) => t >= a).length
  const query = QUERY.slice(0, typedN)
  const fall = ease(t, 52.0, 52.35, E.inExpo)
  s.rows.forEach((r, k) => {
    // drift, plus a shove on every beat
    let off = r.dir * r.sp * (t - 50)
    for (let b = 50.5; b <= t; b += 0.5) off += r.dir * 46 * ease(t, b, b + 0.2, E.outExpo)
    const x0 = r.dir > 0 ? -1800 : -200
    r.row.style.transform = `translate(${x0 + off}px, ${fall * (k % 2 ? 700 : -700)}px)`
    r.row.style.opacity = ease(t, 49.98, 50.1) * (1 - fall)
    for (const it of r.items) {
      const m = !query || (it.name && it.name.includes(query))
      it.el.style.opacity = query ? (m && it.name ? 1 : 0.1) : 1
      it.el.style.color = query && m && it.name && query.length >= 4 ? '#6ba4dc' : (it.name ? '#f2f5f9' : '#6ba4dc')
    }
  })
  // the search box drops in; the hit springs under it
  const bp = spring(t - 50.7, 2.6, 0.55)
  tf(s.box, `translateY(${(1 - clamp(bp, 0, 1.1)) * -500}px)`); op(s.box, t > 50.7 ? 1 - fall : 0)
  s.q.innerHTML = (query || '<span style="color:#9aa3ae">Find a tool…</span>') + (t > 50.8 && t < 51.95 && Math.floor(t * 4) % 2 === 0 ? '<span style="display:inline-block;width:2px;height:36px;background:#0f4c92;vertical-align:-6px;margin-left:2px"></span>' : '')
  const hp = spring(t - 51.55, 2.6, 0.55)
  tf(s.hit, `translateY(${(1 - clamp(hp, 0, 1.1)) * 60}px) scale(${t > 51.92 && t < 52.0 ? 0.97 : 1})`); op(s.hit, t > 51.55 ? (1 - fall) * clamp((t - 51.55) * 6) : 0)
  // bar 27: the count
  const np = ease(t, 52.15, 52.6)
  tf(s.n108.firstChild, `translateY(${(1 - np) * 360}px)`); op(s.big, t >= 52.1 ? 1 : 0)
  s.lab.textContent = scramble('TOOLS · 15 DISCIPLINES · ONE WORKSPACE', seg(t, 52.4, 53.1), 11)
  const out = ease(t, 53.7, 54.0, E.inExpo)
  s.big.style.transform = `scale(${1 + out * 0.6})`; s.big.style.opacity = 1 - out; s.big.style.filter = `blur(${out * 12}px)`
}

// ════════════════════════════════════════════════════════════════════════
// L · LIFT (54–56): sixteen drawings on the 16ths, accelerating to white
// ════════════════════════════════════════════════════════════════════════
const MONT = ['d_slope_0', 'd_beam-design_0', 'd_hydraulic-jump_0', 'd_bolted-connection_0', 'd_retaining-wall_0', 'd_traverse_0', 'd_column-design_0', 'd_lateral-pile_0', 'd_water-tank_0', 'd_simple-curve_0', 'd_punching-shear_0', 'd_welded-connection_ok_0', 'd_signal-timing_0', 'd_stair_0', 'd_pile-cap_0', 'd_vertical-curves_0', 'd_dev-length_2', 'd_muskingum_0', 'd_earth-pressure_0', 'd_tbeam-design_0', 'd_superelevation_0', 'd_foundation_0']
const LF = scene(54, 56.02, (root) => {
  darkGround(root)
  const cards = MONT.map((id, i) => {
    const m = DRAW(id), w = Math.min(1100, m.w * 700 / m.h)
    const p = panel(root, id, (W - w - 48) / 2, (H - (m.h * w / m.w) - 48) / 2, w, '', '', { shadow: '0 40px 120px -30px rgba(0,0,0,.8)' })
    p.d.draw(1)
    return p
  })
  return { cards }
})
LF.update = (t) => {
  const s = LF
  // 16ths for the first bar, 32nds for the second half of the riser
  const times = []
  let x = 54.0
  for (let i = 0; i < s.cards.length; i++) { times.push(x); x += i < 12 ? 0.125 : 0.0625 }
  s.cards.forEach((c, i) => {
    const a = times[i], b = times[i + 1] ?? 56.0
    const on = t >= a && t < b
    show(c.cd, on)
    if (on) {
      const p = seg(t, a, b)
      c.cd.style.transform = `scale(${1.1 - 0.1 * E.outExpo(p)}) rotate(${(i % 2 ? 1 : -1) * 1.5 * (1 - p)}deg) translateX(${(i % 2 ? 1 : -1) * 30 * (1 - E.outExpo(p))}px)`
      c.cd.style.opacity = 1
    }
  })
  s.root.style.filter = `brightness(${1 + ease(t, 55.5, 56.0, E.inExpo) * 2})`
}

// ════════════════════════════════════════════════════════════════════════
// M · END (56–60): the lockup
// ════════════════════════════════════════════════════════════════════════
const END = scene(56, 60.01, (root) => {
  darkGround(root)
  const logoBox = h('div', { class: 'abs', style: { left: W / 2 - 520 + 'px', top: H / 2 - 175 + 'px', width: '230px', height: '230px' } }, root, LOGO('lgE'))
  const lg = $('#lgE', logoBox); lg.setAttribute('width', 230); lg.setAttribute('height', 230)
  const word = h('div', { class: 'abs disp', style: { left: W / 2 - 250 + 'px', top: H / 2 - 165 + 'px', fontSize: '200px', fontWeight: 900, letterSpacing: '.04em', color: '#f2f5f9', whiteSpace: 'nowrap', overflow: 'hidden', height: '200px', lineHeight: '200px' } }, root)
  const letters = [...'ZETA'].map((c) => h('span', { style: { display: 'inline-block' } }, word, c))
  const rule = h('div', { class: 'abs', style: { left: W / 2 - 520 + 'px', top: H / 2 + 100 + 'px', height: '1px', background: 'rgba(158,176,197,.45)' } }, root)
  const tag = h('div', { class: 'abs', style: { left: W / 2 - 520 + 'px', top: H / 2 + 128 + 'px', fontSize: '44px', fontWeight: 700, color: '#f2f5f9', letterSpacing: '-.01em', whiteSpace: 'nowrap', height: '56px', overflow: 'hidden' } }, root, '<span style="display:inline-block">Every answer shows its work.</span>')
  const url = h('div', { class: 'abs mono', style: { left: W / 2 - 520 + 'px', top: H / 2 + 210 + 'px', fontSize: '22px', color: '#6ba4dc', letterSpacing: '.24em' } }, root)
  const ring = h('div', { class: 'abs', style: { width: '600px', height: '600px', borderRadius: '50%', border: '1.5px solid rgba(242,181,58,.9)' } }, root)
  const black = h('div', { class: 'layer', style: { background: '#000' } }, root)
  return { logoBox, lg, word, letters, rule, tag, url, ring, black }
})
END.update = (t) => {
  const s = END
  const lb = s.lg
  setLine($('.lg-beam', lb), ease(t, 56.0, 56.25), 36)
  setLine($('.lg-c1', lb), clamp(spring(t - 56.08, 2.6, 0.45), 0, 1.08), 28); setLine($('.lg-c2', lb), clamp(spring(t - 56.14, 2.6, 0.45), 0, 1.08), 28)
  setLine($('.lg-gnd', lb), ease(t, 56.25, 56.5), 44)
  const rp = ease(t, 56.3, 56.7, (x) => E.outBack(x, 1.5))
  const rect = $('.lg-rect', lb); rect.style.transformOrigin = '32px 32px'; rect.style.transform = `scale(${rp})`
  const node = $('.lg-node', lb); node.style.transformOrigin = '32px 22px'
  node.style.transform = `scale(${1 + 1.6 * Math.exp(-(t - 56) * 8)})`
  node.style.filter = `drop-shadow(0 0 ${4 + 8 * Math.exp(-(t - 56) * 2.5) + 2 * Math.sin((t - 56) * 3)}px rgba(242,181,58,.95))`
  // the node sits on the impact point, then the lockup settles
  const r1 = seg(t, 56.0, 57.0)
  const nx = W / 2 - 520 + 115, ny = H / 2 - 175 + 230 * 22 / 64
  css(s.ring, { left: nx - 300 + 'px', top: ny - 300 + 'px' })
  tf(s.ring, `scale(${0.05 + E.outExpo(r1) * 2})`); op(s.ring, (1 - r1) * 0.9)
  s.letters.forEach((l, i) => { const p = ease(t, 56.35 + i * 0.05, 56.9 + i * 0.05); tf(l, `translateY(${(1 - p) * 210}px)`) })
  s.word.style.letterSpacing = lerp(0.2, 0.04, ease(t, 56.35, 57.2)) + 'em'
  css(s.rule, { width: 1040 * ease(t, 56.8, 57.4) + 'px' })
  tf(s.tag.firstChild, `translateY(${(1 - ease(t, 57.0, 57.45)) * 60}px)`)
  s.url.textContent = scramble('ZETASTRUCT.APP', seg(t, 57.2, 57.8), 13)
  const drift = ease(t, 56.0, 60.0, E.outCubic)
  s.root.style.transform = `scale(${1.04 - 0.04 * drift})`
  op(s.black, ease(t, 59.3, 60.0, E.inCubic))
}
