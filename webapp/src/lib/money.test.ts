import { describe, it, expect } from 'vitest'
import { peso, amount } from './money'

describe('money formatting', () => {
  it('groups thousands and keeps two decimals', () => {
    expect(peso(1234567.891)).toBe('₱1,234,567.89')
    expect(amount(50000)).toBe('50,000.00')
  })
  it('puts the minus sign before the currency', () => {
    expect(peso(-1000)).toBe('−₱1,000.00')
    expect(amount(-0.5)).toBe('−0.50')
  })
  it('shows a dash for a non-finite amount', () => {
    expect(peso(NaN)).toBe('—')
    expect(amount(Infinity)).toBe('—')
  })
})
