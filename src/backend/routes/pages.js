const path = require('path');
const express = require('express');
const { PAGES_DIR } = require('../config/constants');

const router = express.Router();

const pageFiles = [
  'index.html',
  'QuantitySurveying.html',
  'ReinforcedConcrete.html',
  'column.html',
  'beam.html',
  'slab.html',
  'foundation.html',
  'foundationDesign.html',
  'foundationDesign2.html',
  'columnDesign.html',
  'beamDesign.html',
  'chb.html',
  'boxCulvert.html',
  't.html',
  '404.html',
];

router.get('/', (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'index.html'));
});

for (const file of pageFiles) {
  router.get(`/${file}`, (_req, res) => {
    res.sendFile(path.join(PAGES_DIR, file));
  });
}

module.exports = router;
