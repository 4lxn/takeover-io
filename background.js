// takeover.io arena floor: a datacenter in cyberspace, plain canvas 2D.
// Background.draw(ctx, view) runs after the camera transform (world units) and before every sprite.
(function (root) {
  'use strict';

  // Deterministic 0..1 hash of two integers: layouts stay stable frame to frame without stored arrays.
  function hash(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const DEFAULTS = { bg: '#070a12', grid: '#122038', wall: '#24365c', accent: '#3df2ff' };
  const MAGENTA = '#ff3df0';
  const decorCache = new Map();

  function decorCanvas(name, def, frame) {
    const key = name + '|' + frame;
    let c = decorCache.get(key);
    if (c) return c;
    const grid = def.frames[frame % def.frames.length];
    const pal = (root.ASSETS && root.ASSETS.palette) || {};
    c = document.createElement('canvas');
    c.width = grid[0].length; c.height = grid.length;
    const x = c.getContext('2d');
    grid.forEach((row, j) => [...row].forEach((ch, i) => {
      const col = pal[ch];
      if (col && col !== 'tint') { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
    }));
    decorCache.set(key, c);
    return c;
  }

  function draw(ctx, v) {
    const A = v.arena, t = v.t, px = 1 / v.scale;
    const th = Object.assign({}, DEFAULTS, v.theme);
    const x0 = v.x0, y0 = v.y0, x1 = v.x0 + v.w, y1 = v.y0 + v.h;
    // the part of the arena that is on screen
    const ax0 = Math.max(0, x0), ay0 = Math.max(0, y0), ax1 = Math.min(A, x1), ay1 = Math.min(A, y1);
    const arenaVisible = ax1 > ax0 && ay1 > ay0;
    ctx.save();
    ctx.lineCap = 'butt';

    // 1. floor: deep radial gradient, darker toward the walls
    if (arenaVisible) {
      const g = ctx.createRadialGradient(A / 2, A / 2, 0, A / 2, A / 2, A * 0.72);
      g.addColorStop(0, '#0d1830');
      g.addColorStop(0.6, '#090f1f');
      g.addColorStop(1, th.bg);
      ctx.fillStyle = g;
      ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
    }

    // 2. far parallax layer (0.3 of camera speed): twinkling dots and falling data streaks
    {
      const p = 0.3, CELL = 160;
      const ccx = x0 + v.w / 2, ccy = y0 + v.h / 2;
      const ox = ccx * (1 - p), oy = ccy * (1 - p);          // world pos = layer pos + offset
      const lx0 = x0 - ox, ly0 = y0 - oy, lx1 = x1 - ox, ly1 = y1 - oy;
      ctx.fillStyle = th.accent;
      for (let ci = Math.floor(lx0 / CELL); ci <= Math.floor(lx1 / CELL); ci++) {
        for (let cj = Math.floor(ly0 / CELL); cj <= Math.floor(ly1 / CELL); cj++) {
          for (let k = 0; k < 2; k++) {
            const h1 = hash(ci * 3 + k, cj), h2 = hash(cj * 7 + k, ci + 99), h3 = hash(ci + k * 31, cj * 5 + 17);
            const sx = (ci + h1) * CELL + ox, sy = (cj + h2) * CELL + oy;
            if (h3 < 0.18) {
              // data rain: a short streak sliding down inside its cell
              const fall = ((t * (40 + h1 * 60) + h2 * CELL) % CELL);
              ctx.globalAlpha = 0.10 + 0.08 * h3;
              ctx.fillRect(sx, cj * CELL + oy + fall, 1.5 * px, 18 * px + 10);
            } else {
              ctx.globalAlpha = 0.06 + 0.12 * h3 * (0.6 + 0.4 * Math.sin(t * (1 + h1 * 2) + h2 * 20));
              const s = (1 + h1 * 1.5) * px;
              ctx.fillRect(sx, sy, s, s);
            }
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    if (arenaVisible) {
      // 3. neon grid: minor every 100, major every 400 (major lines get a fake glow: wide faint + thin bright)
      ctx.beginPath();
      for (let gx = Math.ceil(ax0 / 100) * 100; gx <= ax1; gx += 100) if (gx % 400) { ctx.moveTo(gx, ay0); ctx.lineTo(gx, ay1); }
      for (let gy = Math.ceil(ay0 / 100) * 100; gy <= ay1; gy += 100) if (gy % 400) { ctx.moveTo(ax0, gy); ctx.lineTo(ax1, gy); }
      ctx.strokeStyle = th.grid; ctx.globalAlpha = 0.8; ctx.lineWidth = px;
      ctx.stroke();
      ctx.beginPath();
      for (let gx = Math.ceil(ax0 / 400) * 400; gx <= ax1; gx += 400) { ctx.moveTo(gx, ay0); ctx.lineTo(gx, ay1); }
      for (let gy = Math.ceil(ay0 / 400) * 400; gy <= ay1; gy += 400) { ctx.moveTo(ax0, gy); ctx.lineTo(ax1, gy); }
      ctx.strokeStyle = th.accent;
      ctx.globalAlpha = 0.06; ctx.lineWidth = 7 * px; ctx.stroke();
      ctx.globalAlpha = 0.28; ctx.lineWidth = 1.4 * px; ctx.stroke();

      // 4. energy pulses running along major lines
      ctx.lineWidth = 2.5 * px;
      const pulse = (i, k, horizontal, line) => {
        const h = hash(i * 13 + k, horizontal ? 7 : 3);
        const speed = 260 + h * 340, dir = h > 0.5 ? 1 : -1, span = A + 600;
        let pos = (t * speed + h * span) % span - 300;
        if (dir < 0) pos = A - pos;
        for (let s = 0; s < 3; s++) {   // head bright, tail fading
          const a = pos - dir * s * 45, b = pos - dir * (s + 1) * 45;
          ctx.globalAlpha = 0.55 - s * 0.17;
          ctx.beginPath();
          if (horizontal) { ctx.moveTo(a, line); ctx.lineTo(b, line); } else { ctx.moveTo(line, a); ctx.lineTo(line, b); }
          ctx.stroke();
        }
      };
      ctx.strokeStyle = th.accent;
      for (let gx = Math.ceil(ax0 / 400) * 400; gx <= ax1; gx += 400) for (let k = 0; k < 2; k++) pulse(gx / 400, k, false, gx);
      ctx.strokeStyle = MAGENTA;
      for (let gy = Math.ceil(ay0 / 400) * 400; gy <= ay1; gy += 400) pulse(gy / 400, 0, true, gy);

      // 5. circuit traces: L-shaped runs with node pads in some 400x400 cells
      for (let ci = Math.floor(ax0 / 400); ci <= Math.floor((ax1 - 1) / 400); ci++) {
        for (let cj = Math.floor(ay0 / 400); cj <= Math.floor((ay1 - 1) / 400); cj++) {
          for (let k = 0; k < 2; k++) {
            const h = hash(ci * 11 + k, cj * 3 + 77);
            if (h > 0.5) continue;
            const h2 = hash(ci + 5, cj * 13 + k), h3 = hash(ci * 17 + k, cj + 41);
            const sx = ci * 400 + 40 + h2 * 320, sy = cj * 400 + 40 + h3 * 320;
            const ex = ci * 400 + 40 + hash(ci, cj + k * 9) * 320, ey = cj * 400 + 40 + hash(cj, ci + k * 5) * 320;
            ctx.strokeStyle = ctx.fillStyle = h < 0.25 ? th.accent : MAGENTA;
            ctx.globalAlpha = 0.12 + 0.07 * Math.sin(t * 2.2 + h * 40);
            ctx.lineWidth = 1.6 * px;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, sy); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.fillRect(sx - 4, sy - 4, 8, 8);
            ctx.fillRect(ex - 4, ey - 4, 8, 8);
          }
        }
      }
      ctx.globalAlpha = 1;

      // 8. optional decor sprites from assets.js, about one per 600x600 cell, dimmed
      const decor = root.ASSETS && root.ASSETS.decor;
      if (decor && typeof document !== 'undefined') {
        const names = Object.keys(decor).filter((n) => decor[n] && decor[n].frames && decor[n].frames.length);
        if (names.length) {
          ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = 0.55;
          for (let ci = Math.floor(ax0 / 600) - 1; ci <= Math.floor(ax1 / 600); ci++) {
            for (let cj = Math.floor(ay0 / 600) - 1; cj <= Math.floor(ay1 / 600); cj++) {
              if (ci < 0 || cj < 0 || ci * 600 >= A || cj * 600 >= A) continue;
              const h = hash(ci + 311, cj * 7);
              if (h > 0.9) continue;
              const name = names[Math.floor(hash(ci * 3, cj + 911) * names.length)];
              const def = decor[name];
              const dx = ci * 600 + 80 + hash(ci, cj + 3) * 440, dy = cj * 600 + 80 + hash(cj + 3, ci) * 440;
              if (Math.abs(dx - A / 2) < 340 && Math.abs(dy - A / 2) < 340) continue; // keep the core clear
              if (dx < x0 - 64 || dx > x1 + 64 || dy < y0 - 64 || dy > y1 + 64) continue;
              const frame = def.fps ? Math.floor(t * def.fps + h * 10) % def.frames.length : 0;
              ctx.drawImage(decorCanvas(name, def, frame), dx - 32, dy - 32, 64, 64);
            }
          }
          ctx.globalAlpha = 1;
        }
      }

      // 6. the core: hex floor plates, counter-rotating dashed rings, faint label
      const C = A / 2;
      if (C + 320 > x0 && C - 320 < x1 && C + 320 > y0 && C - 320 < y1) {
        const R = 34, dxh = R * Math.sqrt(3);
        ctx.beginPath();
        for (let q = -6; q <= 6; q++) {
          for (let r = -6; r <= 6; r++) {
            const hx = C + dxh * (q + r / 2), hy = C + R * 1.5 * r;
            if ((hx - C) ** 2 + (hy - C) ** 2 > 280 * 280) continue;
            for (let s = 0; s < 6; s++) {
              const a = Math.PI / 6 + (s * Math.PI) / 3;
              const vx = hx + (R - 3) * Math.cos(a), vy = hy + (R - 3) * Math.sin(a);
              if (s === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
            }
            ctx.closePath();
          }
        }
        ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.10; ctx.lineWidth = 1.2 * px; ctx.stroke();
        ctx.lineWidth = 3 * px;
        ctx.setLineDash([46, 30]);
        ctx.lineDashOffset = -t * 40;
        ctx.globalAlpha = 0.30;
        ctx.beginPath(); ctx.arc(C, C, 290, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = MAGENTA;
        ctx.setLineDash([18, 22]);
        ctx.lineDashOffset = t * 55;
        ctx.globalAlpha = 0.22;
        ctx.beginPath(); ctx.arc(C, C, 230, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.07 + 0.03 * Math.sin(t * 1.5);
        ctx.fillStyle = th.accent;
        ctx.font = 'bold 72px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('CORE', C, C);
        ctx.globalAlpha = 1;
      }
    }

    // 7. arena walls: a glowing energy barrier with chevrons sliding along it
    {
      const BAND = 36;
      const edges = [
        // [visible?, gradient from (x,y) to (x,y), band rect, chevron axis]
        { on: x0 < 0 + BAND && x1 > -BAND, g: [0, 0, -BAND, 0], rect: [-BAND, Math.max(-BAND, y0), BAND, Math.min(A + BAND, y1) - Math.max(-BAND, y0)], axis: 'v', at: 0, inward: 1 },
        { on: x1 > A - BAND && x0 < A + BAND, g: [A, 0, A + BAND, 0], rect: [A, Math.max(-BAND, y0), BAND, Math.min(A + BAND, y1) - Math.max(-BAND, y0)], axis: 'v', at: A, inward: -1 },
        { on: y0 < 0 + BAND && y1 > -BAND, g: [0, 0, 0, -BAND], rect: [Math.max(-BAND, x0), -BAND, Math.min(A + BAND, x1) - Math.max(-BAND, x0), BAND], axis: 'h', at: 0, inward: 1 },
        { on: y1 > A - BAND && y0 < A + BAND, g: [0, A, 0, A + BAND], rect: [Math.max(-BAND, x0), A, Math.min(A + BAND, x1) - Math.max(-BAND, x0), BAND], axis: 'h', at: A, inward: -1 },
      ];
      const flick = 0.85 + 0.15 * Math.sin(t * 9);
      for (const e of edges) {
        if (!e.on || e.rect[2] <= 0 || e.rect[3] <= 0) continue;
        const g = ctx.createLinearGradient(e.g[0], e.g[1], e.g[2], e.g[3]);
        g.addColorStop(0, th.accent);
        g.addColorStop(0.25, th.wall);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.55 * flick;
        ctx.fillStyle = g;
        ctx.fillRect(e.rect[0], e.rect[1], e.rect[2], e.rect[3]);
        // bright edge line
        ctx.strokeStyle = th.accent;
        ctx.globalAlpha = 0.9 * flick; ctx.lineWidth = 2 * px;
        ctx.beginPath();
        if (e.axis === 'v') { ctx.moveTo(e.at, Math.max(0, y0)); ctx.lineTo(e.at, Math.min(A, y1)); }
        else { ctx.moveTo(Math.max(0, x0), e.at); ctx.lineTo(Math.min(A, x1), e.at); }
        ctx.stroke();
        // chevrons pointing into the arena, sliding along the wall
        const STEP = 90, off = (t * 70) % STEP;
        const from = e.axis === 'v' ? Math.max(0, y0) : Math.max(0, x0);
        const to = e.axis === 'v' ? Math.min(A, y1) : Math.min(A, x1);
        ctx.globalAlpha = 0.45; ctx.lineWidth = 3 * px;
        ctx.beginPath();
        for (let s = Math.floor(from / STEP) * STEP + off; s <= to; s += STEP) {
          const d = -e.inward * 14;            // chevron depth, drawn just outside the wall
          if (e.axis === 'v') { ctx.moveTo(e.at + d - e.inward * 10, s - 12); ctx.lineTo(e.at - e.inward * 4, s); ctx.lineTo(e.at + d - e.inward * 10, s + 12); }
          else { ctx.moveTo(s - 12, e.at + d - e.inward * 10); ctx.lineTo(s, e.at - e.inward * 4); ctx.lineTo(s + 12, e.at + d - e.inward * 10); }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  root.Background = { draw };
})(typeof window !== 'undefined' ? window : globalThis);
