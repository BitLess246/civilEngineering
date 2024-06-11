const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 3000;



app.use(express.static('public'));
app.use(express.json());
// Middleware to parse JSON request bodies
app.use(bodyParser.json());


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'QuantitySurveying.html'));
});
app.get('/QuantitySurveying.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'QuantitySurveying.html'));
});
app.get('/column.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'column.html'));
});
app.get('/beam.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'beam.html'));
});
app.get('/slab.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'slab.html'));
});
app.get('/foundation.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'foundation.html'));
});
app.post('/download', (req, res) => {
    try {
        const xmlContent = req.body.xml;
        // Set headers to prompt download
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', 'attachment; filename=file.xml');
        // Send the XML content
        res.send(xmlContent);
    } catch (error) {
        // Handle unexpected errors
        console.error('Error retrieving user data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});





server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});