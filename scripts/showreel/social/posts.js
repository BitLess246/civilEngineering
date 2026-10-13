// ── Zeta social posts, 1080×1350 (4:5 feed) ──────────────────────────────
// Each post is a still composition of real captured components — the same
// field/card/drawing/KaTeX builders the reels animate, set to their final
// state. Numbers come from the captures; nothing is invented.
const P = D.posts, V = D.val, TOOLS = D.tools
const M = 80, CW = W - 2 * M
const INK = '#0f1b2a', PAPER = '#f4f3ef', BRANDC = '#0f4c92', ACC = '#6ba4dc', AMBER = '#f2b53a', MUTED = '#5c6675'

function frame(root, dark, n) {
  const sv = h('svg', { width: W, height: H, class: 'abs', style: { left: 0, top: 0, color: dark ? '#e8eaed' : INK } }, root)
  const I = 40, L = 24
  ;[[I, I, 1, 1], [W - I, I, -1, 1], [I, H - I, 1, -1], [W - I, H - I, -1, -1]].forEach(([x, y, sx, sy]) =>
    h('path', { d: `M${x + sx * L},${y} L${x},${y} L${x},${y + sy * L}`, fill: 'none', 'stroke-width': 1.5, stroke: 'currentColor', opacity: 0.7 }, sv))
  const tl = h('div', { class: 'abs mono', style: { left: M + 'px', top: '74px', fontSize: '17px', color: dark ? '#e8eaed' : INK, display: 'flex', gap: '14px', alignItems: 'center' } }, root)
  h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, tl, LOGO('m' + n).replace('width="64" height="64"', 'width="26" height="26"') + WORD_SVG(13, 'currentColor'))
  const url = h('div', { class: 'abs mono', style: { left: M + 'px', bottom: '70px', fontSize: '17px', color: dark ? '#9eb0c5' : MUTED, textTransform: 'none', letterSpacing: '.1em' } }, root, 'zetastruct.app')
  return { tl, url }
}
function kicker(root, txt, dark, top = 150) {
  return h('div', { class: 'abs mono', style: { left: M + 'px', top: top + 'px', fontSize: '19px', color: dark ? AMBER : BRANDC, fontWeight: 600 } }, root, txt)
}
function headline(root, html, dark, top = 190, size = 76) {
  return h('div', { class: 'abs disp', style: { left: M + 'px', top: top + 'px', width: CW + 'px', fontSize: size + 'px', color: dark ? '#f2f5f9' : INK, lineHeight: '1.0', letterSpacing: '-.035em' } }, root, html)
}
function badge(root, txt, dark, x, y, amber = false) {
  return h('div', { class: 'abs chip', style: { left: x + 'px', top: y + 'px', fontSize: '18px', padding: '6px 16px', background: amber ? 'rgba(242,181,58,.12)' : (dark ? 'rgba(107,164,220,.12)' : '#e6eef7'), border: '1.5px solid ' + (amber ? AMBER : dark ? 'rgba(107,164,220,.6)' : '#c9d7e8'), color: amber ? AMBER : dark ? ACC : BRANDC } }, root, txt)
}
/** A calculator drawing in a white sheet card, fitted into (w × maxH). */
function sheetDrawing(root, key, idx, x, y, w, maxH, label = 'DRAWING SHEET') {
  const meta = C[key].draw[idx]
  const dw = Math.min(w - 48, maxH * meta.w / meta.h), dh = meta.h * dw / meta.w
  const cw = dw + 48
  const cd = card(root, x + (w - cw) / 2, y, cw, dh + 84, { boxShadow: '0 30px 80px -36px rgba(15,27,42,.45)' })
  h('div', { class: 'abs mono', style: { left: '24px', top: '22px', fontSize: '13px', color: INK, fontWeight: 600 } }, cd, label)
  badge(cd, 'LIVE', false, cw - 92, 16).style.cssText += ';background:#ddefe3;border-color:#c2ddcb;color:#14603a;font-size:12px;padding:3px 10px'
  drawing(cd, meta.id, 24, 60, dw)
  return { cd, h: dh + 84, w: cw }
}
/** Check cards at their final state, in a scaled column. */
function checks(root, key, idx, x, y, w, scale = 1.6) {
  const ws = h('div', { class: 'abs ws', style: { left: x + 'px', top: y + 'px', width: w / scale + 'px', transformOrigin: '0 0', transform: `scale(${scale})` } }, root)
  const col = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, ws)
  const cs = idx.map((i) => rcard(col, C[key].cards[i], null, null, w / scale))
  cs.forEach((c) => c.set(1, 1))
  return { ws, col, cs }
}
function paper(root) { paperGround(root); return true }
function dark(root) { darkGround(root); return true }

const POSTS = {
  // 1 · the brand
  brand(root) {
    dark(root); frame(root, true, 1)
    const WM = WORD(104); const LX = (W - (196 + 40 + WM.width())) / 2
    const lb = h('div', { class: 'abs', style: { left: LX + 'px', top: '520px', width: '196px', height: '196px' } }, root, LOGO('lgP'))
    $('#lgP', lb).setAttribute('width', 196); $('#lgP', lb).setAttribute('height', 196)
    root.appendChild(WM.el); css(WM.el, { left: LX + 236 + 'px', top: 520 + 98 - 52 + 'px' })
    h('div', { class: 'abs', style: { left: 0, width: W + 'px', top: '820px', textAlign: 'center', fontSize: '44px', fontWeight: 600, color: '#e8eaed', letterSpacing: '-.01em' } }, root, 'Structural engineering made clearer.')
    h('div', { class: 'abs mono', style: { left: 0, width: W + 'px', top: '910px', textAlign: 'center', fontSize: '19px', color: '#9eb0c5' } }, root, `${TOOLS.total} TOOLS · ${TOOLS.groups} DISCIPLINES · NSCP 2015 · ACI 318-14 · AISC 360-16`)
  },
  // 2 · free, stated exactly
  free(root) {
    dark(root); frame(root, true, 2)
    kicker(root, 'PRICING · THE CALCULATORS', true)
    headline(root, 'Every calculator<br>is <span style="color:#f2b53a">free.</span>', true, 190, 104)
    const rows = [['GUEST', 'No account', '5 runs of each calculator'], ['FREE ACCOUNT', 'US$0', 'Unlimited runs · 3 saved projects'], ['INCLUDED', 'On every page', 'Worked solution · PDF calc sheet · drawings']]
    rows.forEach(([a, b, c], i) => {
      const el = h('div', { class: 'abs', style: { left: M + 'px', top: 560 + i * 170 + 'px', width: CW + 'px', borderTop: '1px solid rgba(158,176,197,.3)', paddingTop: '28px' } }, root)
      h('div', { class: 'mono', style: { fontSize: '19px', color: AMBER } }, el, a)
      h('div', { style: { fontSize: '44px', fontWeight: 700, color: '#f2f5f9', marginTop: '10px' } }, el, c)
      h('div', { class: 'mono', style: { fontSize: '16px', color: '#9eb0c5', marginTop: '8px', textTransform: 'none', letterSpacing: '.06em' } }, el, b)
    })
    h('div', { class: 'abs', style: { left: M + 'px', top: '1100px', width: CW + 'px', fontSize: '24px', color: '#9eb0c5', lineHeight: '1.5' } }, root, '3D Model Space, the design pipeline and estimating are on the Pro plan. The single-purpose calculators are not.')
  },
  // 3 · RC beam
  beam(root) {
    paper(root); frame(root, false, 3)
    kicker(root, 'CONCRETE · RECTANGULAR RC BEAM')
    headline(root, 'Flexure, shear, spacing —<br>each with its ratio.', false, 190, 64)
    sheetDrawing(root, 'beam-design', 0, M, 380, CW, 470)
    checks(root, 'beam-design', [1, 2], M, 900, CW / 2 - 10, 1.15)
    checks(root, 'beam-design', [0], M + CW / 2 + 10, 900, CW / 2 - 10, 1.15)
  },
  // 4 · isolated footing
  footing(root) {
    paper(root); frame(root, false, 4)
    kicker(root, 'FOUNDATIONS · ISOLATED FOOTING')
    headline(root, 'Plan, section and<br>punching shear.', false, 190, 64)
    sheetDrawing(root, 'foundation', 0, M, 380, CW * 0.58, 720)
    checks(root, 'foundation', [0, 1, 2], M + CW * 0.6, 380, CW * 0.4, 1.0)
  },
  // 5 · retaining wall
  wall(root) {
    paper(root); frame(root, false, 5)
    kicker(root, 'GEOTECHNICAL · CANTILEVER RETAINING WALL')
    headline(root, 'Overturning, sliding, bearing.<br>Then stem, toe and heel.', false, 190, 64)
    sheetDrawing(root, 'retaining-wall', 0, M, 380, CW * 0.56, 780)
    checks(root, 'retaining-wall', [0, 1, 2], M + CW * 0.58, 380, CW * 0.42, 1.0)
  },
  // 6 · the worked solution
  solution(root) {
    paper(root); frame(root, false, 6)
    kicker(root, 'EVERY CALCULATOR · CALCULATIONS TAB')
    headline(root, 'Every answer<br>shows its work.', false, 190, 100)
    const K = C['beam-design']
    let y = 450
    ;[0, 3].forEach((si) => {
      const st = K.steps[si]
      const el = h('div', { class: 'abs', style: { left: M + 'px', top: y + 'px', width: CW + 'px', background: '#fff', border: '1px solid #e3e1da', borderRadius: '14px', overflow: 'hidden' } }, root)
      h('div', { class: 'abs', style: { left: '28px', top: '22px', fontSize: '26px', fontWeight: 700, color: INK, whiteSpace: 'nowrap' } }, el, `<span class="mono" style="color:${BRANDC};font-size:19px;margin-right:12px">${String(st.n).padStart(2, '0')}</span>${st.title}`)
      h('div', { class: 'abs mono', style: { left: '28px', top: '64px', fontSize: '14px', color: MUTED, textTransform: 'none', letterSpacing: '.08em' } }, el, st.ref.replace(/^PASS\s+/, '').split('\n')[0])
      let ey = 100
      st.eqs.slice(0, 2).forEach((e) => {
        const q = eqBox(el, e.html, 28, ey, 22); q.set(1)
        q.el.style.width = 'max-content'; q.el.style.whiteSpace = 'nowrap'; q.fit(CW - 60)
        ey += q.el.offsetHeight + 10
      })
      el.style.height = ey + 14 + 'px'
      y += ey + 14 + 22
    })
    h('div', { class: 'abs mono', style: { left: M + 'px', top: y + 10 + 'px', fontSize: '17px', color: MUTED, textTransform: 'none', letterSpacing: '.06em' } }, root, `+ ${K.steps.length - 2} more steps, each with its clause — free on every calculator`)
  },
  // 7 · validation
  validation(root) {
    dark(root); frame(root, true, 7)
    kicker(root, 'VALIDATION · ENGINE VS CLOSED FORM', true)
    headline(root, 'Checked against<br>the hand calculation.', true, 190, 92)
    const rows = V[0].rows.slice(0, 6)
    const tb = h('div', { class: 'abs', style: { left: M + 'px', top: '470px', width: CW + 'px', background: '#fff', borderRadius: '14px', overflow: 'hidden' } }, root)
    const hd = h('div', { class: 'mono', style: { display: 'grid', gridTemplateColumns: '1fr 120px 120px 70px', gap: '12px', padding: '16px 24px', background: '#f6f5f1', fontSize: '13px', color: MUTED } }, tb)
    ;['BENCHMARK', 'MANUAL', 'ZETA', 'Δ'].forEach((x) => h('span', {}, hd, x))
    rows.forEach((r) => {
      const ro = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px 120px 70px', gap: '12px', padding: '18px 24px', borderTop: '1px solid #eeece5', alignItems: 'center' } }, tb)
      const [name, clause] = [r[0].replace(/ (NSCP|ACI|Parallel).*$/, ''), (r[0].match(/(NSCP|ACI|Parallel).*$/) || [''])[0]]
      h('div', {}, ro, `<div style="font-size:19px;font-weight:600;color:${INK};line-height:1.25">${name}</div><div class="mono" style="font-size:11.5px;color:${MUTED};margin-top:6px;text-transform:none;letter-spacing:.04em">${clause}</div>`)
      h('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '18px', color: INK } }, ro, r[2])
      h('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '18px', color: BRANDC, fontWeight: 600 } }, ro, r[3])
      h('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '16px', color: '#14603a', fontWeight: 600 } }, ro, r[5])
    })
    h('div', { class: 'abs mono', style: { left: M + 'px', top: '1180px', fontSize: '16px', color: '#9eb0c5', textTransform: 'none', letterSpacing: '.06em' } }, root, 'Every benchmark runs in CI — zetastruct.app/validation')
  },
  // 8 · steel connection
  steel(root) {
    paper(root); frame(root, false, 8)
    kicker(root, 'STEEL · BOLTED CONNECTION · AISC 360-16')
    headline(root, 'Bolt shear, bearing,<br>block shear §J4.3.', false, 190, 64)
    sheetDrawing(root, 'bolted-connection', 0, M, 380, CW, 470)
    checks(root, 'bolted-connection', [0], M, 940, CW / 2 - 10, 1.05)
    checks(root, 'bolted-connection', [1], M + CW / 2 + 10, 940, CW / 2 - 10, 1.05)
  },
  // 9 · slope stability
  slope(root) {
    paper(root); frame(root, false, 9)
    kicker(root, 'GEOTECHNICAL · SLOPE STABILITY')
    headline(root, 'Bishop · Janbu · Fellenius.<br>One critical circle.', false, 190, 64)
    sheetDrawing(root, 'slope', 0, M, 380, CW, 470)
    checks(root, 'slope', [0, 1], M, 910, CW / 2 - 10, 1.05)
  },
  // 10 · hydraulics
  water(root) {
    paper(root); frame(root, false, 10)
    kicker(root, 'WATER · HYDRAULIC JUMP')
    headline(root, '22 water tools.<br>Same worked solutions.', false, 190, 64)
    sheetDrawing(root, 'hydraulic-jump', 0, M, 380, CW, 520)
    checks(root, 'hydraulic-jump', [0, 1, 2], M, 960, CW, 1.0).col.style.cssText += ';flex-direction:row;gap:10px'
  },
  // 11 · 3D Model Space (Pro)
  model(root) {
    dark(root); frame(root, true, 11)
    kicker(root, '3D MODEL SPACE', true)
    headline(root, 'Model, analyse, design —<br>the whole frame.', true)
    badge(root, 'PRO PLAN · US$19/MO', true, M, 380, true)
    h('img', { class: 'abs', src: '../assets/orbit_20.png', style: { left: '60px', top: '430px', width: '960px' } }, root)
    const list = ['Grid generator · slabs, beams, columns', 'Load combinations · seismic & wind', 'Design pipeline · schedules · plans', 'Estimating and take-off']
    list.forEach((x, i) => h('div', { class: 'abs', style: { left: M + 'px', top: 1000 + i * 54 + 'px', fontSize: '28px', fontWeight: 600, color: '#e8eaed', display: 'flex', gap: '14px', alignItems: 'center' } }, root, `<span style="width:10px;height:10px;border-radius:50%;background:${ACC}"></span>${x}`))
  },
  // 12 · the tool wall
  tools(root) {
    dark(root); frame(root, true, 12)
    kicker(root, 'THE CATALOGUE', true)
    headline(root, `${TOOLS.total} tools.<br>${TOOLS.groups} disciplines.`, true, 190, 100)
    const grid = h('div', { class: 'abs', style: { left: M + 'px', top: '470px', width: CW + 'px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 40px' } }, root)
    TOOLS.list.forEach((g) => h('div', { style: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(158,176,197,.25)', padding: '14px 0', fontSize: '24px', color: '#e8eaed', fontWeight: 600 } }, grid,
      `<span>${g.g.charAt(0) + g.g.slice(1).toLowerCase()}</span><span style="font-family:'IBM Plex Mono';color:${ACC}">${String(g.n).padStart(2, '0')}</span>`))
  },
  // 13 · the plans
  plans(root) {
    paper(root); frame(root, false, 13)
    kicker(root, 'PLANS')
    headline(root, 'Start free. Scale to<br>the whole building.', false, 190, 72)
    const tiers = [['FREE', 'US$0', ['Every calculator, unlimited', 'Worked solutions & PDF sheets', '3 saved projects']], ['PRO', 'US$19/mo', ['3D Model Space · 400 members', 'Design pipeline & optimiser', 'Estimating · reports · drawings']], ['MAX', 'US$49/mo', ['Everything in Pro, no size limit', 'Pushover · time history', 'Construction scheduling']]]
    tiers.forEach(([n, p, f], i) => {
      const el = card(root, M, 400 + i * 258, CW, 236, { padding: '26px 32px', border: i === 1 ? '2px solid ' + BRANDC : '1px solid #e3e1da' })
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, el, `<span class="mono" style="font-size:20px;color:${BRANDC};font-weight:600">${n}</span><span style="font-size:40px;font-weight:800;color:${INK};letter-spacing:-.02em">${p}</span>`)
      f.forEach((x) => h('div', { style: { fontSize: '25px', color: INK, marginTop: '14px', display: 'flex', gap: '12px', alignItems: 'center' } }, el, `<span style="width:8px;height:8px;border-radius:50%;background:${i ? BRANDC : '#14603a'}"></span>${x}`))
    })
    h('div', { class: 'abs mono', style: { left: M + 'px', top: '1180px', fontSize: '15px', color: MUTED, textTransform: 'none', letterSpacing: '.05em' } }, root, 'Annual: Pro US$205/yr · Max US$529/yr — 10% off')
  },
}
window.show = (name) => {
  ROOT.innerHTML = ''
  const root = h('div', { class: 'layer' }, ROOT)
  POSTS[name](root)
  h('div', { class: 'vignette', style: { opacity: 0.5 } }, ROOT)
}
window.NAMES = Object.keys(POSTS)
window.READY = true
