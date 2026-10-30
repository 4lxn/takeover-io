// Server-side account helpers: verify Supabase access tokens, credit round results, check skin unlocks,
// delete accounts. Every call fails soft: if Supabase is slow or down, players keep playing unverified.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRemoteJWKSet, jwtVerify } = require('jose');

// Local development reads .env (Render sets real environment variables).
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LEGACY_SECRET = process.env.SUPABASE_JWT_SECRET || '';  // only for projects still on the shared HS256 secret
const enabled = !!(URL_ && SERVICE_KEY);
const TIMEOUT = 3000;

// Skin tiers come from assets.js (it only assigns window.ASSETS), unlocked at these lifetime XP thresholds.
const SKIN_TIERS = [0, 150, 400, 800, 1300, 2000, 3000, 4200, 6000];
let skinTier = {};
try {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'assets.js'), 'utf8'), box);
  for (const [k, s] of Object.entries((box.window.ASSETS || {}).skins || {})) skinTier[k] = s.tier;
} catch {}

const jwks = URL_ ? createRemoteJWKSet(new URL(`${URL_}/auth/v1/.well-known/jwks.json`), { cacheMaxAge: 10 * 60 * 1000, timeoutDuration: TIMEOUT }) : null;

// The user id (`sub`) of a valid access token, or null. Never throws.
async function verifyToken(token) {
  if (!URL_ || typeof token !== 'string' || !token || token.length > 4096) return null;
  const opts = { issuer: `${URL_}/auth/v1`, audience: 'authenticated' };
  try {
    const { payload } = await jwtVerify(token, jwks, opts);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    if (!LEGACY_SECRET) return null;
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(LEGACY_SECRET), opts);
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch { return null; }
  }
}

async function rest(pathname, init = {}) {
  const res = await fetch(`${URL_}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT),
    // new-style secret keys (sb_secret_…) go only in `apikey`; legacy service_role JWTs also as a bearer token
    headers: { apikey: SERVICE_KEY, ...(SERVICE_KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${SERVICE_KEY}` }),
      'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${pathname} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Credit one round to an account (the SQL function caps it at 3000). Returns the XP saved, or 0.
async function creditMatch(userId, room, r) {
  if (!enabled || !userId) return 0;
  try {
    const saved = await rest('/rest/v1/rpc/credit_match', {
      method: 'POST',
      body: JSON.stringify({ p_user: userId, p_room: room, p_xp: Math.round(r.earned || 0), p_deletions: r.deletions || 0,
        p_deaths: r.deaths || 0, p_placement: r.placement || null, p_takeover: !!r.takeover }),
    });
    return Number(saved) || 0;
  } catch (e) { console.warn('credit failed:', e.message); return 0; }
}

// The skin a player may show: only one their account has unlocked (unverified players: tier-1 skins only).
async function allowedSkin(userId, skin) {
  if (!skin || !(skin in skinTier)) return null;
  const need = SKIN_TIERS[Math.max(0, Math.min(SKIN_TIERS.length - 1, skinTier[skin] - 1))];
  if (need === 0) return skin;
  if (!enabled || !userId) return null;
  try {
    const rows = await rest(`/rest/v1/progression?user_id=eq.${encodeURIComponent(userId)}&select=lifetime_xp`);
    return rows && rows[0] && rows[0].lifetime_xp >= need ? skin : null;
  } catch { return null; }
}

// Permanently delete an account (cascades to profile, progression and match history).
async function deleteUser(userId) {
  if (!enabled || !userId) return false;
  try { await rest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }); return true; }
  catch (e) { console.warn('delete failed:', e.message); return false; }
}

module.exports = { enabled, verifyToken, creditMatch, allowedSkin, deleteUser, SKIN_TIERS };
