const express = require('express');
//const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const { promisify } = require('util');

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 3000;



app.use(express.static('public'));
app.use(express.json());



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





server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});