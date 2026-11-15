/* Overhead Studio: the project data model.
   A project is plain JSON:
     settings  view size and start room
     sprites   pictures with animations (frames are PNG data URLs)
     tilesets  one image cut into tiles, with a "solid" flag per tile
     sounds    synthesised or imported sounds
     types     object types: the "cookie cutters" (look, variables, behaviours, script)
     rooms     levels; each has layers; a layer holds tiles or instances (the "cookies")
     sheets    event sheets: rows of "when these conditions -> do these actions"
     globals   variables shared by the whole game (score, keys, ...)                          */
(function () {
  'use strict';
  const OV = window.OV;
  const M = (OV.Model = {});

  OV.KINDS = [['player', 'Player'], ['enemy', 'Enemy'], ['item', 'Pickup'], ['npc', 'Character'], ['scenery', 'Scenery'], ['bullet', 'Projectile'], ['other', 'Other']];

  M.blank = name => {
    const p = {
      format: 'overhead', version: 2, id: OV.uid('p'), name: name || 'Untitled game',
      settings: { viewW: 288, viewH: 176, pixelArt: true, startRoom: null },
      sprites: [], tilesets: [], sounds: [], types: [], rooms: [], sheets: [], globals: [],
    };
    return p;
  };

  M.newSprite = (project, name, w, h) => {
    w = w || 16; h = h || 16;
    const s = { id: OV.uid('spr'), name: OV.uniqueName(name || 'Sprite', project.sprites.map(x => x.name)), w: w, h: h, ox: Math.floor(w / 2), oy: Math.floor(h / 2),
      hit: { x: 0, y: 0, w: w, h: h }, anims: [{ name: 'idle', fps: 6, loop: true, frames: [''] }] };
    project.sprites.push(s); return s;
  };
  M.newTileset = (project, name) => {
    const t = { id: OV.uid('ts'), name: OV.uniqueName(name || 'Tileset', project.tilesets.map(x => x.name)), src: '', tw: 16, th: 16, cols: 8, rows: 4, solid: new Array(32).fill(false) };
    project.tilesets.push(t); return t;
  };
  M.newType = (project, d) => {
    d = d || {};
    const t = Object.assign({ id: OV.uid('t'), name: 'Thing', kind: 'other', look: 'shape', spriteId: null, shape: 'rect', color: '#8a6bd1', glyph: '⭐',
      w: 16, h: 16, text: { value: 'Text', size: 10, color: '#ffffff', align: 'left', outline: true }, vars: [], behaviors: [], script: '' }, OV.clone(d));
    t.id = OV.uid('t');
    t.name = OV.uniqueName(OV.ident(t.name), project.types.map(x => x.name));
    if (t.look === 'sprite' && t.spriteId && !d.w) { const s = OV.byId(project.sprites, t.spriteId); if (s) { t.w = s.w; t.h = s.h; } }
    project.types.push(t); return t;
  };
  M.newLayer = (project, room, kind, name) => {
    const names = room.layers.map(l => l.name);
    const L = { id: OV.uid('l'), name: OV.uniqueName(name || (kind === 'tiles' ? 'Tiles' : 'Objects'), names), kind: kind, visible: true, locked: false, opacity: 1, parallax: 1 };
    if (kind === 'tiles') {
      const ts = project.tilesets[0];
      L.tilesetId = ts ? ts.id : null;
      const tw = ts ? ts.tw : 16, th = ts ? ts.th : 16;
      L.cols = Math.ceil(room.w / tw); L.rows = Math.ceil(room.h / th); L.data = new Array(L.cols * L.rows).fill(0);
    } else { L.ysort = false; L.instances = []; }
    return L;
  };
  M.newRoom = (project, name, w, h) => {
    const r = { id: OV.uid('r'), name: OV.uniqueName(name || 'Room', project.rooms.map(x => x.name)), w: w || 480, h: h || 320, bg: '#2a2f3a', grid: 16, layers: [] };
    r.layers.push(M.newLayer(project, r, 'tiles', 'Ground'));
    const obj = M.newLayer(project, r, 'objects', 'Objects'); obj.ysort = true; r.layers.push(obj);
    project.rooms.push(r);
    if (!project.settings.startRoom) project.settings.startRoom = r.id;
    return r;
  };
  M.newSheet = (project, name, scope) => {
    const s = { id: OV.uid('sh'), name: OV.uniqueName(name || 'Events', project.sheets.map(x => x.name)), scope: scope || 'all', events: [] };
    project.sheets.push(s); return s;
  };
  M.newEvent = () => ({ id: OV.uid('e'), conds: [], acts: [], sub: [] });
  M.newInstance = (type, x, y) => ({ id: OV.uid('i'), typeId: type.id, x: x, y: y });

  /* Resize a tile layer's grid, keeping what is already painted. */
  M.resizeTiles = (L, cols, rows) => {
    const data = new Array(cols * rows).fill(0);
    for (let y = 0; y < Math.min(rows, L.rows); y++) for (let x = 0; x < Math.min(cols, L.cols); x++) data[y * cols + x] = L.data[y * L.cols + x] || 0;
    L.cols = cols; L.rows = rows; L.data = data;
  };
  M.fitRoomLayers = (project, room) => {
    room.layers.forEach(L => {
      if (L.kind !== 'tiles') return;
      const ts = OV.byId(project.tilesets, L.tilesetId);
      const tw = ts ? ts.tw : 16, th = ts ? ts.th : 16;
      const cols = Math.ceil(room.w / tw), rows = Math.ceil(room.h / th);
      if (cols !== L.cols || rows !== L.rows) M.resizeTiles(L, cols, rows);
    });
  };

  /* Where an instance is drawn: size, and the offset from its position (x,y) to its top-left corner.
     Sprites use the sprite's origin; shapes, emoji and text boxes are centred on their position. */
  M.metrics = (project, inst, type) => {
    type = type || OV.byId(project.types, inst.typeId);
    if (!type) return { w: 16, h: 16, dx: -8, dy: -8, type: null, sprite: null };
    const w = inst.w != null ? inst.w : type.w, h = inst.h != null ? inst.h : type.h;
    const spr = type.look === 'sprite' ? OV.byId(project.sprites, type.spriteId) : null;
    if (spr) return { w: w, h: h, dx: -spr.ox * (w / spr.w), dy: -spr.oy * (h / spr.h), type: type, sprite: spr };
    if (type.look === 'text') return { w: w, h: h, dx: 0, dy: 0, type: type, sprite: null };
    return { w: w, h: h, dx: -w / 2, dy: -h / 2, type: type, sprite: null };
  };
  M.instBox = (project, inst) => { const m = M.metrics(project, inst); return { x: inst.x + m.dx, y: inst.y + m.dy, w: m.w, h: m.h }; };

  M.findInstance = (project, id) => {
    for (const r of project.rooms) for (const L of r.layers) if (L.kind === 'objects') { const i = L.instances.find(x => x.id === id); if (i) return { room: r, layer: L, inst: i }; }
    return null;
  };
  M.countInstances = (project, typeId) => {
    let n = 0;
    project.rooms.forEach(r => r.layers.forEach(L => { if (L.kind === 'objects') n += L.instances.filter(i => i.typeId === typeId).length; }));
    return n;
  };
  M.walkEvents = (events, fn, depth, parent) => {
    (events || []).forEach((ev, i) => { fn(ev, depth || 0, parent || null, i); M.walkEvents(ev.sub, fn, (depth || 0) + 1, ev); });
  };
  /* Remove a type everywhere it is used. */
  M.deleteType = (project, typeId) => {
    project.types = project.types.filter(t => t.id !== typeId);
    project.rooms.forEach(r => r.layers.forEach(L => { if (L.kind === 'objects') L.instances = L.instances.filter(i => i.typeId !== typeId); }));
  };

  /* Make sure a loaded project has every field the editor expects. */
  M.normalize = p => {
    if (!p || typeof p !== 'object' || p.format !== 'overhead' || !Array.isArray(p.rooms)) throw new Error('That is not an Overhead Studio project.');
    const b = M.blank(p.name);
    const out = Object.assign(b, p);
    out.settings = Object.assign({ viewW: 288, viewH: 176, pixelArt: true, startRoom: null }, p.settings || {});
    ['sprites', 'tilesets', 'sounds', 'types', 'rooms', 'sheets', 'globals'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    out.types.forEach(t => {
      t.vars = t.vars || []; t.behaviors = t.behaviors || []; t.script = t.script || '';
      t.text = Object.assign({ value: 'Text', size: 10, color: '#ffffff', align: 'left', outline: true }, t.text || {});
      t.behaviors.forEach(b2 => { if (!b2.id) b2.id = OV.uid('b'); });
    });
    out.sprites.forEach(s => {
      s.hit = s.hit || { x: 0, y: 0, w: s.w, h: s.h };
      if (!s.anims || !s.anims.length) s.anims = [{ name: 'idle', fps: 6, loop: true, frames: [''] }];
      s.anims.forEach(a => { if (!a.frames || !a.frames.length) a.frames = ['']; if (a.times && (!Array.isArray(a.times) || a.times.length !== a.frames.length || a.times.every(t => t == null))) delete a.times; });
    });
    out.tilesets.forEach(t => { const n = t.cols * t.rows; t.solid = (t.solid || []).slice(0, n); while (t.solid.length < n) t.solid.push(false); });
    out.rooms.forEach(r => {
      r.layers = r.layers || []; r.grid = r.grid || 16;
      r.layers.forEach(L => {
        if (L.kind === 'tiles') { L.data = L.data || []; } else { L.kind = 'objects'; L.instances = L.instances || []; }
        if (L.opacity == null) L.opacity = 1; if (L.parallax == null) L.parallax = 1; if (L.visible == null) L.visible = true;
      });
      M.fitRoomLayers(out, r);
    });
    out.sheets.forEach(s => { s.events = s.events || []; M.walkEvents(s.events, ev => { ev.conds = ev.conds || []; ev.acts = ev.acts || []; ev.sub = ev.sub || []; }); });
    if (!OV.byId(out.rooms, out.settings.startRoom)) out.settings.startRoom = out.rooms[0] ? out.rooms[0].id : null;
    return out;
  };

  /* Undo snapshots: the project as JSON, with big strings (images, audio) swapped for
     short tokens so a snapshot stays small no matter how much art the project has. */
  const blobIds = new Map(), blobs = [];
  M.pack = project => JSON.stringify(project, (k, v) => {
    if (typeof v === 'string' && v.length > 256) {
      let id = blobIds.get(v);
      if (id === undefined) { id = blobs.length; blobs.push(v); blobIds.set(v, id); }
      return '\u0001' + id;
    }
    return v;
  });
  M.unpack = str => JSON.parse(str, (k, v) => (typeof v === 'string' && v.charCodeAt(0) === 1 ? blobs[+v.slice(1)] : v));
})();
