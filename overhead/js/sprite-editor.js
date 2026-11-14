/* Overhead Studio: pixel-art editing.
     OV.SpriteEditor.mount(container, sprite, api)   -> { refresh(), destroy() }
     OV.TilesetEditor.mount(container, tileset, api) -> { refresh(), destroy() }
   api = { begin(), commit(), palette: ['#rrggbb', ...] }
   Every model change is api.begin(), mutate in place, api.commit(): one pair per gesture, so the host
   can snapshot for undo and autosave. The host undoes by restoring the model and calling refresh().
   Both editors are built from PixelCanvas (view, zoom, pan, drawing tools) and ToolBox (tools + colours). */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, clamp = OV.clamp;
  const MAX = 256;          // longest sprite side, px
  const MAX_SHEET = 2048;   // longest tileset side, px
  const MAX_FRAMES = 256;   // most frames one sheet import may create
  const PALETTE = ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
    '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'];
  const ZOOMS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

  /* ---------- icons and small helpers ---------- */
  const ICON = {
    pencil: '<path d="M4 20l1-4.5L16.5 4 20 7.5 8.5 19z"/><path d="M14 6.5l3.5 3.5"/>',
    eraser: '<path d="M9 20l-5-5L14.5 4.5l5.5 5.5L9.5 20z"/><path d="M9 10l5.5 5.5M9 20h11"/>',
    bucket: '<path d="M10.5 3.5l8 8-6.3 6.3a2 2 0 0 1-2.8 0l-4.7-4.7a2 2 0 0 1 0-2.8z"/><path d="M4.5 12H18"/><path d="M20 15.5s1.5 2 1.5 3.2a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3.2 1.5-3.2z" fill="currentColor"/>',
    picker: '<path d="M11.5 8.5L5 15v4h4l6.5-6.5"/><path d="M10.5 7.5l6 6"/><path d="M14.5 5.5l1.2-1.2a2.3 2.3 0 0 1 3.3 3.3l-1.2 1.2z" fill="currentColor"/>',
    line: '<path d="M5.5 18.5l13-13"/><circle cx="5" cy="19" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    rectFill: '<rect x="4" y="6" width="16" height="12" rx="1" fill="currentColor"/>',
    move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    mirror: '<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M8.5 8L4 12l4.5 4zM15.5 8l4.5 4-4.5 4z"/>',
    flipH: '<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M9 7v10H3z"/><path d="M15 7v10h6z" fill="currentColor"/>',
    flipV: '<path d="M3 12h18" stroke-dasharray="2 3"/><path d="M7 9h10V3z"/><path d="M7 15h10v6z" fill="currentColor"/>',
    clear: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M9 9l6 6M15 9l-6 6"/>',
    onion: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',
    origin: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    left: '<path d="M14.5 5l-7 7 7 7"/>',
    right: '<path d="M9.5 5l7 7-7 7"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  };
  const SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
  const icon = name => h('span', { class: 'pxe-ico', 'aria-hidden': 'true', html: SVG + ICON[name] + '</svg>' });
  // Icon button. With `text` the label is also shown next to the icon (hidden again in narrow layouts).
  const ibtn = (ic, label, onClick, text) => h('button', { class: 'btn icon', type: 'button', title: label, 'aria-label': label, onclick: onClick },
    icon(ic), text ? h('span', { class: 'pxe-lbl', text: text }) : null);
  const tbtn = (text, onClick, title) => h('button', { class: 'btn', type: 'button', onclick: onClick, text: text, title: title });
  const press = (b, on) => b.setAttribute('aria-pressed', String(!!on));
  const mk = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  const paint = (w, hh, fn) => { const c = mk(w, hh), x = c.getContext('2d'); x.imageSmoothingEnabled = false; fn(x); return c; };
  const url = c => c.toDataURL('image/png');
  const isHex = c => /^#[0-9a-f]{6}$/i.test(c);
  const blank = (x, w, hh) => { const d = x.getImageData(0, 0, w, hh).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; };
  const load = src => (src ? OV.loadImage(src).catch(() => null) : Promise.resolve(null));
  async function pickImage() {
    const f = await OV.pickFile('image/*');
    if (!f) return null;
    try { return await OV.loadImage(await OV.readFile(f)); } catch (e) { OV.toast(e.message); return null; }
  }

  // Decoded <img> per frame data URL, shared by onion skin and preview. onload is called if it was not ready yet.
  const cache = new Map();
  function img(src, onload) {
    if (!src) return null;
    let im = cache.get(src);
    if (!im) { if (cache.size > 200) cache.clear(); im = new Image(); im.src = src; cache.set(src, im); }
    if (!im.complete && onload) im.addEventListener('load', onload, { once: true });
    return im;
  }
  const ready = im => !!im && im.complete && im.naturalWidth > 0;

  // Whole-number field. set(v) is called with a clamped value when the user changes it. min/max may be functions.
  function num(label, get, set, min, max, live) {
    const lim = v => (typeof v === 'function' ? v() : v);
    const inp = h('input', { type: 'number', step: 1, inputmode: 'numeric' });
    const apply = () => { const v = clamp(parseInt(inp.value, 10), lim(min), lim(max)); if (Number.isFinite(v) && v !== get()) set(v); };
    inp._sync = () => { inp.min = lim(min); inp.max = lim(max); inp.value = get(); };
    inp.addEventListener('change', () => { apply(); inp._sync(); });
    if (live) inp.addEventListener('input', apply);
    inp._sync();
    return h('label', { class: 'field' }, h('span', { text: label }), inp);
  }
  function check(label, get, set) {
    const c = h('input', { type: 'checkbox' });
    c._sync = () => { c.checked = !!get(); };
    c.addEventListener('change', () => set(c.checked));
    c._sync();
    return h('label', { class: 'check pxe-check' }, c, h('span', { text: label }));
  }
  const syncFields = root => root.querySelectorAll('input').forEach(i => i._sync && i._sync());
  const section = (title, ...kids) => h('section', { class: 'section' }, h('h2', { class: 'label', text: title }), kids);
  const hint = text => h('p', { class: 'muted small pxe-hint', text: text });

  // Root element. Layout follows the container's own width (not the viewport): narrow = stacked.
  function shell(container, cls) {
    const root = h('div', { class: 'pxe ' + cls });
    const fit = () => root.classList.toggle('pxe-narrow', root.clientWidth < 700);
    container.textContent = '';
    container.append(root);
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    fit();
    return { root, done: () => { ro.disconnect(); container.textContent = ''; } };
  }

  // Shortcuts act only while the pointer or the focus is inside root, never while typing, never with Ctrl/Cmd/Alt.
  function bindKeys(root, fn) {
    let over = false;
    root.addEventListener('pointerenter', () => { over = true; });
    root.addEventListener('pointerleave', () => { over = false; });
    const key = e => {
      if (!(over || root.contains(document.activeElement)) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || (OV.modalOpen && OV.modalOpen())) return;
      if (fn(e.key.length === 1 ? e.key.toLowerCase() : e.key)) e.preventDefault();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }

  /* ---------- ToolBox: tool strip, brush size, mirror, colours ---------- */
  const TOOLS = {
    pencil: ['pencil', 'Pencil (B). Right mouse button erases', 'b'], eraser: ['eraser', 'Eraser (E)', 'e'], fill: ['bucket', 'Fill (G)', 'g'],
    picker: ['picker', 'Pick a colour from the picture (I)', 'i'], line: ['line', 'Line (L)', 'l'],
    rect: ['rect', 'Rectangle (R). Press again to switch between outline and filled', 'r'], move: ['move', 'Move the whole frame (M)', 'm'],
  };
  // o: { palette(): array, mirror: bool, onTool() }. Returns { st, el, colours }; st is what PixelCanvas reads.
  function ToolBox(names, o) {
    const st = { tool: 'pencil', color: '#000000', size: 1, mirror: false, filled: false, recent: [] };
    const btns = {}, dot = h('span', { class: 'pxe-dot' });
    names.forEach(n => { btns[n] = ibtn(TOOLS[n][0], TOOLS[n][1], () => st.setTool(n)); });
    const sizeB = h('button', { class: 'btn icon', type: 'button', onclick: () => { st.size = st.size % 3 + 1; sync(); } }, dot);
    const mirB = o.mirror ? ibtn('mirror', 'Mirror: pencil and eraser also draw on the other side', () => { st.mirror = !st.mirror; sync(); }) : null;
    const el = h('div', { class: 'pxe-tools', role: 'toolbar', 'aria-label': 'Drawing tools' }, names.map(n => btns[n]), h('span', { class: 'pxe-sep' }), sizeB, mirB);

    const custom = h('input', { type: 'color', title: 'Mix your own colour', 'aria-label': 'Current colour. Tap to mix your own' });
    const hexEl = h('code'), palEl = h('div', { class: 'pxe-swatches' }), recEl = h('div', { class: 'pxe-swatches' });
    const recWrap = h('div', { hidden: true }, h('div', { class: 'muted small pxe-sub', text: 'Recently used' }), recEl);
    const colours = section('Colour',
      h('div', { class: 'pxe-cur' }, custom, h('div', null, hexEl, h('div', { class: 'muted small', text: 'Tap the colour to mix your own.' }))),
      palEl, recWrap);
    custom.addEventListener('input', () => st.setColor(custom.value));
    const sw = c => h('button', { class: 'pxe-sw', type: 'button', title: c, 'aria-label': 'Colour ' + c, style: { background: c }, onclick: () => st.setColor(c) });
    const palette = () => { const p = ((o.palette && o.palette()) || []).filter(isHex).map(c => c.toLowerCase()); return p.length ? p : PALETTE; };
    let palKey = '';
    function sync() {
      names.forEach(n => press(btns[n], st.tool === n));
      if (btns.rect) btns.rect.replaceChildren(icon(st.filled ? 'rectFill' : 'rect'));
      dot.style.width = dot.style.height = 2 + st.size * 4 + 'px';
      sizeB.title = 'Brush size: ' + st.size + ' px. Tap to change ( [ and ] )';
      sizeB.setAttribute('aria-label', sizeB.title);
      if (mirB) press(mirB, st.mirror);
      const pal = palette();
      if (pal.join() !== palKey) { palKey = pal.join(); palEl.replaceChildren(...pal.map(sw)); }
      colours.querySelectorAll('.pxe-sw').forEach(b => press(b, b.title === st.color));
      custom.value = st.color;
      hexEl.textContent = st.color;
    }
    st.setTool = n => { if (n === 'rect' && st.tool === 'rect') st.filled = !st.filled; st.tool = n; sync(); if (o.onTool) o.onTool(); };
    st.setColor = c => { st.color = c.toLowerCase(); if (!/pencil|fill|line|rect/.test(st.tool)) st.tool = 'pencil'; sync(); if (o.onTool) o.onTool(); };
    st.used = c => {   // called by the canvas when a stroke really used the colour
      if (st.recent[0] === c) return;
      st.recent = [c].concat(st.recent.filter(x => x !== c)).slice(0, 8);
      recEl.replaceChildren(...st.recent.map(sw)); recWrap.hidden = false; sync();
    };
    st.key = k => {
      const n = names.find(t => TOOLS[t][2] === k);
      if (n) st.setTool(n);
      else if (k === '[' || k === ']') { st.size = clamp(st.size + (k === ']' ? 1 : -1), 1, 3); sync(); }
      else return false;
      return true;
    };
    st.color = palette()[0];
    sync();
    return { st, el, colours, sync };
  }

  /* ---------- PixelCanvas: the zoomable picture and the drawing tools ----------
     o: { state, onCommit(), hook(type, p) -> bool, overlay(ctx, T), clip(x, y) -> rect, cursor() -> size }
     pc.buf is the working picture (an offscreen canvas at 1:1). Tools paint straight into it; when a gesture
     really changed it, onCommit() is called once and the owner writes it back to the model.
     hook() lets the owner take over the pointer (origin/hitbox, solid tiles): return true on 'down' to claim it. */
  function PixelCanvas(o) {
    const view = h('canvas', { class: 'pxe-view', role: 'img', 'aria-label': 'Drawing area' }), el = h('div', { class: 'pxe-stage' }, view);
    const vx = view.getContext('2d'), buf = mk(1, 1), bx = buf.getContext('2d', { willReadFrequently: true });
    const st = o.state, zl = h('span', { class: 'pxe-zl' }), pts = new Map();
    const pc = { el, buf, bx, z: 1, under: null, locked: false };
    pc.zoomEl = h('div', { class: 'pxe-zoom' }, ibtn('minus', 'Zoom out (-)', () => pc.zoomStep(-1)), zl,
      ibtn('plus', 'Zoom in (+)', () => pc.zoomStep(1)), ibtn('fit', 'Fit to the space (0)', () => pc.fit()));
    let px = 0, py = 0, cw = 0, ch = 0, fitted = true, raf = 0, g = null, hov = null, pat = null;

    pc.render = () => { if (!raf) raf = requestAnimationFrame(draw); };
    pc.setSize = (w, hh) => {            // also clears the picture
      const same = buf.width === w && buf.height === hh;
      buf.width = w; buf.height = hh;
      if (!same || fitted) pc.fit(); else pc.render();
    };
    function viewChanged() {             // keep a corner of the picture on screen, update the % label
      px = clamp(px, 32 - buf.width * pc.z, Math.max(0, cw - 32)); py = clamp(py, 32 - buf.height * pc.z, Math.max(0, ch - 32));
      zl.textContent = Math.round(pc.z * 100) + '%';
      pc.render();
    }
    pc.fit = () => {                     // largest whole-number zoom that fits (half steps below 400%, anything below 100%)
      if (cw && ch) {
        const a = Math.min((cw - 24) / buf.width, (ch - 24) / buf.height);
        pc.z = a >= 4 ? Math.min(64, Math.floor(a)) : a >= 1 ? Math.floor(a * 2) / 2 : Math.max(a, 0.02);
        px = Math.round((cw - buf.width * pc.z) / 2); py = Math.round((ch - buf.height * pc.z) / 2);
      }
      fitted = true; viewChanged();
    };
    function zoomTo(nz, sx, sy) {        // the picture point under (sx, sy) stays put
      nz = clamp(nz, 0.05, 64);
      px = sx - (sx - px) * nz / pc.z; py = sy - (sy - py) * nz / pc.z;
      pc.z = nz; fitted = false; viewChanged();
    }
    pc.zoomStep = d => {
      const nz = d > 0 ? ZOOMS.find(v => v > pc.z * 1.001) : ZOOMS.slice().reverse().find(v => v < pc.z * 0.999);
      if (nz) zoomTo(nz, cw / 2, ch / 2);
    };

    function draw() {
      raf = 0;
      const dpr = window.devicePixelRatio || 1, W = Math.round(cw * dpr), H = Math.round(ch * dpr);
      if (!W || !H) return;
      if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
      const cs = getComputedStyle(el), tok = n => cs.getPropertyValue(n).trim() || '#888';
      const s = pc.z * dpr, x0 = Math.round(px * dpr), y0 = Math.round(py * dpr), w = Math.round(buf.width * s), hh = Math.round(buf.height * s);
      vx.setTransform(1, 0, 0, 1, 0, 0); vx.globalAlpha = 1; vx.clearRect(0, 0, W, H); vx.imageSmoothingEnabled = false;
      // Checkerboard: squares of about 8 screen px that line up with the picture pixels
      // (several squares per pixel when zoomed in, several pixels per square when zoomed out).
      const unit = s >= 8 * dpr ? s / Math.round(s / (8 * dpr)) : s * Math.pow(2, Math.ceil(Math.log2(6 * dpr / s)));
      const ca = tok('--raise'), cb = tok('--void');
      if (!pat || pat.key !== ca + cb) {
        const t = paint(2, 2, x => { x.fillStyle = ca; x.fillRect(0, 0, 2, 2); x.fillStyle = cb; x.fillRect(0, 0, 1, 1); x.fillRect(1, 1, 1, 1); });
        pat = { key: ca + cb, p: vx.createPattern(t, 'repeat') };
      }
      vx.save(); vx.beginPath(); vx.rect(x0, y0, w, hh); vx.clip();
      vx.translate(x0, y0); vx.scale(unit, unit); vx.fillStyle = pat.p; vx.fillRect(0, 0, w / unit + 1, hh / unit + 1); vx.restore();
      if (ready(pc.under)) { vx.globalAlpha = 0.3; vx.drawImage(pc.under, x0, y0, Math.round(pc.under.naturalWidth * s), Math.round(pc.under.naturalHeight * s)); vx.globalAlpha = 1; }
      vx.drawImage(buf, x0, y0, w, hh);
      if (pc.z >= 8) {                   // pixel grid, visible part only
        vx.globalAlpha = 0.22; vx.fillStyle = tok('--muted');
        const top = Math.max(0, y0), bot = Math.min(H, y0 + hh), lf = Math.max(0, x0), rt = Math.min(W, x0 + w);
        for (let i = Math.max(1, Math.ceil(-x0 / s)); i < buf.width && x0 + i * s < W; i++) vx.fillRect(x0 + Math.round(i * s), top, 1, bot - top);
        for (let i = Math.max(1, Math.ceil(-y0 / s)); i < buf.height && y0 + i * s < H; i++) vx.fillRect(lf, y0 + Math.round(i * s), rt - lf, 1);
        vx.globalAlpha = 1;
      }
      vx.strokeStyle = tok('--muted'); vx.lineWidth = 1; vx.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, hh + 1);
      if (o.overlay) { vx.save(); o.overlay(vx, { s, x0, y0, w, h: hh, W, H, dpr, tok }); vx.restore(); }
      const n = hov && !g && !pc.locked ? (o.cursor ? o.cursor() : /pencil|eraser|line/.test(st.tool) ? st.size : 1) : 0;
      if (n) {                           // brush footprint under the mouse
        const a = x0 + Math.round((hov.x - ((n - 1) >> 1)) * s), b = y0 + Math.round((hov.y - ((n - 1) >> 1)) * s), d = Math.round(n * s);
        vx.lineWidth = 1; vx.strokeStyle = tok('--raise'); vx.strokeRect(a - 0.5, b - 0.5, d + 1, d + 1);
        vx.strokeStyle = tok('--fg'); vx.strokeRect(a + 0.5, b + 0.5, d - 1, d - 1);
      }
    }

    /* drawing primitives, all on the 1:1 buffer */
    function dot(x, y) {
      const s = st.size, a = x - ((s - 1) >> 1), b = y - ((s - 1) >> 1), put = g.erase ? 'clearRect' : 'fillRect';
      bx[put](a, b, s, s);
      if (g.mirror) bx[put](buf.width - a - s, b, s, s);
    }
    function line(x0, y0, x1, y1) {      // Bresenham
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      for (let e = dx + dy; ; ) {
        dot(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    function fill(p) {                   // flood fill, kept inside o.clip (one tile) when the owner gives one
      const all = { x: 0, y: 0, w: buf.width, h: buf.height }, c = (o.clip && o.clip(p.x, p.y)) || all;
      if (p.x < 0 || p.y < 0 || p.x >= all.w || p.y >= all.h || p.x < c.x || p.y < c.y || p.x >= c.x + c.w || p.y >= c.y + c.h) return;
      const im = bx.getImageData(c.x, c.y, c.w, c.h), d = new Uint32Array(im.data.buffer), v = parseInt(st.color.slice(1), 16);
      const to = g.erase ? 0 : (0xff000000 | (v & 0xff) << 16 | (v & 0xff00) | v >> 16) >>> 0;   // ABGR, little-endian
      const i0 = (p.y - c.y) * c.w + (p.x - c.x), from = d[i0], stack = [i0];
      if (from === to) return;
      while (stack.length) {
        const i = stack.pop();
        if (d[i] !== from) continue;
        d[i] = to;
        const x = i % c.w;
        if (x > 0) stack.push(i - 1);
        if (x < c.w - 1) stack.push(i + 1);
        if (i >= c.w) stack.push(i - c.w);
        if (i < d.length - c.w) stack.push(i + c.w);
      }
      bx.putImageData(im, c.x, c.y);
    }
    function stroke(p) {
      const t = g.tool, w = buf.width, hh = buf.height;
      bx.fillStyle = st.color;
      if (t === 'pencil' || t === 'eraser') { line(g.lx, g.ly, p.x, p.y); g.lx = p.x; g.ly = p.y; return; }
      if (t === 'fill') return;
      bx.putImageData(g.snap, 0, 0);     // shapes are redrawn from the snapshot on every move: that is the live preview
      if (t === 'line') line(g.x, g.y, p.x, p.y);
      else if (t === 'rect') {
        const x = Math.min(g.x, p.x), y = Math.min(g.y, p.y), rw = Math.abs(p.x - g.x) + 1, rh = Math.abs(p.y - g.y) + 1;
        const n = st.filled ? rh : Math.min(st.size, rw, rh), put = g.erase ? 'clearRect' : 'fillRect';
        bx[put](x, y, rw, n); bx[put](x, y + rh - n, rw, n); bx[put](x, y, n, rh); bx[put](x + rw - n, y, n, rh);
      } else if (t === 'move') {         // shift with wrap-around, so nothing is lost at the edges
        const mx = (((p.x - g.x) % w) + w) % w, my = (((p.y - g.y) % hh) + hh) % hh;
        bx.clearRect(0, 0, w, hh);
        [[mx, my], [mx - w, my], [mx, my - hh], [mx - w, my - hh]].forEach(q => bx.drawImage(g.src, q[0], q[1]));
      }
    }
    function pick(p) {
      if (p.x < 0 || p.y < 0 || p.x >= buf.width || p.y >= buf.height) return;
      const d = bx.getImageData(p.x, p.y, 1, 1).data;
      if (d[3]) st.setColor('#' + ((1 << 24) | (d[0] << 16) | (d[1] << 8) | d[2]).toString(16).slice(1));
    }
    function differs(snap) {
      const a = new Uint32Array(snap.data.buffer), b = new Uint32Array(bx.getImageData(0, 0, buf.width, buf.height).data.buffer);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
      return false;
    }
    pc.cancel = () => {                  // drop the gesture in progress and put the picture back
      if (g && g.kind === 'stroke') bx.putImageData(g.snap, 0, 0);
      if (g && g.kind === 'hook') o.hook('cancel', null);
      g = g && pts.size ? { kind: 'none' } : null;
      pc.render();
    };

    /* pointer input: one pointer draws, two pinch-zoom and pan, middle mouse button pans */
    const pos = e => {
      const r = view.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, fx = (sx - px) / pc.z, fy = (sy - py) / pc.z;
      return { sx, sy, fx, fy, x: Math.floor(fx), y: Math.floor(fy) };
    };
    function down(e) {
      if (e.pointerType === 'mouse' && e.button > 2) return;
      try { view.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      const p = pos(e);
      pts.set(e.pointerId, p); hov = null;
      if (pts.size > 1) {                // a second finger: undo the half-made stroke, start pinching
        pc.cancel();
        const [a, b] = [...pts.values()];
        g = pts.size === 2 ? { kind: 'pinch', d: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2, z: pc.z, px, py } : { kind: 'none' };
        return;
      }
      if (e.button === 1) { e.preventDefault(); g = { kind: 'pan', sx: p.sx, sy: p.sy, px, py }; return; }
      if (pc.locked) { g = { kind: 'none' }; return; }
      if (o.hook && o.hook('down', p)) { g = { kind: 'hook' }; return; }
      if (st.tool === 'picker') { g = { kind: 'pick' }; pick(p); return; }
      const erase = st.tool === 'eraser' || e.button === 2, paints = st.tool === 'pencil' || st.tool === 'eraser';
      g = { kind: 'stroke', tool: st.tool, erase, mirror: paints && st.mirror, x: p.x, y: p.y, lx: p.x, ly: p.y, snap: bx.getImageData(0, 0, buf.width, buf.height) };
      if (st.tool === 'move') g.src = paint(buf.width, buf.height, x => x.drawImage(buf, 0, 0));
      if (st.tool === 'fill') fill(p); else stroke(p);
      pc.render();
    }
    function move(e) {
      const p = pos(e);
      if (!pts.has(e.pointerId)) {       // plain hover
        hov = e.pointerType === 'touch' ? null : p; pc.render(); return;
      }
      pts.set(e.pointerId, p);
      if (!g) return;
      if (g.kind === 'pinch') {
        const [a, b] = [...pts.values()], nz = clamp(g.z * Math.hypot(a.sx - b.sx, a.sy - b.sy) / g.d, 0.05, 64);
        px = (a.sx + b.sx) / 2 - (g.mx - g.px) * nz / g.z; py = (a.sy + b.sy) / 2 - (g.my - g.py) * nz / g.z;
        pc.z = nz; fitted = false; viewChanged();
      } else if (g.kind === 'pan') { px = g.px + p.sx - g.sx; py = g.py + p.sy - g.sy; fitted = false; viewChanged(); }
      else if (g.kind === 'hook') o.hook('move', p);
      else if (g.kind === 'pick') pick(p);
      else if (g.kind === 'stroke') { stroke(p); pc.render(); }
    }
    function up(e) {
      if (!pts.delete(e.pointerId)) return;
      const was = g, lost = e.type === 'pointercancel';
      if (pts.size) { if (was && was.kind === 'pinch') g = { kind: 'none' }; return; }   // wait until every finger is up
      g = null;
      if (!was) return;
      if (was.kind === 'hook') o.hook(lost ? 'cancel' : 'up', pos(e));
      else if (was.kind === 'stroke') {
        if (lost) bx.putImageData(was.snap, 0, 0);
        else if (differs(was.snap)) { if (!was.erase && was.tool !== 'move') st.used(st.color); o.onCommit(); }
      }
      pc.render();
    }
    function wheel(e) {                  // Ctrl/Cmd + wheel (and trackpad pinch) zooms, plain wheel pans
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { const p = pos(e); zoomTo(pc.z * Math.exp(-e.deltaY * (e.deltaMode ? 0.08 : 0.004)), p.sx, p.sy); }
      else { px -= e.deltaX; py -= e.deltaY; fitted = false; viewChanged(); }
    }
    view.addEventListener('pointerdown', down);
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
    view.addEventListener('pointerleave', () => { hov = null; pc.render(); });
    view.addEventListener('wheel', wheel, { passive: false });
    view.addEventListener('contextmenu', e => e.preventDefault());

    const ro = new ResizeObserver(() => { cw = el.clientWidth; ch = el.clientHeight; if (fitted) pc.fit(); else viewChanged(); });
    ro.observe(el);
    // Canvas colours come from the theme tokens, so repaint when the theme flips.
    const mq = window.matchMedia('(prefers-color-scheme: dark)'), mo = new MutationObserver(pc.render);
    mq.addEventListener('change', pc.render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    pc.destroy = () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener('change', pc.render); cancelAnimationFrame(raf); raf = 1; };
    return pc;
  }

  /* ---------- Sprite editor ---------- */
  OV.SpriteEditor = { mount: function (container, sprite, api) {
    const sh = shell(container, 'pxe-sprite'), root = sh.root;
    let ai = 0, fi = 0, curName = '', onion = false, boxOn = false, boxMode = 'origin', draft = null, dead = false, queue = Promise.resolve();
    const anim = () => sprite.anims[ai], frames = () => anim().frames;
    const edit = fn => { api.begin(); try { fn(); } finally { api.commit(); } };
    const later = fn => { queue = queue.then(() => !dead && fn()).catch(e => OV.toast(e.message)); };   // async edits run one at a time
    const hit = () => sprite.hit || { x: 0, y: 0, w: sprite.w, h: sprite.h };

    const tb = ToolBox(['pencil', 'eraser', 'fill', 'picker', 'line', 'rect', 'move'], { palette: () => api.palette, mirror: true, onTool: () => setBox(false) });
    const pc = PixelCanvas({ state: tb.st, onCommit: saveFrame, hook: hook, overlay: overlay,
      cursor: () => (boxOn ? 0 : /pencil|eraser|line/.test(tb.st.tool) ? tb.st.size : 1) });

    /* canvas side: load / save the working frame, flips, origin and hitbox overlay */
    function loadFrame() {
      const src = frames()[fi], im = img(src, () => { if (!dead && anim() && frames()[fi] === src) loadFrame(); });
      pc.setSize(sprite.w, sprite.h);
      if (ready(im)) pc.bx.drawImage(im, 0, 0);
      pc.locked = !!im && !im.complete;   // no drawing until the frame has decoded
      const f = frames(), prevI = fi > 0 ? fi - 1 : anim().loop !== false && f.length > 1 ? f.length - 1 : -1;
      pc.under = onion && prevI >= 0 ? img(f[prevI], pc.render) : null;
      pc.render();
    }
    function saveFrame() {
      edit(() => { frames()[fi] = url(pc.buf); });
      renderFrames();
    }
    function reshape(fn) {               // flip or clear the working frame
      if (pc.locked) return;
      const w = sprite.w, hh = sprite.h, c = paint(w, hh, x => x.drawImage(pc.buf, 0, 0)), x = pc.bx;
      x.save(); x.clearRect(0, 0, w, hh); fn(x, c); x.restore();
      pc.render(); saveFrame();
    }
    const flipH = () => reshape((x, c) => { x.translate(sprite.w, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); });
    const flipV = () => reshape((x, c) => { x.translate(0, sprite.h); x.scale(1, -1); x.drawImage(c, 0, 0); });
    function overlay(c, T) {
      if (!boxOn) return;
      const b = (draft && draft.hit) || hit(), o = draft && draft.hit ? null : draft, lw = Math.max(2, Math.round(2 * T.dpr));
      const x = T.x0 + b.x * T.s, y = T.y0 + b.y * T.s, w = b.w * T.s, hh = b.h * T.s;
      c.fillStyle = c.strokeStyle = T.tok('--info');
      c.globalAlpha = 0.2; c.fillRect(x, y, w, hh); c.globalAlpha = 1;
      c.lineWidth = lw; c.strokeRect(x + lw / 2, y + lw / 2, Math.max(0, w - lw), Math.max(0, hh - lw));
      const cx = T.x0 + (o ? o.ox : sprite.ox) * T.s, cy = T.y0 + (o ? o.oy : sprite.oy) * T.s, r = 10 * T.dpr;
      [[T.tok('--raise'), lw + 2 * T.dpr], [T.tok('--accent'), lw]].forEach(q => {   // light halo first, so it reads on any art
        c.strokeStyle = q[0]; c.lineWidth = q[1]; c.beginPath();
        c.moveTo(cx - r, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy - r); c.lineTo(cx, cy + r);
        c.moveTo(cx + r * 0.5, cy); c.arc(cx, cy, r * 0.5, 0, Math.PI * 2); c.stroke();
      });
    }
    function hook(type, p) {             // while "Origin & hitbox" is on, the pointer edits those instead of pixels
      if (!boxOn) return false;
      const w = sprite.w, hh = sprite.h;
      if (type === 'cancel') draft = null;
      else if (boxMode === 'origin') draft = { ox: clamp(Math.round(p.fx), 0, w), oy: clamp(Math.round(p.fy), 0, hh) };
      else {
        const x = clamp(p.x, 0, w - 1), y = clamp(p.y, 0, hh - 1);
        if (type === 'down' || !draft) draft = { ax: x, ay: y };
        draft.hit = { x: Math.min(draft.ax, x), y: Math.min(draft.ay, y), w: Math.abs(x - draft.ax) + 1, h: Math.abs(y - draft.ay) + 1 };
      }
      if (type === 'up' && draft) {
        const d = draft, b = hit(); draft = null;
        if (d.hit ? ['x', 'y', 'w', 'h'].some(k => d.hit[k] !== b[k]) || !sprite.hit : d.ox !== sprite.ox || d.oy !== sprite.oy) {
          edit(() => { if (d.hit) sprite.hit = Object.assign(sprite.hit || {}, d.hit); else { sprite.ox = d.ox; sprite.oy = d.oy; } });
          syncFields(root);
        }
      }
      pc.render();
      return true;
    }
    function fitBox() {                  // keep origin and hitbox inside the sprite
      const w = sprite.w, hh = sprite.h, b = sprite.hit;
      sprite.ox = clamp(+sprite.ox || 0, 0, w); sprite.oy = clamp(+sprite.oy || 0, 0, hh);
      if (!b) return;
      b.x = clamp(b.x | 0, 0, w - 1); b.y = clamp(b.y | 0, 0, hh - 1);
      b.w = clamp(b.w | 0, 1, w - b.x); b.h = clamp(b.h | 0, 1, hh - b.y);
    }
    const setHit = (k, v) => edit(() => { sprite.hit = Object.assign(hit(), { [k]: v }); fitBox(); });

    /* frames */
    const strip = h('div', { class: 'pxe-frames', role: 'group', 'aria-label': 'Frames' });
    const fDel = ibtn('trash', 'Delete frame', () => frameOp(f => { f.splice(fi, 1); return Math.min(fi, f.length - 1); }));
    const fLeft = ibtn('left', 'Move frame earlier', () => moveFrame(-1)), fRight = ibtn('right', 'Move frame later', () => moveFrame(1));
    const frameTitle = h('h2', { class: 'label' });
    function frameOp(fn) {               // fn mutates the frame list and returns the frame to select
      let next = fi;
      edit(() => { next = fn(frames()); });
      fi = next; sync();
    }
    function moveFrame(d) {
      const j = fi + d;
      if (j >= 0 && j < frames().length) frameOp(f => { const t = f[fi]; f[fi] = f[j]; f[j] = t; return j; });
    }
    function selectFrame(i) { fi = clamp(i, 0, frames().length - 1); renderFrames(); loadFrame(); }
    function renderFrames() {
      const f = frames(), had = strip.contains(document.activeElement);
      strip.replaceChildren(...f.map((src, i) => h('button', {
        class: 'pxe-thumb', type: 'button', title: 'Frame ' + (i + 1), 'aria-label': 'Frame ' + (i + 1), 'aria-pressed': String(i === fi), onclick: () => selectFrame(i),
      }, src ? h('img', { src: src, alt: '', draggable: 'false' }) : null, h('span', { text: i + 1 }))));
      if (had && strip.children[fi]) strip.children[fi].focus();
      fDel.disabled = f.length < 2; fLeft.disabled = fi === 0; fRight.disabled = fi === f.length - 1;
      frameTitle.textContent = 'Frames of ' + anim().name;
    }

    /* animations */
    const chips = h('div', { class: 'pxe-chips', role: 'group', 'aria-label': 'Animations' });
    const aDel = tbtn('Delete', delAnim), prev = h('canvas', { class: 'pxe-prev' });
    function renderAnims() {
      const had = chips.contains(document.activeElement);
      chips.replaceChildren(...sprite.anims.map((a, i) => h('button', {
        class: 'btn', type: 'button', 'aria-pressed': String(i === ai), onclick: () => { ai = i; fi = 0; sync(); },
      }, a.name, h('span', { class: 'muted small', text: a.frames.length }))), ibtn('plus', 'Add animation', addAnim));
      if (had && chips.children[ai]) chips.children[ai].focus();
      aDel.disabled = sprite.anims.length < 2;
    }
    const nameHelp = 'Use a short name such as idle, walk or hurt. The game plays idle and walk on its own.';
    async function addAnim() {
      const taken = sprite.anims.map(a => a.name);
      const s = await OV.ask('New animation', OV.uniqueName(taken.includes('idle') ? 'walk' : 'idle', taken), { help: nameHelp, max: 24, okLabel: 'Add' });
      if (s == null || dead) return;
      // The new animation starts from the frame you were looking at, which is usually the pose you want to vary.
      edit(() => sprite.anims.push({ name: OV.uniqueName(OV.ident(s, 'anim'), taken), fps: anim().fps || 6, loop: true, frames: [frames()[fi] || ''] }));
      ai = sprite.anims.length - 1; fi = 0; sync();
    }
    async function renameAnim() {
      const a = anim(), s = await OV.ask('Rename animation', a.name, { help: nameHelp, max: 24, okLabel: 'Rename' });
      if (s == null || dead || a !== anim()) return;
      const name = OV.uniqueName(OV.ident(s, 'anim'), sprite.anims.filter(x => x !== a).map(x => x.name));
      if (name !== a.name) edit(() => { a.name = name; });
      sync();
    }
    async function delAnim() {
      const a = anim(), n = a.frames.length;
      if (sprite.anims.length < 2) return;
      if (!(await OV.confirm('Delete the animation "' + a.name + '" and its ' + n + ' frame' + (n === 1 ? '' : 's') + '?', 'Delete', true))) return;
      if (dead || a !== anim() || sprite.anims.length < 2) return;
      edit(() => sprite.anims.splice(ai, 1));
      ai = Math.min(ai, sprite.anims.length - 1); fi = 0; sync();
    }

    /* preview: plays the selected animation. loop off = hold the last frame for a beat, then start again */
    let pvI = 0, pvT = 0, pvRaf = 0;
    function tick(t) {
      pvRaf = requestAnimationFrame(tick);
      const a = anim(), n = a && a.frames.length;
      if (!n) return;
      if (pvI >= n) pvI = 0;
      if (!pvT) pvT = t;
      if (t - pvT >= 1000 / clamp(+a.fps || 1, 1, 30) + (pvI === n - 1 && a.loop === false ? 700 : 0)) { pvI = (pvI + 1) % n; pvT = t; }
      const x = prev.getContext('2d'), im = pvI === fi ? pc.buf : img(a.frames[pvI]);   // the frame being edited is shown live
      x.clearRect(0, 0, prev.width, prev.height);
      if (im === pc.buf || ready(im)) x.drawImage(im, 0, 0);
    }

    /* sprite size and imports */
    async function resizeAll(nw, nh, extra) {   // redraw every frame of every animation at the new size: one undo step
      if (nw === sprite.w && nh === sprite.h && !extra) return;
      pc.locked = true;
      const ims = await Promise.all(sprite.anims.map(a => Promise.all(a.frames.map(load))));
      if (dead) return;
      edit(() => {
        sprite.anims.forEach((a, i) => { a.frames = a.frames.map((f, j) => (ims[i][j] ? url(paint(nw, nh, x => x.drawImage(ims[i][j], 0, 0))) : '')); });
        sprite.w = nw; sprite.h = nh;
        if (extra) extra();
        fitBox();
      });
      sync();
    }
    async function importImage() {
      const im = await pickImage();
      if (!im || dead || pc.locked) return;
      const fresh = sprite.anims.length === 1 && frames().length === 1 && blank(pc.bx, sprite.w, sprite.h);
      // Bigger pictures are scaled down to fit (nearest neighbour), smaller ones sit top-left.
      const fitIn = (w, hh) => {
        const k = Math.min(1, w / im.width, hh / im.height), dw = Math.max(1, Math.round(im.width * k)), dh = Math.max(1, Math.round(im.height * k));
        if (k < 1) OV.toast('The picture was scaled down to ' + dw + ' × ' + dh + ' px to fit.');
        return url(paint(w, hh, x => x.drawImage(im, 0, 0, dw, dh)));
      };
      if (fresh) {                       // still the empty starter sprite: it takes the picture's size, and the picture replaces the blank frame
        const k = Math.min(1, MAX / im.width, MAX / im.height), w = Math.max(1, Math.round(im.width * k)), hh = Math.max(1, Math.round(im.height * k));
        const kx = w / sprite.w, ky = hh / sprite.h, b = sprite.hit;
        edit(() => {
          sprite.ox = Math.round(sprite.ox * kx); sprite.oy = Math.round(sprite.oy * ky);   // origin and hitbox keep their relative place
          if (b) { b.x = Math.round(b.x * kx); b.y = Math.round(b.y * ky); b.w = Math.round(b.w * kx); b.h = Math.round(b.h * ky); }
          sprite.w = w; sprite.h = hh; frames()[0] = fitIn(w, hh); fitBox();
        });
        sync();
      } else frameOp(f => { f.splice(fi + 1, 0, fitIn(sprite.w, sprite.h)); return fi + 1; });
    }
    async function importSheet() {
      const im = await pickImage();
      if (!im || dead) return;
      let cw = sprite.w, chh = sprite.h, cells = [];
      // First guess for the cell: the current sprite size if it divides the sheet, else a strip of squares.
      if (im.width % cw || im.height % chh) { chh = Math.min(MAX, im.height); cw = im.width % chh ? Math.min(MAX, im.width) : chh; }
      const src = paint(im.width, im.height, x => x.drawImage(im, 0, 0)), data = src.getContext('2d').getImageData(0, 0, im.width, im.height).data;
      const k = Math.min(8, 440 / im.width, 280 / im.height), info = h('p', { class: 'pxe-count' });
      const pv = h('canvas', { class: 'pxe-sheet', width: Math.max(1, Math.round(im.width * k)), height: Math.max(1, Math.round(im.height * k)) });
      const scan = () => {               // find the cells with at least one visible pixel, redraw the grid preview
        const cols = Math.floor(im.width / cw), rows = Math.floor(im.height / chh), many = cols * rows > 4096;
        cells = [];
        for (let r = 0; r < rows && !many; r++) for (let c = 0; c < cols; c++) {
          let any = false;
          for (let y = r * chh; y < (r + 1) * chh && !any; y++) {
            for (let x = c * cw; x < (c + 1) * cw && !any; x++) any = data[(y * im.width + x) * 4 + 3] > 0;
          }
          if (any) cells.push([c * cw, r * chh]);
        }
        const x = pv.getContext('2d');
        x.imageSmoothingEnabled = false; x.clearRect(0, 0, pv.width, pv.height); x.drawImage(im, 0, 0, pv.width, pv.height);
        x.fillStyle = getComputedStyle(pv).getPropertyValue('--accent').trim() || '#888';
        for (let c = 0; c <= cols && !many; c++) x.fillRect(Math.min(pv.width - 1, Math.round(c * cw * k)), 0, 1, Math.round(rows * chh * k));
        for (let r = 0; r <= rows && !many; r++) x.fillRect(0, Math.min(pv.height - 1, Math.round(r * chh * k)), Math.round(cols * cw * k), 1);
        const skipped = cols * rows - cells.length;
        info.textContent = many || cells.length > MAX_FRAMES ? 'That is too many frames (' + MAX_FRAMES + ' at most). Use bigger cells.'
          : cols + ' × ' + rows + ' cells: ' + cells.length + ' frame' + (cells.length === 1 ? '' : 's') + (skipped ? ', ' + skipped + ' empty skipped.' : '.');
      };
      const slice = close => {
        if (!cells.length || cells.length > MAX_FRAMES) return;
        const fr = cells.map(q => url(paint(cw, chh, x => x.drawImage(src, q[0], q[1], cw, chh, 0, 0, cw, chh)))), w = cw, hh = chh;
        close();
        later(() => resizeAll(w, hh, () => { anim().frames = fr; fi = 0; }));
      };
      const note = 'Slicing sets the sprite size to the cell size and replaces the frames of "' + anim().name + '". Cells are read left to right, top to bottom.';
      OV.modal({ title: 'Import sprite sheet', wide: true, actions: [{ label: 'Cancel' }, { label: 'Slice into frames', primary: true, onClick: slice }],
        content: h('div', { class: 'pxe-dialog' },
          h('div', { class: 'grid2' },
            num('Cell width', () => cw, v => { cw = v; scan(); }, 1, Math.min(MAX, im.width), true),
            num('Cell height', () => chh, v => { chh = v; scan(); }, 1, Math.min(MAX, im.height), true)),
          h('div', { class: 'pxe-sheetwrap' }, pv), info, h('p', { class: 'modal-text', text: note })) });
      scan();
    }

    /* layout */
    const onionB = ibtn('onion', 'Onion skin: show the previous frame faintly under this one', () => { onion = !onion; press(onionB, onion); loadFrame(); }, 'Onion skin');
    const boxB = ibtn('origin', 'Origin & hitbox: show and edit them on the picture', () => setBox(!boxOn), 'Origin & hitbox');
    const mOrigin = tbtn('Set origin', () => setBox(true, 'origin')), mHit = tbtn('Draw hitbox', () => setBox(true, 'hit')), boxHint = h('div', { class: 'muted small' });
    const boxBar = h('div', { class: 'pxe-bar pxe-boxbar', hidden: true },
      h('div', { class: 'pxe-seg', role: 'group', 'aria-label': 'What dragging on the picture does' }, mOrigin, mHit), boxHint);
    function setBox(on, mode) {
      boxOn = on; if (mode) boxMode = mode;
      boxBar.hidden = !on; draft = null;
      press(boxB, on); press(mOrigin, boxMode === 'origin'); press(mHit, boxMode === 'hit');
      boxHint.textContent = boxMode === 'origin' ? 'Tap the picture to place the origin.' : 'Drag a box over the part that bumps into things.';
      pc.render();
    }
    const title = h('div', { class: 'pxe-title' });
    const key = (cls, text) => h('h3', { class: 'pxe-key' }, h('i', { class: cls }), text);
    const pane = h('div', { class: 'pxe-pane' }, h('div', { class: 'pxe-cols' },
      tb.colours,
      section('Animations', chips,
        h('div', { class: 'pxe-animrow' }, h('div', { class: 'pxe-prevbox', title: 'Preview' }, prev),
          h('div', { class: 'pxe-animset' }, num('Frames per second', () => anim().fps, v => edit(() => { anim().fps = v; }), 1, 30),
            check('Loop', () => anim().loop !== false, v => { edit(() => { anim().loop = v; }); loadFrame(); }),
            h('div', { class: 'row' }, tbtn('Rename', renameAnim), aDel))),
        hint('Animations named idle and walk play on their own in the game.')),
      h('section', { class: 'section' }, frameTitle, strip,
        h('div', { class: 'row pxe-ops' }, ibtn('plus', 'Add a blank frame', () => frameOp(f => { f.splice(fi + 1, 0, ''); return fi + 1; })),
          ibtn('dup', 'Duplicate frame', () => frameOp(f => { f.splice(fi + 1, 0, f[fi]); return fi + 1; })), fLeft, fRight, fDel)),
      section('Sprite', title,
        h('div', { class: 'grid2' },
          num('Width', () => sprite.w, v => later(() => resizeAll(v, sprite.h)), 1, MAX),
          num('Height', () => sprite.h, v => later(() => resizeAll(sprite.w, v)), 1, MAX)),
        hint('Resizing keeps the top-left corner of every frame.'),
        key('pxe-k-origin', 'Origin'),
        h('div', { class: 'grid2' },
          num('X', () => sprite.ox, v => edit(() => { sprite.ox = v; }), 0, () => sprite.w),
          num('Y', () => sprite.oy, v => edit(() => { sprite.oy = v; }), 0, () => sprite.h)),
        hint("The point that counts as this thing's position (use the feet for characters)."),
        key('pxe-k-hit', 'Hitbox'),
        h('div', { class: 'pxe-grid4' },
          num('X', () => hit().x, v => setHit('x', v), 0, () => sprite.w - 1), num('Y', () => hit().y, v => setHit('y', v), 0, () => sprite.h - 1),
          num('Width', () => hit().w, v => setHit('w', v), 1, () => sprite.w - hit().x), num('Height', () => hit().h, v => setHit('h', v), 1, () => sprite.h - hit().y)),
        hint('The part that bumps into things.'),
        h('div', { class: 'row pxe-ops' },
          tbtn('Import image', importImage, 'Add a picture as a new frame'), tbtn('Import sprite sheet', importSheet, 'Cut a sheet into frames')))));
    pane.addEventListener('change', () => { syncFields(root); pc.render(); });   // origin / hitbox fields redraw the overlay
    root.append(tb.el, h('div', { class: 'pxe-main' },
      h('div', { class: 'pxe-bar' }, pc.zoomEl, h('span', { class: 'spacer' }),
        ibtn('flipH', 'Flip frame left to right', flipH), ibtn('flipV', 'Flip frame top to bottom', flipV), ibtn('clear', 'Clear frame', () => reshape(() => {})),
        h('span', { class: 'pxe-vsep' }), onionB, boxB),
      boxBar, pc.el), pane);

    function sync() {                    // rebuild everything that mirrors the model
      curName = anim().name;
      title.textContent = (sprite.name || 'Sprite') + ' · ' + sprite.w + ' × ' + sprite.h + ' px';
      const k = 96 / Math.max(sprite.w, sprite.h), sc = k >= 1 ? Math.floor(k) : k;
      prev.width = sprite.w; prev.height = sprite.h;
      prev.style.width = Math.round(sprite.w * sc) + 'px'; prev.style.height = Math.round(sprite.h * sc) + 'px';
      renderAnims(); renderFrames(); loadFrame(); syncFields(root); tb.sync();
    }
    const unkey = bindKeys(root, k => {
      if (k === 'Escape') { pc.cancel(); return false; }
      if (tb.st.key(k)) return true;
      if (k === ',' || k === '.') selectFrame(fi + (k === '.' ? 1 : -1));
      else if (k === '+' || k === '=') pc.zoomStep(1);
      else if (k === '-') pc.zoomStep(-1);
      else if (k === '0') pc.fit();
      else return false;
      return true;
    });
    press(onionB, false); setBox(false); sync();
    pvRaf = requestAnimationFrame(tick);

    return {
      refresh: function () {             // the model changed under us (undo / redo): keep the selection if it still exists
        const i = sprite.anims.findIndex(a => a.name === curName);
        ai = i >= 0 ? i : clamp(ai, 0, sprite.anims.length - 1);
        fi = clamp(fi, 0, frames().length - 1);
        pc.cancel(); draft = null; sync();
      },
      destroy: function () { dead = true; cancelAnimationFrame(pvRaf); unkey(); pc.destroy(); sh.done(); },
    };
  } };

  /* ---------- Tileset editor ---------- */
  OV.TilesetEditor = { mount: function (container, ts, api) {
    const sh = shell(container, 'pxe-tileset'), root = sh.root;
    let mode = 'solid', draft = null, dead = false, loadTok = 0;
    const edit = fn => { api.begin(); try { fn(); } finally { api.commit(); } };
    const flags = () => Array.from({ length: ts.cols * ts.rows }, (_, i) => !!(ts.solid && ts.solid[i]));
    const maxN = t => Math.min(256, Math.floor(MAX_SHEET / t));

    const tb = ToolBox(['pencil', 'eraser', 'fill', 'picker', 'line', 'rect'], { palette: () => api.palette });
    const pc = PixelCanvas({ state: tb.st, hook: hook, overlay: overlay,
      cursor: () => (mode === 'solid' ? 0 : /pencil|eraser|line/.test(tb.st.tool) ? tb.st.size : 1),
      onCommit: () => edit(() => { ts.src = url(pc.buf); }),
      clip: (x, y) => ({ x: Math.floor(x / ts.tw) * ts.tw, y: Math.floor(y / ts.th) * ts.th, w: ts.tw, h: ts.th }) });   // fill stays inside one tile

    function loadImg() {
      const my = ++loadTok;
      pc.setSize(ts.cols * ts.tw, ts.rows * ts.th);
      pc.locked = !!ts.src;
      load(ts.src).then(im => {
        if (dead || my !== loadTok) return;
        if (im) pc.bx.drawImage(im, 0, 0);
        pc.locked = false; pc.render();
      });
    }
    function hook(type, p) {             // Solid mode: the first tile decides on or off, dragging paints that
      if (mode !== 'solid') return false;
      if (type === 'cancel') draft = null;
      else {
        const c = Math.floor(p.x / ts.tw), r = Math.floor(p.y / ts.th), inside = c >= 0 && r >= 0 && c < ts.cols && r < ts.rows, i = r * ts.cols + c;
        if (type === 'down' || !draft) { const f = flags(); draft = { f: f, val: inside ? !f[i] : true, dirty: false }; }
        if (inside && draft.f[i] !== draft.val) { draft.f[i] = draft.val; draft.dirty = true; }
        if (type === 'up') {
          const d = draft; draft = null;
          if (d.dirty) { edit(() => { ts.solid = d.f; }); sync(); }
        }
      }
      pc.render();
      return true;
    }
    function overlay(c, T) {
      const f = draft ? draft.f : flags(), tw = ts.tw * T.s, th = ts.th * T.s;
      const lw = Math.max(1, Math.round(1.5 * T.dpr)), step = Math.max(5 * T.dpr, tw / 3);
      if (mode === 'solid') for (let i = 0; i < f.length; i++) {
        const x = T.x0 + (i % ts.cols) * tw, y = T.y0 + Math.floor(i / ts.cols) * th;
        if (!f[i] || x > T.W || y > T.H || x + tw < 0 || y + th < 0) continue;
        c.save(); c.beginPath(); c.rect(x, y, tw, th); c.clip();
        c.fillStyle = c.strokeStyle = T.tok('--raise'); c.globalAlpha = 0.35; c.fillRect(x, y, tw, th);
        c.beginPath();
        for (let k = -th; k < tw; k += step) { c.moveTo(x + k, y + th); c.lineTo(x + k + th, y); }
        c.rect(x + lw * 1.5, y + lw * 1.5, tw - lw * 3, th - lw * 3);
        c.globalAlpha = 0.8; c.lineWidth = lw * 3; c.stroke();        // pale halo under the red, so the hatch reads on any art
        c.globalAlpha = 1; c.lineWidth = lw; c.strokeStyle = T.tok('--danger'); c.stroke();
        c.restore();
      }
      c.fillStyle = T.tok('--fg'); c.globalAlpha = 0.55;   // tile grid
      for (let i = 0; i <= ts.cols; i++) c.fillRect(T.x0 + Math.round(i * tw), T.y0, 1, T.h);
      for (let i = 0; i <= ts.rows; i++) c.fillRect(T.x0, T.y0 + Math.round(i * th), T.w, 1);
    }
    // New tile size / columns / rows. A new tile size scales the art so every tile keeps its picture and number;
    // new columns or rows keep the pixels top-left. Solid marks stay with their (column, row).
    function reshape(t, cols, rows) {
      t = clamp(t, 8, 64); cols = clamp(cols, 1, maxN(t)); rows = clamp(rows, 1, maxN(t));
      if (pc.locked || (t === ts.tw && t === ts.th && cols === ts.cols && rows === ts.rows)) return;
      const old = flags(), oc = ts.cols, orows = ts.rows;
      const c = paint(cols * t, rows * t, x => x.drawImage(pc.buf, 0, 0, Math.round(pc.buf.width * t / ts.tw), Math.round(pc.buf.height * t / ts.th)));
      edit(() => {
        ts.tw = ts.th = t; ts.cols = cols; ts.rows = rows; ts.src = url(c);
        ts.solid = Array.from({ length: cols * rows }, (_, i) => {
          const cc = i % cols, r = Math.floor(i / cols);
          return cc < oc && r < orows && old[r * oc + cc];
        });
      });
      pc.setSize(c.width, c.height); pc.bx.drawImage(c, 0, 0); sync();
    }
    async function importImage() {
      const im = await pickImage();
      if (!im || dead) return;
      let t = clamp(ts.tw, 8, 64);
      const grid = () => [clamp(Math.ceil(im.width / t), 1, maxN(t)), clamp(Math.ceil(im.height / t), 1, maxN(t))];
      const info = h('p', { class: 'pxe-count' });
      const say = () => {
        const q = grid(), cut = q[0] * t < im.width || q[1] * t < im.height;
        info.textContent = im.width + ' × ' + im.height + ' px image: ' + q[0] + ' columns × ' + q[1] + ' rows of tiles.' + (cut ? ' It is cut off at ' + MAX_SHEET + ' px.' : '');
      };
      const go = close => {
        const q = grid(), c = paint(q[0] * t, q[1] * t, x => x.drawImage(im, 0, 0));
        close();
        edit(() => { ts.src = url(c); ts.tw = ts.th = t; ts.cols = q[0]; ts.rows = q[1]; ts.solid = Array(q[0] * q[1]).fill(false); });
        ++loadTok; pc.setSize(c.width, c.height); pc.bx.drawImage(c, 0, 0); pc.locked = false; sync();
      };
      const warn = 'The new image replaces the old one and every solid mark is cleared. Rooms that use this tileset will show the new tiles.';
      OV.modal({ title: 'Replace the tileset image?', actions: [{ label: 'Cancel' }, { label: 'Replace image', primary: true, onClick: go }],
        content: h('div', { class: 'pxe-dialog' }, h('p', { class: 'modal-text', text: warn }), num('Tile size in this image', () => t, v => { t = v; say(); }, 8, 64, true), info) });
      say();
    }

    const bSolid = tbtn('Solid', () => setMode('solid'), 'Mark the tiles that block movement'), bDraw = tbtn('Draw', () => setMode('draw'), 'Paint on the tiles');
    const title = h('div', { class: 'pxe-title' }), count = h('p', { class: 'pxe-count' }), sizeNote = hint(''), fillNote = hint('Fill only colours inside the tile you tap.');
    const solidSec = section('Solid tiles', hint('Solid tiles block movement in every room that uses them.'), hint('Tap a tile to switch it. Drag to mark several.'), count);
    function setMode(m) {
      mode = m; draft = null;
      press(bSolid, m === 'solid'); press(bDraw, m === 'draw');
      tb.el.hidden = tb.colours.hidden = fillNote.hidden = m !== 'draw'; solidSec.hidden = m !== 'solid';
      pc.render();
    }
    tb.colours.append(fillNote);
    const pane = h('div', { class: 'pxe-pane' }, h('div', { class: 'pxe-cols' }, solidSec, tb.colours,
      section('Tileset', title,
        h('div', { class: 'pxe-grid3' },
          num('Tile size', () => ts.tw, v => reshape(v, ts.cols, ts.rows), 8, 64),
          num('Columns', () => ts.cols, v => reshape(ts.tw, v, ts.rows), 1, () => maxN(ts.tw)),
          num('Rows', () => ts.rows, v => reshape(ts.tw, ts.cols, v), 1, () => maxN(ts.tw))),
        sizeNote,
        h('div', { class: 'row pxe-ops' }, tbtn('Import image', importImage, 'Replace the tileset image')))));
    root.append(tb.el, h('div', { class: 'pxe-main' },
      h('div', { class: 'pxe-bar' }, pc.zoomEl, h('span', { class: 'spacer' }), h('div', { class: 'pxe-seg', role: 'group', 'aria-label': 'Mode' }, bSolid, bDraw)),
      pc.el), pane);

    function sync() {
      const n = flags().filter(Boolean).length, all = ts.cols * ts.rows;
      title.textContent = ts.name || 'Tileset';
      count.textContent = n + ' of ' + all + ' tile' + (all === 1 ? ' is' : 's are') + ' solid.';
      sizeNote.textContent = 'The image is ' + ts.cols * ts.tw + ' × ' + ts.rows * ts.th + ' px. Changing the tile size scales the art.';
      syncFields(root); tb.sync(); pc.render();
    }
    const unkey = bindKeys(root, k => {
      if (k === 'Escape') { pc.cancel(); return false; }
      if (mode === 'draw' && tb.st.key(k)) return true;
      if (k === '+' || k === '=') pc.zoomStep(1);
      else if (k === '-') pc.zoomStep(-1);
      else if (k === '0') pc.fit();
      else return false;
      return true;
    });
    setMode('solid'); loadImg(); sync();

    return {
      refresh: function () { pc.cancel(); draft = null; loadImg(); sync(); },
      destroy: function () { dead = true; unkey(); pc.destroy(); sh.done(); },
    };
  } };
})();
