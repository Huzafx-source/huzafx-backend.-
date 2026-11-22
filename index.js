const express = require('express');
const app = express();
app.use(express.json({ limit: '2mb' }));
const TOKEN = process.env.BRIDGE_TOKEN || 'mt5-bridge-secure-token';
const PORT = process.env.PORT || 8080;
let ea = { connected: false, lastHb: 0, hb: null };
let cmdQueue = {};
let calCache = { ts: 0, data: null };

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,X-Login,X-Ts,X-Sig,X-Bridge-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (req, res) => res.json({ ok: true, service: 'huzafx-bridge', routes: ['GET /health', 'POST /ea/sync', 'POST /app/sync', 'GET /app/state', 'GET /tools/calendar'] }));

app.get('/health', (req, res) => res.json({
  ok: true,
  ea_connected: ea.connected && (Date.now() - ea.lastHb < 15000),
  last_ea_hb: ea.lastHb,
  uptime: process.uptime(),
  version: '1.0',
  routes: ['GET /health', 'POST /ea/sync', 'POST /app/sync', 'GET /app/state', 'GET /tools/calendar']
}));

app.post('/ea/sync', (req, res) => {
  const login = String(req.headers['x-login'] || (req.body && req.body.login) || '0');
  const evs = (req.body && req.body.events) || [];
  for (const e of evs) { if (e && e.t === 'HEARTBEAT') { ea.lastHb = Date.now(); ea.hb = e; ea.connected = true; } }
  const q = cmdQueue[login] || []; cmdQueue[login] = [];
  const lines = q.map(c => c.id + '|' + c.cmd + '|' + (c.params || ''));
  res.type('text/plain').send('\n' + lines.join('\n') + '\n');
});

app.post('/app/sync', (req, res) => {
  if ((req.headers['x-bridge-token'] || '') !== TOKEN) return res.status(401).json({ error: 'bad token' });
  const b = req.body || {};
  if (b.action === 'state') return res.json({ ok: true, ea_connected: (Date.now() - ea.lastHb < 15000), last_ea_hb: ea.lastHb, heartbeat: ea.hb });
  if (b.action === 'command') {
    const login = String(b.login || '0');
    (cmdQueue[login] = cmdQueue[login] || []).push({ id: b.id, cmd: b.cmd, params: b.params || '' });
    return res.json({ queued: true });
  }
  res.status(400).json({ error: 'unknown action' });
});

app.get('/app/state', (req, res) => {
  if ((req.headers['x-bridge-token'] || '') !== TOKEN) return res.status(401).json({ error: 'bad token' });
  res.json({ ok: true, ea_connected: (Date.now() - ea.lastHb < 15000), last_ea_hb: ea.lastHb, heartbeat: ea.hb });
});

app.get('/tools/calendar', (req, res) => {
  const now = Date.now();
  if (calCache.data && now - calCache.ts < 900000) return res.json(calCache.data);
  fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json')
    .then(r => r.json())
    .then(raw => {
      const events = (raw || []).map(e => ({
        time_utc: e.date, currency: e.country, event: e.title,
        impact: e.impact, consensus: e.forecast || '', previous: e.previous || '', actual: e.actual || ''
      }));
      calCache = { ts: now, data: { ok: true, source: 'faireconomy-server-side', events } };
      res.json(calCache.data);
    })
    .catch(() => res.status(503).json({ ok: false, error: 'calendar upstream failed' }));
});

app.listen(PORT, () => console.log('HUZAFX relay listening on', PORT));