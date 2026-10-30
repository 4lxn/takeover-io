# takeover.io

You are a rogue AI inside a datacenter. Collect data, upgrade your model, delete the other AIs, and lead when the 5-minute round ends to take over the datacenter. Play alone against bots or online with strangers.

**Play:** https://takeover-io.onrender.com · **Lobby screen for events:** https://takeover-io.onrender.com/lobby.html

## Screenshots

| | |
|---|---|
| ![Menu with classes, difficulty and the animated 3D datacenter](docs/screenshots/01-menu.png) | ![A match: HUD, leaderboard, item slot, prompt boxes and bots](docs/screenshots/02-gameplay.png) |
| **Menu:** classes, difficulty, custom game, controls and skins over a Three.js datacenter. | **A match:** auto-fire, items, upgrades, the crown on the leader and arrows to prompt boxes. |
| ![Augment choice cards with rarity](docs/screenshots/03-augment-cards.png) | ![SHUTDOWN announcement, kill reward popup and explosion](docs/screenshots/04-shutdown-explosion.png) |
| **Augments** every 3rd level: silver, gold or prismatic, build-defining picks. | **Game feel:** SHUTDOWN banner, +XP reward, explosion, damage numbers and corrupted-data debris. |
| ![Kernel-panic reboot screen with a tip](docs/screenshots/05-reboot-screen.png) | ![End-of-round takeover screen with the winner and podium](docs/screenshots/06-takeover.png) |
| **Deleted:** a kernel-panic reboot screen with a progress bar and a gameplay tip. | **Takeover:** the round winner, the podium and the countdown to the next round. |
| ![Lobby screen with a QR code and live player list](docs/screenshots/07-lobby.png) | <img src="docs/screenshots/08-phone-portrait.png" alt="Phone in portrait: joystick, Dash and Item buttons, stacked upgrade cards" width="280"> |
| **Lobby** for live events: a QR to join, players appearing as they connect. | **Phones:** a floating joystick, thumb buttons and stacked upgrade cards. |

## Run locally

```sh
npm install
npm start                 # http://localhost:3000
PORT=3417 npm start       # if port 3000 is taken
npm run dev               # same, restarts the server on every save
npm test                  # simulation rules (node --test)
```

Open the URL, type a nickname (optional) and pick a mode:

- **Single player** runs entirely in your browser against 7 bots. No server needed once the page has loaded.
- **Multiplayer** joins the one shared arena on the server (up to 20 people; bots top it up to 8 AIs).

To test multiplayer locally, open the same URL in two browser tabs.

## How to play

| Input | Action |
|---|---|
| Mouse or finger | your AI moves toward it (firing is automatic) |
| Space / item button | use your item |
| 1, 2, 3 / tap a card | pick an upgrade after leveling up |
| P or Esc | pause (single player) |
| M | mute music and sound |
| Q / Menu | back to the menu |

**Items** (from prompt boxes): GPU Boost (fire twice as fast), Firewall (shield), Fork() (two decoys), Hallucination (target shoots at random and sees ghosts), Session Limit (target frozen), Prompt Injection (steal 25% of the target's XP).

**Upgrades**: Overclock (fire rate), Bigger Model (damage), Parallelism (more projectiles), Context Window (range), Redundancy (health and regen), Low Latency (speed), Alignment (resist debuffs).

## Files

| File | What |
|---|---|
| `index.html` | client: menu, rendering, HUD, audio, single-player loop, WebSocket client |
| `game.js` | the simulation; the same file runs in the browser and on the server |
| `assets.js` | sprites, sound effects and music as data (`window.ASSETS`) |
| `server.js` | serves the files and runs the shared arena over WebSockets |
| `game.test.js` | rule tests |

Gameplay numbers (speeds, damage, round length, item durations) all live in `CONFIG` at the top of `game.js`.

## Accounts and progression (Supabase)

Accounts are optional to run the game: with no Supabase settings everything still plays, and progress just isn't saved.

1. Create a Supabase project. In Authentication, enable **anonymous sign-ins**, **Email** (add `{{ .Token }}` to the Magic Link email so it carries a 6-digit code), **Google** and **Apple**.
2. Apply the schema: run `supabase/migrations/0001_accounts.sql` in the SQL editor. It creates profiles, progression, match history, the leaderboard function and the capped credit functions, with row-level security.
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. `npm start` writes the public values into `config.js` for the browser. The service-role key stays on the server.

| Variable | Where | What |
|---|---|---|
| `SUPABASE_URL` | server and static site | the project URL |
| `SUPABASE_ANON_KEY` | static site (`config.js`) | the public key for the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | credits rounds and deletes accounts; never ship it to clients |

How progress is credited: in multiplayer the server credits the XP each verified player earned in a round (at most 3000 per round). Single player is capped at 600 XP per match and 1500 per day, because it runs in the browser. See `openspec/specs/` for the full rules.

## Rooms

`Play online` matchmakes into public rooms (40 people each, opened as needed). `Create room` gives a 5-character code to share; `?room=CODE` links open straight into it, and private rooms hold up to 120. The event lobby (`/lobby.html`) creates its own room, and its QR code joins it.

## Deploy (Render, free)

Two free Render services built from this repository, both redeployed on every push to `main`:

| Service | Type | URL | What |
|---|---|---|---|
| `takeover-io` | static site | https://takeover-io.onrender.com | the game client (always on, CDN) |
| `takeover-io-server` | web service (Node) | https://takeover-io-server.onrender.com | the multiplayer WebSocket server |

- The static site's build command points the client at the server by rewriting `WS_URL` in `index.html` to `wss://takeover-io-server.onrender.com`. Locally `WS_URL` stays empty, so the client uses the same origin.
- The free web service sleeps after about 15 minutes idle. The first multiplayer join then waits about a minute ("Waking up the datacenter…"); single player is never affected.
- `render.yaml` describes the same two services as a Blueprint (New → Blueprint), to recreate them in another account.
