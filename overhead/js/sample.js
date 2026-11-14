/* Overhead Studio: the ready-made object library, the starter kit and the dungeon sample. */
(function () {
  'use strict';
  const OV = window.OV, M = OV.Model;
  const T = () => OV.Assets.TILE;

  /* ---------- bring built-in art and sounds into a project (once each) ---------- */
  function sprite(P, assetId) {
    const a = OV.Assets.sprite(assetId); if (!a) return null;
    const have = P.sprites.find(s => s.name === a.name); if (have) return have;
    a.id = OV.uid('spr'); P.sprites.push(a); return a;
  }
  function tileset(P, force) {
    const have = P.tilesets.find(t => t.name === 'Basic tiles'); if (have && !force) return have;
    const t = OV.Assets.tileset(); t.id = OV.uid('ts'); t.name = OV.uniqueName(t.name, P.tilesets.map(x => x.name)); P.tilesets.push(t); return t;
  }
  function sound(P, key, force) {
    const pre = OV.SOUND_PRESETS[key], name = OV.ident(pre.label);
    const have = P.sounds.find(s => s.name === name); if (have && !force) return have;
    const s = { id: OV.uid('snd'), name: OV.uniqueName(name, P.sounds.map(x => x.name)), kind: 'synth', p: OV.clone(pre.p) }; P.sounds.push(s); return s;
  }
  function global(P, name, value) { if (!P.globals.some(g => g.name === name)) P.globals.push({ name: name, value: value }); }
  const beh = (key, over) => Object.assign(OV.newBehavior(key), over || {});

  /* ---------- the library: ready-made object types ---------- */
  const CHEST = '// Opens when the player touches it, then drops three coins.\nfunction onTouch(other) {\n  if (!other.is("player") || this.opened) return;\n  this.opened = true;\n  this.setAnim("open");\n  game.sound("Coin");\n  for (let i = 0; i < 3; i++) this.spawn("Coin", random(-14, 14), random(6, 14));\n}\n';
  const LIB = {
    Player: P => ({ kind: 'player', spr: 'spr_hero', behaviors: [beh('player', { speed: 70 }), beh('health', { hp: 3, invuln: 1, hurtSound: sound(P, 'hurt').id, deathSound: sound(P, 'lose').id, gameOver: true }),
      beh('shooter', { bullet: need(P, 'Spark').id, rate: 0.3, speed: 170, sound: sound(P, 'shoot').id }), beh('camera', { lag: 0.1 })] }),
    Spark: () => ({ kind: 'bullet', spr: 'spr_spark', behaviors: [beh('bullet', { speed: 170, hits: 'any', life: 1.2 })] }),
    Orb: () => ({ kind: 'bullet', spr: 'spr_orb', behaviors: [beh('bullet', { speed: 90, hits: 'player', life: 3 })] }),
    Slime: P => ({ kind: 'enemy', spr: 'spr_slime', behaviors: [beh('chase', { speed: 32, range: 90 }), beh('health', { hp: 2, invuln: 0.15, deathSound: sound(P, 'hit').id }), beh('hurts', { knockback: 110 })] }),
    Bat: P => ({ kind: 'enemy', spr: 'spr_bat', behaviors: [beh('wander', { speed: 42 }), beh('ghost'), beh('edge', { mode: 'stop' }), beh('health', { hp: 1, invuln: 0.1, deathSound: sound(P, 'hit').id }), beh('hurts')] }),
    Ghost: P => ({ kind: 'enemy', spr: 'spr_ghost', behaviors: [beh('chase', { speed: 24, range: 130, sight: false, smart: false, idle: 'stay' }), beh('ghost'), beh('health', { hp: 3, invuln: 0.15, deathSound: sound(P, 'hit').id }), beh('hurts')] }),
    Skeleton: P => ({ kind: 'enemy', spr: 'spr_skeleton', behaviors: [beh('patrol', { distance: 64, speed: 30 }), beh('health', { hp: 3, invuln: 0.15, deathSound: sound(P, 'hit').id }), beh('hurts')] }),
    Totem: P => ({ kind: 'enemy', spr: 'spr_totem', behaviors: [beh('solid'), beh('turret', { bullet: need(P, 'Orb').id, range: 120, rate: 1.6, speed: 85, sound: sound(P, 'zap').id }), beh('health', { hp: 4, invuln: 0.15, deathBurst: 'explosion', deathSound: sound(P, 'explosion').id })] }),
    Coin: P => { global(P, 'score', 0); return { kind: 'item', spr: 'spr_coin', behaviors: [beh('collectible', { variable: 'score', amount: 1, sound: sound(P, 'coin').id })] }; },
    Gem: P => { global(P, 'score', 0); return { kind: 'item', spr: 'spr_gem', behaviors: [beh('collectible', { variable: 'score', amount: 5, sound: sound(P, 'powerup').id }), beh('sine', { amount: 1.5 })] }; },
    Heart: P => ({ kind: 'item', spr: 'spr_heart', behaviors: [beh('collectible', { variable: '', amount: 0, heals: 1, sound: sound(P, 'heal').id, burst: 'heal' }), beh('sine', { amount: 1.5 })] }),
    Potion: P => ({ kind: 'item', spr: 'spr_potion', behaviors: [beh('collectible', { variable: '', amount: 0, heals: 3, sound: sound(P, 'heal').id, burst: 'heal' })] }),
    Key: P => { global(P, 'keys', 0); return { kind: 'item', spr: 'spr_key', behaviors: [beh('collectible', { variable: 'keys', amount: 1, sound: sound(P, 'key').id }), beh('sine', { amount: 1.5 })] }; },
    Chest: P => { need(P, 'Coin'); return { kind: 'scenery', spr: 'spr_chest', behaviors: [beh('solid')], script: CHEST }; },
    Door: P => ({ kind: 'scenery', spr: 'spr_door', vars: [{ name: 'toRoom', value: '' }, { name: 'arriveAt', value: '' }], behaviors: [beh('door', { sound: sound(P, 'door').id })] }),
    Stairs: P => ({ kind: 'scenery', spr: 'spr_stairs', vars: [{ name: 'toRoom', value: '' }, { name: 'arriveAt', value: '' }], behaviors: [beh('door', { sound: sound(P, 'door').id })] }),
    Gate: () => ({ kind: 'scenery', spr: 'spr_gate', behaviors: [beh('solid')] }),
    Sign: () => ({ kind: 'scenery', spr: 'spr_sign', vars: [{ name: 'message', value: '' }], behaviors: [beh('solid'), beh('talk', { text: 'Nothing is written here yet.' })] }),
    Villager: () => ({ kind: 'npc', spr: 'spr_villager', vars: [{ name: 'message', value: '' }], behaviors: [beh('solid'), beh('talk', { text: 'Nice day for an adventure.' })] }),
    Flag: () => ({ kind: 'item', spr: 'spr_flag', behaviors: [beh('goal', { text: 'You win!' })] }),
    Tree: () => ({ kind: 'scenery', spr: 'spr_tree', behaviors: [beh('solid')] }),
    Rock: () => ({ kind: 'scenery', spr: 'spr_rock', behaviors: [beh('solid')] }),
    Bush: () => ({ kind: 'scenery', spr: 'spr_bush', behaviors: [] }),
    Crate: () => ({ kind: 'scenery', spr: 'spr_crate', behaviors: [beh('pushable')] }),
    Barrel: P => ({ kind: 'scenery', spr: 'spr_barrel', behaviors: [beh('solid'), beh('health', { hp: 1, invuln: 0, deathBurst: 'dust', deathSound: sound(P, 'hit').id })] }),
    Torch: () => ({ kind: 'scenery', spr: 'spr_torch', behaviors: [] }),
    Spikes: () => ({ kind: 'scenery', spr: 'spr_spikes', behaviors: [beh('hurts', { knockback: 120 })] }),
    Hearts: () => ({ kind: 'other', look: 'text', w: 96, h: 12, text: { value: '{hearts(Player)}', size: 11, color: '#ff6b8b', align: 'left', outline: true }, behaviors: [] }),
    ScoreText: P => { global(P, 'score', 0); return { kind: 'other', look: 'text', w: 96, h: 12, text: { value: '★ {score}', size: 10, color: '#ffe08a', align: 'left', outline: true }, behaviors: [] }; },
    KeysText: P => { global(P, 'keys', 0); return { kind: 'other', look: 'text', w: 96, h: 12, text: { value: 'Keys {keys}', size: 10, color: '#ffffff', align: 'right', outline: true }, behaviors: [] }; },
  };
  function make(P, key) {
    const d = LIB[key](P), spr = d.spr ? sprite(P, d.spr) : null;
    const def = { name: key, kind: d.kind, vars: d.vars || [], behaviors: d.behaviors || [], script: d.script || '' };
    if (spr) { def.look = 'sprite'; def.spriteId = spr.id; def.w = spr.w; def.h = spr.h; } else Object.assign(def, { look: d.look, w: d.w, h: d.h, text: d.text });
    return M.newType(P, def);
  }
  // Find the library object in the project, or add it.
  function need(P, key) { return P.types.find(t => t.name === key) || make(P, key); }
  const LABELS = { ScoreText: 'Score text (HUD)', Hearts: 'Hearts (HUD)', KeysText: 'Keys text (HUD)', Spark: 'Spark (player bullet)', Orb: 'Orb (enemy bullet)', Totem: 'Totem (turret)' };
  OV.Library = Object.keys(LIB).map(k => ({ key: k, label: LABELS[k] || k, make: P => make(P, k) }));

  /* ---------- building rooms in code ---------- */
  function builder(P, name, cols, rows, bg) {
    const ts = tileset(P), room = M.newRoom(P, name, cols * 16, rows * 16);
    room.bg = bg; room.grid = 16;
    const ground = room.layers[0], objs = room.layers[1];
    const walls = M.newLayer(P, room, 'tiles', 'Walls'), floor = M.newLayer(P, room, 'objects', 'Floor things'), hud = M.newLayer(P, room, 'objects', 'HUD');
    hud.parallax = 0; room.layers = [ground, walls, floor, objs, hud];
    [ground, walls].forEach(L => { L.tilesetId = ts.id; });
    M.fitRoomLayers(P, room);
    let seed = name.length * 7919 + 13; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const B = {
      room: room, rnd: rnd,
      rect(L, x0, y0, x1, y1, tile) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < L.cols && y < L.rows) L.data[y * L.cols + x] = tile + 1; },
      ground(x0, y0, x1, y1, tile) { B.rect(ground, x0, y0, x1, y1, tile); },
      wall(x0, y0, x1, y1, tile) { B.rect(walls, x0, y0, x1, y1, tile); },
      clear(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) walls.data[y * walls.cols + x] = 0; },
      scatter(from, list, chance) { for (let k = 0; k < ground.data.length; k++) if (ground.data[k] === from + 1 && rnd() < chance) ground.data[k] = list[Math.floor(rnd() * list.length)] + 1; },
      // put an object on a grid cell: centred, standing on the bottom of the cell
      put(key, cx, cy, extra, layer) {
        const type = need(P, key), m = M.metrics(P, { typeId: type.id }, type);
        const inst = M.newInstance(type, cx * 16 + (16 - m.w) / 2 - m.dx, (cy + 1) * 16 - m.h - m.dy);
        if (m.h < 16) inst.y = cy * 16 + (16 - m.h) / 2 - m.dy;
        Object.assign(inst, extra || {}); (layer || objs).instances.push(inst); return inst;
      },
      flat(key, cx, cy, extra) { return B.put(key, cx, cy, extra, floor); },
      many(key, cells, extra) { cells.forEach(c => B.put(key, c[0], c[1], extra)); },
      hud() {
        const add = (key, x, y) => { const t = need(P, key), i = M.newInstance(t, x, y); hud.instances.push(i); };
        add('Hearts', 4, 3); add('ScoreText', 4, 17); add('KeysText', P.settings.viewW - 100, 4);
      },
    };
    return B;
  }
  const cond = (target, key, p, not) => { const c = { id: OV.uid('c'), target: target, key: key, p: p || {} }; if (not) c.not = true; return c; };
  const act = (target, key, p) => ({ id: OV.uid('c'), target: target, key: key, p: p || {} });
  const event = (note, conds, acts, sub) => { const e = M.newEvent(); if (note) e.comment = note; e.conds = conds; e.acts = acts; e.sub = sub || []; return e; };

  /* ---------- templates ---------- */
  function blank() {
    const P = M.blank('Untitled game');
    tileset(P); const r = M.newRoom(P, 'Room1', 480, 320); r.bg = '#34753f';
    M.newSheet(P, 'Events', 'all');
    return P;
  }
  function starter() {
    const P = M.blank('My game');
    const b = builder(P, 'Room1', 30, 20, '#34753f');
    b.ground(0, 0, 29, 19, T().grass); b.scatter(T().grass, [T().grassFlowers, T().grassTuft], 0.08);
    Object.keys(LIB).forEach(k => need(P, k));
    b.put('Player', 14, 9); b.hud();
    M.newSheet(P, 'Events', 'all');
    return P;
  }

  function dungeon() {
    const P = M.blank('Sample: The Locked Cellar'), t = T();
    global(P, 'score', 0); global(P, 'keys', 0); global(P, 'visited', 0);
    ['Player', 'Spark', 'Orb'].forEach(k => need(P, k));

    /* ----- room 1: the meadow ----- */
    const a = builder(P, 'Meadow', 30, 18, '#34753f');
    a.ground(0, 0, 29, 17, t.grass);
    a.ground(4, 3, 7, 4, t.dirt); a.ground(4, 5, 5, 11, t.dirt); a.ground(4, 10, 23, 11, t.dirt); a.ground(23, 8, 23, 9, t.dirt);
    a.ground(7, 13, 11, 16, t.water); a.ground(8, 14, 10, 15, t.waterDeep); a.ground(6, 13, 6, 16, t.sand); a.ground(12, 13, 12, 16, t.sand); a.ground(6, 12, 12, 12, t.sand);
    a.ground(19, 2, 27, 8, t.stoneFloor); a.ground(23, 8, 23, 8, t.cobble);
    a.scatter(t.grass, [t.grassFlowers, t.grassTuft], 0.09); a.scatter(t.stoneFloor, [t.stoneFloorCracked], 0.12);
    a.wall(0, 0, 29, 0, t.hedge); a.wall(0, 17, 29, 17, t.hedge); a.wall(0, 0, 0, 17, t.hedge); a.wall(29, 0, 29, 17, t.hedge);
    a.wall(19, 2, 27, 2, t.wallTop); a.wall(20, 3, 26, 3, t.wallFace); a.wall(19, 3, 19, 7, t.wallTop); a.wall(27, 3, 27, 7, t.wallTop);
    a.wall(19, 7, 27, 7, t.wallTop); a.wall(19, 8, 27, 8, t.wallFace); a.clear(23, 7, 23, 8);
    a.put('Player', 5, 4);
    a.put('Villager', 7, 3, { vars: { message: 'Hello, traveller!\nThe old ruin to the east hides a way down.\nIts gate is locked. I saw a slime drag a key off to the south-west.' } });
    a.put('Sign', 3, 9, { vars: { message: 'Arrow keys or WASD: move.  Space: shoot.  E: talk.\nPush crates out of your way.' } });
    a.many('Tree', [[2, 2], [10, 2], [14, 4], [16, 7], [9, 6], [12, 8], [2, 7], [17, 13], [22, 14], [26, 12], [15, 15], [27, 15], [20, 13], [13, 1], [17, 2]]);
    a.many('Rock', [[11, 5], [25, 10], [15, 12]]); a.many('Bush', [[8, 8], [13, 13], [18, 5], [24, 15], [3, 6]]);
    a.many('Crate', [[16, 10], [16, 11]]); a.many('Barrel', [[26, 5], [26, 6], [1, 16]]);
    a.many('Coin', [[7, 10], [9, 11], [11, 10], [13, 11], [18, 10], [20, 11], [12, 3], [13, 3], [15, 9], [25, 13], [26, 14], [6, 12], [12, 12], [22, 5], [24, 5]]);
    a.many('Gem', [[28, 16], [1, 1]]); a.put('Heart', 2, 10);
    a.put('Key', 3, 15); a.many('Slime', [[5, 14], [2, 13], [14, 6], [20, 15]]); a.many('Bat', [[15, 2], [9, 12]]);
    a.put('Gate', 23, 8); a.put('Chest', 21, 5); a.put('Totem', 20, 4);
    a.many('Torch', [[21, 3], [25, 3]]);
    a.flat('Stairs', 23, 4, { name: 'MeadowStairs', vars: { toRoom: 'Cellar', arriveAt: 'CellarEntry' } });
    a.hud();

    /* ----- room 2: the cellar ----- */
    const c = builder(P, 'Cellar', 24, 16, '#16121c');
    c.ground(0, 0, 23, 15, t.darkFloor); c.ground(1, 1, 7, 5, t.stoneFloor); c.ground(17, 11, 22, 14, t.checker); c.ground(10, 6, 14, 9, t.carpet);
    c.wall(0, 0, 23, 0, t.rockWall); c.wall(0, 15, 23, 15, t.rockWall); c.wall(0, 0, 0, 15, t.rockWall); c.wall(23, 0, 23, 15, t.rockWall);
    c.wall(8, 1, 8, 10, t.wallTop); c.wall(8, 11, 8, 11, t.wallFace);
    c.wall(16, 5, 16, 14, t.wallTop);
    c.wall(17, 10, 22, 10, t.wallTop); c.wall(17, 11, 22, 11, t.wallFace); c.clear(20, 10, 20, 11);
    c.flat('Stairs', 2, 2, { name: 'CellarEntry', vars: { toRoom: 'Meadow', arriveAt: 'MeadowStairs' } });
    c.put('Player', 3, 3);
    c.put('Sign', 18, 9, { vars: { message: 'A seal bars the way.\nDefeat every creature in the cellar to break it.' } });
    c.many('Slime', [[5, 8], [3, 12], [19, 7]]); c.put('Skeleton', 10, 4); c.put('Skeleton', 11, 11); c.put('Ghost', 13, 13); c.put('Totem', 21, 3);
    c.flat('Spikes', 11, 13); c.flat('Spikes', 12, 13); c.flat('Spikes', 17, 2);
    c.many('Coin', [[5, 3], [6, 6], [2, 9], [5, 13], [10, 2], [13, 7], [11, 8], [14, 12], [18, 3], [20, 5], [22, 8], [18, 13], [22, 13]]);
    c.many('Gem', [[14, 2], [22, 2]]); c.put('Heart', 6, 2); c.put('Potion', 10, 14);
    c.many('Barrel', [[1, 14], [2, 14], [15, 14]]); c.many('Crate', [[9, 12]]);
    c.put('Flag', 20, 13);
    const seal = M.newType(P, { name: 'Seal', kind: 'scenery', look: 'sprite', spriteId: sprite(P, 'spr_gate').id, behaviors: [beh('solid')] });
    c.put('Seal', 20, 10);
    c.hud();

    /* ----- events ----- */
    const id = n => need(P, n).id, snd = k => sound(P, k).id;
    const rules = M.newSheet(P, 'Game rules', 'all');
    rules.events.push(
      event('Gates: a key opens one. The Key object adds to "keys" by itself (its Collectible behaviour).',
        [cond(id('Player'), 'touches', { other: id('Gate') }), cond('system', 'compare', { a: 'keys', cmp: '>', b: '0' })],
        [act(id('Gate'), 'burst', { preset: 'dust' }), act(id('Gate'), 'destroy'), act('system', 'addVar', { name: 'keys', value: '-1' }), act('system', 'sound', { sound: snd('door') }), act('system', 'shake', { amount: 2, sec: 0.2 })]),
      event(null, [cond(id('Player'), 'touchStart', { other: id('Gate') }), cond('system', 'compare', { a: 'keys', cmp: '==', b: '0' })], [act(id('Player'), 'say', { text: 'Locked. I need a key.', sec: 2 })]),
      event('Slimes sometimes drop a coin. The sub-event only runs when the row above it does.', [cond(id('Slime'), 'destroyed')], [],
        [event(null, [cond('system', 'chance', { pct: 60 })], [act(id('Slime'), 'spawn', { type: id('Coin') })])]),
      event('Low health warning.', [cond('system', 'every', { sec: 1 }), cond(id('Player'), 'prop', { prop: 'hp', cmp: '<=', value: '1' })], [act(id('Player'), 'flash', { sec: 0.4 })]),
      event('Any action can be plain JavaScript. Press Q to try it.', [cond('system', 'keyPressed', { key: 'KeyQ' })],
        [act('system', 'js', { code: '// Globals (score), object names (Player) and helpers (count) just work.\nconst left = count("Coin");\nPlayer.say(left + " coins left here", 2);\nlog("score is", score, "and", left, "coins are left in", room);' })]),
      event(null, [cond(id('Player'), 'touches', { other: id('Flag') })], [act('system', 'sound', { sound: snd('win') })]));
    const meadow = M.newSheet(P, 'Meadow events', a.room.id);
    meadow.events.push(event('A welcome message, shown only the first time. "visited" is a global variable.',
      [cond('system', 'start'), cond('system', 'compare', { a: 'visited', cmp: '==', b: '0' })],
      [act('system', 'setVar', { name: 'visited', value: '1' }), act('system', 'wait', { sec: 0.4 }), act('system', 'dialog', { text: 'The way down is inside the old ruin, behind a locked gate.\nFind the key. Talk to the villager if you get stuck.' })]));
    const cellar = M.newSheet(P, 'Cellar events', c.room.id);
    cellar.events.push(event('When no enemy is left, the seal breaks. "Any enemy" means every object whose kind is Enemy.',
      [cond('kind:enemy', 'exists', {}, true), cond(seal.id, 'exists', {})],
      [act(seal.id, 'burst', { preset: 'explosion' }), act(seal.id, 'destroy'), act('system', 'shake', { amount: 4, sec: 0.5 }), act('system', 'sound', { sound: snd('powerup') }), act(id('Player'), 'say', { text: 'The seal broke!', sec: 2.5 })]));
    need(P, 'Flag').behaviors[0].text = 'You escaped the cellar!';
    P.settings.startRoom = a.room.id;
    return P;
  }

  OV.Sample = { blank: blank, starter: starter, dungeon: dungeon, sprite: sprite, tileset: tileset, sound: sound };
})();
