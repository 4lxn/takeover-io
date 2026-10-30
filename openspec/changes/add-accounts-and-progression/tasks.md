# Tasks

Steps marked **(user)** need Alan: accounts and keys only he can create. Secrets never go in the repo: `.env` is git-ignored, and `.env.example` lists the names.

## 1. Services and setup

- [ ] 1.1 **(user)** Create the Supabase project and enable the Anonymous and Email (OTP code) providers; put `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in a local `.env`; verify `curl $SUPABASE_URL/auth/v1/settings` lists anonymous and email as enabled
- [ ] 1.2 **(user, guided)** Create the Google OAuth client and the Apple Services ID and key, and enable both providers in Supabase with the game's redirect URLs; verify both show as enabled in `/auth/v1/settings`
- [x] 1.3 Add `jose` to `package.json`, vendor the pinned `@supabase/supabase-js` UMD build as `vendor/supabase.js`, add `.env.example`, generate `config.js` (from `.env` locally and in the static-site build), and serve `vendor/supabase.js` and `config.js` from `server.js`; verify `npm install` succeeds and the page loads both files with no console errors

## 2. Database

- [ ] 2.1 Write `supabase/migrations/0001_accounts.sql` (profiles, progression, match_results, the new-user trigger, ON DELETE CASCADE, RLS policies, and the all-time and weekly leaderboard views) and apply it; verify with `curl` using the anon key that a user reads only their own rows, cannot insert or update progression, and can read both leaderboards
- [ ] 2.2 Add the RPCs `credit_match` (service role only, capped at 3000 per round), `credit_single` (600 per match, 1500 per UTC day), `import_local_progress` (once, capped at 6000) and `set_display_name` (sanitize and blocklist); verify with `curl` the spec scenarios: 1400 + 500 credits only 100, a second import does nothing, a 5000-XP round credits 3000, a blocked name is rejected

## 3. Rooms on the server

- [x] 3.1 Move the room logic into `rooms.js`: a Map of rooms, each with its own `createGame`, clients, bots, events and snapshots, all stepped by one 30 Hz loop; `server.js` routes connections to rooms; verify with a `node --test` test that two rooms don't see each other's AIs or events
- [x] 3.2 Add matchmaking (the busiest public room with space, capacity 40, otherwise a new room), private rooms with 5-character codes (capacity 120, never matchmade, "not found" and "full" replies) and closing rooms 60 s after the last person leaves; verify with tests for 12 vs 39 people, all rooms full, a wrong code, a 121st person and closing
- [x] 3.3 Serve `/lobby?room=CODE` per room, and have `lobby.html` create or reuse an event room and encode `https://takeover-io.onrender.com/?room=CODE` in its QR; verify in Chrome that a second tab opened from that link appears on the lobby's player list

## 4. Identity and crediting on the server

- [x] 4.1 In `game.js`, track `earned` per AI (the sum of XP gains this round, untouched by deletion and Prompt Injection) and include it in round results; verify with a test that a deleted player keeps their `earned`
- [ ] 4.2 Verify the `hello` token with `jose` against the project's JWKS (cached; on failure, treat as unauthenticated) and validate `token` and `room`; raise `maxPayload` for `hello` only while keeping 512 bytes for other messages; verify that a forged token plays unauthenticated and a real test-account token is attributed
- [ ] 4.3 Credit verified players via `credit_match` at round end and when they leave mid-round, send `{ t: 'credited', xp }`, record takeovers, deletions and deaths, and show only skins unlocked by the account's lifetime XP; verify with a test account that lifetime XP, stats and match history update in Supabase after a round
- [ ] 4.4 Add `POST /account/delete` (bearer token → verify → Supabase admin delete); verify that deleting a test account removes its rows and its leaderboard entry

## 5. Accounts and progression in the client

- [ ] 5.1 Initialize the Supabase client, sign in anonymously on first launch, keep the session between visits, send the token in `hello`, and fall back to "progress not being saved" when Supabase is unreachable; verify that a fresh browser profile gets a guest, and that the game is fully playable with `config.js` removed
- [ ] 5.2 Build the Account panel: upgrade with Google or Apple (linkIdentity) or an email code, sign into an existing account (with the warning at 100 or more guest XP), sign out to a new guest, edit the display name, and delete the account (typing DELETE); verify each flow in Chrome with test accounts, including that an upgrade keeps the guest's XP
- [ ] 5.3 Read lifetime XP, account level and skin unlocks from the account, save the selected skin to the profile, import local progress once, show "+N XP saved" on the takeover screen, and credit single player via `credit_single` with the daily-limit message; verify a localStorage import of 2200 XP and the daily cap message
- [ ] 5.4 Add a profile screen (stats and the last 20 matches) and leaderboards (all-time and weekly top 50, plus your own position); verify that a credited round shows up in history and on the weekly board
- [x] 5.5 Add a rooms UI in the menu (Play online, Create room with the code and a share link, Join with code), opening `?room=` links, and the "not found" and "full" messages; verify with two browsers joining by code and by link

## 6. Privacy and docs

- [x] 6.1 Add `privacy.html` (what is stored, why, retention, how to delete) linked from the menu and the Account panel, and update the README with the Supabase setup, env vars and rooms; verify the links work and the setup steps match `.env.example`

## 7. Deploy and end-to-end check

- [ ] 7.1 **(user, guided)** Set the Render env vars (server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; static site: `SUPABASE_URL`, `SUPABASE_ANON_KEY`) and the static build step that writes `config.js`; deploy the server, then the client; verify that an old cached client still joins a public room and the new client signs in
- [ ] 7.2 End-to-end in production: a guest on a phone plays multiplayer and XP is saved → upgrades with Google → signs in on the laptop and sees the same progress; an event room through lobby and QR; single-player daily cap; account deletion; `npm test` passes

## Workflow follow-up

- Archive the change with `/opsx:archive` after the end-to-end check.
- Next changes in the roadmap: monetization (season pass, shop, ads, Stripe), then the store apps (Capacitor, native sign-in, IAP).
