# Tasks

Time budget: under 3 hours, in this order so a playable game exists as early as possible. If behind schedule, cut in this order: music (6.2), Fork() (4.2), rounds (2.5, endless arena instead).

## 1. Setup (~5 min)

- [x] 1.1 Create `package.json` (dependency `ws`; scripts `start: node server.js`, `test: node --test`) and `.gitignore` with `node_modules`; verify `npm install` succeeds and `npm test` runs
- [x] 1.2 Create skeleton `index.html`, `game.js` (browser global + `module.exports`) and `server.js` serving the static files on `PORT` (default 3000); verify `curl -s -o /dev/null -w '%{http_code}' localhost:3000/` prints 200 and `/game.js` loads

## 2. Core simulation in `game.js` (~30 min)

- [x] 2.1 Add `CONFIG` with the starting values from design.md, plus `createGame`, `addAI`, `removeAI`, `setInput`, `step(dt)` and `snapshot()`, with arena walls and pointer movement; verify with a `game.test.js` test that an AI moves toward its input and never leaves the arena
- [x] 2.2 Add data packets (constant supply), XP, the level curve, size growth and a pending upgrade-choice counter; verify with tests that touching a packet gives +1 XP and respawns it, and that a double level-up queues 2 choices
- [x] 2.3 Add automatic fire at the nearest AI in range, projectiles, damage and immunity to your own shots; verify with tests that an AI fires only when a target is in range and never hits itself
- [x] 2.4 Add deletion (half the XP to the killer, half dropped as packets), the 3 s reboot at level 1 and 2 s of protection; verify with a test that a 40 XP victim gives the killer 20 XP and that a protected AI takes no damage
- [x] 2.5 Add 5-minute rounds, the takeover phase (winner by XP, ties by deletions, 10 s freeze, full reset), leaderboard and feed events in `snapshot()`; verify with a test that drives a round to the end and checks the winner, tie-break and reset
- [x] 2.6 Add `botThink` (flee stronger, chase weaker, seek packets and boxes) and the fill rule (7 bots in single player; total of 8 in multiplayer); verify with tests for 1 human → 7 bots, 3 humans + 5 bots + 1 join → 4 + 4, and 10 humans → 0 bots

## 3. Single player in the browser (~25 min)

- [x] 3.1 Build the start menu: nickname (trimmed, 16 characters, random AI name when empty) and Single player and Multiplayer buttons; verify in Chrome that an empty name becomes "Unit-NN" and a long name is cut
- [x] 3.2 Add the single-player driver: fixed-step 30 Hz loop on `requestAnimationFrame`, pointer and touch input, a camera clamped to the arena, placeholder shapes for AIs, names, health bars, packets and projectiles; verify a match runs in Chrome against 7 bots that move and fire
- [x] 3.3 Add the HUD (countdown, level, XP bar, leaderboard with your own rank, kill feed), pause with P or Escape, and Q or the Menu button back to the menu; verify that pausing freezes the timer and a full 5-minute round reaches the takeover screen (temporarily set the round to 20 s in `CONFIG` to check quickly, then restore it)

## 4. Upgrades and items (~30 min)

- [x] 4.1 In `game.js`, add upgrade choices (3 distinct non-maxed upgrades, a queue, pick 0, 1 or 2) and the 7 upgrade effects with their maximum levels; bots pick at random; verify with tests that Parallelism 2 fires 3 projectiles and that nothing is offered when every upgrade is maxed
- [x] 4.2 In `game.js`, add prompt boxes (max 4, one every 10 s, only with an empty slot), weighted random items, self items (GPU Boost, Firewall, Fork() decoys), homing thrown items (Hallucination, Session Limit, Prompt Injection), Alignment reduction, 3 s immunity, reboot protection and feed lines; bots use items when a target is in range; verify with tests: Prompt Injection 60 → 45 / +15, a chained Session Limit within 3 s has no effect, Firewall blocks damage, "no target" keeps the item
- [x] 4.3 In the client, add the upgrade cards (keys 1, 2, 3 and tap, a badge for queued choices), the owned-upgrade pips, the item slot with Space and a tap button, and placeholder status visuals; verify in Chrome that picking cards changes stats and that each item shows its effect

## 5. Multiplayer (~25 min)

- [x] 5.1 In `server.js`, add the `ws` server with `permessage-deflate`, `maxPayload` 512, `hello` and `welcome`, a 30 Hz step, 15 Hz snapshots with packet add/del diffs, a capacity of 20 with a "full" message, bot fill and instant removal on disconnect; verify with two Chrome tabs that both AIs appear and that closing one removes it within a second
- [x] 5.2 Add pure input validation in `game.js` (`parseInput`, `sanitizeName`) used by the server, plus a per-connection limit of 60 messages per second that closes the connection; verify with tests for invalid JSON, unknown type, `ax/ay` longer than 1, pick 7, and a nickname with line breaks and 40 characters
- [x] 5.3 In the client, add the WebSocket mode: same-origin URL on localhost, otherwise `WS_URL`; "Waking up the datacenter…" with a 90 s timeout back to the menu; the "full" message; rendering 100 ms behind with interpolation; verify two tabs see each other move smoothly and that stopping the server returns the client to the menu with a hint
- [x] 5.4 Write `README.md` with how to run locally (`npm install`, `npm start`, open `localhost:3000`) and how to play; verify the steps work from a fresh clone of the repo

## 6. Assets, sound and effects (~20 min)

- [ ] 6.1 Load `assets.js` from the Designer session (theme, palette grids with the `T` tint, per-color pre-rendered sprites, item and upgrade icons) with a fallback to placeholders for any missing key; verify with the Designer's file and again with `assets.js` renamed (the game must still run)
- [ ] 6.2 Add WebAudio sound effects from `ASSETS.sfx` (own shots only), the music step sequencer with a 25% speed-up in the last 30 s, start on first click, and M or the mute button with `localStorage`; verify by ear and that mute survives a reload
- [x] 6.3 Add the visual effects: screen shake when hit, a deletion particle burst, floating +XP, reboot blinking, a Firewall bubble, a GPU Boost glow, the "Session limit reached" label, and the Hallucination glitch with ghosts on the victim's screen only; verify each one in single player

## 7. Deploy (~20 min, needs the user)

- [x] 7.1 Create a GitHub repository and push (ask the user first: this publishes the code); verify the repository page shows the files
- [x] 7.2 Create a free Render web service (`npm install`, `npm start`), confirming the free-tier limits on render.com first; verify a browser can open the WebSocket at the service URL
- [ ] 7.3 Create a free Render static site for `index.html`, `game.js` and `assets.js`, and set `WS_URL` to the web service; verify single player loads instantly and multiplayer works between a phone and a laptop
- [x] 7.4 Add a "Deploy" section to `README.md` with the two Render services and `WS_URL`; verify it matches what was configured

## 8. Integration check (~15 min)

- [ ] 8.1 Playtest a full round in each mode against the spec scenarios (menu, round and takeover, upgrades, every item, bots, capacity message, mute), tune only `CONFIG`, and run `npm test`; verify all tests pass and no scenario fails

## 9. Depth and game feel (added during apply at the user's request)

- [x] 9.1 In `game.js`, add critical hits, the kill reward (base XP + half + shutdown bounty), kill streaks, multi-kills and announcement events; verify with test 9.1
- [x] 9.2 In `game.js`, add ARAM-Mayhem-style augments every 3rd level with silver, gold and prismatic rarity and the 11 augment effects; verify with test 9.2
- [x] 9.3 In `game.js`, add the dash with i-frames, the perfect-dodge cooldown refund and focus targeting, plus their input validation; verify with test 9.3
- [x] 9.4 In the client, add damage and crit numbers, the "+N" kill popup, the announcer banner, explosions with camera shake and kick, hit sparks, bullet trails, the corrupted-data dissolution and kernel-panic reboot overlay with reassembly, the low-health vignette, rarity-colored augment cards, the dash button and cooldown ring, the focus reticle and the streak bounty aura; verify each in Chrome in single player
- [x] 9.5 Multi-touch joystick, action buttons and mobile layout; verify with synthetic multi-touch in Chrome

## Workflow follow-up

- Archive the change with `/opsx:archive` after the playtest passes.
- Verify the archived result: `openspec/specs/` holds the seven capabilities.
