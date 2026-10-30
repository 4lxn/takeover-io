# Design

## Context

See `proposal.md` (Why, What Changes) for motivation and the roadmap. Requirements are in `specs/player-accounts`, `specs/account-progression`, `specs/game-rooms`, and the deltas to `online-play` and `game-modes`.

The current state that shapes the approach:

- **Client:** plain JavaScript (`index.html`, `game.js`, `assets.js`, …) with no build step. It is served by a Render static site, which rewrites `WS_URL` at build time.
- **Server:** one Node process (`server.js`, depends only on `ws`) running a single shared arena. It accepts any `hello` with a nickname, and nothing persists.
- **Progress:** lifetime XP and the selected skin live in the browser's `localStorage` (`takeover.lifetimeXp`, `takeover.skin`).
- **Single player:** runs entirely in the browser, so the server never sees it.
- **Capacity:** the 100-player benchmark used 28% of one Apple M2 core, about 0.5 cloud vCPU.

## Goals / Non-Goals

**Goals:**

- A player has an account from the first launch, without a sign-up wall, and can upgrade it without losing progress.
- The server, not the client, decides how much account XP a multiplayer round is worth. Single-player credit is bounded.
- Data access is enforced in the database (RLS), not only in our code.
- Many rooms per server, with private codes for events.
- The game stays fully playable when Supabase is slow, down, or unreachable. It just stops crediting progress.

**Non-Goals:**

- Merging two accounts' progress.
- Native SDK sign-in. That arrives with the store-apps change.
- Purchases, entitlements, ads.
- Multiple server instances or regions.
- Friends, chat, ranked play.

## Decisions

### 1. Supabase for auth and data

Supabase gives us hosted Postgres plus Auth, with Apple, Google, email OTP and anonymous users built in. It also gives row-level security and PostgREST RPC calls, and its free tier is enough for launch.

**Alternatives:**

- **Firebase:** a document store, which is awkward for leaderboards, weekly aggregates and the seasons coming in the monetization change.
- **Our own Postgres plus auth on Render:** more work and more security surface for no product gain.

### 2. Guest-first identity on one user id

On first launch the client calls `signInAnonymously()`, so progress is saved from minute one.

Upgrading links an identity to the **same** user id, so no progress merge is ever needed:

- **Apple and Google:** `linkIdentity` (an OAuth redirect on the web).
- **Email:** `updateUser({ email })` plus a 6-digit OTP.

Email uses an OTP code, not a magic link: a code needs no redirect back into a canvas game or, later, an app shell.

When someone signs into an *existing* account from a device holding a guest:

- **Guest below 100 lifetime XP:** its progress is discarded silently.
- **Otherwise:** we ask whether to switch to the existing account and drop the guest progress.

There is no merge in this change.

Native Apple and Google SDKs, through `signInWithIdToken`, come with the store-apps change. The web flow uses Supabase's OAuth redirects.

**Alternative:** require sign-up before playing. Rejected: it adds friction before the first match, and that is where .io games lose players.

### 3. Browser client without a build step

The browser client works like this:

- **Supabase client:** `@supabase/supabase-js` (UMD build, pinned version) is vendored as `vendor/supabase.js` and served by both Render services. There is no CDN dependency at runtime.
- **Configuration:** the URL and anon key go in a small `config.js`. The static-site build writes it, the same way it rewrites `WS_URL` today.
- **No account available:** if Supabase is unreachable, or `config.js` is missing, the client plays exactly as today and skips crediting.

**Alternative:** add a bundler. Rejected: it changes the whole toolchain for one library.

### 4. Data model and RLS

Everything is in `supabase/migrations/0001_accounts.sql`.

| Object | Purpose | Notes |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `display_name` (1–16 chars), `selected_skin`, `created_at` | the owner selects and updates only `display_name` and `selected_skin` |
| `progression` | `lifetime_xp`, `games`, `takeovers`, `deletions`, `deaths`, `best_round_xp`, `single_day`, `single_day_xp`, `imported_local`, `updated_at` | the owner selects; no client writes |
| `match_results` | per-round rows: `mode` (`single` or `multi`), `room`, `xp`, `deletions`, `deaths`, `placement`, `created_at` | the owner selects; indexed `(user_id, created_at desc)` and `(created_at)` |
| `leaderboard_all_time` | view: top 50 by `lifetime_xp`, with `display_name` | readable by anon |
| `leaderboard_weekly` | view: top 50 by the sum of `match_results.xp` over the last 7 days | readable by anon |

- A trigger on `auth.users` insert creates the `profiles` and `progression` rows.
- All tables `ON DELETE CASCADE` from `auth.users`.
- Clients never insert. Every write goes through the RPCs below.

### 5. Crediting XP

**Multiplayer:**

- `game.js` keeps `earned` per AI: the sum of positive XP gains this round. Deletion and Prompt Injection never reduce it.
- The server credits each signed-in player at round end, and when they leave mid-round.
- It calls `credit_match(user_id, mode, room, xp, deletions, deaths, placement, takeover)`. This is `SECURITY DEFINER`, callable only with the service role, with a plausibility cap of 3000 XP per round.

**Single player:** the browser calls `credit_single(xp, deletions, deaths, placement, takeover)` with the user's JWT. The function clamps the XP:

- to 600 per match;
- to 1500 per UTC day, using `single_day` and `single_day_xp`.

**Accepted trade-off:** a modified client can still farm up to the daily cap. The cap makes that worth little.

**Alternative:** run single player on the server. Rejected: it would cost server CPU for every solo player and break offline play.

### 6. Account level, skins and import

- **Account level:** `floor(sqrt(lifetime_xp / 100)) + 1`, which gives 100 → L2, 400 → L3, 2500 → L6, 10000 → L11. It grows quickly at first, then slows.
- **Skin tiers:** the current thresholds stay `[0, 150, 400, 800, 1300, 2000, 3000, 4200, 6000]`, but are now read from `progression.lifetime_xp`.
- **Selected skin:** `selected_skin` lives in the profile. The server validates it against the tier when the client sends it in `hello`.
- **One-time import:** `import_local_progress(xp)` adds `min(xp, 6000)` to the account, once, guarded by `imported_local`. 6000 is the top skin tier, so nobody loses a skin they earned.

### 7. The server verifies identity, never trusts it

1. The client sends `token` in `hello`.
2. The server verifies it with `jose` against the project's JWKS (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`, cached).
3. It takes `sub` as the user id.

A missing or invalid token means the player plays as an unauthenticated guest and earns no account XP.

The server talks to Postgres through PostgREST RPC calls (`fetch`) with `SUPABASE_SERVICE_ROLE_KEY`, set as an env var and never sent to clients. There is no `supabase-js` on the server, and `jose` is the only new dependency.

**Alternative:** trust a user id sent by the client. Rejected: anyone could credit any account.

### 8. Account deletion and display names

**Account deletion:**

1. The client sends `POST /account/delete` to the game server, with the user's bearer token.
2. The server verifies the token.
3. It calls the Supabase admin API to delete the auth user, and the delete cascades to every table.

Deletion is exposed in-app, as Apple requires.

**Display names:**

- trimmed, 1–16 characters, control characters stripped (reusing `sanitizeName`);
- checked against a small blocklist in SQL;
- not unique.

### 9. Rooms in one process

`server.js` holds a `Map` of rooms. Each room has its own `createGame({ mode: 'multi' })` and its own clients, and a single 30 Hz `setInterval` steps every room.

| Room type | Capacity | How you get in |
|---|---|---|
| Public | 40 people | matchmaking: the public room with the most people that still has space, or a new one |
| Private | 120 | a 5-character code (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no look-alikes) |
| Event | 120 | a private code created by the lobby page; its QR encodes `https://takeover-io.onrender.com/?room=CODE` |

- A room closes 60 s after its last person leaves.
- Bots fill each room as today.
- `/lobby?room=CODE` serves per-room lobby data.

**Alternatives:**

- **One process per room:** operational overhead for no gain at this scale.
- **Cloudflare Durable Objects per room:** a natural fit later, but it means rewriting the server for a different runtime.

Horizontal scaling and regions are deferred. One Render Standard instance (1 CPU) should hold roughly 150–200 humans.

### 10. Protocol

| Message | Fields | Validation |
|---|---|---|
| `hello` | `t`, `name`, `cls`, `skin`, `token?`, `room?` | `token`: string ≤ 4096 chars; `room`: `public`, `new`, or `/^[A-Z2-9]{5}$/` |
| `welcome` | adds `room`, and `code?` for private rooms | — |
| `credited` | `xp` saved after round end | sent to signed-in clients only |

- A `hello` carrying a token is larger than 512 bytes, so `maxPayload` rises to about 6 KB.
- The server keeps the 512-byte limit for every other message type by checking size per message type.
- Old clients without `token` or `room` join a public room as unauthenticated guests.

## Risks / Trade-offs

- [Supabase free-tier limits on database size and auth monthly active users] → Monitor usage in the dashboard. Upgrade to Pro when needed; nothing in the design depends on the tier.
- [Fetching the JWKS fails or Supabase is down] → Treat the player as unauthenticated and retry the fetch later. Never block joining or playing.
- [Guest accounts piling up] → A scheduled cleanup deletes guests idle for more than 90 days with under 100 lifetime XP.
- [Abuse of single-player credit] → Per-match and daily caps in SQL, plus a per-user rate limit on the RPC.
- [Personal data before the store apps] → Ship a privacy policy page and working in-app deletion in this change. Both are prerequisites for App Store and Play review.
- [One instance is a single bottleneck and point of failure] → Rooms are independent, so sharding rooms across instances is the next step when needed. A restart only interrupts current rounds; accounts are unaffected.
- [Credit lost if the server restarts mid-round] → Accepted. At most one round of XP per player is lost.

## Migration Plan

1. **The user sets up the services:**
   - creates the Supabase project;
   - enables the Anonymous, Email (OTP), Google and Apple providers;
   - creates the Google OAuth client and the Apple Services ID and key.
2. **Run the migration:** `supabase/migrations/0001_accounts.sql`.
3. **Render env vars:**
   - on the server: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`;
   - on the static site, for `config.js`: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. **Deploy the server first.** Old clients keep working as unauthenticated guests in public rooms.
5. **Deploy the client.**

**Rollback:** redeploy the previous commit of each service. The database stays, and unauthenticated play is unaffected.

## Open Questions

- The exact display-name blocklist and the privacy policy wording can be settled during implementation without changing this design.
