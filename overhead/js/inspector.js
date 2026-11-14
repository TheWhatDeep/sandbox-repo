/* Overhead Studio: the Properties panel (right side), the object type editor, and the
   small editors for sounds, global variables and game settings. */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, M = OV.Model, S = OV.state, ui = OV.ui, RT = OV.Runtime;

  /* ---------- one field for a behaviour or event parameter ---------- */
  OV.paramField = (p, get, set, ctx) => {
    const P = OV.project, o = { hard: false }, cur = get();
    const withCur = opts => (cur != null && cur !== '' && !opts.some(x => x[0] === cur) ? opts.concat([[cur, String(cur)]]) : opts);
    switch (p.type) {
      case 'num': return ctx && ctx.expr ? ui.text(p.label, get, set, { code: true, placeholder: 'number or expression' }) : ui.num(p.label, () => +get() || 0, set, { step: Math.abs(+p.def) < 1 && p.def !== 0 ? 0.05 : 1 });
      case 'expr': return ui.text(p.label, get, set, { code: true, placeholder: 'e.g. score + 1 or Player.x' });
      case 'bool': return ui.check(p.label, get, set);
      case 'choice': return ui.select(p.label, p.options, get, set, o);
      case 'kind': return ui.select(p.label, OV.KINDS.concat([['any', 'Anything']]), get, set, o);
      case 'typeOnly': return ui.select(p.label, [['', ctx && ctx.bullet ? '(simple built-in shot)' : '(none)']].concat(P.types.map(t => [t.id, t.name])), () => get() || '', set, o);
      case 'type': return ui.select(p.label, [['', '(choose)']].concat(P.types.map(t => [t.id, t.name]), OV.KINDS.map(k => ['kind:' + k[0], 'Any ' + k[1].toLowerCase()])), () => get() || '', set, o);
      case 'room': return ui.select(p.label, [['', '(choose)']].concat(P.rooms.map(r => [r.id, r.name])), () => get() || '', set, o);
      case 'sound': return ui.select(p.label, [['', '(none)']].concat(P.sounds.map(s => [s.id, s.name])), () => get() || '', set, o);
      case 'key': return ui.select(p.label, OV.KEYS, get, set, o);
      case 'cmp': return ui.select(p.label, OV.CMPS, get, set, o);
      case 'burst': return ui.select(p.label, [['', '(nothing)']].concat(OV.BURSTS), () => get() || '', set, o);
      case 'beh': return ui.select(p.label, OV.BEHAVIORS.map(b => [b.key, b.label]), get, set, o);
      case 'global': return ui.select(p.label, withCur([['', '(nothing)']].concat(P.globals.filter(g => g.name).map(g => [g.name, g.name]))), () => get() || '', set, o);
      case 'prop': {
        const names = ['x', 'y', 'hp', 'maxHp', 'speed', 'angle', 'opacity', 'w', 'h', 'visible', 'flip', 'anim', 'name'];
        const t = ctx && ctx.target ? OV.byId(P.types, ctx.target) : null; if (t) t.vars.forEach(v => v.name && names.unshift(v.name));
        const id = 'dl' + OV.uid('');
        const f = ui.text(p.label, get, set, { code: true, list: id }); f.append(h('datalist', { id: id }, names.map(n => h('option', { value: n })))); return f;
      }
      case 'area': return ui.area(p.label, get, set, { rows: 3 });
      case 'js': return ui.area(p.label, get, set, { rows: 9, code: true });
      default: return ui.text(p.label, get, set, {});
    }
  };

  /* ================= Properties panel ================= */
  const head = (icon, title, sub) => h('div', { class: 'insp-head' }, icon, h('div', { class: 'insp-title' }, h('b', { text: title }), sub ? h('span', { class: 'muted small', text: sub }) : null));

  function instPanel(root) {
    const P = OV.project, ids = S.sel.ids, found = ids.map(id => M.findInstance(P, id)).filter(Boolean);
    if (!found.length) return projectPanel(root);
    const room = found[0].room;
    const del = () => OV.edit(() => { room.layers.forEach(L => { if (L.kind === 'objects') L.instances = L.instances.filter(i => !ids.includes(i.id)); }); S.sel = null; });
    const moveLayer = () => ui.select('Layer', room.layers.filter(L => L.kind === 'objects').map(L => [L.id, L.name]), () => found[0].layer.id, v => {
      const to = OV.byId(room.layers, v); if (!to) return;
      found.forEach(f => { f.layer.instances = f.layer.instances.filter(i => i !== f.inst); to.instances.push(f.inst); });
    }, { hard: true });
    if (found.length > 1) {
      root.append(head(h('span', { class: 'tree-icon', text: '◆' }), found.length + ' objects selected'), ui.section(null, moveLayer()),
        ui.section(null, h('div', { class: 'row' }, ui.btn('Delete', del, 'danger'))));
      return;
    }
    const inst = found[0].inst, type = OV.byId(P.types, inst.typeId), m = M.metrics(P, inst);
    root.append(head(OV.thumb(type, 28), type.name, 'One copy of this object'),
      h('div', { class: 'row', style: { marginBottom: '10px' } }, ui.btn('Edit object type', () => OV.open('type', type.id), 'small')));
    root.append(ui.section('This copy',
      ui.text('Name (optional)', () => inst.name || '', v => { if (v.trim()) inst.name = v.trim(); else delete inst.name; }, { placeholder: 'e.g. CellarDoor', max: 40 }),
      h('p', { class: 'muted small', style: { margin: '4px 0 8px' }, text: 'Doors and scripts can find a copy by its name.' }),
      ui.grid(
        ui.num('X', () => inst.x, v => (inst.x = v)), ui.num('Y', () => inst.y, v => (inst.y = v)),
        ui.num('Width', () => M.metrics(P, inst).w, v => (inst.w = Math.max(1, v))), ui.num('Height', () => M.metrics(P, inst).h, v => (inst.h = Math.max(1, v))),
        ui.num('Angle', () => inst.angle || 0, v => { if (v) inst.angle = v; else delete inst.angle; }), ui.num('Opacity', () => (inst.opacity == null ? 1 : inst.opacity), v => { v = OV.clamp(v, 0, 1); if (v === 1) delete inst.opacity; else inst.opacity = v; }, { step: 0.1, min: 0, max: 1 }),
        moveLayer()),
      inst.w != null || inst.h != null ? h('div', { style: { marginTop: '8px' } }, ui.btn('Reset size', () => OV.edit(() => { delete inst.w; delete inst.h; }), 'small')) : null));
    if (type.vars.length) {
      root.append(ui.section('Variables', ui.grid(type.vars.filter(v => v.name).map(v =>
        ui.text(v.name, () => (inst.vars && inst.vars[v.name] != null ? String(inst.vars[v.name]) : ''), val => {
          if (val === '') { if (inst.vars) { delete inst.vars[v.name]; if (!Object.keys(inst.vars).length) delete inst.vars; } }
          else (inst.vars = inst.vars || {})[v.name] = OV.parseValue(val);
        }, { placeholder: String(v.value), code: true }))),
        h('p', { class: 'muted small', style: { margin: '6px 0 0' }, text: 'Leave blank to use the object type\'s value.' })));
    }
    const L = found[0].layer;
    root.append(ui.section(null, h('div', { class: 'row' },
      ui.btn('To front', () => OV.edit(() => { L.instances = L.instances.filter(i => i !== inst).concat(inst); }), 'small'),
      ui.btn('To back', () => OV.edit(() => { L.instances = [inst].concat(L.instances.filter(i => i !== inst)); }), 'small'),
      ui.btn('Delete', del, 'small danger'))));
  }

  function typePanel(root) {
    const P = OV.project, t = OV.res('type', S.sel.id), n = M.countInstances(P, t.id);
    root.append(head(OV.thumb(t, 32), t.name, (OV.KINDS.find(k => k[0] === t.kind) || ['', 'Other'])[1] + ' · ' + n + (n === 1 ? ' copy placed' : ' copies placed')),
      h('div', { class: 'row' }, ui.btn('Edit object', () => OV.open('type', t.id), 'primary'), ui.btn('Place in room', () => { const d = OV.docApi(); if (OV.currentRoom() && d) { OV.RoomEditor.setTool('place'); if (matchMedia('(max-width: 860px)').matches) OV.$('#app').dataset.focus = 'doc'; } else OV.toast('Open a room first.'); })),
      ui.section('Behaviours', t.behaviors.length ? h('div', { class: 'chips' }, t.behaviors.map(b => h('span', { class: 'chip', text: (OV.behaviorDef(b.type) || { label: b.type }).label }))) : h('p', { class: 'muted small', style: { margin: 0 }, text: 'None. Open the object to add some.' })),
      ui.section('How to use', h('p', { class: 'muted small', style: { margin: 0 }, text: 'This is the cookie cutter. With it selected, use the Place tool to stamp copies into a room. Changing the object changes every copy.' })));
  }

  function roomPanel(root, room) {
    const P = OV.project;
    root.append(head(h('span', { class: 'tree-icon big', text: '▦' }), room.name, P.settings.startRoom === room.id ? 'The game starts in this room' : 'Room'),
      ui.section('Room',
        ui.grid(
          ui.num('Width (px)', () => room.w, v => { room.w = OV.clamp(Math.round(v), 32, 8192); M.fitRoomLayers(P, room); OV.RoomEditor.invalidate(); }, { step: room.grid }),
          ui.num('Height (px)', () => room.h, v => { room.h = OV.clamp(Math.round(v), 32, 8192); M.fitRoomLayers(P, room); OV.RoomEditor.invalidate(); }, { step: room.grid }),
          ui.num('Grid size', () => room.grid, v => (room.grid = OV.clamp(Math.round(v), 2, 256))),
          ui.color('Background', () => room.bg, v => (room.bg = v))),
        P.settings.startRoom !== room.id ? h('div', { style: { marginTop: '8px' } }, ui.btn('Make this the start room', () => OV.edit(() => (P.settings.startRoom = room.id)), 'small')) : null));
    const sheets = P.sheets.filter(s => s.scope === 'all' || s.scope === room.id);
    root.append(ui.section('Events that run here',
      sheets.map(s => h('div', { class: 'link-row' }, h('button', { class: 'linklike', type: 'button', onclick: () => OV.open('sheet', s.id), text: s.name }), h('span', { class: 'muted small', text: s.scope === 'all' ? 'every room' : 'this room only' }))),
      h('div', { style: { marginTop: '8px' } }, ui.btn('New event sheet for this room', () => { let s; OV.edit(() => { s = M.newSheet(P, room.name + ' events', room.id); }); OV.open('sheet', s.id); }, 'small'))));
    root.append(ui.section('Tips', h('ul', { class: 'tips' },
      h('li', null, 'Select an object in the Project panel, then use the Place tool.'),
      h('li', null, 'Pick a tile layer in Layers to paint floors and walls.'),
      h('li', null, 'Press ', h('kbd', { text: 'Ctrl' }), ' + ', h('kbd', { text: 'Enter' }), ' to play this room.'))));
  }

  function projectPanel(root) {
    const P = OV.project, st = P.settings;
    root.append(head(h('span', { class: 'tree-icon big', text: '⚙' }), 'Game settings', P.rooms.length + ' rooms · ' + P.types.length + ' objects · ' + P.sprites.length + ' sprites'),
      ui.section('Screen',
        ui.grid(ui.num('View width', () => st.viewW, v => (st.viewW = OV.clamp(Math.round(v), 64, 1920)), { step: 16 }), ui.num('View height', () => st.viewH, v => (st.viewH = OV.clamp(Math.round(v), 64, 1080)), { step: 16 })),
        h('p', { class: 'muted small', style: { margin: '6px 0 8px' }, text: 'How much of a room is on screen at once, in game pixels. It is scaled up to fill the window.' }),
        ui.check('Crisp pixel art (no smoothing)', () => st.pixelArt !== false, v => (st.pixelArt = v))),
      ui.section('Start', ui.select('The game starts in', P.rooms.map(r => [r.id, r.name]), () => st.startRoom, v => (st.startRoom = v))),
      ui.section('Controls in every game', h('ul', { class: 'tips' },
        h('li', null, 'Arrow keys or WASD move. On phones a stick appears.'),
        h('li', null, h('kbd', { text: 'Space' }), ' is button A, ', h('kbd', { text: 'E' }), ' is button B.'))));
  }

  function globalsPanel(root) {
    const P = OV.project;
    root.append(head(h('span', { class: 'tree-icon big', text: 'x=' }), 'Global variables', 'Values the whole game shares'));
    const list = h('div', { class: 'var-list' });
    P.globals.forEach((g, k) => list.append(varRow(g, () => OV.edit(() => P.globals.splice(k, 1)), P.globals)));
    root.append(ui.section(null, list, ui.btn('+ Add a variable', () => OV.edit(() => P.globals.push({ name: OV.uniqueName('value', P.globals.map(g => g.name)), value: 0 })), 'small'),
      h('p', { class: 'muted small', style: { margin: '10px 0 0' }, text: 'Use them by name anywhere: in events ("Add 1 to score"), in text ("Score: {score}") and in scripts (score += 1). They keep their value between rooms.' })));
  }
  function varRow(v, onDelete, all) {
    return h('div', { class: 'var-row' },
      ui.text(null, () => v.name, x => (v.name = x), { code: true, placeholder: 'name', max: 30 }),
      ui.text(null, () => String(v.value), x => (v.value = OV.parseValue(x)), { code: true, placeholder: 'value' }),
      h('button', { class: 'btn icon small ghost', type: 'button', 'aria-label': 'Remove ' + v.name, onclick: onDelete, text: '✕' }));
  }
  // names typed into a variable row become script-safe when you leave the field
  document.addEventListener('change', e => {
    const row = e.target.closest && e.target.closest('.var-row'); if (!row || !OV.project) return;
    let changed = false;
    const fix = list => list.forEach(v => { const n = OV.ident(v.name, 'value'); if (n !== v.name) { v.name = n; changed = true; } });
    OV.beginEdit(); fix(OV.project.globals); OV.project.types.forEach(t => fix(t.vars)); OV.endEdit(changed);
  });

  /* ----- sounds ----- */
  OV.SOUND_PRESETS = {
    coin: { label: 'Coin', p: { wave: 'square', freq: 988, dur: 0.22, vol: 0.5, arp: [1, 1.5] } },
    hit: { label: 'Hit', p: { wave: 'noise', freq: 900, freqEnd: 120, dur: 0.14, vol: 0.7 } },
    hurt: { label: 'Hurt', p: { wave: 'sawtooth', freq: 320, freqEnd: 70, dur: 0.28, vol: 0.6 } },
    shoot: { label: 'Shoot', p: { wave: 'square', freq: 820, freqEnd: 180, dur: 0.13, vol: 0.45 } },
    zap: { label: 'Zap', p: { wave: 'sawtooth', freq: 1200, freqEnd: 240, dur: 0.2, vol: 0.4 } },
    explosion: { label: 'Explosion', p: { wave: 'noise', freq: 600, freqEnd: 40, dur: 0.6, vol: 0.9 } },
    powerup: { label: 'Power-up', p: { wave: 'square', freq: 440, dur: 0.4, vol: 0.5, arp: [1, 1.25, 1.5, 2] } },
    heal: { label: 'Heal', p: { wave: 'triangle', freq: 523, dur: 0.35, vol: 0.8, arp: [1, 1.26, 1.5] } },
    door: { label: 'Door', p: { wave: 'triangle', freq: 180, freqEnd: 90, dur: 0.3, vol: 0.9 } },
    blip: { label: 'Blip', p: { wave: 'square', freq: 660, dur: 0.06, vol: 0.4 } },
    key: { label: 'Key', p: { wave: 'triangle', freq: 1320, dur: 0.3, vol: 0.7, arp: [1, 1.5, 2] } },
    win: { label: 'Fanfare', p: { wave: 'square', freq: 523, dur: 0.9, vol: 0.5, sustain: 0.7, arp: [1, 1, 1.26, 1.5, 1.26, 1.5, 2, 2] } },
    lose: { label: 'Game over', p: { wave: 'triangle', freq: 392, dur: 0.9, vol: 0.9, sustain: 0.6, arp: [1, 0.84, 0.75, 0.63, 0.5, 0.5] } },
  };
  function soundPanel(root) {
    const s = OV.res('sound', S.sel.id);
    root.append(head(h('span', { class: 'tree-icon big', text: '♪' }), s.name, s.kind === 'file' ? 'Imported audio, ' + Math.round(s.src.length * 0.75 / 1024) + ' KB' : 'Made by the built-in synth'),
      h('div', { class: 'row' }, ui.btn('▶ Play', () => RT.audio.play(s), 'primary')));
    if (s.kind === 'file') { root.append(ui.section('Sound', ui.num('Volume', () => (s.vol == null ? 0.8 : s.vol), v => (s.vol = OV.clamp(v, 0, 1)), { step: 0.1, min: 0, max: 1 }))); return; }
    const p = s.p, play = () => RT.audio.play(s);
    const f = (label, key, step, min, max, def) => { const fld = ui.num(label, () => (p[key] == null ? def : p[key]), v => (p[key] = OV.clamp(v, min, max)), { step: step, min: min, max: max }); fld.querySelector('input').addEventListener('change', play); return fld; };
    const wave = ui.select('Wave', [['square', 'Square (retro beep)'], ['sawtooth', 'Saw (buzzy)'], ['triangle', 'Triangle (soft)'], ['sine', 'Sine (pure)'], ['noise', 'Noise (crash, hit)']], () => p.wave, v => { p.wave = v; setTimeout(play, 0); }, { hard: false });
    root.append(ui.section('Shape',
      ui.grid(wave, f('Length (s)', 'dur', 0.05, 0.02, 3, 0.2), f('Start pitch (Hz)', 'freq', 20, 20, 4000, 440), f('End pitch (Hz)', 'freqEnd', 20, 20, 4000, p.freq || 440), f('Volume', 'vol', 0.1, 0, 1, 0.5), f('Fade-in (s)', 'attack', 0.01, 0, 1, 0)),
      h('div', { style: { marginTop: '8px' } }, ui.text('Note steps', () => (p.arp || []).join(', '), v => { const a = v.split(/[\s,]+/).map(Number).filter(n => n > 0); if (a.length) p.arp = a; else delete p.arp; }, { placeholder: 'e.g. 1, 1.5, 2', code: true })),
      h('p', { class: 'muted small', style: { margin: '6px 0 0' }, text: 'Note steps play the start pitch times each number in turn, like a tiny tune. Leave blank for a slide from start pitch to end pitch.' })),
      ui.section('Start again from',
        h('div', { class: 'chips' }, Object.keys(OV.SOUND_PRESETS).map(k => h('button', { class: 'chip btnlike', type: 'button', text: OV.SOUND_PRESETS[k].label, onclick: () => { OV.edit(() => (s.p = OV.clone(OV.SOUND_PRESETS[k].p))); play(); } }))),
        h('div', { style: { marginTop: '8px' } }, ui.btn('Mutate a little', () => { OV.edit(() => { p.freq = Math.round(OV.clamp((p.freq || 440) * (0.8 + Math.random() * 0.4), 40, 3000)); if (p.freqEnd) p.freqEnd = Math.round(OV.clamp(p.freqEnd * (0.8 + Math.random() * 0.4), 30, 3000)); p.dur = Math.round(OV.clamp((p.dur || 0.2) * (0.8 + Math.random() * 0.4), 0.03, 2) * 100) / 100; }); play(); }, 'small'))));
  }

  function simplePanel(root, kind) {
    const r = OV.res(kind, S.sel.id), P = OV.project;
    if (kind === 'sprite') {
      const users = P.types.filter(t => t.look === 'sprite' && t.spriteId === r.id);
      root.append(head(OV.thumb(r, 32), r.name, r.w + ' × ' + r.h + ' px · ' + r.anims.map(a => a.name + ' (' + a.frames.length + ')').join(', ')),
        h('div', { class: 'row' }, ui.btn('Edit sprite', () => OV.open('sprite', r.id), 'primary'),
          ui.btn('Make an object from it', () => { let t; OV.edit(() => { t = M.newType(P, { name: r.name, look: 'sprite', spriteId: r.id }); S.sel = { kind: 'type', id: t.id }; S.stampType = t.id; }); OV.open('type', t.id); })),
        ui.section('Used by', users.length ? h('div', { class: 'chips' }, users.map(t => h('button', { class: 'chip btnlike', type: 'button', text: t.name, onclick: () => OV.open('type', t.id) }))) : h('p', { class: 'muted small', style: { margin: 0 }, text: 'No object uses this sprite yet.' })));
    } else if (kind === 'tileset') {
      root.append(head(OV.thumb(r, 32), r.name, r.cols + ' × ' + r.rows + ' tiles of ' + r.tw + ' px · ' + r.solid.filter(Boolean).length + ' solid'),
        h('div', { class: 'row' }, ui.btn('Edit tileset', () => OV.open('tileset', r.id), 'primary')),
        ui.section('How to use', h('p', { class: 'muted small', style: { margin: 0 }, text: 'Open a room, choose a tile layer in Layers, and paint. Mark tiles as solid in the tileset editor to make walls.' })));
    } else if (kind === 'sheet') {
      root.append(head(h('span', { class: 'tree-icon big', text: '≡' }), r.name, r.events.length + ' events'),
        h('div', { class: 'row' }, ui.btn('Edit events', () => OV.open('sheet', r.id), 'primary')),
        ui.section('Runs in', ui.select(null, [['all', 'Every room']].concat(P.rooms.map(x => [x.id, 'Only ' + x.name])), () => r.scope, v => (r.scope = v))));
    }
  }

  OV.Props = {
    render() {
      const root = OV.$('#props'); if (!root || !OV.project) return;
      root.textContent = '';
      const sel = S.sel, room = OV.currentRoom();
      if (sel && sel.kind === 'inst') instPanel(root);
      else if (sel && sel.kind === 'type' && OV.res('type', sel.id)) typePanel(root);
      else if (sel && sel.kind === 'room' && OV.res('room', sel.id)) roomPanel(root, OV.res('room', sel.id));
      else if (sel && sel.kind === 'sound' && OV.res('sound', sel.id)) soundPanel(root);
      else if (sel && sel.kind === 'globals') globalsPanel(root);
      else if (sel && sel.kind === 'project') projectPanel(root);
      else if (sel && OV.res(sel.kind, sel.id)) simplePanel(root, sel.kind);
      else if (room) roomPanel(root, room);
      else projectPanel(root);
    },
    sync() { const root = OV.$('#props'); if (root) ui.sync(root); },
  };

  /* ================= object type editor (a document tab) ================= */
  const HELPERS = [
    ['this.moveToward(player)', 'Walk toward something. Optional speed in px/s.'], ['this.pathTo(player)', 'Same, but finds a way around walls.'],
    ['this.moveAway(player)', 'Walk away from something.'], ['this.move(dx, dy)', 'Move by pixels. Walls still block it.'],
    ['this.patrol(48)', 'Back and forth. Add "y" as a third value for up and down.'], ['this.wander()', 'Walk around at random.'],
    ['this.distanceTo(player)', 'Distance in pixels.'], ['this.canSee(player, 120)', 'True if no wall is in the way.'],
    ['this.shoot("Orb", player, 120)', 'Fire a bullet object at a target, "facing", or an angle.'], ['this.spawn("Coin")', 'Create another object here.'],
    ['this.say("Hi", 2)', 'Speech bubble for 2 seconds.'], ['this.every(1, () => {…})', 'Repeat every second.'], ['this.after(3, () => {…})', 'Run once after 3 seconds.'],
    ['this.touching("enemy")', 'True while touching that kind, object or name.'], ['this.damage(1) / this.heal(1)', 'Change health (needs the Health behaviour).'],
    ['this.setAnim("open")', 'Switch animation. "auto" goes back to idle/walk.'], ['this.flash(0.4), this.burst("smoke")', 'Effects.'],
    ['this.destroy()', 'Remove it from the game.'], ['this.x, .y, .hp, .speed, .angle, .opacity', 'Read or change these directly.'],
    ['this.myVariable', 'Your own variables work the same way.'], ['other.is("player")', 'Check a kind, object name or copy name.'],
    ['Player.x, Coin.exists', 'Any object by its name (the first one found).'], ['find("Door1"), findAll("enemy"), count("Coin")', 'Look things up.'],
    ['score += 1', 'Global variables are plain names.'], ['game.goTo("Cellar"), game.restart()', 'Change rooms.'],
    ['game.win("Done!"), game.lose()', 'End the game.'], ['game.sound("Coin"), game.shake(3, 0.3)', 'Sound and camera.'],
    ['game.message("Hello")', 'Show a message box.'], ['random(1, 6), choose("a", "b")', 'Randomness.'], ['hearts(Player)', 'Health as ♥♥♡ text.'], ['keyDown("Space"), log("hi", x)', 'Input and the console.'],
  ];
  const STARTER = '// Runs once when this object appears.\nfunction onCreate() {\n}\n\n// Runs 60 times a second.\nfunction onUpdate() {\n}\n\n// Runs when it starts touching something.\nfunction onTouch(other) {\n}\n';

  function typeDoc(el, id) {
    const type = () => OV.res('type', id);
    function render() {
      const t = type(), P = OV.project; if (!t) return;
      const top = el.scrollTop; el.textContent = '';
      /* --- look --- */
      const look = h('div', { class: 'type-col' });
      const preview = h('div', { class: 'type-preview' }, OV.thumb(t, 72));
      look.append(h('div', { class: 'type-top' }, preview, h('div', { class: 'type-top-fields' },
        ui.text('Name', () => t.name, v => (t.name = v), { max: 40, code: true, resync: true }),
        ui.select('Kind', OV.KINDS, () => t.kind, v => (t.kind = v), { hard: false }))));
      look.querySelector('input').addEventListener('change', () => { OV.beginEdit(); t.name = OV.uniqueName(OV.ident(t.name, 'Object'), P.types.filter(x => x !== t).map(x => x.name)); OV.endEdit(true); });
      const lookSec = ui.section('Look',
        ui.select('Drawn as', [['sprite', 'Sprite (pixel art, can animate)'], ['shape', 'Plain shape'], ['glyph', 'Emoji or symbol'], ['text', 'Text (score, labels)']], () => t.look, v => { t.look = v; if (v === 'text' && t.w < 40) { t.w = 96; t.h = 12; } }));
      if (t.look === 'sprite') {
        lookSec.append(ui.select('Sprite', [['', '(choose)']].concat(P.sprites.map(s => [s.id, s.name])), () => t.spriteId || '', v => { t.spriteId = v || null; const s = OV.byId(P.sprites, v); if (s) { t.w = s.w; t.h = s.h; } }),
          h('div', { class: 'row', style: { marginTop: '8px' } },
            t.spriteId && OV.byId(P.sprites, t.spriteId) ? ui.btn('Edit sprite', () => OV.open('sprite', t.spriteId), 'small') : null,
            ui.btn('New sprite', () => { let s; OV.edit(() => { s = M.newSprite(P, t.name, 16, 16); t.spriteId = s.id; t.w = 16; t.h = 16; }); OV.open('sprite', s.id); }, 'small')));
      } else if (t.look === 'shape') lookSec.append(ui.grid(ui.select('Shape', [['rect', 'Rectangle'], ['circle', 'Circle']], () => t.shape, v => (t.shape = v)), ui.color('Colour', () => t.color, v => (t.color = v))));
      else if (t.look === 'glyph') lookSec.append(ui.grid(ui.text('Emoji or symbol', () => t.glyph, v => (t.glyph = v.trim()), { max: 8 }), ui.color('Colour (symbols)', () => t.color, v => (t.color = v))));
      else lookSec.append(ui.area('Text', () => t.text.value, v => (t.text.value = v), { rows: 2 }),
        h('p', { class: 'muted small', style: { margin: '4px 0 8px' }, text: 'Curly braces insert a value: Score: {score}   HP: {Player.hp}   {hearts(Player)}' }),
        ui.grid(ui.num('Size', () => t.text.size, v => (t.text.size = OV.clamp(v, 4, 96))), ui.color('Colour', () => t.text.color, v => (t.text.color = v)),
          ui.select('Align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], () => t.text.align, v => (t.text.align = v), { hard: false }), ui.check('Dark outline', () => t.text.outline !== false, v => (t.text.outline = v))));
      lookSec.append(h('div', { style: { marginTop: '8px' } }, ui.grid(ui.num('Width', () => t.w, v => (t.w = Math.max(1, v))), ui.num('Height', () => t.h, v => (t.h = Math.max(1, v))))));
      look.append(lookSec);
      const vars = h('div', { class: 'var-list' });
      t.vars.forEach((v, k) => vars.append(varRow(v, () => OV.edit(() => t.vars.splice(k, 1)))));
      look.append(ui.section('Variables', vars, ui.btn('+ Add a variable', () => OV.edit(() => t.vars.push({ name: OV.uniqueName('value', t.vars.map(v => v.name)), value: 0 })), 'small'),
        h('p', { class: 'muted small', style: { margin: '8px 0 0' }, text: 'Each copy gets its own. Use them as ' + t.name + '.value in events or this.value in the script.' })));

      /* --- behaviours --- */
      const beh = h('div', { class: 'type-col' });
      const list = h('div', { class: 'beh-list' });
      t.behaviors.forEach((b, k) => {
        const d = OV.behaviorDef(b.type); if (!d) return;
        const card = h('div', { class: 'beh' }, h('div', { class: 'beh-head' }, h('b', { text: d.label }), h('button', { class: 'btn icon small ghost', type: 'button', 'aria-label': 'Remove ' + d.label, onclick: () => OV.edit(() => t.behaviors.splice(k, 1)), text: '✕' })),
          h('p', { class: 'muted small', text: d.desc }));
        if (d.params.length) {
          const checks = d.params.filter(p => p.type === 'bool'), rest = d.params.filter(p => p.type !== 'bool');
          const fld = p => OV.paramField(p, () => (b[p.key] == null ? p.def : b[p.key]), v => (b[p.key] = v), { bullet: p.key === 'bullet' });
          if (rest.length) card.append(ui.grid(rest.map(p => { const f = fld(p); if (p.type === 'area' || p.type === 'text') f.classList.add('wide'); return f; })));
          if (checks.length) card.append(h('div', { class: 'beh-checks' }, checks.map(fld)));
        }
        list.append(card);
      });
      if (!t.behaviors.length) list.append(h('p', { class: 'muted', text: 'No behaviours yet. They are ready-made abilities: no code needed.' }));
      const addBtn = ui.btn('+ Add a behaviour', () => {
        const items = []; let group = '';
        OV.BEHAVIORS.forEach(d => { if (d.group !== group) { group = d.group; items.push({ heading: group }); } items.push({ label: d.label, disabled: t.behaviors.some(b => b.type === d.key), onClick: () => OV.edit(() => t.behaviors.push(OV.newBehavior(d.key))) }); });
        OV.menu(addBtn, items);
      }, 'primary');
      beh.append(ui.section('Behaviours', list, addBtn));
      const spr = t.look === 'sprite' ? OV.byId(P.sprites, t.spriteId) : null;
      if (spr && spr.anims.some(a => a.name === 'idle') && spr.anims.some(a => a.name === 'walk')) beh.append(h('p', { class: 'muted small', text: 'This sprite has "idle" and "walk" animations, so it switches between them and faces the way it moves on its own.' }));

      /* --- script --- */
      const scr = h('div', { class: 'type-col wide' });
      const err = OV.Debug.scriptError(t.id);
      const sec = ui.section('Script (optional JavaScript)');
      if (err) sec.append(h('div', { class: 'script-error', role: 'alert', text: (err.line ? 'Line ' + err.line + ': ' : '') + err.message }));
      if (!t.script) sec.append(h('p', { class: 'muted small', style: { margin: '0 0 8px' }, text: 'Behaviours and event sheets cover most things. Add a script when you want this object to do something special.' }),
        ui.btn('Add a script', () => { OV.edit(() => (t.script = STARTER)); const ta = el.querySelector('.script-box'); if (ta) ta.focus(); }, 'small'));
      else { const f = ui.area(null, () => t.script, v => (t.script = v), { rows: 16, code: true }); f.querySelector('textarea').classList.add('script-box'); f.querySelector('textarea').addEventListener('blur', () => { if (!t.script.trim()) { OV.beginEdit(); t.script = ''; OV.endEdit(true); } }); sec.append(f); }
      sec.append(h('details', { class: 'helpers' }, h('summary', { text: 'What you can use in scripts and expressions' }),
        h('table', { class: 'help-table' }, h('tbody', null, HELPERS.map(r => h('tr', null, h('td', null, h('code', { text: r[0] })), h('td', { text: r[1] })))))));
      scr.append(sec);
      el.append(h('div', { class: 'type-grid' }, look, beh, scr));
      el.scrollTop = top;
    }
    render();
    return {
      refresh: render,
      touch() { const t = type(), pv = el.querySelector('.type-preview'); if (t && pv) { pv.textContent = ''; pv.append(OV.thumb(t, 72)); } },
      destroy() {},
    };
  }
  OV.docs.type = { mount: typeDoc };

  /* ================= sprite and tileset documents (the pixel editors) ================= */
  OV.docs.sprite = {
    mount(el, id) {
      const spr = OV.res('sprite', id); let before = null;
      const ed = OV.SpriteEditor.mount(el, spr, {
        palette: OV.Assets.PALETTE,
        begin() { OV.beginEdit(); before = { w: spr.w, h: spr.h }; },
        commit() {
          if (before && (before.w !== spr.w || before.h !== spr.h)) OV.project.types.forEach(t => { if (t.look === 'sprite' && t.spriteId === spr.id && t.w === before.w && t.h === before.h) { t.w = spr.w; t.h = spr.h; } });
          OV.endEdit(); OV.Tree.later();
        },
      });
      return { refresh: () => ed.refresh(), destroy: () => ed.destroy() };
    },
  };
  OV.docs.tileset = {
    mount(el, id) {
      const ts = OV.res('tileset', id);
      const ed = OV.TilesetEditor.mount(el, ts, {
        palette: OV.Assets.PALETTE, begin: () => OV.beginEdit(),
        commit() { OV.project.rooms.forEach(r => M.fitRoomLayers(OV.project, r)); OV.endEdit(); OV.RoomEditor.invalidate(); OV.Tree.later(); },
      });
      return { refresh: () => ed.refresh(), destroy: () => ed.destroy() };
    },
  };
})();
