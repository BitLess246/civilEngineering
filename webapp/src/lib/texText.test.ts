import { describe, it, expect } from 'vitest'
import { texToPlain } from './texText'

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
})
