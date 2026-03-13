const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PAGES_DIR = path.join(PUBLIC_DIR, 'pages');
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');
const PORT = process.env.PORT || 3000;

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR,
  PAGES_DIR,
  ASSETS_DIR,
  PORT,
};
