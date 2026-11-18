require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' })); // Allow connections from your phone/app
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'mt5-bridge-secure-token';
const PRIVATE_KEY = process.env.PRIVATE_ACCESS_KEY || 'huzafx-obsidian-2026';

let commandQueue = [];
let livePrices = {};

// Middleware to check keys
const verifyPrivate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.key;
  if (token === BRIDGE_TOKEN || token === PRIVATE_KEY || token === 'huzafx-obsidian-2026') {
    return next();
  }
  return res.status(403).json({ error: 'Unauthorized' });
};

// --- FIXES THE 404 ERRORS ---
app.get('/', (req, res) => {
  res.json({ status: 'Huzafx Relay Online', message: 'Connected successfully' });
});

app.get('/api/command', (req, res) => {
  res.json({ status: 'idle' });
});

app.get('/api/commands', (req, res) => {
  res.json({ status: 'idle' });
});
// ----------------------------

// 1. MT5 Telemetry Receiver
app.post('/api/mt5/telemetry', verifyPrivate, (req, res) => {
  const { symbol, bid, ask, equity, balance } = req.body;
  if (symbol) livePrices[symbol] = { bid, ask, equity, balance };
  res.status(200).send('OK');
});

// 2. MT5 Command Poller (EA polls this)
app.get('/api/mt5/commands', verifyPrivate, (req, res) => {
  if (commandQueue.length > 0) {
    res.json(commandQueue.shift());
  } else {
    res.json({ status: 'idle' });
  }
});

// 3. Frontend sends commands here
app.post('/api/mt5/commands', verifyPrivate, (req, res) => {
  commandQueue.push(req.body);
  res.json({ success: true, queued: commandQueue.length });
});

// 4. News IQ Proxy
app.get('/api/news-iq', verifyPrivate, async (req, res) => {
  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const response = await axios.get(url);
    const highImpact = response.data.filter(e => e.impact === 'High' || e.impact === 'Red');
    res.json(highImpact);
  } catch (error) {
    res.status(500).json({ error: 'News fetch failed' });
  }
});

// 5. Live Prices SSE
app.get('/api/stream/live-prices', verifyPrivate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify(livePrices)}\n\n`);
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

app.listen(PORT, () => {
  console.log(`[Huzafx AI] Backend running on port ${PORT}`);
});
