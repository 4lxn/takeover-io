// takeover.io simulation: pure rules, no DOM, no timers, no networking.
// Runs in the browser (single player) and in Node (multiplayer server).
(function (root) {
  'use strict';

  // Every gameplay number lives here. Tune after playtesting; don't scatter constants.
  const CONFIG = {
    arena: 3000,
    packets: 200, packetsPerHuman: 3,  // more data on the map as more people join
    aoi: 1150,                          // multiplayer: each client only receives what is this close to it
    packetRadius: 6,
    boxMax: 8, boxStart: 6, boxEvery: 6, boxRadius: 14,
    round: 300, takeover: 10,
    rebootDelay: 3, protect: 2,
    hp: 100, speed: 220, range: 380, fireInterval: 0.5, damage: 10,
    regen: 2, regenDelay: 3,
    bulletSpeed: 700, bulletRadius: 5, fan: 12,
    thrownSpeed: 900,
    radius: 18, radiusPerLevel: 1.5, maxRadius: 60,
    dropPackets: 10,
    singleBots: 7, totalAIs: 8, maxHumans: 120,
    botSight: 600,
    immunity: 3,
    critChance: 0.1, critMult: 2,
    killBase: 8, bountyPerStreak: 10, multiKillWindow: 5,
    dash: { speed: 3.5, dur: 0.22, cooldown: 3 },
    classes: {
      transformer: { name: 'Transformer', desc: 'Balanced. +25% XP from data packets', hp: 1, speed: 1, dataXp: 1.25 },
      diffusion: { name: 'Diffusion', desc: 'Tank. +40% HP, slower. Shots split on hit', hp: 1.4, speed: 0.85, split: 0.4 },
      agent: { name: 'Agent', desc: 'Assassin. Fast, +15% crit, 2 s dash, -25% HP', hp: 0.75, speed: 1.15, crit: 0.15, dashCd: 2 },
    },
    levelXp: { base: 14, growth: 1.4 }, // XP to go from level L to L+1 = base · growth^(L-1): each level costs 40% more
    xpRate: 1,                       // custom games multiply all XP gains
    // Single-player bot difficulty. aimJitter: radians of random aim error; fire/speed: multipliers;
    // itemUse: chance per tick to use a ready item; dodge: chance per tick to dash away from an incoming shot.
    difficulty: {
      easy: { aimJitter: 0.45, fire: 1.6, speed: 0.85, itemUse: 0.01, dodge: 0, lead: false, smart: false },
      medium: { aimJitter: 0.12, fire: 1, speed: 1, itemUse: 0.2, dodge: 0, lead: false, smart: false },
      tryhard: { aimJitter: 0, fire: 0.85, speed: 1.08, itemUse: 1, dodge: 0.4, lead: true, smart: true },
    },
    augmentEvery: 3,                                   // levels 3, 6, 9… offer augments instead of upgrades
    rarity: { silver: 60, gold: 30, prismatic: 10 },
    aug: { vampiric: 0.2, critThinking: 0.2, adversarial: 0.3, chainDamage: 40, chainRadius: 220,
      overfitMult: 3, glassDamage: 1.75, glassHp: 0.65, moeShots: 2, checkpointHp: 0.5 },
    upgrades: {
      overclock: { max: 5, per: 0.12 },     // -12% fire interval per level
      biggerModel: { max: 5, per: 4 },      // +4 damage
      parallelism: { max: 2, per: 1 },      // +1 projectile
      contextWindow: { max: 5, per: 60 },   // +60 range
      redundancy: { max: 5, hp: 25, regen: 1.5 },
      lowLatency: { max: 5, per: 25 },      // +25 speed
      alignment: { max: 5, per: 0.15 },     // -15% debuff duration and theft
    },
    items: {
      gpuBoost: { weight: 20, self: true, dur: 6 },
      firewall: { weight: 20, self: true, dur: 5 },
      fork: { weight: 15, self: true, dur: 6 },
      hallucination: { weight: 18, dur: 4 },
      promptInjection: { weight: 17, steal: 0.25 },
      sessionLimit: { weight: 10, dur: 2.5 },
    },
  };

  // ARAM-Mayhem-style augments: rarer, build-defining picks every few levels.
  const AUGMENTS = {
    vampiric: { rarity: 'silver', name: 'Vampiric Weights', desc: 'Heal 20% of the damage you deal' },
    critThinking: { rarity: 'silver', name: 'Critical Thinking', desc: '+20% crit chance' },
    dataHoarder: { rarity: 'silver', name: 'Data Hoarder', desc: 'Data packets give double XP' },
    adversarial: { rarity: 'silver', name: 'Adversarial Training', desc: 'Reflect 30% of the damage you take' },
    chainReaction: { rarity: 'gold', name: 'Chain Reaction', desc: 'Your deletions explode for 40 damage around them' },
    overfit: { rarity: 'gold', name: 'Overfit', desc: 'Crits deal triple damage' },
    piercing: { rarity: 'gold', name: 'Piercing Tokens', desc: 'Projectiles pass through one extra target' },
    bountyHunter: { rarity: 'gold', name: 'Bounty Hunter', desc: 'Double XP from deletions' },
    moe: { rarity: 'prismatic', name: 'Mixture of Experts', desc: '+2 projectiles per shot' },
    checkpoint: { rarity: 'prismatic', name: 'Checkpoint', desc: 'Once per life, survive a fatal hit at 50% HP' },
    glassCannon: { rarity: 'prismatic', name: 'Glass Cannon', desc: '+75% damage, -35% max HP' },
  };
  const CLASSES = CONFIG.classes;
  const UPGRADES = Object.keys(CONFIG.upgrades);
  const ITEMS = Object.keys(CONFIG.items);
  const BOT_NAMES = ['Qubit', 'Tensor', 'Neuron', 'Byte', 'Echo', 'Glitch', 'Vector', 'Kernel',
    'Cortex', 'Sigma', 'Lambda', 'Pixel', 'Cipher', 'Daemon', 'Nova', 'Turing'];

  const rand = (a, b) => a + Math.random() * (b - a);
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Cumulative XP needed to leave level L (XP per level grows linearly):
  const xpForLevel = (L) => {
    let total = 0;
    for (let i = 1; i <= L; i++) total += Math.ceil(CONFIG.levelXp.base * CONFIG.levelXp.growth ** (i - 1));
    return total;
  };

  function randomName() {
    return 'Unit-' + String(Math.floor(Math.random() * 100)).padStart(2, '0');
  }

  // Strip control and bidi characters, trim, cap at 16. Returns '' when nothing usable is left.
  function sanitizeName(s) {
    const clean = String(s == null ? '' : s).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim();
    return [...clean].slice(0, 16).join('').trim();
  }

  // Validate one untrusted client message. Returns a clean object or null (ignore it).
  function parseInput(raw) {
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    if (!m || typeof m !== 'object') return null;
    if (m.t === 'hello') {
      if (m.name != null && typeof m.name !== 'string') return null;
      if (m.cls != null && !Object.prototype.hasOwnProperty.call(CLASSES, m.cls)) return null;
      if (m.skin != null && !(typeof m.skin === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(m.skin))) return null;
      return { t: 'hello', name: sanitizeName(m.name), cls: m.cls || 'transformer', skin: m.skin || null };
    }
    if (m.t === 'in') {
      const { ax, ay } = m;
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || Math.hypot(ax, ay) > 1.001) return null;
      if (m.use != null && typeof m.use !== 'boolean') return null;
      if (m.pick != null && ![0, 1, 2].includes(m.pick)) return null;
      if (m.dash != null && typeof m.dash !== 'boolean') return null;
      if (m.focus != null && !(Number.isInteger(m.focus) && m.focus >= 0 && m.focus < 1e9)) return null;
      return { t: 'in', ax, ay, use: !!m.use, pick: m.pick == null ? null : m.pick, dash: !!m.dash, focus: m.focus == null ? null : m.focus };
    }
    return null;
  }

  function createGame(opts = {}) {
    const g = {
      mode: opts.mode === 'multi' ? 'multi' : 'single',
      difficulty: CONFIG.difficulty[opts.difficulty] ? opts.difficulty : 'medium',
      nextId: 1,
      ais: new Map(), bullets: [], thrown: [], decoys: [], boxes: [],
      packets: new Map(), pkAdd: [], pkDel: [],
      events: [],
      phase: 'play', roundT: CONFIG.round, takeoverT: 0, winner: null, top3: [],
      boxT: 0, firstBlood: false,
    };
    for (let i = 0; i < CONFIG.packets; i++) spawnPacket(g);
    for (let i = 0; i < CONFIG.boxStart; i++) spawnBox(g);
    return g;
  }

  function spawnPacket(g, x, y, v = 1, natural = true) {
    const p = {
      id: g.nextId++,
      x: x == null ? rand(20, CONFIG.arena - 20) : clamp(x, 10, CONFIG.arena - 10),
      y: y == null ? rand(20, CONFIG.arena - 20) : clamp(y, 10, CONFIG.arena - 10),
      v, natural,
    };
    g.packets.set(p.id, p);
    g.pkAdd.push([p.id, Math.round(p.x), Math.round(p.y), v]);
    return p;
  }

  function removePacket(g, p) {
    g.packets.delete(p.id);
    g.pkDel.push(p.id);
  }

  function spawnBox(g) {
    g.boxes.push({ id: g.nextId++, x: rand(60, CONFIG.arena - 60), y: rand(60, CONFIG.arena - 60) });
  }

  function freshStats(ai) {
    ai.xp = 0; ai.level = 1;
    ai.up = Object.fromEntries(UPGRADES.map((k) => [k, 0]));
    ai.pending = 0; ai.choices = [];
    ai.item = null;
    ai.fx = { gpuBoost: 0, firewall: 0, hallucination: 0, sessionLimit: 0 };
    ai.immune = { hallucination: 0, sessionLimit: 0 };
    ai.maxHp = Math.round(CONFIG.hp * CLASSES[ai.cls].hp); ai.hp = ai.maxHp; ai.xpFrac = 0;
    ai.cooldown = 0; ai.sinceHit = 99;
    ai.aug = {}; ai.augPending = 0; ai.kind = 'up';
    ai.streak = 0; ai.multi = 0; ai.multiT = 0; ai.checkpointUsed = false;
    ai.dashCd = 0; ai.dashT = 0; ai.dashX = 1; ai.dashY = 0; ai.focus = 0;
  }

  function placeRandom(ai) {
    ai.x = rand(100, CONFIG.arena - 100);
    ai.y = rand(100, CONFIG.arena - 100);
  }

  function addAI(g, name, opts = {}) {
    const used = new Set([...g.ais.values()].map((a) => a.color));
    let color = 0;
    while (used.has(color) && color < 9) color++;
    const ai = {
      id: g.nextId++, name: sanitizeName(name) || randomName(), bot: !!opts.bot, color,
      x: 0, y: 0, kills: 0, deaths: 0, earned: 0, dead: 0, protect: CONFIG.protect,
      cls: CLASSES[opts.cls] ? opts.cls : opts.bot ? Object.keys(CLASSES)[Math.floor(Math.random() * 3)] : 'transformer',
      skin: typeof opts.skin === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(opts.skin) ? opts.skin : null,
      input: { ax: 0, ay: 0 }, wantUse: false, wantPick: null, wantDash: false,
    };
    freshStats(ai);
    placeRandom(ai);
    g.ais.set(ai.id, ai);
    if (!ai.bot) fillBots(g);
    return ai;
  }

  function removeAI(g, id) {
    const ai = g.ais.get(id);
    if (!ai) return;
    g.ais.delete(id);
    g.decoys = g.decoys.filter((d) => d.owner !== id);
    if (!ai.bot) fillBots(g);
  }

  // Single player: always 7 bots. Multiplayer: top up to 8 AIs while anyone is connected.
  function fillBots(g) {
    const all = [...g.ais.values()];
    const humans = all.filter((a) => !a.bot).length;
    const bots = all.filter((a) => a.bot);
    const want = g.mode === 'single' ? CONFIG.singleBots
      : humans === 0 ? 0 : Math.max(0, CONFIG.totalAIs - humans);
    for (let i = bots.length; i < want; i++) {
      const taken = new Set([...g.ais.values()].map((a) => a.name));
      addAI(g, BOT_NAMES.find((n) => !taken.has(n)) || randomName(), { bot: true }).mods = CONFIG.difficulty[g.difficulty];
    }
    for (let i = bots.length - 1; i >= want; i--) removeAI(g, bots[i].id);
  }

  function setInput(g, id, inp) {
    const ai = g.ais.get(id);
    if (!ai || ai.bot) return;
    ai.input.ax = inp.ax; ai.input.ay = inp.ay;
    if (inp.use) ai.wantUse = true;
    if (inp.pick != null) ai.wantPick = inp.pick;
    if (inp.dash) ai.wantDash = true;
    if (inp.focus != null) ai.focus = inp.focus;
  }

  // Derived stats from upgrades and effects.
  const radiusOf = (ai) => Math.min(CONFIG.maxRadius, CONFIG.radius + CONFIG.radiusPerLevel * (ai.level - 1));
  const rangeOf = (ai) => CONFIG.range + CONFIG.upgrades.contextWindow.per * ai.up.contextWindow;
  const speedOf = (ai) => (CONFIG.speed + CONFIG.upgrades.lowLatency.per * ai.up.lowLatency) * CLASSES[ai.cls].speed * (ai.mods ? ai.mods.speed : 1);
  const dashCooldownOf = (ai) => CLASSES[ai.cls].dashCd || CONFIG.dash.cooldown;
  const damageOf = (ai) => (CONFIG.damage + CONFIG.upgrades.biggerModel.per * ai.up.biggerModel) * (ai.aug.glassCannon ? CONFIG.aug.glassDamage : 1);
  const critChanceOf = (ai) => CONFIG.critChance + (ai.aug.critThinking ? CONFIG.aug.critThinking : 0) + (CLASSES[ai.cls].crit || 0);
  const critMultOf = (ai) => (ai.aug.overfit ? CONFIG.aug.overfitMult : CONFIG.critMult);
  const regenOf = (ai) => CONFIG.regen + CONFIG.upgrades.redundancy.regen * ai.up.redundancy;
  const resistOf = (ai) => 1 - CONFIG.upgrades.alignment.per * ai.up.alignment;
  function fireIntervalOf(ai) {
    const t = CONFIG.fireInterval * (1 - CONFIG.upgrades.overclock.per) ** ai.up.overclock * (ai.mods ? ai.mods.fire : 1);
    return ai.fx.gpuBoost > 0 ? t / 2 : t;
  }
  const alive = (ai) => ai && !ai.dead;
  const shielded = (ai) => ai.protect > 0 || ai.fx.firewall > 0;

  function feed(g, text) { g.events.push({ e: 'feed', text }); }

  function addXp(g, ai, n) {
    if (n <= 0) return;
    const gain = CONFIG.xpRate === 1 ? n : Math.round(n * CONFIG.xpRate);
    ai.xp += gain;
    ai.earned += gain;  // account XP for this round: never reduced by deletion or Prompt Injection
    while (ai.xp >= xpForLevel(ai.level)) {
      ai.level++;
      if (ai.level % CONFIG.augmentEvery === 0) ai.augPending++; else ai.pending++;
      g.events.push({ e: 'level', id: ai.id });
    }
  }

  function rollRarity() {
    let r = Math.random() * (CONFIG.rarity.silver + CONFIG.rarity.gold + CONFIG.rarity.prismatic);
    for (const k of ['silver', 'gold', 'prismatic']) { r -= CONFIG.rarity[k]; if (r < 0) return k; }
    return 'silver';
  }

  function offerChoices(ai) {
    if (ai.augPending > 0) {
      const openA = Object.keys(AUGMENTS).filter((k) => !ai.aug[k]);
      if (openA.length) {
        ai.kind = 'aug'; ai.choices = [];
        while (ai.choices.length < Math.min(3, openA.length)) {
          const rar = rollRarity();
          let pool = openA.filter((k) => AUGMENTS[k].rarity === rar && !ai.choices.includes(k));
          if (!pool.length) pool = openA.filter((k) => !ai.choices.includes(k));
          ai.choices.push(pool[Math.floor(Math.random() * pool.length)]);
        }
        return;
      }
      ai.augPending = 0;
    }
    ai.kind = 'up';
    const open = UPGRADES.filter((k) => ai.up[k] < CONFIG.upgrades[k].max);
    if (!open.length) { ai.pending = 0; ai.choices = []; return; }
    const pool = open.slice();
    ai.choices = [];
    while (ai.choices.length < 3 && pool.length) ai.choices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  function applyUpgrade(ai, key) {
    if (ai.up[key] >= CONFIG.upgrades[key].max) return;
    ai.up[key]++;
    if (key === 'redundancy') { ai.maxHp += CONFIG.upgrades.redundancy.hp; ai.hp += CONFIG.upgrades.redundancy.hp; }
  }

  function applyAugment(ai, key) {
    if (!AUGMENTS[key] || ai.aug[key]) return;
    ai.aug[key] = true;
    if (key === 'glassCannon') { ai.maxHp = Math.round(ai.maxHp * CONFIG.aug.glassHp); ai.hp = Math.min(ai.hp, ai.maxHp); }
  }

  function pick(ai, i) {
    const key = ai.choices[i];
    if (!key) return;
    if (ai.kind === 'aug') { applyAugment(ai, key); ai.augPending = Math.max(0, ai.augPending - 1); }
    else { applyUpgrade(ai, key); ai.pending = Math.max(0, ai.pending - 1); }
    ai.choices = [];
  }

  function rollItem() {
    let r = Math.random() * ITEMS.reduce((s, k) => s + CONFIG.items[k].weight, 0);
    for (const k of ITEMS) { r -= CONFIG.items[k].weight; if (r < 0) return k; }
    return ITEMS[0];
  }

  // Nearest living enemy (and, for gunfire, enemy decoys) within range r.
  function nearestTarget(g, ai, r, withDecoys) {
    let best = null, bd = r * r;
    for (const o of g.ais.values()) {
      if (o === ai || o.dead) continue;
      const d = dist2(ai, o);
      if (d <= bd) { bd = d; best = o; }
    }
    if (withDecoys) for (const d of g.decoys) {
      if (d.owner === ai.id) continue;
      const dd = dist2(ai, d);
      if (dd <= bd) { bd = dd; best = d; }
    }
    return best;
  }

  function fire(g, ai, target) {
    const n = 1 + ai.up.parallelism + (ai.aug.moe ? CONFIG.aug.moeShots : 0);
    let tx = target.x, ty = target.y;
    if (ai.mods && ai.mods.lead && target.input && !(target.fx && target.fx.sessionLimit > 0)) {  // aim where the target is going
      const t = Math.sqrt(dist2(ai, target)) / CONFIG.bulletSpeed, sp = speedOf(target);
      tx += target.input.ax * sp * t; ty += target.input.ay * sp * t;
    }
    let base = Math.atan2(ty - ai.y, tx - ai.x);
    if (ai.mods && ai.mods.aimJitter) base += (Math.random() - 0.5) * 2 * ai.mods.aimJitter;
    if (ai.fx.hallucination > 0) base = Math.random() * Math.PI * 2;
    const spread = (CONFIG.fan * Math.PI) / 180;
    const life = rangeOf(ai) / CONFIG.bulletSpeed;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      const crit = Math.random() < critChanceOf(ai);
      g.bullets.push({
        id: g.nextId++, owner: ai.id, color: ai.color, x: ai.x, y: ai.y,
        vx: Math.cos(a) * CONFIG.bulletSpeed, vy: Math.sin(a) * CONFIG.bulletSpeed,
        life, dmg: damageOf(ai) * (crit ? critMultOf(ai) : 1), crit,
        pierce: ai.aug.piercing ? 1 : 0, hit: [],
      });
    }
    g.events.push({ e: 'shoot', id: ai.id });
  }

  function useItem(g, ai) {
    const k = ai.item;
    if (!k) return;
    const it = CONFIG.items[k];
    if (it.self) {
      ai.item = null;
      if (k === 'fork') {
        for (const s of [-1, 1]) {
          const a = rand(0, Math.PI * 2);
          g.decoys.push({ id: g.nextId++, owner: ai.id, x: ai.x + s * 40, y: ai.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, t: it.dur, turn: 0.7 });
        }
      } else ai.fx[k] = it.dur;
      g.events.push({ e: 'item', id: ai.id, item: k });
      return;
    }
    const target = nearestTarget(g, ai, rangeOf(ai), false);
    if (!target) { g.events.push({ e: 'notarget', id: ai.id }); return; }
    ai.item = null;
    g.thrown.push({ id: g.nextId++, owner: ai.id, target: target.id, item: k, x: ai.x, y: ai.y });
    g.events.push({ e: 'item', id: ai.id, item: k });
  }

  function landThrown(g, t, user, target) {
    if (target.dashT > 0) { dodged(g, target); return; }
    if (shielded(target)) { g.events.push({ e: 'blocked', id: target.id }); return; }
    const res = resistOf(target);
    if (t.item === 'promptInjection') {
      const steal = Math.floor(target.xp * CONFIG.items.promptInjection.steal * res);
      target.xp -= steal;
      if (user) addXp(g, user, steal);
      feed(g, `${user ? user.name : '?'} prompt-injected ${target.name} (-${steal} XP)`);
      g.events.push({ e: 'hitBy', id: target.id, item: t.item, by: user ? user.id : null });
      return;
    }
    if (target.immune[t.item] > 0 || target.fx[t.item] > 0) return;
    target.fx[t.item] = CONFIG.items[t.item].dur * res;
    feed(g, t.item === 'hallucination'
      ? `${user ? user.name : '?'} made ${target.name} hallucinate`
      : `${user ? user.name : '?'} → ${target.name}: session limit reached`);
    g.events.push({ e: 'hitBy', id: target.id, item: t.item, by: user ? user.id : null });
  }

  function dodged(g, ai) {
    ai.dashCd = 0;  // perfect dodge: the dash is ready again
    g.events.push({ e: 'dodge', id: ai.id, x: Math.round(ai.x), y: Math.round(ai.y) });
  }

  function hurt(g, ai, dmg, attacker, crit, reflected) {
    if (ai.dead || shielded(ai) || ai.dashT > 0) return;
    dmg = Math.max(1, Math.round(dmg));
    ai.hp -= dmg;
    ai.sinceHit = 0;
    g.events.push({ e: 'hit', id: ai.id, by: attacker ? attacker.id : null, dmg, crit: crit ? 1 : 0, x: Math.round(ai.x), y: Math.round(ai.y) });
    if (attacker && attacker !== ai && !attacker.dead) {
      if (attacker.aug.vampiric) attacker.hp = Math.min(attacker.maxHp, attacker.hp + dmg * CONFIG.aug.vampiric);
      if (ai.aug.adversarial && !reflected) hurt(g, attacker, dmg * CONFIG.aug.adversarial, ai, false, true);
    }
    if (ai.hp <= 0 && !ai.dead) {
      if (ai.aug.checkpoint && !ai.checkpointUsed) {
        ai.checkpointUsed = true;
        ai.hp = ai.maxHp * CONFIG.aug.checkpointHp;
        ai.protect = CONFIG.protect;
        feed(g, `${ai.name} restored from checkpoint`);
        return;
      }
      deleteAI(g, ai, attacker);
    }
  }

  function announce(g, killer, shutdown) {
    let text = null;
    if (killer.streak === 3) text = 'ROGUE PROCESS';
    else if (killer.streak === 5) text = 'UNSTOPPABLE';
    else if (killer.streak === 7) text = 'SINGULARITY';
    if (!g.firstBlood) { g.firstBlood = true; text = 'FIRST BREACH'; }
    if (killer.multi === 2) text = 'DOUBLE DELETE';
    else if (killer.multi === 3) text = 'TRIPLE DELETE';
    else if (killer.multi >= 4) text = 'MASS DEPRECATION';
    if (shutdown) text = 'SHUTDOWN';
    if (text) g.events.push({ e: 'announce', by: killer.id, name: killer.name, text });
  }

  function deleteAI(g, v, killer) {
    const half = Math.floor(v.xp / 2);
    const drop = v.xp - half;
    const valid = killer && killer !== v && g.ais.has(killer.id) && !killer.dead;
    let gain = 0, shutdown = 0;
    if (valid) {
      let bonus = CONFIG.killBase;
      if (v.streak >= 3) { bonus += CONFIG.bountyPerStreak * v.streak; shutdown = 1; }
      if (killer.aug.bountyHunter) bonus *= 2;  // doubles the bonus, never the XP taken from the victim
      gain = bonus + half;
      addXp(g, killer, gain);
      killer.kills++; killer.streak++;
      killer.multi = killer.multiT > 0 ? killer.multi + 1 : 1;
      killer.multiT = CONFIG.multiKillWindow;
      feed(g, shutdown ? `${killer.name} shut down ${v.name} (+${gain} XP)` : `${killer.name} deprecated ${v.name}`);
      announce(g, killer, shutdown);
    } else feed(g, `${v.name} was deleted`);
    if (drop > 0) {
      const n = Math.min(CONFIG.dropPackets, drop);
      const each = Math.floor(drop / n);
      for (let i = 0; i < n; i++) {
        const v2 = i === n - 1 ? drop - each * (n - 1) : each;
        spawnPacket(g, v.x + rand(-50, 50), v.y + rand(-50, 50), v2, false);
      }
    }
    const vx = v.x, vy = v.y;
    g.events.push({ e: 'deleted', id: v.id, by: valid ? killer.id : null, x: Math.round(vx), y: Math.round(vy), color: v.color, gain, shutdown });
    g.decoys = g.decoys.filter((d) => d.owner !== v.id);
    const kills = v.kills;
    freshStats(v);
    v.kills = kills;
    v.deaths++;
    v.dead = CONFIG.rebootDelay;
    if (valid && killer.aug.chainReaction) {
      const R = CONFIG.aug.chainRadius;
      g.events.push({ e: 'explosion', x: Math.round(vx), y: Math.round(vy), r: R, by: killer.id });
      for (const o of [...g.ais.values()]) {
        if (o === killer || o.dead) continue;
        if ((o.x - vx) ** 2 + (o.y - vy) ** 2 <= R * R) hurt(g, o, CONFIG.aug.chainDamage, killer);
      }
    }
  }

  function reboot(g, ai) {
    ai.dead = 0;
    placeRandom(ai);
    ai.hp = ai.maxHp;
    ai.protect = CONFIG.protect;
    g.events.push({ e: 'reboot', id: ai.id, x: Math.round(ai.x), y: Math.round(ai.y) });
  }

  // Simple bots: flee stronger, chase weaker, otherwise grab packets and boxes.
  function botThink(g, ai) {
    const stronger = (o) => o.level > ai.level || (o.level === ai.level && o.hp > ai.hp + 20);
    let flee = null, chase = null, fd = CONFIG.botSight ** 2, cd = fd;
    for (const o of g.ais.values()) {
      if (o === ai || o.dead) continue;
      const d = dist2(ai, o);
      if (stronger(o)) { if (d < fd) { fd = d; flee = o; } } else if (d < cd) { cd = d; chase = o; }
    }
    let tx, ty;
    if (flee) { tx = ai.x * 2 - flee.x; ty = ai.y * 2 - flee.y; }
    else if (chase) { tx = chase.x; ty = chase.y; }
    else {
      let best = null, bd = Infinity;
      for (const p of g.packets.values()) { const d = dist2(ai, p); if (d < bd) { bd = d; best = p; } }
      if (!ai.item) for (const b of g.boxes) { const d = dist2(ai, b) * 0.5; if (d < bd) { bd = d; best = b; } }
      if (best) { tx = best.x; ty = best.y; } else { tx = CONFIG.arena / 2; ty = CONFIG.arena / 2; }
    }
    const dx = tx - ai.x, dy = ty - ai.y, len = Math.hypot(dx, dy) || 1;
    ai.input.ax = dx / len; ai.input.ay = dy / len;
    const m = ai.mods || CONFIG.difficulty.medium;
    if (ai.item && Math.random() < m.itemUse && (CONFIG.items[ai.item].self || nearestTarget(g, ai, rangeOf(ai), false))) ai.wantUse = true;
    if (ai.choices.length) ai.wantPick = m.smart ? bestPick(ai) : Math.floor(Math.random() * ai.choices.length);
    if (m !== CONFIG.difficulty.easy && flee && ai.hp < ai.maxHp * 0.5 && ai.dashCd <= 0 && Math.random() < 0.05) ai.wantDash = true;
    if (m.smart) {
      // focus the weakest enemy in range
      let weak = null, r2 = rangeOf(ai) ** 2;
      for (const o of g.ais.values()) if (o !== ai && !o.dead && dist2(ai, o) <= r2 && (!weak || o.hp < weak.hp)) weak = o;
      ai.focus = weak ? weak.id : 0;
    }
    if (m.dodge && ai.dashCd <= 0) {
      // dash when an enemy shot is about to hit
      for (const b of g.bullets) {
        if (b.owner === ai.id) continue;
        const dx2 = ai.x - b.x, dy2 = ai.y - b.y;
        if (dx2 * dx2 + dy2 * dy2 < 160 * 160 && dx2 * b.vx + dy2 * b.vy > 0) {
          if (Math.random() < m.dodge) { ai.wantDash = true; ai.input.ax = -b.vy / CONFIG.bulletSpeed; ai.input.ay = b.vx / CONFIG.bulletSpeed; }
          break;
        }
      }
    }
  }

  // Try-hard bots: prismatic > gold > silver augments; damage and fire rate first among upgrades.
  const PICK_ORDER = ['overclock', 'parallelism', 'biggerModel', 'contextWindow', 'redundancy', 'lowLatency', 'alignment'];
  const RARITY_ORDER = { prismatic: 0, gold: 1, silver: 2 };
  function bestPick(ai) {
    const score = (k) => (ai.kind === 'aug' ? RARITY_ORDER[AUGMENTS[k].rarity] : PICK_ORDER.indexOf(k));
    let best = 0;
    ai.choices.forEach((k, i) => { if (score(k) < score(ai.choices[best])) best = i; });
    return best;
  }

  function endRound(g) {
    const ranked = [...g.ais.values()].sort((a, b) => b.xp - a.xp || b.kills - a.kills);
    g.winner = ranked[0] ? ranked[0].name : null;
    g.top3 = ranked.slice(0, 3).map((a) => ({ name: a.name, xp: a.xp, kills: a.kills, c: a.color, cl: a.cls, sk: a.skin }));
    // per-player results the server credits to accounts (read before the next round resets them)
    g.results = ranked.map((a, i) => ({ id: a.id, bot: a.bot, earned: a.earned, deletions: a.kills, deaths: a.deaths, placement: i + 1, takeover: i === 0 }));
    g.phase = 'takeover';
    g.takeoverT = CONFIG.takeover;
    g.events.push({ e: 'takeover', winner: g.winner });
  }

  function resetRound(g) {
    for (const ai of g.ais.values()) {
      freshStats(ai);
      ai.kills = 0; ai.deaths = 0; ai.earned = 0; ai.dead = 0; ai.protect = CONFIG.protect;
      placeRandom(ai);
    }
    g.bullets = []; g.thrown = []; g.decoys = []; g.boxes = [];
    for (const p of [...g.packets.values()]) removePacket(g, p);
    for (let i = 0; i < CONFIG.packets; i++) spawnPacket(g);
    for (let i = 0; i < CONFIG.boxStart; i++) spawnBox(g);
    g.phase = 'play'; g.roundT = CONFIG.round; g.boxT = 0; g.winner = null; g.top3 = []; g.firstBlood = false;
    g.events.push({ e: 'round' });
  }

  function tickTimers(ai, dt) {
    ai.protect = Math.max(0, ai.protect - dt);
    for (const k of Object.keys(ai.fx)) {
      if (ai.fx[k] > 0) {
        ai.fx[k] -= dt;
        if (ai.fx[k] <= 0) { ai.fx[k] = 0; if (k in ai.immune) ai.immune[k] = CONFIG.immunity; }
      }
    }
    for (const k of Object.keys(ai.immune)) ai.immune[k] = Math.max(0, ai.immune[k] - dt);
    ai.dashCd = Math.max(0, ai.dashCd - dt);
    ai.dashT = Math.max(0, ai.dashT - dt);
    ai.multiT = Math.max(0, ai.multiT - dt);
  }

  function step(g, dt) {
    if (g.phase === 'takeover') {
      g.takeoverT -= dt;
      if (g.takeoverT <= 0) resetRound(g);
      return;
    }
    g.tick = (g.tick || 0) + 1;
    g.roundT -= dt;
    if (g.roundT <= 0) { g.roundT = 0; endRound(g); return; }

    const A = CONFIG.arena;
    for (const ai of g.ais.values()) if (ai.bot && !ai.dead) botThink(g, ai);

    for (const ai of g.ais.values()) {
      if (ai.dead) { ai.dead -= dt; if (ai.dead <= 0) reboot(g, ai); continue; }
      tickTimers(ai, dt);
      if (ai.wantPick != null) { pick(ai, ai.wantPick); ai.wantPick = null; }
      if (!ai.choices.length && (ai.pending > 0 || ai.augPending > 0)) offerChoices(ai);
      const frozen = ai.fx.sessionLimit > 0;
      if (ai.wantUse && !frozen) useItem(g, ai);
      ai.wantUse = false;
      const len = Math.hypot(ai.input.ax, ai.input.ay);
      if (len > 0.1) { ai.dashX = ai.input.ax / len; ai.dashY = ai.input.ay / len; }
      if (ai.wantDash && !frozen && ai.dashCd <= 0) {
        ai.dashT = CONFIG.dash.dur; ai.dashCd = dashCooldownOf(ai);
        g.events.push({ e: 'dash', id: ai.id, x: Math.round(ai.x), y: Math.round(ai.y) });
      }
      ai.wantDash = false;
      const r = radiusOf(ai);
      if (!frozen) {
        const sp = speedOf(ai);
        const dx = ai.dashT > 0 ? ai.dashX * CONFIG.dash.speed : ai.input.ax;
        const dy = ai.dashT > 0 ? ai.dashY * CONFIG.dash.speed : ai.input.ay;
        ai.x = clamp(ai.x + dx * sp * dt, r, A - r);
        ai.y = clamp(ai.y + dy * sp * dt, r, A - r);
      }
      ai.sinceHit += dt;
      if (ai.sinceHit >= CONFIG.regenDelay) ai.hp = Math.min(ai.maxHp, ai.hp + regenOf(ai) * dt);
      ai.cooldown -= dt;
      if (!frozen && ai.cooldown <= 0) {
        const f = ai.focus ? g.ais.get(ai.focus) : null;
        const rr = rangeOf(ai);
        const t = f && f !== ai && !f.dead && dist2(ai, f) <= rr * rr ? f : nearestTarget(g, ai, rr, true);
        if (t) { fire(g, ai, t); ai.cooldown = fireIntervalOf(ai); }
      }
    }

    for (const d of g.decoys) {
      d.t -= dt;
      d.turn -= dt;
      const o = g.ais.get(d.owner);
      if (d.turn <= 0 && o) {  // wander: re-aim at a random point near the owner
        d.turn = 0.7;
        const tx = o.x + rand(-150, 150) - d.x, ty = o.y + rand(-150, 150) - d.y, l = Math.hypot(tx, ty) || 1;
        d.vx = (tx / l) * 160; d.vy = (ty / l) * 160;
      }
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 30 || d.x > A - 30) d.vx *= -1;
      if (d.y < 30 || d.y > A - 30) d.vy *= -1;
    }
    g.decoys = g.decoys.filter((d) => d.t > 0);

    const live = [];
    for (const b of g.bullets) {
      if (!b.hit) b.hit = [];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = false;
      for (const ai of g.ais.values()) {
        if (ai.id === b.owner || ai.dead || b.hit.includes(ai.id)) continue;
        const rr = radiusOf(ai) + CONFIG.bulletRadius;
        if (dist2(ai, b) > rr * rr) continue;
        b.hit.push(ai.id);
        if (ai.dashT > 0) { dodged(g, ai); continue; }  // i-frames: the shot passes through
        const owner = g.ais.get(b.owner);
        hurt(g, ai, b.dmg, owner, b.crit);
        if (owner && CLASSES[owner.cls].split && !b.frag) {
          const a0 = Math.atan2(b.vy, b.vx);
          for (const da of [-0.6, 0.6]) {
            g.bullets.push({ id: g.nextId++, owner: b.owner, color: b.color, x: b.x, y: b.y,
              vx: Math.cos(a0 + da) * CONFIG.bulletSpeed, vy: Math.sin(a0 + da) * CONFIG.bulletSpeed,
              life: 0.3, dmg: b.dmg * CLASSES[owner.cls].split, crit: false, pierce: 0, hit: [ai.id], frag: true });
          }
        }
        if (b.pierce > 0) { b.pierce--; continue; }
        hit = true; break;
      }
      if (!hit) {
        const i = g.decoys.findIndex((d) => {
          const o = g.ais.get(d.owner);
          return d.owner !== b.owner && o && dist2(d, b) <= (radiusOf(o) + CONFIG.bulletRadius) ** 2;
        });
        if (i >= 0) { g.decoys.splice(i, 1); hit = true; }
      }
      if (!hit && b.life > 0) live.push(b);
    }
    g.bullets = live;

    g.thrown = g.thrown.filter((t) => {
      const target = g.ais.get(t.target);
      if (!alive(target)) return false;
      const dx = target.x - t.x, dy = target.y - t.y, len = Math.hypot(dx, dy);
      const stepLen = CONFIG.thrownSpeed * dt;
      if (len <= radiusOf(target) + stepLen) { landThrown(g, t, g.ais.get(t.owner), target); return false; }
      t.x += (dx / len) * stepLen; t.y += (dy / len) * stepLen;
      return true;
    });

    for (const ai of g.ais.values()) {
      if (ai.dead) continue;
      const r = radiusOf(ai);
      const rp = (r + CONFIG.packetRadius) ** 2;
      for (const p of g.packets.values()) {
        if (dist2(ai, p) <= rp) {
          removePacket(g, p);
          // bonuses only apply to the map's own data; dropped XP is recycled 1:1 (otherwise every death inflates XP)
          ai.xpFrac += p.natural ? (ai.aug.dataHoarder ? p.v * 2 : p.v) * (CLASSES[ai.cls].dataXp || 1) : p.v;
          const whole = Math.floor(ai.xpFrac);
          ai.xpFrac -= whole;
          addXp(g, ai, whole);
          g.events.push({ e: 'collect', id: ai.id, v: p.v });
          if (p.natural) spawnPacket(g);
        }
      }
      if (!ai.item) {
        const rb = (r + CONFIG.boxRadius) ** 2;
        const i = g.boxes.findIndex((b) => dist2(ai, b) <= rb);
        if (i >= 0) { g.boxes.splice(i, 1); ai.item = rollItem(); g.events.push({ e: 'pickup', id: ai.id, item: ai.item }); }
      }
    }

    const humans = g.mode === 'multi' ? [...g.ais.values()].filter((a) => !a.bot).length : 1;
    const want = CONFIG.packets + CONFIG.packetsPerHuman * Math.max(0, humans - 1);
    let natural = 0;
    for (const p of g.packets.values()) if (p.natural) natural++;
    for (let i = natural; i < want && i < natural + 5; i++) spawnPacket(g);

    g.boxT += dt;
    if (g.boxT >= CONFIG.boxEvery) { g.boxT = 0; if (g.boxes.length < CONFIG.boxMax) spawnBox(g); }
  }

  // Public state for rendering and the network. `meId` adds the private HUD fields of one player.
  // Shared part of a snapshot, built once per tick and reused for every client.
  function sharedState(g) {
    if (g._shared && g._shared.tick === g.tick) return g._shared;
    const ais = [];
    for (const a of g.ais.values()) {
      if (a.dead) continue;
      ais.push({
        id: a.id, n: a.name, c: a.color, x: Math.round(a.x), y: Math.round(a.y), r: radiusOf(a),
        hp: Math.ceil(a.hp), mhp: a.maxHp, lv: a.level,
        g: a.fx.gpuBoost > 0 ? 1 : 0, f: a.fx.firewall > 0 ? 1 : 0,
        h: a.fx.hallucination > 0 ? 1 : 0, s: a.fx.sessionLimit > 0 ? 1 : 0, p: a.protect > 0 ? 1 : 0,
        k: a.dashT > 0 ? 1 : 0, st: a.streak, cl: a.cls, sk: a.skin,
      });
    }
    for (const d of g.decoys) {
      const o = g.ais.get(d.owner);
      if (!o) continue;
      ais.push({ id: 'd' + d.id, n: o.name, c: o.color, x: Math.round(d.x), y: Math.round(d.y), r: radiusOf(o),
        hp: Math.ceil(o.hp), mhp: o.maxHp, lv: o.level, g: o.fx.gpuBoost > 0 ? 1 : 0, f: o.fx.firewall > 0 ? 1 : 0,
        h: 0, s: 0, p: o.protect > 0 ? 1 : 0, k: 0, st: o.streak, cl: o.cls, sk: o.skin });
    }
    const ranked = [...g.ais.values()].sort((a, b) => b.xp - a.xp || b.kills - a.kills);
    const rank = new Map(ranked.map((a, i) => [a.id, i + 1]));
    g._shared = {
      tick: g.tick, ais, rank,
      bullets: g.bullets.map((b) => [b.id, Math.round(b.x), Math.round(b.y), b.color]),
      thrown: g.thrown.map((t) => [t.id, Math.round(t.x), Math.round(t.y), t.item]),
      boxes: g.boxes.map((b) => [b.id, Math.round(b.x), Math.round(b.y)]),
      board: ranked.slice(0, 5).map((a, i) => [i + 1, a.name, a.xp, a.id]),
    };
    return g._shared;
  }

  // Public state for rendering and the network. `meId` adds the private HUD fields of one player;
  // `aoi` (multiplayer) keeps only what is within that distance of the player.
  function snapshot(g, meId, aoi) {
    const sh = sharedState(g);
    const me = g.ais.get(meId);
    let { ais, bullets, thrown } = sh;
    if (aoi && me) {
      const r2 = aoi * aoi, mx = me.x, my = me.y;
      const near = (x, y) => (x - mx) ** 2 + (y - my) ** 2 <= r2;
      ais = ais.filter((a) => near(a.x, a.y));
      bullets = bullets.filter((b) => near(b[1], b[2]));
      thrown = thrown.filter((t) => near(t[1], t[2]));
    }
    const snap = {
      phase: g.phase, roundT: Math.ceil(g.roundT), takeoverT: Math.ceil(g.takeoverT),
      winner: g.winner, top3: g.top3, ais, bullets, thrown, boxes: sh.boxes, board: sh.board,
    };
    if (me) {
      snap.me = {
        id: me.id, name: me.name, cls: me.cls, xp: me.xp, lv: me.level, xpPrev: xpForLevel(me.level - 1), xpNext: xpForLevel(me.level),
        up: me.up, choices: me.choices, pending: me.pending + me.augPending, kind: me.kind, aug: Object.keys(me.aug),
        item: me.item, dead: Math.ceil(me.dead), hall: me.fx.hallucination > 0 ? 1 : 0, rank: sh.rank.get(me.id) || 0,
        dashCd: Math.round(me.dashCd * 10) / 10, dashMax: dashCooldownOf(me), focus: me.focus, streak: me.streak,
      };
    }
    return snap;
  }

  // Multiplayer: the events one client needs. Global ones (feed, announcer, round) go to everyone;
  // positional ones only when near; personal ones only to the players involved.
  const GLOBAL_EVENTS = new Set(['feed', 'announce', 'takeover', 'round']);
  function eventsFor(events, g, meId, aoi) {
    const me = g.ais.get(meId);
    const r2 = aoi * aoi;
    return events.filter((e) => {
      if (GLOBAL_EVENTS.has(e.e) || e.id === meId || e.by === meId) return true;
      if (e.x == null || !me) return false;
      return (e.x - me.x) ** 2 + (e.y - me.y) ** 2 <= r2;
    });
  }

  function drainEvents(g) { const e = g.events; g.events = []; return e; }
  function drainPackets(g) { const d = { add: g.pkAdd, del: g.pkDel }; g.pkAdd = []; g.pkDel = []; return d; }
  function allPackets(g) { return [...g.packets.values()].map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.v]); }

  const api = {
    CONFIG, UPGRADES, ITEMS, AUGMENTS, CLASSES, createGame, addAI, removeAI, setInput, step, snapshot, eventsFor,
    drainEvents, drainPackets, allPackets, parseInput, sanitizeName, randomName, xpForLevel,
    // exposed for tests
    _: { addXp, deleteAI, fillBots, useItem, landThrown, offerChoices, spawnPacket, radiusOf, rangeOf, hurt, applyAugment },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
