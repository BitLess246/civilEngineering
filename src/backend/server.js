const express = require('express');
const http = require('http');

const { PORT, ASSETS_DIR } = require('./config/constants');
const pageRoutes = require('./routes/pages');
const downloadRoutes = require('./routes/download');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use('/assets', express.static(ASSETS_DIR));
app.use(pageRoutes);
app.use(downloadRoutes);

server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
