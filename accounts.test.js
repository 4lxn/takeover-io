// Identity and crediting against a fake Supabase: real tokens, forged tokens, round credit, skins, deletion.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { spawn } = require('child_process');
const WS = require('ws');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STUB = 3471, GAME = 3472;
const URL_ = `http://127.0.0.1:${STUB}`;
const USER = '11111111-2222-3333-4444-555555555555';

test('server verifies tokens, credits rounds, guards skins and deletes accounts', { timeout: 60000 }, async () => {
  const good = await generateKeyPair('ES256');
  const evil = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  const sign = (key, sub) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(`${URL_}/auth/v1`).setAudience('authenticated').setSubject(sub).setIssuedAt().setExpirationTime('1h').sign(key);

  const calls = [];
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null, auth: req.headers.authorization });
      if (req.url === '/auth/v1/.well-known/jwks.json') return res.end(JSON.stringify({ keys: [jwk] }));
      if (req.url === '/rest/v1/rpc/credit_match') return res.end(String(Math.min(JSON.parse(body).p_xp, 3000)));
      if (req.url.startsWith('/rest/v1/progression')) return res.end(JSON.stringify([{ lifetime_xp: 500 }]));
      if (req.method === 'DELETE' && req.url.startsWith('/auth/v1/admin/users/')) return res.end('{}');
      res.writeHead(404).end();
    });
  }).listen(STUB);

  const game = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(GAME), SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: 'service-test', ROUND_SECONDS: '6' },
  });
  try {
    await sleep(1200);
    // a client that steers to the nearest data packet, so it earns XP during the round
    const join = (hello) => new Promise((resolve) => {
      const ws = new WS(`ws://127.0.0.1:${GAME}`);
      const st = { ws, welcome: null, credited: null, me: null, packets: new Map() };
      ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: 'tester', ...hello })));
      ws.on('message', (d) => {
        const m = JSON.parse(d);
        if (m.t === 'welcome') { st.welcome = m; for (const [id, x, y] of m.packets) st.packets.set(id, { x, y }); resolve(st); }
        if (m.t === 'credited') st.credited = m.xp;
        if (m.t === 'snap') {
          for (const [id, x, y] of m.pk.add) st.packets.set(id, { x, y });
          for (const id of m.pk.del) st.packets.delete(id);
          st.me = m.ais.find((a) => a.id === st.welcome.id) || st.me;
          if (st.me) {
            let best = null, bd = Infinity;
            for (const p of st.packets.values()) { const d2 = (p.x - st.me.x) ** 2 + (p.y - st.me.y) ** 2; if (d2 < bd) { bd = d2; best = p; } }
            if (best) { const dx = best.x - st.me.x, dy = best.y - st.me.y, l = Math.hypot(dx, dy) || 1; ws.send(JSON.stringify({ t: 'in', ax: +(dx / l * 0.99).toFixed(3), ay: +(dy / l * 0.99).toFixed(3) })); }
          }
        }
      });
    });

    const real = await join({ token: await sign(good.privateKey, USER), room: 'new', skin: 'overlord' });
    const forged = await join({ token: await sign(evil.privateKey, USER), room: real.welcome.code });
    assert.strictEqual(real.welcome.verified, true, 'a valid token is verified');
    assert.strictEqual(forged.welcome.verified, false, 'a forged token is not');

    await sleep(500);
    assert.strictEqual(real.me && real.me.sk, null, 'a tier-9 skin is hidden for an account with 500 lifetime XP');

    await sleep(7000);  // the 6 s round ends → credit
    const credits = calls.filter((c) => c.url === '/rest/v1/rpc/credit_match');
    assert.strictEqual(credits.length, 1, 'exactly one credit: the verified player only');
    assert.strictEqual(credits[0].body.p_user, USER);
    assert.ok(credits[0].body.p_xp > 0, 'earned XP is credited');
    assert.strictEqual(credits[0].auth, 'Bearer service-test', 'credits use the service key');
    assert.strictEqual(real.credited, credits[0].body.p_xp, 'the client is told what was saved');

    // leaving mid-round credits what was earned so far
    await sleep(11000);  // takeover screen (10 s) → next round
    await sleep(3000);
    real.ws.close(); forged.ws.close();
    await sleep(800);
    assert.ok(calls.filter((c) => c.url === '/rest/v1/rpc/credit_match').length >= 2, 'leaving mid-round credits too');

    // account deletion
    const del = await fetch(`http://127.0.0.1:${GAME}/account/delete`, { method: 'POST', headers: { Authorization: `Bearer ${await sign(good.privateKey, USER)}` } });
    assert.strictEqual(del.status, 200);
    assert.ok(calls.some((c) => c.method === 'DELETE' && c.url === `/auth/v1/admin/users/${USER}`));
    const bad = await fetch(`http://127.0.0.1:${GAME}/account/delete`, { method: 'POST', headers: { Authorization: 'Bearer nope' } });
    assert.strictEqual(bad.status, 401);
  } finally {
    game.kill(); stub.close();
  }
});
