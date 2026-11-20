require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'mt5-bridge-secure-token';

let commandQueue = [];
let livePrices = {};

// helper: pull token from query, header, or body
function getToken(req) {
  const auth = (req.headers.authorization || '').split(' ')[1];
  return req.query.token || auth || req.headers['x-api-key'] || (req.body && req.body.token) || null;
}

// helper: reject ONLY if a token was supplied and it's wrong; allow if none supplied
function authOk(req) {
  const t = getToken(req);
  if (t === null) return true;            // no token -> accept (private bridge)
  return t === BRIDGE_TOKEN;              // wrong token -> reject
}

// --- Health / legacy ---
app.get('/', (req, res) => res.json({ status: 'Huzafx Relay Online', message: 'Server is running' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/command', (req, res) => res.json({ status: 'idle' }));
app.get('/api/commands', (req, res) => res.json({ status: 'idle' }));

// --- Telemetry WRITE (from EA) ---
app.post('/api/mt5/telemetry', (req, res) => {
  if (!authOk(req)) return res.status(403).json({ error: 'Unauthorized' });
  const { symbols, symbol, equity, balance, login, time } = req.body || {};
  if (symbols && typeof symbols === 'object') {
    for (const [sym, d] of Object.entries(symbols))
      livePrices[sym] = { ...d, equity, balance, login, time, ts: Date.now() };
  } else if (symbol) {
    livePrices[symbol] = { ...req.body, ts: Date.now() };
  }
  res.status(200).send('OK');
});

// --- Telemetry READ (from app) ---
app.get('/api/mt5/telemetry', (req, res) => {
  if (!authOk(req)) return res.status(403).json({ error: 'Unauthorized' });
  res.json(livePrices);
});

// --- EA POLLS commands ---
app.get('/api/mt5/commands', (req, res) => {
  if (!authOk(req)) return res.status(403).json({ error: 'Unauthorized' });
  if (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    console.log('Sending command to EA:', cmd);
    return res.json(cmd);
  }
  res.json({ status: 'idle' });
});

// --- APP SUBMITS orders (THE FIXED ROUTE) ---
app.post('/api/mt5/commands', (req, res) => {
  if (!authOk(req)) return res.status(403).json({ error: 'Unauthorized' });

  const { symbol, type, lots, sl, tp, price } = req.body || {};
  if (!symbol || !type) return res.status(400).json({ error: 'missing symbol/type' });

  const t = String(type).toLowerCase().replace(/\s+/g, '_');
  const valid = ['buy', 'sell', 'buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'];
  if (!valid.includes(t))
    return res.status(400).json({ error: 'type must be buy, sell, buy_limit, sell_limit, buy_stop, or sell_stop' });
  if (!(Number(lots) > 0)) return res.status(400).json({ error: 'invalid lots' });

  const cmd = {
    id: crypto.randomUUID(),
    symbol: String(symbol),
    type: t,
    lots: Number(lots),
    sl: Number(sl) || 0,
    tp: Number(tp) || 0,
    price: price ? Number(price) : 0
  };
  commandQueue.push(cmd);
  console.log('Order queued:', cmd);
  res.json({ success: true, queued: commandQueue.length, id: cmd.id });
});

// --- News proxy ---
app.get('/api/news-iq', async (req, res) => {
  try {
    const r = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { timeout: 8000 });
    res.json(r.data.filter(e => /high|red/i.test(e.impact || '')));
  } catch (e) {
    res.status(200).json({ demo: true, events: [], error: 'News fetch failed' });
  }
});

app.listen(PORT, () => console.log(`[Huzafx AI] Backend running on port ${PORT}`));