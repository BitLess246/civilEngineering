import { describe, it, expect } from 'vitest'
import { texToPlain } from './texText'
import { MONO } from './pdfFonts'

// Real formula shapes from the lib/*Solution builders (the strings the PDF
// report converts), checked against hand-written plain-text equivalents.
describe('texToPlain', () => {
  it('flattens subscripts and converts units text', () => {
    expect(texToPlain(String.raw`M_u = 180.0\ \text{kN·m}`)).toBe('Mu = 180.0 kN·m')
    expect(texToPlain(String.raw`A_{s,max} = \rho_{max} b d = 2412\ \text{mm}^2`))
      .toBe('As,max = ρmax b d = 2412 mm²')
  })

  it('renders fractions linearly with parentheses only when needed', () => {
    expect(texToPlain(String.raw`d_t = h - cover - \tfrac{d_b}{2}`)).toBe('dt = h - cover - db/2')
    expect(texToPlain(String.raw`R_n = \dfrac{M_u}{\phi b d^2}`)).toBe('Rn = Mu/(φ b d²)')
  })

  it('handles sqrt with simple and compound operands', () => {
    expect(texToPlain(String.raw`V_c = \tfrac{1}{6}\lambda\sqrt{f'_c}\,b d`)).toBe("Vc = 1/6λ√f'c b d")
    expect(texToPlain(String.raw`\rho = 0.02\left(1-\sqrt{1-\tfrac{2R_n}{0.85 f'_c}}\right)`))
      .toBe("ρ = 0.02(1-√(1-2Rn/(0.85 f'c)))")
  })

  it('converts operators, arrows and check marks', () => {
    expect(texToPlain(String.raw`V_u = 88.1 \;\le\; \phi V_c\;\checkmark`)).toBe('Vu = 88.1 ≤ φ Vc ✓')
    expect(texToPlain(String.raw`M_u \Rightarrow \textbf{SRB}`)).toBe('Mu ⇒ SRB')
    expect(texToPlain(String.raw`P_u = \max(1.4D,\ 1.2D + 1.6L)`)).toBe('Pu = max(1.4D, 1.2D + 1.6L)')
  })

  it('converts superscript exponents to unicode digits', () => {
    expect(texToPlain(String.raw`180\times 10^6`)).toBe('180× 10⁶')
    expect(texToPlain(String.raw`q_u = P_u/B^2`)).toBe('qu = Pu/B²')
  })

  it('handles ceilings, bars and greek', () => {
    expect(texToPlain(String.raw`n = \lceil A_s / A_b \rceil = 5\ \text{bars}`)).toBe('n = ⌈ As / Ab ⌉ = 5 bars')
    expect(texToPlain(String.raw`\bar{y} = \dfrac{\sum n_i y_i}{\sum n_i}`)).toBe('ȳ = (Σ ni yi)/(Σ ni)')
    expect(texToPlain(String.raw`\gamma_s D_s + \beta_1 c`)).toBe('γs Ds + β1 c')
  })

  it('strips residual layout commands and grouping braces', () => {
    expect(texToPlain(String.raw`c = \tfrac{a_{max}}{\beta_1} = 62.1\ \text{mm},\quad f_s' = 600\!\left(1 - \tfrac{75}{62.1}\right)`))
      .toBe("c = amax/β1 = 62.1 mm, fs' = 600(1 - 75/62.1)")
    expect(texToPlain('{+}')).toBe('+')
    expect(texToPlain(String.raw`\qquad d = \mathbf{437.0}\ \text{mm}`)).toBe('d = 437.0 mm')
  })

  it('never leaves backslash commands in the output', () => {
    const samples = [
      String.raw`\phi M_{n,max} = 0.90\,A_{s,max} f_y (d - \tfrac{a_{max}}{2}) = 289.5\ \text{kN·m}`,
      String.raw`V_{c} = \min\!\left(\tfrac{1}{3}, \tfrac{1}{6}(1{+}\tfrac{2}{\beta}), \tfrac{1}{12}(2{+}\tfrac{\alpha_s d}{b_o})\right)\sqrt{f'_c}\,b_o d`,
      String.raw`s_{clear} = \dfrac{300 - 3(20)}{2} = 120\ \text{mm} \;\ge\; 25\ \text{mm}\ \checkmark`,
    ]
    for (const s of samples) expect(texToPlain(s)).not.toMatch(/\\[a-zA-Z]/)
  })

  // ── Regressions found by reading an exported PDF, not by reading the code ──
  it('does not stall on a superscript it cannot convert', () => {
    // `^\circ` renders back to something starting with the same character the
    // scanner is looking for. Restarting the scan at index 0 made the loop
    // find it forever, so every LATER superscript in the same equation was
    // dropped: "γ = 18.0 kN/m³" printed as "γ = 18.0 kN/m^3".
    expect(texToPlain(String.raw`\phi = 25.0^\circ,\ \gamma = 18.0\ \text{kN/m}^3`))
      .toBe('φ = 25.0°, γ = 18.0 kN/m³')
    expect(texToPlain(String.raw`a^\circ b^2 c^3 d^{10}`)).toBe('a° b² c³ d¹⁰')
  })

  it('renders a degree symbol without a stray caret', () => {
    expect(texToPlain(String.raw`\beta = 30.0^\circ`)).toBe('β = 30.0°')
    expect(texToPlain(String.raw`45^\circ + \tfrac{\phi}{2}`)).toBe('45° + φ/2')
  })

  it('uses only glyphs the embedded PDF fonts can actually draw', () => {
    // jsPDF draws a glyph the embedded subset lacks as NOTHING — no tofu, no
    // warning, just a gap. "c'ℓ + N tanφ'" was printing as "c' + N tanφ'" and
    // "ℓe/d" as "e/d", because DejaVu Sans MONO (which sets the equations) has
    // no U+2113 and the combining macron U+0304 is outside the subset.
    // This walks the whole conversion vocabulary so the next addition that
    // reaches for an exotic glyph fails here instead of in a printed sheet.
    const vocabulary = [
      String.raw`\checkmark \Rightarrow \rightarrow \leftarrow \to \varepsilon \varnothing`,
      String.raw`\lambda \alpha \beta \gamma \delta \Delta \epsilon \theta \kappa \sigma \Sigma \omega \Omega`,
      String.raw`\phi \Phi \psi \rho \tau \mu \nu \eta \pi \chi \zeta`,
      String.raw`\approx \infty \propto \lceil x \rceil \lfloor y \rfloor`,
      String.raw`\cdot \times \div \pm \leq \geq \le \ge \neq \ne \sum`,
      String.raw`\circ \degree \prime \ell \min \max \tan \cos \sin \ln \log`,
      String.raw`\sqrt{x} \frac{a}{b} \bar{y} \overline{y} \bar{q}`,
      String.raw`x^0 x^1 x^2 x^3 x^4 x^5 x^6 x^7 x^8 x^9 x^{-1} x^{+1} x^\circ`,
    ].map(texToPlain).join('')

    const missing = [...new Set(vocabulary)]
      .filter((ch) => ch !== ' ')
      .filter((ch) => !MONO_GLYPHS.has(ch.codePointAt(0)!))
    expect(missing.map((c) => `${c} U+${c.codePointAt(0)!.toString(16)}`)).toEqual([])
  })
})

/**
 * Character codes the embedded mono subset can draw, read from the TTF's own
 * cmap. Reading the font is the point: a hand-maintained allow-list would drift
 * from the bytes that actually ship.
 */
const MONO_GLYPHS: Set<number> = (() => {
  const bin = atob(MONO)
  const b = new DataView(Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer)
  const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((k) => b.getUint8(o + k)))

  let cmap = 0
  for (let i = 0; i < b.getUint16(4); i++) {
    const o = 12 + i * 16
    if (tag(o) === 'cmap') cmap = b.getUint32(o + 8)
  }
  let sub = 0
  for (let i = 0; i < b.getUint16(cmap + 2); i++) {
    const o = cmap + 4 + i * 8
    const pid = b.getUint16(o), eid = b.getUint16(o + 2)
    if (pid === 3 && (eid === 1 || eid === 10)) sub = cmap + b.getUint32(o + 4)
  }
  // format 4: parallel endCode / startCode arrays, 0xffff-terminated
  const segX2 = b.getUint16(sub + 6)
  const endO = sub + 14, startO = endO + segX2 + 2
  const set = new Set<number>()
  for (let i = 0; i < segX2 / 2; i++) {
    const end = b.getUint16(endO + i * 2), start = b.getUint16(startO + i * 2)
    for (let c = start; c <= end && c !== 0xffff; c++) set.add(c)
  }
  return set
})()
