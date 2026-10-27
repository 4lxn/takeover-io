// takeover-fx.js: animated end-of-round takeover screen. Canvas 2D plus pixel art from assets.js, no network.
//   TakeoverFX.play({ name, color, frames, fps, top: [{ name, xp, kills, color }], seconds, origin: { x, y } })
//   TakeoverFX.stop()
// Sequence: glitch hit, the winner's color spreads over the screen as circuitry, the winner zooms in, the crown drops,
// TAKEOVER glitches in, the subtitle types out, the podium slides in with XP counting up, a countdown ring ticks down.
// prefers-reduced-motion skips straight to the final layout with no glitch, flash or movement.
(function () {
  const A = window.ASSETS || {};
  const theme = A.theme || { bg: '#070a12', text: '#d8e6ff', accent: '#3df2ff', danger: '#ff3b4e' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = 3, TILE = 4; // css px per art pixel; circuit tile size in art pixels
  let cv, ctx, buf, bx, run = null, raf = 0;

  const clamp = v => Math.max(0, Math.min(1, v));
  const easeOut = k => 1 - (1 - k) ** 3;
  const backOut = k => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
  const bounce = k => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  };
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
  const mix = (a, b, k) => { const x = rgb(a), y = rgb(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`; };
  const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

  // Palette grid -> small canvas, cached per grid and tint.
  const arts = new Map();
  function art(grid, tint) {
    const key = grid.join('') + tint;
    if (arts.has(key)) return arts.get(key);
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = grid[0].length; c.height = grid.length;
    grid.forEach((row, py) => [...row].forEach((ch, px) => {
      const col = (A.palette || {})[ch];
      if (col) { x.fillStyle = col === 'tint' ? tint : col; x.fillRect(px, py, 1, 1); }
    }));
    arts.set(key, c);
    return c;
  }

  function play(o) {
    stop();
    const color = /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : theme.accent;
    run = {
      name: String(o.name || 'nobody'), color, top: (o.top || []).slice(0, 5), seconds: o.seconds || 10,
      frames: o.frames || (A.sprites && A.sprites.ai.frames) || null, fps: o.fps || 4, origin: o.origin || null,
      t0: performance.now(), w: 0, h: 0, layer: null, pulses: [],
    };
    cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60;image-rendering:pixelated';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    buf = document.createElement('canvas'); bx = buf.getContext('2d');
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    if (cv) cv.remove();
    cv = run = null;
  }

  function frame(now) {
    if (!run) return;
    const real = (now - run.t0) / 1000;
    if (real > run.seconds + 1) return stop(); // safety net if the client forgets stop()
    raf = requestAnimationFrame(frame);
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (w !== run.w || h !== run.h) {
      run.w = w; run.h = h; run.layer = null;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      buf.width = Math.ceil(w / P); buf.height = Math.ceil(h / P);
    }
    draw(reduced ? 10 : real, real, w, h, dpr);
  }

  function draw(t, real, w, h, dpr) {
    const R = run, c = R.color, lw = buf.width, lh = buf.height;
    // Layout: text sizes (css px) first, then the art block (title, crown, sprite) gets whatever space is left.
    const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', full = R.name + ' controls the datacenter';
    const compact = h < 560; // short screens (landscape phones): the countdown ring moves to the bottom-right corner
    let fs = Math.round(Math.max(13, Math.min(30, w / 42, h / 24)));
    ctx.font = `700 ${fs}px ${mono}`;
    const fit = (w - 24) / ctx.measureText('> ' + full + ' ').width;
    if (fit < 1) fs = Math.max(10, Math.floor(fs * fit)); // long names shrink the subtitle instead of overflowing
    const ps = Math.round(Math.max(11, fs * 0.72)), rowH = ps * 1.6, ringR = Math.round(fs * 0.9);
    const textH = fs * 2.1 + (R.top.length ? fs * 1.6 + rowH * R.top.length + ps : 0) + (compact ? ps : ringR * 2 + ps * 2.5);
    const S = Math.max(2, Math.min(8, Math.floor((h - textH - 16) / P / 30), Math.floor(lw * 0.6 / 16), Math.floor((lw - 8) / 26)));
    const g = Math.max(1, Math.round(S * 0.55)), cs = Math.max(1, Math.round(S * 0.75)), half = 8 * S;
    const titleY = Math.max(3, Math.round(((h - textH) / P - (7 * g + 6 + 7 * cs + 16 * S)) / 2));
    const cx = lw / 2, cy = titleY + 7 * g + 6 + 7 * cs + half;
    const ox = R.origin ? R.origin.x / P : cx, oy = R.origin ? R.origin.y / P : cy;

    bx.clearRect(0, 0, lw, lh);
    bx.imageSmoothingEnabled = false;

    // 1. Takeover wave: circuitry in the winner's color spreads from the origin and eats the screen.
    const maxD = Math.hypot(Math.max(ox, lw - ox), Math.max(oy, lh - oy));
    const rad = easeOut(clamp((t - 0.25) / 1.4)) * (maxD + TILE * 2);
    bx.fillStyle = rgba(theme.bg, 0.45 * clamp(t / 0.4));
    bx.fillRect(0, 0, lw, lh);
    if (R.layer && rad > maxD) bx.drawImage(R.layer, 0, 0);
    else {
      const base = mix(theme.bg, c, 0.08), trace = mix(theme.bg, c, 0.3), node = mix(theme.bg, c, 0.55);
      const done = rad > maxD, target = done ? (R.layer = Object.assign(document.createElement('canvas'), { width: lw, height: lh })).getContext('2d') : bx;
      for (let ty = 0; ty * TILE < lh; ty++) for (let tx = 0; tx * TILE < lw; tx++) {
        const x = tx * TILE, y = ty * TILE, d = Math.hypot(x + 2 - ox, y + 2 - oy);
        if (d > rad) continue;
        const k = hash(tx, ty);
        target.fillStyle = !done && d > rad - TILE * 1.5 ? (k % 3 ? c : '#ffffff') : base; // bright leading edge
        target.fillRect(x, y, TILE, TILE);
        if (d > rad - TILE * 1.5 && !done) continue;
        target.fillStyle = trace;
        if (k % 9 === 0) target.fillRect(x, y + 2, TILE, 1);
        else if (k % 9 === 1) target.fillRect(x + 2, y, 1, TILE);
        if (k % 23 === 0) { target.fillStyle = node; target.fillRect(x + 1, y + 1, 2, 2); }
      }
      if (done) bx.drawImage(R.layer, 0, 0);
    }
    if (t > 1.7 && !reduced) { // tiles pulse here and there once the screen is taken
      for (let k = 0; k < 4; k++) R.pulses.push({ x: (Math.random() * lw / TILE) | 0, y: (Math.random() * lh / TILE) | 0, b: t });
      R.pulses = R.pulses.filter(p => t - p.b < 0.7);
      for (const p of R.pulses) { bx.fillStyle = rgba(c, 0.5 * (1 - (t - p.b) / 0.7)); bx.fillRect(p.x * TILE, p.y * TILE, TILE, TILE); }
    }

    // 2. Data rain falling behind everything.
    if (t > 0.8) for (let x = 2; x < lw; x += 7) {
      const k = hash(x, 7), y = ((t * (18 + k % 30) + k % 400) % (lh + 24)) - 12;
      for (let s = 0; s < 4; s++) { bx.fillStyle = rgba(c, 0.32 - s * 0.07); bx.fillRect(x, y - s * 2, 1, 2); }
    }

    // 3. Glow rings and data packets spiralling into the winner.
    const zoom = backOut(clamp((t - 0.9) / 0.5)), bob = Math.round(Math.sin(t * 2) * 2), wy = cy + bob;
    if (zoom > 0) for (let i = 0; i < 4; i++) {
      bx.strokeStyle = rgba(c, 0.35 - i * 0.08); bx.lineWidth = 1;
      bx.beginPath(); bx.arc(cx, wy, (half + 6 + i * 7 + ((t * 14) % 7)) * Math.min(zoom, 1), 0, 7); bx.stroke();
    }
    const data = A.sprites && A.sprites.data && art(A.sprites.data.frames[0], c);
    if (data && t > 1.2) for (let i = 0; i < 26; i++) {
      const k = hash(i, 3), u = (t * 0.45 + (k % 1000) / 1000) % 1, r = (1 - u) ** 1.4 * Math.max(lw, lh) * 0.6 + half * 0.6;
      const a = (k % 628) / 100 + u * 2.5;
      bx.globalAlpha = Math.min(1, u * 8, (1 - u) * 6);
      bx.drawImage(data, Math.round(cx + Math.cos(a) * r - 4), Math.round(wy + Math.sin(a) * r - 4));
    }
    bx.globalAlpha = 1;

    // 4. Winner sprite, then the crown dropping onto it.
    if (R.frames && zoom > 0) {
      const f = R.frames[Math.floor(t * R.fps) % R.frames.length], s = 16 * S * zoom;
      bx.drawImage(art(f, c), Math.round(cx - s / 2), Math.round(wy - s / 2), Math.round(s), Math.round(s));
    }
    const crown = A.sprites && A.sprites.crown;
    if (crown && t > 1.5) {
      const land = wy - half - 8 * cs + cs;
      const y = -8 * cs + (land + 8 * cs) * bounce(clamp((t - 1.5) / 0.55));
      bx.drawImage(art(crown.frames[Math.floor(t * crown.fps) % crown.frames.length], c), Math.round(cx - 6 * cs), Math.round(y), 12 * cs, 8 * cs);
    }

    // 5. TAKEOVER in the pixel font, typed in with an RGB-split glitch.
    const F = A.font, word = 'TAKEOVER';
    const shown = Math.floor(clamp((t - 1.1) / 0.5) * word.length + 0.001);
    const glitch = !reduced && (t < 1.9 || (t % 2.3) < 0.12);
    if (F && shown) {
      const tw = word.length * 6 * g - g, tx0 = Math.round(cx - tw / 2);
      const pass = (dx, dy, col) => {
        bx.fillStyle = col;
        [...word.slice(0, shown)].forEach((ch, n) => F[ch].forEach((row, py) => [...row].forEach((p, px) => {
          if (p === '#') bx.fillRect(tx0 + n * 6 * g + px * g + dx, titleY + py * g + dy, g, g);
        })));
      };
      pass(0, g, mix(theme.bg, theme.danger, 0.45)); // drop shadow
      if (glitch) { pass(-g, 0, rgba('#ff0040', 0.8)); pass(g, 0, rgba(theme.accent, 0.8)); }
      pass(0, 0, theme.danger);
    }

    // Upscale the art buffer, then draw text at full resolution on top.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, buf.width * P * dpr, buf.height * P * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!reduced && t < 0.5) { // intro hit: soft flash plus glitch bars
      ctx.fillStyle = rgba(c, 0.3 * (1 - t / 0.5)); ctx.fillRect(0, 0, w, h);
    }
    if (glitch) for (let i = 0; i < 5; i++) {
      ctx.fillStyle = rgba([theme.danger, theme.accent, c][i % 3], 0.35);
      ctx.fillRect((Math.random() - 0.5) * 60, Math.random() * h, w, 2 + Math.random() * 8);
    }

    // 6. Subtitle typed like a terminal command.
    const typed = Math.floor(clamp((t - 1.8) / 1.0) * full.length);
    let y = (cy + half) * P + fs * 2.1;
    ctx.font = `700 ${fs}px ${mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const subW = ctx.measureText('> ' + full).width;
    let x = Math.max(12, (w - subW) / 2);
    if (typed > 0) {
      ctx.fillStyle = theme.accent; ctx.fillText('> ', x, y); x += ctx.measureText('> ').width;
      const nm = full.slice(0, Math.min(typed, R.name.length)), rest = full.slice(R.name.length, typed);
      ctx.fillStyle = c; ctx.fillText(nm, x, y); x += ctx.measureText(nm).width;
      ctx.fillStyle = theme.text; ctx.fillText(rest, x, y); x += ctx.measureText(rest).width;
      if ((real * 2) % 2 < 1.2) { ctx.fillStyle = c; ctx.fillRect(x + 3, y - fs * 0.45, fs * 0.55, fs * 0.9); }
    }

    // 7. Podium: rows slide in, XP counts up.
    const medal = ['#ffe14d', '#b8c4d6', '#ff9a2b'];
    if (R.top.length) y += fs * 1.6;
    if (R.top.length && t > 2.5) {
      const pw = Math.min(w - 24, ps * 30), px0 = (w - pw) / 2, panelA = clamp((t - 2.5) / 0.3);
      ctx.fillStyle = rgba(theme.bg, 0.7 * panelA); ctx.strokeStyle = rgba(c, 0.45 * panelA); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px0, y - rowH * 0.5, pw, rowH * R.top.length + ps * 0.4, 10) : ctx.rect(px0, y - rowH * 0.5, pw, rowH * R.top.length + ps * 0.4);
      ctx.fill(); ctx.stroke();
      ctx.font = `700 ${ps}px ${mono}`;
      R.top.forEach((r, i) => {
        const k = clamp((t - 2.6 - i * 0.18) / 0.4), ry = y + i * rowH + ps * 0.2;
        if (!k) return;
        const slide = (1 - easeOut(k)) * -60, xp = Math.round((r.xp || 0) * easeOut(clamp((t - 2.6 - i * 0.18) / 1.1)));
        ctx.globalAlpha = k;
        ctx.textAlign = 'left';
        ctx.fillStyle = medal[i] || theme.text; ctx.fillText(`${i + 1}.`, px0 + ps + slide, ry);
        ctx.fillStyle = r.color || (i ? theme.text : c); ctx.fillText(String(r.name).slice(0, 18), px0 + ps * 3.2 + slide, ry);
        ctx.textAlign = 'right'; ctx.fillStyle = theme.text;
        ctx.fillText(`${xp} XP · ${r.kills || 0} del`, px0 + pw - ps + slide, ry);
        ctx.globalAlpha = 1;
      });
    }
    if (R.top.length) y += rowH * R.top.length + ps; // fixed slot, so the ring doesn't jump when the podium appears

    // 8. Countdown ring, fading in after the intro hit.
    const left = Math.max(0, R.seconds - real);
    const rx = compact ? w - ringR - 20 : w / 2, ry = compact ? h - ringR - ps * 1.8 : Math.min(h - ringR - ps * 1.6, y + ringR + 6);
    const pulse = !reduced && left <= 3 ? 1 + 0.12 * Math.max(0, 1 - (left % 1) * 4) : 1;
    ctx.globalAlpha = clamp((t - 0.6) / 0.3);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(c, 0.25); ctx.beginPath(); ctx.arc(rx, ry, ringR * pulse, 0, 7); ctx.stroke();
    ctx.strokeStyle = left <= 3 ? theme.danger : c;
    ctx.beginPath(); ctx.arc(rx, ry, ringR * pulse, -Math.PI / 2, -Math.PI / 2 + (left / R.seconds) * Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = theme.text; ctx.font = `700 ${Math.round(fs * 0.8)}px ${mono}`;
    ctx.fillText(String(Math.ceil(left)), rx, ry + 1);
    ctx.font = `400 ${Math.round(ps * 0.85)}px ${mono}`; ctx.globalAlpha *= 0.7;
    ctx.fillText('next round', rx, ry + ringR + ps);
    ctx.globalAlpha = 1;
  }

  window.TakeoverFX = { play, stop };
})();
