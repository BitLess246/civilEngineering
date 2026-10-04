// ─────────────────────────────────────────────────────────────────────────
// ENGINEERING ECONOMY — time value of money and project measures.
//
// The board-exam core (syllabus Mathematics 7.0): single-payment and
// uniform-series factors, arithmetic and geometric gradients, nominal vs
// effective rates, NPV/IRR/payback on a cash-flow series, depreciation
// schedules, break-even and the benefit–cost ratio.
//
// Rates are decimals inside (8 % = 0.08); percents only at the page edge.
// ─────────────────────────────────────────────────────────────────────────

/** (P/F,i,n) = 1/(1+i)ⁿ — present worth of a future sum. */
export function pf(i: number, n: number): number {
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  if (!(n >= 0)) throw new Error('Periods cannot be negative.')
  return 1 / Math.pow(1 + i, n)
}

/** (F/P,i,n) = (1+i)ⁿ — future worth of a present sum. */
export function fp(i: number, n: number): number {
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  if (!(n >= 0)) throw new Error('Periods cannot be negative.')
  return Math.pow(1 + i, n)
}

/** (P/A,i,n) = [(1+i)ⁿ−1]/[i(1+i)ⁿ] — present worth of a uniform series. */
export function pa(i: number, n: number): number {
  if (!(n >= 0)) throw new Error('Periods cannot be negative.')
  if (Math.abs(i) < 1e-12) return n
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  const f = Math.pow(1 + i, n)
  return (f - 1) / (i * f)
}

/** (A/P,i,n) — capital recovery: uniform series for a present sum. */
export function ap(i: number, n: number): number {
  if (!(n > 0)) throw new Error('Periods must be positive.')
  if (Math.abs(i) < 1e-12) return 1 / n
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  const f = Math.pow(1 + i, n)
  return (i * f) / (f - 1)
}

/** (F/A,i,n) = [(1+i)ⁿ−1]/i — future worth of a uniform series. */
export function fa(i: number, n: number): number {
  if (!(n >= 0)) throw new Error('Periods cannot be negative.')
  if (Math.abs(i) < 1e-12) return n
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  return (Math.pow(1 + i, n) - 1) / i
}

/** (A/F,i,n) — sinking fund: uniform series for a future sum. */
export function af(i: number, n: number): number {
  if (!(n > 0)) throw new Error('Periods must be positive.')
  if (Math.abs(i) < 1e-12) return 1 / n
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  return i / (Math.pow(1 + i, n) - 1)
}

/** (P/G,i,n) — present worth of an arithmetic gradient G, 0, G, 2G, … */
export function arithGradientPW(i: number, G: number, n: number): number {
  if (!(n >= 0)) throw new Error('Periods cannot be negative.')
  if (Math.abs(i) < 1e-12) return (G * n * (n - 1)) / 2
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  const f = Math.pow(1 + i, n)
  return (G * (f - i * n - 1)) / (i * i * f)
}

/** (A/G,i,n) — uniform-series equivalent of an arithmetic gradient. */
export function arithGradientAW(i: number, G: number, n: number): number {
  if (!(n > 0)) throw new Error('Periods must be positive.')
  return arithGradientPW(i, G, n) * ap(i, n)
}

/** Present worth of a geometric gradient A1, A1(1+g), … — first cash flow A1 at t = 1. */
export function geomGradientPW(i: number, g: number, A1: number, n: number): number {
  if (!(n >= 0)) throw new Error('Periods cannot be negative.')
  if (!(i > -1)) throw new Error('Rate must exceed −100 %.')
  if (Math.abs(i - g) < 1e-12) return (A1 * n) / (1 + i)
  return (A1 * (1 - Math.pow((1 + g) / (1 + i), n))) / (i - g)
}

/** Effective annual rate from a nominal rate compounded m times a year. */
export function effRate(nominal: number, m: number): number {
  if (!(m >= 1)) throw new Error('Compounding periods per year must be at least 1.')
  if (!(nominal > -1)) throw new Error('Rate must exceed −100 %.')
  return Math.pow(1 + nominal / m, m) - 1
}

/** Net present value of cash flows at t = 0, 1, …, discounted at rate. */
export function npv(rate: number, cfs: number[]): number {
  if (cfs.length < 1) throw new Error('At least one cash flow is needed.')
  if (!(rate > -1)) throw new Error('Rate must exceed −100 %.')
  return cfs.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0)
}

/** Internal rate of return: the rate with NPV = 0 — bisection on a widening
 *  bracket. Null when the cash flows never change sign (no IRR exists). */
export function irr(cfs: number[], tol = 1e-9): number | null {
  if (cfs.length < 2) throw new Error('At least two cash flows are needed.')
  const f = (r: number) => npv(r, cfs)
  let lo = -0.9999
  let hi = 1.0
  let flo = f(lo)
  if (!Number.isFinite(flo)) return null
  let fhi = f(hi)
  let guard = 0
  while (flo * fhi > 0 && guard++ < 200) {
    hi = hi * 2 + 1
    fhi = f(hi)
    if (!Number.isFinite(fhi)) return null
  }
  if (flo * fhi > 0) return null // no sign change — no real IRR
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if (!Number.isFinite(fm)) return null
    if (Math.abs(hi - lo) < tol) return (lo + hi) / 2
    if (flo * fm <= 0) hi = mid
    else { lo = mid; flo = fm }
  }
  return (lo + hi) / 2
}

/** Simple payback period (years, fractional): first t with cumulative ≥ 0. Null if never. */
export function payback(cfs: number[]): number | null {
  if (cfs.length < 2) throw new Error('At least two cash flows are needed.')
  let cum = cfs[0]
  for (let t = 1; t < cfs.length; t++) {
    const prev = cum
    cum += cfs[t]
    if (cum >= 0) {
      if (cfs[t] <= 0) return t
      return t - 1 + -prev / cfs[t]
    }
  }
  return null
}

/** Discounted payback at rate: same idea on present-worth cash flows. Null if never. */
export function discountedPayback(rate: number, cfs: number[]): number | null {
  if (!(rate > -1)) throw new Error('Rate must exceed −100 %.')
  const disc = cfs.map((cf, t) => cf / Math.pow(1 + rate, t))
  return payback(disc)
}

/** Benefit–cost ratio from present-worth benefits and costs. */
export function benefitCost(pwBenefits: number, pwCosts: number): number {
  if (!(pwCosts > 0)) throw new Error('Present-worth costs must be positive.')
  return pwBenefits / pwCosts
}

/** Capitalized cost of a perpetual uniform series: P = A/i. */
export function capitalizedCost(annual: number, i: number): number {
  if (!(i > 0)) throw new Error('Rate must be positive for a perpetuity.')
  return annual / i
}

export interface DepYear {
  year: number
  dep: number      // depreciation charge this year
  book: number     // end-of-year book value
}

/** Straight-line schedule: (cost − salvage)/life every year. */
export function deprSL(cost: number, salvage: number, life: number): DepYear[] {
  if (!(cost > 0)) throw new Error('Cost must be positive.')
  if (!(salvage >= 0 && salvage < cost)) throw new Error('Salvage must be 0 or more and below cost.')
  if (!(Number.isInteger(life) && life > 0)) throw new Error('Life must be a whole number of years.')
  const d = (cost - salvage) / life
  const out: DepYear[] = []
  let book = cost
  for (let y = 1; y <= life; y++) {
    book -= d
    out.push({ year: y, dep: d, book: Math.max(book, salvage) })
  }
  return out
}

/** Sum-of-years-digits schedule: life−y+1 over life(life+1)/2 of (cost − salvage). */
export function deprSYD(cost: number, salvage: number, life: number): DepYear[] {
  if (!(cost > 0)) throw new Error('Cost must be positive.')
  if (!(salvage >= 0 && salvage < cost)) throw new Error('Salvage must be 0 or more and below cost.')
  if (!(Number.isInteger(life) && life > 0)) throw new Error('Life must be a whole number of years.')
  const base = cost - salvage
  const syd = (life * (life + 1)) / 2
  const out: DepYear[] = []
  let book = cost
  for (let y = 1; y <= life; y++) {
    const d = (base * (life - y + 1)) / syd
    book -= d
    out.push({ year: y, dep: d, book: Math.max(book, salvage) })
  }
  return out
}

/** Declining-balance schedule at a fixed rate of the start-of-year book value. */
export function deprDB(cost: number, salvage: number, life: number, rate: number): DepYear[] {
  if (!(cost > 0)) throw new Error('Cost must be positive.')
  if (!(salvage >= 0 && salvage < cost)) throw new Error('Salvage must be 0 or more and below cost.')
  if (!(Number.isInteger(life) && life > 0)) throw new Error('Life must be a whole number of years.')
  if (!(rate > 0 && rate < 1)) throw new Error('Declining rate must be between 0 and 1.')
  const out: DepYear[] = []
  let book = cost
  for (let y = 1; y <= life; y++) {
    const d = Math.min(book * rate, book - salvage)
    book -= d
    out.push({ year: y, dep: d, book })
  }
  return out
}

/** Break-even volume: fixed / (price − variable cost per unit). */
export function breakEven(fixed: number, price: number, variable: number): number {
  if (!(fixed >= 0)) throw new Error('Fixed cost cannot be negative.')
  if (!(price > variable)) throw new Error('Price must exceed the variable cost per unit.')
  return fixed / (price - variable)
}
