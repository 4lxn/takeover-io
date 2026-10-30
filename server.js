// takeover.io server: serves the client files and runs the multiplayer rooms.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('./game.js');
const { createRooms, validRoomRequest } = require('./rooms.js');
const A = require('./accounts.js');

const PORT = Number(process.env.PORT) || 3000;
const TICK = 1 / 30;
const MAX_MSGS_PER_SEC = 60;
const MAX_HUMANS = Number(process.env.MAX_HUMANS) || 500; // across all rooms (rooms have their own caps)
const MAX_SOCKETS = MAX_HUMANS + 50; // humans + sockets still saying hello
const HELLO_TIMEOUT = 10000;    // close sockets that never say hello
const MAX_BUFFERED = 64 * 1024; // skip snapshots for clients that can't keep up
const MAX_HELLO = 8192;         // a hello carries an access token; every other message stays under 512 bytes
if (process.env.ROUND_SECONDS) G.CONFIG.round = Number(process.env.ROUND_SECONDS);  // short rounds for tests and events

// Only these files are ever served (no path from the URL touches the filesystem).
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/assets.js': ['assets.js', 'text/javascript; charset=utf-8'],
  '/controls.js': ['controls.js', 'text/javascript; charset=utf-8'],
  '/background.js': ['background.js', 'text/javascript; charset=utf-8'],
  '/menu-bg.js': ['menu-bg.js', 'text/javascript; charset=utf-8'],
  '/takeover-fx.js': ['takeover-fx.js', 'text/javascript; charset=utf-8'],
  '/lobby.html': ['lobby.html', 'text/html; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/vendor/supabase.js': ['vendor/supabase.js', 'text/javascript; charset=utf-8'],
  '/config.js': ['config.js', 'text/javascript; charset=utf-8'],
  '/privacy.html': ['privacy.html', 'text/html; charset=utf-8'],
  '/account.js': ['account.js', 'text/javascript; charset=utf-8'],
};

const R = createRooms();
const clients = new Map(); // ws -> { id, room, msgs, windowStart, alive }
const humans = () => { let n = 0; for (const c of clients.values()) if (c.id) n++; return n; };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(body));
}

// Lobby data for one room: who is online, the round state and the top 5.
function lobbyOf(r) {
  const names = [];
  for (const c of r.clients.values()) if (c.id) { const ai = r.game.ais.get(c.id); if (ai) names.push(ai.name); }
  const snap = G.snapshot(r.game, null);
  return { online: names.length, names, phase: snap.phase, roundT: snap.roundT, board: snap.board, code: r.code };
}

const server = http.createServer((req, res) => {
  const [route, query] = req.url.split('?');
  // In-app account deletion: Authorization: Bearer <access token> → delete that user (cascades in the DB).
  if (route === '/account/delete' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    A.verifyToken(token).then(async (uid) => {
      if (!uid) { json(res, 401, { error: 'invalid_token' }); return; }
      json(res, (await A.deleteUser(uid)) ? 200 : 502, { ok: true });
    });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' }).end();
    return;
  }
  // Event lobby screen: creates its own room and shows its code and QR.
  if (route === '/rooms/event' && req.method === 'POST') {
    const r = R.createPrivate('event');
    if (!r) { json(res, 503, { error: 'too_many_rooms' }); return; }
    R.touch(r);
    json(res, 200, { code: r.code });
    return;
  }
  // Lobby data. ?room=CODE: that room only; no room: every public room together (round state of the busiest).
  if (route === '/lobby') {
    const code = new URLSearchParams(query || '').get('room');
    if (code) {
      const r = R.rooms.get(code);
      if (!r || r.kind === 'public') { json(res, 404, { error: 'not_found' }); return; }
      R.touch(r);
      json(res, 200, lobbyOf(r));
      return;
    }
    const pub = [...R.rooms.values()].filter((r) => r.kind === 'public').sort((a, b) => R.humans(b) - R.humans(a));
    const all = pub.map(lobbyOf);
    const top = all[0] || { phase: 'play', roundT: G.CONFIG.round, board: [] };
    json(res, 200, { online: all.reduce((s, l) => s + l.online, 0), names: all.flatMap((l) => l.names), phase: top.phase, roundT: top.roundT, board: top.board, code: null });
    return;
  }
  const f = FILES[route];
  if (!f) { res.writeHead(404).end('not found'); return; }
  fs.readFile(path.join(__dirname, f[0]), (err, body) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' }).end(body);
  });
});

const wss = new WebSocketServer({ server, maxPayload: MAX_HELLO, perMessageDeflate: true });

wss.on('connection', (ws) => {
  if (clients.size >= MAX_SOCKETS) { ws.terminate(); return; }
  const c = { id: null, room: null, userId: null, joining: false, msgs: 0, windowStart: Date.now(), alive: true };
  clients.set(ws, c);
  ws.on('pong', () => { c.alive = true; });
  setTimeout(() => { if (!c.id) ws.terminate(); }, HELLO_TIMEOUT);

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - c.windowStart >= 1000) { c.windowStart = now; c.msgs = 0; }
    if (++c.msgs > MAX_MSGS_PER_SEC) { ws.terminate(); return; }
    if (data.length > (c.id ? 512 : MAX_HELLO)) { ws.terminate(); return; }

    const text = data.toString();
    const m = G.parseInput(text);
    if (!m) return;
    if (m.t === 'hello' && !c.id && !c.joining) {
      // parseInput keeps only known fields, so read the requested room and token from the raw message.
      let want, token;
      try { ({ room: want, token } = JSON.parse(text)); } catch { return; }
      c.joining = true;
      join(ws, c, m, want, token);
    } else if (m.t === 'in' && c.id) {
      G.setInput(c.room.game, c.id, m);
    }
  });

  ws.on('close', () => {
    if (c.room) {
      const ai = c.id && c.room.game.ais.get(c.id);
      // leaving mid-round still saves what was earned (at the takeover screen it was already credited)
      if (ai && c.userId && c.room.game.phase === 'play' && ai.earned > 0) {
        A.creditMatch(c.userId, c.room.code || c.room.id, { earned: ai.earned, deletions: ai.kills, deaths: ai.deaths, placement: null, takeover: false });
      }
      if (c.id) G.removeAI(c.room.game, c.id);
      c.room.clients.delete(ws);
    }
    clients.delete(ws);
  });
  ws.on('error', () => {});
});

// Verify the token (never blocking play for long), then place the player in a room.
async function join(ws, c, m, want, token) {
  const reject = (reason) => { ws.send(JSON.stringify({ t: 'error', reason })); if (reason === 'full') ws.send(JSON.stringify({ t: 'full' })); ws.close(); };
  if (!validRoomRequest(want)) { reject('not_found'); return; }
  c.userId = await A.verifyToken(token);
  const skin = await A.allowedSkin(c.userId, m.skin);
  if (ws.readyState !== ws.OPEN) return;
  if (humans() >= MAX_HUMANS) { reject('full'); return; }
  let room;
  if (want == null || want === 'public') room = R.matchmake();
  else if (want === 'new') room = R.createPrivate('private');
  else room = R.join(want);
  if (room === 'not_found' || room === 'full') { reject(room); return; }
  if (!room) { reject('full'); return; }  // too many rooms open
  const ai = G.addAI(room.game, m.name, { cls: m.cls, skin });
  c.id = ai.id; c.room = room;
  room.clients.set(ws, c);
  room.emptySince = null;
  ws.send(JSON.stringify({ t: 'welcome', id: ai.id, arena: G.CONFIG.arena, packets: G.allPackets(room.game),
    room: room.id, code: room.code, verified: !!c.userId }));
}

// When a round ends, credit every verified player in the room once and tell them what was saved.
function creditRound(r) {
  for (const [ws, c] of r.clients) {
    if (!c.userId || !c.id) continue;
    const res = (r.game.results || []).find((x) => x.id === c.id);
    if (!res || res.earned <= 0) continue;
    A.creditMatch(c.userId, r.code || r.id, res).then((xp) => {
      if (xp > 0 && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'credited', xp }));
    });
  }
}

// 30 Hz: step every room that has people; snapshots on every other tick (15 Hz), every third above 30 people.
// BENCH=1 logs how long each tick takes (simulation + snapshots), every 5 s.
const bench = process.env.BENCH ? { n: 0, sum: 0, max: 0, bytes: 0 } : null;
if (bench) setInterval(() => {
  console.log(`bench humans=${humans()} rooms=${R.rooms.size} tick avg=${(bench.sum / Math.max(1, bench.n)).toFixed(2)}ms max=${bench.max.toFixed(2)}ms out=${(bench.bytes / 5 / 1024).toFixed(0)}KB/s(raw)`);
  bench.n = bench.sum = bench.max = bench.bytes = 0;
}, 5000);

function stepRoom(r) {
  const people = R.humans(r);
  if (!people) return;
  G.step(r.game, TICK);
  if (r.game.phase === 'takeover' && !r.credited) { r.credited = true; creditRound(r); }
  else if (r.game.phase === 'play') r.credited = false;
  if (++r.tick % (people > 30 ? 3 : 2)) return;
  const events = G.drainEvents(r.game);
  const pk = G.drainPackets(r.game);
  for (const [ws, c] of r.clients) {
    if (!c.id || ws.readyState !== ws.OPEN || ws.bufferedAmount > MAX_BUFFERED) continue;
    const snap = G.snapshot(r.game, c.id, G.CONFIG.aoi);
    snap.t = 'snap'; snap.events = G.eventsFor(events, r.game, c.id, G.CONFIG.aoi); snap.pk = pk;
    const out = JSON.stringify(snap);
    if (bench) bench.bytes += out.length;
    ws.send(out);
  }
}

let ticks = 0;
setInterval(() => {
  const t0 = bench ? performance.now() : 0;
  for (const r of R.rooms.values()) stepRoom(r);
  if (++ticks % 30 === 0) R.sweep();  // once a second: close rooms empty for 60 s
  if (bench && humans()) { const dt = performance.now() - t0; bench.n++; bench.sum += dt; bench.max = Math.max(bench.max, dt); }
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
