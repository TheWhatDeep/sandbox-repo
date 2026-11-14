/* Overhead Studio: the game engine.
   This whole function is turned into text and run inside a Web Worker (a background thread),
   so a script that never ends can freeze the game but never the editor. It must therefore be
   self-contained: nothing outside this function is visible to it.
   It simulates the game 60 times a second and posts a "frame" (what to draw) back each step. */
window.OV = window.OV || {};
window.OV.engineMain = function () {
  'use strict';
  const DT = 1 / 60, CELL = 48, RAD = Math.PI / 180;
  let P = null, VIEW = { w: 288, h: 176 };
  let types = {}, typeByName = {}, sprites = {}, tilesets = {}, rooms = {}, roomByName = {}, soundByName = {};
  let G = {}, defs = {}, unitByKey = {}, badUnits = {};
  let room = null, insts = [], byType = new Map(), tileLayers = [], grid = new Map(), sheets = [], startConds = [];
  let time = 0, roomTime = 0, roomTick = 0, state = 'playing', message = '', dialog = null, lockUntil = 0;
  let input = { ax: 0, ay: 0, down: {}, pressed: {}, released: {}, taps: [] };
  let logs = [], errors = [], fx = [];
  let created = [], destroyed = [], createdNow = [], destroyedNow = [], waits = [], cst = new Map();
  let pendingRoom = null, building = false, nextId = 1, debug = false, inspectId = null, lastTap = { x: 0, y: 0 };
  const cam = { x: 0, y: 0, zoom: 1, z0: 1, z1: 1, zt: 1, zd: 0, shake: 0, shakeUntil: 0, target: null, lag: 0 };
  let nav = null, navDirty = true, navAt = 0;
  let CUR = { sol: null, pairs: null, self: null };
  const noop = function () {}, reported = new Set();

  self.__def = function (k, f) { defs[k] = f; };

  /* ================= helpers ================= */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hypot = Math.hypot;
  function random(a, b) { if (a === undefined) return Math.random(); if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
  function show(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(Math.round(v * 100) / 100);
    if (v instanceof Inst) return '[' + v._type.name + (v.name ? ' "' + v.name + '"' : '') + ']';
    if (v === NONE) return '[nothing]';
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  function log() { if (logs.length < 200) logs.push(Array.prototype.map.call(arguments, show).join(' ')); }
  function pt(t) {
    if (!t || t === NONE) return null;
    if (t instanceof Inst) return { x: t.cx, y: t.cy };
    if (typeof t === 'string') { const i = find(t); return i ? { x: i.cx, y: i.cy } : null; }
    if (typeof t.x === 'number' && typeof t.y === 'number') return t;
    return null;
  }
  const gone = t => !t || t === NONE || (t instanceof Inst && t._dead);
  const kindOk = (o, k) => !k || k === 'any' || o.kind === k;
  const matchQ = (i, q) => q === i || i._type.name === q || i.kind === q || (!!i.name && i.name === q);
  const matches = (i, key) => (key.charCodeAt(0) === 107 && key.startsWith('kind:') ? i.kind === key.slice(5) : i._type.id === key);
  function allOf(key) {
    if (!key) return [];
    if (key.startsWith('kind:')) { const k = key.slice(5); return insts.filter(i => !i._dead && i.kind === k); }
    const l = byType.get(key); return l ? l.filter(i => !i._dead) : [];
  }
  const find = q => insts.find(i => !i._dead && matchQ(i, q)) || null;
  const findAll = q => insts.filter(i => !i._dead && matchQ(i, q));
  function nearest(q, to) {
    const p = pt(to); if (!p) return null; let best = null, bd = Infinity;
    for (const i of insts) { if (i._dead || i === to || !matchQ(i, q)) continue; const d = hypot(i.cx - p.x, i.cy - p.y); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function nearestKind(i, kind) {
    let best = null, bd = Infinity;
    for (const o of insts) { if (o._dead || o === i || !kindOk(o, kind) || o._isBullet) continue; const d = hypot(o.cx - i.cx, o.cy - i.cy); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  const thePlayer = () => insts.find(i => !i._dead && i._isPlayer) || insts.find(i => !i._dead && i.kind === 'player') || null;

  function report(src, err, where) {
    const u = src || {};
    let line = null;
    if (u.start && u.kind === 'script') { // find the first stack frame that points inside this script
      const re = /:(\d+):\d+\)?\s*$/gm, stack = String((err && err.stack) || ''); let m;
      while ((m = re.exec(stack))) { const n = +m[1]; if (n > u.start && n < u.start + u.lines) { line = n - u.start; break; } }
    }
    const msg = String((err && err.message) || err), seen = (u.kind || '') + '|' + (u.typeId || u.eventId || '') + '|' + line + '|' + msg;
    if (reported.has(seen)) return; reported.add(seen);
    if (errors.length < 50) errors.push({ kind: u.kind || 'engine', typeId: u.typeId, sheetId: u.sheetId, eventId: u.eventId, name: u.name || '', where: where || '', line: line, message: String((err && err.message) || err) });
  }

  /* ================= spatial hash: a grid of buckets so collision checks only look nearby ================= */
  function hashAdd(i) {
    if (i._hud) { i._c = null; i._hx = i.x; i._hy = i.y; return; }
    const l = i.x + i._hl, t = i.y + i._ht;
    const c = [Math.floor(l / CELL), Math.floor(t / CELL), Math.floor((l + i._hw) / CELL), Math.floor((t + i._hh) / CELL)];
    i._c = c; i._hx = i.x; i._hy = i.y;
    for (let y = c[1]; y <= c[3]; y++) for (let x = c[0]; x <= c[2]; x++) { const k = x + y * 8192; let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(i); }
  }
  function hashDel(i) {
    const c = i._c; if (!c) return;
    for (let y = c[1]; y <= c[3]; y++) for (let x = c[0]; x <= c[2]; x++) { const b = grid.get(x + y * 8192); if (b) { const n = b.indexOf(i); if (n >= 0) { b[n] = b[b.length - 1]; b.pop(); } } }
    i._c = null;
  }
  function hashMove(i) { if (i._dead) return; if (i._hx !== i.x || i._hy !== i.y || !i._c) { hashDel(i); hashAdd(i); } }
  function syncAll() { for (const i of insts) if (!i._dead && (i._hx !== i.x || i._hy !== i.y)) { hashDel(i); hashAdd(i); } }
  let qid = 0;
  function query(l, t, w, h, out) {
    out.length = 0; qid++;
    const x0 = Math.floor(l / CELL), y0 = Math.floor(t / CELL), x1 = Math.floor((l + w) / CELL), y1 = Math.floor((t + h) / CELL);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const b = grid.get(x + y * 8192); if (!b) continue;
      for (let k = 0; k < b.length; k++) { const i = b[k]; if (i._q !== qid && !i._dead) { i._q = qid; out.push(i); } }
    }
    return out;
  }
  function overlap(a, b, m) {
    m = m || 0; const al = a.x + a._hl, at = a.y + a._ht, bl = b.x + b._hl, bt = b.y + b._ht;
    return al < bl + b._hw + m && al + a._hw + m > bl && at < bt + b._hh + m && at + a._hh + m > bt;
  }
  function touchers(i, out) {
    const list = query(i.x + i._hl - 1, i.y + i._ht - 1, i._hw + 2, i._hh + 2, []);
    out = out || [];
    for (const o of list) if (o !== i && overlap(i, o, 1)) out.push(o);
    return out;
  }
  function tileSolidAt(x, y) {
    for (const T of tileLayers) {
      const tx = Math.floor(x / T.tw), ty = Math.floor(y / T.th);
      if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) continue;
      const v = T.data[ty * T.cols + tx]; if (v && T.solid[v - 1]) return true;
    }
    return false;
  }

  /* ================= movement with collisions ================= */
  function blockAxis(i, dx, dy) {
    let hit = false;
    for (const T of tileLayers) {
      const l = i.x + i._hl, t = i.y + i._ht;
      const x0 = Math.max(0, Math.floor(l / T.tw)), x1 = Math.min(T.cols - 1, Math.floor((l + i._hw - 0.001) / T.tw));
      const y0 = Math.max(0, Math.floor(t / T.th)), y1 = Math.min(T.rows - 1, Math.floor((t + i._hh - 0.001) / T.th));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const v = T.data[ty * T.cols + tx]; if (!v || !T.solid[v - 1]) continue;
        if (dx > 0) i.x = Math.min(i.x, tx * T.tw - i._hl - i._hw); else if (dx < 0) i.x = Math.max(i.x, (tx + 1) * T.tw - i._hl);
        if (dy > 0) i.y = Math.min(i.y, ty * T.th - i._ht - i._hh); else if (dy < 0) i.y = Math.max(i.y, (ty + 1) * T.th - i._ht);
        hit = true;
      }
    }
    const list = query(i.x + i._hl, i.y + i._ht, i._hw, i._hh, []);
    for (const s of list) {
      if (s === i || !s.solid || s._dead || !overlap(i, s)) continue;
      if (s.pushable && !i._pushing && !s._pushing) {
        const px = dx > 0 ? i.x + i._hl + i._hw - (s.x + s._hl) : dx < 0 ? i.x + i._hl - (s.x + s._hl + s._hw) : 0;
        const py = dy > 0 ? i.y + i._ht + i._hh - (s.y + s._ht) : dy < 0 ? i.y + i._ht - (s.y + s._ht + s._hh) : 0;
        i._pushing = true; const keep = s.facing; moveInst(s, px, py); s.facing = keep; i._pushing = false;
        if (!overlap(i, s)) continue;
      }
      if (dx > 0) i.x = s.x + s._hl - i._hl - i._hw; else if (dx < 0) i.x = s.x + s._hl + s._hw - i._hl;
      if (dy > 0) i.y = s.y + s._ht - i._ht - i._hh; else if (dy < 0) i.y = s.y + s._ht + s._hh - i._ht;
      hit = true;
    }
    return hit;
  }
  function moveInst(i, dx, dy) {
    if (i._dead || (!dx && !dy)) return true;
    let bx = false, by = false;
    if (!i.collides) { i.x += dx; i.y += dy; }
    else {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5)), sx = dx / n, sy = dy / n;
      for (let k = 0; k < n; k++) {
        if (sx && !bx) { i.x += sx; if (blockAxis(i, sx, 0)) bx = true; }
        if (sy && !by) { i.y += sy; if (blockAxis(i, 0, sy)) by = true; }
        if ((bx || !sx) && (by || !sy)) break;
      }
      const nx = clamp(i.x, -i._hl, Math.max(-i._hl, room.w - i._hl - i._hw)), ny = clamp(i.y, -i._ht, Math.max(-i._ht, room.h - i._ht - i._hh));
      if (nx !== i.x) { i.x = nx; bx = true; } if (ny !== i.y) { i.y = ny; by = true; }
    }
    const m = hypot(dx, dy); if (m > 0) i.facing = { x: dx / m, y: dy / m };
    i._blocked = bx || by; i._bx = bx; i._by = by;
    hashMove(i);
    if (i.solid && !i.pushable) navDirty = true;
    return !(bx || by);
  }
  function los(a, b, range) {
    const ax = a.cx, ay = a.cy, p = pt(b); if (!p) return false;
    const d = hypot(p.x - ax, p.y - ay);
    if (range != null && d > range) return false;
    const n = Math.ceil(d / 4), tmp = [];
    for (let k = 1; k < n; k++) {
      const x = ax + (p.x - ax) * k / n, y = ay + (p.y - ay) * k / n;
      if (tileSolidAt(x, y)) return false;
      query(x, y, 0.01, 0.01, tmp);
      for (const s of tmp) if (s.solid && s !== a && s !== b && x >= s.x + s._hl && x <= s.x + s._hl + s._hw && y >= s.y + s._ht && y <= s.y + s._ht + s._hh) return false;
    }
    return true;
  }

  /* ================= pathfinding (A* on the room grid) ================= */
  function buildNav() {
    const cs = room.grid || 16, cols = Math.ceil(room.w / cs), rows = Math.ceil(room.h / cs), blocked = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const l = x * cs + 1, t = y * cs + 1, r = (x + 1) * cs - 1, b = (y + 1) * cs - 1;
      if (tileSolidAt(l, t) || tileSolidAt(r, t) || tileSolidAt(l, b) || tileSolidAt(r, b) || tileSolidAt((l + r) / 2, (t + b) / 2)) blocked[y * cols + x] = 1;
    }
    for (const s of insts) {
      if (s._dead || !s.solid || s.pushable) continue;
      const x0 = Math.max(0, Math.floor((s.x + s._hl + 1) / cs)), x1 = Math.min(cols - 1, Math.floor((s.x + s._hl + s._hw - 1) / cs));
      const y0 = Math.max(0, Math.floor((s.y + s._ht + 1) / cs)), y1 = Math.min(rows - 1, Math.floor((s.y + s._ht + s._hh - 1) / cs));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * cols + x] = 1;
    }
    const n = cols * rows;
    nav = { cs: cs, cols: cols, rows: rows, blocked: blocked, g: new Float32Array(n), f: new Float32Array(n), from: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), gen: 0 };
    navDirty = false; navAt = time + 0.5;
  }
  function ensureNav() { if (!nav || (navDirty && time >= navAt)) buildNav(); return nav; }
  function findPath(sx, sy, tx, ty) {
    const N = ensureNav(), cols = N.cols, rows = N.rows, cs = N.cs, B = N.blocked;
    const cx = v => clamp(Math.floor(v / cs), 0, cols - 1), cy = v => clamp(Math.floor(v / cs), 0, rows - 1);
    const start = cy(sy) * cols + cx(sx); let goal = cy(ty) * cols + cx(tx);
    if (B[goal]) { // target stands in a blocked cell: aim for the nearest open one
      let best = -1, bd = Infinity; const gx = goal % cols, gy = (goal / cols) | 0;
      for (let y = gy - 2; y <= gy + 2; y++) for (let x = gx - 2; x <= gx + 2; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows || B[y * cols + x]) continue;
        const d = hypot((x + 0.5) * cs - tx, (y + 0.5) * cs - ty); if (d < bd) { bd = d; best = y * cols + x; }
      }
      if (best < 0) return null; goal = best;
    }
    if (start === goal) return [{ x: tx, y: ty }];
    const gen = ++N.gen, g = N.g, f = N.f, from = N.from, stamp = N.stamp, closed = N.closed;
    const gx = goal % cols, gy = (goal / cols) | 0;
    const heur = i => { const dx = Math.abs((i % cols) - gx), dy = Math.abs(((i / cols) | 0) - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const heap = [start]; g[start] = 0; f[start] = heur(start); stamp[start] = gen; from[start] = -1;
    const push = i => { heap.push(i); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && f[heap[a]] < f[heap[m]]) m = a; if (b < heap.length && f[heap[b]] < f[heap[m]]) m = b; if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } }
      return top;
    };
    let steps = 0;
    while (heap.length && steps++ < 6000) {
      const c = pop(); if (closed[c] === gen) continue; closed[c] = gen;
      if (c === goal) {
        const out = []; let k = c;
        while (k !== -1 && k !== start) { out.push({ x: ((k % cols) + 0.5) * cs, y: (((k / cols) | 0) + 0.5) * cs }); k = from[k]; }
        out.reverse(); out[out.length - 1] = B[cy(ty) * cols + cx(tx)] ? out[out.length - 1] : { x: tx, y: ty };
        return out;
      }
      const x = c % cols, y = (c / cols) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx; if (B[ni] || closed[ni] === gen) continue;
        if (dx && dy && (B[y * cols + nx] || B[ny * cols + x])) continue;
        const ng = g[c] + (dx && dy ? 1.414 : 1);
        if (stamp[ni] !== gen || ng < g[ni]) { stamp[ni] = gen; g[ni] = ng; f[ni] = ng + heur(ni); from[ni] = c; push(ni); }
      }
    }
    return null;
  }
  function clearWalk(i, x0, y0, x1, y1) {
    const N = ensureNav(), d = hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 4)), hw = i._hw / 2 - 0.5, hh = i._hh / 2 - 0.5;
    for (let k = 1; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
      const a = Math.floor((x - hw) / N.cs), b = Math.floor((x + hw) / N.cs), c = Math.floor((y - hh) / N.cs), e = Math.floor((y + hh) / N.cs);
      for (let cy = c; cy <= e; cy++) for (let cx = a; cx <= b; cx++) if (cx < 0 || cy < 0 || cx >= N.cols || cy >= N.rows || N.blocked[cy * N.cols + cx]) { if (k === n && cy === Math.floor(y1 / N.cs) && cx === Math.floor(x1 / N.cs)) continue; return false; }
    }
    return true;
  }

  /* ================= instances ================= */
  function fit(i) {
    const t = i._type, s = t.look === 'sprite' ? sprites[t.spriteId] : null;
    if (s) {
      const sx = i._w / s.w, sy = i._h / s.h;
      i._dx = -s.ox * sx; i._dy = -s.oy * sy; i._hl = (s.hit.x - s.ox) * sx; i._ht = (s.hit.y - s.oy) * sy; i._hw = Math.max(1, s.hit.w * sx); i._hh = Math.max(1, s.hit.h * sy);
    } else if (t.look === 'text') { i._dx = 0; i._dy = 0; i._hl = 0; i._ht = 0; i._hw = i._w; i._hh = i._h; }
    else { i._dx = -i._w / 2; i._dy = -i._h / 2; i._hl = -i._w / 2; i._ht = -i._h / 2; i._hw = i._w; i._hh = i._h; }
  }
  class Inst {
    constructor(type, x, y, layer) {
      this.id = nextId++; this._type = type; this.kind = type.kind || 'other'; this.name = '';
      this.x = x; this.y = y; this._w = type.w; this._h = type.h; this.layer = layer;
      this.angle = 0; this.opacity = 1; this.visible = true; this.flip = false;
      this.hp = 0; this.maxHp = 0; this.speed = 0; this.vx = 0; this.vy = 0; this.facing = { x: 0, y: 1 };
      this.solid = false; this.pushable = false; this.collides = true; this.anim = ''; this.autoAnim = true; this.text = null;
      this._beh = []; this._dead = false; this._timers = []; this._hooks = null; this._say = null; this._flash = 0; this._invuln = 0;
      this._sprite = type.look === 'sprite' ? sprites[type.spriteId] || null : null;
      this._ai = 0; this._af = 0; this._at = 0; this._an = null; this._px = x; this._py = y;
      fit(this);
    }
    get exists() { return !this._dead; }
    get type() { return this._type.name; }
    get w() { return this._w; } set w(v) { this._w = Math.max(1, +v || 1); fit(this); }
    get h() { return this._h; } set h(v) { this._h = Math.max(1, +v || 1); fit(this); }
    get cx() { return this.x + this._hl + this._hw / 2; }
    get cy() { return this.y + this._ht + this._hh / 2; }
    is(q) { return matchQ(this, q); }
    distanceTo(t) { if (gone(t)) return Infinity; const p = pt(t); return p ? hypot(p.x - this.cx, p.y - this.cy) : Infinity; }
    angleTo(t) { const p = pt(t); return p ? Math.atan2(p.y - this.cy, p.x - this.cx) / RAD : 0; }
    move(dx, dy) { return moveInst(this, +dx || 0, +dy || 0); }
    moveToward(t, speed) {
      if (gone(t)) return false; const p = pt(t); if (!p) return false;
      speed = speed == null ? this.speed : +speed;
      const dx = p.x - this.cx, dy = p.y - this.cy, d = hypot(dx, dy); if (d < 0.5) return false;
      const s = Math.min(speed * DT, d); return moveInst(this, dx / d * s, dy / d * s);
    }
    moveAway(t, speed) {
      if (gone(t)) return false; const p = pt(t); if (!p) return false;
      speed = speed == null ? this.speed : +speed;
      const dx = this.cx - p.x, dy = this.cy - p.y, d = hypot(dx, dy) || 1; return moveInst(this, dx / d * speed * DT, dy / d * speed * DT);
    }
    moveAtAngle(deg, speed) { speed = speed == null ? this.speed : +speed; return moveInst(this, Math.cos(deg * RAD) * speed * DT, Math.sin(deg * RAD) * speed * DT); }
    pathTo(t, speed) {
      if (gone(t)) return false; const p = pt(t); if (!p) return false;
      speed = speed == null ? this.speed : +speed;
      if (!this.collides) return this.moveToward(p, speed);
      const st = this._path || (this._path = { pts: null, k: 0, at: -1 }), cx = this.cx, cy = this.cy;
      if (clearWalk(this, cx, cy, p.x, p.y)) { st.pts = null; return this.moveToward(p, speed); }
      if (!st.pts || time >= st.at) { st.pts = findPath(cx, cy, p.x, p.y); st.k = 0; st.at = time + 0.35 + Math.random() * 0.25; }
      if (!st.pts || !st.pts.length) return this.moveToward(p, speed);
      while (st.k < st.pts.length - 1 && clearWalk(this, cx, cy, st.pts[st.k + 1].x, st.pts[st.k + 1].y)) st.k++;
      const w = st.pts[st.k], d = hypot(w.x - cx, w.y - cy);
      if (d < 1.5) { st.k++; if (st.k >= st.pts.length) st.pts = null; return true; }
      const s = Math.min(speed * DT, d); moveInst(this, (w.x - cx) / d * s, (w.y - cy) / d * s);
      if (this._blocked) st.at = Math.min(st.at, time + 0.1);
      return true;
    }
    patrol(distance, speed, axis) {
      distance = distance == null ? 48 : +distance; speed = speed == null ? this.speed : +speed; axis = axis === 'y' ? 'y' : 'x';
      let p = this._patrol; if (!p || p.axis !== axis) p = this._patrol = { axis: axis, origin: this[axis], dir: 1 };
      const ok = axis === 'x' ? moveInst(this, p.dir * speed * DT, 0) : moveInst(this, 0, p.dir * speed * DT);
      const off = this[axis] - p.origin;
      if (!ok || (p.dir > 0 && off >= distance) || (p.dir < 0 && off <= 0)) p.dir *= -1;
    }
    wander(speed) {
      speed = speed == null ? this.speed : +speed;
      let w = this._wander;
      if (!w || w.t <= 0 || this._blocked) {
        const a = Math.floor(Math.random() * 8) * Math.PI / 4, rest = Math.random() < 0.3;
        w = this._wander = { x: rest ? 0 : Math.cos(a), y: rest ? 0 : Math.sin(a), t: random(0.5, 1.8) }; this._blocked = false;
      }
      w.t -= DT; if (w.x || w.y) moveInst(this, w.x * speed * DT, w.y * speed * DT);
    }
    canSee(t, range) { if (gone(t)) return false; return los(this, t instanceof Inst ? t : pt(t), range); }
    shoot(typeRef, target, speed, opts) {
      opts = opts || {};
      let type = typeof typeRef === 'string' ? typeByName[typeRef] || types[typeRef] : null;
      if (!type) type = this.kind === 'player' ? SHOT_P : SHOT_E;
      let dir;
      if (target == null || target === 'facing') dir = this.facing;
      else if (typeof target === 'number') dir = { x: Math.cos(target * RAD), y: Math.sin(target * RAD) };
      else { const p = pt(target); if (!p) return null; const dx = p.x - this.cx, dy = p.y - this.cy, d = hypot(dx, dy) || 1; dir = { x: dx / d, y: dy / d }; }
      if (!dir.x && !dir.y) dir = { x: 0, y: 1 };
      const b = create(type, this.cx, this.cy, this.layer);
      b.x += b.x - b.cx; b.y += b.y - b.cy;
      b._owner = this; b._dir = dir; b.angle = Math.atan2(dir.y, dir.x) / RAD;
      if (speed != null) b.speed = +speed; if (opts.damage != null) b._damage = +opts.damage;
      return b;
    }
    spawn(typeRef, dx, dy) { const type = typeByName[typeRef] || types[typeRef]; if (!type) return NONE; return create(type, this.x + (+dx || 0), this.y + (+dy || 0), this.layer); }
    say(text, seconds) { this._say = { text: String(text), until: time + (seconds == null ? 2 : +seconds) }; }
    every(seconds, fn) { if (typeof fn === 'function') this._timers.push({ next: time + (+seconds || 1), every: Math.max(DT, +seconds || 1), fn: fn }); }
    after(seconds, fn) { if (typeof fn === 'function') this._timers.push({ next: time + (+seconds || 0), every: 0, fn: fn }); }
    damage(n, from) {
      n = n == null ? 1 : +n; const H = this._health;
      if (this._dead || !H || !(n > 0) || time < this._invuln) return false;
      this._invuln = time + (+H.invuln || 0); this.hp -= n; this._flash = time + Math.max(0.15, +H.invuln || 0);
      fx.push({ k: 'burst', preset: 'hit', x: this.cx, y: this.cy });
      if (H.hurtSound && this.hp > 0) fx.push({ k: 'sound', id: H.hurtSound });
      if (this.hp <= 0) {
        this.hp = 0;
        if (H.deathSound) fx.push({ k: 'sound', id: H.deathSound });
        if (H.deathBurst) fx.push({ k: 'burst', preset: H.deathBurst, x: this.cx, y: this.cy });
        if (H.drop && types[H.drop]) create(types[H.drop], this.cx, this.cy, this.layer);
        this.destroy();
        if (H.gameOver) game.lose();
      }
      return true;
    }
    heal(n) { n = n == null ? 1 : +n; this.hp = this.maxHp > 0 ? Math.min(this.maxHp, this.hp + n) : this.hp + n; }
    destroy() {
      if (this._dead) return; this._dead = true; destroyed.push(this); hashDel(this);
      if (this.solid) navDirty = true;
      if (this._hooks && this._hooks.onDestroy) hook(this, 'onDestroy');
    }
    touching(q) { const l = touchers(this); for (const o of l) if (q == null || matchQ(o, q)) return true; return false; }
    touched(q) { return touchers(this).filter(o => q == null || matchQ(o, q)); }
    setAnim(name) { if (name === 'auto') { this.autoAnim = true; return; } this.anim = String(name); this.autoAnim = false; }
    flash(seconds) { this._flash = time + (seconds == null ? 0.4 : +seconds); }
    knockback(from, force) {
      const p = pt(from); if (!p) return; const dx = this.cx - p.x, dy = this.cy - p.y, d = hypot(dx, dy) || 1;
      this._kb = { x: dx / d * (force == null ? 120 : +force), y: dy / d * (force == null ? 120 : +force) };
    }
    burst(preset) { fx.push({ k: 'burst', preset: preset || 'spark', x: this.cx, y: this.cy }); }
    sound(name) { game.sound(name); }
    enable(key, on) { for (const b of this._beh) if (b.type === key) b.on = on !== false && on !== 'off'; }
    lookAt(t) { const p = pt(t); if (p) this.angle = Math.atan2(p.y - this.cy, p.x - this.cx) / RAD; }
  }
  const NONE = new Proxy({}, {
    get(t, k) { if (k === 'exists') return false; if (k === Symbol.toPrimitive) return () => 0; if (typeof k === 'string' && typeof Inst.prototype[k] === 'function') return noop; return 0; },
    set() { return true; },
  });
  const SHOT_P = { id: '__shotp', name: 'Shot', kind: 'bullet', look: 'shape', shape: 'circle', color: '#ffe08a', w: 4, h: 4, vars: [], behaviors: [{ type: 'bullet', speed: 180, damage: 1, hits: 'enemy', life: 2, burst: 'spark' }] };
  const SHOT_E = { id: '__shote', name: 'Shot', kind: 'bullet', look: 'shape', shape: 'circle', color: '#ff6b8b', w: 4, h: 4, vars: [], behaviors: [{ type: 'bullet', speed: 110, damage: 1, hits: 'player', life: 3, burst: 'spark' }] };

  function hook(i, name, arg) {
    const f = i._hooks && i._hooks[name]; if (!f) return;
    try { f.call(i, arg); } catch (e) { report(unitByKey['ts:' + i._type.id], e, name); i._hooks = null; i._timers = []; }
  }
  function create(type, x, y, layer, d) {
    const i = new Inst(type, +x || 0, +y || 0, layer == null ? topObjectLayer() : layer);
    for (const v of type.vars || []) if (v.name) i[v.name] = v.value;
    if (d) {
      if (d.name) i.name = d.name;
      if (d.w != null) i._w = d.w; if (d.h != null) i._h = d.h; if (d.angle) i.angle = d.angle; if (d.opacity != null) i.opacity = d.opacity;
      if (d.vars) for (const k in d.vars) i[k] = d.vars[k];
      fit(i);
    }
    for (const b of type.behaviors || []) {
      const def = B[b.type]; if (!def) continue;
      const rec = { type: b.type, p: b, s: {}, on: true }; i._beh.push(rec);
      if (def.init) def.init(i, b, rec.s);
      if (def.touch) i._wantsTouch = true;
    }
    const f = defs['ts:' + type.id];
    if (f && !badUnits['ts:' + type.id]) {
      try { i._hooks = f.call(i, scope); } catch (e) { report(unitByKey['ts:' + type.id], e, 'setup'); badUnits['ts:' + type.id] = true; }
      if (i._hooks && i._hooks.onTouch) i._wantsTouch = true;
    }
    if (type.look === 'text') { const tf = defs['tt:' + type.id]; i._textFn = tf && !badUnits['tt:' + type.id] ? tf(scope) : null; if (!i._textFn) i.text = type.text.value; }
    if (room.layers[i.layer] && room.layers[i.layer].parallax === 0) { i._hud = true; i.collides = false; }
    insts.push(i); let l = byType.get(type.id); if (!l) byType.set(type.id, (l = [])); l.push(i);
    hashAdd(i); created.push(i);
    if (!building) hook(i, 'onCreate');
    return i;
  }
  function topObjectLayer() { for (let k = room.layers.length - 1; k >= 0; k--) if (room.layers[k].kind === 'objects' && room.layers[k].parallax !== 0) return k; return 0; }

  /* ================= behaviours ================= */
  const B = {
    solid: { init(i) { i.solid = true; navDirty = true; } },
    pushable: { init(i) { i.solid = true; i.pushable = true; } },
    ghost: { init(i) { i.collides = false; } },
    player: {
      init(i, p) { i.speed = +p.speed || 80; i._isPlayer = true; },
      tick(i, p) {
        let ax = input.ax, ay = input.ay;
        if (p.dirs === '4') { if (Math.abs(ax) >= Math.abs(ay)) ay = 0; else ax = 0; }
        const m = hypot(ax, ay); if (m > 1) { ax /= m; ay /= m; }
        if (m > 0.15) moveInst(i, ax * i.speed * DT, ay * i.speed * DT);
      },
    },
    chase: {
      init(i, p) { i.speed = +p.speed || 45; },
      tick(i, p, s) {
        if (!s.t || s.t._dead || time >= (s.at || 0)) { s.t = nearestKind(i, p.target || 'player'); s.at = time + 0.3; }
        const t = s.t && !s.t._dead ? s.t : null, d = t ? i.distanceTo(t) : Infinity;
        const go = () => { if (d > 2) { if (p.smart !== false) i.pathTo(t, i.speed); else i.moveToward(t, i.speed); } };
        const spotted = t && d <= (+p.range || 110) * (s.on ? 1.4 : 1) && (!p.sight || los(i, t));
        if (spotted) {
          if (!s.on) { s.on = true; i._say = { text: '!', until: time + 0.6 }; }
          s.lost = time + 2; go();
        } else if (s.on && t && time < s.lost) go(); // keeps going for a moment after losing sight
        else { s.on = false; if (p.idle === 'wander') i.wander(i.speed * 0.4); }
      },
    },
    patrol: { init(i, p) { i.speed = +p.speed || 30; }, tick(i, p) { i.patrol(+p.distance || 48, i.speed, p.axis); } },
    wander: { init(i, p) { i.speed = +p.speed || 25; }, tick(i) { i.wander(i.speed); } },
    bullet: {
      init(i, p) { i._isBullet = true; i.collides = false; i.speed = +p.speed || 180; i._life = +p.life || 2; i._damage = +p.damage || 0; },
      tick(i, p) {
        if (!i._dir) i._dir = { x: Math.cos(i.angle * RAD), y: Math.sin(i.angle * RAD) };
        const steps = Math.max(1, Math.ceil(i.speed * DT / 4)), tmp = [];
        for (let k = 0; k < steps && !i._dead; k++) {
          i.x += i._dir.x * i.speed * DT / steps; i.y += i._dir.y * i.speed * DT / steps;
          if (tileSolidAt(i.cx, i.cy)) { bulletHit(i, p); break; }
          hashMove(i);
          query(i.x + i._hl, i.y + i._ht, i._hw, i._hh, tmp);
          for (const o of tmp) {
            if (o === i || o === i._owner || o._isBullet || !overlap(i, o)) continue;
            if (o._health && kindOk(o, p.hits) && !(i._hitSet && i._hitSet.has(o))) {
              o.damage(i._damage, i); o.knockback(i, 60);
              if (p.pierce) { (i._hitSet = i._hitSet || new Set()).add(o); continue; }
              bulletHit(i, p); break;
            }
            if (o.solid) { bulletHit(i, p); break; }
          }
        }
        i._life -= DT; if (i._life <= 0) i.destroy();
      },
    },
    sine: {
      init(i, p, s) { s.t = Math.random() * 6.28; s.last = 0; s.w = i._w; s.h = i._h; s.o = i.opacity; },
      tick(i, p, s) {
        s.t += DT * 6.2832 / Math.max(0.05, +p.period || 1); const off = Math.sin(s.t) * (+p.amount || 0);
        if (p.prop === 'x' || p.prop === 'y' || p.prop === 'angle') { i[p.prop] += off - s.last; s.last = off; }
        else if (p.prop === 'size') { i._w = Math.max(1, s.w + off); i._h = Math.max(1, s.h + off * s.h / s.w); fit(i); }
        else if (p.prop === 'opacity') i.opacity = clamp(s.o + off, 0, 1);
      },
    },
    spin: { tick(i, p) { i.angle += (+p.speed || 0) * DT; } },
    edge: {
      tick(i, p) {
        const l = i.x + i._hl, t = i.y + i._ht;
        if (p.mode === 'stop') { i.x = clamp(i.x, -i._hl, room.w - i._hl - i._hw); i.y = clamp(i.y, -i._ht, room.h - i._ht - i._hh); return; }
        const out = l + i._hw < 0 || t + i._hh < 0 || l > room.w || t > room.h; if (!out) return;
        if (p.mode === 'wrap') { if (l + i._hw < 0) i.x += room.w + i._hw; else if (l > room.w) i.x -= room.w + i._hw; if (t + i._hh < 0) i.y += room.h + i._hh; else if (t > room.h) i.y -= room.h + i._hh; }
        else i.destroy();
      },
    },
    health: { init(i, p) { i.hp = i.maxHp = +p.hp || 1; i._health = p; } },
    hurts: {
      touch(i, o, b) {
        const p = b.p; if (!o._health || !kindOk(o, p.target) || o === i._owner) return;
        if (o.damage(p.damage == null ? 1 : +p.damage, i) && +p.knockback) o.knockback(i, +p.knockback);
      },
    },
    shooter: {
      tick(i, p, s) {
        if (!input.down[p.key || 'Space'] || time < (s.next || 0) || time < lockUntil) return;
        s.next = time + Math.max(0.05, +p.rate || 0.3);
        i.shoot(p.bullet || null, 'facing', +p.speed || 180);
        if (p.sound) fx.push({ k: 'sound', id: p.sound });
      },
    },
    turret: {
      init(i, p, s) { s.next = time + Math.random() * (+p.rate || 1.5); },
      tick(i, p, s) {
        if (time < s.next) return;
        const t = nearestKind(i, p.target || 'player');
        if (!t || i.distanceTo(t) > (+p.range || 130) || (p.sight !== false && !los(i, t))) { s.next = time + 0.2; return; }
        s.next = time + Math.max(0.1, +p.rate || 1.5);
        i.shoot(p.bullet || null, t, +p.speed || 110);
        if (p.sound) fx.push({ k: 'sound', id: p.sound });
      },
    },
    spawner: {
      init(i, p, s) { s.next = time + (+p.every || 3); s.kids = []; },
      tick(i, p, s) {
        if (time < s.next) return; s.next = time + Math.max(0.1, +p.every || 3);
        s.kids = s.kids.filter(k => !k._dead); const type = types[p.type];
        if (!type || s.kids.length >= (+p.max || 4)) return;
        const r = +p.radius || 0, a = Math.random() * 6.2832;
        s.kids.push(create(type, i.x + Math.cos(a) * r * Math.random(), i.y + Math.sin(a) * r * Math.random(), i.layer));
      },
    },
    collectible: {
      touch(i, o, b) {
        const p = b.p; if (i._dead || !(o._isPlayer || o.kind === 'player')) return;
        if (p.variable && p.variable in G) G[p.variable] = (+G[p.variable] || 0) + (+p.amount || 0);
        if (+p.heals) o.heal(+p.heals);
        if (p.sound) fx.push({ k: 'sound', id: p.sound });
        if (p.burst) fx.push({ k: 'burst', preset: p.burst, x: i.cx, y: i.cy });
        i.destroy();
      },
    },
    door: {
      touch(i, o, b, start) {
        if (!start || !o._isPlayer || roomTime < 0.3) return;
        if (b.p.sound) fx.push({ k: 'sound', id: b.p.sound });
        game.goTo(i.toRoom || b.p.room, i.arriveAt || b.p.spawn);
      },
    },
    goal: { touch(i, o, b) { if (o._isPlayer) game.win(b.p.text); } },
    talk: {
      tick(i, p, s) {
        const pl = thePlayer(); if (!pl) return;
        const close = overlap(i, pl, 6); if (!close) return;
        if (time >= (s.hint || 0)) i._say = { text: '…', until: time + 0.12 };
        const tapped = input.taps.some(t => t.x >= i.x + i._dx && t.x <= i.x + i._dx + i._w && t.y >= i.y + i._dy && t.y <= i.y + i._dy + i._h);
        if ((input.pressed.Space || input.pressed.KeyE || input.pressed.Enter || tapped) && time >= lockUntil) { openDialog(i.message != null && i.message !== '' ? i.message : p.text, i._type.name); i._say = null; }
      },
    },
    camera: { init(i, p) { cam.target = i; cam.lag = +p.lag || 0; } },
    fade: {
      init(i, p, s) { s.t = 0; if (+p.fadeIn > 0) i.opacity = 0; },
      tick(i, p, s) {
        s.t += DT; const a = +p.fadeIn || 0, w = +p.wait || 0, o = +p.fadeOut || 0;
        if (s.t < a) i.opacity = s.t / a;
        else if (s.t < a + w) i.opacity = 1;
        else if (o > 0 && s.t < a + w + o) i.opacity = 1 - (s.t - a - w) / o;
        else if (o > 0 || p.destroy) { if (o > 0) i.opacity = 0; if (p.destroy) i.destroy(); }
      },
    },
  };
  function bulletHit(i, p) { if (p.burst) fx.push({ k: 'burst', preset: p.burst, x: i.cx, y: i.cy }); i.destroy(); }
  function openDialog(text, who) {
    const pages = String(text == null ? '' : text).split('\n').map(s => s.trim()).filter(Boolean);
    if (pages.length) dialog = { pages: pages, i: 0, who: who || '' };
  }

  /* ================= what scripts and expressions can see ================= */
  const game = {
    get time() { return time; }, get room() { return room ? room.name : ''; }, get width() { return room.w; }, get height() { return room.h; },
    vars: null,
    goTo(r, spawn) { const R = rooms[r] || roomByName[r]; if (R) pendingRoom = { id: R.id, spawn: spawn || '' }; else log('No room called ' + r); },
    restart() { pendingRoom = { id: room.id, spawn: '', fresh: true }; },
    win(msg) { if (state === 'playing') { state = 'won'; message = msg || 'You win!'; } },
    lose(msg) { if (state === 'playing') { state = 'lost'; message = msg || 'Game over'; } },
    spawn(typeName, x, y) { const t = typeByName[typeName] || types[typeName]; return t ? create(t, x, y) : NONE; },
    find: find, findAll: findAll, count: q => findAll(q).length,
    shake(amount, sec) { cam.shake = amount == null ? 3 : +amount; cam.shakeUntil = time + (sec == null ? 0.3 : +sec); },
    zoom(z, sec) { cam.z0 = cam.zoom; cam.z1 = Math.max(0.2, +z || 1); cam.zt = 0; cam.zd = Math.max(0, sec == null ? 0.5 : +sec); if (!cam.zd) cam.zoom = cam.z1; },
    sound(name) { const id = soundByName[name] || name; if (id) fx.push({ k: 'sound', id: id }); },
    music(name) { fx.push({ k: 'music', id: soundByName[name] || name }); },
    stopMusic() { fx.push({ k: 'music', id: null }); },
    message(text, who) { openDialog(text, who); },
  };
  const helpers = {
    game: game, random: random, randomInt: (a, b) => Math.floor(random(a, b + 1)), choose: function () { return arguments[Math.floor(Math.random() * arguments.length)]; },
    clamp: clamp, lerp: (a, b, t) => a + (b - a) * t, log: log, find: find, findAll: findAll, all: findAll, count: q => findAll(q).length, nearest: nearest,
    distance(a, b, c, d) { if (typeof a === 'number') return hypot(c - a, d - b); const p = pt(a), q = pt(b); return p && q ? hypot(q.x - p.x, q.y - p.y) : Infinity; },
    angle(a, b) { const p = pt(a), q = pt(b); return p && q ? Math.atan2(q.y - p.y, q.x - p.x) / RAD : 0; },
    keyDown: k => !!input.down[k], keyPressed: k => !!input.pressed[k],
    hearts: i => (gone(i) ? '' : '♥'.repeat(Math.max(0, Math.ceil(i.hp))) + '♡'.repeat(Math.max(0, Math.ceil(i.maxHp - i.hp)))),
    floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt, sign: Math.sign, sin: Math.sin, cos: Math.cos, PI: Math.PI,
    $t: v => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : v == null ? '' : v instanceof Inst ? show(v) : String(v)),
  };
  Object.defineProperties(helpers, {
    player: { get() { return thePlayer() || NONE; }, enumerable: true },
    time: { get() { return time; }, enumerable: true }, dt: { get() { return DT; }, enumerable: true },
    room: { get() { return room ? room.name : ''; }, enumerable: true }, pointer: { get() { return lastTap; }, enumerable: true },
  });
  function resolve(key) {
    const s = CUR.self;
    if (s && s !== NONE) {
      const pm = CUR.pairs && CUR.pairs.get(s);
      if (pm && pm.has(key)) return pm.get(key);
      if (matches(s, key)) return s;
    }
    const l = CUR.sol && CUR.sol.get(key);
    if (l && l.length) return l[0];
    const a = allOf(key);
    return a.length ? a[0] : NONE;
  }
  const scope = new Proxy(helpers, {
    has(t, k) { return typeof k === 'string' && (k in G || k in t || k in typeByName); },
    get(t, k) { if (typeof k !== 'string') return undefined; if (k in G) return G[k]; if (k in t) return t[k]; if (k in typeByName) return resolve(typeByName[k].id); return undefined; },
    set(t, k, v) { if (k in G) G[k] = v; else if (!(k in typeByName)) t[k] = v; return true; },
  });

  /* ================= event sheets ================= */
  const NUM = /^\s*-?\d+(\.\d+)?\s*$/;
  const cmp = (a, op, b) => { switch (op) { case '==': return a == b; case '!=': return a != b; case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; } return false; };
  function param(ev, item, name, self) {
    const f = ev._f[item.id + '.' + name];
    if (!f) { const v = item.p[name]; return typeof v === 'string' && NUM.test(v) ? +v : v; }
    CUR.self = self || null;
    return f.call(self || undefined, self || NONE);
  }
  const state1 = c => { let s = cst.get(c.id); if (!s) cst.set(c.id, (s = {})); return s; };
  function getList(key, sol) { return sol.get(key) || allOf(key); }
  function setPair(pairs, a, key, b) { let m = pairs.get(a); if (!m) pairs.set(a, (m = new Map())); if (!m.has(key)) m.set(key, b); }

  const SC = {
    always: () => true,
    start: () => roomTick === 0,
    every(p, c) { const sec = Math.max(DT, +p('sec') || 1), s = state1(c); if (s.next == null) s.next = roomTime + sec; if (roomTime >= s.next) { s.next = Math.max(s.next + sec, roomTime); return true; } return false; },
    keyPressed: p => !!input.pressed[p('key')], keyDown: p => !!input.down[p('key')], keyReleased: p => !!input.released[p('key')],
    tap: () => input.taps.length > 0,
    compare: p => cmp(p('a'), p('cmp'), p('b')),
    chance: p => Math.random() * 100 < +p('pct'),
    test: p => !!p('expr'),
  };
  // per-instance tests
  const OC = {
    prop: (i, p) => cmp(i[p('prop')], p('cmp'), p('value')),
    otest: (i, p) => !!p('expr'),
    moving: i => Math.abs(i.vx) + Math.abs(i.vy) > 6,
    animDone: (i, p) => { const n = p('name'); return i._animDone === true && (!n || i._animDoneName === n); },
    offscreen(i) { const hw = VIEW.w / 2 / cam.zoom, hh = VIEW.h / 2 / cam.zoom, l = i.x + i._dx, t = i.y + i._dy; return l + i._w < cam.x - hw || l > cam.x + hw || t + i._h < cam.y - hh || t > cam.y + hh; },
    tapped: i => input.taps.some(t => { const x = i._hud ? t.sx : t.x, y = i._hud ? t.sy : t.y; return x >= i.x + i._dx - 2 && x <= i.x + i._dx + i._w + 2 && y >= i.y + i._dy - 2 && y <= i.y + i._dy + i._h + 2; }),
  };
  // tests that look at pairs of objects: return the kept list and pick the partners
  function pairCond(list, c, sol, pairs, ev, test) {
    const other = c.p.other; if (!other) return [];
    const others = getList(other, sol), keepA = [], setB = new Set();
    for (const a of list) {
      let any = false;
      for (const b of others) {
        if (b === a || b._dead || !test(a, b)) continue;
        any = true; if (c.not) break;
        setB.add(b); setPair(pairs, a, other, b); setPair(pairs, b, c.target, a);
      }
      if (any !== !!c.not) keepA.push(a);
    }
    if (!c.not && keepA.length && other !== c.target) sol.set(other, Array.from(setB));
    return keepA;
  }
  const OL = {
    touches: (list, c, sol, pairs, ev) => pairCond(list, c, sol, pairs, ev, (a, b) => overlap(a, b, 1)),
    touchStart(list, c, sol, pairs, ev) { const s = state1(c); const started = s.started || new Set(); return pairCond(list, c, sol, pairs, ev, (a, b) => started.has(a.id + ':' + b.id)); },
    near: (list, c, sol, pairs, ev) => pairCond(list, c, sol, pairs, ev, (a, b) => hypot(a.cx - b.cx, a.cy - b.cy) <= (+param(ev, c, 'dist', a) || 0)),
    sees: (list, c, sol, pairs, ev) => pairCond(list, c, sol, pairs, ev, (a, b) => los(a, b, +param(ev, c, 'range', a) || 120)),
    nearest(list, c, sol) { const o = getList(c.p.other, sol)[0]; if (!o || !list.length) return []; let best = null, bd = Infinity; for (const a of list) { if (a === o) continue; const d = hypot(a.cx - o.cx, a.cy - o.cy); if (d < bd) { bd = d; best = a; } } return best ? [best] : []; },
    randomOne: list => (list.length ? [list[Math.floor(Math.random() * list.length)]] : []),
  };
  function evalCond(c, ev, sol, pairs) {
    if (c.target === 'system') {
      const f = SC[c.key]; if (!f) return false;
      return !!f(name => param(ev, c, name, null), c) !== !!c.not;
    }
    if (!c.target) return false;
    let list;
    if (c.key === 'created') list = createdNow.filter(i => matches(i, c.target) && !i._dead);
    else if (c.key === 'destroyed') list = destroyedNow.filter(i => matches(i, c.target));
    else if (c.key === 'exists') return (getList(c.target, sol).length > 0) !== !!c.not;
    else {
      list = getList(c.target, sol);
      if (OL[c.key]) { list = OL[c.key](list, c, sol, pairs, ev); if (!list.length) return false; sol.set(c.target, list); return true; }
      const f = OC[c.key]; if (!f) return false;
      list = list.filter(i => !!f(i, name => param(ev, c, name, i), c) !== !!c.not);
      if (!list.length) return false; sol.set(c.target, list); return true;
    }
    if (c.not) return list.length === 0;
    if (!list.length) return false;
    sol.set(c.target, list); return true;
  }
  const addTo = (cur, v) => (typeof cur === 'string' ? cur + v : (+cur || 0) + (+v || 0));
  const SA = {
    setVar(p) { const n = p('name'); if (n) G[n] = p('value'); },
    addVar(p) { const n = p('name'); if (n) G[n] = addTo(G[n], p('value')); },
    create(p) { const t = types[p('type')]; if (t) { const i = create(t, +p('x'), +p('y')); CUR.sol.set(t.id, [i]); } },
    goRoom(p) { game.goTo(p('room'), p('spawn')); },
    restart() { game.restart(); },
    endGame(p) { if (p('result') === 'lose') game.lose(p('text')); else game.win(p('text')); },
    dialog(p) { openDialog(p('text')); },
    sound(p) { const id = p('sound'); if (id) fx.push({ k: 'sound', id: id }); },
    music(p) { fx.push({ k: 'music', id: p('sound') || null }); },
    stopMusic() { fx.push({ k: 'music', id: null }); },
    shake(p) { game.shake(p('amount'), p('sec')); },
    zoom(p) { game.zoom(p('scale'), p('sec')); },
    log(p) { log(p('text')); },
    js(p) { p('code'); },
  };
  const other = (ev, a, i, name) => { CUR.self = i; const k = a.p[name || 'other']; return k ? resolve(k) : NONE; };
  const OA = {
    destroy: i => i.destroy(),
    spawn(i, p, a, ev) { const t = types[p('type')]; if (t) { const n = create(t, i.x, i.y, i.layer); CUR.sol.set(t.id, (CUR.sol.get('+' + t.id) || []).concat(n)); CUR.sol.set('+' + t.id, CUR.sol.get(t.id)); } },
    setPos(i, p) { i.x = +p('x') || 0; i.y = +p('y') || 0; hashMove(i); },
    moveBy(i, p) { moveInst(i, +p('dx') || 0, +p('dy') || 0); },
    moveToward(i, p, a, ev) { const sp = +p('speed'); i.moveToward(other(ev, a, i), sp); },
    knockback(i, p, a, ev) { const f = +p('force'); i.knockback(other(ev, a, i), f); },
    lookAt(i, p, a, ev) { i.lookAt(other(ev, a, i)); },
    setProp(i, p) { const k = p('prop'); if (k) { i[k] = p('value'); if (k === 'x' || k === 'y') hashMove(i); } },
    addProp(i, p) { const k = p('prop'); if (k) { i[k] = addTo(i[k], p('value')); if (k === 'x' || k === 'y') hashMove(i); } },
    damage(i, p) { i.damage(+p('amount')); },
    heal(i, p) { i.heal(+p('amount')); },
    shoot(i, p, a, ev) { const sp = +p('speed'), ty = p('type'); const t = a.p.other ? other(ev, a, i) : 'facing'; if (t !== NONE) i.shoot(ty, t, sp); },
    setAnim(i, p) { i.setAnim(p('name')); },
    flash(i, p) { i.flash(+p('sec')); },
    say(i, p) { i.say(p('text'), +p('sec') || 2); },
    setText(i, p) { i.text = String(p('text')); i._textFn = null; },
    burst(i, p) { i.burst(p('preset')); },
    enable(i, p) { i.enable(p('beh'), p('on') !== 'off'); },
    ojs(i, p) { p('code'); },
  };
  function runActs(ev, start, sol, pairs) {
    for (let k = start; k < ev.acts.length; k++) {
      const a = ev.acts[k];
      CUR = { sol: sol, pairs: pairs, self: null };
      if (a.target === 'system') {
        if (a.key === 'wait') {
          const sec = +param(ev, a, 'sec', null) || 0, next = k + 1;
          waits.push({ at: time + sec, fn: () => guard(ev, () => runActs(ev, next, sol, pairs)) });
          return;
        }
        const f = SA[a.key]; if (f) f(name => param(ev, a, name, null), a, ev);
      } else if (a.target) {
        const f = OA[a.key]; if (!f) continue;
        const list = getList(a.target, sol).slice();
        for (const i of list) {
          if (i._dead && a.key !== 'spawn' && a.key !== 'burst' && a.key !== 'ojs') continue;
          CUR = { sol: sol, pairs: pairs, self: i };
          f(i, name => param(ev, a, name, i), a, ev);
        }
      }
    }
    for (const s of ev.sub) runEvent(s, sol, pairs);
  }
  function guard(ev, fn) {
    try { fn(); }
    catch (e) { const top = ev._top; report({ kind: 'event', sheetId: top._sheet, eventId: ev.id, name: top._name }, e); top._bad = true; }
  }
  function runEvent(ev, sol, pairs) {
    if (ev.off || ev._top._bad) return;
    sol = new Map(sol); pairs = new Map(pairs);
    guard(ev, () => {
      for (const c of ev.conds) { CUR = { sol: sol, pairs: pairs, self: null }; if (!evalCond(c, ev, sol, pairs)) return; }
      runActs(ev, 0, sol, pairs);
    });
  }
  function prepareSheets() {
    sheets = []; startConds = [];
    for (const sh of P.sheets) {
      if (sh.scope !== 'all' && sh.scope !== room.id) continue;
      sh.events.forEach((top, n) => {
        const key = 'ev:' + top.id; let fns = {};
        top._bad = !!badUnits[key]; top._sheet = sh.id; top._name = sh.name + ', event ' + (n + 1);
        if (defs[key] && !top._bad) { try { fns = defs[key](scope) || {}; } catch (e) { report(unitByKey[key], e); top._bad = true; } }
        const mark = ev => { ev._f = fns; ev._top = top; ev.sub = ev.sub || []; ev.conds.forEach(c => { if (c.key === 'touchStart' && c.target !== 'system') startConds.push(c); }); ev.sub.forEach(mark); };
        mark(top);
      });
      sheets.push(sh);
    }
  }
  // "Starts touching" needs to remember last tick's pairs, so it is tracked every tick.
  function trackStarts() {
    for (const c of startConds) {
      const s = state1(c), now = new Set(), started = new Set();
      if (c.p.other) {
        const others = allOf(c.p.other); qid++; const mark = ++markId; for (const o of others) o._mk = mark;
        for (const a of allOf(c.target)) for (const b of touchers(a)) if (b._mk === mark) { const k = a.id + ':' + b.id; now.add(k); if (!s.prev || !s.prev.has(k)) started.add(k); }
      }
      s.prev = now; s.started = started;
    }
  }
  let markId = 0;

  /* ================= rooms ================= */
  function enterRoom(id, spawnName, keep) {
    const R = rooms[id]; if (!R) { report(null, 'That room does not exist.'); return; }
    room = R; insts = []; byType = new Map(); grid = new Map(); created = []; destroyed = []; createdNow = []; destroyedNow = []; waits = []; cst = new Map();
    roomTime = 0; roomTick = 0; nav = null; navDirty = true; navAt = 0; dialog = null;
    cam.target = null; cam.lag = 0; cam.zoom = cam.z1 = 1; cam.zd = 0; cam.shakeUntil = 0;
    tileLayers = [];
    building = true;
    R.layers.forEach((L, li) => {
      if (L.kind === 'tiles') {
        const ts = tilesets[L.tilesetId];
        if (ts && L.parallax === 1 && ts.solid.some(Boolean)) tileLayers.push({ cols: L.cols, rows: L.rows, tw: ts.tw, th: ts.th, data: L.data, solid: ts.solid });
      } else for (const d of L.instances) { const t = types[d.typeId]; if (t) create(t, d.x, d.y, li, d); }
    });
    building = false;
    const pl = thePlayer();
    if (pl && keep) { for (const k in keep) pl[k] = keep[k]; }
    if (pl && spawnName) { const at = insts.find(i => i.name === spawnName && i !== pl); if (at) { pl.x += at.cx - pl.cx; pl.y += at.cy - pl.cy; hashMove(pl); } }
    prepareSheets();
    for (const i of insts.slice()) hook(i, 'onCreate');
    if (cam.target) { cam.x = cam.target.cx; cam.y = cam.target.cy; } else { cam.x = Math.min(room.w, VIEW.w) / 2; cam.y = Math.min(room.h, VIEW.h) / 2; }
    clampCam();
    fx.push({ k: 'room' });
  }
  function clampCam() {
    const hw = VIEW.w / 2 / cam.zoom, hh = VIEW.h / 2 / cam.zoom;
    cam.x = room.w <= hw * 2 ? room.w / 2 : clamp(cam.x, hw, room.w - hw);
    cam.y = room.h <= hh * 2 ? room.h / 2 : clamp(cam.y, hh, room.h - hh);
  }
  function changeRoom() {
    const pr = pendingRoom; pendingRoom = null;
    let keep = null; const pl = thePlayer();
    if (pl && !pr.fresh) { keep = { hp: pl.hp }; for (const v of pl._type.vars || []) if (v.name) keep[v.name] = pl[v.name]; }
    enterRoom(pr.id, pr.spawn, keep);
  }

  /* ================= one tick ================= */
  function animate(i) {
    const s = i._sprite; if (!s) return;
    if (s.auto && i.autoAnim) {
      const sp = Math.abs(i.vx) + Math.abs(i.vy), base = sp > 6 ? 'walk' : 'idle';
      const suf = Math.abs(i.facing.x) >= Math.abs(i.facing.y) ? '_side' : i.facing.y < 0 ? '_up' : '_down';
      i.anim = s.names[base + suf] != null ? base + suf : base;
      if (Math.abs(i.vx) > 6) i.flip = i.vx < 0;
    }
    if (i.anim !== i._an) { const k = s.names[i.anim]; i._an = i.anim; if (k != null && k !== i._ai) { i._ai = k; i._af = 0; i._at = 0; i._ended = false; } }
    const a = s.anims[i._ai]; if (!a) return;
    i._animDone = false;
    if (a.n > 1 && a.fps > 0) {
      i._at += DT * a.fps;
      while (i._at >= 1) {
        i._at -= 1;
        if (i._af + 1 >= a.n) { if (a.loop) i._af = 0; else { if (!i._ended) { i._animDone = true; i._animDoneName = a.name; i._ended = true; } i._at = 0; break; } }
        else { i._af++; i._ended = false; }
      }
    }
  }
  function tick() {
    if (state !== 'playing') return;
    if (dialog) {
      if (input.pressed.Space || input.pressed.Enter || input.pressed.KeyE || input.taps.length) { dialog.i++; if (dialog.i >= dialog.pages.length) { dialog = null; lockUntil = time + 0.25; } }
      return;
    }
    if (input.taps.length) lastTap = input.taps[input.taps.length - 1];
    for (const i of insts) { i._px = i.x; i._py = i.y; }
    // delayed actions
    if (waits.length) { const due = waits.filter(w => time >= w.at); if (due.length) { waits = waits.filter(w => time < w.at); due.forEach(w => w.fn()); } }
    // behaviours, timers, scripts
    for (let n = 0; n < insts.length; n++) {
      const i = insts[n]; if (i._dead) continue;
      if (i._kb) { moveInst(i, i._kb.x * DT, i._kb.y * DT); i._kb.x *= 0.82; i._kb.y *= 0.82; if (Math.abs(i._kb.x) + Math.abs(i._kb.y) < 8) i._kb = null; }
      for (const b of i._beh) { if (!b.on || i._dead) continue; const f = B[b.type].tick; if (f) f(i, b.p, b.s); if (dialog) return; }
      if (i._timers.length) {
        for (const tm of i._timers.slice()) {
          if (time < tm.next) continue;
          if (tm.every) tm.next += tm.every; else tm.done = true;
          try { tm.fn.call(i); } catch (e) { report(unitByKey['ts:' + i._type.id], e, 'timer'); i._timers = []; break; }
        }
        i._timers = i._timers.filter(x => !x.done);
      }
      if (i._hooks && i._hooks.onUpdate && !i._dead) hook(i, 'onUpdate');
    }
    syncAll();
    // touching: behaviours and onTouch
    for (let n = 0; n < insts.length; n++) {
      const i = insts[n]; if (i._dead || !i._wantsTouch) continue;
      const cur = touchers(i), prev = i._touch;
      for (const o of cur) {
        const start = !prev || !prev.has(o);
        for (const b of i._beh) { if (b.on && B[b.type].touch) B[b.type].touch(i, o, b, start); }
        if (start && i._hooks && i._hooks.onTouch) hook(i, 'onTouch', o);
        if (i._dead) break;
      }
      i._touch = new Set(cur);
    }
    // event sheets
    createdNow = created; created = []; destroyedNow = destroyed; destroyed = [];
    trackStarts();
    for (const sh of sheets) for (const ev of sh.events) runEvent(ev, new Map(), new Map());
    // wrap up
    for (const i of insts) {
      if (i._dead) continue;
      i.vx = (i.x - i._px) / DT; i.vy = (i.y - i._py) / DT;
      if (i._textFn) { try { CUR = { sol: null, pairs: null, self: i }; i.text = i._textFn(i); } catch (e) { report(unitByKey['tt:' + i._type.id], e); i._textFn = null; i.text = '?'; } }
      animate(i);
    }
    if (insts.some(i => i._dead)) { insts = insts.filter(i => !i._dead); byType.forEach((l, k) => byType.set(k, l.filter(i => !i._dead))); }
    if (cam.zd > 0 && cam.zt < 1) { cam.zt = Math.min(1, cam.zt + DT / cam.zd); const e = cam.zt * cam.zt * (3 - 2 * cam.zt); cam.zoom = cam.z0 + (cam.z1 - cam.z0) * e; }
    if (cam.target && !cam.target._dead) { const k = cam.lag > 0 ? Math.min(1, DT / cam.lag) : 1; cam.x += (cam.target.cx - cam.x) * k; cam.y += (cam.target.cy - cam.y) * k; }
    clampCam();
    time += DT; roomTime += DT; roomTick++;
    if (pendingRoom && state === 'playing') changeRoom();
  }

  /* ================= talking to the main thread ================= */
  function snapshot() {
    const out = [];
    for (const i of insts) {
      if (i._dead || !i.visible) continue;
      const r = { id: i.id, t: i._type.id, x: i.x, y: i.y, w: i._w, h: i._h, l: i.layer };
      if (i.angle) r.a = i.angle; if (i.opacity !== 1) r.o = i.opacity; if (i.flip) r.f = 1;
      if (i._sprite) { r.an = i._ai; r.fr = i._af; }
      if (i.text != null) r.tx = String(i.text);
      if (time < i._flash) r.fl = 1;
      if (i._say && time < i._say.until) r.say = i._say.text;
      if (debug) { r.hb = [i._hl, i._ht, i._hw, i._hh]; if (i._path && i._path.pts) r.path = i._path.pts.slice(i._path.k); }
      out.push(r);
    }
    const f = {
      type: 'frame', room: room.id, insts: out, state: state, message: message, time: time,
      cam: { x: cam.x, y: cam.y, zoom: cam.zoom, shake: time < cam.shakeUntil ? cam.shake : 0 },
      dialog: dialog ? { text: dialog.pages[dialog.i], who: dialog.who, more: dialog.i < dialog.pages.length - 1 } : null,
      fx: fx.splice(0), logs: logs.splice(0), errors: errors.splice(0),
    };
    if (debug) {
      f.globals = Object.assign({}, G); f.count = insts.length;
      const i = inspectId != null ? insts.find(x => x.id === inspectId) : null;
      if (i) {
        const vars = {}; for (const v of i._type.vars || []) if (v.name) vars[v.name] = i[v.name];
        f.inspect = { id: i.id, type: i._type.name, typeId: i._type.id, name: i.name, kind: i.kind, x: i.x, y: i.y, w: i._w, h: i._h, angle: i.angle, opacity: i.opacity, speed: i.speed, hp: i.hp, maxHp: i.maxHp,
          anim: i.anim, vars: vars, beh: i._beh.map(b => ({ type: b.type, on: b.on })) };
      } else if (inspectId != null) f.inspect = null;
    }
    return f;
  }
  function init(m) {
    P = m.project; debug = !!m.debug; VIEW = { w: P.settings.viewW, h: P.settings.viewH };
    for (const u of m.units) { unitByKey[u.key] = u; if (u.bad) badUnits[u.key] = true; }
    for (const s of P.sprites) { s.names = {}; s.anims.forEach((a, k) => (s.names[a.name] = k)); s.auto = s.names.idle != null && s.names.walk != null; sprites[s.id] = s; }
    for (const t of P.tilesets) tilesets[t.id] = t;
    for (const t of P.types) { types[t.id] = t; typeByName[t.name] = t; }
    for (const r of P.rooms) { rooms[r.id] = r; roomByName[r.name] = r; }
    for (const s of P.sounds) soundByName[s.name] = s.id;
    for (const g of P.globals) if (g.name) G[g.name] = g.value;
    game.vars = G;
    enterRoom(m.roomId || P.settings.startRoom);
  }
  self.onmessage = function (e) {
    const m = e.data;
    try {
      if (m.type === 'init') { init(m); self.postMessage(snapshot()); }
      else if (m.type === 'step') {
        const inp = m.input || {};
        input = { ax: inp.ax || 0, ay: inp.ay || 0, down: inp.down || {}, pressed: inp.pressed || {}, released: inp.released || {}, taps: inp.taps || [] };
        for (let k = 0; k < (m.n || 1); k++) { tick(); if (k === 0) { input.pressed = {}; input.released = {}; input.taps = []; } }
        self.postMessage(snapshot());
      }
      else if (m.type === 'inspect') { inspectId = m.id; if (m.reply) self.postMessage(snapshot()); }
      else if (m.type === 'set') { const i = insts.find(x => x.id === m.id); if (i) { i[m.prop] = m.value; hashMove(i); } if (m.reply) self.postMessage(snapshot()); }
      else if (m.type === 'setGlobal') { G[m.name] = m.value; if (m.reply) self.postMessage(snapshot()); }
      else if (m.type === 'call') { const i = insts.find(x => x.id === m.id); if (i && typeof i[m.method] === 'function') i[m.method].apply(i, m.args || []); if (m.reply) self.postMessage(snapshot()); }
    } catch (err) {
      report(null, err); const f = room ? snapshot() : { type: 'frame', room: null, insts: [], state: 'playing', message: '', cam: { x: 0, y: 0, zoom: 1, shake: 0 }, dialog: null, fx: [], logs: logs.splice(0), errors: errors.splice(0) };
      self.postMessage(f);
    }
  };
};
