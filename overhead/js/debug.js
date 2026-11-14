/* Overhead Studio: the console and the debugger (bottom panel).
   Console: log() output and errors; click an error to jump to where it came from.
   Debugger: pause, step one frame, slow motion, see hitboxes and paths, and click any
   object in the running game to watch and change its live values. */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, S = OV.state, $ = OV.$;
  let runtime = null, scriptErrors = {}, eventErrors = {}, picked = null, lastFrame = null, lastPaint = 0, built = null, viewName = 'console';
  const logEl = () => $('#console-log');

  function add(kind, text, onClick) {
    const el = logEl(); if (!el) return;
    const row = h('div', { class: 'log log-' + kind + (onClick ? ' link' : ''), text: text });
    if (onClick) row.addEventListener('click', onClick);
    el.append(row);
    while (el.childElementCount > 400) el.firstChild.remove();
    el.scrollTop = el.scrollHeight;
  }
  function setView(v) {
    viewName = v;
    document.querySelectorAll('#bottom-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    logEl().hidden = v !== 'console'; $('#debugger').hidden = v !== 'debug'; $('#console-clear').hidden = v !== 'console';
    if (v === 'debug') build();
  }
  const fmt = v => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : v == null ? '' : String(v));

  /* ---------- debugger UI ---------- */
  function build() {
    const root = $('#debugger'); root.textContent = ''; built = null;
    if (!runtime) { root.append(h('p', { class: 'muted', style: { margin: '8px 12px' }, text: 'Press Play. Then you can pause, step frame by frame, and click anything in the game to see its live values.' })); return; }
    const pauseBtn = OV.ui.btn('⏸ Pause', () => { runtime.setPaused(!runtime.isPaused()); pauseBtn.textContent = runtime.isPaused() ? '▶ Resume' : '⏸ Pause'; stepBtn.disabled = !runtime.isPaused(); }, 'small');
    const stepBtn = OV.ui.btn('Step 1 frame', () => runtime.step(), 'small'); stepBtn.disabled = true;
    const speed = h('select', { class: 'mini-select', 'aria-label': 'Game speed' }, [['0.25', '¼ speed'], ['0.5', '½ speed'], ['1', 'Normal speed'], ['2', '2× speed']].map(o => h('option', { value: o[0], text: o[1] })));
    speed.value = '1'; speed.addEventListener('change', () => runtime.setSpeed(+speed.value));
    const flag = (label, key) => { const c = h('input', { type: 'checkbox' }); c.addEventListener('change', () => runtime.setFlag(key, c.checked)); return h('label', { class: 'check' }, c, h('span', { text: label })); };
    const globals = h('div', { class: 'dbg-table' }), inspect = h('div', { class: 'dbg-table' });
    root.append(h('div', { class: 'dbg-bar' }, pauseBtn, stepBtn, speed, flag('Hitboxes', 'hit'), flag('Paths', 'paths'), OV.ui.btn('Restart', () => runtime.restart(), 'small')),
      h('div', { class: 'dbg-cols' },
        h('div', { class: 'dbg-col' }, h('h2', { class: 'label', text: 'Global variables' }), globals),
        h('div', { class: 'dbg-col' }, h('h2', { class: 'label', text: 'Inspected object' }), inspect)));
    built = { globals: globals, inspect: inspect, gRows: {}, iKey: null, iRows: {} };
    paint(true);
  }
  function valueRow(name, onSet) {
    const input = h('input', { type: 'text', class: 'dbg-input code', 'aria-label': name, spellcheck: 'false' });
    input.addEventListener('change', () => onSet(OV.parseValue(input.value)));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); });
    return { row: h('div', { class: 'dbg-row' }, h('span', { class: 'dbg-name code', text: name }), input), input: input };
  }
  const put = (r, v) => { if (document.activeElement !== r.input) r.input.value = fmt(v); };
  function paint(force) {
    const f = lastFrame; if (!built || !f || viewName !== 'debug') return;
    const now = performance.now(); if (!force && now - lastPaint < 150) return; lastPaint = now;
    const g = f.globals || {};
    Object.keys(g).forEach(name => {
      let r = built.gRows[name];
      if (!r) { r = built.gRows[name] = valueRow(name, v => runtime.setGlobal(name, v)); built.globals.append(r.row); }
      put(r, g[name]);
    });
    if (!Object.keys(g).length && !built.globals.childElementCount) built.globals.append(h('p', { class: 'muted small', text: 'This game has no global variables.' }));
    const i = f.inspect, key = i ? i.id : 'none';
    if (key !== built.iKey) {
      built.iKey = key; built.iRows = {}; built.inspect.textContent = '';
      if (!i) built.inspect.append(h('p', { class: 'muted small', text: picked != null ? 'That object is gone.' : 'Click anything in the game to inspect it. Pausing first makes it easier.' }));
      else {
        built.inspect.append(h('div', { class: 'dbg-who' }, h('b', { text: i.type }), h('span', { class: 'muted small', text: (i.name ? '"' + i.name + '" · ' : '') + i.kind + ' · ' + i.beh.map(b => b.type + (b.on ? '' : ' (off)')).join(', ') })));
        ['x', 'y', 'hp', 'speed', 'angle', 'opacity', 'anim'].concat(Object.keys(i.vars)).forEach(name => {
          const r = (built.iRows[name] = valueRow(name, v => runtime.set(i.id, name, v))); built.inspect.append(r.row);
        });
        built.inspect.append(h('div', { class: 'row', style: { marginTop: '6px' } }, OV.ui.btn('Hurt by 1', () => runtime.call(i.id, 'damage', [1]), 'small'), OV.ui.btn('Destroy', () => runtime.call(i.id, 'destroy'), 'small danger')));
      }
    }
    if (i) Object.keys(built.iRows).forEach(name => put(built.iRows[name], name in i.vars ? i.vars[name] : i[name]));
  }

  OV.Debug = {
    scriptError: id => scriptErrors[id] || null,
    lastFrame: () => lastFrame,
    eventError: id => eventErrors[id] || null,
    clear() { const el = logEl(); if (el) el.textContent = ''; scriptErrors = {}; eventErrors = {}; },
    log: add,
    start(room) { scriptErrors = {}; eventErrors = {}; picked = null; lastFrame = null; add('info', '— Playing ' + OV.project.name + ' · ' + room.name + ' —'); },
    attach(rt) { runtime = rt; if (viewName === 'debug') build(); },
    stop() {
      runtime = null; lastFrame = null; $('#dbg-stats').textContent = '';
      if (viewName === 'debug') build();
      const d = OV.docApi(); if (d && d.refresh && S.doc && (S.doc.kind === 'type' || S.doc.kind === 'sheet')) d.refresh();
    },
    error(e) {
      let where = '', jump = null;
      if (e.kind === 'script' && e.typeId) { scriptErrors[e.typeId] = e; where = e.name + ' script' + (e.line ? ', line ' + e.line : ''); jump = () => { OV.stop(); OV.open('type', e.typeId); }; }
      else if (e.kind === 'text' && e.typeId) { where = e.name + ' text'; jump = () => { OV.stop(); OV.open('type', e.typeId); }; }
      else if (e.kind === 'event' && e.sheetId) {
        if (e.eventId) { const sh = OV.res('sheet', e.sheetId); let top = e.eventId; if (sh) sh.events.forEach(t => OV.Model.walkEvents([t], ev => { if (ev.id === e.eventId) top = t.id; })); eventErrors[top] = e; }
        where = e.name; jump = () => { OV.stop(); OV.open('sheet', e.sheetId); const d = OV.docApi(); if (d && d.reveal) d.reveal(e.eventId); };
      }
      add('error', (where ? where + ': ' : '') + e.message, jump);
      if (matchMedia('(max-width: 860px)').matches) { OV.$('#app').dataset.focus = 'panel'; OV.showPanel('panel-console'); }
      if (viewName !== 'console') setView('console');
    },
    frame(f, info) {
      lastFrame = f;
      const st = $('#dbg-stats'); if (st && performance.now() - lastPaint > 140) st.textContent = info.fps + ' fps · ' + (f.count == null ? f.insts.length : f.count) + ' objects';
      paint(false);
    },
    picked(id) { picked = id; if (id != null && viewName !== 'debug' && !matchMedia('(max-width: 860px)').matches) setView('debug'); },
    init() {
      document.querySelectorAll('#bottom-seg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
      $('#console-clear').addEventListener('click', () => (logEl().textContent = ''));
      setView('console');
    },
  };
})();
