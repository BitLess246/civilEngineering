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
// Legacy assets first so /assets always resolves to the static site's CSS/JS.
app.use('/assets', express.static(ASSETS_DIR));

// ── React SPA (production site) ─────────────────────────────────────────
// The Vite app builds to public/app and is the primary site, served at "/".
// Its hashed assets live under /static (see vite.config assetsDir), so they
// don't clash with the legacy /assets mount. The old .html pages are still
// reachable at their own paths, served by pageRoutes below.
const APP_DIR = path.join(PUBLIC_DIR, 'app');
const reactBuilt = fs.existsSync(path.join(APP_DIR, 'index.html'));
if (reactBuilt) {
  // Serve "/", /static/*, and other built files. A missing file falls through
  // to the legacy routes (e.g. /foundationDesign.html).
  app.use(express.static(APP_DIR));
} else {
  console.warn('[app] React build not found at public/app — run `npm --prefix webapp run build`. Falling back to the legacy home page.');
}

app.use(pageRoutes);
app.use(downloadRoutes);

// The SPA used to be mounted under /app — keep old links working.
if (reactBuilt) {
  app.get(['/app', '/app/*'], (req, res) => {
    res.redirect(301, req.originalUrl.replace(/^\/app/, '') || '/');
  });
}

// SPA fallback: client-side routes (/foundation, /combined, /estimate/*, …)
// have no file or legacy route, so return the React shell and let the router
// take over. Registered last so assets and legacy .html pages win first.
if (reactBuilt) {
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/assets/')) return next();
    res.sendFile(path.join(APP_DIR, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
