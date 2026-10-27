// Rule checks for game.js. Run with `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const G = require('./game.js');
const { CONFIG } = G;
const DT = 1 / 30;

// A multiplayer game with n humans and no bots, no packets, no boxes.
function setup(n) {
  const g = G.createGame({ mode: 'multi' });
  const ais = [];
  for (let i = 0; i < n; i++) ais.push(G.addAI(g, 'A' + i));
  for (const a of [...g.ais.values()]) if (a.bot) g.ais.delete(a.id);
  g.packets.clear(); g.boxes = []; g.bullets = [];
  ais.forEach((a, i) => { a.x = 300 + i * 1200; a.y = 300 + i * 1200; a.protect = 0; });
  return [g, ...ais];
}
const run = (g, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) G.step(g, DT); };

test('2.1 movement follows input and stays inside the arena', () => {
  const [g, a] = setup(1);
  a.x = 1000; a.y = 1000;
  G.setInput(g, a.id, { ax: 1, ay: 0 });
  run(g, 0.5);
  assert.ok(a.x > 1000);
  a.x = CONFIG.arena - 5; a.y = 5;
  G.setInput(g, a.id, { ax: 0.7, ay: -0.7 });
  run(g, 1);
  const r = G._.radiusOf(a);
  assert.ok(a.x <= CONFIG.arena - r && a.y >= r);
});

test('2.2 packets give XP, keep the supply, and double level-ups queue choices', () => {
  const real = Math.random;
  Math.random = () => 0.99;
  try {
    const g = G.createGame({ mode: 'multi' });
    const a = G.addAI(g, 'me');
    for (const b of [...g.ais.values()]) if (b.bot) g.ais.delete(b.id);
    a.x = 1000; a.y = 1000;
    const p = g.packets.values().next().value;
    p.x = a.x; p.y = a.y;
    G.step(g, DT);
    assert.strictEqual(a.xp, 1);
    assert.ok(!g.packets.has(p.id));
    assert.strictEqual([...g.packets.values()].filter((q) => q.natural).length, CONFIG.packets);
  } finally { Math.random = real; }

  const [g, a] = setup(1);
  G._.addXp(g, a, G.xpForLevel(2));
  assert.strictEqual(a.level, 3);
  assert.strictEqual(a.pending + a.augPending, 2);  // level 2: upgrade, level 3: augment
  G.step(g, DT);
  assert.strictEqual(a.choices.length, 3);
});

test('2.3 automatic fire only with a target in range, never self-damage', () => {
  const [g, a, b] = setup(2);
  a.x = 1000; a.y = 1000; b.x = 1000 + G._.rangeOf(a) - 50; b.y = 1000;
  G.step(g, DT);
  assert.ok(g.bullets.some((x) => x.owner === a.id));

  const [g2, c, d] = setup(2);
  c.x = 300; c.y = 300; d.x = 2700; d.y = 2700;
  G.step(g2, DT);
  assert.strictEqual(g2.bullets.length, 0);
  g2.bullets.push({ id: 999, owner: c.id, color: 0, x: c.x, y: c.y, vx: 0, vy: 0, life: 1, dmg: 50 });
  G.step(g2, DT);
  assert.strictEqual(c.hp, c.maxHp);
});

test('2.4 deletion splits XP, reboots with protection; protected AIs take no damage', () => {
  const [g, k, v] = setup(2);
  v.xp = 40; v.kills = 3;
  G._.deleteAI(g, v, k);
  assert.strictEqual(k.xp, CONFIG.killBase + 20);
  assert.strictEqual(k.kills, 1);
  const dropped = [...g.packets.values()].filter((p) => !p.natural).reduce((s, p) => s + p.v, 0);
  assert.strictEqual(dropped, 20);
  assert.strictEqual(v.level, 1);
  assert.strictEqual(v.xp, 0);
  assert.strictEqual(v.kills, 3);
  assert.ok(v.dead > 0);
  for (let i = 0; i < 200 && v.dead > 0; i++) G.step(g, DT);
  assert.strictEqual(v.dead, 0);
  assert.ok(v.protect > 0);

  const [g2, s, p] = setup(2);
  p.protect = 2;
  g2.bullets.push({ id: 999, owner: s.id, color: 0, x: p.x, y: p.y, vx: 0, vy: 0, life: 1, dmg: 50 });
  G.step(g2, DT);
  assert.strictEqual(p.hp, p.maxHp);
});

test('2.5 round end picks the winner (ties by deletions) and resets everything', () => {
  const [g, a, b, c] = setup(3);
  a.xp = 10; a.kills = 1; b.xp = 10; b.kills = 2; c.xp = 5;
  g.roundT = DT / 2;
  G.step(g, DT);
  assert.strictEqual(g.phase, 'takeover');
  assert.strictEqual(g.winner, b.name);
  for (let i = 0; i < 400 && g.phase === 'takeover'; i++) G.step(g, DT);
  assert.strictEqual(g.phase, 'play');
  for (const x of [a, b, c]) { assert.strictEqual(x.xp, 0); assert.strictEqual(x.level, 1); }
  assert.strictEqual(g.packets.size, CONFIG.packets);
});

test('2.6 bots fill the arena', () => {
  const bots = (g) => [...g.ais.values()].filter((a) => a.bot).length;
  const s = G.createGame();
  G.addAI(s, 'me');
  assert.strictEqual(bots(s), 7);

  const m = G.createGame({ mode: 'multi' });
  for (let i = 0; i < 3; i++) G.addAI(m, 'h' + i);
  assert.strictEqual(bots(m), 5);
  G.addAI(m, 'h3');
  assert.strictEqual(bots(m), 4);
  for (let i = 4; i < 10; i++) G.addAI(m, 'h' + i);
  assert.strictEqual(bots(m), 0);
});

test('4.1 parallelism, maxed upgrades and picking', () => {
  const [g, a, b] = setup(2);
  a.x = 1000; a.y = 1000; b.x = 1200; b.y = 1000;
  a.up.parallelism = 2;
  G.step(g, DT);
  assert.strictEqual(g.bullets.filter((x) => x.owner === a.id).length, 3);

  const [g2, c] = setup(1);
  for (const k of G.UPGRADES) c.up[k] = CONFIG.upgrades[k].max;
  G._.addXp(g2, c, G.xpForLevel(1));
  G.step(g2, DT);
  assert.strictEqual(c.choices.length, 0);
  assert.strictEqual(c.pending, 0);

  const [g3, d] = setup(1);
  G._.addXp(g3, d, G.xpForLevel(1));
  G.step(g3, DT);
  const key = d.choices[1];
  G.setInput(g3, d.id, { ax: 0, ay: 0, pick: 1 });
  G.step(g3, DT);
  assert.strictEqual(d.up[key], 1);
  assert.strictEqual(d.pending, 0);
});

test('4.2 items: prompt injection, session limit immunity, firewall, no target', () => {
  const [g, u, t] = setup(2);
  t.xp = 60; t.level = 3;
  G._.landThrown(g, { item: 'promptInjection' }, u, t);
  assert.strictEqual(t.xp, 45);
  assert.strictEqual(u.xp, 15);
  assert.strictEqual(t.level, 3);

  G._.landThrown(g, { item: 'sessionLimit' }, u, t);
  assert.ok(t.fx.sessionLimit > 0);
  for (let i = 0; i < 200 && t.fx.sessionLimit > 0; i++) G.step(g, DT);
  run(g, 1);
  G._.landThrown(g, { item: 'sessionLimit' }, u, t);
  assert.strictEqual(t.fx.sessionLimit, 0);

  const [g2, s, f] = setup(2);
  f.fx.firewall = 5;
  g2.bullets.push({ id: 999, owner: s.id, color: 0, x: f.x, y: f.y, vx: 0, vy: 0, life: 1, dmg: 50 });
  G.step(g2, DT);
  assert.strictEqual(f.hp, f.maxHp);

  s.item = 'hallucination';
  G.drainEvents(g2);
  G._.useItem(g2, s);
  assert.strictEqual(s.item, 'hallucination');
  assert.ok(G.drainEvents(g2).some((e) => e.e === 'notarget'));
});

test('5.2 input validation and nickname sanitizing', () => {
  assert.strictEqual(G.parseInput('{nope'), null);
  assert.strictEqual(G.parseInput('{"t":"hack"}'), null);
  assert.strictEqual(G.parseInput({ t: 'in', ax: 1, ay: 1 }), null);
  assert.strictEqual(G.parseInput({ t: 'in', ax: 0, ay: 0, pick: 7 }), null);
  assert.deepStrictEqual(G.parseInput('{"t":"in","ax":0.6,"ay":0.8,"use":true,"pick":2}'),
    { t: 'in', ax: 0.6, ay: 0.8, use: true, pick: 2, dash: false, focus: null });
  assert.strictEqual(G.parseInput({ t: 'in', ax: 0, ay: 0, dash: 'yes' }), null);
  assert.strictEqual(G.parseInput({ t: 'in', ax: 0, ay: 0, focus: -3 }), null);
  const n = G.sanitizeName('a\nb\r' + 'x'.repeat(40));
  assert.ok(!/[\r\n]/.test(n));
  assert.strictEqual(n.length, 16);
});

test('9.1 crits, kill bounty, shutdown and announcements', () => {
  const [g, a, b] = setup(2);
  G._.hurt(g, b, 10, a, true);
  assert.strictEqual(b.hp, b.maxHp - 10);
  assert.ok(G.drainEvents(g).some((e) => e.e === 'hit' && e.crit === 1 && e.dmg === 10 && e.by === a.id));
  b.xp = 0; b.streak = 4;
  G._.deleteAI(g, b, a);
  assert.strictEqual(a.xp, CONFIG.killBase + CONFIG.bountyPerStreak * 4);
  const ev = G.drainEvents(g);
  assert.ok(ev.some((e) => e.e === 'deleted' && e.shutdown === 1 && e.by === a.id));
  assert.ok(ev.some((e) => e.e === 'announce' && e.text === 'SHUTDOWN'));
  assert.strictEqual(a.streak, 1);
});

test('9.2 augments: offered at level 3, chain reaction, glass cannon', () => {
  const [g, a, b, c] = setup(3);
  G._.addXp(g, a, G.xpForLevel(1));
  G.step(g, DT);
  G.setInput(g, a.id, { ax: 0, ay: 0, pick: 0 });
  G.step(g, DT);
  G._.addXp(g, a, G.xpForLevel(2) - a.xp);
  G.step(g, DT);
  assert.strictEqual(a.kind, 'aug');
  assert.ok(a.choices.every((k) => G.AUGMENTS[k]));

  G._.applyAugment(a, 'chainReaction');
  b.x = 2000; b.y = 2000; c.x = 2100; c.y = 2000; a.x = 2900; a.y = 2900;
  G._.deleteAI(g, b, a);
  assert.strictEqual(c.hp, c.maxHp - CONFIG.aug.chainDamage);
  assert.ok(G.drainEvents(g).some((e) => e.e === 'explosion'));

  const hp = c.maxHp;
  G._.applyAugment(c, 'glassCannon');
  assert.ok(c.maxHp < hp);
});

test('9.3 dash i-frames make shots pass through and refund the dash; focus picks the target', () => {
  const [g, a, b] = setup(2);
  G.setInput(g, a.id, { ax: 1, ay: 0, dash: true });
  G.step(g, DT);
  assert.ok(a.dashT > 0 && a.dashCd > 0);
  const ahead = a.x + CONFIG.dash.speed * CONFIG.speed * DT;  // where the dashing AI will be next tick
  g.bullets.push({ id: 999, owner: b.id, color: 0, x: ahead, y: a.y, vx: 0, vy: 0, life: 1, dmg: 50 });
  G.step(g, DT);
  assert.strictEqual(a.hp, a.maxHp);
  assert.strictEqual(a.dashCd, 0);
  assert.ok(G.drainEvents(g).some((e) => e.e === 'dodge' && e.id === a.id));

  const [g2, s, near, far] = setup(3);
  s.x = 1000; s.y = 1000; near.x = 1100; near.y = 1000; far.x = 1000; far.y = 1300;
  G.setInput(g2, s.id, { ax: 0, ay: 0, focus: far.id });
  G.step(g2, DT);
  const shot = g2.bullets.find((x) => x.owner === s.id);
  assert.ok(shot && shot.vy > 0 && Math.abs(shot.vx) < 1);
});

test('10.1 classes change stats; Diffusion shots split on hit', () => {
  const g = G.createGame({ mode: 'multi' });
  const d = G.addAI(g, 'd', { cls: 'diffusion' });
  const a = G.addAI(g, 'a', { cls: 'agent' });
  const t = G.addAI(g, 't');
  for (const b of [...g.ais.values()]) if (b.bot) g.ais.delete(b.id);
  g.packets.clear(); g.boxes = []; g.bullets = [];
  assert.strictEqual(t.cls, 'transformer');
  assert.ok(d.maxHp > t.maxHp && a.maxHp < t.maxHp);
  assert.strictEqual(G.parseInput({ t: 'hello', name: 'x', cls: 'wizard' }), null);
  d.protect = a.protect = t.protect = 0;
  d.x = 1000; d.y = 1000; t.x = 1100; t.y = 1000; a.x = 2800; a.y = 2800;
  g.bullets.push({ id: 999, owner: d.id, color: 0, x: t.x, y: t.y, vx: 1, vy: 0, life: 1, dmg: 10 });
  G.step(g, DT);
  assert.ok(g.bullets.filter((b) => b.frag).length >= 2);
});

test('11.1 single-player difficulty changes the bots', () => {
  const easy = G.createGame({ mode: 'single', difficulty: 'easy' });
  const hard = G.createGame({ mode: 'single', difficulty: 'tryhard' });
  G.addAI(easy, 'me'); G.addAI(hard, 'me');
  const eb = [...easy.ais.values()].find((a) => a.bot), hb = [...hard.ais.values()].find((a) => a.bot);
  assert.ok(eb.mods.fire > hb.mods.fire && eb.mods.aimJitter > hb.mods.aimJitter);
  assert.strictEqual(G.createGame({ mode: 'single', difficulty: 'nope' }).difficulty, 'medium');
  // try-hard picks the prismatic augment
  hb.kind = 'aug'; hb.choices = ['vampiric', 'moe', 'overfit'];
  G.step(hard, DT);
  assert.ok(hb.aug.moe || hb.choices.length === 0);
});
