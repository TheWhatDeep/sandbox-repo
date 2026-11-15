/* Overhead Studio: bringing art in from outside.
   - Import dialog: one or many image files become finished sprites (grouped into animations by file name)
   - Animated GIFs: decoded here, frame by frame, with their timing
   - Aseprite: the sheet + JSON that Aseprite exports (tags become animations)
   - Helpers shared with the sprite editor: colour removal, frame loading
   Everything ends up as ordinary sprites in the project; nothing new is needed to play them. */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, M = OV.Model, ui = OV.ui, S = OV.state;
  const MAX = 256, MAX_FILES = 200, MAX_FRAMES = 256;
  const I = (OV.Importers = {});
  const mk = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, hh); return c; };
  const ext = name => (/\.([a-z0-9]+)$/i.exec(name || '') || ['', ''])[1].toLowerCase();
  const base = name => String(name || '').replace(/\.[^.]+$/, '');
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  I.kindOf = file => {
    const e = ext(file.name), t = file.type || '';
    if (e === 'gif' || t === 'image/gif') return 'gif';
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(e) || /^image\/(png|jpeg|webp|bmp)$/.test(t)) return 'image';
    if (e === 'json' || t === 'application/json') return 'json';
    if (e === 'aseprite' || e === 'ase') return 'ase';
    if (/^audio\//.test(t) || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(e)) return 'audio';
    return 'other';
  };

  /* ---------- pixels ---------- */
  // Make every pixel close to one colour see-through. tol 0 = exact match only.
  I.removeColour = (canvas, rgb, tol) => {
    const x = canvas.getContext('2d'), im = x.getImageData(0, 0, canvas.width, canvas.height), d = im.data; tol = tol || 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) d[i + 3] = 0;
    x.putImageData(im, 0, 0);
  };
  I.isOpaque = canvas => { const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return false; return true; };
  I.pixel = (canvas, x, y) => { const d = canvas.getContext('2d').getImageData(OV.clamp(x | 0, 0, canvas.width - 1), OV.clamp(y | 0, 0, canvas.height - 1), 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
  const hex = rgb => '#' + rgb.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
  const unhex = s => [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16));
  function bounds(canvases) { // smallest box holding every visible pixel of every frame
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    canvases.forEach(c => {
      const w = c.width, d = c.getContext('2d').getImageData(0, 0, w, c.height).data;
      for (let i = 3, p = 0; i < d.length; i += 4, p++) if (d[i]) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    });
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  async function toCanvas(file) {
    const im = await OV.loadImage(await OV.readFile(file)), c = mk(im.naturalWidth, im.naturalHeight);
    c.getContext('2d').drawImage(im, 0, 0); return c;
  }
  const readBuffer = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Could not read that file.')); fr.readAsArrayBuffer(file); });

  /* ================= GIF decoder =================
     A GIF is a list of small pictures plus rules for layering them. Each picture is a grid of
     colour-table indexes, packed with LZW (a dictionary compression). */
  function lzw(minCode, data, count) {
    const out = new Uint8Array(count), clear = 1 << minCode, eoi = clear + 1;
    const prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
    for (let i = 0; i < clear; i++) suffix[i] = i;
    let size = minCode + 1, mask = (1 << size) - 1, avail = clear + 2, old = -1, bits = 0, acc = 0, pos = 0, op = 0, first = 0, sp = 0;
    while (op < count) {
      if (sp === 0) {
        if (bits < size) { if (pos >= data.length) break; acc |= data[pos++] << bits; bits += 8; continue; }
        let code = acc & mask; acc >>= size; bits -= size;
        if (code > avail || code === eoi) break;
        if (code === clear) { size = minCode + 1; mask = (1 << size) - 1; avail = clear + 2; old = -1; continue; }
        if (old === -1) { stack[sp++] = suffix[code]; old = code; first = code; continue; }
        const inCode = code;
        if (code === avail) { stack[sp++] = first; code = old; }
        while (code > clear) { stack[sp++] = suffix[code]; code = prefix[code]; }
        first = suffix[code]; stack[sp++] = first;
        if (avail < 4096) { prefix[avail] = old; suffix[avail] = first; avail++; if ((avail & mask) === 0 && avail < 4096) { size++; mask += avail; } }
        old = inCode;
      }
      sp--; out[op++] = stack[sp];
    }
    return out;
  }
  // -> { w, h, frames: [canvas], delays: [ms], loop: bool, cut: bool }
  I.decodeGif = buffer => {
    const b = new Uint8Array(buffer); let p = 0;
    const sig = String.fromCharCode.apply(null, b.subarray(0, 6));
    if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('That is not a GIF file.');
    const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v; };
    p = 6; const W = u16(), H = u16(), flags = b[p++]; p += 2;
    const table = n => { const t = b.subarray(p, p + n * 3); p += n * 3; return t; };
    const global = flags & 0x80 ? table(2 << (flags & 7)) : null;
    const blocks = () => { const parts = []; let n = 0; for (;;) { const len = b[p++]; if (!len || p > b.length) break; parts.push(b.subarray(p, p + len)); n += len; p += len; } const out = new Uint8Array(n); let o = 0; parts.forEach(q => { out.set(q, o); o += q.length; }); return out; };
    const canvas = mk(W, H), ctx = canvas.getContext('2d'), frames = [], delays = [];
    let gce = { disposal: 0, delay: 0, transparent: -1 }, loops = null, prev = null, saved = null, cut = false;
    while (p < b.length) {
      const block = b[p++];
      if (block === 0x3b) break;
      if (block === 0x21) {
        const label = b[p++];
        if (label === 0xf9) { p++; const f = b[p++]; const delay = u16(), tr = b[p++]; p++; gce = { disposal: (f >> 2) & 7, delay: delay * 10, transparent: f & 1 ? tr : -1 }; }
        else if (label === 0xff) { const len = b[p++], id = String.fromCharCode.apply(null, b.subarray(p, p + len)); p += len; const d = blocks(); if (id.startsWith('NETSCAPE') && d[0] === 1) loops = d[1] | (d[2] << 8); }
        else blocks();
      } else if (block === 0x2c) {
        const x = u16(), y = u16(), w = u16(), hh = u16(), f = b[p++];
        const pal = f & 0x80 ? table(2 << (f & 7)) : global, min = b[p++], idx = lzw(min, blocks(), w * hh);
        if (frames.length >= MAX_FRAMES) { cut = true; break; }
        if (prev) { // finish the previous frame the way it asked
          if (prev.disposal === 2) ctx.clearRect(prev.x, prev.y, prev.w, prev.h);
          else if (prev.disposal === 3 && saved) ctx.putImageData(saved, 0, 0);
        }
        saved = gce.disposal === 3 ? ctx.getImageData(0, 0, W, H) : null;
        if (w > 0 && hh > 0 && pal) {
          const im = ctx.getImageData(x, y, w, hh), d = im.data;
          const rows = []; // interlaced GIFs store rows in four passes
          if (f & 0x40) { [[0, 8], [4, 8], [2, 4], [1, 2]].forEach(q => { for (let r = q[0]; r < hh; r += q[1]) rows.push(r); }); }
          for (let r = 0; r < hh; r++) {
            const dst = (f & 0x40 ? rows[r] : r) * w * 4, src = r * w;
            for (let c = 0; c < w; c++) { const k = idx[src + c]; if (k === gce.transparent) continue; const o = dst + c * 4; d[o] = pal[k * 3]; d[o + 1] = pal[k * 3 + 1]; d[o + 2] = pal[k * 3 + 2]; d[o + 3] = 255; }
          }
          ctx.putImageData(im, x, y);
        }
        const snap = mk(W, H); snap.getContext('2d').drawImage(canvas, 0, 0);
        frames.push(snap); delays.push(gce.delay < 20 ? 100 : gce.delay);
        prev = { disposal: gce.disposal, x: x, y: y, w: w, h: hh }; gce = { disposal: 0, delay: 0, transparent: -1 };
      } else break;
    }
    if (!frames.length) throw new Error('That GIF has no pictures in it.');
    return { w: W, h: H, frames: frames, delays: delays, loop: loops !== null && loops !== 1, cut: cut };
  };

  /* ================= Aseprite: the exported sheet + JSON ================= */
  I.isAseJson = j => !!j && typeof j === 'object' && !!j.frames && !!j.meta;
  // -> a plan: { name, anims: [{ name, loop, frames: [{ canvas, time }] }], hit, origin, notes }
  I.readAseSheet = (json, sheet, name) => {
    const list = Array.isArray(json.frames) ? json.frames : Object.keys(json.frames).map(k => json.frames[k]);
    if (!list.length) throw new Error('The JSON lists no frames.');
    const frames = list.slice(0, 1024).map(f => {
      const r = f.frame || {}, src = f.sourceSize || { w: r.w, h: r.h }, at = f.spriteSourceSize || { x: 0, y: 0 };
      const c = mk(src.w, src.h); c.getContext('2d').drawImage(sheet, r.x, r.y, r.w, r.h, at.x || 0, at.y || 0, r.w, r.h);
      return { canvas: c, time: +f.duration > 0 ? +f.duration : null };
    });
    const meta = json.meta || {}, tags = (meta.frameTags || []).filter(t => t && t.from <= t.to && t.from < frames.length), used = new Set(), anims = [], notes = [];
    tags.forEach(t => {
      let idx = []; for (let k = t.from; k <= Math.min(t.to, frames.length - 1); k++) { idx.push(k); used.add(k); }
      const dir = String(t.direction || 'forward');
      if (dir === 'reverse') idx.reverse();
      else if (dir.startsWith('pingpong')) { if (dir === 'pingpong_reverse') idx.reverse(); idx = idx.concat(idx.slice(1, -1).reverse()); }
      anims.push({ name: OV.ident(t.name, 'anim'), loop: true, frames: idx.slice(0, MAX_FRAMES).map(k => frames[k]) });
    });
    if (!anims.length) anims.push({ name: 'idle', loop: true, frames: frames.slice(0, MAX_FRAMES) });
    else { const rest = frames.filter((f, k) => !used.has(k)); if (rest.length) { anims.push({ name: 'untagged', loop: true, frames: rest.slice(0, MAX_FRAMES) }); notes.push(rest.length + (rest.length === 1 ? ' frame' : ' frames') + ' outside any tag went into "untagged"'); } }
    const plan = { name: name, anims: anims, notes: notes, kind: 'Aseprite' };
    const slice = (meta.slices || []).find(s => /^hitbox$/i.test(s.name || '')), key = slice && slice.keys && slice.keys[0];
    if (key && key.bounds) { plan.hit = { x: key.bounds.x, y: key.bounds.y, w: key.bounds.w, h: key.bounds.h }; if (key.pivot) plan.origin = { x: key.bounds.x + key.pivot.x, y: key.bounds.y + key.pivot.y }; notes.push('hitbox taken from the "hitbox" slice'); }
    return plan;
  };

  /* ================= reading a batch of files ================= */
  // -> { plans: [ready-made sprites: GIFs, Aseprite], singles: [{ name, canvas }], sounds: [File], skipped: [{ name, why }], project: json | null }
  I.read = async fileList => {
    const files = Array.from(fileList).sort((a, b) => natural(a.name, b.name));
    const out = { plans: [], singles: [], sounds: [], skipped: [], project: null }, images = [], jsons = [];
    for (const f of files) {
      const k = I.kindOf(f);
      if (k === 'image' || k === 'gif') images.push(f);
      else if (k === 'json') jsons.push(f);
      else if (k === 'audio') out.sounds.push(f);
      else if (k === 'ase') out.skipped.push({ name: f.name, why: 'Aseprite files cannot be opened directly yet. In Aseprite use File > Export Sprite Sheet with JSON data, then import the PNG and the JSON together.' });
      else out.skipped.push({ name: f.name, why: 'not a picture or sound this editor can read' });
    }
    const paired = new Set();
    for (const jf of jsons) {
      let j; try { j = JSON.parse(await OV.readFile(jf, 'text')); } catch (e) { out.skipped.push({ name: jf.name, why: 'not valid JSON' }); continue; }
      if (j && j.format === 'overhead') { out.project = j; continue; }
      if (!I.isAseJson(j)) { out.skipped.push({ name: jf.name, why: 'not an Aseprite sheet description' }); continue; }
      const want = base(String((j.meta && j.meta.image) || '').split(/[\\/]/).pop()).toLowerCase(), mine = base(jf.name).toLowerCase(), stills = images.filter(f => I.kindOf(f) === 'image');
      const png = stills.find(f => base(f.name).toLowerCase() === want) || stills.find(f => base(f.name).toLowerCase() === mine) || (stills.length === 1 && jsons.length === 1 ? stills[0] : null);
      if (!png) { out.skipped.push({ name: jf.name, why: 'its picture is missing. Choose ' + ((j.meta && j.meta.image) || 'the PNG') + ' together with it.' }); continue; }
      try { out.plans.push(I.readAseSheet(j, await toCanvas(png), base(jf.name))); paired.add(png); }
      catch (e) { out.skipped.push({ name: jf.name, why: e.message }); }
    }
    let count = 0;
    for (const f of images) {
      if (paired.has(f)) continue;
      if (++count > MAX_FILES) { out.skipped.push({ name: f.name, why: 'over the limit of ' + MAX_FILES + ' files in one import' }); continue; }
      try {
        if (I.kindOf(f) === 'gif') {
          const g = I.decodeGif(await readBuffer(f));
          if (g.frames.length === 1) { out.singles.push({ name: base(f.name), canvas: g.frames[0] }); continue; }
          out.plans.push({ name: base(f.name), kind: 'GIF', notes: g.cut ? ['only the first ' + MAX_FRAMES + ' frames were kept'] : [],
            anims: [{ name: 'idle', loop: g.loop, frames: g.frames.map((c, k) => ({ canvas: c, time: g.delays[k] })) }] });
        } else out.singles.push({ name: base(f.name), canvas: await toCanvas(f) });
      } catch (e) { out.skipped.push({ name: f.name, why: e.message }); }
    }
    return out;
  };
  // Just the pictures, in name order, for dropping frames into an open sprite.
  I.loadFrames = async fileList => {
    const r = await I.read(fileList), frames = r.singles.map(s => ({ canvas: s.canvas, time: null }));
    r.plans.forEach(p => p.anims.forEach(a => a.frames.forEach(f => frames.push(f))));
    return { frames: frames, skipped: r.skipped };
  };

  /* ---------- arranging loose pictures into sprites ---------- */
  const ANIM_WORDS = ['idle', 'walk', 'run', 'attack', 'hurt', 'hit', 'die', 'dead', 'death', 'jump', 'fall', 'open', 'closed', 'close', 'up', 'down', 'side', 'left', 'right', 'spin', 'fly', 'swim', 'cast', 'shoot', 'push', 'talk', 'sleep', 'on', 'off'];
  I.arrange = (singles, mode) => {
    const one = s => ({ name: s.name, anims: [{ name: 'idle', loop: true, frames: [{ canvas: s.canvas, time: null }] }], notes: [] });
    if (mode === 'each' || singles.length < 2) return singles.map(one);
    if (mode === 'frames') return [{ name: singles[0].name.replace(/[\s_-]*\d+$/, '') || singles[0].name, notes: [], anims: [{ name: 'idle', loop: true, frames: singles.slice(0, MAX_FRAMES).map(s => ({ canvas: s.canvas, time: null })) }] }];
    // by name: "sprite_animation_number"
    const parsed = singles.map(s => {
      const m = /^(.*?)[\s_-]*(\d+)$/.exec(s.name);
      if (!m || !m[1]) return { s: s, stem: null };
      const q = /^(.+)[\s_-]+([A-Za-z][A-Za-z0-9]*)$/.exec(m[1]);
      return { s: s, stem: m[1], n: +m[2], head: q ? q[1] : null, tail: q ? q[2] : null };
    });
    // The word before the number is an animation name if it is a usual one (walk, idle...) or if
    // the same sprite name appears with different words. Otherwise it is part of the sprite's name.
    const tails = {}; parsed.forEach(p => { if (p.head) (tails[p.head.toLowerCase()] = tails[p.head.toLowerCase()] || new Set()).add(p.tail.toLowerCase()); });
    const groups = new Map(), out = [];
    parsed.forEach(p => {
      if (p.stem == null) { out.push(one(p.s)); return; }
      const split = p.head && (ANIM_WORDS.includes(p.tail.toLowerCase()) || tails[p.head.toLowerCase()].size > 1);
      const sprite = split ? p.head : p.stem, anim = split ? p.tail : 'idle', key = sprite.toLowerCase();
      if (!groups.has(key)) { const g = { name: sprite, anims: [], notes: [], _a: new Map() }; groups.set(key, g); out.push(g); }
      const g = groups.get(key), ak = anim.toLowerCase();
      if (!g._a.has(ak)) { const a = { name: OV.ident(anim.toLowerCase(), 'anim'), loop: true, frames: [], _n: [] }; g._a.set(ak, a); g.anims.push(a); }
      const a = g._a.get(ak); a._n.push({ n: p.n, f: { canvas: p.s.canvas, time: null } });
    });
    out.forEach(g => { if (!g._a) return; g.anims.forEach(a => { a._n.sort((x, y) => x.n - y.n); a.frames = a._n.slice(0, MAX_FRAMES).map(x => x.f); if (a._n.length > MAX_FRAMES) g.notes.push(a.name + ' was cut to ' + MAX_FRAMES + ' frames'); delete a._n; }); delete g._a; });
    return out;
  };

  /* ---------- turning a plan into a real sprite ---------- */
  // opts: { anchor: 'centre' | 'feet', hitbox: 'fit' | 'full', key: [r,g,b] | null, tol }
  I.build = (plan, opts) => {
    opts = opts || {};
    const all = []; plan.anims.forEach(a => a.frames.forEach(f => all.push(f)));
    let w = 1, hh = 1; all.forEach(f => { w = Math.max(w, f.canvas.width); hh = Math.max(hh, f.canvas.height); });
    const mixed = all.some(f => f.canvas.width !== w || f.canvas.height !== hh), k = Math.min(1, MAX / w, MAX / hh);
    const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(hh * k)), notes = plan.notes.slice();
    if (k < 1) notes.push('scaled down from ' + w + ' × ' + hh + ' px');
    if (mixed) notes.push('frames of different sizes were lined up on their bottom edge');
    const done = new Map(); // one drawn canvas per source canvas, so a frame used twice is only processed once
    const lay = f => {
      if (done.has(f.canvas)) return done.get(f.canvas);
      const c = mk(W, H), x = c.getContext('2d'), fw = Math.max(1, Math.round(f.canvas.width * k)), fh = Math.max(1, Math.round(f.canvas.height * k));
      x.imageSmoothingEnabled = false; x.drawImage(f.canvas, Math.floor((W - fw) / 2), H - fh, fw, fh);
      const raw = c; let fin = c;
      if (opts.key) { fin = mk(W, H); fin.getContext('2d').drawImage(c, 0, 0); I.removeColour(fin, opts.key, opts.tol); }
      const rec = { raw: raw, fin: fin, url: null }; done.set(f.canvas, rec); return rec;
    };
    const anims = plan.anims.map(a => {
      const recs = a.frames.map(lay), times = a.frames.map(f => (f.time > 0 ? Math.round(f.time) : null)), some = times.filter(t => t != null);
      const avg = some.length ? some.reduce((s, t) => s + t, 0) / some.length : 0;
      const fps = avg ? OV.clamp(Math.round(1000 / avg), 1, 30) : recs.length > 1 ? 8 : 6;
      const an = { name: a.name, fps: fps, loop: a.loop !== false, frames: recs.map(r => r.url || (r.url = r.fin.toDataURL('image/png'))) };
      if (some.length && times.some(t => t != null && Math.abs(t - 1000 / fps) > 0.5)) an.times = times;
      return an;
    });
    const first = lay(plan.anims[0].frames[0]), box = bounds(Array.from(done.values()).map(r => r.fin)) || { x: 0, y: 0, w: W, h: H };
    const s = { id: OV.uid('spr'), name: plan.name, w: W, h: H, anims: anims };
    const sc = v => Math.round(v * k);
    if (plan.hit) s.hit = { x: OV.clamp(sc(plan.hit.x), 0, W - 1), y: OV.clamp(sc(plan.hit.y), 0, H - 1), w: Math.max(1, sc(plan.hit.w)), h: Math.max(1, sc(plan.hit.h)) };
    else s.hit = opts.hitbox === 'full' ? { x: 0, y: 0, w: W, h: H } : box;
    s.hit.w = Math.min(s.hit.w, W - s.hit.x); s.hit.h = Math.min(s.hit.h, H - s.hit.y);
    if (plan.origin) { s.ox = OV.clamp(sc(plan.origin.x), 0, W); s.oy = OV.clamp(sc(plan.origin.y), 0, H); }
    else { const b = opts.hitbox === 'full' ? { x: 0, y: 0, w: W, h: H } : box; s.ox = Math.round(b.x + b.w / 2); s.oy = opts.anchor === 'feet' ? b.y + b.h : Math.round(b.y + b.h / 2); }
    return { sprite: s, notes: notes, raw: first.raw, fin: first.fin };
  };

  /* ================= the Import dialog ================= */
  I.dialog = read => {
    const P = OV.project, many = read.singles.length > 1;
    const st = { mode: 'name', anchor: 'centre', hitbox: 'fit', objects: false, keyOn: false, key: null, tol: 0 };
    let plans = [], built = [], modal = null, timer = 0;
    const firstStill = read.singles[0] || null;
    if (firstStill) { const px = I.pixel(firstStill.canvas, 0, 0); st.key = px.slice(0, 3); }
    else if (read.plans[0]) st.key = I.pixel(read.plans[0].anims[0].frames[0].canvas, 0, 0).slice(0, 3);
    const suggest = read.singles.length > 0 && read.singles.every(s => I.isOpaque(s.canvas));
    const list = h('div', { class: 'imp-list' }), keyRow = h('div', { class: 'imp-key' }), summary = h('p', { class: 'muted small imp-sum' });
    const replan = () => { plans = I.arrange(read.singles, st.mode).concat(read.plans); rebuild(); };
    const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => { built = plans.map(p => I.build(p, { anchor: st.anchor, hitbox: st.hitbox, key: st.keyOn ? st.key : null, tol: st.tol })); render(); }, 30); };
    function render() {
      list.textContent = '';
      built.forEach((b, n) => {
        const s = b.sprite, plan = plans[n], k = Math.min(4, 64 / Math.max(s.w, s.h)), cv = mk(Math.round(s.w * k), Math.round(s.h * k)), x = cv.getContext('2d');
        cv.className = 'imp-thumb'; cv.title = 'Tap a colour to make it see-through';
        x.imageSmoothingEnabled = false; x.drawImage(b.fin, 0, 0, cv.width, cv.height);
        cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(), px = I.pixel(b.raw, (e.clientX - r.left) / r.width * s.w, (e.clientY - r.top) / r.height * s.h); if (!px[3]) return; st.key = px.slice(0, 3); st.keyOn = true; renderKey(); rebuild(); });
        const name = h('input', { type: 'text', class: 'imp-name code', value: plan.name, maxlength: 40, 'aria-label': 'Sprite name', spellcheck: 'false' });
        name.addEventListener('change', () => { plan.name = name.value.trim() || plan.name; name.value = plan.name; });
        const anims = h('div', { class: 'imp-anims' }, plan.anims.map((a, ai) => {
          const inp = h('input', { type: 'text', class: 'imp-anim code', value: a.name, maxlength: 24, 'aria-label': 'Animation name', spellcheck: 'false' });
          inp.addEventListener('change', () => { a.name = OV.ident(inp.value, 'anim'); inp.value = a.name; s.anims[ai].name = a.name; });
          return h('span', { class: 'imp-animrow' }, inp, h('span', { class: 'muted small', text: a.frames.length + (a.frames.length === 1 ? ' frame' : ' frames') + (s.anims[ai].times ? ', own timing' : '') }));
        }));
        list.append(h('div', { class: 'imp-row' }, h('div', { class: 'imp-thumbbox' }, cv), h('div', { class: 'imp-info' },
          h('div', { class: 'imp-head' }, name, h('span', { class: 'muted small', text: s.w + ' × ' + s.h + ' px' + (plan.kind ? ' · ' + plan.kind : '') })), anims,
          b.notes.length ? h('div', { class: 'imp-note small', text: b.notes.join('. ') + '.' }) : null)));
      });
      if (read.skipped.length) list.append(h('div', { class: 'imp-skipped' }, h('h2', { class: 'label', text: 'Skipped' }), read.skipped.map(k => h('div', { class: 'small' }, h('b', { text: k.name }), ': ' + k.why))));
      const frames = built.reduce((n, b) => n + b.sprite.anims.reduce((m, a) => m + a.frames.length, 0), 0);
      summary.textContent = built.length + (built.length === 1 ? ' sprite' : ' sprites') + ', ' + frames + (frames === 1 ? ' frame' : ' frames') + (read.sounds.length ? ', ' + read.sounds.length + (read.sounds.length === 1 ? ' sound' : ' sounds') : '') + '.';
    }
    function renderKey() {
      keyRow.textContent = '';
      const c = h('input', { type: 'checkbox', id: 'imp-keyon' }); c.checked = st.keyOn; c.addEventListener('change', () => { st.keyOn = c.checked; renderKey(); rebuild(); });
      keyRow.append(h('label', { class: 'check', for: 'imp-keyon' }, c, h('span', { text: 'Make one colour see-through' })));
      if (!st.keyOn) { if (suggest) keyRow.append(h('span', { class: 'muted small', text: 'These pictures have no see-through parts. Turn this on to remove a background colour.' })); return; }
      const col = h('input', { type: 'color', value: hex(st.key || [255, 0, 255]), 'aria-label': 'Colour to remove' }); col.addEventListener('input', () => { st.key = unhex(col.value); rebuild(); });
      const tol = h('input', { type: 'number', min: 0, max: 32, step: 1, value: st.tol, 'aria-label': 'Tolerance', class: 'imp-tol' }); tol.addEventListener('change', () => { st.tol = OV.clamp(parseInt(tol.value, 10) || 0, 0, 32); tol.value = st.tol; rebuild(); });
      keyRow.append(col, h('label', { class: 'imp-tolwrap small' }, 'Tolerance', tol), h('span', { class: 'muted small', text: 'Or tap a colour in a preview below.' }));
    }
    const sel = (label, opts, key, after) => ui.select(label, opts, () => st[key], v => { st[key] = v; (after || rebuild)(); }, { hard: false });
    const objs = h('input', { type: 'checkbox', id: 'imp-objs' }); objs.addEventListener('change', () => (st.objects = objs.checked));
    const body = h('div', { class: 'imp' },
      h('div', { class: 'imp-opts' },
        many ? sel('Arrange the pictures', [['name', 'Group by file name'], ['each', 'One sprite per file'], ['frames', 'One sprite, each file a frame']], 'mode', replan) : null,
        sel('Position point', [['centre', 'Centre'], ['feet', 'Feet (bottom centre)']], 'anchor'),
        sel('Hitbox', [['fit', 'Fitted to the visible pixels'], ['full', 'The whole frame']], 'hitbox')),
      many && st.mode === 'name' ? h('p', { class: 'muted small', text: 'File names are read as sprite_animation_number: hero_walk_01.png, hero_walk_02.png. You can change the names below.' }) : null,
      keyRow, h('label', { class: 'check', for: 'imp-objs' }, objs, h('span', { text: 'Also make an object from each sprite' })), list, summary);
    const run = close => {
      if (!built.length && !read.sounds.length) { close(); return; }
      const soundJobs = read.sounds.map(f => (f.size > 3e6 ? Promise.resolve({ f: f, big: true }) : OV.readFile(f).then(src => ({ f: f, src: src }))));
      Promise.all(soundJobs).then(sounds => {
        let last = null, big = 0;
        OV.edit(() => {
          built.forEach((b, n) => {
            const s = b.sprite; s.name = OV.uniqueName(OV.ident(plans[n].name, 'Sprite'), P.sprites.map(x => x.name)); P.sprites.push(s); last = s;
            if (st.objects) M.newType(P, { name: s.name, look: 'sprite', spriteId: s.id });
          });
          sounds.forEach(q => { if (q.big) { big++; return; } P.sounds.push({ id: OV.uid('snd'), name: OV.uniqueName(OV.ident(base(q.f.name), 'Sound'), P.sounds.map(x => x.name)), kind: 'file', src: q.src, vol: 0.8 }); });
          if (last) S.sel = { kind: 'sprite', id: last.id };
        });
        close();
        OV.toast('Imported ' + built.length + (built.length === 1 ? ' sprite' : ' sprites') + (sounds.length - big ? ' and ' + (sounds.length - big) + ' sound' + (sounds.length - big === 1 ? '' : 's') : '') + (big ? '. ' + big + ' sound over 3 MB skipped' : '') + '. Undo removes them.');
      });
    };
    modal = OV.modal({ title: 'Import', wide: true, content: body, actions: [{ label: 'Cancel', onClick: c => c() }, { label: 'Import', primary: true, onClick: run }] });
    renderKey(); replan();
    return modal;
  };

  /* ---------- entry points ---------- */
  I.run = async fileList => {
    if (S.playing) return;
    if (!fileList || !fileList.length) return;
    let read;
    try { read = await I.read(fileList); } catch (e) { OV.toast('Could not read those files. ' + e.message); return; }
    if (read.project && !read.singles.length && !read.plans.length) {
      if (await OV.confirm('Open "' + (read.project.name || 'this backup') + '" as a project? Your current project stays saved in this browser.', 'Open')) {
        try { const p = M.normalize(read.project); p.id = OV.uid('p'); OV.setProject(p); OV.toast('Opened ' + p.name); } catch (e) { OV.toast('Could not open that backup. ' + e.message); }
      }
      return;
    }
    if (!read.singles.length && !read.plans.length && !read.sounds.length) { OV.toast(read.skipped.length ? read.skipped[0].name + ': ' + read.skipped[0].why : 'Nothing to import.'); return; }
    I.dialog(read);
  };
  I.pick = async () => { const files = await OV.pickFiles('image/*,.json,application/json,audio/*'); if (files.length) I.run(files); };
})();
