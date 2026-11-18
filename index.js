const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'mt5-bridge-secure-token';

let commandQueue = [];
let livePrices = {};

// Middleware to verify private access
const verifyPrivate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.key;
  if (token === BRIDGE_TOKEN || token === 'huzafx-obsidian-2026') {
    return next();
  }
  return res.status(403).json({ error: 'Unauthorized' });
};

// 1. MT5 Telemetry Receiver
app.post('/api/mt5/telemetry', verifyPrivate, (req, res) => {
  const { symbol, bid, ask, equity, balance, closedTrade } = req.body;
  if (symbol) livePrices[symbol] = { bid, ask };
  console.log('Received telemetry:', symbol, bid, ask);
  res.status(200).send('OK');
});

// 2. MT5 Command Poller (EA polls this every 1s)
app.get('/api/mt5/commands', verifyPrivate, (req, res) => {
  if (commandQueue.length > 0) {
    res.json(commandQueue.shift());
  } else {
    res.json({ status: 'idle' });
  }
});

// 3. Dispatch Command (From Frontend)
app.post('/api/mt5/commands', verifyPrivate, (req, res) => {
  commandQueue.push(req.body);
  console.log('Command queued:', req.body);
  res.json({ success: true, queued: commandQueue.length });
});

// 4. News IQ Proxy (Fetches live calendar data)
app.get('/api/news-iq', verifyPrivate, async (req, res) => {
  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const response = await axios.get(url);
    const highImpact = response.data.filter(e => e.impact === 'High');
    res.json(highImpact);
  } catch (error) {
    res.status(500).json({ error: 'News fetch failed' });
  }
});

// 5. Live Prices Endpoint
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
