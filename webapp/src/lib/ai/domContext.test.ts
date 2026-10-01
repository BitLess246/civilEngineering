import { describe, it, expect } from 'vitest'
import { cleanVisibleText, formatDomContext } from './domContext'

describe('cleanVisibleText', () => {
  it('one line per line, blank runs and immediate repeats dropped', () => {
    expect(cleanVisibleText('Footing\n\n\n  B = 2.1 m  \nB = 2.1 m\nPASS\n\nB = 2.1 m'))
      .toBe('Footing\nB = 2.1 m\nPASS\nB = 2.1 m')
  })
})

describe('formatDomContext', () => {
  const ctx = {
    heading: 'Isolated Footing',
    fields: [{ label: 'Column load P', value: '850' }, { label: 'qa', value: '200' }],
    text: 'Punching shear vu/φvc = 1.12\nNOT ACCEPTABLE',
  }

  it('heading, then every field with its value, then what the page shows', () => {
    const t = formatDomContext(ctx, 6000)
    expect(t.split('\n')[0]).toBe('Page: Isolated Footing')
    expect(t).toContain('Fields: Column load P=850; qa=200')
    expect(t).toContain('Visible text:\nPunching shear vu/φvc = 1.12\nNOT ACCEPTABLE')
  })

  it('fields come before the text, so a cut keeps the inputs', () => {
    const t = formatDomContext({ ...ctx, text: 'x'.repeat(10_000) }, 200)
    expect(t.length).toBeLessThanOrEqual(201)
    expect(t).toContain('Column load P=850')
    expect(t.endsWith('…')).toBe(true)
  })

  it('an empty page still names itself, and says nothing it does not have', () => {
    expect(formatDomContext({ heading: '', fields: [], text: '' }, 100)).toBe('Page: untitled')
  })
})
