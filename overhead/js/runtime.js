/* Overhead Studio: the runtime. Draws the game, plays sound, reads keyboard and touch, and
   hosts the engine worker. Used by the editor's Play mode and copied as-is into exported games,
   so it is one self-contained function that uses nothing from the rest of the editor. */
window.OV = window.OV || {};
window.OV.runtimeFactory = function () {
  'use strict';
  const STEP = 1 / 60, RAD = Math.PI / 180;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
  const TEXT_FONT = '"Pixelify Sans","IBM Plex Sans",system-ui,sans-serif';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function fitCanvas(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return dpr;
  }

  /* ---------- images ---------- */
  const imgs = new Map();
  let onImage = null;
  function image(src) {
    if (!src) return null;
    let im = imgs.get(src);
    if (!im) { im = new Image(); im.onload = () => { if (onImage) onImage(); }; im.src = src; imgs.set(src, im); if (imgs.size > 6000) imgs.delete(imgs.keys().next().value); }
    return im;
  }
  const ready = im => im && im.complete && im.naturalWidth > 0;

  // Lookup tables for drawing a project.
  function makeEnv(project) {
    const env = { project: project, types: {}, sprites: {}, tilesets: {}, pixel: project.settings.pixelArt !== false, editor: false };
    project.types.forEach(t => (env.types[t.id] = t));
    project.sprites.forEach(s => (env.sprites[s.id] = s));
    project.tilesets.forEach(t => (env.tilesets[t.id] = t));
    return env;
  }

  /* ---------- drawing one object ----------
     r = { t: typeId, x, y, w, h, a: angle, o: opacity, f: flipped, an: animation index, fr: frame, tx: text, fl: flashing } */
  function drawInst(ctx, r, env, now) {
    const type = env.types[r.t]; if (!type) return;
    let alpha = r.o == null ? 1 : r.o;
    if (r.fl && Math.floor((now || 0) / 70) % 2) alpha *= 0.25;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(env.pixel ? Math.round(r.x) : r.x, env.pixel ? Math.round(r.y) : r.y);
    if (r.a) ctx.rotate(r.a * RAD);
    if (r.f) ctx.scale(-1, 1);
    const spr = type.look === 'sprite' ? env.sprites[type.spriteId] : null;
    if (spr) {
      const a = spr.anims[r.an || 0] || spr.anims[0];
      const src = a && a.frames[Math.min(r.fr || 0, a.frames.length - 1)];
      const im = image(src), sx = r.w / spr.w, sy = r.h / spr.h;
      if (ready(im)) ctx.drawImage(im, -spr.ox * sx, -spr.oy * sy, r.w, r.h);
      else if (env.editor) { ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.5; ctx.strokeRect(-spr.ox * sx, -spr.oy * sy, r.w, r.h); }
    } else if (type.look === 'sprite') {
      if (env.editor) { ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.5; ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h); }
    } else if (type.look === 'glyph') {
      const s = Math.min(r.w, r.h) * 0.9;
      ctx.font = s + 'px ' + EMOJI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = type.color || '#ffffff';
      ctx.fillText(type.glyph || '?', 0, s * 0.06);
    } else if (type.look === 'text') {
      const T = type.text || {}, size = +T.size || 10, lines = String(r.tx != null ? r.tx : T.value || '').split('\n');
      ctx.font = '500 ' + size + 'px ' + TEXT_FONT; ctx.textBaseline = 'top';
      ctx.textAlign = T.align === 'center' ? 'center' : T.align === 'right' ? 'right' : 'left';
      const ax = T.align === 'center' ? r.w / 2 : T.align === 'right' ? r.w : 0;
      lines.forEach((ln, k) => {
        const y = k * size * 1.25;
        if (T.outline !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.5, size / 5); ctx.strokeStyle = 'rgba(12,14,20,0.9)'; ctx.strokeText(ln, ax, y); }
        ctx.fillStyle = T.color || '#ffffff'; ctx.fillText(ln, ax, y);
      });
      if (env.editor) { ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.5; ctx.strokeRect(0, 0, r.w, r.h); }
    } else {
      ctx.fillStyle = type.color || '#888888';
      if (type.shape === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
    }
    ctx.restore();
  }

  /* ---------- tiles: each layer is painted once onto its own canvas, then drawn as one picture ---------- */
  function tileCanvas(L, ts) {
    const im = image(ts.src);
    if (!ready(im)) return null;
    const c = document.createElement('canvas'); c.width = Math.max(1, L.cols * ts.tw); c.height = Math.max(1, L.rows * ts.th);
    const x = c.getContext('2d');
    for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
      const v = L.data[ty * L.cols + tx]; if (!v) continue;
      const k = v - 1; x.drawImage(im, (k % ts.cols) * ts.tw, Math.floor(k / ts.cols) * ts.th, ts.tw, ts.th, tx * ts.tw, ty * ts.th, ts.tw, ts.th);
    }
    return c;
  }

  /* ---------- sound: tiny synth for effects, plus imported audio files ---------- */
  function Audio() {
    let ac = null, master = null, music = null, musicId = null;
    const buffers = {};
    function ctx() {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ac = new C(); } catch (e) { return null; } master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination); }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return ac;
    }
    function synth(p, vol) {
      const a = ctx(); if (!a) return;
      const t0 = a.currentTime + 0.005, dur = clamp(+p.dur || 0.2, 0.02, 4), wave = p.wave || 'square';
      let v = (p.vol == null ? 0.5 : +p.vol) * (vol == null ? 1 : vol) * (wave === 'square' || wave === 'sawtooth' ? 0.45 : 1);
      v = Math.max(0.0002, v);
      const g = a.createGain(), att = clamp(+p.attack || 0.004, 0.001, dur * 0.8);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + att);
      if (p.sustain) g.gain.setValueAtTime(v, t0 + dur * clamp(+p.sustain, 0, 0.95));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      g.connect(master);
      let src; const f0 = Math.max(20, +p.freq || 440), f1 = Math.max(20, +p.freqEnd || f0);
      if (wave === 'noise') {
        const len = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        src = a.createBufferSource(); src.buffer = buf;
        const flt = a.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(Math.min(f0 * 4, 12000), t0); flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1 * 2), t0 + dur);
        src.connect(flt); flt.connect(g);
      } else {
        src = a.createOscillator(); src.type = wave;
        const arp = Array.isArray(p.arp) && p.arp.length ? p.arp : null;
        if (arp) arp.forEach((m, k) => src.frequency.setValueAtTime(f0 * m, t0 + dur * k / arp.length));
        else { src.frequency.setValueAtTime(f0, t0); if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1, t0 + dur); }
        src.connect(g);
      }
      src.start(t0); src.stop(t0 + dur + 0.03);
    }
    function loadFile(s) {
      const a = ctx(); if (!a) return Promise.resolve(null);
      if (buffers[s.id]) return buffers[s.id];
      return (buffers[s.id] = fetch(s.src).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => a.decodeAudioData(b, res, rej))).catch(() => null));
    }
    function play(s, vol) {
      if (!s) return;
      if (s.kind === 'file') { loadFile(s).then(buf => { const a = ctx(); if (!buf || !a) return; const n = a.createBufferSource(), g = a.createGain(); g.gain.value = (s.vol == null ? 0.8 : s.vol) * (vol == null ? 1 : vol); n.buffer = buf; n.connect(g); g.connect(master); n.start(); }); }
      else synth(s.p || {}, vol);
    }
    function stopMusic() { if (music) { try { music.stop(); } catch (e) {} music = null; } musicId = null; }
    function playMusic(s) {
      if (!s) { stopMusic(); return; }
      if (musicId === s.id) return;
      stopMusic(); musicId = s.id;
      if (s.kind !== 'file') { play(s); return; }
      loadFile(s).then(buf => { const a = ctx(); if (!buf || !a || musicId !== s.id) return; const n = a.createBufferSource(), g = a.createGain(); g.gain.value = s.vol == null ? 0.5 : s.vol; n.buffer = buf; n.loop = true; n.connect(g); g.connect(master); n.start(); music = n; });
    }
    return { play: play, music: playMusic, stopMusic: stopMusic, unlock: ctx, close() { stopMusic(); } };
  }
  const audio = Audio();

  /* ---------- checking scripts for typos before the game starts ----------
     A typo in one script must not stop the others, so each one is checked on its own first.
     Fast path: ask the browser to parse it. Where that is not allowed, or to learn the line
     number, the script is loaded alone in a throwaway worker. */
  let canParse = null;
  function parses(src) {
    if (canParse === null) { try { new Function(''); canParse = true; } catch (e) { canParse = false; } }
    if (!canParse) return null;
    try { new Function(src); return true; } catch (e) { return e instanceof SyntaxError ? e.message : true; }
  }
  function probe(src) {
    return new Promise(res => {
      let url, w, done = false;
      const end = r => { if (done) return; done = true; try { w && w.terminate(); } catch (e) {} if (url) URL.revokeObjectURL(url); res(r); };
      try {
        url = URL.createObjectURL(new Blob(['self.__def = function () {};\n' + src + '\nself.postMessage(1);'], { type: 'text/javascript' }));
        w = new Worker(url);
        w.onmessage = () => end({ ok: true });
        w.onerror = e => { e.preventDefault(); end({ ok: false, message: String(e.message || 'Syntax error').replace(/^Uncaught\s+/, ''), line: e.lineno ? e.lineno - 1 : null }); };
        setTimeout(() => end({ ok: true }), 4000);
      } catch (e) { end({ ok: true }); }
    });
  }
  function checkUnits(list) {
    const units = list.map(u => Object.assign({}, u)), jobs = [];
    units.forEach(u => {
      const r = parses(u.src);
      if (r === true) return;
      if (typeof r === 'string') u.bad = r;
      jobs.push(probe(u.src).then(p => { if (!p.ok) { u.bad = p.message; if (u.kind === 'script' && p.line) u.badLine = Math.max(1, p.line - (u.lineOffset || 0)); } else if (r === null) delete u.bad; }));
    });
    return Promise.all(jobs).then(() => units);
  }

  /* ---------- particles ---------- */
  const BURST = {
    spark: { n: 8, speed: 70, life: 0.3, size: 2, colors: ['#fff3b0', '#ffd166', '#ff9f43'] },
    sparkle: { n: 10, speed: 45, life: 0.5, size: 2, colors: ['#ffffff', '#ffe08a', '#9be7ff'], g: -30 },
    hit: { n: 6, speed: 80, life: 0.22, size: 2, colors: ['#ffffff', '#ff8b8b'] },
    smoke: { n: 10, speed: 28, life: 0.7, size: 3, colors: ['#e3e6ea', '#aab0bb', '#737a87'], g: -18 },
    dust: { n: 6, speed: 22, life: 0.4, size: 2, colors: ['#d8c9a8', '#b9a888'] },
    explosion: { n: 28, speed: 120, life: 0.6, size: 3, colors: ['#ffffff', '#ffd166', '#ff7b39', '#c0392b', '#4a4a4a'] },
    heal: { n: 8, speed: 30, life: 0.7, size: 2, colors: ['#ff6b8b', '#ffb3c1'], g: -40 },
  };

  /* ================= start a game ================= */
  function start(opts) {
    const canvas = opts.canvas, project = opts.project, ctx = canvas.getContext('2d');
    const env = makeEnv(project), S = project.settings, VW = +S.viewW || 288, VH = +S.viewH || 176;
    const roomsById = {}; project.rooms.forEach(r => (roomsById[r.id] = r));
    const soundsById = {}; project.sounds.forEach(s => (soundsById[s.id] = s));
    let worker = null, urls = [], frame = null, waiting = false, sentAt = 0, acc = 0, last = 0, raf = 0, dead = false, stuck = false;
    let paused = false, speed = 1, stepOnce = false, fade = 0, pickedId = null, fps = 60, fpsN = 0, fpsT = 0;
    const flags = { hit: false, paths: false };
    const keys = new Set(); let pressed = {}, released = {}, taps = [];
    const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; const btn = { A: null, B: null }; let showTouch = false;
    let view = { scale: 1, offx: 0, offy: 0, left: 0, top: 0, zoom: 1 };
    let particles = []; const tileCache = new Map();
    const report = e => opts.onError && opts.onError(e);

    function cleanup() { if (worker) { worker.terminate(); worker = null; } urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
    let bootId = 0;
    function boot() {
      cleanup(); frame = null; waiting = false; stuck = false; acc = 0; particles = []; tileCache.clear(); pickedId = null; audio.stopMusic();
      const mine = ++bootId;
      checkUnits(opts.units || []).then(units => { if (!dead && mine === bootId) launch(units); });
    }
    function launch(checked) {
      // Scripts and expressions are appended to the engine's own source, so the whole game is one
      // worker script. That works everywhere, including a game file opened straight from disk.
      let line = opts.engineSrc.split('\n').length + 1, code = opts.engineSrc + '\n';
      const units = checked.map(u => {
        const meta = { key: u.key, kind: u.kind, typeId: u.typeId, sheetId: u.sheetId, eventId: u.eventId, name: u.name, bad: !!u.bad };
        if (u.bad) { report({ kind: u.kind, typeId: u.typeId, sheetId: u.sheetId, eventId: u.eventId, name: u.name, line: u.badLine || null, message: 'There is a typo here, so it was skipped. ' + u.bad }); return meta; }
        meta.start = line; meta.lines = u.src.split('\n').length; line += meta.lines; code += u.src + '\n';
        return meta;
      });
      const eu = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); urls.push(eu);
      try { worker = new Worker(eu); }
      catch (e) { report({ message: 'This browser would not start the game engine: ' + e.message }); stuck = true; return; }
      worker.onmessage = ev => {
        const m = ev.data; if (m.type !== 'frame') return;
        const prev = frame ? frame.state : 'playing', prevRoom = frame ? frame.room : null;
        frame = m; waiting = false;
        if (opts.onLog) m.logs.forEach(l => opts.onLog(l));
        m.errors.forEach(report);
        m.fx.forEach(doFx);
        if (m.room !== prevRoom && opts.onRoom) opts.onRoom(m.room);
        if (m.state !== prev && opts.onState) opts.onState(m.state, m.message);
        if (opts.onFrame) opts.onFrame(m, { fps: fps, paused: paused });
      };
      worker.onerror = ev => { ev.preventDefault(); report({ message: 'Engine error: ' + ev.message }); };
      const light = {
        settings: S, globals: project.globals, sheets: project.sheets, rooms: project.rooms,
        sounds: project.sounds.map(s => ({ id: s.id, name: s.name })),
        sprites: project.sprites.map(s => ({ id: s.id, w: s.w, h: s.h, ox: s.ox, oy: s.oy, hit: s.hit, anims: s.anims.map(a => ({ name: a.name, fps: a.fps, loop: a.loop !== false, n: a.frames.length, times: a.times && a.times.length === a.frames.length ? a.times : undefined })) })),
        tilesets: project.tilesets.map(t => ({ id: t.id, tw: t.tw, th: t.th, solid: t.solid })),
        types: project.types.map(t => Object.assign({}, t, { script: undefined })),
      };
      worker.postMessage({ type: 'init', project: light, units: units, roomId: opts.roomId || S.startRoom, debug: !!opts.debug });
      waiting = true; sentAt = performance.now();
    }
    function doFx(f) {
      if (f.k === 'sound') audio.play(soundsById[f.id]);
      else if (f.k === 'music') audio.music(f.id ? soundsById[f.id] : null);
      else if (f.k === 'room') fade = 1;
      else if (f.k === 'burst') {
        const b = BURST[f.preset] || BURST.spark;
        for (let k = 0; k < b.n; k++) {
          const a = Math.random() * 6.2832, sp = b.speed * (0.4 + Math.random() * 0.6), life = b.life * (0.6 + Math.random() * 0.4);
          particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life, max: life, size: b.size, g: b.g || 0, color: b.colors[Math.floor(Math.random() * b.colors.length)] });
        }
        if (particles.length > 800) particles.splice(0, particles.length - 800);
      }
    }

    /* ----- input ----- */
    function readInput() {
      let ax = 0, ay = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) ax -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) ax += 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) ay -= 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) ay += 1;
      if (stick.id !== null) { const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy); if (d > 6) { const r = Math.max(d, 44); ax = dx / r; ay = dy / r; } }
      const down = {}; keys.forEach(k => (down[k] = true));
      const out = { ax: ax, ay: ay, down: down, pressed: pressed, released: released, taps: taps };
      pressed = {}; released = {}; taps = [];
      return out;
    }
    const ended = () => stuck || (frame && frame.state !== 'playing');
    const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    function press(code) { if (!keys.has(code)) pressed[code] = true; keys.add(code); }
    function release(code) { if (keys.has(code)) released[code] = true; keys.delete(code); }
    function onKeyDown(e) {
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      audio.unlock();
      if (e.code === 'Escape' && opts.onExit) { e.preventDefault(); opts.onExit(); return; }
      if (e.code === 'KeyR' && ended()) { boot(); return; }
      if (/^(Arrow|Space|Key|Digit|Enter|Shift)/.test(e.code)) { e.preventDefault(); press(e.code); }
    }
    function onKeyUp(e) { release(e.code); }
    function onBlur() { keys.forEach(k => (released[k] = true)); keys.clear(); }
    function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    const toWorld = p => ({ x: (p.x - view.offx) / (view.scale * view.zoom) + view.left, y: (p.y - view.offy) / (view.scale * view.zoom) + view.top, sx: (p.x - view.offx) / view.scale, sy: (p.y - view.offy) / view.scale });
    function btnAt(p) {
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (Math.hypot(p.x - (cw - 62), p.y - (ch - 78)) < 36) return 'A';
      if (Math.hypot(p.x - (cw - 132), p.y - (ch - 50)) < 30) return 'B';
      return null;
    }
    function onDown(e) {
      audio.unlock();
      if (ended()) { boot(); return; }
      const p = local(e);
      if (e.pointerType !== 'mouse') {
        showTouch = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        const b = btnAt(p);
        if (b) { btn[b] = e.pointerId; press(b === 'A' ? 'Space' : 'KeyE'); return; }
        if (p.x < canvas.clientWidth * 0.5 && stick.id === null && !(frame && frame.dialog)) { stick.id = e.pointerId; stick.ox = stick.x = p.x; stick.oy = stick.y = p.y; return; }
      }
      const w = toWorld(p);
      taps.push(w);
      if (opts.debug && frame) {
        let hit = null;
        for (const r of frame.insts) { const m = boxOf(r); if (w.x >= m.x && w.x <= m.x + r.w && w.y >= m.y && w.y <= m.y + r.h) hit = r; }
        pickedId = hit ? hit.id : null; worker && worker.postMessage({ type: 'inspect', id: pickedId, reply: paused });
        if (opts.onPick) opts.onPick(pickedId);
      }
    }
    function onMove(e) { if (e.pointerId === stick.id) { const p = local(e); stick.x = p.x; stick.y = p.y; } }
    function onUp(e) {
      if (e.pointerId === stick.id) stick.id = null;
      if (e.pointerId === btn.A) { btn.A = null; release('Space'); }
      if (e.pointerId === btn.B) { btn.B = null; release('KeyE'); }
    }
    function boxOf(r) {
      const type = env.types[r.t], spr = type && type.look === 'sprite' ? env.sprites[type.spriteId] : null;
      if (spr) return { x: r.x - spr.ox * (r.w / spr.w), y: r.y - spr.oy * (r.h / spr.h) };
      if (type && type.look === 'text') return { x: r.x, y: r.y };
      return { x: r.x - r.w / 2, y: r.y - r.h / 2 };
    }
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);

    /* ----- main loop ----- */
    function loop(now) {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
      fpsN++; fpsT += dt; if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
      if (worker && !stuck) {
        if (waiting) {
          if (now - sentAt > 2500) {
            stuck = true; cleanup();
            report({ message: 'The game froze, so it was stopped. A script is probably stuck in a loop that never ends. Check any while or for loops.' });
            if (opts.onState) opts.onState('stuck');
          }
        } else if (frame && frame.state === 'playing') {
          let n = 0;
          if (paused) { if (stepOnce) { n = 1; stepOnce = false; } }
          else { acc += dt * speed; n = Math.min(5, Math.floor(acc / STEP)); acc -= n * STEP; if (acc > STEP * 5) acc = 0; }
          if (n > 0) { worker.postMessage({ type: 'step', n: n, input: readInput() }); waiting = true; sentAt = now; }
        }
      }
      for (const p of particles) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
      if (particles.length && particles[0].life <= 0) particles = particles.filter(p => p.life > 0);
      if (fade > 0) fade = Math.max(0, fade - dt / 0.3);
      render(now);
    }

    function render(now) {
      const dpr = fitCanvas(canvas), cw = canvas.width / dpr, ch = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, cw, ch);
      const scale = Math.min(cw / VW, ch / VH), offx = (cw - VW * scale) / 2, offy = (ch - VH * scale) / 2;
      view.scale = scale; view.offx = offx; view.offy = offy;
      ctx.save(); ctx.beginPath(); ctx.rect(offx, offy, VW * scale, VH * scale); ctx.clip();
      const R = frame && roomsById[frame.room];
      if (R) {
        const z = frame.cam.zoom || 1, sh = frame.cam.shake || 0;
        const snap = v => Math.round(v * scale * z) / (scale * z);
        const left = snap(frame.cam.x - VW / 2 / z + (sh ? (Math.random() - 0.5) * 2 * sh : 0)), top = snap(frame.cam.y - VH / 2 / z + (sh ? (Math.random() - 0.5) * 2 * sh : 0));
        view.left = left; view.top = top; view.zoom = z;
        ctx.fillStyle = R.bg || '#000000'; ctx.fillRect(offx, offy, VW * scale, VH * scale);
        ctx.imageSmoothingEnabled = !env.pixel;
        const byLayer = {}; for (const r of frame.insts) (byLayer[r.l] = byLayer[r.l] || []).push(r);
        let lastWorld = -1; R.layers.forEach((L, k) => { if (L.parallax !== 0) lastWorld = k; });
        const world = () => ctx.setTransform(dpr * scale * z, 0, 0, dpr * scale * z, dpr * (offx - left * scale * z), dpr * (offy - top * scale * z));
        R.layers.forEach((L, li) => {
          if (L.visible !== false) {
            const par = L.parallax == null ? 1 : L.parallax, lz = par === 0 ? 1 : z;
            ctx.setTransform(dpr * scale * lz, 0, 0, dpr * scale * lz, dpr * (offx - snap(left * par) * scale * lz), dpr * (offy - snap(top * par) * scale * lz));
            ctx.globalAlpha = L.opacity == null ? 1 : L.opacity;
            if (L.kind === 'tiles') {
              const ts = env.tilesets[L.tilesetId];
              if (ts) { let c = tileCache.get(L.id); if (!c) { c = tileCanvas(L, ts); if (c) tileCache.set(L.id, c); } if (c) ctx.drawImage(c, 0, 0); }
            } else {
              const list = byLayer[li];
              if (list) { if (L.ysort) list.sort((a, b) => a.y - b.y || a.id - b.id); for (const r of list) drawInst(ctx, r, env, now); }
            }
            ctx.globalAlpha = 1;
          }
          if (li === lastWorld) { world(); overlays(frame, scale * z); }
        });
        if (lastWorld < 0) { world(); overlays(frame, scale * z); }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + fade + ')'; ctx.fillRect(offx, offy, VW * scale, VH * scale); }
      if (frame && frame.dialog) drawDialog(frame.dialog, offx, offy, VW * scale, VH * scale, scale, now);
      ctx.restore();
      if (showTouch && !ended()) drawTouch(cw, ch);
      if (!frame && !stuck) banner(cw, ch, 'Loading…', '');
      else if (stuck) banner(cw, ch, 'Game stopped', 'The console says what went wrong.');
      else if (frame.state !== 'playing') banner(cw, ch, frame.message, 'Press R or tap to play again');
      else if (paused) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('PAUSED', cw - 10, 8); }
    }
    // Things drawn on top of the world: particles, speech bubbles, debug outlines.
    function overlays(f, k) {
      for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size); }
      ctx.globalAlpha = 1;
      for (const r of f.insts) if (r.say) bubble(r, k);
      if (opts.debug) {
        for (const r of f.insts) {
          if (flags.hit && r.hb) { ctx.strokeStyle = 'rgba(80,255,160,0.9)'; ctx.lineWidth = 1 / k; ctx.strokeRect(r.x + r.hb[0], r.y + r.hb[1], r.hb[2], r.hb[3]); }
          if (flags.paths && r.path && r.path.length) { ctx.strokeStyle = 'rgba(255,220,90,0.9)'; ctx.lineWidth = 1 / k; ctx.beginPath(); ctx.moveTo(r.x, r.y); r.path.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); }
          if (r.id === pickedId) { const b = boxOf(r); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 / k; ctx.setLineDash([3 / k, 2 / k]); ctx.strokeRect(b.x - 1, b.y - 1, r.w + 2, r.h + 2); ctx.setLineDash([]); }
        }
      }
    }
    function bubble(r, k) {
      const fs = 11 / k, pad = 4 / k, b = boxOf(r);
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      const tw = ctx.measureText(r.say).width, bw = tw + pad * 2, bh = fs + pad * 2, bx = b.x + r.w / 2 - bw / 2, by = b.y - bh - 3 / k;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1b2130'; ctx.lineWidth = 1.2 / k;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3 / k); else ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1b2130'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.say, bx + bw / 2, by + bh / 2 + fs * 0.05);
    }
    function wrap(text, maxW) {
      const out = []; let line = '';
      for (const word of String(text).split(/\s+/)) { const t = line ? line + ' ' + word : word; if (line && ctx.measureText(t).width > maxW) { out.push(line); line = word; } else line = t; }
      if (line) out.push(line); return out;
    }
    function drawDialog(d, x, y, w, h, scale, now) {
      const fs = clamp(Math.round(8.5 * scale), 12, 26), pad = fs * 0.8, bw = w - fs * 1.2;
      ctx.font = '500 ' + fs + 'px ' + TEXT_FONT;
      const lines = wrap(d.text, bw - pad * 2), bh = Math.max(3, lines.length) * fs * 1.3 + pad * 1.6, bx = x + fs * 0.6, by = y + h - bh - fs * 0.6;
      ctx.fillStyle = 'rgba(16,19,28,0.94)'; ctx.strokeStyle = '#f2f4f8'; ctx.lineWidth = Math.max(2, scale);
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, fs * 0.4); else ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (d.who) {
        ctx.font = '700 ' + fs * 0.8 + 'px ' + TEXT_FONT; const nw = ctx.measureText(d.who).width + fs;
        ctx.fillStyle = '#f2f4f8'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx + pad * 0.6, by - fs * 0.7, nw, fs * 1.3, fs * 0.3); else ctx.rect(bx + pad * 0.6, by - fs * 0.7, nw, fs * 1.3); ctx.fill();
        ctx.fillStyle = '#10131c'; ctx.fillText(d.who, bx + pad * 0.6 + fs * 0.5, by - fs * 0.45);
        ctx.font = '500 ' + fs + 'px ' + TEXT_FONT;
      }
      ctx.fillStyle = '#f2f4f8'; lines.forEach((ln, k) => ctx.fillText(ln, bx + pad, by + pad + k * fs * 1.3));
      if (Math.floor(now / 400) % 2) { ctx.textAlign = 'right'; ctx.fillText(d.more ? '▼' : '■', bx + bw - pad, by + bh - fs * 1.4); }
    }
    function drawTouch(cw, ch) {
      ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2;
      const bx = stick.id !== null ? stick.ox : 78, by = stick.id !== null ? stick.oy : ch - 84;
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(bx, by, 44, 0, Math.PI * 2); ctx.stroke();
      let kx = bx, ky = by;
      if (stick.id !== null) { const dx = stick.x - bx, dy = stick.y - by, d = Math.hypot(dx, dy), r = Math.min(d, 44); if (d > 0) { kx = bx + dx / d * r; ky = by + dy / d * r; } }
      ctx.beginPath(); ctx.arc(kx, ky, 19, 0, Math.PI * 2); ctx.fill();
      ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [['A', cw - 62, ch - 78, 30], ['B', cw - 132, ch - 50, 24]].forEach(([n, x, y, r]) => {
        ctx.globalAlpha = btn[n] !== null ? 0.6 : 0.3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#10131c'; ctx.fillText(n, x, y + 1); ctx.fillStyle = '#ffffff';
      });
      ctx.restore();
    }
    function banner(cw, ch, title, sub) {
      ctx.save(); ctx.fillStyle = 'rgba(8,10,14,0.6)'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + clamp(Math.round(cw / 16), 20, 40) + 'px ' + TEXT_FONT; ctx.fillText(title || '', cw / 2, ch / 2 - 14);
      ctx.font = '14px system-ui, sans-serif'; ctx.globalAlpha = 0.8; ctx.fillText(sub, cw / 2, ch / 2 + 24); ctx.restore();
    }

    boot();
    raf = requestAnimationFrame(loop);
    const send = m => { if (worker && !stuck) worker.postMessage(m); };
    return {
      restart: boot,
      setPaused(v) { paused = !!v; acc = 0; }, isPaused: () => paused,
      step() { if (paused) stepOnce = true; },
      setSpeed(v) { speed = +v || 1; },
      setFlag(k, v) { flags[k] = !!v; },
      inspect(id) { pickedId = id; send({ type: 'inspect', id: id, reply: paused }); },
      set(id, prop, value) { send({ type: 'set', id: id, prop: prop, value: value, reply: paused }); },
      setGlobal(name, value) { send({ type: 'setGlobal', name: name, value: value, reply: paused }); },
      call(id, method, args) { send({ type: 'call', id: id, method: method, args: args || [], reply: paused }); },
      stop() {
        dead = true; cancelAnimationFrame(raf); cleanup(); audio.stopMusic();
        window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
        canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      },
    };
  }

  return { start: start, drawInst: drawInst, tileCanvas: tileCanvas, makeEnv: makeEnv, fitCanvas: fitCanvas, image: image, ready: ready, audio: audio, setImageHook(fn) { onImage = fn; }, BURST: BURST };
};
window.OV.Runtime = window.OV.runtimeFactory();
