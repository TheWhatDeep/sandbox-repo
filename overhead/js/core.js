/* Overhead Studio: shared helpers. Everything hangs off one global, OV. */
(function () {
  'use strict';
  const OV = (window.OV = window.OV || {});
  OV.version = '0.2.0';

  /* ---------- small utilities ---------- */
  OV.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let seq = 0;
  OV.uid = p => (p || 'x') + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  OV.clone = v => JSON.parse(JSON.stringify(v));
  OV.byId = (arr, id) => (arr || []).find(x => x.id === id) || null;
  OV.isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  OV.$ = (s, root) => (root || document).querySelector(s);

  // Turn any text into a name that is safe to type in a script: letters, digits, underscore.
  OV.ident = (s, fallback) => {
    s = String(s == null ? '' : s).trim().replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s) s = fallback || 'Thing';
    if (/^[0-9]/.test(s)) s = '_' + s;
    return s;
  };
  OV.uniqueName = (base, taken) => {
    if (!taken.includes(base)) return base;
    const m = /^(.*?)(\d+)$/.exec(base);
    const stem = m ? m[1] : base;
    let n = m ? +m[2] : 1;
    while (taken.includes(stem + ++n));
    return stem + n;
  };
  // "12" -> 12, "true" -> true, anything else stays text.
  OV.parseValue = s => {
    if (typeof s !== 'string') return s;
    const t = s.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    return s;
  };

  /* ---------- DOM builder ---------- */
  OV.h = function (tag, props) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(x => { if (x != null && x !== false) el.append(x.nodeType ? x : document.createTextNode(String(x))); });
    }
    return el;
  };
  const h = OV.h;

  /* ---------- tiny event bus ---------- */
  const listeners = {};
  OV.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  OV.emit = (evt, data) => { (listeners[evt] || []).slice().forEach(fn => fn(data)); };

  /* ---------- edit hooks (the editor replaces these; stubs keep modules usable alone) ---------- */
  OV.beginEdit = OV.beginEdit || function () {};
  OV.endEdit = OV.endEdit || function () {};
  OV.touch = OV.touch || function () {};

  /* ---------- toast ---------- */
  let toastTimer = 0;
  OV.toast = msg => {
    let t = document.getElementById('ov-toast');
    if (!t) { t = h('div', { id: 'ov-toast', class: 'toast', role: 'status' }); document.body.append(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2800);
  };

  /* ---------- popup menu ---------- */
  let openMenu = null;
  OV.closeMenu = () => { if (openMenu) { openMenu.remove(); openMenu = null; } };
  // items: [{label, onClick, danger, disabled, icon}] or {sep:true} or {heading:'text'}
  OV.menu = (anchor, items) => {
    OV.closeMenu();
    const m = h('div', { class: 'menu', role: 'menu' });
    items.forEach(it => {
      if (!it) return;
      if (it.sep) { m.append(h('div', { class: 'menu-sep' })); return; }
      if (it.heading) { m.append(h('div', { class: 'menu-head', text: it.heading })); return; }
      const b = h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', disabled: it.disabled }, it.icon || null, h('span', { text: it.label }));
      b.addEventListener('click', e => { e.stopPropagation(); OV.closeMenu(); it.onClick && it.onClick(); });
      m.append(b);
    });
    document.body.append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = r.left, y = r.bottom + 4;
    if (x + mw > innerWidth - 8) x = Math.max(8, innerWidth - mw - 8);
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
    m.style.left = x + 'px'; m.style.top = y + 'px';
    openMenu = m;
    return m;
  };
  document.addEventListener('pointerdown', e => { if (openMenu && !openMenu.contains(e.target)) OV.closeMenu(); }, true);
  window.addEventListener('blur', OV.closeMenu);

  /* ---------- modal dialogs ---------- */
  const modalStack = [];
  // opts: {title, content: element, actions: [{label, primary, danger, onClick(close)}], wide, onClose}
  OV.modal = opts => {
    const card = h('div', { class: 'modal-card' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' });
    const wrap = h('div', { class: 'modal' }, card);
    const close = () => {
      const i = modalStack.indexOf(api); if (i >= 0) modalStack.splice(i, 1);
      wrap.remove(); opts.onClose && opts.onClose();
    };
    const api = { close: close, el: card };
    card.append(h('div', { class: 'modal-top' }, h('h2', { text: opts.title || '' }), h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Close', onclick: close, text: '✕' })));
    if (opts.content) card.append(h('div', { class: 'modal-body' }, opts.content));
    if (opts.actions && opts.actions.length) {
      card.append(h('div', { class: 'modal-actions' }, opts.actions.map(a =>
        h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger solid' : ''), type: 'button', onclick: () => a.onClick ? a.onClick(close) : close(), text: a.label }))));
    }
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
    document.body.append(wrap);
    modalStack.push(api);
    const first = card.querySelector('input, select, textarea, .modal-actions .primary') || card.querySelector('button');
    if (first) setTimeout(() => first.focus(), 0);
    return api;
  };
  OV.modalOpen = () => modalStack.length > 0;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (openMenu) { OV.closeMenu(); e.stopPropagation(); }
      else if (modalStack.length) { modalStack[modalStack.length - 1].close(); e.stopPropagation(); }
    }
  }, true);

  OV.confirm = (text, okLabel, danger) => new Promise(res => {
    let done = false;
    OV.modal({
      title: 'Are you sure?', content: h('p', { class: 'modal-text', text: text }),
      actions: [{ label: 'Cancel', onClick: c => c() }, { label: okLabel || 'OK', primary: !danger, danger: danger, onClick: c => { done = true; c(); } }],
      onClose: () => res(done),
    });
  });
  OV.ask = (title, value, opts) => new Promise(res => {
    opts = opts || {};
    let result = null;
    const input = h('input', { type: 'text', class: 'text-input', value: value || '', maxlength: opts.max || 60, 'aria-label': title });
    const m = OV.modal({
      title: title, content: h('div', null, opts.help ? h('p', { class: 'modal-text', text: opts.help }) : null, input),
      actions: [{ label: 'Cancel', onClick: c => c() }, { label: opts.okLabel || 'OK', primary: true, onClick: c => { result = input.value; c(); } }],
      onClose: () => res(result),
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { result = input.value; m.close(); } });
    setTimeout(() => input.select(), 0);
  });

  /* ---------- form fields bound to the model ----------
     get() reads the model, set(v) writes it. Fields wrap their writes in
     beginEdit/endEdit so undo and autosave just work. opts.hard = rebuild
     panels after the change (use when the change alters what is shown). */
  let fid = 0;
  const ui = (OV.ui = {});
  const wrapField = (label, input, opts) => {
    const id = input.id || (input.id = 'f' + ++fid);
    return h('label', { class: 'field' + (opts && opts.wide ? ' wide' : ''), for: id }, label ? h('span', { text: label }) : null, input);
  };
  const fmt = v => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v == null ? '' : String(v));
  ui.num = (label, get, set, opts) => {
    opts = opts || {};
    const input = h('input', { type: 'number', step: opts.step || 1, min: opts.min, max: opts.max, inputmode: 'decimal' });
    input.value = fmt(get());
    input.addEventListener('focus', () => OV.beginEdit());
    input.addEventListener('input', () => { const v = parseFloat(input.value); if (Number.isFinite(v)) { OV.beginEdit(); set(v); OV.touch(); } });
    input.addEventListener('change', () => { OV.endEdit(opts.hard); input.value = fmt(get()); });
    input._sync = () => { if (document.activeElement !== input) input.value = fmt(get()); };
    return wrapField(label, input, opts);
  };
  ui.text = (label, get, set, opts) => {
    opts = opts || {};
    const input = h('input', { type: 'text', maxlength: opts.max || 200, placeholder: opts.placeholder, spellcheck: 'false', autocapitalize: 'off', class: opts.code ? 'code' : null, list: opts.list });
    input.value = fmt(get());
    input.addEventListener('focus', () => OV.beginEdit());
    input.addEventListener('input', () => { OV.beginEdit(); set(input.value); OV.touch(); });
    input.addEventListener('change', () => { OV.endEdit(opts.hard); if (opts.resync) input.value = fmt(get()); });
    input._sync = () => { if (document.activeElement !== input) input.value = fmt(get()); };
    return wrapField(label, input, opts);
  };
  ui.area = (label, get, set, opts) => {
    opts = opts || {};
    const ta = h('textarea', { rows: opts.rows || 3, spellcheck: opts.code ? 'false' : null, autocapitalize: 'off', class: opts.code ? 'code' : null, placeholder: opts.placeholder });
    ta.value = fmt(get());
    ta.addEventListener('focus', () => OV.beginEdit());
    ta.addEventListener('input', () => { OV.beginEdit(); set(ta.value); OV.touch(); });
    ta.addEventListener('change', () => OV.endEdit(opts.hard));
    if (opts.code) ta.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); set(ta.value); }
    });
    return wrapField(label, ta, Object.assign({ wide: true }, opts));
  };
  ui.color = (label, get, set, opts) => {
    const input = h('input', { type: 'color' });
    const cur = get();
    input.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#888888';
    input.addEventListener('input', () => { OV.beginEdit(); set(input.value); OV.touch(); });
    input.addEventListener('change', () => OV.endEdit(opts && opts.hard));
    return wrapField(label, input, opts);
  };
  // options: [[value, label], ...]
  ui.select = (label, options, get, set, opts) => {
    opts = opts || {};
    const sel = h('select', null, options.map(o => h('option', { value: o[0], text: o[1] })));
    sel.value = get() == null ? '' : get();
    sel.addEventListener('change', () => { OV.beginEdit(); set(sel.value); OV.endEdit(opts.hard !== false); });
    return wrapField(label, sel, opts);
  };
  ui.check = (label, get, set, opts) => {
    opts = opts || {};
    const c = h('input', { type: 'checkbox', id: 'f' + ++fid });
    c.checked = !!get();
    c.addEventListener('change', () => { OV.beginEdit(); set(c.checked); OV.endEdit(opts.hard); });
    return h('label', { class: 'check', for: c.id }, c, h('span', { text: label }));
  };
  ui.section = function (title) {
    const s = h('section', { class: 'section' }, title ? h('h2', { class: 'label', text: title }) : null);
    for (let i = 1; i < arguments.length; i++) [].concat(arguments[i]).forEach(x => { if (x) s.append(x); });
    return s;
  };
  ui.grid = function () { return h('div', { class: 'grid2' }, [].concat.apply([], arguments)); };
  ui.btn = (label, onClick, cls) => h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: onClick, text: label });
  ui.sync = root => root.querySelectorAll('input').forEach(i => i._sync && i._sync());

  /* ---------- image helpers ---------- */
  const imgCache = new Map();
  // Returns an <img> for a data URL, cached. onload fires OV.touch so canvases repaint.
  OV.image = src => {
    if (!src) return null;
    let im = imgCache.get(src);
    if (!im) {
      im = new Image();
      im.onload = () => OV.touch();
      im.src = src;
      imgCache.set(src, im);
      if (imgCache.size > 4000) imgCache.delete(imgCache.keys().next().value);
    }
    return im;
  };
  OV.loadImage = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not read that image.')); im.src = src; });
  OV.readFile = (file, as) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Could not read that file.'));
    if (as === 'text') fr.readAsText(file); else fr.readAsDataURL(file);
  });
  OV.pickFile = accept => new Promise(res => {
    const inp = h('input', { type: 'file', accept: accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); });
    document.body.append(inp); inp.click();
  });
})();
