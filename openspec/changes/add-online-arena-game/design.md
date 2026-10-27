# Design

## Context

Greenfield: the repository holds only `openspec/`. See `proposal.md` (Why, What Changes) for motivation and scope, and the specs under `specs/` for required behavior. Constraints that shape the approach:

- The whole game must be built in under 3 hours by an author new to game development, so every choice favors the fewest moving parts.
- Hosting must be free. Free WebSocket hosts sleep when idle or limit bandwidth.
- Art and audio are produced in parallel by a separate "Designer" session, so the engine cannot wait on them.
- Local tooling: Node.js v26, Chrome and Safari. No build step.

## Goals / Non-Goals

**Goals:**

- One simulation codebase that drives both single player (in the browser) and multiplayer (on the server).
- The server decides every multiplayer outcome; clients send only inputs.
- The engine runs end to end with placeholder shapes before any asset exists.
- Every gameplay number is tunable in one place without touching logic.
- The simulation is testable without a browser or a network.

**Non-Goals:**

- Client-side prediction, lag compensation or rollback.
- Horizontal scaling: one Node process, one shared arena.
- Bundlers, frameworks or TypeScript.
- Persistence of any kind on the server.

## Decisions

### 1. Files and responsibilities

| File | Owns |
|---|---|
| `index.html` | menu, input, rendering, interpolation, audio, HUD, the single-player loop and the WebSocket client |
| `game.js` | pure simulation: no DOM, no timers, no networking. Exposes `createGame`, `addAI`, `removeAI`, `setInput`, `step(dt)`, `snapshot()` and `CONFIG`. Loads as a browser `<script>` and as a Node module via `if (typeof module !== 'undefined') module.exports = ...` |
| `assets.js` | `window.ASSETS`, owned by the Designer session (see decision 6) |
| `server.js` | Node `http` server for the static files, plus the `ws` WebSocket server, the 30 Hz loop and snapshot broadcast |
| `game.test.js` | `node --test` checks of the simulation rules |
| `package.json` | one dependency (`ws`); `"start": "node server.js"` |

The client draws plain placeholder shapes (circles, squares, colored text) whenever `window.ASSETS` or one of its keys is missing, so engine work and art work never block each other.

**Alternatives:** a single inlined HTML holding everything. Rejected: the server could not reuse the simulation without parsing HTML. Phaser or another engine. Rejected: a heavy download, an API to learn, and it would not run inside the server.

### 2. One simulation, two drivers

- **Single player:** `index.html` creates a game with `game.js`, adds the player plus 7 bots, and calls `step(1/30)` from a fixed-step accumulator on `requestAnimationFrame`. Pausing means not stepping.
- **Multiplayer:** `server.js` runs the same `game.js`; the client only sends input and renders snapshots.

The rules exist once, so the two modes cannot drift apart.

**Alternatives:** single player as a private server room. Rejected: it needs the server awake, adds latency and spends bandwidth. Separate client and server rule implementations. Rejected: duplicated rules drift and double the work.

### 3. Netcode: server-authoritative snapshots

- The simulation runs at a fixed 30 Hz on the server and broadcasts snapshots at 15 Hz.
- Each client renders about 100 ms in the past and interpolates between the two snapshots around that time.
- There is no client-side prediction. Movement is slow, in the agar.io style, so a ~100 ms delay is tolerable; prediction is the upgrade path if it feels sluggish.

Messages are JSON over a WebSocket with `permessage-deflate` on.

| Message | Direction | Content |
|---|---|---|
| `hello` | client to server | nickname |
| `in` | client to server | `{ t:'in', ax, ay, use, pick }`. `ax, ay` is the pointer direction clamped to unit length; `use` is a boolean; `pick` is `0 \| 1 \| 2 \| null`. At most ~30 per second |
| `welcome` | server to client | own id, `CONFIG` subset, full packet list |
| `snap` | server to client | AIs, projectiles, boxes, round timer, leaderboard, feed events, data packets as `add`/`del` diffs |

**Alternatives:** Socket.IO. Rejected: an extra client library that adds nothing here. A binary protocol. Rejected: premature; deflate is enough at this scale. Peer-to-peer WebRTC. Rejected: no way to match strangers, and the host could cheat.

### 4. Bots inside the simulation

Bots are normal AIs with `bot: true`. A `botThink(game, ai)` function runs before each step and writes the same input a human would send. Its priorities are:

1. Flee the nearest stronger AI in sight.
2. Otherwise, chase the nearest weaker AI.
3. Otherwise, seek the nearest data packet or prompt box.

Bots use their item as soon as a target is in range and pick a random upgrade card. The same code runs in both modes, and the fill count is computed from the number of humans connected.

**Alternatives:** smarter bots using utility AI or behavior trees. Rejected: over budget.

### 5. Tunables in one `CONFIG`

All numbers live at the top of `game.js`. Starting values, to be tuned by playtesting:

- **Arena and pickups:** arena 3000×3000; 200 data packets; up to 4 prompt boxes, one every 10 s.
- **Round:** round 300 s; takeover screen 10 s; reboot 3 s plus 2 s protection.
- **AI base stats:** HP 100; base speed 220 units/s; base range 380; fire interval 0.5 s; damage 10; regeneration 2 HP/s.
- **Levels:** XP to go from level L to L+1 = `ceil(6 × 1.25^(L−1))`, so each level costs 25% more than the last (L10 at 158 XP total, L15 at 527). Steep on purpose so late levels and upgrades don't come in a flood.
- **Upgrades:**
  - Overclock: −12% fire interval per level.
  - Bigger Model: +4 damage per level.
  - Parallelism: +1 projectile per level, 12° fan.
  - Context Window: +60 range per level.
  - Redundancy: +25 max HP and +1.5 HP/s per level.
  - Low Latency: +25 speed per level.
  - Alignment: −15% debuff duration and −15% Prompt Injection theft per level.
- **Items:**
  - Durations from `items`.
  - Drop weights: GPU Boost 20, Firewall 20, Fork() 15, Hallucination 18, Prompt Injection 17, Session Limit 10 (lowest).
  - Debuff immunity 3 s.
- **Combat and progression depth:** crit 10% for ×2 damage; kill reward 10 XP + half the victim's XP + 10 XP per victim streak kill (shutdown at streak 3+); multi-kill window 5 s; dash 0.22 s at ×3.5 speed, cooldown 3 s; augments every 3rd level with rarity weights silver 60, gold 30, prismatic 10.

**Alternative:** constants scattered through the code. Rejected: balancing would mean hunting through logic.

### 5b. Depth: augments and skill

Stat upgrades on every level keep the floor easy: every pick is a small, safe improvement. Every third level offers an ARAM-Mayhem-style augment instead (Chain Reaction, Overfit, Checkpoint…), which changes how the AI plays and creates build-defining choices.

Firing stays automatic, so a new player is effective at once. The ceiling comes from three skills: dodging shots by movement, timing the dash's invulnerability frames (a perfect dodge refunds the cooldown), and choosing targets with focus to finish low-health AIs or ignore tanks.

**Alternatives:** manual aiming. Rejected: it raises the floor and plays badly on touch screens. More stat upgrades. Rejected: they do not change how a build plays.

### 6. Rendering, assets and audio

**Rendering:**
- Canvas 2D, scaled for `devicePixelRatio`, with `imageSmoothingEnabled = false`.
- The camera centers on the player's AI and is clamped to the arena.
- Each sprite frame is rendered once per player color to an offscreen canvas and then drawn with `drawImage`, which keeps per-frame cost low.

**`assets.js` contract** (agreed with the Designer):
- Keys: `theme`, `playerColors`, `palette`, `sprites{ai, data, promptBox, bullet, ghost, items{…}, upgrades{…}}`, `sfx{…}`, `music{bpm, steps, tracks}`.
- Sprites are palette text grids; `'T'` marks pixels drawn in the player's tint.
- Each sound effect is a WebAudio parameter object (`wave`, `freq[start,end]`, `dur`, `vol`) or an array of them.
- Music is a step-sequencer pattern.

**Audio:**
- Sound effects are oscillators plus a shared noise buffer, with short envelopes.
- Music uses a look-ahead scheduler (`setInterval` with about 100 ms of look-ahead) and runs 25% faster in the last 30 s of a round.
- Audio starts on the first user click, because browsers block autoplay. M toggles mute, stored in `localStorage`.

**Alternative:** audio files and PNG sprite sheets. Rejected: extra files to host and load, and the client would no longer work from plain files.

### 7. Hosting

- A free Render **static site** serves `index.html`, `game.js` and `assets.js`. It is always on and served from a CDN, so single player loads instantly.
- A free Render **web service** runs `server.js`. Per third-party roundups, it sleeps after ~15 min idle, takes ~1 min to wake, and has 5 GB/month of bandwidth as of April 2026. Verify on render.com at deploy time.
- The client uses a same-origin `ws://` URL when it is served by `server.js` (local development); otherwise it uses the `WS_URL` constant that points at the web service. The server reads `PORT` from the environment.

**Alternatives:** Cloudflare Durable Objects. Free and always on, but a different runtime; it is the upgrade path if sleeping hurts. Oracle Always Free VM. Rejected: operations burden. One Render web service for everything. Simpler, but single player would also wait for the cold start.

### 8. Security at the trust boundary

Anyone on the internet can send anything to the server, so:

- Every message is checked for type and numeric ranges. Malformed messages are dropped; messages larger than 512 bytes, or more than ~60 messages per second, disconnect the client.
- Nicknames have control characters stripped and are clamped to 16 characters.
- Positions, XP, damage and outcomes are computed only by the server.
- Nicknames are drawn with canvas `fillText`, never inserted as HTML, so there is no injection path.
- The server accepts at most 20 humans and refuses extra connections with a "datacenter full" message.

## Risks / Trade-offs

- [The Render web service sleeps, so the first multiplayer join waits ~1 min] → Single player stays instant on the static site; the client shows "Waking up the datacenter…" and times out after 90 s with a hint to play single player. Durable Objects is the upgrade path.
- [Bandwidth cap of 5 GB/month] → 15 Hz snapshots, `permessage-deflate`, packets sent as diffs, rounded numbers. Estimate about 15–20 KB/s per connected player before compression. Watch usage in the Render dashboard.
- [The 3-hour budget runs over] → Build in the task order, with a playable core first. Cut in this order: music, Fork(), rounds (endless arena).
- [Item balance, especially chained Session Limits locking a player] → 3 s immunity to the same debuff, Alignment upgrade, lowest drop weight, short durations.
- [Designer assets arrive late or do not match the contract] → Placeholder rendering for any missing key; the contract is written down here and in the Designer brief.
- [No prediction makes movement feel slightly delayed online] → Acceptable for slow agar-like movement. Interpolation keeps other AIs smooth.
- [One shared arena could become a hot spot] → Fine at 20 humans plus bots in one Node process; the cap holds it there.

## Migration Plan

Greenfield, so there is nothing to migrate.

**Deploy:**
1. Push the repository to GitHub.
2. Create a Render static site and a Render web service, both from the same repository.
3. Set `WS_URL` in `index.html` to the web service URL.
4. Smoke test single player on the static site, and multiplayer with two browsers.

**Rollback:** redeploy the previous commit from the Render dashboard; each service rolls back independently.

## Open Questions

- Final tuning numbers. Change only `CONFIG` after the first playtest.
- Whether the free bandwidth cap is enough in practice. Measure after real traffic.
