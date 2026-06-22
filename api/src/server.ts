import { app } from './app'

// Bind to the host-provided port (Render/Railway/Fly all inject PORT) on all
// interfaces. This is the entry point for the deployed Node service.
const PORT = Number(process.env.PORT) || 8080
app.listen(PORT, () => {
  console.log(`[calc-api] listening on :${PORT}`)
})
