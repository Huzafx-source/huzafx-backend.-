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

app.get('/', (req, res) => res.json({ status: 'Huzafx Relay Online' }));
app.get('/api/command', (req, res) => res.json({ status: 'idle' }));
app.get('/api/commands', (req, res) => res.json({ status: 'idle' }));

app.post('/api/mt5/telemetry', (req, res) => {
  const { token, symbols, equity, balance, login, time } = req.body || {};
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  
  // Handle multi-symbol telemetry
  if (symbols && typeof symbols === 'object') {
    for (const [sym, data] of Object.entries(symbols)) {
      livePrices[sym] = { ...data, equity, balance, login, time, ts: Date.now() };
    }
  } else if (req.body.symbol) {
    // Legacy single-symbol format
    livePrices[req.body.symbol] = { ...req.body, ts: Date.now() };
  }
  
  res.status(200).send('OK');
});

app.get('/api/mt5/telemetry', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  res.json(livePrices);
});

app.get('/api/mt5/commands', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  if (commandQueue.length > 0) return res.json(commandQueue.shift());
  res.json({ status: 'idle' });
});

app.post('/api/mt5/commands', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1] || req.body?.token;
  if (token !== BRIDGE_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const { symbol, type, lots, sl, tp } = req.body || {};
  if (!symbol || !type) return res.status(400).json({ error: 'missing symbol/type' });
  const t = String(type).toLowerCase();
  if (t !== 'buy' && t !== 'sell') return res.status(400).json({ error: 'type must be buy or sell' });
  if (!(Number(lots) > 0)) return res.status(400).json({ error: 'invalid lots' });
  const cmd = {
    id: crypto.randomUUID(),
    symbol: String(symbol),
    type: t,
    lots: Number(lots),
    sl: Number(sl),
    tp: Number(tp)
  };
  commandQueue.push(cmd);
  console.log('Order queued:', cmd);
  res.json({ success: true, queued: commandQueue.length, id: cmd.id });
});

app.get('/api/news-iq', async (req, res) => {
  try {
    const r = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { timeout: 8000 });
    res.json(r.data.filter(e => /high|red/i.test(e.impact || '')));
  } catch (e) {
    res.status(200).json({ demo: true, events: [] });
  }
});

app.listen(PORT, () => console.log(`[Huzafx AI] Backend running on port ${PORT}`));