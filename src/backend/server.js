const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { PORT, ASSETS_DIR, PUBLIC_DIR } = require('./config/constants');
const pageRoutes = require('./routes/pages');
const downloadRoutes = require('./routes/download');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use('/assets', express.static(ASSETS_DIR));

// ── React SPA (incremental migration) ──────────────────────────────────
// The new Vite app builds to public/app and is served under /app so it can
// coexist with the legacy pages. Mounted only when it has been built, so the
// legacy site is unaffected if the React build hasn't run.
const APP_DIR = path.join(PUBLIC_DIR, 'app');
if (fs.existsSync(path.join(APP_DIR, 'index.html'))) {
  app.use('/app', express.static(APP_DIR));
  // Client-side routing fallback: any /app/* path returns the SPA shell.
  app.get('/app/*', (_req, res) => res.sendFile(path.join(APP_DIR, 'index.html')));
} else {
  console.warn('[app] React build not found at public/app — run `npm --prefix webapp run build` to enable /app');
}

app.use(pageRoutes);
app.use(downloadRoutes);

server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
