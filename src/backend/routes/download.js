const express = require('express');

const router = express.Router();

router.post('/download', (req, res) => {
  try {
    const textContent = req.body.text;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=file.txt');
    res.send(textContent);
  } catch (error) {
    console.error('Error retrieving user data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
