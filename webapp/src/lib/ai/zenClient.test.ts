import { describe, it, expect } from 'vitest'
import {
  chatWithAssistant, assistantFailureMessage, type FunctionsInvoker,
} from './zenClient'

const okClient = (data: unknown): FunctionsInvoker => ({
  functions: { invoke: async () => ({ data, error: null }) },
})
const errClient = (status: number): FunctionsInvoker => ({
  functions: { invoke: async () => ({ data: null, error: { context: { status } } }) },
})
const req = { model: 'big-pickle', messages: [{ role: 'user' as const, content: 'size a footing' }] }

describe('chatWithAssistant', () => {
  it('returns the reply with its validated actions', () => {
    return expect(
      chatWithAssistant(okClient({ reply: 'done', model: 'big-pickle', actions: [{ route: '/beam-design', inputs: { L: 6 }, note: '' }] }), 'tok', req),
    ).resolves.toEqual({
      ok: true, reply: 'done', model: 'big-pickle',
      actions: [{ route: '/beam-design', inputs: { L: 6 }, note: '' }],
    })
  })

  it('drops malformed actions and defaults a missing list to empty', () => {
    return expect(
      chatWithAssistant(okClient({ reply: 'hi', model: 'big-pickle', actions: [{ route: 42 }] }), 'tok', req),
    ).resolves.toEqual({ ok: true, reply: 'hi', model: 'big-pickle', actions: [] })
  })

  it('maps missing token, statuses, and bad payloads to reasons', async () => {
    expect(await chatWithAssistant(okClient({}), null, req)).toEqual({ ok: false, reason: 'not-configured' })
    expect(await chatWithAssistant(errClient(401), 'tok', req)).toEqual({ ok: false, reason: 'unauthenticated' })
    expect(await chatWithAssistant(errClient(400), 'tok', req)).toEqual({ ok: false, reason: 'bad-request' })
    expect(await chatWithAssistant(errClient(503), 'tok', req)).toEqual({ ok: false, reason: 'assistant-off' })
    expect(await chatWithAssistant(errClient(500), 'tok', req)).toEqual({ ok: false, reason: 'failed' })
    expect(await chatWithAssistant(okClient({ reply: 7 }), 'tok', req)).toEqual({ ok: false, reason: 'failed' })
  })

  it('every reason has user-facing words', () => {
    for (const r of ['not-configured', 'unauthenticated', 'assistant-off', 'bad-request', 'failed'] as const) {
      expect(assistantFailureMessage(r).length).toBeGreaterThan(10)
    }
  })
})
