// Load test + live leaderboard: N simulated players join a takeover.io server and a local page
// shows every player's rank. Usage: node tools/load-dashboard.js <ws-url> [players=100] [minutes=5] [port=3600]
const http = require('http');
const WS = require('ws');
const [url = 'ws://localhost:3000', N = 100, minutes = 5, port = 3600] = process.argv.slice(2);
const CLASSES = ['transformer', 'diffusion', 'agent'];
const bots = [];
let board = [], phase = 'play', roundT = 0, snaps = 0, bytes = 0, rate = { snaps: 0, kb: 0 };

for (let i = 0; i < N; i++) setTimeout(() => {
  const bot = { name: 'Sim-' + String(i).padStart(3, '0'), cls: CLASSES[i % 3], me: null, up: false };
  bots.push(bot);
  const ws = new WS(url);
  let ax = 0, ay = 0;
  ws.on('open', () => {
    bot.up = true;
    ws.send(JSON.stringify({ t: 'hello', name: bot.name, cls: bot.cls }));
    // wander: new heading every ~2 s, sometimes dash or use an item, always take the first card
    const iv = setInterval(() => {
      if (ws.readyState !== 1) return clearInterval(iv);
      if (Math.random() < 0.05) { const a = Math.random() * 6.28; ax = +(Math.cos(a) * 0.99).toFixed(3); ay = +(Math.sin(a) * 0.99).toFixed(3); }
      const m = { t: 'in', ax, ay };
      if (Math.random() < 0.03) m.use = true;
      if (Math.random() < 0.02) m.dash = true;
      if (bot.me && bot.me.choices && bot.me.choices.length) m.pick = 0;
      ws.send(JSON.stringify(m));
    }, 100);
  });
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t !== 'snap') return;
    snaps++; bytes += d.length;
    bot.me = m.me; board = m.board; phase = m.phase; roundT = m.roundT;
  });
  ws.on('close', () => { bot.up = false; });
  ws.on('error', () => {});
}, i * 25);

setInterval(() => { rate = { snaps: snaps / Math.max(1, bots.filter((b) => b.up).length), kb: bytes / 1024 }; snaps = 0; bytes = 0; }, 1000);

function state() {
  const rows = bots.filter((b) => b.me).map((b) => ({ rank: b.me.rank, name: b.name, cls: b.cls, lv: b.me.lv, xp: b.me.xp, dead: b.me.dead > 0, streak: b.me.streak, sim: true }));
  const taken = new Set(rows.map((r) => r.rank));
  for (const [rank, name, xp] of board) if (!name.startsWith('Sim-') && !taken.has(rank)) { rows.push({ rank, name, xp, sim: false }); taken.add(rank); }
  const total = rows.length ? Math.max(...rows.map((r) => r.rank)) : 0;
  for (let r = 1; r <= total; r++) if (!taken.has(r)) rows.push({ rank: r, name: '(human player)', sim: false });
  rows.sort((a, b) => a.rank - b.rank);
  return { rows, phase, roundT, connected: bots.filter((b) => b.up).length, snapsPerSec: rate.snaps, kbPerSec: rate.kb };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>takeover.io · live leaderboard</title><style>
body{margin:0;background:#070a12;color:#d8e6ff;font:14px/1.4 ui-monospace,Menlo,monospace}
header{position:sticky;top:0;background:#0b1222;border-bottom:1px solid #24365c;padding:12px 18px;display:flex;gap:24px;align-items:baseline}
h1{margin:0;font-size:20px;color:#3df2ff}.k{opacity:.65}table{border-collapse:collapse;width:100%;max-width:900px;margin:8px auto}
td,th{padding:4px 10px;text-align:left;border-bottom:1px solid #122038}th{color:#3df2ff;font-weight:600}
tr.human td{color:#ffe14d;font-weight:700;background:rgba(255,225,77,.08)}tr.dead td{opacity:.45}.num{text-align:right}
</style></head><body><header><h1>takeover.io · live leaderboard</h1><span id="meta"></span></header>
<table><thead><tr><th>#</th><th>Name</th><th>Class</th><th class="num">Lv</th><th class="num">XP</th><th>Status</th></tr></thead><tbody id="b"></tbody></table>
<script>const es=new EventSource('/events');es.onmessage=(e)=>{const s=JSON.parse(e.data);
document.getElementById('meta').textContent=s.phase.toUpperCase()+' · '+Math.floor(s.roundT/60)+':'+String(s.roundT%60).padStart(2,'0')+' left · '+s.connected+' sims connected · '+s.snapsPerSec.toFixed(1)+' snapshots/s each · '+s.kbPerSec.toFixed(0)+' KB/s total';
const b=document.getElementById('b');b.textContent='';for(const r of s.rows){const tr=document.createElement('tr');if(!r.sim)tr.className='human';else if(r.dead)tr.className='dead';
for(const v of [r.rank,r.name,r.cls||'',r.lv??'',r.xp??'',r.sim?(r.dead?'rebooting':(r.streak>=3?'streak '+r.streak:'')):'HUMAN']){const td=document.createElement('td');td.textContent=v;tr.append(td);}
tr.children[3].className=tr.children[4].className='num';b.append(tr);}};</script></body></html>`;

http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const iv = setInterval(() => res.write('data: ' + JSON.stringify(state()) + '\n\n'), 500);
    req.on('close', () => clearInterval(iv));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE);
}).listen(port, '127.0.0.1', () => console.log(`live leaderboard on http://localhost:${port} (${N} sims → ${url}, ${minutes} min)`));

setTimeout(() => { console.log('done'); process.exit(0); }, minutes * 60000);
