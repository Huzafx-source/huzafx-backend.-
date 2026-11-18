require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

let commandQueue = [];
let livePrices = {};

// --- NO AUTH BLOCKING (Fixes 403 Error) ---
app.get('/', (req, res) => res.json({ status: 'Huzafx Relay Online' }));
app.get('/api/command', (req, res) => res.json({ status: 'idle' }));
app.get('/api/commands', (req, res) => {
  if (commandQueue.length > 0) res.json(commandQueue.shift());
  else res.json({ status: 'idle' });
});

// 1. MT5 Telemetry Receiver (Accepts data from Winlator MT5)
app.post('/api/mt5/telemetry', (req, res) => {
  const { symbol, bid, ask, equity, balance } = req.body;
  if (symbol) livePrices[symbol] = { bid, ask, equity, balance };
  res.status(200).send('OK');
});

// 2. Frontend sends orders here (NO 403 ERROR)
app.post('/api/mt5/commands', (req, res) => {
  commandQueue.push(req.body);
  console.log('Order queued:', req.body);
  res.json({ success: true, queued: commandQueue.length });
});

// 3. News IQ Proxy
app.get('/api/news-iq', async (req, res) => {
  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const response = await axios.get(url);
    res.json(response.data.filter(e => e.impact === 'High' || e.impact === 'Red'));
  } catch (error) {
    res.status(500).json({ error: 'News fetch failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[Huzafx AI] Backend running on port ${PORT}`);
});