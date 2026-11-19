require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' })); // Allow connections from your phone/app
app.use(express.json());

const PORT = process.env.PORT || 10000;
let commandQueue = [];
let livePrices = {};

// 1. Root Route (Fixes 404 on main URL)
app.get('/', (req, res) => {
  res.json({ status: 'Huzafx Relay Online', message: 'Server is running' });
});

// 2. Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 3. MT5 Command Polling (THE FIX - EA polls this)
app.get('/api/mt5/commands', (req, res) => {
  if (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    console.log('Sending command to EA:', cmd);
    res.json(cmd);
  } else {
    res.json({ status: 'idle' });
  }
});

// 4. Frontend Order Submission
app.post('/api/mt5/commands', (req, res) => {
  console.log('Order received from app:', req.body);
  commandQueue.push(req.body);
  res.json({ success: true, queued: commandQueue.length });
});

// 5. MT5 Telemetry Receiver
app.post('/api/mt5/telemetry', (req, res) => {
  const { symbol, bid, ask, equity, balance } = req.body;
  if (symbol) {
    livePrices[symbol] = { bid, ask, equity, balance, time: Date.now() };
  }
  res.status(200).send('OK');
});

// 6. News Proxy
app.get('/api/news-iq', async (req, res) => {
  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const response = await axios.get(url);
    const highImpact = response.data.filter(e => e.impact === 'High' || e.impact === 'Red');
    res.json(highImpact);
  } catch (error) {
    res.status(500).json({ error: 'News fetch failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[Huzafx AI] Backend running on port ${PORT}`);
});