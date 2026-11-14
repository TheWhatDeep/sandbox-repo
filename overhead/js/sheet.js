/* Overhead Studio: the event sheet editor.
   An event is a row: conditions on the left ("when all of these are true"), actions on the
   right ("do these, top to bottom"). Sub-events sit under a row and only run when it does. */
(function () {
  'use strict';
  const OV = window.OV, h = OV.h, M = OV.Model, S = OV.state, ui = OV.ui;

  /* ---------- how one condition or action reads ---------- */
  function targetChip(target) {
    const P = OV.project;
    if (target === 'system') return h('span', { class: 'tgt sys' }, h('span', { class: 'tree-icon', text: '⚙' }), 'System');
    const t = OV.byId(P.types, target);
    return h('span', { class: 'tgt' + (t || (target || '').startsWith('kind:') ? '' : ' missing') }, t ? OV.thumb(t, 14) : null, OV.targetLabel(P, target));
  }
  function describe(item, isCond) {
    const P = OV.project, def = OV.itemDef(item, isCond), out = h('span', { class: 'item-text' });
    if (!def) { out.append('(unknown: ' + item.key + ')'); return out; }
    let text = isCond && item.not && def.notText ? def.notText : def.text;
    if (isCond && item.not && !def.notText) out.append(h('span', { class: 'not', text: 'NOT' }), ' ');
    const hasT = text.includes('{t}');
    if (!hasT && item.target !== 'system') out.append(targetChip(item.target), ' ');
    text.split(/(\{[a-zA-Z]+\})/).forEach(part => {
      const m = /^\{([a-zA-Z]+)\}$/.exec(part);
      if (!m) { if (part) out.append(part); return; }
      if (m[1] === 't') { out.append(targetChip(item.target)); return; }
      const p = def.params.find(x => x.key === m[1]); if (!p) return;
      if (p.type === 'type' || p.type === 'typeOnly') out.append(targetChip(item.p[p.key]));
      else out.append(h('span', { class: 'param', text: OV.paramLabel(P, p, item.p[p.key]) }));
    });
    const js = def.params.find(p => p.type === 'js');
    if (js) out.append(h('pre', { class: 'item-code', text: String(item.p[js.key] || '').split('\n').slice(0, 8).join('\n') }));
    return out;
  }

  /* ---------- the add / edit dialog ---------- */
  function itemDialog(isCond, existing, onDone, onDelete, onMove) {
    const P = OV.project, noun = isCond ? 'condition' : 'action', CAT = isCond ? OV.CONDITIONS : OV.ACTIONS;
    let draft = existing ? OV.clone(existing) : null, target = existing ? existing.target : null;
    const body = h('div', { class: 'pick' });
    const modal = OV.modal({ title: (existing ? 'Edit ' : 'Add a ') + noun, content: body, wide: true });
    const title = t => (modal.el.querySelector('.modal-top h2').textContent = t);

    function stepTarget() {
      title((existing ? 'Change ' : 'Add a ') + noun + ': who is it about?');
      body.textContent = '';
      const grid = h('div', { class: 'pick-grid' });
      const btn = (key, icon, label) => h('button', { class: 'pick-btn', type: 'button', onclick: () => { target = key; stepWhat(); } }, icon, h('span', { text: label }));
      grid.append(btn('system', h('span', { class: 'tree-icon big', text: '⚙' }), 'System'));
      P.types.forEach(t => grid.append(btn(t.id, OV.thumb(t, 28), t.name)));
      body.append(h('p', { class: 'modal-text', text: isCond ? 'System covers time, keys and global variables. Pick an object to test something about it.' : 'System covers variables, rooms, sound and the camera. Pick an object to make it do something.' }), grid,
        h('h2', { class: 'label', style: { marginTop: '14px' }, text: 'Or every object of a kind' }),
        h('div', { class: 'chips' }, OV.KINDS.map(k => h('button', { class: 'chip btnlike', type: 'button', text: 'Any ' + k[1].toLowerCase(), onclick: () => { target = 'kind:' + k[0]; stepWhat(); } }))));
    }
    function stepWhat() {
      title('Choose the ' + noun);
      body.textContent = '';
      const on = target === 'system' ? 'system' : 'object';
      body.append(h('div', { class: 'pick-who' }, targetChip(target), h('button', { class: 'linklike', type: 'button', onclick: stepTarget, text: 'change' })));
      let group = '', box = null;
      CAT.filter(d => d.on === on).forEach(d => {
        if (d.group !== group) { group = d.group; body.append(h('h2', { class: 'label', style: { marginTop: '12px' }, text: group })); box = h('div', { class: 'pick-list' }); body.append(box); }
        box.append(h('button', { class: 'pick-row', type: 'button', text: d.label, onclick: () => {
          const keep = draft && draft.key === d.key && (draft.target === 'system') === (target === 'system') ? draft.p : null;
          draft = OV.newItem(d, target); if (existing) draft.id = existing.id; if (keep) Object.assign(draft.p, keep);
          if (d.params.length) stepParams(); else finish();
        } }));
      });
    }
    function stepParams() {
      const def = OV.itemDef(draft, isCond);
      title(def.label);
      body.textContent = '';
      const prev = h('div', { class: 'pick-preview' });
      const redraw = () => { prev.textContent = ''; prev.append(describe(draft, isCond)); };
      body.append(h('div', { class: 'pick-who' }, targetChip(draft.target), h('button', { class: 'linklike', type: 'button', onclick: stepWhat, text: 'change ' + noun })));
      const form = h('div', { class: 'pick-form' });
      def.params.forEach(p => {
        const f = OV.paramField(p, () => draft.p[p.key], v => { draft.p[p.key] = v; redraw(); }, { expr: true, target: draft.target });
        if (['js', 'area', 'text', 'expr'].includes(p.type)) f.classList.add('wide');
        form.append(f);
      });
      body.append(form);
      if (def.params.some(p => p.type === 'num' || p.type === 'expr')) body.append(h('p', { class: 'muted small', text: 'Number boxes take plain numbers or JavaScript: score + 1, Player.x, random(1, 6), self.hp * 2.' }));
      if (isCond) body.append(h('div', { style: { margin: '10px 0' } }, ui.check('Invert (true when this is NOT the case)', () => !!draft.not, v => { draft.not = v || undefined; redraw(); })));
      body.append(h('h2', { class: 'label', style: { marginTop: '12px' }, text: 'Reads as' }), prev);
      redraw();
      const acts = h('div', { class: 'modal-actions' });
      if (existing) acts.append(ui.btn('Delete', () => { modal.close(); onDelete(); }, 'danger'), ui.btn('↑', () => { modal.close(); onMove(-1); }, 'icon'), ui.btn('↓', () => { modal.close(); onMove(1); }, 'icon'), h('span', { class: 'spacer' }));
      acts.append(ui.btn('Cancel', () => modal.close()), ui.btn('Done', finish, 'primary'));
      body.append(acts);
    }
    function finish() {
      const def = OV.itemDef(draft, isCond);
      const missing = def.params.find(p => (p.type === 'type' || p.type === 'room') && !draft.p[p.key] && !(def.key === 'shoot' && p.key === 'other'));
      if (missing) { OV.toast('Choose "' + missing.label + '" first.'); return; }
      modal.close(); onDone(draft);
    }
    if (existing) { if (OV.itemDef(existing, isCond) && OV.itemDef(existing, isCond).params.length) stepParams(); else stepWhat(); } else stepTarget();
  }

  /* ================= the document ================= */
  function mount(el, id) {
    const sheet = () => OV.res('sheet', id);
    let counter = 0;

    function itemRow(ev, list, k, isCond) {
      const item = list[k];
      const row = h('button', { class: 'item ' + (isCond ? 'cond' : 'act'), type: 'button' }, describe(item, isCond));
      row.addEventListener('click', () => itemDialog(isCond, item,
        d => OV.edit(() => (list[k] = d)),
        () => OV.edit(() => list.splice(k, 1)),
        dir => OV.edit(() => { const n = k + dir; if (n < 0 || n >= list.length) return; list.splice(k, 1); list.splice(n, 0, item); })));
      return row;
    }
    function eventBlock(ev, siblings, k, depth) {
      const num = depth === 0 ? ++counter : null, err = depth === 0 ? OV.Debug.eventError(ev.id) : null;
      const conds = h('div', { class: 'ev-col ev-conds' }), acts = h('div', { class: 'ev-col ev-acts' });
      if (!ev.conds.length) conds.append(h('div', { class: 'item-empty muted small', text: depth ? 'Always (when the row above runs)' : 'Always, every tick' }));
      ev.conds.forEach((c, n) => conds.append(itemRow(ev, ev.conds, n, true)));
      ev.acts.forEach((a, n) => acts.append(itemRow(ev, ev.acts, n, false)));
      conds.append(h('button', { class: 'add-item', type: 'button', text: '+ condition', onclick: () => itemDialog(true, null, d => OV.edit(() => ev.conds.push(d))) }));
      acts.append(h('button', { class: 'add-item', type: 'button', text: '+ action', onclick: () => itemDialog(false, null, d => OV.edit(() => ev.acts.push(d))) }));
      const more = h('button', { class: 'tree-more ev-more', type: 'button', 'aria-label': 'More for this event', text: '⋯' });
      more.addEventListener('click', () => OV.menu(more, [
        { label: 'Add a sub-event', onClick: () => OV.edit(() => ev.sub.push(M.newEvent())) },
        { label: ev.comment ? 'Edit note' : 'Add a note', onClick: () => OV.ask('Note for this event', ev.comment || '', { max: 200 }).then(v => { if (v != null) OV.edit(() => { if (v.trim()) ev.comment = v.trim(); else delete ev.comment; }); }) },
        { label: ev.off ? 'Turn on' : 'Turn off', onClick: () => OV.edit(() => { if (ev.off) delete ev.off; else ev.off = true; }) },
        { label: 'Duplicate', onClick: () => OV.edit(() => { const c = OV.clone(ev); OV.reIdEvent(c); siblings.splice(k + 1, 0, c); }) },
        { label: 'Move up', disabled: k === 0, onClick: () => OV.edit(() => { siblings.splice(k, 1); siblings.splice(k - 1, 0, ev); }) },
        { label: 'Move down', disabled: k === siblings.length - 1, onClick: () => OV.edit(() => { siblings.splice(k, 1); siblings.splice(k + 1, 0, ev); }) },
        { sep: true }, { label: 'Delete', danger: true, onClick: () => OV.edit(() => siblings.splice(k, 1)) },
      ]));
      const block = h('div', { class: 'ev-wrap', style: { marginLeft: depth * 18 + 'px' } });
      if (ev.comment) block.append(h('div', { class: 'ev-note', text: ev.comment }));
      block.append(h('div', { class: 'ev' + (ev.off ? ' off' : '') + (err ? ' bad' : ''), 'data-ev': ev.id }, h('div', { class: 'ev-num', text: num ? String(num) : '↳' }), conds, h('div', { class: 'ev-arrow', 'aria-hidden': 'true', text: '→' }), acts, more));
      if (err) block.append(h('div', { class: 'script-error', role: 'alert', text: err.message }));
      ev.sub.forEach((s, n) => block.append(eventBlock(s, ev.sub, n, depth + 1)));
      return block;
    }
    function render() {
      const sh = sheet(), P = OV.project; if (!sh) return;
      const top = el.scrollTop; el.textContent = ''; counter = 0;
      const addEvent = () => OV.edit(() => sh.events.push(M.newEvent()));
      el.append(h('div', { class: 'sheet-head' },
        h('div', null, h('h1', { class: 'sheet-title', text: sh.name }), h('p', { class: 'muted small', style: { margin: 0 }, text: 'Each row: when every condition on the left is true, the actions on the right run, top to bottom.' })),
        h('div', { class: 'row' }, ui.select(null, [['all', 'Runs in every room']].concat(P.rooms.map(r => [r.id, 'Runs only in ' + r.name])), () => sh.scope, v => (sh.scope = v), { hard: false }), ui.btn('+ Add event', addEvent, 'primary'))));
      const list = h('div', { class: 'ev-list' });
      sh.events.forEach((ev, k) => list.append(eventBlock(ev, sh.events, k, 0)));
      if (!sh.events.length) list.append(h('div', { class: 'empty-doc' }, h('p', { class: 'empty-title', text: 'No events yet' }),
        h('p', { class: 'muted', text: 'Try: Player is touching Key → Destroy Key, Add 1 to keys.' }), ui.btn('+ Add the first event', addEvent, 'primary')));
      else list.append(h('button', { class: 'add-event', type: 'button', text: '+ Add event', onclick: addEvent }));
      el.append(list);
      el.scrollTop = top;
    }
    render();
    return { refresh: render, destroy() {}, reveal(evId) { const n = el.querySelector('[data-ev="' + evId + '"]'); if (n) n.scrollIntoView({ block: 'center' }); } };
  }
  OV.docs.sheet = { mount: mount };
})();
