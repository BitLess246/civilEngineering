import { describe, it, expect } from 'vitest'
import {
  previewItems, readPricePreview, minorUnitDigits, fromLowestUnit,
  formatMoney, localizedLine, tableCurrency, type PriceTable,
} from './localizedPrices'

/** The four ids the config carries, in the shape `PADDLE_CONFIG.prices` has. */
const IDS = {
  pro: { monthly: 'pri_pro_m', annual: 'pri_pro_a' },
  max: { monthly: 'pri_max_m', annual: 'pri_max_a' },
}

/** One line item, shaped like Paddle's `PricePreviewResponse`. */
const lineItem = (priceId: string, total: string, charged: string) => ({
  price: { id: priceId, name: priceId },
  quantity: 1,
  taxRate: '0.2',
  totals: { subtotal: total, discount: '0', tax: '0', total },
  formattedTotals: { subtotal: charged, discount: '0', tax: '0', total: charged },
})

const response = (currencyCode: string, items: unknown[]) => ({
  data: { currencyCode, details: { lineItems: items } },
  meta: { requestId: 'req_1' },
})

/** The USD catalog as Paddle previews it for a US visitor: $19/$205, $49/$529. */
const usdResponse = () => response('USD', [
  lineItem('pri_pro_m', '1900', '$19.00'),
  lineItem('pri_pro_a', '20500', '$205.00'),
  lineItem('pri_max_m', '4900', '$49.00'),
  lineItem('pri_max_a', '52900', '$529.00'),
])

describe('previewItems', () => {
  it('asks for all four prices in one request', () => {
    const items = previewItems(IDS)
    expect(items).toHaveLength(4)
    expect(items.map((i) => i.priceId).sort())
      .toEqual(['pri_max_a', 'pri_max_m', 'pri_pro_a', 'pri_pro_m'])
    expect(items.every((i) => i.quantity === 1)).toBe(true)
  })

  it('drops duplicates and empty ids', () => {
    const items = previewItems({
      pro: { monthly: 'pri_same', annual: 'pri_same' },
      max: { monthly: '', annual: 'pri_other' },
    })
    expect(items.map((i) => i.priceId)).toEqual(['pri_same', 'pri_other'])
  })
})

describe('readPricePreview', () => {
  it('reads a full response into a table', () => {
    const table = readPricePreview(usdResponse())
    expect(Object.keys(table)).toHaveLength(4)
    expect(table.pri_pro_a).toEqual({
      priceId: 'pri_pro_a', charged: '$205.00', total: 20500, currencyCode: 'USD',
    })
  })

  it('takes the currency from the response when the line item omits it', () => {
    const table = readPricePreview(response('JPY', [lineItem('pri_pro_m', '2850', '¥2,850')]))
    expect(table.pri_pro_m.currencyCode).toBe('JPY')
  })

  it('prefers a currency stated on the line item itself', () => {
    const item = { ...lineItem('pri_pro_m', '1850', '€18.50'), currencyCode: 'EUR' }
    const table = readPricePreview(response('USD', [item]))
    expect(table.pri_pro_m.currencyCode).toBe('EUR')
  })

  // The rule the whole module rests on: an entry that does not parse is DROPPED,
  // so the page falls back to the true USD base. A defaulted 0 would advertise a
  // paid tier as free — the one wrong answer that costs money on every sale.
  it('drops a line item with no price id rather than defaulting it', () => {
    const broken = { ...lineItem('pri_pro_m', '1900', '$19.00'), price: {} }
    const table = readPricePreview(response('USD', [broken, lineItem('pri_pro_a', '20500', '$205.00')]))
    expect(table.pri_pro_m).toBeUndefined()
    expect(table.pri_pro_a).toBeDefined()
  })

  it('drops a line item whose total is not a number', () => {
    const broken = lineItem('pri_pro_m', 'nineteen', '$19.00')
    expect(readPricePreview(response('USD', [broken])).pri_pro_m).toBeUndefined()
  })

  it('drops a line item with no formatted total — the charged figure is not ours to invent', () => {
    const broken = { ...lineItem('pri_pro_m', '1900', '$19.00'), formattedTotals: {} }
    expect(readPricePreview(response('USD', [broken])).pri_pro_m).toBeUndefined()
  })

  it('returns an empty table for anything that is not a response', () => {
    for (const junk of [null, undefined, 42, 'nope', {}, { data: {} }, { data: { details: {} } }]) {
      expect(readPricePreview(junk)).toEqual({})
    }
  })
})

describe('minorUnitDigits', () => {
  it('knows the ordinary two-decimal currencies', () => {
    expect(minorUnitDigits('USD')).toBe(2)
    expect(minorUnitDigits('EUR')).toBe(2)
    expect(minorUnitDigits('GBP')).toBe(2)
  })

  // The three Paddle settles in that have no minor unit. A hard-coded ÷100 here
  // would quote a yen price a hundred times too cheap.
  it('knows the zero-decimal currencies', () => {
    expect(minorUnitDigits('JPY')).toBe(0)
    expect(minorUnitDigits('KRW')).toBe(0)
    expect(minorUnitDigits('CLP')).toBe(0)
  })

  it('handles a three-decimal currency, which a hand-kept list would have missed', () => {
    expect(minorUnitDigits('KWD')).toBe(3)
  })

  it('falls back to two on a code Intl refuses', () => {
    expect(minorUnitDigits('')).toBe(2)
  })
})

describe('fromLowestUnit', () => {
  it('divides by a hundred where there are cents', () => {
    expect(fromLowestUnit(1900, 'USD')).toBe(19)
    expect(fromLowestUnit(20500, 'USD')).toBe(205)
  })

  it('leaves a zero-decimal currency alone', () => {
    expect(fromLowestUnit(2850, 'JPY')).toBe(2850)
    expect(fromLowestUnit(25000, 'KRW')).toBe(25000)
  })

  it('divides by a thousand for a three-decimal currency', () => {
    expect(fromLowestUnit(5820, 'KWD')).toBe(5.82)
  })
})

describe('formatMoney', () => {
  it('formats in the previewed currency', () => {
    expect(formatMoney(17.0833, 'USD')).toBe('$17.08')
    expect(formatMoney(18.5, 'EUR')).toBe('€18.50')
  })

  it('shows no decimals for a zero-decimal currency', () => {
    expect(formatMoney(1708.33, 'JPY')).toBe('¥1,708')
  })

  it('still renders something honest for a code it cannot format', () => {
    expect(formatMoney(19, '')).toBe('19.00 ')
  })
})

describe('localizedLine', () => {
  const usd = () => readPricePreview(usdResponse())

  it('quotes Paddle verbatim and derives the per-month figure', () => {
    const line = localizedLine(usd(), IDS.pro, 'annual')!
    expect(line.currencyCode).toBe('USD')
    // Paddle's own string, untouched — not re-formatted through Intl.
    expect(line.charged).toBe('$205.00')
    expect(line.perMonth).toBe('$17.08')       // 205 / 12
    expect(line.saving).toBe('$23.00')         // 19 × 12 − 205
    // The advertised 10% discount, read off the previewed prices rather than
    // the USD base, so the two can never quote different figures.
    expect(line.savingFraction!).toBeCloseTo(23 / 228, 6)
  })

  it('is the plain price on a monthly period', () => {
    const line = localizedLine(usd(), IDS.max, 'monthly')!
    expect(line.charged).toBe('$49.00')
    expect(line.perMonth).toBe('$49.00')
  })

  // The end-to-end reason this module exists: ¥ amounts carry no minor unit, so
  // the derived per-month figure must not be divided by a hundred on the way.
  it('handles a zero-decimal currency end to end', () => {
    const table = readPricePreview(response('JPY', [
      lineItem('pri_pro_m', '2850', '¥2,850'),
      lineItem('pri_pro_a', '30750', '¥30,750'),
    ]))
    const line = localizedLine(table, IDS.pro, 'annual')!
    expect(line.charged).toBe('¥30,750')
    expect(line.perMonth).toBe('¥2,563')       // 30,750 / 12, no decimals
    expect(line.saving).toBe('¥3,450')         // 2,850 × 12 − 30,750
    expect(line.savingFraction!).toBeCloseTo(3450 / 34200, 6)
  })

  it('is null when the period has not been previewed — the caller falls back to USD', () => {
    const table = readPricePreview(response('USD', [lineItem('pri_pro_m', '1900', '$19.00')]))
    expect(localizedLine(table, IDS.pro, 'annual')).toBeNull()
    expect(localizedLine(table, IDS.pro, 'monthly')).not.toBeNull()
  })

  it('drops the saving rather than comparing across currencies', () => {
    const mixed: PriceTable = {
      pri_pro_m: { priceId: 'pri_pro_m', charged: '$19.00', total: 1900, currencyCode: 'USD' },
      pri_pro_a: { priceId: 'pri_pro_a', charged: '€185.00', total: 18500, currencyCode: 'EUR' },
    }
    const line = localizedLine(mixed, IDS.pro, 'annual')!
    expect(line.charged).toBe('€185.00')
    expect(line.saving).toBeNull()
    expect(line.savingFraction).toBeNull()
  })

  it('drops a saving that is not a saving', () => {
    // An annual price dearer than twelve monthly ones is a catalog mistake, but
    // "save -$5.00" is worse than saying nothing.
    const table = readPricePreview(response('USD', [
      lineItem('pri_pro_m', '1900', '$19.00'),
      lineItem('pri_pro_a', '23000', '$230.00'),
    ]))
    expect(localizedLine(table, IDS.pro, 'annual')!.saving).toBeNull()
  })
})

describe('tableCurrency', () => {
  it('names the currency a table was quoted in', () => {
    expect(tableCurrency(readPricePreview(usdResponse()))).toBe('USD')
  })

  it('is null for an empty table, so the page keeps its base-currency wording', () => {
    expect(tableCurrency({})).toBeNull()
  })

  it('is null for a mixed table rather than naming one of them', () => {
    const mixed: PriceTable = {
      a: { priceId: 'a', charged: '$19.00', total: 1900, currencyCode: 'USD' },
      b: { priceId: 'b', charged: '€18.50', total: 1850, currencyCode: 'EUR' },
    }
    expect(tableCurrency(mixed)).toBeNull()
  })
})
