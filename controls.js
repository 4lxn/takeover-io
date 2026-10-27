// takeover.io controls: rebindable keys, a controls / how-to-play modal, and custom single-player settings.
// Plain browser script: defines window.Controls and window.Settings. DOM is built lazily, text via textContent.
(function (root) {
  'use strict';

  const hasDom = typeof document !== 'undefined' && document && typeof document.createElement === 'function';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- key bindings ----------
  const DEFAULT_KEYS = {
    dash: ['Shift', 'Mouse2'], useItem: [' '], pick1: ['1'], pick2: ['2'], pick3: ['3'],
    pause: ['p', 'Escape'], mute: ['m'], menu: ['q'],
  };
  const ACTION_NAMES = {
    dash: 'Dash (i-frames)', useItem: 'Use item', pick1: 'Pick card 1', pick2: 'Pick card 2', pick3: 'Pick card 3',
    pause: 'Pause (single player)', mute: 'Mute', menu: 'Back to menu',
  };
  const norm = (k) => String(k).toLowerCase();

  function loadKeys() {
    const keys = clone(DEFAULT_KEYS);
    try {
      const saved = JSON.parse(store.get('takeover.keys'));
      if (saved && typeof saved === 'object') {
        for (const a of Object.keys(DEFAULT_KEYS)) {
          if (Array.isArray(saved[a]) && saved[a].every((k) => typeof k === 'string' && k.length && k.length < 24)) keys[a] = saved[a].slice(0, 3);
        }
      }
    } catch {}
    return keys;
  }
  let bindings = loadKeys();
  const saveKeys = () => store.set('takeover.keys', JSON.stringify(bindings));

  // ---------- touch movement mode (phones and tablets) ----------
  const TOUCH_MODES = { joystick: 'Joystick (left thumb)', follow: 'Follow finger' };
  const isTouch = hasDom && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let touchMode = TOUCH_MODES[store.get('takeover.touchMode')] ? store.get('takeover.touchMode') : 'joystick';

  // A KeyboardEvent → its key; a mouse/pointer event → 'Mouse<button>'.
  function codeOf(e) {
    if (!e) return '';
    if (typeof e.key === 'string' && e.key) return e.key;
    if (typeof e.button === 'number') return 'Mouse' + e.button;
    return '';
  }

  function keyLabel(k) {
    if (k === ' ') return 'Space';
    if (k === 'Mouse0') return 'Left click';
    if (k === 'Mouse1') return 'Middle click';
    if (k === 'Mouse2') return 'Right click';
    if (/^Mouse\d$/.test(k)) return 'Mouse ' + k.slice(5);
    if (k === 'Escape') return 'Esc';
    if (k.startsWith('Arrow')) return k.slice(5) + ' arrow';
    return k.length === 1 ? k.toUpperCase() : k;
  }

  function assign(action, code) {
    const c = code.length === 1 ? code.toLowerCase() : code;
    for (const a of Object.keys(bindings)) {
      if (a !== action) bindings[a] = bindings[a].filter((k) => norm(k) !== norm(c));
    }
    const list = bindings[action].filter((k) => norm(k) !== norm(c));
    bindings[action] = [c, ...list.slice(1)];
    saveKeys();
  }

  // ---------- modal infrastructure (one modal at a time) ----------
  let modal = null; // { overlay, panel, onClose, capture }

  function ensureStyle() {
    if (!hasDom || document.getElementById('tk-controls-style')) return;
    const st = document.createElement('style');
    st.id = 'tk-controls-style';
    st.textContent = `
      .tk-ov { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; background: rgba(2, 4, 10, .6); }
      .tk-panel { width: min(560px, 94vw); max-height: 90vh; overflow: auto; padding: 18px 20px; border-radius: 10px;
        background: rgba(10, 16, 30, .92); border: 1px solid #24365c; color: #d8e6ff;
        font: 14px/1.4 ui-monospace, Menlo, Consolas, monospace; box-shadow: 0 0 30px rgba(61, 242, 255, .15); }
      .tk-panel h2 { margin: 0 0 4px; color: #3df2ff; font-size: 20px; }
      .tk-panel h3 { margin: 14px 0 6px; color: #3df2ff; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
      .tk-note { opacity: .75; font-size: 12px; margin: 0 0 10px; }
      .tk-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid #16223a; }
      .tk-caps { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
      .tk-kc { padding: 2px 7px; border-radius: 6px; border: 1px solid #3a5280; background: #0b1222; font-size: 12px; white-space: nowrap; }
      .tk-kc.none { opacity: .5; font-style: italic; }
      .tk-btn { padding: 6px 10px; border-radius: 8px; border: 1px solid #24365c; background: #0b1222; color: #d8e6ff; font: inherit; cursor: pointer; }
      .tk-btn:hover { border-color: #3df2ff; }
      .tk-btn.primary { border-color: #3df2ff; background: rgba(61, 242, 255, .14); font-weight: 700; }
      .tk-row.capturing .tk-caps .tk-kc { border-color: #ffe14d; color: #ffe14d; }
      .tk-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; }
      .tk-how { margin: 0; padding-left: 18px; }
      .tk-how li { margin: 2px 0; }
      .tk-slider { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; margin: 10px 0; }
      .tk-slider input { grid-column: 1 / -1; width: 100%; accent-color: #3df2ff; }
      .tk-slider b { color: #3df2ff; }
    `;
    document.head.appendChild(st);
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // While a modal is open, keyboard and mouse events never reach the game. Clicks inside the modal still work.
  function onKey(e) {
    if (!modal) return;
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (modal.capture) {
      e.preventDefault();
      const cap = modal.capture;
      modal.capture = null;
      if (e.key !== 'Escape') assign(cap.action, e.key);
      cap.done();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
  }
  function onMouse(e) {
    if (!modal) return;
    const inside = modal.panel.contains(e.target);
    if (e.type === 'contextmenu') { e.preventDefault(); e.stopPropagation(); return; }
    if (modal.swallowClick && e.type === 'click') { modal.swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
    if (modal.capture && e.type === 'mousedown') {
      e.preventDefault(); e.stopPropagation();
      const cap = modal.capture;
      modal.capture = null;
      modal.swallowClick = true;
      assign(cap.action, 'Mouse' + e.button);
      cap.done();
      return;
    }
    if (!inside) e.stopPropagation();
  }
  const KEY_EVENTS = ['keydown', 'keyup'];
  const MOUSE_EVENTS = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'contextmenu', 'wheel'];

  function openOverlay(build, onClose) {
    if (!hasDom) { if (onClose) onClose(); return; }
    if (modal) closeModal();
    ensureStyle();
    const overlay = el('div', 'tk-ov');
    const panel = el('div', 'tk-panel');
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !modal.capture) closeModal(); });
    modal = { overlay, panel, onClose, capture: null, swallowClick: false };
    build(panel);
    document.body.appendChild(overlay);
    for (const t of KEY_EVENTS) window.addEventListener(t, onKey, true);
    for (const t of MOUSE_EVENTS) window.addEventListener(t, onMouse, true);
  }

  function closeModal() {
    if (!modal) return;
    const m = modal;
    modal = null;
    for (const t of KEY_EVENTS) window.removeEventListener(t, onKey, true);
    for (const t of MOUSE_EVENTS) window.removeEventListener(t, onMouse, true);
    m.overlay.remove();
    if (m.onClose) m.onClose();
  }

  // ---------- controls modal ----------
  function buildControls(panel) {
    panel.appendChild(el('h2', null, 'Controls'));
    panel.appendChild(el('p', 'tk-note', 'Move: mouse, finger or the on-screen joystick (not rebindable). Everything else can be changed.'));
    // Touch movement toggle: always shown, so it can be set up before playing on a phone or tablet.
    const tm = el('div', 'tk-row');
    tm.appendChild(el('span', null, isTouch ? 'Touch movement' : 'Touch movement (phones and tablets)'));
    const tmCaps = el('span', 'tk-caps');
    const tmBtn = el('button', 'tk-btn', 'Switch');
    const showTm = () => { tmCaps.textContent = ''; tmCaps.appendChild(el('span', 'tk-kc', TOUCH_MODES[touchMode])); };
    tmBtn.addEventListener('click', () => { Controls.setTouchMode(touchMode === 'joystick' ? 'follow' : 'joystick'); showTm(); });
    showTm();
    tm.append(tmCaps, tmBtn);
    panel.appendChild(tm);
    const rows = el('div');
    panel.appendChild(rows);

    const render = () => {
      rows.textContent = '';
      for (const action of Object.keys(DEFAULT_KEYS)) {
        const row = el('div', 'tk-row');
        row.appendChild(el('span', null, ACTION_NAMES[action]));
        const caps = el('span', 'tk-caps');
        const list = bindings[action];
        if (list.length) for (const k of list) caps.appendChild(el('span', 'tk-kc', keyLabel(k)));
        else caps.appendChild(el('span', 'tk-kc none', 'unbound'));
        row.appendChild(caps);
        const btn = el('button', 'tk-btn', 'Change');
        btn.addEventListener('click', () => {
          if (!modal || modal.capture) return;
          row.classList.add('capturing');
          caps.textContent = '';
          caps.appendChild(el('span', 'tk-kc', 'Press a key or mouse button… (Esc cancels)'));
          modal.capture = { action, done: render };
        });
        row.appendChild(btn);
        rows.appendChild(row);
      }
    };
    render();

    panel.appendChild(el('h3', null, 'How to play'));
    const how = el('ul', 'tk-how');
    for (const line of [
      'Move with the mouse or your finger. Firing is automatic.',
      'Phones and tablets: left thumb = joystick, right thumb = Dash and Item buttons, tap an enemy to focus it.',
      'Click or tap an enemy to focus it: your shots prefer that target.',
      'Dash through shots for a PERFECT DODGE: the dash is ready again.',
      'Prompt boxes give items: buffs, decoys, and attacks like Hallucination or Session Limit.',
      'Every level gives an upgrade; every 3rd level, a rare augment.',
      'Lead when the 5-minute round ends to take over the datacenter.',
    ]) how.appendChild(el('li', null, line));
    panel.appendChild(how);

    const foot = el('div', 'tk-foot');
    const reset = el('button', 'tk-btn', 'Reset to defaults');
    reset.addEventListener('click', () => { Controls.reset(); if (modal) modal.capture = null; render(); });
    const ok = el('button', 'tk-btn primary', 'Got it');
    ok.addEventListener('click', () => closeModal());
    foot.append(reset, ok);
    panel.appendChild(foot);
  }

  const Controls = {
    get bindings() { return bindings; },
    matches(action, e) {
      const list = bindings[action];
      if (!list) return false;
      const c = norm(codeOf(e));
      return !!c && list.some((k) => norm(k) === c);
    },
    label(action) {
      const list = bindings[action] || [];
      return list.length ? list.map(keyLabel).join(' / ') : 'unbound';
    },
    reset() { bindings = clone(DEFAULT_KEYS); saveKeys(); },
    touchMode() { return touchMode; },
    setTouchMode(m) { if (TOUCH_MODES[m]) { touchMode = m; store.set('takeover.touchMode', m); } },
    openModal(opts = {}) { openOverlay(buildControls, opts.onClose); },
    close: closeModal,
    isOpen() { return !!modal; },
    showFirstRun(onDone) {
      if (!hasDom || store.get('takeover.seenControls')) { if (onDone) onDone(); return; }
      store.set('takeover.seenControls', '1');
      openOverlay(buildControls, onDone);
    },
  };

  // ---------- custom single-player settings ----------
  const DEFAULT_SETTINGS = { roundMin: 5, xpRate: 1, bots: 7, startLevel: 1 };
  const LIMITS = {
    roundMin: { min: 1, max: 10, step: 1, label: 'Round length', fmt: (v) => v + ' min' },
    xpRate: { min: 1, max: 5, step: 0.5, label: 'XP multiplier', fmt: (v) => v + 'x' },
    bots: { min: 0, max: 15, step: 1, label: 'Bots', fmt: (v) => String(v) },
    startLevel: { min: 1, max: 10, step: 1, label: 'Start at level', fmt: (v) => String(v) },
  };
  const clampSetting = (k, v) => {
    const L = LIMITS[k], n = Number(v);
    if (!Number.isFinite(n)) return DEFAULT_SETTINGS[k];
    return Math.min(L.max, Math.max(L.min, Math.round(n / L.step) * L.step));
  };

  function loadSettings() {
    const s = clone(DEFAULT_SETTINGS);
    try {
      const saved = JSON.parse(store.get('takeover.custom'));
      if (saved && typeof saved === 'object') for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in saved) s[k] = clampSetting(k, saved[k]);
    } catch {}
    return s;
  }
  let settings = loadSettings();
  const saveSettings = () => store.set('takeover.custom', JSON.stringify(settings));
  let configDefaults = null;

  function buildSettings(panel) {
    panel.appendChild(el('h2', null, 'Custom game'));
    panel.appendChild(el('p', 'tk-note', 'Single player only. Multiplayer always uses the standard rules.'));
    const box = el('div');
    panel.appendChild(box);
    const render = () => {
      box.textContent = '';
      for (const k of Object.keys(LIMITS)) {
        const L = LIMITS[k];
        const wrap = el('label', 'tk-slider');
        const name = el('span', null, L.label);
        const val = el('b', null, L.fmt(settings[k]));
        const input = el('input');
        input.type = 'range'; input.min = L.min; input.max = L.max; input.step = L.step; input.value = settings[k];
        input.addEventListener('input', () => { settings[k] = clampSetting(k, input.value); val.textContent = L.fmt(settings[k]); saveSettings(); });
        wrap.append(name, val, input);
        box.appendChild(wrap);
      }
    };
    render();
    const foot = el('div', 'tk-foot');
    const reset = el('button', 'tk-btn', 'Reset');
    reset.addEventListener('click', () => { settings = clone(DEFAULT_SETTINGS); saveSettings(); render(); });
    const ok = el('button', 'tk-btn primary', 'Done');
    ok.addEventListener('click', () => closeModal());
    foot.append(reset, ok);
    panel.appendChild(foot);
  }

  const Settings = {
    get() { return clone(settings); },
    isDefault() { return Object.keys(DEFAULT_SETTINGS).every((k) => settings[k] === DEFAULT_SETTINGS[k]); },
    openPanel(opts = {}) { openOverlay(buildSettings, opts.onClose); },
    // Mutates the browser's own G.CONFIG for the next single-player game (multiplayer runs on the server).
    apply(G) {
      const C = G && G.CONFIG;
      if (!C) return;
      if (!configDefaults) configDefaults = { round: C.round, xpRate: C.xpRate == null ? 1 : C.xpRate, singleBots: C.singleBots };
      C.round = settings.roundMin * 60;
      C.xpRate = settings.xpRate;
      C.singleBots = settings.bots;
    },
    restore(G) {
      const C = G && G.CONFIG;
      if (!C || !configDefaults) return;
      C.round = configDefaults.round;
      C.xpRate = configDefaults.xpRate;
      C.singleBots = configDefaults.singleBots;
    },
  };

  root.Controls = Controls;
  root.Settings = Settings;
})(typeof window !== 'undefined' ? window : globalThis);
