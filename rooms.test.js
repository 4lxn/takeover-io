// Room rules (game-rooms spec). Run with `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const G = require('./game.js');
const { createRooms, validRoomRequest, CLOSE_AFTER } = require('./rooms.js');

// n fake people in a room (sockets are irrelevant to the room rules).
function fill(r, n) { for (let i = 0; i < n; i++) r.clients.set({}, { id: G.addAI(r.game, 'p' + i).id }); }

test('rooms are isolated: separate AIs and events', () => {
  const R = createRooms();
  const a = R.createPrivate(), b = R.createPrivate();
  assert.notStrictEqual(a.code, b.code);
  const pa = G.addAI(a.game, 'alice'), pb = G.addAI(b.game, 'bob');
  for (let i = 0; i < 30; i++) { G.step(a.game, 1 / 30); G.step(b.game, 1 / 30); }
  const inA = [...a.game.ais.values()], inB = [...b.game.ais.values()];  // ids are per room, so compare objects
  assert.ok(inA.includes(pa) && !inA.includes(pb));
  assert.ok(inB.includes(pb) && !inB.includes(pa));
  const names = (r) => [...r.game.ais.values()].map((x) => x.name);
  assert.ok(!names(a).includes('bob') && !names(b).includes('alice'));
  a.game.events.push({ e: 'feed', text: 'only in A' });
  assert.ok(!G.drainEvents(b.game).some((e) => e.text === 'only in A'));
});

test('matchmaking picks the busiest public room with space, then opens a new one', () => {
  const R = createRooms();
  const a = R.matchmake(); fill(a, 40);            // full
  const b = R.matchmake(); fill(b, 39);            // a was full, so a second room opened
  assert.notStrictEqual(a, b);
  for (const k of [...a.clients.keys()].slice(0, 28)) a.clients.delete(k);  // a drops to 12
  assert.strictEqual(R.humans(a), 12);
  assert.strictEqual(R.matchmake(), b);            // 12 vs 39 → the 39 room
  fill(a, 28); fill(b, 1);                         // both full (40 and 40)
  const c = R.matchmake();
  assert.ok(c !== a && c !== b && c.kind === 'public');
});

test('private codes: unknown code, full room, never matchmade', () => {
  const R = createRooms();
  assert.strictEqual(R.join('ZZZZZ'), 'not_found');
  const p = R.createPrivate();
  assert.match(p.code, /^[A-HJ-NP-Z2-9]{5}$/);
  fill(p, 120);
  assert.strictEqual(R.join(p.code), 'full');
  assert.ok(R.matchmake() !== p);
  assert.ok(validRoomRequest('public') && validRoomRequest('new') && validRoomRequest(undefined) && validRoomRequest('K7XQP'));
  assert.ok(!validRoomRequest('k7xqp') && !validRoomRequest('K7XQ') && !validRoomRequest('K7XQ0') && !validRoomRequest(42));
});

test('rooms close 60 s after the last person leaves', () => {
  let t = 1000;
  const R = createRooms({ now: () => t });
  const p = R.createPrivate();
  fill(p, 1);
  R.sweep();
  for (const k of [...p.clients.keys()]) p.clients.delete(k);  // last person leaves
  R.sweep();                                                       // marks it empty at t
  t += CLOSE_AFTER - 1000; R.sweep();
  assert.strictEqual(R.join(p.code), p);
  t += 2000; R.sweep();
  assert.strictEqual(R.join(p.code), 'not_found');
});
