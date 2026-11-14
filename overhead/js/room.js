/* Overhead Studio: the room editor (the stage) and the Layers panel.
   Object layers hold instances you select, move and resize. Tile layers are painted with a brush. */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, M = OV.Model, S = OV.state, RT = OV.Runtime, clamp = OV.clamp;
  const views = new Map();                       // per room: camera and active layer
  const T = { tool: 'select', snap: true, grid: true, tileSel: { x0: 0, y0: 0, x1: 0, y1: 0 } };
  const TILE_TOOLS = ['brush', 'erase', 'rect', 'fill', 'pick'];
  const tileCache = new Map();
  let cur = null, clipboard = [];

  const TOOLS = [
    ['select', 'Select', 'V', 'Select, move and resize objects'], ['place', 'Place', 'P', 'Stamp the chosen object into the room'],
    ['brush', 'Brush', 'B', 'Paint tiles'], ['rect', 'Box', 'R', 'Fill a rectangle with tiles'], ['fill', 'Fill', 'F', 'Flood-fill an area with tiles'],
    ['erase', 'Erase', 'E', 'Erase tiles'], ['pick', 'Pick', 'I', 'Pick up the tile under the pointer'], ['pan', 'Pan', 'H', 'Drag to move around'],
  ];

  function viewOf(room) {
    let v = views.get(room.id);
    if (!v) { v = { x: 0, y: 0, zoom: 2, layerId: null, fitted: false }; views.set(room.id, v); }
    if (!OV.byId(room.layers, v.layerId)) { const L = topLayer(room, 'objects') || room.layers[room.layers.length - 1]; v.layerId = L ? L.id : null; }
    return v;
  }
  function topLayer(room, kind) { // the top unlocked layer of a kind; fixed-on-screen (HUD) layers only if there is nothing else
    let hud = null;
    for (let k = room.layers.length - 1; k >= 0; k--) { const L = room.layers[k]; if (L.kind !== kind || L.locked) continue; if (L.parallax === 0) { hud = hud || L; continue; } return L; }
    return hud;
  }
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------- snapping ---------- */
  function snapAxis(v, size, g, bottom) {
    if (size % g === 0) return Math.round(v / g) * g;
    if (size < g || !bottom) { const off = (g - (size % g)) / 2; return Math.round((v - off) / g) * g + off; }
    return Math.round((v + size) / g) * g - size;
  }
  function snapBox(room, m, x, y) { // x,y = instance position; m = metrics
    const g = room.grid || 16;
    return { x: snapAxis(x + m.dx, m.w, g, false) - m.dx, y: snapAxis(y + m.dy, m.h, g, true) - m.dy };
  }

  /* ---------- tiles ---------- */
  function tileCanvasFor(L) {
    const ts = OV.byId(OV.project.tilesets, L.tilesetId); if (!ts) return null;
    const key = ts.src.length + ':' + ts.tw + ':' + L.cols + ':' + L.rows + ':' + ts.cols;
    let c = tileCache.get(L.id);
    if (!c || c.key !== key) { const cv = RT.tileCanvas(L, ts); if (!cv) return null; c = { canvas: cv, key: key }; tileCache.set(L.id, c); }
    return c.canvas;
  }
  function setTile(L, ts, tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= L.cols || ty >= L.rows) return;
    const k = ty * L.cols + tx; if (L.data[k] === v) return;
    L.data[k] = v;
    const c = tileCache.get(L.id), im = RT.image(ts.src);
    if (c && RT.ready(im)) {
      const x = c.canvas.getContext('2d'); x.clearRect(tx * ts.tw, ty * ts.th, ts.tw, ts.th);
      if (v) x.drawImage(im, ((v - 1) % ts.cols) * ts.tw, Math.floor((v - 1) / ts.cols) * ts.th, ts.tw, ts.th, tx * ts.tw, ty * ts.th, ts.tw, ts.th);
    }
  }
  function selTile(ts, ox, oy) { // tile from the palette selection, repeated as a pattern
    const s = T.tileSel, sw = s.x1 - s.x0 + 1, sh = s.y1 - s.y0 + 1;
    const cx = s.x0 + (((ox % sw) + sw) % sw), cy = s.y0 + (((oy % sh) + sh) % sh);
    if (cx >= ts.cols || cy >= ts.rows) return 0;
    return cy * ts.cols + cx + 1;
  }

  /* ================= mount ================= */
  function mount(el, roomId) {
    const room = () => OV.res('room', roomId);
    const canvas = h('canvas', { class: 'stage', tabindex: 0, 'aria-label': 'Room' }), ctx = canvas.getContext('2d');
    const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Room tools' });
    const hint = h('div', { class: 'stage-hint' });
    el.append(toolbar, h('div', { class: 'stage-wrap' }, canvas, hint));
    const pointers = new Map(); let gesture = null, spaceDown = false, hover = null, queued = false, dead = false;
    const view = () => viewOf(room());
    const activeLayer = () => OV.byId(room().layers, view().layerId);
    const tsOf = L => OV.byId(OV.project.tilesets, L.tilesetId);

    /* ----- toolbar ----- */
    function buildToolbar() {
      toolbar.textContent = '';
      const st = OV.res('type', S.stampType);
      TOOLS.forEach(t => {
        const b = h('button', { class: 'btn tool' + (T.tool === t[0] ? ' active' : ''), type: 'button', title: t[3] + ' (' + t[2] + ')', 'aria-pressed': String(T.tool === t[0]), onclick: () => setTool(t[0]) },
          t[0] === 'place' && st ? OV.thumb(st, 16) : null, h('span', { text: t[0] === 'place' && st ? st.name : t[1] }));
        if (t[0] === 'brush') toolbar.append(h('span', { class: 'tool-sep' }));
        toolbar.append(b);
      });
      toolbar.append(h('span', { class: 'spacer' }),
        h('label', { class: 'check', title: 'Snap to the grid' }, (() => { const c = h('input', { type: 'checkbox' }); c.checked = T.snap; c.addEventListener('change', () => (T.snap = c.checked)); return c; })(), h('span', { text: 'Snap' })),
        h('label', { class: 'check hide-narrow', title: 'Show the grid' }, (() => { const c = h('input', { type: 'checkbox' }); c.checked = T.grid; c.addEventListener('change', () => { T.grid = c.checked; requestDraw(); }); return c; })(), h('span', { text: 'Grid' })),
        h('button', { class: 'btn icon hide-narrow', type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.25), text: '−' }),
        h('span', { class: 'zoom-label hide-narrow', text: Math.round(view().zoom * 100) + '%' }),
        h('button', { class: 'btn icon hide-narrow', type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.25), text: '+' }),
        h('button', { class: 'btn', type: 'button', title: 'Show the whole room', onclick: fit, text: 'Fit' }));
      const tips = { select: OV.isTouch ? 'Tap an object to select it. Drag empty space to move around.' : 'Click to select, drag to move. Drag empty space to box-select. Space + drag pans.',
        place: st ? 'Click to place ' + st.name + '. Drag to place several.' : 'Pick an object in the Project panel, then click here to place it.',
        brush: 'Pick tiles in the Layers panel, then paint. Right-click erases.', rect: 'Drag out a box to fill it with the picked tiles.', fill: 'Click an area to flood it with the picked tile.',
        erase: 'Drag to erase tiles.', pick: 'Click a tile in the room to pick it up.', pan: 'Drag to move around. Ctrl + scroll or pinch to zoom.' };
      hint.textContent = tips[T.tool] || '';
    }
    function setTool(t) {
      const r = room(), v = view(), L = activeLayer();
      if (TILE_TOOLS.includes(t)) {
        if (!L || L.kind !== 'tiles') { const tl = topLayer(r, 'tiles'); if (!tl) { OV.toast('Add a tile layer in the Layers panel first.'); return; } v.layerId = tl.id; }
      } else if (t === 'select' || t === 'place') {
        if (!L || L.kind !== 'objects') { const ol = topLayer(r, 'objects'); if (ol) v.layerId = ol.id; }
      }
      T.tool = t; buildToolbar(); OV.Layers.render(); requestDraw();
    }

    /* ----- camera ----- */
    const size = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });
    const toWorld = p => { const v = view(); return { x: v.x + p.x / v.zoom, y: v.y + p.y / v.zoom }; };
    const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function zoomAt(z, p) { const v = view(), w = toWorld(p); v.auto = false; v.zoom = clamp(z, 0.25, 16); v.x = w.x - p.x / v.zoom; v.y = w.y - p.y / v.zoom; buildToolbar(); requestDraw(); }
    function zoomBy(f) { const s = size(); zoomAt(view().zoom * f, { x: s.w / 2, y: s.h / 2 }); }
    function fit() {
      const s = size(), r = room(), v = view(); if (!s.w || !s.h) return;
      v.zoom = clamp(Math.min(s.w / (r.w + 32), s.h / (r.h + 32)), 0.25, 16);
      v.x = r.w / 2 - s.w / 2 / v.zoom; v.y = r.h / 2 - s.h / 2 / v.zoom; v.fitted = true; v.auto = true; buildToolbar(); requestDraw();
    }

    /* ----- instances ----- */
    const selIds = () => (S.sel && S.sel.kind === 'inst' ? S.sel.ids : []);
    function selected() {
      const ids = selIds(), out = []; if (!ids.length) return out;
      room().layers.forEach(L => { if (L.kind === 'objects') L.instances.forEach(i => { if (ids.includes(i.id)) out.push({ inst: i, layer: L }); }); });
      return out;
    }
    function hitTest(w) {
      const r = room(), P = OV.project;
      for (let k = r.layers.length - 1; k >= 0; k--) {
        const L = r.layers[k]; if (L.kind !== 'objects' || L.visible === false || L.locked) continue;
        let best = null, area = Infinity;
        for (let n = L.instances.length - 1; n >= 0; n--) {
          const i = L.instances[n], b = M.instBox(P, i), pad = Math.max(0, 3 / view().zoom - Math.min(b.w, b.h) / 2);
          if (w.x >= b.x - pad && w.x <= b.x + b.w + pad && w.y >= b.y - pad && w.y <= b.y + b.h + pad && b.w * b.h < area) { best = i; area = b.w * b.h; }
        }
        if (best) return best;
      }
      return null;
    }
    const handlePx = () => (OV.isTouch ? 18 : 9);
    function onHandle(inst, w) { const b = M.instBox(OV.project, inst), r = handlePx() / view().zoom; return Math.abs(w.x - (b.x + b.w)) <= r && Math.abs(w.y - (b.y + b.h)) <= r; }
    function objectLayer() { const L = activeLayer(); return L && L.kind === 'objects' && !L.locked ? L : topLayer(room(), 'objects'); }
    function placeAt(w, typeId, useSnap) {
      const P = OV.project, type = OV.res('type', typeId), L = objectLayer(), r = room(); if (!type || !L) return null;
      const m = M.metrics(P, { typeId: type.id }, type);
      let x = w.x - m.dx - m.w / 2, y = w.y - m.dy - m.h / 2;
      if (useSnap) { const s = snapBox(r, m, x, y); x = s.x; y = s.y; } else { x = Math.round(x); y = Math.round(y); }
      if (L.instances.some(i => i.typeId === type.id && i.x === x && i.y === y)) return null;
      const inst = M.newInstance(type, x, y); L.instances.push(inst); return inst;
    }
    function deleteSelected() {
      const ids = selIds(); if (!ids.length) return;
      OV.beginEdit(); room().layers.forEach(L => { if (L.kind === 'objects') L.instances = L.instances.filter(i => !ids.includes(i.id)); });
      S.sel = null; OV.endEdit(true);
    }
    function duplicateSelected() {
      const sel = selected(); if (!sel.length) return; const g = room().grid || 16, ids = [];
      OV.beginEdit(); sel.forEach(s => { const c = OV.clone(s.inst); c.id = OV.uid('i'); c.x += g; c.y += g; s.layer.instances.push(c); ids.push(c.id); });
      S.sel = { kind: 'inst', ids: ids }; OV.endEdit(true);
    }
    function paste() {
      const L = objectLayer(); if (!clipboard.length || !L) return; const g = room().grid || 16, ids = [];
      OV.beginEdit(); clipboard.forEach(c => { if (!OV.res('type', c.typeId)) return; const n = OV.clone(c); n.id = OV.uid('i'); n.x += g; n.y += g; L.instances.push(n); ids.push(n.id); });
      clipboard = clipboard.map(c => Object.assign({}, c, { x: c.x + g, y: c.y + g }));
      S.sel = { kind: 'inst', ids: ids }; OV.endEdit(true);
    }

    /* ----- tile gestures ----- */
    function cellAt(L, w) { const ts = tsOf(L); return ts ? { x: Math.floor(w.x / ts.tw), y: Math.floor(w.y / ts.th) } : null; }
    function stamp(g, c) {
      const L = g.L, ts = g.ts;
      if (g.mode === 'erase') { setTile(L, ts, c.x, c.y, 0); return; }
      const s = T.tileSel, sw = s.x1 - s.x0 + 1, sh = s.y1 - s.y0 + 1;
      for (let dy = 0; dy < sh; dy++) for (let dx = 0; dx < sw; dx++) setTile(L, ts, c.x + dx, c.y + dy, selTile(ts, c.x + dx - g.ax, c.y + dy - g.ay));
    }
    function strokeTo(g, c) { // paint every cell between the last one and this one
      let x = g.last.x, y = g.last.y; const dx = Math.abs(c.x - x), dy = Math.abs(c.y - y), sx = x < c.x ? 1 : -1, sy = y < c.y ? 1 : -1; let err = dx - dy;
      for (let guard = 0; guard < 2000; guard++) { stamp(g, { x: x, y: y }); if (x === c.x && y === c.y) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; } }
      g.last = c;
    }
    function fillRect(g) {
      const x0 = Math.min(g.ax, g.last.x), x1 = Math.max(g.ax, g.last.x), y0 = Math.min(g.ay, g.last.y), y1 = Math.max(g.ay, g.last.y);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTile(g.L, g.ts, x, y, g.erase ? 0 : selTile(g.ts, x - x0, y - y0));
    }
    function flood(g, c) {
      const L = g.L, ts = g.ts; if (c.x < 0 || c.y < 0 || c.x >= L.cols || c.y >= L.rows) return;
      const from = L.data[c.y * L.cols + c.x] || 0, s = T.tileSel, single = s.x0 === s.x1 && s.y0 === s.y1;
      if (!g.erase && single && from === selTile(ts, 0, 0)) return;
      if (g.erase && from === 0) return;
      const seen = new Uint8Array(L.cols * L.rows), stack = [c.x, c.y];
      while (stack.length) {
        const y = stack.pop(), x = stack.pop(); if (x < 0 || y < 0 || x >= L.cols || y >= L.rows) continue;
        const k = y * L.cols + x; if (seen[k] || (L.data[k] || 0) !== from) continue; seen[k] = 1;
        setTile(L, ts, x, y, g.erase ? 0 : selTile(ts, x - c.x, y - c.y));
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
    }

    /* ----- pointer ----- */
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      if (S.playing) return;
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const p = local(e); pointers.set(e.pointerId, p);
      const v = view();
      if (pointers.size === 2) {
        if (gesture && gesture.editing) OV.endEdit();
        const [a, b] = [...pointers.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: v.zoom, wm: toWorld(mid) }; return;
      }
      if (pointers.size > 2) return;
      const w = toWorld(p), touch = e.pointerType === 'touch';
      const pan = () => { gesture = { type: 'pan', sx: p.x, sy: p.y, cx: v.x, cy: v.y }; };
      if (e.button === 1 || spaceDown || T.tool === 'pan') { pan(); return; }
      if (TILE_TOOLS.includes(T.tool)) {
        const L = activeLayer(), ts = L && L.kind === 'tiles' ? tsOf(L) : null;
        if (!L || L.kind !== 'tiles') { OV.toast('Choose a tile layer in the Layers panel.'); return; }
        if (!ts) { OV.toast('This layer has no tileset. Choose one in the Layers panel.'); return; }
        if (L.locked) { OV.toast('That layer is locked.'); return; }
        const c = cellAt(L, w), erase = e.button === 2 || T.tool === 'erase';
        if (T.tool === 'pick' || (e.altKey && T.tool === 'brush')) {
          const val = c.x >= 0 && c.y >= 0 && c.x < L.cols && c.y < L.rows ? L.data[c.y * L.cols + c.x] : 0;
          if (val) { const k = val - 1; T.tileSel = { x0: k % ts.cols, y0: Math.floor(k / ts.cols), x1: k % ts.cols, y1: Math.floor(k / ts.cols) }; setTool('brush'); }
          return;
        }
        OV.beginEdit();
        gesture = { type: T.tool === 'rect' ? 'rect' : 'tiles', editing: true, L: L, ts: ts, mode: erase ? 'erase' : 'brush', erase: erase, ax: c.x, ay: c.y, last: c };
        if (T.tool === 'fill') { flood(gesture, c); OV.endEdit(); gesture = null; }
        else if (T.tool !== 'rect') stamp(gesture, c);
        requestDraw(); return;
      }
      if (T.tool === 'place') {
        if (!OV.res('type', S.stampType)) { OV.toast('Pick an object in the Project panel first.'); return; }
        if (!objectLayer()) { OV.toast('Add an object layer in the Layers panel first.'); return; }
        OV.beginEdit(); gesture = { type: 'place', editing: true };
        placeAt(w, S.stampType, T.snap && !e.altKey); requestDraw(); return;
      }
      // select tool
      const sel = selected();
      if (sel.length === 1 && onHandle(sel[0].inst, w)) {
        const i = sel[0].inst, m = M.metrics(OV.project, i);
        OV.beginEdit(); gesture = { type: 'resize', editing: true, inst: i, sx: w.x, sy: w.y, w0: m.w, h0: m.h }; return;
      }
      const hit = hitTest(w);
      if (hit) {
        let ids = selIds().slice();
        if (e.shiftKey) { ids = ids.includes(hit.id) ? ids.filter(x => x !== hit.id) : ids.concat(hit.id); OV.select(ids.length ? { kind: 'inst', ids: ids } : null); if (!ids.includes(hit.id)) return; }
        else if (!ids.includes(hit.id)) OV.select({ kind: 'inst', ids: [hit.id] });
        OV.beginEdit();
        gesture = { type: 'move', editing: true, sx: w.x, sy: w.y, anchor: hit, ax: hit.x, ay: hit.y, items: selected().map(s => ({ inst: s.inst, x: s.inst.x, y: s.inst.y })) };
      } else if (touch) { if (selIds().length) OV.select(null); pan(); }
      else { if (!e.shiftKey && selIds().length) OV.select(null); gesture = { type: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: e.shiftKey ? selIds().slice() : [] }; }
    });
    canvas.addEventListener('pointermove', e => {
      if (S.playing) return;
      const p = local(e), v = view(), w = toWorld(p);
      if (e.pointerType === 'mouse') { hover = w; if (!gesture && (T.tool === 'place' || TILE_TOOLS.includes(T.tool))) requestDraw(); }
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, p);
      const g = gesture; if (!g) return;
      if (g.type === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        v.zoom = clamp(g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, 0.25, 16); v.x = g.wm.x - mid.x / v.zoom; v.y = g.wm.y - mid.y / v.zoom; v.auto = false;
      } else if (g.type === 'pan') { v.x = g.cx - (p.x - g.sx) / v.zoom; v.y = g.cy - (p.y - g.sy) / v.zoom; v.auto = false; }
      else if (g.type === 'tiles') { const c = cellAt(g.L, w); if (c.x !== g.last.x || c.y !== g.last.y) strokeTo(g, c); }
      else if (g.type === 'rect') g.last = cellAt(g.L, w);
      else if (g.type === 'place') placeAt(w, S.stampType, T.snap && !e.altKey);
      else if (g.type === 'move') {
        let nx = g.ax + (w.x - g.sx), ny = g.ay + (w.y - g.sy);
        if (T.snap && !e.altKey) { const s = snapBox(room(), M.metrics(OV.project, g.anchor), nx, ny); nx = s.x; ny = s.y; } else { nx = Math.round(nx); ny = Math.round(ny); }
        const dx = nx - g.ax, dy = ny - g.ay;
        g.items.forEach(it => { it.inst.x = it.x + dx; it.inst.y = it.y + dy; });
        OV.Props.sync();
      } else if (g.type === 'resize') {
        let nw = g.w0 + (w.x - g.sx), nh = g.h0 + (w.y - g.sy);
        if (e.shiftKey) { const k = Math.max(nw / g.w0, nh / g.h0); nw = g.w0 * k; nh = g.h0 * k; }
        if (T.snap && !e.altKey) { const q = (room().grid || 16) / 2; nw = Math.round(nw / q) * q; nh = Math.round(nh / q) * q; }
        g.inst.w = Math.max(2, Math.round(nw)); g.inst.h = Math.max(2, Math.round(nh));
        OV.Props.sync();
      } else if (g.type === 'marquee') { g.x1 = w.x; g.y1 = w.y; }
      requestDraw();
    });
    function endPointer(e) {
      pointers.delete(e.pointerId);
      const g = gesture; if (!g) return;
      if (g.type === 'pinch') { if (pointers.size === 1) { const [p] = [...pointers.values()], v = view(); gesture = { type: 'pan', sx: p.x, sy: p.y, cx: v.x, cy: v.y }; } else if (!pointers.size) gesture = null; return; }
      if (pointers.size) return;
      gesture = null;
      if (g.type === 'rect') { fillRect(g); OV.endEdit(); }
      else if (g.type === 'marquee') {
        const x0 = Math.min(g.x0, g.x1), x1 = Math.max(g.x0, g.x1), y0 = Math.min(g.y0, g.y1), y1 = Math.max(g.y0, g.y1), ids = g.add.slice(), P = OV.project;
        if (x1 - x0 > 2 / view().zoom || y1 - y0 > 2 / view().zoom) room().layers.forEach(L => {
          if (L.kind !== 'objects' || L.locked || L.visible === false) return;
          L.instances.forEach(i => { const b = M.instBox(P, i); if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0 && !ids.includes(i.id)) ids.push(i.id); });
        });
        if (ids.length) OV.select({ kind: 'inst', ids: ids });
      } else if (g.editing) OV.endEdit();
      requestDraw();
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', () => { hover = null; requestDraw(); });
    canvas.addEventListener('wheel', e => {
      if (S.playing) return; e.preventDefault();
      const v = view(), p = local(e);
      if (e.ctrlKey || e.metaKey) zoomAt(v.zoom * Math.exp(-e.deltaY * 0.01), p);
      else { v.x += e.deltaX / v.zoom; v.y += e.deltaY / v.zoom; v.auto = false; requestDraw(); }
    }, { passive: false });
    const ro = new ResizeObserver(() => { const v = view(); if (!v.fitted || v.auto) fit(); else requestDraw(); });
    ro.observe(canvas);

    /* ----- drawing ----- */
    function requestDraw() { if (queued || dead) return; queued = true; requestAnimationFrame(() => { queued = false; if (!dead) draw(); }); }
    function draw() {
      const r = room(); if (!r) return;
      const P = OV.project, v = view(), z = v.zoom, dpr = RT.fitCanvas(canvas), cw = canvas.width / dpr, ch = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = cssVar('--void') || '#d6dbe3'; ctx.fillRect(0, 0, cw, ch);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, -v.x * z * dpr, -v.y * z * dpr);
      ctx.imageSmoothingEnabled = P.settings.pixelArt === false;
      ctx.fillStyle = r.bg || '#000'; ctx.fillRect(0, 0, r.w, r.h);
      const env = RT.makeEnv(P); env.editor = true; env.pixel = false;
      r.layers.forEach(L => {
        if (L.visible === false) return;
        ctx.globalAlpha = L.opacity == null ? 1 : L.opacity;
        if (L.kind === 'tiles') { const c = tileCanvasFor(L); if (c) ctx.drawImage(c, 0, 0); }
        else {
          const list = L.ysort ? L.instances.slice().sort((a, b) => a.y - b.y) : L.instances;
          for (const i of list) { const m = M.metrics(P, i); if (m.type) RT.drawInst(ctx, { t: i.typeId, x: i.x, y: i.y, w: m.w, h: m.h, a: i.angle, o: i.opacity }, env, 0); }
        }
      });
      ctx.globalAlpha = 1;
      const g = r.grid || 16;
      if (T.grid && g * z >= 6) {
        ctx.beginPath();
        const x0 = Math.max(0, Math.floor(v.x / g) * g), x1 = Math.min(r.w, v.x + cw / z), y0 = Math.max(0, Math.floor(v.y / g) * g), y1 = Math.min(r.h, v.y + ch / z);
        for (let x = x0; x <= x1; x += g) { ctx.moveTo(x, Math.max(0, v.y)); ctx.lineTo(x, y1); }
        for (let y = y0; y <= y1; y += g) { ctx.moveTo(Math.max(0, v.x), y); ctx.lineTo(x1, y); }
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1 / z; ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.setLineDash([1 / z, 1 / z]); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2 / z; ctx.strokeRect(0, 0, r.w, r.h);
      // how much of the room fits on screen at once
      ctx.setLineDash([6 / z, 4 / z]); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1 / z; ctx.strokeRect(0, 0, Math.min(P.settings.viewW, r.w), Math.min(P.settings.viewH, r.h)); ctx.setLineDash([]);
      const acc = cssVar('--accent') || '#c96a17';
      // previews
      const active = activeLayer();
      if (hover && !gesture) {
        if (T.tool === 'place' && OV.res('type', S.stampType)) {
          const type = OV.res('type', S.stampType), m = M.metrics(P, { typeId: type.id }, type);
          let x = hover.x - m.dx - m.w / 2, y = hover.y - m.dy - m.h / 2; if (T.snap) { const s = snapBox(r, m, x, y); x = s.x; y = s.y; }
          ctx.globalAlpha = 0.55; RT.drawInst(ctx, { t: type.id, x: x, y: y, w: m.w, h: m.h }, env, 0); ctx.globalAlpha = 1;
        } else if (TILE_TOOLS.includes(T.tool) && active && active.kind === 'tiles' && tsOf(active)) {
          const ts = tsOf(active), c = cellAt(active, hover), s = T.tileSel, big = T.tool === 'brush';
          const sw = big ? s.x1 - s.x0 + 1 : 1, sh = big ? s.y1 - s.y0 + 1 : 1, im = RT.image(ts.src);
          if (big && RT.ready(im)) { ctx.globalAlpha = 0.6; ctx.drawImage(im, s.x0 * ts.tw, s.y0 * ts.th, sw * ts.tw, sh * ts.th, c.x * ts.tw, c.y * ts.th, sw * ts.tw, sh * ts.th); ctx.globalAlpha = 1; }
          ctx.strokeStyle = acc; ctx.lineWidth = 1.5 / z; ctx.strokeRect(c.x * ts.tw, c.y * ts.th, sw * ts.tw, sh * ts.th);
        }
      }
      if (gesture && gesture.type === 'rect') {
        const q = gesture, ts = q.ts, x0 = Math.min(q.ax, q.last.x), x1 = Math.max(q.ax, q.last.x), y0 = Math.min(q.ay, q.last.y), y1 = Math.max(q.ay, q.last.y);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0 * ts.tw, y0 * ts.th, (x1 - x0 + 1) * ts.tw, (y1 - y0 + 1) * ts.th);
        ctx.strokeStyle = acc; ctx.lineWidth = 1.5 / z; ctx.strokeRect(x0 * ts.tw, y0 * ts.th, (x1 - x0 + 1) * ts.tw, (y1 - y0 + 1) * ts.th);
      }
      // selection
      const sel = selected();
      if (sel.length) {
        ctx.strokeStyle = acc; ctx.lineWidth = 1.5 / z; ctx.setLineDash([4 / z, 3 / z]);
        sel.forEach(s => { const b = M.instBox(P, s.inst); ctx.strokeRect(b.x - 1 / z, b.y - 1 / z, b.w + 2 / z, b.h + 2 / z); });
        ctx.setLineDash([]);
        if (sel.length === 1) {
          const b = M.instBox(P, sel[0].inst), hs = handlePx() / z;
          ctx.fillStyle = acc; ctx.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 / z; ctx.strokeRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sel[0].inst.x, sel[0].inst.y, 2 / z, 0, 6.3); ctx.fill(); // the position point
        }
      }
      if (gesture && gesture.type === 'marquee') {
        const q = gesture; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = acc; ctx.lineWidth = 1 / z;
        ctx.fillRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0); ctx.strokeRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
      }
    }

    /* ----- keys ----- */
    function key(e) {
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), sel = selected();
      if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (mod && k === 'c' && sel.length) { clipboard = sel.map(s => OV.clone(s.inst)); OV.toast('Copied ' + sel.length); return; }
      if (mod && k === 'x' && sel.length) { clipboard = sel.map(s => OV.clone(s.inst)); deleteSelected(); return; }
      if (mod && k === 'v') { e.preventDefault(); paste(); return; }
      if (mod && k === 'a') { e.preventDefault(); const L = objectLayer(); if (L && L.instances.length) OV.select({ kind: 'inst', ids: L.instances.map(i => i.id) }); return; }
      if (mod) return;
      const tool = TOOLS.find(t => t[2].toLowerCase() === k);
      if (tool) { setTool(tool[0]); return; }
      if (k === 'escape') { OV.select(null); return; }
      if ((k === 'delete' || k === 'backspace') && sel.length) { e.preventDefault(); deleteSelected(); return; }
      if (k === '+' || k === '=') { zoomBy(1.25); return; }
      if (k === '-') { zoomBy(1 / 1.25); return; }
      if (k === '0') { fit(); return; }
      const dirs = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      if (dirs[k] && sel.length) {
        e.preventDefault(); const step = e.shiftKey ? 1 : room().grid || 16;
        OV.beginEdit(); sel.forEach(s => { s.inst.x += dirs[k][0] * step; s.inst.y += dirs[k][1] * step; }); OV.endEdit(); OV.Props.sync(); requestDraw();
      }
    }

    cur = { roomId: roomId, setTool: setTool, requestDraw: requestDraw, buildToolbar: buildToolbar, canvas: canvas, toWorld: toWorld, placeAt: placeAt, view: view, room: room };
    buildToolbar();
    const stop = OV.on;
    return {
      touch() { buildToolbarIfStampChanged(); requestDraw(); },
      refresh() { tileCache.clear(); buildToolbar(); requestDraw(); },
      key: key, keyup(e) { if (e.code === 'Space') spaceDown = false; },
      destroy() { dead = true; ro.disconnect(); if (cur && cur.roomId === roomId) cur = null; },
    };
    function buildToolbarIfStampChanged() { if (cur && cur._stamp !== S.stampType) { cur._stamp = S.stampType; buildToolbar(); } }
  }
  OV.docs.room = { mount: mount };

  OV.RoomEditor = {
    dropAt(typeId, cx, cy) {
      if (!cur) { OV.toast('Open a room to drop objects into it.'); return; }
      const r = cur.canvas.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return;
      OV.beginEdit(); const inst = cur.placeAt(cur.toWorld({ x: cx - r.left, y: cy - r.top }), typeId, T.snap);
      if (inst) S.sel = { kind: 'inst', ids: [inst.id] };
      OV.endEdit(true); cur.setTool('select');
    },
    invalidate() { tileCache.clear(); if (cur) cur.requestDraw(); },
    setTool(t) { if (cur) cur.setTool(t); },
    tool: () => T.tool,
  };

  /* ================= Layers panel ================= */
  OV.Layers = {
    render() {
      const root = OV.$('#layers'); if (!root) return;
      root.textContent = '';
      const room = OV.currentRoom(), P = OV.project;
      if (!room || !cur) { root.append(h('h2', { class: 'label', text: 'Layers' }), h('p', { class: 'muted small', text: 'Open a room to see its layers.' })); return; }
      const v = viewOf(room);
      const add = (kind, name, hud) => OV.edit(() => { const L = M.newLayer(P, room, kind, name); if (hud) L.parallax = 0; room.layers.push(L); v.layerId = L.id; });
      root.append(h('div', { class: 'tree-head' }, h('h2', { class: 'label', text: 'Layers' }),
        h('div', { class: 'row' }, OV.ui.btn('+ Tiles', () => add('tiles', 'Tiles'), 'small'), OV.ui.btn('+ Objects', () => add('objects', 'Objects'), 'small'), OV.ui.btn('+ HUD', () => add('objects', 'HUD', true), 'small'))));
      const list = h('div', { class: 'layer-list' });
      room.layers.slice().reverse().forEach(L => {
        const k = room.layers.indexOf(L), active = L.id === v.layerId;
        const row = h('div', { class: 'layer' + (active ? ' active' : ''), role: 'button', tabindex: 0 },
          h('button', { class: 'layer-btn' + (L.visible === false ? ' off' : ''), type: 'button', title: 'Show or hide', 'aria-label': 'Show or hide ' + L.name, onclick: e => { e.stopPropagation(); OV.edit(() => (L.visible = L.visible === false)); }, text: L.visible === false ? '○' : '●' }),
          h('button', { class: 'layer-btn' + (L.locked ? ' on' : ''), type: 'button', title: 'Lock', 'aria-label': 'Lock ' + L.name, onclick: e => { e.stopPropagation(); OV.edit(() => (L.locked = !L.locked)); }, text: L.locked ? '🔒' : '·' }),
          h('span', { class: 'tree-icon', text: L.kind === 'tiles' ? '▦' : L.parallax === 0 ? '▣' : '◆' }), h('span', { class: 'tree-name', text: L.name }),
          h('button', { class: 'tree-more', type: 'button', 'aria-label': 'More for ' + L.name, text: '⋯', onclick: e => {
            e.stopPropagation();
            OV.menu(e.currentTarget, [
              { label: 'Rename', onClick: () => OV.ask('Rename layer', L.name).then(n => { if (n && n.trim()) OV.edit(() => (L.name = n.trim())); }) },
              { label: 'Move up', disabled: k === room.layers.length - 1, onClick: () => OV.edit(() => { room.layers.splice(k, 1); room.layers.splice(k + 1, 0, L); }) },
              { label: 'Move down', disabled: k === 0, onClick: () => OV.edit(() => { room.layers.splice(k, 1); room.layers.splice(k - 1, 0, L); }) },
              { sep: true }, { label: 'Delete', danger: true, disabled: room.layers.length === 1, onClick: () => OV.edit(() => { room.layers.splice(k, 1); }) },
            ]);
          } }));
        row.addEventListener('click', () => { v.layerId = L.id; const tileTool = TILE_TOOLS.includes(T.tool); if (L.kind === 'tiles' && !tileTool) cur.setTool('brush'); else if (L.kind === 'objects' && tileTool) cur.setTool('select'); else { OV.Layers.render(); cur.requestDraw(); } });
        list.append(row);
      });
      root.append(list);
      const L = OV.byId(room.layers, v.layerId); if (!L) return;
      const box = h('div', { class: 'section', style: { marginTop: '10px' } });
      box.append(OV.ui.grid(
        OV.ui.num('Opacity', () => (L.opacity == null ? 1 : L.opacity), x => (L.opacity = clamp(x, 0, 1)), { step: 0.1, min: 0, max: 1 }),
        OV.ui.num('Scroll speed', () => (L.parallax == null ? 1 : L.parallax), x => (L.parallax = clamp(x, 0, 2)), { step: 0.1, min: 0, max: 2 })));
      box.append(h('p', { class: 'muted small', style: { margin: '6px 0 0' }, text: L.parallax === 0 ? 'Scroll speed 0: this layer stays fixed on screen. Good for score and hearts. The dashed box in the room shows the screen.' : 'Scroll speed 1 is normal. 0 stays fixed on screen. 0.5 drifts slowly, like a far background.' }));
      if (L.kind === 'objects') box.append(h('div', { style: { marginTop: '8px' } }, OV.ui.check('Sort by Y, so lower things draw in front', () => L.ysort, x => (L.ysort = x))));
      else {
        box.append(h('div', { style: { marginTop: '8px' } }, OV.ui.select('Tileset', [['', '(none)']].concat(P.tilesets.map(t => [t.id, t.name])), () => L.tilesetId || '', x => { L.tilesetId = x || null; M.fitRoomLayers(P, room); tileCache.clear(); })));
        const ts = OV.byId(P.tilesets, L.tilesetId);
        if (ts) box.append(palette(ts));
      }
      root.append(box);
    },
  };

  /* The tile palette: click or drag to choose which tiles the brush paints. */
  function palette(ts) {
    const wrap = h('div', { class: 'palette' }), c = h('canvas', { class: 'palette-canvas', 'aria-label': 'Tile palette' });
    const scale = Math.max(1, Math.min(3, Math.floor(280 / (ts.cols * ts.tw)) || 1));
    const W = ts.cols * ts.tw * scale, H = ts.rows * ts.th * scale;
    c.width = W * 2; c.height = H * 2; c.style.width = W + 'px'; c.style.height = H + 'px';
    const x = c.getContext('2d');
    function paint() {
      x.setTransform(2, 0, 0, 2, 0, 0); x.clearRect(0, 0, W, H); x.imageSmoothingEnabled = false;
      const im = RT.image(ts.src); if (RT.ready(im)) x.drawImage(im, 0, 0, ts.cols * ts.tw, ts.rows * ts.th, 0, 0, W, H); else setTimeout(paint, 150);
      const s = T.tileSel, cw = ts.tw * scale, chh = ts.th * scale;
      x.fillStyle = 'rgba(196,61,54,0.85)';
      ts.solid.forEach((sol, k) => { if (sol) x.fillRect((k % ts.cols) * cw + cw - 5, Math.floor(k / ts.cols) * chh + 1, 4, 4); });
      x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.strokeRect(s.x0 * cw + 1, s.y0 * chh + 1, (s.x1 - s.x0 + 1) * cw - 2, (s.y1 - s.y0 + 1) * chh - 2);
      x.strokeStyle = '#000000'; x.lineWidth = 1; x.strokeRect(s.x0 * cw + 2.5, s.y0 * chh + 2.5, (s.x1 - s.x0 + 1) * cw - 5, (s.y1 - s.y0 + 1) * chh - 5);
    }
    let start = null;
    const cell = e => { const r = c.getBoundingClientRect(); return { x: clamp(Math.floor((e.clientX - r.left) / (ts.tw * scale)), 0, ts.cols - 1), y: clamp(Math.floor((e.clientY - r.top) / (ts.th * scale)), 0, ts.rows - 1) }; };
    const set = (a, b) => { T.tileSel = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }; paint(); };
    c.addEventListener('pointerdown', e => { try { c.setPointerCapture(e.pointerId); } catch (_) {} start = cell(e); set(start, start); });
    c.addEventListener('pointermove', e => { if (start) set(start, cell(e)); });
    c.addEventListener('pointerup', () => { start = null; if (cur && (T.tool === 'select' || T.tool === 'place' || T.tool === 'pick' || T.tool === 'pan')) cur.setTool('brush'); });
    paint();
    wrap.append(h('h2', { class: 'label', style: { marginTop: '10px' }, text: 'Tiles' }), h('div', { class: 'palette-scroll' }, c),
      h('p', { class: 'muted small', style: { margin: '6px 0 0' }, text: 'Click a tile, or drag across several. Red dots mark solid tiles.' }));
    return wrap;
  }
})();
