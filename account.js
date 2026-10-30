// takeover.io accounts: guest-first Supabase auth, server-saved progression, leaderboards.
// With no Supabase settings (or Supabase unreachable) everything here is a no-op and the game plays as before.
(function (root) {
  'use strict';

  const cfg = root.TAKEOVER_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && root.supabase && root.supabase.createClient);
  const state = {
    configured, ready: false, offline: !configured, error: null,
    user: null, isGuest: true, email: null, providers: [],
    profile: null, progression: null, level: 1,
  };
  const listeners = [];
  let sb = null;

  const levelOf = (xp) => Math.floor(Math.sqrt((Number(xp) || 0) / 100)) + 1;
  const lifetime = () => Number(state.progression && state.progression.lifetime_xp) || 0;
  const redirectTo = () => (typeof location !== 'undefined' ? location.origin + location.pathname : undefined);
  // A dead Supabase URL can hang a request for a long time; give up and play unsaved instead.
  const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  function emit() {
    state.level = levelOf(lifetime());
    for (const cb of listeners) { try { cb(state); } catch (e) { /* a bad listener never breaks the others */ } }
  }
  function onChange(cb) { listeners.push(cb); }

  function setUser(u) {
    state.user = u;
    state.isGuest = !!(u && u.is_anonymous);
    state.email = (u && u.email) || null;
    state.providers = ((u && u.identities) || []).map((i) => i.provider);
  }

  async function load() {
    if (!sb || !state.user) return;
    const [pr, pg] = await Promise.all([
      sb.from('profiles').select('display_name, selected_skin').eq('id', state.user.id).maybeSingle(),
      sb.from('progression').select('*').eq('user_id', state.user.id).maybeSingle(),
    ]);
    if (pr.error) throw pr.error;
    if (pg.error) throw pg.error;
    state.profile = pr.data;
    state.progression = pg.data;
  }

  // Progress the earlier version kept in localStorage is imported once per account (capped server-side).
  async function importLocalOnce() {
    if (!state.progression || state.progression.imported_local) return 0;
    let local = 0;
    try { local = Math.max(0, parseInt(localStorage.getItem('takeover.lifetimeXp'), 10) || 0); } catch (e) { /* no storage */ }
    if (!local) return 0;
    const { data, error } = await sb.rpc('import_local_progress', { p_xp: local });
    if (error) return 0;
    await load();
    return data || 0;
  }

  async function startGuest() {
    const r = await withTimeout(sb.auth.signInAnonymously());
    if (r.error) throw r.error;
    setUser(r.data.user || (r.data.session && r.data.session.user));
  }

  async function init() {
    if (!configured) { emit(); return state; }
    try {
      sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data } = await withTimeout(sb.auth.getSession());
      if (data && data.session) setUser(data.session.user);
      else await startGuest();
      await withTimeout(load());
      await importLocalOnce();
      state.ready = true; state.offline = false; state.error = null;
      sb.auth.onAuthStateChange((event, session) => {
        if (!session || !session.user) return;
        setUser(session.user);
        load().then(emit, () => {});
      });
    } catch (e) {
      state.ready = false; state.offline = true; state.error = String((e && e.message) || e);
    }
    emit();
    return state;
  }

  async function refresh() {
    if (!state.ready) return state;
    try { await load(); } catch (e) { /* keep the last known values */ }
    emit();
    return state;
  }

  // Access token for the multiplayer hello (supabase-js refreshes it when needed).
  async function token() {
    if (!state.ready) return null;
    try {
      const { data } = await withTimeout(sb.auth.getSession(), 4000);
      return (data && data.session && data.session.access_token) || null;
    } catch (e) { return null; }
  }

  // ---------- upgrading a guest (same user id, progress kept) ----------

  async function upgrade(provider) {
    // Needs "Manual linking" enabled in Supabase Auth settings; redirects to the provider and back.
    const { error } = await sb.auth.linkIdentity({ provider, options: { redirectTo: redirectTo() } });
    return error ? { error: error.message } : { ok: true };
  }

  // mode 'upgrade': attach an email to this guest; mode 'signin': sign into an existing (or new) email account.
  async function emailStart(email, mode) {
    const r = mode === 'upgrade'
      ? await sb.auth.updateUser({ email })
      : await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return r.error ? { error: r.error.message } : { ok: true };
  }

  async function emailVerify(email, code, mode) {
    const { data, error } = await sb.auth.verifyOtp({ email, token: String(code).trim(), type: mode === 'upgrade' ? 'email_change' : 'email' });
    if (error) return { error: error.message };
    if (data && data.user) setUser(data.user);
    await refresh();
    return { ok: true };
  }

  // ---------- signing into a different, existing account ----------

  // A guest with 100+ lifetime XP must confirm first: guest progress is not merged (spec "Guest progress at stake").
  async function signInExisting(method, opts = {}) {
    if (state.isGuest && lifetime() >= 100 && !opts.confirmed) return { needsConfirm: true, xp: lifetime() };
    if (method === 'email') return emailStart(opts.email, 'signin');
    const { error } = await sb.auth.signInWithOAuth({ provider: method, options: { redirectTo: redirectTo() } });
    return error ? { error: error.message } : { ok: true };
  }

  async function signOut() {
    await sb.auth.signOut().catch(() => {});
    state.profile = null; state.progression = null;
    try { await startGuest(); await load(); state.ready = true; state.offline = false; } catch (e) { state.ready = false; state.offline = true; }
    emit();
    return state;
  }

  // ---------- profile ----------

  const NAME_ERRORS = { blocked_name: 'That name is not allowed.', empty_name: 'The name cannot be empty.' };
  async function setName(name) {
    const { data, error } = await sb.rpc('set_display_name', { p_name: name });
    if (error) {
      const key = Object.keys(NAME_ERRORS).find((k) => String(error.message).includes(k));
      return { error: key ? NAME_ERRORS[key] : 'Could not save the name.' };
    }
    if (state.profile) state.profile.display_name = data;
    emit();
    return { ok: true, name: data };
  }

  async function setSkin(key) {
    if (!state.ready) return;
    const { error } = await sb.from('profiles').update({ selected_skin: key || null }).eq('id', state.user.id);
    if (!error && state.profile) state.profile.selected_skin = key || null;
  }

  // Deletion goes through the game server, which holds the admin key (an App Store requirement).
  async function deleteAccount(httpBase) {
    const t = await token();
    if (!t) return { error: 'Not signed in.' };
    try {
      const res = await fetch(`${httpBase}/account/delete`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return { error: `Delete failed (${res.status}).` };
    } catch (e) { return { error: 'Could not reach the server.' }; }
    await signOut();
    return { ok: true };
  }

  // ---------- progression ----------

  async function creditSingle(r) {
    if (!state.ready) return null;
    const { data, error } = await sb.rpc('credit_single', {
      p_xp: Math.max(0, Math.round(r.xp || 0)), p_deletions: r.deletions || 0, p_deaths: r.deaths || 0,
      p_placement: r.placement || null, p_takeover: !!r.takeover,
    });
    if (error) return null;
    await refresh();
    return data;  // { credited, daily_left } or { credited: 0, reason: 'too_soon' }
  }

  async function leaderboard(period) {
    if (!sb) return [];
    const { data, error } = await sb.rpc('leaderboard', { p_period: period === 'week' ? 'week' : 'all' });
    return error ? [] : data || [];
  }

  async function history() {
    if (!state.ready) return [];
    const { data, error } = await sb.from('match_results')
      .select('mode, room, xp, deletions, deaths, placement, takeover, created_at')
      .order('created_at', { ascending: false }).limit(20);
    return error ? [] : data || [];
  }

  root.Account = {
    state, onChange, init, refresh, token, levelOf,
    upgrade, emailStart, emailVerify, signInExisting, signOut,
    setName, setSkin, deleteAccount, creditSingle, leaderboard, history,
  };
})(typeof window !== 'undefined' ? window : globalThis);
