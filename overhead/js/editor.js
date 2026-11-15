/* Overhead Studio: the editor shell. Holds the open project, undo history, document tabs,
   selection, Play mode, and the File dialog (projects, export, backup). */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, M = OV.Model, $ = OV.$;
  const S = (OV.state = { tabs: [], doc: null, sel: null, stampType: null, playing: false });
  OV.project = null;
  OV.docs = OV.docs || {};
  let undoStack = [], redoStack = [], pending = null, saveTimer = 0, docApi = null, runtime = null;

  const RES = { room: 'rooms', type: 'types', sprite: 'sprites', tileset: 'tilesets', sound: 'sounds', sheet: 'sheets' };
  OV.res = (kind, id) => (RES[kind] ? OV.byId(OV.project[RES[kind]], id) : null);
  OV.resList = kind => OV.project[RES[kind]];

  /* ---------------- undo / redo ---------------- */
  OV.beginEdit = () => { if (pending === null && OV.project) pending = M.pack(OV.project); };
  OV.endEdit = hard => {
    let changed = false;
    if (pending !== null) {
      if (M.pack(OV.project) !== pending) { undoStack.push(pending); if (undoStack.length > 120) undoStack.shift(); redoStack = []; changed = true; }
      pending = null;
    }
    if (changed) scheduleSave();
    updateUndo();
    if (hard) OV.refresh(); else if (changed) OV.emit('soft');
  };
  // Run a change as one undo step and rebuild the panels.
  OV.edit = fn => { OV.beginEdit(); fn(); OV.endEdit(true); };
  OV.touch = () => { if (docApi && docApi.touch) docApi.touch(); OV.emit('touch'); };
  OV.Runtime.setImageHook(() => { OV.touch(); if (OV.Tree) OV.Tree.later(); });

  // Put a snapshot back while keeping the same objects for resources that still exist,
  // so open editors keep working on the object they already hold.
  function restore(str) {
    const fresh = M.unpack(str), P = OV.project;
    Object.keys(RES).forEach(kind => {
      const k = RES[kind], old = new Map(P[k].map(o => [o.id, o]));
      P[k] = fresh[k].map(n => { const o = old.get(n.id); if (!o) return n; Object.keys(o).forEach(key => delete o[key]); return Object.assign(o, n); });
    });
    P.name = fresh.name; P.settings = fresh.settings; P.globals = fresh.globals;
    $('#project-name').value = P.name;
    scheduleSave(); updateUndo(); OV.refresh();
  }
  OV.undo = () => { OV.endEdit(); if (!undoStack.length || S.playing) return; redoStack.push(M.pack(OV.project)); restore(undoStack.pop()); };
  OV.redo = () => { OV.endEdit(); if (!redoStack.length || S.playing) return; undoStack.push(M.pack(OV.project)); restore(redoStack.pop()); };
  function updateUndo() { $('#btn-undo').disabled = !undoStack.length; $('#btn-redo').disabled = !redoStack.length; }

  /* ---------------- saving ---------------- */
  function scheduleSave() {
    clearTimeout(saveTimer);
    const st = $('#save-status'); st.textContent = 'Saving…'; st.classList.remove('bad');
    saveTimer = setTimeout(saveNow, 700);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    const st = $('#save-status'), ok = await OV.Store.save(OV.project);
    if (ok) { st.textContent = 'Saved in this browser'; st.classList.remove('bad'); }
    else { st.textContent = 'Not saved. Use File → Back up'; st.classList.add('bad'); }
    OV.Store.setLast(OV.project.id);
  }

  /* ---------------- documents (tabs) ---------------- */
  const ICON = { room: '▦', type: '◆', sprite: '✎', tileset: '▤', sheet: '≡', sound: '♪' };
  OV.ICON = ICON;
  function renderTabs() {
    const bar = $('#tabbar'); bar.textContent = '';
    S.tabs.forEach(t => {
      const r = OV.res(t.kind, t.id); if (!r) return;
      const active = S.doc && S.doc.kind === t.kind && S.doc.id === t.id;
      const tab = h('div', { class: 'tab' + (active ? ' active' : ''), role: 'tab', 'aria-selected': String(active) },
        h('button', { class: 'tab-main', type: 'button', onclick: () => OV.open(t.kind, t.id) }, h('span', { class: 'tab-icon', text: ICON[t.kind] || '' }), h('span', { class: 'tab-name', text: r.name })),
        h('button', { class: 'tab-close', type: 'button', 'aria-label': 'Close ' + r.name, onclick: e => { e.stopPropagation(); OV.closeTab(t.kind, t.id); }, text: '✕' }));
      bar.append(tab);
    });
  }
  function mountDoc() {
    if (docApi && docApi.destroy) docApi.destroy();
    docApi = null;
    const el = $('#doc'); el.textContent = ''; el.className = 'doc';
    if (!S.doc) {
      el.append(h('div', { class: 'empty-doc' }, h('p', { class: 'empty-title', text: 'Nothing open' }), h('p', { class: 'muted', text: 'Pick a room, object, sprite or event sheet from the Project panel.' })));
    } else {
      const def = OV.docs[S.doc.kind];
      el.classList.add('doc-' + S.doc.kind);
      docApi = def.mount(el, S.doc.id) || null;
    }
    OV.Layers && OV.Layers.render();
  }
  OV.open = (kind, id) => {
    if (!OV.res(kind, id) || !OV.docs[kind]) return;
    if (!S.tabs.some(t => t.kind === kind && t.id === id)) S.tabs.push({ kind: kind, id: id });
    const same = S.doc && S.doc.kind === kind && S.doc.id === id;
    S.doc = { kind: kind, id: id };
    if (kind === 'room') S.lastRoom = id;
    if (!same) mountDoc();
    renderTabs(); OV.Props.render();
    if (matchMedia('(max-width: 860px)').matches) $('#app').dataset.focus = 'doc';
  };
  OV.closeTab = (kind, id) => {
    const i = S.tabs.findIndex(t => t.kind === kind && t.id === id); if (i < 0) return;
    S.tabs.splice(i, 1);
    if (S.doc && S.doc.kind === kind && S.doc.id === id) { S.doc = S.tabs[Math.max(0, i - 1)] ? Object.assign({}, S.tabs[Math.max(0, i - 1)]) : null; mountDoc(); }
    renderTabs(); OV.Props.render();
  };
  OV.docApi = () => docApi;
  OV.runtime = () => runtime;
  OV.currentRoom = () => (S.doc && S.doc.kind === 'room' ? OV.res('room', S.doc.id) : null);

  /* ---------------- selection ---------------- */
  OV.select = sel => {
    S.sel = sel || null;
    if (sel && sel.kind === 'type') S.stampType = sel.id;
    OV.Tree.render(); OV.Props.render(); OV.touch();
  };

  /* ---------------- refresh everything after a structural change ---------------- */
  OV.refresh = () => {
    const P = OV.project;
    S.tabs = S.tabs.filter(t => OV.res(t.kind, t.id));
    if (S.doc && !OV.res(S.doc.kind, S.doc.id)) { S.doc = S.tabs[0] ? Object.assign({}, S.tabs[0]) : null; mountDoc(); }
    if (S.sel) {
      if (S.sel.kind === 'inst') { S.sel.ids = S.sel.ids.filter(id => M.findInstance(P, id)); if (!S.sel.ids.length) S.sel = null; }
      else if (RES[S.sel.kind] && !OV.res(S.sel.kind, S.sel.id)) S.sel = null;
    }
    if (S.stampType && !OV.res('type', S.stampType)) S.stampType = null;
    if (!OV.byId(P.rooms, P.settings.startRoom)) P.settings.startRoom = P.rooms[0] ? P.rooms[0].id : null;
    renderTabs(); OV.Tree.render();
    if (docApi && docApi.refresh) docApi.refresh();
    OV.Props.render(); OV.Layers.render();
  };
  OV.on('soft', () => { renderTabs(); OV.Tree.render(); });

  /* ---------------- loading a project ---------------- */
  OV.setProject = (p, opts) => {
    if (S.playing) OV.stop();
    OV.project = M.normalize(p);
    undoStack = []; redoStack = []; pending = null;
    S.tabs = []; S.doc = null; S.sel = null; S.stampType = null;
    $('#project-name').value = OV.project.name;
    const start = OV.byId(OV.project.rooms, OV.project.settings.startRoom) || OV.project.rooms[0];
    OV.Tree.render();
    if (start) OV.open('room', start.id); else { mountDoc(); renderTabs(); OV.Props.render(); }
    updateUndo();
    OV.Debug.clear();
    if (!opts || opts.save !== false) saveNow(); else $('#save-status').textContent = 'Saved in this browser';
    OV.Store.setLast(OV.project.id);
  };

  /* ---------------- play mode ---------------- */
  OV.play = fromStart => {
    if (S.playing) return;
    OV.endEdit();
    const P = OV.project;
    if (!P.rooms.length) { OV.toast('Add a room first.'); return; }
    const room = (!fromStart && (OV.currentRoom() || OV.res('room', S.lastRoom))) || OV.byId(P.rooms, P.settings.startRoom) || P.rooms[0];
    S.playing = true; $('#app').dataset.mode = 'play';
    $('#btn-play').innerHTML = '■ <span class="hide-narrow">Stop</span>';
    $('#game').hidden = false;
    OV.Debug.start(room);
    runtime = OV.Runtime.start({
      canvas: $('#game-canvas'), project: P, units: OV.compile(P), engineSrc: '(' + OV.engineMain.toString() + ')()', roomId: room.id, debug: true,
      onLog: t => OV.Debug.log('log', t), onError: e => OV.Debug.error(e),
      onState: (st, msg) => { if (st === 'won') OV.Debug.log('ok', msg || 'You win!'); else if (st === 'lost') OV.Debug.log('info', msg || 'Game over'); },
      onFrame: (f, info) => OV.Debug.frame(f, info), onPick: id => OV.Debug.picked(id), onExit: OV.stop,
    });
    OV.Debug.attach(runtime);
    $('#game-canvas').focus({ preventScroll: true });
    if (matchMedia('(max-width: 860px)').matches) $('#app').dataset.focus = 'doc';
  };
  OV.stop = () => {
    if (!S.playing) return;
    runtime.stop(); runtime = null; S.playing = false;
    $('#app').dataset.mode = 'edit'; $('#game').hidden = true;
    $('#btn-play').innerHTML = '▶ <span class="hide-narrow">Play</span>';
    OV.Debug.stop(); OV.touch();
  };

  /* ---------------- export ---------------- */
  const safeName = () => (OV.project.name || 'game').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'game';
  function exportHtml() {
    const P = OV.project, esc = s => s.replace(/<\/(script)/gi, '<\\/$1');
    const js = v => JSON.stringify(v).replace(/<\//g, '<\\/').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
    const game = OV.clone(P); game.types.forEach(t => (t.script = ''));
    const title = (P.name || 'Game').replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'));
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
      '<title>' + title + '</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&display=swap">' +
      '<style>html,body{margin:0;height:100%;background:#07080b;overflow:hidden}canvas{display:block;width:100vw;height:100vh;height:100dvh;touch-action:none;outline:none}</style></head><body>' +
      '<canvas id="game" tabindex="0"></canvas>\n<script>\nvar OVRuntime = (' + esc(OV.runtimeFactory.toString()) + ')();\n' +
      'OVRuntime.start({ canvas: document.getElementById("game"), project: ' + js(game) + ', units: ' + js(OV.compile(P)) + ', engineSrc: ' + js('(' + OV.engineMain.toString() + ')()') +
      ', onError: function (e) { console.error(e.name || "", e.message); }, onLog: function (t) { console.log(t); } });\n<\/script>\n</body></html>';
  }
  OV.exportHtml = exportHtml;
  function download(name, text, type) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: type }));
      const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) { OV.toast('Downloads are blocked here. Use Copy instead.'); }
  }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); OV.toast(what + ' copied'); }
    catch (e) { OV.toast('Copy is blocked here. Open the editor file directly to export.'); }
  }

  /* ---------------- File dialog ---------------- */
  async function fileDialog() {
    const P = OV.project, list = await OV.Store.list();
    const projects = h('div', { class: 'proj-list' });
    let modal;
    const open = async id => { const p = await OV.Store.load(id); if (p) { await saveNow(); modal.close(); OV.setProject(p, { save: false }); OV.toast('Opened ' + p.name); } };
    list.forEach(m => {
      const cur = m.id === P.id;
      projects.append(h('div', { class: 'proj-row' + (cur ? ' current' : '') },
        h('div', { class: 'proj-name' }, h('b', { text: m.name || 'Untitled' }), h('span', { class: 'muted small', text: cur ? 'Open now' : new Date(m.updated).toLocaleString() })),
        cur ? null : OV.ui.btn('Open', () => open(m.id), 'small'),
        cur ? null : OV.ui.btn('Delete', async () => { if (await OV.confirm('Delete "' + m.name + '" from this browser? This cannot be undone.', 'Delete', true)) { await OV.Store.remove(m.id); modal.close(); fileDialog(); } }, 'small danger')));
    });
    if (!list.length) projects.append(h('p', { class: 'muted', text: 'No saved projects yet.' }));
    const fresh = (make, msg) => async () => { await saveNow(); modal.close(); OV.setProject(make()); OV.toast(msg); };
    const body = h('div', null,
      OV.ui.section('Projects in this browser', projects,
        h('div', { class: 'row', style: { marginTop: '10px' } },
          OV.ui.btn('New: dungeon sample', fresh(() => OV.Sample.dungeon(), 'Loaded the dungeon sample')),
          OV.ui.btn('New: starter kit', fresh(() => OV.Sample.starter(), 'Started a project with the starter kit')),
          OV.ui.btn('New: blank', fresh(() => OV.Sample.blank(), 'Started a blank project'))),
        h('p', { class: 'muted small', style: { margin: '8px 0 0' }, text: 'The starter kit comes with ready-made sprites, tiles, sounds and object types in an empty room. Blank has only a room.' })),
      OV.ui.section('Export the game',
        h('p', { class: 'modal-text', text: 'One HTML file with the whole game inside. It runs in any browser with no editor attached.' }),
        h('div', { class: 'row' }, OV.ui.btn('Download .html', () => download(safeName() + '.html', exportHtml(), 'text/html'), 'primary'), OV.ui.btn('Copy HTML', () => copy(exportHtml(), 'Game HTML')))),
      OV.ui.section('Back up or move this project',
        h('p', { class: 'modal-text', text: 'A backup file holds everything: art, rooms, events. Open it on another device to carry on there.' }),
        h('div', { class: 'row' },
          OV.ui.btn('Download backup', () => download(safeName() + '.overhead.json', JSON.stringify(P), 'application/json')),
          OV.ui.btn('Copy backup', () => copy(JSON.stringify(P), 'Backup')),
          OV.ui.btn('Open a backup file…', async () => {
            const f = await OV.pickFile('.json,application/json'); if (!f) return;
            try { const p = M.normalize(JSON.parse(await OV.readFile(f, 'text'))); p.id = OV.uid('p'); await saveNow(); modal.close(); OV.setProject(p); OV.toast('Opened ' + f.name); }
            catch (err) { OV.toast('Could not open that file. ' + err.message); }
          }))),
      h('p', { class: 'muted small', style: { margin: '10px 0 0' }, text: 'Downloads do not work inside the Claude preview. Use the Copy buttons there.' }));
    modal = OV.modal({ title: 'File', content: body, wide: true });
  }

  /* ---------------- keyboard ---------------- */
  const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
  window.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); OV.endEdit(); saveNow(); OV.toast('Saved'); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); S.playing ? OV.stop() : OV.play(e.shiftKey); return; }
    if (S.playing || OV.modalOpen()) return;
    if (mod && k === 'z') { if (typing(e) && e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') return; e.preventDefault(); e.shiftKey ? OV.redo() : OV.undo(); return; }
    if (mod && k === 'y') { if (typing(e)) return; e.preventDefault(); OV.redo(); return; }
    if (typing(e)) return;
    if (docApi && docApi.key) docApi.key(e);
  });
  window.addEventListener('keyup', e => { if (docApi && docApi.keyup) docApi.keyup(e); });

  /* ---------------- dropping files onto the editor ---------------- */
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  const veil = on => { let v = $('#drop-veil'); if (!v) { v = h('div', { id: 'drop-veil', class: 'drop-veil', hidden: true }, h('div', { text: 'Drop to import' })); document.body.append(v); } v.hidden = !on; };
  window.addEventListener('dragenter', e => { if (!hasFiles(e) || S.playing) return; e.preventDefault(); dragDepth++; veil(true); });
  window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = S.playing ? 'none' : 'copy'; });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) veil(false); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; veil(false);
    if (S.playing || OV.modalOpen()) return;
    const files = Array.from(e.dataTransfer.files || []); if (!files.length) return;
    // On the drawing area of an open sprite, pictures become frames. Anywhere else they go through the Import dialog.
    const at = document.elementFromPoint(e.clientX, e.clientY), onCanvas = at && at.closest && at.closest('.pxe-stage') && S.doc && S.doc.kind === 'sprite';
    const pics = files.every(f => ['image', 'gif'].includes(OV.Importers.kindOf(f)));
    if (onCanvas && pics && docApi && docApi.dropFiles) docApi.dropFiles(files); else OV.Importers.run(files);
  });

  /* ---------------- boot ---------------- */
  // On phones the panel tabs also work as a toggle: tap the open tab again to give the document the whole screen.
  function showPanel(id) {
    const app = $('#app'), cur = document.querySelector('.workspace .panel.is-active');
    app.dataset.focus = cur && cur.id === id && app.dataset.focus !== 'doc' ? 'doc' : 'panel';
    document.querySelectorAll('.workspace .panel').forEach(p => p.classList.toggle('is-active', p.id === id));
    document.querySelectorAll('.mobile-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    OV.touch();
  }
  OV.showPanel = showPanel;
  async function boot() {
    $('#btn-undo').addEventListener('click', OV.undo);
    $('#btn-redo').addEventListener('click', OV.redo);
    $('#btn-play').addEventListener('click', e => (S.playing ? OV.stop() : OV.play(e.shiftKey)));
    $('#btn-file').addEventListener('click', fileDialog);
    const nameEl = $('#project-name');
    nameEl.addEventListener('focus', OV.beginEdit);
    nameEl.addEventListener('input', () => { OV.beginEdit(); OV.project.name = nameEl.value; });
    nameEl.addEventListener('change', () => OV.endEdit());
    document.querySelectorAll('.mobile-tabs button').forEach(b => b.addEventListener('click', () => showPanel(b.dataset.tab)));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => OV.touch());
    new MutationObserver(() => OV.touch()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('beforeunload', () => { if (OV.project) OV.Store.save(OV.project); });
    let p = null; const last = OV.Store.lastId();
    if (last) p = await OV.Store.load(last);
    if (p) { try { OV.setProject(p, { save: false }); return; } catch (e) { /* fall through to the sample */ } }
    OV.setProject(OV.Sample.dungeon());
  }
  OV.boot = boot;
})();
