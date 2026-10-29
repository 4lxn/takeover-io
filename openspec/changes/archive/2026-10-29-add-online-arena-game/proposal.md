# Proposal

## Why

We want a complete, small game that people can play in the browser for free, alone or with strangers: `takeover.io`. Every player is a rogue AI inside a datacenter, competing to collect data, upgrade its model and delete other AIs; whoever leads when the round ends takes over the datacenter. The project is empty today, the author has no game-development experience, and the whole game must be buildable in under 3 hours, so the scope is deliberately small and every rule is simple.

## What Changes

- **Two modes** from one menu: **Single player** (you against bot AIs, runs entirely in the browser, no server needed) and **Multiplayer** (one shared online arena with strangers, topped up with bots).
- **Client**: `index.html` (HTML5 canvas, plain JavaScript, no build step, no third-party files) plus `game.js`, the simulation. It draws pixel-art sprites defined in code, plays synthesized music and sound effects, and shows the HUD.
- **Server**: one small Node.js server that runs the same `game.js` for the shared arena, holds one WebSocket per player and serves the client files. In multiplayer, clients only send inputs.
- **Gameplay**: you steer with the mouse or a finger; your AI fires automatically at the nearest enemy. Collect data packets for XP, level up, delete other AIs to take half of their XP, reboot at level 1 when deleted.
- **Rounds**: 5-minute rounds. The AI with the most XP at the end "takes over the datacenter", then everything resets.
- **Upgrades**: every level-up offers 3 of 7 AI-themed upgrades (Overclock, Bigger Model, Parallelism, Context Window, Redundancy, Low Latency, Alignment); combining them makes builds (Swarm, Sniper, Tank, Kiter).
- **Items**: prompt boxes in the arena give one random item, used with Space or a tap: GPU Boost, Firewall, Fork(), Hallucination, Session Limit, Prompt Injection.
- **Bots**: bot AIs fill the arena, so a match never feels empty and single player has opponents.
- **Feedback**: sprites, chiptune music, sound effects, screen shake, particles, floating text, kill feed with AI verbs ("Unit-07 deprecated Qubit").
- **Deploy**: free public URLs on Render: the client as a static site (always on, so single player loads instantly) and the server as a free web service (sleeps when idle; only multiplayer waits for it to wake).

Assumptions (chosen as the simplest version that works; change them before implementing if needed):

- In-game text is in English, to match the AI jargon.
- Bots look like any other player, with AI-style names; that is part of the concept.
- Scores live only for the current round. No accounts, no saved progress.
- Single player uses the same rules, round length and bots as multiplayer, plus pause.

Out of scope: App Store packaging, accounts, persistence, chat, multiple rooms, difficulty levels, skins or shop, client-side prediction, anti-cheat beyond server authority.

## Capabilities

### New Capabilities

- `game-modes`: the start menu, single player in the browser, multiplayer online, and returning to the menu.
- `arena-match`: the core loop: arena, movement, data packets, XP and levels, automatic fire, health, deletion and reboot, rounds and the takeover winner, leaderboard and kill feed.
- `upgrades`: level-up choices and the effect of each upgrade.
- `items`: prompt boxes, the item slot, and the effect of each item.
- `bots`: how bot AIs fill the arena and how they behave.
- `online-play`: joining the shared arena, capacity, disconnects, state updates and validation of untrusted input.
- `game-feedback`: what players see and hear: sprites, HUD, music, sound effects and visual effects.

### Modified Capabilities

None. The project has no existing specs.

## Impact

- New files at the project root: `index.html` (client), `game.js` (simulation, used by both the browser and the server), `server.js` (HTTP + WebSocket), `game.test.js` (checks for the simulation), `package.json`.
- Runtime: Node.js (v26 installed locally) with a single dependency, `ws`.
- Hosting: two free Render services (static site + web service); needs the user to create a Render account and connect the repository once.
- Network: the server accepts untrusted input from anyone on the internet, so it validates every message and decides every outcome itself.
