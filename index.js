require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors({ origin: '*' })); // Allow connections from your phone/app
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'mt5-bridge-secure-token';

let commandQueue = [];
let livePrices = {}; // Stores live prices keyed by broker symbol

// --- Health & Legacy Routes ---
app.get('/', (req, res) => {
  res.json({ status: 'Huzafx Relay Online', message: 'Server is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/command', (req, res) => {
  res.json({ status: 'idle' });
});

app.get('/api/commands', (req, res) => {
  res.json({ status: 'idle' });
});

// --- MT5 Telemetry Receiver (Handles Multi-Symbol from EA v2.00) ---
app.post('/api/mt5/telemetry', (req, res) => {
  const { token, symbols, symbol, equity, balance, login, time } = req.body || {};
  
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  
  // Handle new multi-symbol format from EA v2.00
  if (symbols && typeof symbols === 'object') {
    for (const [sym, data] of Object.entries(symbols)) {
      livePrices[sym] = { ...data, equity, balance, login, time, ts: Date.now() };
    }
  } 
  // Fallback for legacy single-symbol format
  else if (symbol) {
    livePrices[symbol] = { ...req.body, ts: Date.now() };
  }
  
  res.status(200).send('OK');
});

// --- Frontend Reads Live Prices ---
app.get('/api/mt5/telemetry', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  res.json(livePrices);
});

// --- EA Polls Commands ---
app.get('/api/mt5/commands', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  
  if (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    console.log('Sending command to EA:', cmd);
    res.json(cmd);
  } else {
    res.json({ status: 'idle' });
  }
});

// --- Frontend Submits Orders (FIXED: Accepts Limit/Stop Orders) ---
app.post('/api/mt5/commands', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1] || req.body?.token;
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  
  const { symbol, type, lots, sl, tp, price } = req.body || {};
  
  if (!symbol || !type) return res.status(400).json({ error: 'missing symbol/type' });
  
  // Normalize type (e.g., "Buy Limit" -> "buy_limit")
  const t = String(type).toLowerCase().replace(/\s+/g, '_');
  const validTypes = ['buy', 'sell', 'buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'];
  
  if (!validTypes.includes(t)) {
    return res.status(400).json({ error: 'type must be buy, sell, buy_limit, sell_limit, buy_stop, or sell_stop' });
  }
  
  if (!(Number(lots) > 0)) return res.status(400).json({ error: 'invalid lots' });
  
  const cmd = {
    id: crypto.randomUUID(),
    symbol: String(symbol),
    type: t,
    lots: Number(lots),
    sl: Number(sl) || 0,
    tp: Number(tp) || 0,
    price: price ? Number(price) : 0 // Required for limit/stop orders
  };
  
  commandQueue.push(cmd);
  console.log('Order queued:', cmd);
  res.json({ success: true, queued: commandQueue.length, id: cmd.id });
});

// --- News Proxy ---
app.get('/api/news-iq', async (req, res) => {
  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const response = await axios.get(url, { timeout: 8000 });
    const highImpact = response.data.filter(e => e.impact === 'High' || e.impact === 'Red');
    res.json(highImpact);
  } catch (error) {
    res.status(200).json({ demo: true, events: [], error: 'News fetch failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[Huzafx AI] Backend running on port ${PORT}`);
});