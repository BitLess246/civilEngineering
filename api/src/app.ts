import express from 'express'
import cors from 'cors'
import { steelRouter } from './routes/steel'

// The Express app, exported without listening so tests can drive it in-process
// (see routes/*.test.ts) and server.ts can bind it to a port for deployment.
export function createApp() {
  const app = express()

  // CORS: the SPA is hosted on a different origin (e.g. Firebase) and calls this
  // API cross-origin. ALLOWED_ORIGIN locks it down in production (comma-separated
  // list); unset reflects any origin, convenient for local dev.
  const allowed = process.env.ALLOWED_ORIGIN
  app.use(cors(allowed ? { origin: allowed.split(',').map((o) => o.trim()) } : {}))

  app.use(express.json({ limit: '256kb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/steel', steelRouter)

  return app
}

export const app = createApp()
