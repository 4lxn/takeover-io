// takeover.io server: serves the client files and runs the one shared multiplayer arena.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('./game.js');

const PORT = Number(process.env.PORT) || 3000;
const TICK = 1 / 30;
const MAX_MSGS_PER_SEC = 60;
const MAX_HUMANS = Number(process.env.MAX_HUMANS) || G.CONFIG.maxHumans;
const MAX_SOCKETS = MAX_HUMANS + 20; // humans + sockets still saying hello
const HELLO_TIMEOUT = 10000;    // close sockets that never say hello
const MAX_BUFFERED = 64 * 1024; // skip snapshots for clients that can't keep up

// Only these files are ever served (no path from the URL touches the filesystem).
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/assets.js': ['assets.js', 'text/javascript; charset=utf-8'],
  '/controls.js': ['controls.js', 'text/javascript; charset=utf-8'],
  '/background.js': ['background.js', 'text/javascript; charset=utf-8'],
};

const server = http.createServer((req, res) => {
  const f = FILES[req.url.split('?')[0]];
  if (!f) { res.writeHead(404).end('not found'); return; }
  fs.readFile(path.join(__dirname, f[0]), (err, body) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' }).end(body);
  });
});

const game = G.createGame({ mode: 'multi' });
const clients = new Map(); // ws -> { id, msgs, windowStart }
const humans = () => [...clients.values()].filter((c) => c.id).length;

const wss = new WebSocketServer({ server, maxPayload: 512, perMessageDeflate: true });

wss.on('connection', (ws) => {
  if (clients.size >= MAX_SOCKETS) { ws.terminate(); return; }
  const c = { id: null, msgs: 0, windowStart: Date.now(), alive: true };
  clients.set(ws, c);
  ws.on('pong', () => { c.alive = true; });
  setTimeout(() => { if (!c.id) ws.terminate(); }, HELLO_TIMEOUT);

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - c.windowStart >= 1000) { c.windowStart = now; c.msgs = 0; }
    if (++c.msgs > MAX_MSGS_PER_SEC) { ws.terminate(); return; }

    const m = G.parseInput(data.toString());
    if (!m) return;
    if (m.t === 'hello' && !c.id) {
      if (humans() >= MAX_HUMANS) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
      const ai = G.addAI(game, m.name, { cls: m.cls, skin: m.skin });
      c.id = ai.id;
      ws.send(JSON.stringify({ t: 'welcome', id: ai.id, arena: G.CONFIG.arena, packets: G.allPackets(game) }));
    } else if (m.t === 'in' && c.id) {
      G.setInput(game, c.id, m);
    }
  });

  ws.on('close', () => {
    if (c.id) G.removeAI(game, c.id);
    clients.delete(ws);
  });
  ws.on('error', () => {});
});

// 30 Hz simulation, snapshots on every other tick (15 Hz). Idle while nobody is connected.
// BENCH=1 logs how long each tick takes (simulation + snapshots), every 5 s.
const bench = process.env.BENCH ? { n: 0, sum: 0, max: 0, bytes: 0 } : null;
if (bench) setInterval(() => {
  console.log(`bench humans=${humans()} tick avg=${(bench.sum / Math.max(1, bench.n)).toFixed(2)}ms max=${bench.max.toFixed(2)}ms out=${(bench.bytes / 5 / 1024).toFixed(0)}KB/s(raw)`);
  bench.n = bench.sum = bench.max = bench.bytes = 0;
}, 5000);

let tick = 0;
setInterval(() => {
  if (!humans()) return;
  const t0 = bench ? performance.now() : 0;
  G.step(game, TICK);
  // 15 snapshots/s normally; 10/s in big lobbies to save CPU and bandwidth (clients interpolate).
  if (++tick % (humans() > 30 ? 3 : 2)) return;
  const events = G.drainEvents(game);
  const pk = G.drainPackets(game);
  for (const [ws, c] of clients) {
    if (!c.id || ws.readyState !== ws.OPEN || ws.bufferedAmount > MAX_BUFFERED) continue;
    const snap = G.snapshot(game, c.id, G.CONFIG.aoi);
    snap.t = 'snap'; snap.events = G.eventsFor(events, game, c.id, G.CONFIG.aoi); snap.pk = pk;
    const out = JSON.stringify(snap);
    if (bench) bench.bytes += out.length;
    ws.send(out);
  }
  if (bench) { const dt = performance.now() - t0; bench.n++; bench.sum += dt; bench.max = Math.max(bench.max, dt); }
}, TICK * 1000);

// Heartbeat: drop half-open connections (a phone that lost signal) so they free their slot.
setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) { ws.terminate(); continue; }
    c.alive = false;
    ws.ping();
  }
}, 10000);

server.listen(PORT, () => console.log(`takeover.io on http://localhost:${PORT}`));
