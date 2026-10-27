# takeover.io: live demo runbook

Play URL: **https://takeover-io.onrender.com** (static site, always on). Multiplayer server: `wss://takeover-io-server.onrender.com` (free Render web service, sleeps after ~15 min idle).

## T-10 min: freeze

- No more pushes to `main`. Every push redeploys the server and drops everyone in multiplayer back to the menu.
- Laptop: Chrome, sound on and not muted (the M key toggles mute and the choice is remembered), zoom 100%.

## T-3 min: wake the server and open the tabs

1. Laptop, tab 1: open the play URL and press **Multiplayer**. If it says "Waking up the datacenter…", wait (up to ~1 min). Leave this tab connected the whole time.
2. Laptop, tab 2: the play URL, for single player.
3. Phone: the same URL. Rotate to landscape. Tap once so audio can start.
4. If you won't show the controls guide live, open it once now so it doesn't pop up on stage.

## Fast showcase settings (single player only; multiplayer ignores them)

Menu → **Custom game**: round **3 min**, XP **×3**, bots **7**, start at level **3**. An augment card appears in the first seconds and upgrades come quickly. Class: **Agent** (2 s dash). Press **Reset** in Custom game afterwards.

## The 5-minute demo

| Time | Do | Say |
|---|---|---|
| 0:00 | Tab 2 → pick **Agent** → **Single player** | "Every player is a rogue AI. You only move; firing is automatic." |
| 0:30 | Press **1/2/3** on the augment cards | "Upgrades every level, augments every 3rd, with silver, gold or prismatic rarity." |
| 1:15 | Follow the yellow arrow to a prompt box, then press **Space** | "Items: Hallucination, Session Limit, Prompt Injection…" |
| 2:00 | **Shift** or right click to dash through shots; click an enemy | "Perfect Dodge resets the dash; focus picks your target." |
| 2:45 | Get a kill | Point out the crit numbers, the gold +XP, the announcer, the explosion |
| 3:15 | Switch to tab 1 (multiplayer); the phone joins | "Same simulation on a Node server, 15 snapshots per second." |
| 4:15 | Let yourself get deleted | Kernel-panic screen: "SEGMENTATION FAULT · REBOOTING" |
| 4:45 | Wait for 0:00, or show it in single player | "TAKEOVER: … controls the datacenter." |

## If something fails

- **Multiplayer stuck on "Waking up…"**: keep talking over single player; it never needs the server. Retry Multiplayer after ~1 min.
- **Wi-Fi drops**: an already-loaded tab keeps playing single player offline.
- **The site itself won't load**: run the local server from the repo, `cd ~/Desktop/projects/cc-mx && PORT=3417 npm start`, then open `http://localhost:3417`. Phones on the same network use `http://<laptop IP>:3417` (`ipconfig getifaddr en0`).
- **No sound**: click the page once (browsers need a click before audio), then check the mute button.
- **Stray players join the public arena**: that's expected; bots and strangers are part of the show.
