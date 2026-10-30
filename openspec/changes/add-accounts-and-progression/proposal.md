# Proposal

## Why

People liked takeover.io, and we want to publish it as a product on the web, iOS and Android. Today a player is just a nickname: progress (lifetime XP, skin unlocks) lives in one browser's localStorage, is lost on another device, and can be edited by hand. Everything there is one shared arena, which won't hold real traffic or private events. Accounts, server-saved progression and rooms are the foundation the later changes (monetization, store apps) build on, so they come first.

## What Changes

- **Accounts (Supabase Auth)**: every player gets a guest account automatically on first launch, so progress is saved from minute one. They can upgrade it at any time with Sign in with Apple, Google or an email code, keeping their progress, and sign in on other devices. Display name editing, sign-out and in-app account deletion are included.
- **Database (Supabase Postgres)**: profiles, progression, match results and leaderboards, protected by row-level security. The game server writes results with a service key; clients can only read their own data and the public leaderboards.
- **Server-credited progression**: multiplayer XP is credited by the game server at the end of each round, or when the player leaves. Single player runs in the browser, so it earns account XP with a per-match and a daily cap. Lifetime XP drives an account level and the existing skin tiers, which now sync across devices. Local progress from before this change is imported once.
- **Stats, history and leaderboards**: games, takeovers (round wins), deletions, best round, the last 20 matches, plus all-time and weekly top-50 leaderboards in the menu.
- **Rooms**: the server runs many rooms instead of one arena. "Play online" matchmakes into the busiest public room that has space. Players can create a private room and share a 5-character code; the event lobby and its QR code point at a room code. Empty rooms close.
- **BREAKING (protocol)**: `hello` gains an optional access token and room code, and `welcome` names the room. Old clients keep working as unauthenticated guests in a public room.

Roadmap (separate changes, not in this one):
1. **Monetization** (next): season pass with free and premium tracks (the skin tiers become the free track), a cosmetic shop, rewarded ads on web and mobile, and Stripe on web. No pay-to-win.
2. **Store apps**: iOS and Android apps with Capacitor wrapping the same client, native Sign in with Apple and Google, in-app purchases, haptics, push, App Store and Play Store submission.

Out of scope here: purchases, ads, native apps, friends and chat, ranked mode, multiple server regions (rooms run in one server instance for now).

## Capabilities

### New Capabilities

- `player-accounts`: guest accounts, signing in or upgrading with Apple, Google or an email code, staying signed in, sign-out, display names, account deletion, and identity verification in multiplayer.
- `account-progression`: lifetime XP and account level, how multiplayer and single-player XP are credited (with caps), skin unlocks and the selected skin synced to the account, stats, match history, leaderboards, and the one-time import of local progress.
- `game-rooms`: multiple simultaneous rooms, matchmaking into public rooms, private rooms with codes, event rooms for the lobby screen, and closing empty rooms.

### Modified Capabilities

- `online-play`: the single shared arena and its global capacity are replaced by rooms (`game-rooms`).
- `game-modes`: Multiplayer joins a room through matchmaking or a room code instead of the one shared arena.

## Impact

- **New services:** a Supabase project (Auth plus Postgres). Sign in with Apple needs an Apple Developer account (Services ID and key); Google sign-in needs a Google Cloud OAuth client. The user creates these accounts once.
- **Code:** `server.js` (rooms, token verification, crediting results, account deletion endpoint, per-room lobby), `game.js` (track XP earned per round), `index.html` (account UI, profile, leaderboards, room UI, credit flow), a vendored Supabase client file for the browser, SQL migrations under `supabase/migrations/`.
- **Dependencies:** `jose` on the server, to verify Supabase access tokens against the project's public keys. The browser Supabase client is vendored into the repo, not loaded from a CDN.
- **Configuration:** Render env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only) and the public anon key in the client.
- **Privacy:** we start storing personal data (email or Apple/Google identity, display name, play history). That needs a privacy policy page and working account deletion, both of which the store apps will require.
