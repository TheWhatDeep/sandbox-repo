/* Overhead Studio: the Project panel. Lists everything in the project and lets you add,
   rename, duplicate and delete things. Click selects, double-click (or a second tap) opens. */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, M = OV.Model, S = OV.state, RT = OV.Runtime;

  /* A small picture of an object type, sprite or tileset. */
  OV.thumb = (what, size) => {
    size = size || 22;
    const c = h('canvas', { class: 'thumb', width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
    const x = c.getContext('2d'), P = OV.project; x.imageSmoothingEnabled = false;
    if (what.tw) { // tileset
      const im = RT.image(what.src); if (RT.ready(im)) x.drawImage(im, 0, 0, Math.min(im.naturalWidth, what.tw * 2), Math.min(im.naturalHeight, what.th * 2), 0, 0, size * 2, size * 2);
      return c;
    }
    let type = what, spr = null;
    if (what.anims) { spr = what; type = { id: '_', look: 'sprite', spriteId: spr.id, w: spr.w, h: spr.h }; }
    else if (type.look === 'sprite') spr = OV.byId(P.sprites, type.spriteId);
    const env = { types: { [type.id]: type }, sprites: spr ? { [spr.id]: spr } : {}, pixel: false, editor: true };
    const w = type.look === 'text' ? size : type.w, hh = type.look === 'text' ? size : type.h, k = (size * 2 - 4) / Math.max(w, hh, 1);
    x.translate(size, size); x.scale(k, k);
    if (type.look === 'text') { x.fillStyle = type.text.color || '#fff'; x.font = '700 ' + size * 0.8 + 'px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted'); x.fillText('T', 0, 1); return c; }
    const ox = spr ? (spr.ox / spr.w - 0.5) * w : 0, oy = spr ? (spr.oy / spr.h - 0.5) * hh : 0;
    RT.drawInst(x, { t: type.id, x: ox, y: oy, w: w, h: hh }, env, 0);
    return c;
  };

  const reId = ev => { ev.id = OV.uid('e'); ev.conds.forEach(c => (c.id = OV.uid('c'))); ev.acts.forEach(a => (a.id = OV.uid('c'))); (ev.sub || []).forEach(reId); };
  OV.reIdEvent = reId;

  function rename(kind, r) {
    const isType = kind === 'type';
    OV.ask('Rename ' + r.name, r.name, { help: isType ? 'Letters, digits and underscores only, so scripts can use the name. Scripts that use the old name will need updating.' : '' }).then(v => {
      if (v == null || !v.trim()) return;
      const taken = OV.resList(kind).filter(x => x !== r).map(x => x.name);
      OV.edit(() => { r.name = OV.uniqueName(isType ? OV.ident(v) : v.trim(), taken); });
    });
  }
  function duplicate(kind, r) {
    OV.edit(() => {
      const c = OV.clone(r), list = OV.resList(kind);
      c.id = OV.uid(kind[0]); c.name = OV.uniqueName(r.name, list.map(x => x.name));
      if (kind === 'room') c.layers.forEach(L => { L.id = OV.uid('l'); if (L.instances) L.instances.forEach(i => (i.id = OV.uid('i'))); });
      if (kind === 'sheet') c.events.forEach(reId);
      if (kind === 'type') c.behaviors.forEach(b => (b.id = OV.uid('b')));
      list.splice(list.indexOf(r) + 1, 0, c);
      S.sel = { kind: kind, id: c.id }; if (kind === 'type') S.stampType = c.id;
    });
  }
  function remove(kind, r) {
    const P = OV.project;
    if (kind === 'room' && P.rooms.length === 1) { OV.toast('A game needs at least one room.'); return; }
    OV.edit(() => {
      if (kind === 'type') M.deleteType(P, r.id);
      else P[{ room: 'rooms', sprite: 'sprites', tileset: 'tilesets', sound: 'sounds', sheet: 'sheets' }[kind]] = OV.resList(kind).filter(x => x !== r);
    });
    OV.toast('Deleted ' + r.name + '. Undo brings it back.');
  }
  function itemMenu(kind, r, anchor) {
    const P = OV.project, items = [];
    if (OV.docs[kind]) items.push({ label: kind === 'room' ? 'Open' : 'Edit', onClick: () => OV.open(kind, r.id) });
    items.push({ label: 'Rename', onClick: () => rename(kind, r) }, { label: 'Duplicate', onClick: () => duplicate(kind, r) });
    if (kind === 'room' && P.settings.startRoom !== r.id) items.push({ label: 'Make this the start room', onClick: () => OV.edit(() => (P.settings.startRoom = r.id)) });
    items.push({ sep: true }, { label: 'Delete', danger: true, onClick: () => remove(kind, r) });
    OV.menu(anchor, items);
  }

  /* ----- "+" menus ----- */
  function addRoom() { OV.edit(() => { const r = M.newRoom(OV.project, 'Room'); S.sel = { kind: 'room', id: r.id }; setTimeout(() => OV.open('room', r.id), 0); }); }
  function addType(anchor) {
    const items = [{ label: 'New empty object', onClick: () => { let t; OV.edit(() => { t = M.newType(OV.project, { name: 'Object' }); S.sel = { kind: 'type', id: t.id }; S.stampType = t.id; }); OV.open('type', t.id); } }, { heading: 'Ready-made' }];
    OV.Library.forEach(L => items.push({ label: L.label, onClick: () => { let t; OV.edit(() => { t = L.make(OV.project); S.sel = { kind: 'type', id: t.id }; S.stampType = t.id; }); OV.toast('Added ' + t.name + '. Pick the Place tool to put it in a room.'); } }));
    OV.menu(anchor, items);
  }
  function addSprite(anchor) {
    const items = [{ label: 'New blank sprite', onClick: () => { let s; OV.edit(() => { s = M.newSprite(OV.project, 'Sprite', 16, 16); S.sel = { kind: 'sprite', id: s.id }; }); OV.open('sprite', s.id); } }, { heading: 'Built-in art' }];
    OV.Assets.sprites().forEach(a => items.push({ label: a.name, onClick: () => OV.edit(() => { const s = OV.Sample.sprite(OV.project, a.id); S.sel = { kind: 'sprite', id: s.id }; }) }));
    OV.menu(anchor, items);
  }
  function addTileset(anchor) {
    OV.menu(anchor, [
      { label: 'New blank tileset', onClick: () => { let t; OV.edit(() => { t = M.newTileset(OV.project, 'Tileset'); S.sel = { kind: 'tileset', id: t.id }; }); OV.open('tileset', t.id); } },
      { label: 'Built-in: Basic tiles', onClick: () => OV.edit(() => { const t = OV.Sample.tileset(OV.project, true); S.sel = { kind: 'tileset', id: t.id }; }) },
    ]);
  }
  function addSound(anchor) {
    const items = [{ heading: 'Make a sound' }];
    Object.keys(OV.SOUND_PRESETS).forEach(k => items.push({ label: OV.SOUND_PRESETS[k].label, onClick: () => { let s; OV.edit(() => { s = OV.Sample.sound(OV.project, k, true); S.sel = { kind: 'sound', id: s.id }; }); RT.audio.play(s); } }));
    items.push({ sep: true }, { label: 'Import an audio file…', onClick: async () => {
      const f = await OV.pickFile('audio/*'); if (!f) return;
      if (f.size > 3e6) { OV.toast('That file is over 3 MB. Shorter or compressed audio keeps the game light.'); return; }
      const src = await OV.readFile(f);
      OV.edit(() => { const s = { id: OV.uid('snd'), name: OV.uniqueName(OV.ident(f.name.replace(/\.[^.]+$/, ''), 'Sound'), OV.project.sounds.map(x => x.name)), kind: 'file', src: src, vol: 0.8 }; OV.project.sounds.push(s); S.sel = { kind: 'sound', id: s.id }; });
    } });
    OV.menu(anchor, items);
  }
  function addSheet() { let s; OV.edit(() => { s = M.newSheet(OV.project, 'Events'); S.sel = { kind: 'sheet', id: s.id }; }); OV.open('sheet', s.id); }

  /* ----- dragging an object type onto the room (mouse) ----- */
  function startDrag(e, type) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null;
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { ghost = OV.thumb(type, 32); ghost.classList.add('drag-ghost'); document.body.append(ghost); }
      if (ghost) ghost.style.transform = 'translate(' + ev.clientX + 'px,' + ev.clientY + 'px)';
    };
    const up = ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!ghost) return; ghost.remove();
      if (OV.RoomEditor && OV.RoomEditor.dropAt) OV.RoomEditor.dropAt(type.id, ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  const collapsed = new Set();
  function section(title, kind, list, onAdd, extra) {
    const P = OV.project, shut = collapsed.has(kind);
    const box = h('div', { class: 'tree-sec' },
      h('div', { class: 'tree-head' }, h('button', { class: 'tree-toggle', type: 'button', 'aria-expanded': String(!shut), onclick: () => { if (shut) collapsed.delete(kind); else collapsed.add(kind); OV.Tree.render(); } }, h('span', { class: 'caret', text: shut ? '▸' : '▾' }), h('h2', { class: 'label', text: title }), shut ? h('span', { class: 'count', text: String(list.length) }) : null), onAdd ? h('button', { class: 'btn icon small ghost', type: 'button', title: 'Add', 'aria-label': 'Add to ' + title, onclick: e => onAdd(e.currentTarget), text: '+' }) : null));
    if (shut) return box;
    list.forEach(r => {
      const sel = S.sel && S.sel.kind === kind && S.sel.id === r.id;
      const open = S.doc && S.doc.kind === kind && S.doc.id === r.id;
      const stamp = kind === 'type' && S.stampType === r.id;
      const icon = kind === 'type' || kind === 'sprite' || kind === 'tileset' ? OV.thumb(r, 20) : h('span', { class: 'tree-icon', text: OV.ICON[kind] });
      const row = h('div', { class: 'tree-item' + (sel ? ' selected' : '') + (open ? ' open' : '') + (stamp ? ' stamp' : ''), role: 'button', tabindex: 0 }, icon, h('span', { class: 'tree-name', text: r.name }),
        kind === 'room' && P.settings.startRoom === r.id ? h('span', { class: 'badge', title: 'The game starts here', text: 'start' }) : null,
        extra ? extra(r) : null,
        h('button', { class: 'tree-more', type: 'button', 'aria-label': 'More for ' + r.name, onclick: e => { e.stopPropagation(); itemMenu(kind, r, e.currentTarget); }, text: '⋯' }));
      row.addEventListener('click', () => { if (sel && OV.isTouch && OV.docs[kind]) OV.open(kind, r.id); else OV.select({ kind: kind, id: r.id }); });
      row.addEventListener('dblclick', () => OV.open(kind, r.id));
      row.addEventListener('keydown', e => { if (e.key === 'Enter') OV.open(kind, r.id); });
      row.addEventListener('contextmenu', e => { e.preventDefault(); itemMenu(kind, r, { x: e.clientX, y: e.clientY }); });
      if (kind === 'type') row.addEventListener('pointerdown', e => startDrag(e, r));
      box.append(row);
    });
    if (!list.length) box.append(h('div', { class: 'tree-empty muted small', text: 'None yet' }));
    return box;
  }

  let timer = 0;
  OV.Tree = {
    later() { clearTimeout(timer); timer = setTimeout(OV.Tree.render, 120); },
    render() {
      const P = OV.project, root = OV.$('#tree'); if (!P || !root) return;
      const top = root.parentElement.scrollTop;
      root.textContent = '';
      root.append(
        section('Rooms', 'room', P.rooms, addRoom),
        section('Objects', 'type', P.types, addType, t => { const n = M.countInstances(P, t.id); return n ? h('span', { class: 'count', text: String(n) }) : null; }),
        section('Sprites', 'sprite', P.sprites, addSprite),
        section('Tilesets', 'tileset', P.tilesets, addTileset),
        section('Sounds', 'sound', P.sounds, addSound),
        section('Event sheets', 'sheet', P.sheets, addSheet));
      const gsel = S.sel && S.sel.kind === 'globals';
      const g = h('div', { class: 'tree-sec' }, h('div', { class: 'tree-head' }, h('h2', { class: 'label', text: 'Game' })),
        h('div', { class: 'tree-item' + (gsel ? ' selected' : ''), role: 'button', tabindex: 0, onclick: () => OV.select({ kind: 'globals' }) }, h('span', { class: 'tree-icon', text: 'x=' }), h('span', { class: 'tree-name', text: 'Global variables' }), h('span', { class: 'count', text: String(P.globals.length) })),
        h('div', { class: 'tree-item' + (S.sel && S.sel.kind === 'project' ? ' selected' : ''), role: 'button', tabindex: 0, onclick: () => OV.select({ kind: 'project' }) }, h('span', { class: 'tree-icon', text: '⚙' }), h('span', { class: 'tree-name', text: 'Game settings' })));
      root.append(g);
      root.parentElement.scrollTop = top;
    },
  };
})();
