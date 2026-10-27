// menu-bg.js: a Three.js datacenter under attack, drawn behind the menu so a match already seems to be running.
// Three.js (r128, cdnjs, SRI-pinned) is injected after the menu paints. If it or WebGL fails, the plain menu stays.
// prefers-reduced-motion gets one still frame. The loop idles while the menu or the tab is hidden.
(function () {
  const menu = document.getElementById('menu');
  if (!menu) return;
  const SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const SRI = 'sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Q = matchMedia('(pointer: coarse)').matches
    ? { pixel: 4, racks: 16, ais: 4, sparks: 40 } // touch: chunkier pixels, less of everything
    : { pixel: 3, racks: 28, ais: 6, sparks: 90 };

  const go = () => requestAnimationFrame(() => setTimeout(() => { // runs right after the next paint
    if (window.THREE) return init();
    const s = document.createElement('script');
    s.src = SRC; s.integrity = SRI; s.crossOrigin = 'anonymous';
    s.onload = init; // no onerror: the plain menu stays
    document.head.appendChild(s);
  }));
  if (document.readyState === 'complete') go(); else addEventListener('load', go);

  function init() {
    const T = window.THREE, A = window.ASSETS || {};
    const theme = A.theme || { bg: '#070a12', grid: '#122038', accent: '#3df2ff', danger: '#ff3b4e' };
    const tints = A.playerColors || ['#3df2ff', '#ff3df0', '#ffe14d', '#4dff7a', '#ff9a2b', '#9b7bff'];

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;z-index:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated';
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' }); } catch (e) { return; }
    menu.prepend(canvas);

    const scene = new T.Scene(), camera = new T.PerspectiveCamera(62, 1, 0.1, 100);
    scene.background = new T.Color(theme.bg);
    scene.fog = new T.FogExp2(theme.bg, 0.05);
    scene.add(new T.HemisphereLight(0x3a5a9a, 0x05060d, 0.7));
    const flash = new T.PointLight(0xff9a2b, 0, 16, 2); // ponytail: one shared light for every big blast
    scene.add(flash);

    const floor = new T.Mesh(new T.PlaneGeometry(40, 120), new T.MeshLambertMaterial({ color: 0x0a1020 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -40;
    const grid = new T.GridHelper(120, 60, theme.accent, theme.grid);
    grid.position.set(0, 0.01, -40);
    scene.add(floor, grid);

    // Two rows of racks along the aisle, LEDs on the faces that look into it, a neon trim on top.
    const SP = 2.4, n = Q.racks, m = new T.Object3D(), c = new T.Color();
    const racks = new T.InstancedMesh(new T.BoxGeometry(1.2, 3, 2.1), new T.MeshLambertMaterial({ color: 0x141c2e }), n * 2);
    const leds = new T.InstancedMesh(new T.BoxGeometry(0.02, 0.06, 0.14), new T.MeshBasicMaterial(), n * 24);
    const ledZ = [], redUntil = [], LED = [0x4dff7a, 0x4dff7a, 0x3df2ff, 0xffe14d, 0x0c1a14];
    let ri = 0, li = 0;
    for (const side of [-1, 1]) for (let k = 0; k < n; k++) {
      const z = 4 - k * SP;
      m.position.set(side * 3.2, 1.5, z); m.updateMatrix(); racks.setMatrixAt(ri++, m.matrix);
      for (let r = 0; r < 6; r++) for (let q = 0; q < 2; q++) {
        m.position.set(side * 2.59, 0.45 + r * 0.42, z - 0.75 + q * 0.25); m.updateMatrix();
        leds.setMatrixAt(li, m.matrix); leds.setColorAt(li, c.set(LED[(Math.random() * LED.length) | 0]));
        ledZ[li] = z; redUntil[li++] = 0;
      }
    }
    scene.add(racks, leds);
    for (const side of [-1, 1]) {
      const trim = new T.Mesh(new T.BoxGeometry(0.04, 0.04, n * SP), new T.MeshBasicMaterial({ color: theme.accent }));
      trim.position.set(side * 2.6, 3.02, 4 - (n - 1) * SP / 2);
      scene.add(trim);
    }

    // Soft additive glow sprite, shared by AI halos and explosion flashes.
    const glowTex = (() => {
      const g = document.createElement('canvas'), x = g.getContext('2d');
      g.width = g.height = 64;
      const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(g);
    })();
    const additive = { transparent: true, blending: T.AdditiveBlending, depthWrite: false };
    const glow = (color, size) => {
      const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, ...additive }));
      s.scale.setScalar(size);
      return s;
    };

    // Rogue AIs: glowing cores weaving down the aisle, shooting each other.
    const ais = Array.from({ length: Q.ais }, (_, k) => {
      const color = new T.Color(tints[k % tints.length]), g = new T.Group();
      g.add(new T.Mesh(new T.SphereGeometry(0.28, 12, 8), new T.MeshBasicMaterial({ color })), glow(color, 1.6));
      scene.add(g);
      return { g, color, ph: Math.random() * 7, sp: 0.25 + Math.random() * 0.2, cool: Math.random(), hp: 6, down: 0 };
    });
    const place = (a, t) => a.g.position.set(
      Math.sin(t * a.sp * 1.3 + a.ph) * 1.8,
      1.6 + Math.sin(t * a.sp * 2.1 + a.ph * 2) * 0.9,
      -19 + Math.sin(t * a.sp + a.ph * 3) * 11);

    const boltGeo = new T.BoxGeometry(0.06, 0.06, 0.7), bolts = [];
    function fire(from, to, color, target) {
      let b = bolts.find(b => !b.live);
      if (!b) { b = { m: new T.Mesh(boltGeo, new T.MeshBasicMaterial()) }; scene.add(b.m); bolts.push(b); }
      Object.assign(b, { live: true, t: 0, a: from.clone(), b: to.clone(), target });
      b.m.material.color.copy(color); b.m.visible = true;
      b.m.position.copy(from); b.m.lookAt(to);
    }

    // Explosions: a pool of spark bursts, each with a shockwave ring and a flash sprite. The oldest gets reused.
    const bursts = Array.from({ length: 8 }, () => {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(Q.sparks * 3), 3));
      const b = {
        pts: new T.Points(geo, new T.PointsMaterial({ size: 0.16, ...additive })),
        ring: new T.Mesh(new T.RingGeometry(0.85, 1, 32), new T.MeshBasicMaterial({ side: T.DoubleSide, ...additive })),
        halo: glow(0xffffff, 1), vel: new Float32Array(Q.sparks * 3), age: 1, life: 1, n: 0, big: false,
      };
      b.pts.visible = b.ring.visible = b.halo.visible = false;
      scene.add(b.pts, b.ring, b.halo);
      return b;
    });
    let shake = 0, now = 0;
    function boom(pos, color, big) {
      const b = bursts.reduce((o, x) => (x.age / x.life > o.age / o.life ? x : o));
      Object.assign(b, { age: 0, life: big ? 1.4 : 0.45, n: big ? Q.sparks : Q.sparks >> 2, big });
      const P = b.pts.geometry.attributes.position.array, V = b.vel;
      for (let k = 0; k < b.n; k++) {
        const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u), s = (big ? 3 : 1.4) * (0.4 + Math.random());
        P.set([pos.x, pos.y, pos.z], k * 3);
        V.set([r * Math.cos(th) * s, u * s + (big ? 1.5 : 0.4), r * Math.sin(th) * s], k * 3);
      }
      b.pts.geometry.setDrawRange(0, b.n);
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.color.set(big ? 0xffb35a : color);
      b.ring.material.color.set(color);
      b.halo.material.color.set(big ? 0xffd9a0 : color);
      b.ring.position.copy(pos); b.halo.position.copy(pos);
      b.pts.visible = b.ring.visible = b.halo.visible = true;
      if (!big) return;
      flash.position.copy(pos); flash.color.set(color); flash.intensity = 3;
      shake = 0.2;
      for (let j = 0; j < ledZ.length; j++) if (Math.abs(ledZ[j] - pos.z) < 5) redUntil[j] = now + 2 + Math.random();
    }
    const rackHit = () => new T.Vector3((Math.random() < 0.5 ? -1 : 1) * 2.6, 0.6 + Math.random() * 2.2, -6 - Math.random() * 26);

    let breach = 1.5;
    function step(dt) {
      now += dt;
      for (const a of ais) {
        if (a.down > 0) { // deleted: reboot after a pause
          if ((a.down -= dt) <= 0) { a.hp = 6; a.g.visible = true; place(a, now); boom(a.g.position, a.color, false); }
          continue;
        }
        place(a, now);
        if ((a.cool -= dt) > 0) continue;
        a.cool = 0.35 + Math.random() * 0.6;
        const foes = ais.filter(o => o !== a && o.down <= 0);
        if (!foes.length || Math.random() < 0.2) fire(a.g.position, rackHit(), a.color, null); // stray shot into a rack
        else { const f = foes[(Math.random() * foes.length) | 0]; fire(a.g.position, f.g.position, a.color, f); }
      }
      for (const b of bolts) {
        if (!b.live) continue;
        b.t += dt / 0.35;
        if (b.t < 1) { b.m.position.lerpVectors(b.a, b.b, b.t); continue; }
        b.live = b.m.visible = false;
        const f = b.target;
        if (f && f.down <= 0 && --f.hp <= 0) { boom(f.g.position, f.color, true); f.g.visible = false; f.down = 2.5; }
        else boom(b.b, b.m.material.color, !f && Math.random() < 0.25);
      }
      if ((breach -= dt) <= 0) { breach = 2.5 + Math.random() * 3; boom(rackHit(), 0xff6a2b, true); } // background blasts
      for (const b of bursts) {
        if (b.age >= b.life) continue;
        const k = (b.age += dt) / b.life;
        if (k >= 1) { b.pts.visible = b.ring.visible = b.halo.visible = false; continue; }
        const P = b.pts.geometry.attributes.position.array, V = b.vel;
        for (let q = 0; q < b.n * 3; q += 3) { V[q + 1] -= 4 * dt; P[q] += V[q] * dt; P[q + 1] += V[q + 1] * dt; P[q + 2] += V[q + 2] * dt; }
        b.pts.geometry.attributes.position.needsUpdate = true;
        b.pts.material.opacity = 1 - k;
        b.ring.scale.setScalar(0.2 + k * (b.big ? 3.5 : 1.2)); b.ring.material.opacity = (1 - k) * 0.8; b.ring.lookAt(camera.position);
        b.halo.scale.setScalar((b.big ? 4 : 1.4) * (1 - k * 0.6)); b.halo.material.opacity = Math.max(0, 1 - k * 2);
      }
      for (let k = 0; k < ledZ.length * 0.03; k++) { // blink a few LEDs; ones near a blast flicker red
        const j = (Math.random() * ledZ.length) | 0;
        leds.setColorAt(j, c.set(redUntil[j] > now ? (Math.random() < 0.6 ? theme.danger : 0x1a0508) : LED[(Math.random() * LED.length) | 0]));
      }
      leds.instanceColor.needsUpdate = true;
      flash.intensity *= Math.pow(0.02, dt);
      shake *= Math.pow(0.002, dt);
      const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
      camera.position.set(Math.sin(now * 0.13) * 0.4 + sx, 1.7 + Math.sin(now * 0.21) * 0.15 + sy, -2 + Math.sin(now * 0.05) * 4);
      camera.lookAt(Math.sin(now * 0.09) * 0.6, 1.5, camera.position.z - 10);
    }

    function resize() {
      const w = menu.clientWidth, h = menu.clientHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
      if (!w || !h) return;
      renderer.setSize(Math.max(1, Math.round(w * dpr / Q.pixel)), Math.max(1, Math.round(h * dpr / Q.pixel)), false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (reduced) renderer.render(scene, camera);
    }

    const clock = new T.Clock();
    let raf = 0;
    function frame() {
      raf = 0;
      if (menu.hidden || document.hidden) return; // idle until wake()
      step(Math.min(clock.getDelta(), 0.05));
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    function wake() {
      if (menu.hidden || document.hidden) return;
      resize();
      if (!reduced && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); }
    }
    if (reduced) for (let k = 0; k < 100; k++) step(1 / 30); // still frame: about 3 s into a fight, mid-explosion
    addEventListener('resize', resize);
    new MutationObserver(wake).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('visibilitychange', wake);
    wake();
  }
})();
