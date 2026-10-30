// takeover.io rooms: many independent arenas in one process.
// Public rooms are filled by matchmaking; private and event rooms are joined with a 5-character code.
const G = require('./game.js');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (O/0, I/1)
const CAPACITY = { public: 40, private: 120, event: 120 };
const CLOSE_AFTER = 60000;   // a room closes this long after its last person leaves
const MAX_ROOMS = 200;       // ponytail: global cap against room-creation spam; per-IP limits if it ever matters

function createRooms(opts = {}) {
  const now = opts.now || Date.now;
  const caps = { ...CAPACITY, ...(opts.caps || {}) };
  const rooms = new Map();
  let nextPublic = 1;

  const humans = (r) => { let n = 0; for (const c of r.clients.values()) if (c.id) n++; return n; };
  const capacity = (r) => caps[r.kind];

  function newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!rooms.has(code)) return code;
    }
  }

  function make(kind) {
    if (rooms.size >= MAX_ROOMS) return null;
    const code = kind === 'public' ? null : newCode();
    const r = {
      id: code || 'P' + nextPublic++, code, kind,
      game: G.createGame({ mode: 'multi' }),
      clients: new Map(), tick: 0, emptySince: now(), touchedAt: 0,
    };
    rooms.set(r.id, r);
    return r;
  }

  // The public room with the most people that still has space; a new one when all are full.
  function matchmake() {
    let best = null, bestN = -1;
    for (const r of rooms.values()) {
      if (r.kind !== 'public') continue;
      const n = humans(r);
      if (n < capacity(r) && n > bestN) { best = r; bestN = n; }
    }
    return best || make('public');
  }

  const createPrivate = (kind = 'private') => make(kind === 'event' ? 'event' : 'private');

  function join(code) {
    const r = rooms.get(code);
    if (!r || r.kind === 'public') return 'not_found';
    if (humans(r) >= capacity(r)) return 'full';
    return r;
  }

  // The event lobby page keeps its (possibly still empty) room open by polling it.
  function touch(r) { r.touchedAt = now(); }

  // Close rooms that have had nobody in them for CLOSE_AFTER.
  function sweep() {
    const t = now();
    for (const r of rooms.values()) {
      if (humans(r) > 0) { r.emptySince = null; continue; }
      if (r.emptySince == null) r.emptySince = t;
      if (t - Math.max(r.emptySince, r.touchedAt) >= CLOSE_AFTER) rooms.delete(r.id);
    }
  }

  return { rooms, humans, capacity, matchmake, createPrivate, join, touch, sweep };
}

const validRoomRequest = (room) => room == null || room === 'public' || room === 'new' || (typeof room === 'string' && /^[A-Z2-9]{5}$/.test(room));

module.exports = { createRooms, validRoomRequest, CODE_ALPHABET, CAPACITY, CLOSE_AFTER };
