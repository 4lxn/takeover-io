// takeover.io assets: palette-mapped pixel art, WebAudio sfx recipes, one chiptune loop.
(function () {
  // Visor row with the eye `pos` cells from the left. Idle frames scan left -> center -> right -> center.
  const scan = pos => 'KTK' + 'd'.repeat(pos) + 'WW' + 'd'.repeat(8 - pos) + 'KTK';
  const EYE = [1, 4, 7, 4];
  const scanFrames = (rows, visorRows) => EYE.map(pos => rows.map((r, y) => (visorRows.includes(y) ? scan(pos) : r)));

  // AI core (also the transformer class body).
  const ai = pos => {
    const visor = scan(pos);
    return [
      '.....KKKKKK.....',
      '...KKTTTTTTKK...',
      '..KTTTTTTTTTTK..',
      '.KTTWTTTTTTTTTK.',
      '.KTWTTTTTTTTTTK.',
      'KTTTTTTTTTTTTTTK',
      'KTKKKKKKKKKKKKTK',
      visor,
      visor,
      'KTKKKKKKKKKKKKTK',
      'KTTTTTTTTTTTTTTK',
      '.KTTTTTTTTTTTTK.',
      '.KTTTdTddTdTTTK.',
      '..KTTTTTTTTTTK..',
      '...KKTTTTTTKK...',
      '.....KKKKKK.....',
    ];
  };

  // Item box: terminal prompt ">_". Border pulses Y -> O -> y -> O, cursor blinks.
  const box = (border, cursor) => [
    '.KKKKKKKKKK.',
    'KYYYYYYYYYYK',
    'KYddddddddYK',
    'KYdWddddddYK',
    'KYddWdddddYK',
    'KYdddWddddYK',
    'KYddWdddddYK',
    cursor ? 'KYdWddWWWdYK' : 'KYdWddddddYK',
    'KYddddddddYK',
    'KYddddddddYK',
    'KYYYYYYYYYYK',
    '.KKKKKKKKKK.',
  ].map(r => r.replace(/Y/g, border));

  const still = grid => ({ frames: [grid], fps: 0 });
  const seq = s => s.trim().split(/\s+/).map(n => (n === '-' ? null : n));
  const notes = (freqs, dur, last, vol, wave = 'square') =>
    freqs.map((f, i) => ({ wave, freq: [f, f], dur: i === freqs.length - 1 ? last : dur, vol }));

  // Procedural fx helpers. Seeded so every load produces the same frames.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grid = (size, fn) => Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => fn(x, y, Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5)) || '.').join(''));

  // levelUp: expanding ring with 8 sparkles riding just outside it.
  const levelUp = [[6, 'W'], [9, 'Y'], [11, 'Y'], [13, 'O'], [15, 'y'], [16, 'y']].map(([r, ch], f) =>
    grid(32, (x, y, d) => {
      if (d >= r - 2 && d < r) return ch;
      for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) * Math.PI / 4;
        const sx = Math.round(15.5 + Math.cos(a) * (r + 2)), sy = Math.round(15.5 + Math.sin(a) * (r + 2));
        if (Math.abs(x - sx) + Math.abs(y - sy) <= (f < 4 ? 1 : 0)) return f < 3 ? 'W' : 'Y';
      }
    }));

  // deleted: white flash, shockwave, then tinted shards flying out. White/dark shards burn out first.
  const shards = Array.from({ length: 20 }, (_, i) => ({
    a: (i / 20) * Math.PI * 2 + rnd() * 0.3,
    v: 0.55 + rnd() * 0.55,
    c: 'TTWTd'[i % 5],
  }));
  const deleted = [0, 1, 2, 3, 4, 5, 6, 7].map(f => grid(32, (x, y, d) => {
    if (f === 0) return d < 6 ? 'W' : d < 8 ? 'T' : null;
    if (f === 1 && d < 3) return 'W';
    if (f <= 3 && d >= 3 + f * 3 && d < 4 + f * 3) return 'Wgd'[f - 1];
    const s = f < 4 ? 2 : 1;
    for (const sh of shards) {
      if (f >= 6 && sh.c !== 'T') continue;
      const dist = 3 + sh.v * f * 1.6;
      const px = Math.round(15.5 + Math.cos(sh.a) * dist - s / 2), py = Math.round(15.5 + Math.sin(sh.a) * dist - s / 2);
      if (x >= px && x < px + s && y >= py && y < py + s) return sh.c;
    }
  }));

  // reboot: a white scanline builds the AI top-down over static, then one all-white flash frame.
  const reboot = [2, 5, 8, 11, 14, 16].map(rev => ai(4).map((row, y) => [...row].map(ch =>
    ch === '.' ? '.' : rev === 16 ? (ch === 'T' ? 'W' : ch) : y < rev ? ch : y === rev ? 'W' : rnd() < 0.15 ? 'T' : '.'
  ).join('')));

  // Free-form drawing onto a w x h grid; returns rows.
  const paint = (w, h, draw) => {
    const g = Array.from({ length: h }, () => Array(w).fill('.'));
    const px = (x, y, ch) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && x < w && y >= 0 && y < h) g[y][x] = ch;
    };
    const rect = (x, y, rw, rh, ch) => {
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) px(i, j, ch);
    };
    const line = (x0, y0, x1, y1, ch) => {
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
      for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, ch);
    };
    draw({ px, rect, line });
    return g.map(r => r.join(''));
  };

  // Status overlays (24x24, drawn over the AI at ~0.75 alpha). The AI covers d < ~10.6, so the middle stays sparse.
  const firewall = [0, 1, 2, 3, 4, 5].map(f => grid(24, (x, y, d) => {
    if (d < 10.2 || d >= 12) return null;
    const lit = ((Math.atan2(y - 11.5, x - 11.5) / (2 * Math.PI) - f / 6) % 1 + 1) % 1 < 0.2; // rotating glint
    return d >= 11.1 ? (lit ? 'W' : 'C') : (lit ? 'C' : 'c');
  }));

  // sessionLimit: frost speckle, an icy ring with spikes (a glint walks around them) and a padlock with a blinking keyhole.
  const sessionLimit = [0, 1, 2, 3].map(f => paint(24, 24, ({ px, rect, line }) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11.5, y - 11.5);
      if (d >= 10.2 && d < 11.4) px(x, y, 'c');
      else if (d < 10.2 && (x * 7 + y * 13) % 11 === 0) px(x, y, 'w');
    }
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6 + 0.26, len = k % 2 ? 11.4 : 12.4, c = Math.cos(a), s = Math.sin(a);
      line(11.5 + c * 9, 11.5 + s * 9, 11.5 + c * len, 11.5 + s * len, k % 4 === f ? 'W' : 'C');
    }
    rect(11, 12, 2, 1, 'w'); rect(10, 13, 1, 2, 'w'); rect(13, 13, 1, 2, 'w');
    rect(9, 15, 6, 5, 'Y'); rect(9, 19, 6, 1, 'y');
    rect(11, 16, 2, 2, f % 2 ? 'R' : 'K');
  }));

  // gpuBoost: three short random arcs crackling around the rim, new ones every frame.
  const gpuBoost = [0, 1, 2, 3].map(() => paint(24, 24, ({ px, line }) => {
    for (let b = 0; b < 3; b++) {
      let a = rnd() * Math.PI * 2, x = 11.5 + Math.cos(a) * 11, y = 11.5 + Math.sin(a) * 11;
      const dir = rnd() < 0.5 ? -1 : 1;
      for (let i = 0; i < 5; i++) {
        a += dir * (0.15 + rnd() * 0.12);
        const r = 9.6 + rnd() * 2.4, nx = 11.5 + Math.cos(a) * r, ny = 11.5 + Math.sin(a) * r;
        line(x, y, nx, ny, 'Y'); x = nx; y = ny;
      }
      px(x, y, 'W');
    }
    for (let s = 0; s < 4; s++) {
      const a = rnd() * Math.PI * 2;
      px(11.5 + Math.cos(a) * 11.5, 11.5 + Math.sin(a) * 11.5, 'W');
    }
  }));

  // hallucination: 16x16 two-arm spiral, rotating. Two arms repeat every half turn, so 6 frames x 30 deg loops cleanly.
  const swirl = [0, 1, 2, 3, 4, 5].map(f => paint(16, 16, ({ px }) => {
    for (let arm = 0; arm < 2; arm++) for (let t = 0; t <= 1; t += 0.02) {
      const a = t * 2.6 * Math.PI + arm * Math.PI + f * Math.PI / 6, r = 0.8 + t * 6.6;
      px(7.5 + Math.cos(a) * r, 7.5 + Math.sin(a) * r, t < 0.25 ? 'W' : t < 0.6 ? 'M' : 'P');
    }
  }));

  // Class icons.
  const heat = ['WCcd', 'CWdc', 'cdWC', 'dcCW']; // attention matrix, bright diagonal
  const transformer = paint(12, 12, ({ rect }) =>
    heat.forEach((row, j) => [...row].forEach((ch, i) => rect(1 + i * 3, 1 + j * 3, 2, 2, ch))));
  const diffusion = paint(12, 12, ({ px }) => { // noise on the left resolves into a solid block on the right
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const dx = Math.abs(x - 5.5), dy = Math.abs(y - 5.5), inside = Math.max(dx, dy) < 5 && dx + dy < 8;
      if (inside && rnd() < 0.2 + x / 10) px(x, y, 'M');
      else if (rnd() < 0.18 * (1 - x / 10)) px(x, y, inside ? 'm' : 'p');
    }
  });

  // Floor decor, 32x32: dark shapes with small neon accents so data packets stay readable on top.
  const serverRack = paint(32, 32, ({ rect, px }) => {
    rect(5, 1, 22, 30, 'd');
    rect(6, 2, 20, 28, 'n');
    for (let i = 0; i < 6; i++) {
      const y = 3 + i * 4;
      rect(7, y, 18, 3, 'K');
      px(8, y + 1, i === 4 ? 'R' : 'G');
      px(10, y + 1, i % 2 ? 'c' : 'e');
      rect(13, y + 1, 10, 1, 'd');
    }
    rect(8, 28, 16, 1, 'c');
  });
  const coolingVent = grid(32, (x, y, d) => {
    if (x < 2 || x > 29 || y < 2 || y > 29) return null;
    if ((x === 4 || x === 27) && (y === 4 || y === 27)) return 'g';
    if (d < 2.5) return d < 1 ? 'c' : 'd';
    if (d < 11) {
      const a = Math.atan2(y - 15.5, x - 15.5) / (2 * Math.PI) + d / 40;
      return ((a * 4) % 1 + 1) % 1 < 0.3 ? 'd' : Math.floor(d) % 2 ? 'K' : 'n'; // 4 curved blades over a ring grill
    }
    if (d < 12) return 'c';
    return x === 2 || x === 29 || y === 2 || y === 29 ? 'd' : 'n';
  });
  const cableHatch = paint(32, 32, ({ rect, px }) => {
    rect(3, 3, 26, 26, 'd');
    rect(5, 5, 22, 22, 'K');
    ['m', 'c', 'e'].forEach((ch, k) => {
      for (let x = 5; x < 27; x++) {
        const y = 9 + k * 6 + Math.round(Math.sin(x / 4 + k * 2) * 1.5);
        px(x, y, ch); px(x, y + 1, ch);
      }
    });
    for (let x = 6; x < 26; x += 4) rect(x, 3, 2, 1, 'y');
    [[4, 4], [27, 4], [4, 27], [27, 27]].forEach(([x, y]) => px(x, y, 'g'));
  });
  const floorLight = paint(32, 32, ({ rect, px }) => {
    rect(9, 12, 14, 8, 'd');
    rect(10, 13, 12, 6, 'n');
    rect(11, 14, 10, 4, 'c');
    rect(12, 15, 8, 2, 'C');
    [[6, 13], [5, 14], [4, 15], [4, 16], [5, 17], [6, 18]].forEach(([x, y]) => { px(x, y, 'c'); px(31 - x, y, 'c'); });
  });

  // Class bodies. Diffusion: bulky armored octagon. Agent: small diamond with a one-row slit visor.
  const diffusionAi = scanFrames([
    '...KKKKKKKKKK...',
    '..KTTTTTTTTTTK..',
    '.KTWTTTTTTTTTTK.',
    'KTWTTTTTTTTTTTTK',
    'KTTTTTTTTTTTTTTK',
    'KTKKKKKKKKKKKKTK',
    '',
    '',
    'KTKKKKKKKKKKKKTK',
    'KTTTTTTTTTTTTTTK',
    'KTgTTTTTTTTTTgTK',
    'KTTTTTTTTTTTTTTK',
    'KTTTTTTTTTTTTTTK',
    '.KTddddddddddTK.',
    '..KTTTTTTTTTTK..',
    '...KKKKKKKKKK...',
  ], [6, 7]);
  const agentAi = scanFrames([
    '.......KK.......',
    '......KTTK......',
    '.....KTWTTK.....',
    '....KTWTTTTK....',
    '...KTTTTTTTTK...',
    '..KTTTTTTTTTTK..',
    '.KTKKKKKKKKKKTK.',
    '',
    '.KTKKKKKKKKKKTK.',
    '..KTTTTTTTTTTK..',
    '...KTTTTTTTTK...',
    '....KTTTTTTK....',
    '.....KTTTTK.....',
    '......KTTK......',
    '.......KK.......',
    '................',
  ], [7]);

  // Skins: the ai silhouette recolored. The eye turns 'T' so the player's color stays visible.
  // map: { T: body, S: body from row 11 down, K/d: outline/visor overrides }. over(x, y, ch) may return a pixel.
  const skin = (name, tier, map, over = () => null) => ({
    name, tier, fps: 4,
    frames: EYE.map(pos => ai(pos).map((row, y) => [...row].map((ch, x) => {
      const o = over(x, y, ch);
      if (o) return o;
      if ((y === 7 || y === 8) && ch === 'W') return 'T';
      if (ch === 'T') return y >= 11 && map.S ? map.S : map.T;
      return map[ch] || ch;
    }).join(''))),
  });
  const plus = (x, y, cx, cy) => Math.abs(x - cx) + Math.abs(y - cy) <= 1;
  const rowsOver = rows => (x, y) => (rows[y] && rows[y][x] !== '.' ? rows[y][x] : null);

  // Thrown items in flight: 8x8 spinning orbs, no rotation needed.
  const orb = (fill, rim, n, mark) => Array.from({ length: n }, (_, f) => grid(8, (x, y, d) => {
    if (d >= 3.6) return null;
    const turn = ((Math.atan2(y - 3.5, x - 3.5) / (2 * Math.PI) + 1) * 4 + f) % 4; // quadrant, rotated per frame
    return mark(x, y, d, f, turn) || (d >= 2.6 ? rim : fill);
  }));

  const CROWN = [
    'W....WW....W',
    'Y....YY....Y',
    'YY...YY...YY',
    'YYY.YYYY.YYY',
    'YYYYYYYYYYYY',
    'YRYYYCCYYYRY',
    'YYYYYYYYYYYY',
    'yyyyyyyyyyyy',
  ];

  // Logo: 5x7 pixel font. TAKEOVER in cyan with a dark purple drop shadow, .IO in magenta with a dark cyan one.
  const FONT = {
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    '.': ['.', '.', '.', '.', '.', '.', '#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  };
  const logo = paint(64, 12, ({ px }) => {
    let x0 = 2;
    [...'TAKEOVER.IO'].forEach((ch, n) => {
      const glyph = FONT[ch], io = n >= 8, fill = io ? 'WMMMMmm' : 'WCCCCcc';
      for (const [dx, dy, color] of [[0, 1, io ? 'c' : 'p'], [0, 0, null]])
        glyph.forEach((row, y) => [...row].forEach((p, x) => p === '#' && px(x0 + x + dx, 2 + y + dy, color || fill[y])));
      x0 += glyph[0].length + 1;
    });
  });

  window.ASSETS = {
    theme: {
      bg: '#070a12',
      grid: '#122038',
      wall: '#24365c',
      text: '#d8e6ff',
      accent: '#3df2ff',
      danger: '#ff3b4e',
      ok: '#4dff7a',
    },

    playerColors: [
      '#3df2ff', // cyan
      '#ff3df0', // magenta
      '#ffe14d', // yellow
      '#4dff7a', // green
      '#ff9a2b', // orange
      '#9b7bff', // violet
      '#ff4d6d', // red
      '#4d8dff', // blue
      '#c6ff3d', // lime
      '#dfe7ff', // silver
    ],

    palette: {
      '.': null,
      T: 'tint',
      K: '#05060d', // outline
      W: '#ffffff',
      w: '#b8c4d6',
      g: '#5a6b82',
      d: '#232b3d', // dark panel
      n: '#0e1524', // floor decor base
      // skin colors
      a: '#e07a52', // coral
      A: '#a8492c', // dark coral
      o: '#eef1f6', // off-white
      b: '#2456c9', // deep blue
      L: '#7fb0ff', // light blue
      v: '#8a5cf6', // violet
      V: '#c4a8ff', // light violet
      q: '#2a1650', // dark purple glass
      l: '#d9b8ff', // lavender neon
      i: '#f3e7c8', // cream
      h: '#c9a46b', // tan
      C: '#3df2ff',
      c: '#1a8a99',
      G: '#4dff7a',
      e: '#1c9e45',
      Y: '#ffe14d',
      y: '#c79a00',
      O: '#ff9a2b',
      R: '#ff3b4e',
      r: '#9a1a2a',
      M: '#ff3df0',
      m: '#9e1f93',
      P: '#b07bff',
      p: '#5b33a6',
      B: '#4d8dff',
    },

    sprites: {
      ai: { frames: [ai(1), ai(4), ai(7), ai(4)], fps: 4 },

      data: still([
        '...KK...',
        '..KGGK..',
        '.KGWGGK.',
        'KGWGGGGK',
        'KGGGGGeK',
        '.KGGGeK.',
        '..KGeK..',
        '...KK...',
      ]),

      promptBox: { frames: [box('Y', 1), box('O', 1), box('y', 0), box('O', 0)], fps: 4 },

      bullet: still([
        '.TT.',
        'TWWT',
        'TWWT',
        '.TT.',
      ]),

      // Glitched copy of the AI: scanline gaps, shifted rows, magenta eye. Fixed colors, no tint.
      ghost: still([
        '.....pppppp.....',
        '...ppPPPPPPpp...',
        '..pPPPPPPPPPPp..',
        '................',
        '.pPWPPPPPPPPPPp.',
        'MpPPPPPPPPPPPPPp',
        '..pPpppppppppppp',
        'pPpddddMMddddpPp',
        'pPpddddMMddddpPp',
        'ppppppppppppPp..',
        'pPPPPPPPPPPPPPPM',
        '................',
        '.pPPPdPddPdPPPp.',
        '..pPPPPPPPPPPp..',
        '....ppPPPPPPpp..',
        '.....pppppp.....',
      ]),

      items: {
        // lightning bolt: fire twice as fast
        gpuBoost: still([
          '......KKKKK.',
          '.....KWYYYK.',
          '....KYYYYK..',
          '...KYYYYK...',
          '..KYYYYKKKK.',
          '.KYYYYYYYYK.',
          '.KKKKYYYYK..',
          '....KYYYK...',
          '...KYYYK....',
          '...KYYK.....',
          '..KYYK......',
          '..KKK.......',
        ]),
        // burning brick wall
        firewall: still([
          '....O.......',
          '....OO...O..',
          '.O.OYO..OO..',
          '.OOOYYO.OYO.',
          'OOYYYYOOOYYO',
          'OYYWYYYYYYYO',
          'gggggggggggg',
          'gRRRRgRRRRRg',
          'grrrrgrrrrrg',
          'gggggggggggg',
          'gRRgRRRRgRRg',
          'grrgrrrrgrrg',
        ]),
        // one node branching into two copies
        fork: still([
          '............',
          '.CCC....CCC.',
          '.CWC....CWC.',
          '.CCC....CCC.',
          '..w......w..',
          '..w......w..',
          '...w....w...',
          '....w..w....',
          '.....ww.....',
          '....CCCC....',
          '....CWWC....',
          '....CCCC....',
        ]),
        // square spiral
        hallucination: still([
          '............',
          '.PPPPPPPPPP.',
          '..........P.',
          '.PMMMMMMM.P.',
          '.P......M.P.',
          '.P.MWWW.M.P.',
          '.P.M..W.M.P.',
          '.P.M....M.P.',
          '.P.MMMMMM.P.',
          '.P........P.',
          '.PPPPPPPPPP.',
          '............',
        ]),
        // hourglass with icy sand
        sessionLimit: still([
          '............',
          '.wwwwwwwwww.',
          '..g......g..',
          '..gCCCCCCg..',
          '...gCCCCg...',
          '....gCCg....',
          '....gCCg....',
          '...g.CC.g...',
          '..g..CC..g..',
          '..gCCCCCCg..',
          '.wwwwwwwwww.',
          '............',
        ]),
        // syringe full of stolen data
        promptInjection: still([
          '............',
          '............',
          '...........w',
          '...wwwwwww.w',
          '...wGGGGdw.w',
          'wwwwGGGGdwww',
          'G..wGGGGdw.w',
          '...wwwwwww.w',
          '...........w',
          '............',
          '............',
          '............',
        ]),
      },

      upgrades: {
        // chip with an up arrow: fire rate
        overclock: still([
          '............',
          '...w.ww.w...',
          '..gggggggg..',
          '.wgddOOddgw.',
          '..gdOOOOdg..',
          '.wgOOOOOOgw.',
          '.wgddOOddgw.',
          '..gddOOddg..',
          '.wgddOOddgw.',
          '..gggggggg..',
          '...w.ww.w...',
          '............',
        ]),
        // brain: damage
        biggerModel: still([
          '............',
          '............',
          '...mmmmmm...',
          '..mMWMmMMMm.',
          '.mMMMmMMmMMm',
          '.mMmMMMmMMMm',
          '.mMMmMMMMmMm',
          '.mMMMmMMmMMm',
          '..mMMMMmMMm.',
          '...mmmmMMm..',
          '.......mm...',
          '............',
        ]),
        // three arrows: more projectiles
        parallelism: still([
          '............',
          '.....WW.....',
          '....CCCC....',
          '..W..CC..W..',
          '.CCC.CC.CCC.',
          '..C..CC..C..',
          '..C..CC..C..',
          '..C..CC..C..',
          '..c..cc..c..',
          '..c..cc..c..',
          '............',
          '............',
        ]),
        // window with a stretch arrow: range
        contextWindow: still([
          '............',
          '.BBBBBBBBBB.',
          '.BBBBBBBBBB.',
          '.BddddddddB.',
          '.BddddddddB.',
          '.BdWddddWdB.',
          '.BWWWWWWWWB.',
          '.BdWddddWdB.',
          '.BddddddddB.',
          '.BddddddddB.',
          '.BBBBBBBBBB.',
          '............',
        ]),
        // heart with a plus: health and regen
        redundancy: still([
          '............',
          '.KKK....KKK.',
          'KRRRK..KRRRK',
          'KRWRRKKRRRRK',
          'KRRRRWWRRRRK',
          'KRRRWWWWRRRK',
          '.KRRWWWWRRK.',
          '..KRRWWRRK..',
          '...KRRRRK...',
          '....KRRK....',
          '.....KK.....',
          '............',
        ]),
        // fast-forward chevrons: speed
        lowLatency: still([
          '............',
          '............',
          '.ee...GG....',
          '..ee...GG...',
          '...ee...GG..',
          '....ee...GG.',
          '....ee...GG.',
          '...ee...GG..',
          '..ee...GG...',
          '.ee...GG....',
          '............',
          '............',
        ]),
        // shield with a check: debuff resistance
        alignment: still([
          '............',
          '.KKKKKKKKKK.',
          '.KBBBBBBBBK.',
          '.KBBBBBBWBK.',
          '.KBBBBBWWBK.',
          '.KBWBBWWBBK.',
          '.KBWWWWBBBK.',
          '..KBWWBBBK..',
          '..KBBBBBBK..',
          '...KBBBBK...',
          '....KBBK....',
          '.....KK.....',
        ]),
      },

      classes: {
        transformer: still(transformer), // balanced: attention matrix
        diffusion: still(diffusion), // tank: noise resolving into a solid block
        // assassin: a fast cursor
        agent: still([
          '....K.......',
          '....KK......',
          '....KWK.....',
          'RR..KWWK....',
          '....KWWWK...',
          'RRR.KWWWWK..',
          '....KWWWWWK.',
          '.RR.KWWWKKK.',
          '....KWKKWK..',
          '....KK.KWK..',
          '........KWK.',
          '.........KK.',
        ]),
      },

      logo: still(logo), // 64x12

      // Default body per class, 16x16 with 'T', same format as ai. A chosen skin replaces it.
      classAi: {
        transformer: { frames: EYE.map(ai), fps: 4 },
        diffusion: { frames: diffusionAi, fps: 4 },
        agent: { frames: agentAi, fps: 4 },
      },

      thrown: {
        hallucination: { frames: orb('p', 'P', 4, (x, y, d, f, turn) => (d < 1 ? 'W' : d < 2.6 && turn < 1 ? 'M' : null)), fps: 12 },
        sessionLimit: {
          frames: orb('c', 'C', 2, (x, y, d, f) =>
            d < 2.6 && (f ? Math.abs(x - 3.5) === Math.abs(y - 3.5) : x === 3 || x === 4 || y === 3 || y === 4) ? 'W' : null),
          fps: 6,
        },
        promptInjection: { frames: orb('e', 'G', 4, (x, y, d, f, turn) => (d < 1 ? 'W' : d >= 2.6 && turn < 1 ? 'W' : null)), fps: 12 },
      },

      // 12x8, drawn above the #1 AI. A glint runs across, then a pause frame.
      crown: {
        frames: [0, 1, 2, 3].map(f => CROWN.map((r, y) => (f < 3 && y === 4 ? r.slice(0, 2 + 4 * f) + 'W' + r.slice(3 + 4 * f) : r))),
        fps: 6,
      },
    },

    // Homage skins: fictional names, colors and motifs only, no logos. Unlocked by lifetime XP;
    // tier 1..9 is the unlock order, the client maps tiers to XP thresholds.
    skins: {
      coralTerminal: skin('Coral Terminal', 1, { T: 'a', S: 'A' }, rowsOver({
        11: '.....W..........',
        12: '.....AWAA.A.....',
        13: '.....W.WWW......',
      })),
      monolith: skin('Monolith', 2, { T: 'o', S: 'w', d: 'K' }),
      deepDiver: skin('Deep Diver', 3, { T: 'b', S: 'L' }, rowsOver({
        0: '.............L..',
        1: '..............L.',
        2: '.............L..',
      })),
      violetPrism: skin('Violet Prism', 4, { T: 'v', S: 'p' }, (x, y, ch) => (ch === 'T' && (x + y) % 5 === 0 ? 'V' : null)),
      tradewind: skin('Tradewind', 5, { T: 'Y' }, (x, y, ch) => (ch === 'T' ? ((y >> 1) % 2 ? 'O' : 'Y') : null)),
      twinStar: skin('Twin Star', 6, { T: 'B' }, (x, y, ch) =>
        plus(x, y, 5, 3) || plus(x, y, 11, 11) ? 'W' : ch === 'T' && x >= 8 ? 'P' : null),
      woolly: skin('Woolly', 7, { T: 'i', S: 'h' }, (x, y, ch) =>
        rowsOver({ 0: '...Kh......hK...' })(x, y) || (ch === 'T' && (x + 2 * y) % 4 === 0 ? 'h' : null)),
      argon: skin('Argon', 8, { T: 'q', K: 'l' }),
      overlord: skin('Overlord', 9, { T: 'Y', S: 'y', d: 'r' }, rowsOver({
        0: '.....Y.YY.Y.....',
        1: '.......RR.......',
      })),
    },

    // One-shot (loop: false) or looping effects, drawn centered on the target. Same grid format as sprites.
    // size = drawn width as a multiple of the target AI's radius (the ai sprite itself is drawn at 2.3).
    fx: {
      firewall: { frames: firewall, fps: 8, loop: true, size: 2.6 }, // over the AI
      sessionLimit: { frames: sessionLimit, fps: 4, loop: true, size: 2.6 }, // over the AI
      gpuBoost: { frames: gpuBoost, fps: 12, loop: true, size: 2.6 }, // over the AI
      hallucination: { frames: swirl, fps: 10, loop: true, size: 1.6 }, // 16x16, above the head
      muzzle: { // 8x8, uses 'T', at the shooter's rim in the firing direction
        frames: [
          [
            '........',
            '...TT...',
            '..TWWT..',
            '.TWWWWT.',
            '.TWWWWT.',
            '..TWWT..',
            '...TT...',
            '........',
          ],
          [
            'T......T',
            '.T.TT.T.',
            '..T..T..',
            '.T....T.',
            '.T....T.',
            '..T..T..',
            '.T.TT.T.',
            'T......T',
          ],
          [
            '........',
            '.T....T.',
            '........',
            '........',
            '........',
            '........',
            '.T....T.',
            '........',
          ],
        ],
        fps: 20,
        loop: false,
        size: 1,
      },
      // 6x6 data bit; the client spawns a few and moves them from the Prompt Injection target to the thrower.
      stealBit: {
        frames: [
          ['......', '..GG..', '.GWWG.', '.GWWG.', '..GG..', '......'],
          ['......', '..ee..', '.eGGe.', '.eGGe.', '..ee..', '......'],
        ],
        fps: 8,
        loop: true,
        size: 0.5,
      },
      // Optional extra layers: the client already draws these procedurally.
      deleted: { frames: deleted, fps: 12, loop: false, size: 4.6 }, // 32x32, uses 'T'
      reboot: { frames: reboot, fps: 12, loop: false, size: 2.3 }, // 16x16, same footprint as the ai sprite, uses 'T'
      levelUp: { frames: levelUp, fps: 12, loop: false, size: 4.6 }, // 32x32
      hit: {
        frames: [
          [
            '........',
            '........',
            '...WW...',
            '..WWWW..',
            '..WWWW..',
            '...WW...',
            '........',
            '........',
          ],
          [
            'Y......Y',
            '.Y.YY.Y.',
            '..YWWY..',
            '.YWWWWY.',
            '.YWWWWY.',
            '..YWWY..',
            '.Y.YY.Y.',
            'Y......Y',
          ],
          [
            'O......O',
            '........',
            '...OO...',
            '..O..O..',
            '..O..O..',
            '...OO...',
            '........',
            'O......O',
          ],
        ],
        fps: 15,
        loop: false,
        size: 1,
      },
    },

    decor: {
      serverRack: still(serverRack),
      coolingVent: still(coolingVent),
      cableHatch: still(cableHatch),
      floorLight: still(floorLight),
    },

    // For 'noise', freq is a lowpass cutoff sweep (start -> end), not a pitch.
    sfx: {
      shoot: { wave: 'square', freq: [1400, 300], dur: 0.07, vol: 0.12 },
      hit: [
        { wave: 'noise', freq: [4000, 600], dur: 0.05, vol: 0.3 },
        { wave: 'square', freq: [200, 70], dur: 0.07, vol: 0.18 },
      ],
      collect: { wave: 'triangle', freq: [900, 1800], dur: 0.06, vol: 0.25 },
      levelUp: notes([523, 659, 784, 1047], 0.08, 0.2, 0.15),
      pickup: [
        { wave: 'square', freq: [600, 600], dur: 0.05, vol: 0.15 },
        { wave: 'square', freq: [900, 900], dur: 0.05, vol: 0.15 },
        { wave: 'square', freq: [1200, 1800], dur: 0.1, vol: 0.15 },
      ],
      itemUse: { wave: 'sawtooth', freq: [250, 1000], dur: 0.18, vol: 0.15 },
      hallucination: [
        { wave: 'sine', freq: [1000, 400], dur: 0.15, vol: 0.3 },
        { wave: 'sine', freq: [400, 900], dur: 0.15, vol: 0.3 },
        { wave: 'sine', freq: [900, 250], dur: 0.25, vol: 0.3 },
      ],
      sessionLimit: [
        { wave: 'square', freq: [880, 880], dur: 0.1, vol: 0.15 },
        { wave: 'square', freq: [660, 660], dur: 0.1, vol: 0.15 },
        { wave: 'triangle', freq: [440, 40], dur: 0.45, vol: 0.3 },
      ],
      promptInjection: [
        { wave: 'sawtooth', freq: [150, 1800], dur: 0.07, vol: 0.15 },
        { wave: 'noise', freq: [6000, 6000], dur: 0.04, vol: 0.2 },
        { wave: 'sawtooth', freq: [1800, 150], dur: 0.07, vol: 0.15 },
        { wave: 'noise', freq: [6000, 1000], dur: 0.06, vol: 0.2 },
      ],
      deleted: [
        { wave: 'noise', freq: [5000, 200], dur: 0.35, vol: 0.35 },
        { wave: 'square', freq: [300, 30], dur: 0.5, vol: 0.2 },
      ],
      reboot: [
        { wave: 'triangle', freq: [110, 220], dur: 0.08, vol: 0.3 },
        { wave: 'triangle', freq: [220, 440], dur: 0.08, vol: 0.3 },
        { wave: 'square', freq: [440, 880], dur: 0.12, vol: 0.15 },
        { wave: 'square', freq: [880, 880], dur: 0.1, vol: 0.12 },
      ],
      takeover: notes([523, 659, 784, 1047, 784, 1047], 0.1, 0.5, 0.18),
      click: { wave: 'square', freq: [1500, 1500], dur: 0.025, vol: 0.1 },
      countdown: { wave: 'square', freq: [660, 660], dur: 0.12, vol: 0.15 }, // one per 3-2-1 tick
      go: notes([880, 1320], 0.08, 0.3, 0.18),
      finalAlarm: notes([700, 950, 700, 950], 0.14, 0.14, 0.12, 'sawtooth'), // last 30 s
    },

    // Menu loop, same shape as music: calmer D minor (Dm-Bb-F-C), no kick or snare.
    menuMusic: {
      bpm: 90,
      steps: 64,
      tracks: [
        {
          wave: 'triangle', vol: 0.3, // bass
          notes: seq(
            'D2 - - - - - - - D3 - - - A2 - - - ' +
            'A#1 - - - - - - - A#2 - - - F2 - - - ' +
            'F2 - - - - - - - F3 - - - C3 - - - ' +
            'C2 - - - - - - - C3 - - - G2 - - -'
          ),
        },
        {
          wave: 'square', vol: 0.04, // arpeggio
          notes: seq(
            'D4 - F4 - A4 - F4 - D4 - F4 - A4 - D5 - ' +
            'D4 - F4 - A#4 - F4 - D4 - F4 - A#4 - D5 - ' +
            'C4 - F4 - A4 - F4 - C4 - F4 - A4 - C5 - ' +
            'C4 - E4 - G4 - E4 - C4 - E4 - G4 - C5 -'
          ),
        },
        {
          wave: 'sine', vol: 0.12, // lead
          notes: seq(
            'A5 - - - - - - - G5 - - - F5 - - - ' +
            'F5 - - - - - - - D5 - - - - - - - ' +
            'C5 - - - - - - - F5 - - - A5 - - - ' +
            'G5 - - - - - - - E5 - - - - - - -'
          ),
        },
        { wave: 'noise', vol: 0.12, notes: seq('- - C8 - '.repeat(16)) }, // soft hats
      ],
    },

    // 4 bars of Am-F-C-G. One step = one 16th note (60 / bpm / 4 s); loop = 64 steps = 8 s at 120 bpm.
    // Noise track: the note's pitch is the lowpass cutoff. C3 = kick, C6 = snare, C8 = hat.
    music: {
      bpm: 120,
      steps: 64,
      tracks: [
        {
          wave: 'triangle', vol: 0.35, // bass
          notes: seq(
            'A2 - A3 - A2 - A3 - A2 - A3 - A2 - A3 - ' +
            'F2 - F3 - F2 - F3 - F2 - F3 - F2 - F3 - ' +
            'C3 - C4 - C3 - C4 - C3 - C4 - C3 - C4 - ' +
            'G2 - G3 - G2 - G3 - G2 - G3 - G2 - G3 -'
          ),
        },
        {
          wave: 'square', vol: 0.05, // arpeggio
          notes: seq(
            'A4 C5 E5 C5 '.repeat(4) + 'A4 C5 F5 C5 '.repeat(4) +
            'G4 C5 E5 C5 '.repeat(4) + 'G4 B4 D5 B4 '.repeat(4)
          ),
        },
        {
          wave: 'square', vol: 0.08, // lead
          notes: seq(
            'E5 - - - A5 - - - G5 - E5 - D5 - E5 - ' +
            'C5 - - - F5 - - - E5 - C5 - A4 - C5 - ' +
            'E5 - - - G5 - - - C6 - B5 - G5 - E5 - ' +
            'D5 - - - B4 - - - D5 - G5 - F5 - D5 -'
          ),
        },
        {
          wave: 'noise', vol: 0.3, // drums
          notes: seq(
            'C3 - C8 - C6 - C8 - C3 - C3 C8 C6 - C8 C8 '.repeat(3) +
            'C3 - C8 - C6 - C8 - C3 - C6 - C6 C6 C6 C6'
          ),
        },
      ],
    },
  };
})();
