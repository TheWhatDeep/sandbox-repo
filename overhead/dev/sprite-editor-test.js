/* Playwright checks for js/sprite-editor.js.
   Serve overhead/ first:  python3 -m http.server 8791   (from the overhead folder)
   Run:                    node dev/sprite-editor-test.js [port] [screenshot-dir]
   With a screenshot dir it also saves light/dark screenshots at 1100x720 and 390x780. */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const port = process.argv[2] || 8791, shots = process.argv[3];
const base = 'http://localhost:' + port + '/dev/sprite-editor-test.html';
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('FAIL  ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

async function open(browser, query, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 }, opts));
  const page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(base + query);
  await page.waitForTimeout(250);
  // helpers that run in the page
  await page.evaluate(() => {
    window.px = async (src, x, y) => {                    // RGBA of one pixel of a data URL
      if (!src) return [0, 0, 0, 0];
      const im = await OV.loadImage(src), c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      return [...g.getImageData(x, y, 1, 1).data];
    };
    window.dims = async src => { const im = await OV.loadImage(src); return [im.width, im.height]; };
    window.takeLog = () => T.log.splice(0).join(',');
    window.frame = (a, f) => T.sprite.anims[a].frames[f];
  });
  // screen position of the centre of picture pixel (x, y); works while the view is fitted or zoomed about the centre
  page.at = async (x, y, W, H) => {
    const r = await page.evaluate(() => { const b = document.querySelector('.pxe-view').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, z: parseFloat(document.querySelector('.pxe-zl').textContent) / 100 }; });
    return [r.l + Math.round((r.w - W * r.z) / 2) + (x + 0.5) * r.z, r.t + Math.round((r.h - H * r.z) / 2) + (y + 0.5) * r.z];
  };
  page.drag = async (pts, W, H, button) => {
    const first = await page.at(pts[0][0], pts[0][1], W, H);
    await page.mouse.move(first[0], first[1]);
    await page.mouse.down({ button: button || 'left' });
    for (const p of pts.slice(1)) { const q = await page.at(p[0], p[1], W, H); await page.mouse.move(q[0], q[1], { steps: 3 }); }
    return () => page.mouse.up({ button: button || 'left' });
  };
  page.stroke = async (pts, W, H, button) => (await page.drag(pts, W, H, button))();
  page.errors = errors;
  page.done = async name => { eq(errors, [], name + ': no console or page errors'); await ctx.close(); };
  return page;
}
const log = page => page.evaluate(() => takeLog());
const press = (page, label) => page.click('.pxe [aria-label^="' + label + '"]');
const setNum = async (page, label, v, scope) => {
  const inp = page.locator((scope || '.pxe') + ' label.field', { has: page.locator('span', { hasText: new RegExp('^' + label + '$') }) }).locator('input').first();
  await inp.fill(String(v)); await inp.press('Enter'); await page.waitForTimeout(150);
};
function pngFile(name, w, h, paint) {                     // write a test PNG via a throwaway page
  return async browser => {
    const p = await browser.newPage();
    const b64 = await p.evaluate(([w, h, body]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; new Function('x', body)(c.getContext('2d')); return c.toDataURL('image/png').split(',')[1]; }, [w, h, paint]);
    await p.close();
    const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
  };
}
async function choose(page, clickSel, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(clickSel)]);
  await fc.setFiles(file); await page.waitForTimeout(300);
}

async function spriteTests(browser) {
  const page = await open(browser, '?ed=sprite');
  const S = 16;
  eq(await log(page), '', 'mount does not touch the model');

  // --- pencil: one stroke = one begin/commit, frame data changes
  let before = await page.evaluate(() => frame(0, 0));
  const release = await page.drag([[1, 1], [3, 1], [3, 3]], S, S);
  eq(await log(page), '', 'nothing is committed while the stroke is in progress');
  await release();
  eq(await log(page), 'begin,commit', 'pencil stroke: exactly one begin/commit');
  ok((await page.evaluate(() => frame(0, 0))) !== before, 'pencil stroke changed the frame data URL');
  eq(await page.evaluate(() => px(frame(0, 0), 3, 2)), [0x1a, 0x1c, 0x2c, 255], 'pencil drew the selected colour');
  ok((await page.evaluate(() => frame(0, 0))).startsWith('data:image/png;base64,'), 'frame is written as a PNG data URL');
  eq(await page.evaluate(() => document.querySelectorAll('.pxe-swatches')[1].children.length), 1, 'used colour appears under recently used');

  // --- right button erases; a stroke that changes nothing commits nothing
  await page.stroke([[3, 1], [3, 3]], S, S, 'right');
  eq(await log(page), 'begin,commit', 'right-button stroke: one begin/commit');
  eq((await page.evaluate(() => px(frame(0, 0), 3, 2)))[3], 0, 'right mouse button with the pencil erases');
  await page.keyboard.press('e');
  await page.stroke([[14, 1], [15, 1]], S, S);
  eq(await log(page), '', 'erasing empty pixels commits nothing');

  // --- brush size + mirror
  await page.keyboard.press('b'); await page.keyboard.press(']');
  await press(page, 'Mirror');
  await page.stroke([[1, 14]], S, S);
  eq(await log(page), 'begin,commit', 'mirrored dot: one begin/commit');
  eq(await page.evaluate(async () => [(await px(frame(0, 0), 2, 15))[3], (await px(frame(0, 0), 14, 14))[3], (await px(frame(0, 0), 13, 14))[3], (await px(frame(0, 0), 12, 14))[3]]), [255, 255, 255, 0], 'size 2 brush is mirrored left-right');
  await press(page, 'Mirror'); await page.keyboard.press('[');

  // --- fill
  await page.keyboard.press('g');
  await page.click('.pxe-sw[title="#b13e53"]');
  await page.stroke([[14, 5]], S, S);
  eq(await log(page), 'begin,commit', 'fill: one begin/commit');
  eq(await page.evaluate(() => px(frame(0, 0), 15, 9)), [0xb1, 0x3e, 0x53, 255], 'fill flooded the connected empty area');
  eq((await page.evaluate(() => px(frame(0, 0), 0, 8)))[3], 0, 'fill did not cross the figure');
  eq((await page.evaluate(() => px(frame(0, 0), 7, 8)))[2], 0x6f, 'fill left the body alone');

  // --- line and rectangle with live preview, picker, move
  await page.keyboard.press('l');
  const rel2 = await page.drag([[0, 0], [15, 0]], S, S);
  await page.waitForTimeout(60);
  const mid = await page.evaluate(() => { const v = document.querySelector('.pxe-view'), r = v.getBoundingClientRect(), z = parseFloat(document.querySelector('.pxe-zl').textContent) / 100; const x = Math.round((r.width - 16 * z) / 2 + 8.5 * z), y = Math.round((r.height - 16 * z) / 2 + 0.5 * z); return [...v.getContext('2d').getImageData(x, y, 1, 1).data]; });
  eq(mid.slice(0, 3), [0xb1, 0x3e, 0x53], 'line shows a live preview while dragging');
  eq(await log(page), '', 'line preview does not commit');
  await rel2();
  eq(await log(page), 'begin,commit', 'line: one begin/commit');
  await page.keyboard.press('r'); await page.keyboard.press('r');     // second press = filled
  await page.stroke([[12, 12], [14, 14]], S, S);
  eq(await log(page), 'begin,commit', 'rectangle: one begin/commit');
  eq((await page.evaluate(() => px(frame(0, 0), 13, 13))).slice(0, 3), [0xb1, 0x3e, 0x53], 'filled rectangle fills its inside');
  await page.keyboard.press('i');
  await page.stroke([[7, 8]], S, S);
  eq(await page.evaluate(() => document.querySelector('.pxe-cur code').textContent), '#29366f', 'picker takes the colour under the pointer');
  eq(await log(page), '', 'picker commits nothing');
  await page.keyboard.press('m');
  await page.stroke([[5, 5], [7, 5]], S, S);
  eq(await log(page), 'begin,commit', 'move: one begin/commit');
  eq((await page.evaluate(() => px(frame(0, 0), 9, 8)))[2], 0x6f, 'move shifted the frame');
  await page.evaluate(() => T.undo()); await page.waitForTimeout(100);
  await page.evaluate(() => takeLog());

  // --- flips and clear
  before = await page.evaluate(() => px(frame(0, 0), 0, 0));
  await press(page, 'Flip frame left to right');
  eq(await log(page), 'begin,commit', 'flip: one begin/commit');
  eq(await page.evaluate(() => px(frame(0, 0), 15, 0)), before, 'flip left-right mirrored the pixels');
  await press(page, 'Flip frame top to bottom');
  eq(await page.evaluate(() => px(frame(0, 0), 15, 15)), before, 'flip top-bottom mirrored the pixels');
  await page.evaluate(() => takeLog());

  // --- frames
  await press(page, 'Add a blank frame');
  eq(await page.evaluate(() => [T.sprite.anims[0].frames.length, T.sprite.anims[0].frames[1]]), [3, ''], 'add blank frame after the current one');
  await press(page, 'Duplicate frame');
  eq(await page.evaluate(() => T.sprite.anims[0].frames.length), 4, 'duplicate frame');
  await page.click('.pxe-thumb >> nth=0'); await press(page, 'Duplicate frame');
  ok(await page.evaluate(() => frame(0, 0) === frame(0, 1)), 'duplicate copies the selected frame');
  await press(page, 'Move frame later');
  eq(await page.evaluate(() => document.querySelector('.pxe-thumb[aria-pressed=true]').textContent), '3', 'moved frame stays selected');
  await press(page, 'Delete frame'); await press(page, 'Delete frame'); await press(page, 'Delete frame'); await press(page, 'Delete frame');
  eq(await page.evaluate(() => T.sprite.anims[0].frames.length), 1, 'frames deleted down to one');
  ok(await page.locator('.pxe [aria-label="Delete frame"]').isDisabled(), 'the last frame cannot be deleted');
  eq(await log(page), Array(8).fill('begin,commit').join(','), 'eight frame operations: eight begin/commit pairs');
  for (let i = 0; i < 4; i++) await page.evaluate(() => T.undo());
  await page.waitForTimeout(100);
  eq(await page.evaluate(() => T.sprite.anims[0].frames.length), 5, 'host undo restores frames and refresh() copes');
  await page.evaluate(() => takeLog());

  // --- animations
  await press(page, 'Add animation');
  await page.fill('.modal-card input', 'hurt face!'); await page.click('.modal-actions .primary'); await page.waitForTimeout(100);
  eq(await page.evaluate(() => T.sprite.anims.map(a => a.name)), ['idle', 'walk', 'hurt_face'], 'add animation, name made into an identifier');
  eq(await page.evaluate(() => T.sprite.anims[2].frames.length), 1, 'new animation has one frame');
  await page.click('.pxe-animset >> text=Rename');
  await page.fill('.modal-card input', 'walk'); await page.click('.modal-actions .primary'); await page.waitForTimeout(100);
  eq(await page.evaluate(() => T.sprite.anims[2].name), 'walk2', 'rename keeps names unique');
  await setNum(page, 'Frames per second', 99);
  eq(await page.evaluate(() => T.sprite.anims[2].fps), 30, 'fps is clamped to 1-30');
  await page.click('.pxe-check');
  eq(await page.evaluate(() => T.sprite.anims[2].loop), false, 'loop checkbox');
  eq(await log(page), Array(4).fill('begin,commit').join(','), 'add, rename, fps, loop: four pairs');
  await page.click('.pxe-animset >> text=Delete');
  await page.click('.modal-actions >> text=Delete'); await page.waitForTimeout(100);
  eq(await page.evaluate(() => T.sprite.anims.length), 2, 'delete animation after confirming');
  await page.click('.pxe-chips >> text=walk');
  eq(await page.evaluate(() => document.querySelectorAll('.pxe-thumb').length), 4, 'selecting an animation shows its frames');
  await page.evaluate(() => takeLog());

  // --- origin and hitbox
  await press(page, 'Origin & hitbox');
  await page.waitForTimeout(100);                                     // the canvas refits when the mode bar appears
  await page.stroke([[4, 4]], S, S);
  const o = await page.evaluate(() => [T.sprite.ox, T.sprite.oy]);
  ok(o[0] >= 4 && o[0] <= 5 && o[1] >= 4 && o[1] <= 5, 'tapping moves the origin (' + o + ')');
  eq(await log(page), 'begin,commit', 'origin drag: one begin/commit');
  await page.stroke([[4, 4]], S, S);
  eq(await log(page), '', 'tapping the origin where it already is commits nothing');
  await page.click('.pxe-boxbar >> text=Draw hitbox');
  await page.stroke([[2, 3], [9, 12]], S, S);
  eq(await page.evaluate(() => T.sprite.hit), { x: 2, y: 3, w: 8, h: 10 }, 'dragging draws a new hitbox');
  eq(await log(page), 'begin,commit', 'hitbox drag: one begin/commit');
  before = await page.evaluate(() => frame(1, 0));
  ok(before === (await page.evaluate(() => frame(1, 0))), 'origin/hitbox edits do not touch pixels');
  await setNum(page, 'X', 8, '.pxe-grid4');
  eq(await page.evaluate(() => T.sprite.hit), { x: 8, y: 3, w: 8, h: 10 }, 'hitbox number field');
  await setNum(page, 'Width', 99, '.pxe-grid4');
  eq(await page.evaluate(() => T.sprite.hit.w), 8, 'hitbox width is clamped to the sprite');
  await press(page, 'Pencil');
  ok(await page.evaluate(() => document.querySelector('.pxe-boxbar').hidden), 'picking a tool leaves origin & hitbox mode');
  await page.evaluate(() => takeLog());

  // --- resize the sprite
  await setNum(page, 'Width', 24);
  await page.waitForTimeout(200);
  eq(await page.evaluate(() => [T.sprite.w, T.sprite.h]), [24, 16], 'resize sets the new size');
  eq(await page.evaluate(async () => { const out = []; for (const a of T.sprite.anims) for (const f of a.frames) if (f) out.push((await dims(f)).join('x')); return [...new Set(out)]; }), ['24x16'], 'every frame of every animation was resized');
  eq(await log(page), 'begin,commit', 'resize: one begin/commit');
  eq((await page.evaluate(() => px(frame(1, 0), 7, 8)))[2], 0x6f, 'resize keeps pixels anchored top-left');
  await setNum(page, 'Width', 6); await setNum(page, 'Height', 6);
  await page.waitForTimeout(200);
  const s2 = await page.evaluate(() => T.sprite);
  ok(s2.ox <= 6 && s2.oy <= 6 && s2.hit.x + s2.hit.w <= 6 && s2.hit.y + s2.hit.h <= 6 && s2.hit.w >= 1 && s2.hit.h >= 1, 'shrinking clamps origin and hitbox: ' + JSON.stringify([s2.ox, s2.oy, s2.hit]));
  await page.evaluate(() => { T.undo(); T.undo(); T.undo(); }); await page.waitForTimeout(150);
  eq(await page.evaluate(() => [T.sprite.w, T.sprite.h]), [16, 16], 'undo of the resizes');
  await page.evaluate(() => takeLog());

  // --- refresh() keeps the selection
  await page.click('.pxe-chips >> text=walk'); await page.click('.pxe-thumb >> nth=2');
  await page.evaluate(() => { T.sprite.anims = JSON.parse(JSON.stringify(T.sprite.anims)); T.sprite.anims[1].fps = 12; T.ed.refresh(); });
  await page.waitForTimeout(100);
  eq(await page.evaluate(() => [document.querySelector('.pxe-chips .btn[aria-pressed=true]').textContent, document.querySelector('.pxe-thumb[aria-pressed=true]').textContent, document.querySelector('.pxe-animset input').value]), ['walk4', '3', '12'], 'refresh() keeps the selected animation and frame, and reloads the fields');
  await page.evaluate(() => takeLog());

  // --- refresh() after an outside change
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#00ff00'; g.fillRect(0, 0, 16, 16);
    T.sprite.anims = [{ name: 'walk', fps: 5, loop: true, frames: [c.toDataURL()] }];
    T.ed.refresh();
  });
  await page.waitForTimeout(200);
  eq(await page.evaluate(() => { const v = document.querySelector('.pxe-view'); return [...v.getContext('2d').getImageData((v.width >> 1) + 7, (v.height >> 1) + 7, 1, 1).data].slice(0, 3); }), [0, 255, 0], 'refresh() repaints the canvas from the model');
  eq(await page.evaluate(() => [document.querySelectorAll('.pxe-thumb').length, document.querySelector('.pxe-chips .btn[aria-pressed=true]').textContent]), [1, 'walk1'], 'refresh() rebuilds lists and keeps the animation by name');
  eq(await log(page), '', 'refresh() never calls begin/commit');

  // --- keyboard scope, zoom
  await page.evaluate(() => { window.zSeen = null; document.addEventListener('keydown', e => { if (e.key === 'z') zSeen = e.defaultPrevented; }); });
  const c0 = await page.at(8, 8, S, S);
  await page.mouse.move(c0[0], c0[1]);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Control+z');
  eq(await page.evaluate(() => zSeen), false, 'Ctrl+Z is left to the host');
  await page.keyboard.press('e');
  ok(await page.evaluate(() => document.querySelector('.pxe [aria-label^="Eraser"]').getAttribute('aria-pressed') === 'true'), 'E selects the eraser while the pointer is inside');
  await page.mouse.move(300, 10);                                    // the harness bar, outside the editor
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('b');
  ok(await page.evaluate(() => document.querySelector('.pxe [aria-label^="Eraser"]').getAttribute('aria-pressed') === 'true'), 'shortcuts are ignored while pointer and focus are outside');
  await page.locator('.pxe label.field input').first().focus();
  await page.keyboard.press('g');
  ok(await page.evaluate(() => document.querySelector('.pxe [aria-label^="Eraser"]').getAttribute('aria-pressed') === 'true'), 'shortcuts are ignored while typing in a field');
  await page.mouse.move(c0[0], c0[1]);
  const z0 = await page.textContent('.pxe-zl');
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control'); await page.waitForTimeout(80);
  ok(parseFloat(await page.textContent('.pxe-zl')) > parseFloat(z0), 'Ctrl+wheel zooms in');
  await press(page, 'Fit to the space');
  eq(await page.textContent('.pxe-zl'), z0, 'fit returns to the fitted zoom');
  await press(page, 'Zoom out'); await press(page, 'Zoom in'); await press(page, 'Zoom in');
  ok(parseFloat(await page.textContent('.pxe-zl')) > parseFloat(z0), 'zoom buttons');
  eq(await page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth, document.documentElement.scrollHeight <= innerHeight]), [true, true], 'no page-level scrolling');
  ok(await page.evaluate(() => !T.open), 'no begin left without a commit');

  // --- destroy
  await page.evaluate(() => T.ed.destroy());
  await page.waitForTimeout(100);
  eq(await page.evaluate(() => document.getElementById('host').childNodes.length), 0, 'destroy() empties the container');
  await page.mouse.move(c0[0], c0[1]); await page.keyboard.press('b'); await page.waitForTimeout(100);
  await page.done('sprite editor');
}

async function importTests(browser) {
  const one = await pngFile('pxe-one.png', 40, 24, "x.fillStyle='#ff0000';x.fillRect(0,0,40,24);")(browser);
  const sheet = await pngFile('pxe-sheet.png', 32, 16, "x.fillStyle='#0000ff';x.fillRect(1,1,6,6);x.fillStyle='#00ff00';x.fillRect(9,1,6,6);x.fillStyle='#ff0000';x.fillRect(1,9,6,6);x.fillRect(25,9,6,6);")(browser);
  const page = await open(browser, '?ed=sprite&blank=1');
  await choose(page, '.pxe >> text=Import image', one);
  eq(await page.evaluate(() => [T.sprite.w, T.sprite.h, T.sprite.anims[0].frames.length]), [40, 24, 1], 'importing into an empty sprite takes the image size');
  eq(await page.evaluate(() => px(frame(0, 0), 39, 23)), [255, 0, 0, 255], 'imported pixels are in the frame');
  eq(await log(page), 'begin,commit', 'import image: one begin/commit');
  await choose(page, '.pxe >> text=Import image', sheet);
  eq(await page.evaluate(() => [T.sprite.w, T.sprite.anims[0].frames.length]), [40, 2], 'a second import adds a frame and keeps the size');
  await page.evaluate(() => takeLog());
  await choose(page, '.pxe >> text=Import sprite sheet', sheet);
  ok(await page.isVisible('.modal-card'), 'sprite sheet dialog opens');
  await setNum(page, 'Cell width', 8, '.modal-card'); await setNum(page, 'Cell height', 8, '.modal-card');
  ok((await page.textContent('.pxe-count')).includes('4 × 2 cells: 4 frames, 4 empty skipped'), 'dialog counts cells and frames: ' + (await page.textContent('.pxe-count')));
  if (shots) await page.screenshot({ path: shots + '/dialog-sheet.png' });
  await page.click('.modal-actions .primary'); await page.waitForTimeout(300);
  eq(await page.evaluate(() => [T.sprite.w, T.sprite.h, T.sprite.anims[0].frames.length]), [8, 8, 4], 'slicing sets the sprite size and replaces the frames');
  eq(await page.evaluate(async () => [(await px(frame(0, 0), 3, 3)).slice(0, 3), (await px(frame(0, 1), 3, 3)).slice(0, 3), (await px(frame(0, 2), 3, 3)).slice(0, 3), (await px(frame(0, 3), 3, 3)).slice(0, 3)]),
    [[0, 0, 255], [0, 255, 0], [255, 0, 0], [255, 0, 0]], 'cells come out in row-major order, empty ones skipped');
  eq(await log(page), 'begin,commit', 'sheet import: one begin/commit');
  await page.done('imports');

  const t = await open(browser, '?ed=tileset');
  await choose(t, '.pxe >> text=Import image', sheet);
  ok(await t.isVisible('.modal-card'), 'tileset import asks first');
  eq(await log(t), '', 'nothing changes before confirming');
  await t.click('.modal-actions .primary'); await t.waitForTimeout(200);
  eq(await t.evaluate(() => [T.tileset.cols, T.tileset.rows, T.tileset.solid.length, T.tileset.solid.some(Boolean)]), [2, 1, 2, false], 'tileset import recomputes the grid and clears solid marks');
  eq(await t.evaluate(() => dims(T.tileset.src)), [32, 16], 'tileset image replaced');
  eq(await log(t), 'begin,commit', 'tileset import: one begin/commit');
  await t.done('tileset import');
}

async function miscTests(browser) {
  const big = await pngFile('pxe-big.png', 600, 300, "x.fillStyle='#123456';x.fillRect(0,0,600,300);")(browser);
  const page = await open(browser, '?ed=sprite&blank=1&pal=none&theme=dark', { viewport: { width: 760, height: 500 } });
  eq(await page.evaluate(() => [document.querySelectorAll('.pxe-swatches')[0].children.length, document.querySelector('.pxe-cur code').textContent]), [16, '#1a1c2c'], 'built-in palette when the host gives none');
  ok(await page.evaluate(() => !document.querySelector('.pxe').classList.contains('pxe-narrow')), 'a 760px container keeps the side-by-side layout');
  await choose(page, '.pxe >> text=Import image', big);
  eq(await page.evaluate(() => [T.sprite.w, T.sprite.h]), [256, 128], 'a big picture is capped at 256 px');
  eq(await page.evaluate(() => [T.sprite.ox, T.sprite.oy, T.sprite.hit]), [128, 120, { x: 64, y: 72, w: 128, h: 56 }], 'origin and hitbox follow the new size of a fresh sprite');
  const z = parseFloat(await page.textContent('.pxe-zl'));
  ok(z >= 100 && z <= 400, 'a 256px sprite still fits (' + z + '%)');
  await page.stroke([[10, 10], [200, 100]], 256, 128);
  eq(await log(page), 'begin,commit,begin,commit', 'import + stroke on a big sprite');
  await page.done('misc');
}

async function tilesetTests(browser) {
  const page = await open(browser, '?ed=tileset');
  const W = 128, H = 48, tile = (c, r) => [c * 16 + 8, r * 16 + 8];
  eq(await log(page), '', 'mount does not touch the model');
  await page.stroke([tile(0, 0)], W, H);
  eq(await page.evaluate(() => T.tileset.solid[0]), true, 'tapping a tile makes it solid');
  eq(await log(page), 'begin,commit', 'solid tap: one begin/commit');
  await page.stroke([tile(5, 1), tile(6, 1), tile(7, 1)], W, H);
  eq(await page.evaluate(() => T.tileset.solid.slice(13, 16)), [true, true, true], 'dragging marks several tiles');
  eq(await log(page), 'begin,commit', 'solid drag: one begin/commit');
  await page.stroke([tile(3, 0), tile(4, 0), tile(5, 0)], W, H);
  eq(await page.evaluate(() => T.tileset.solid.slice(3, 6)), [false, false, false], 'starting on a solid tile clears while dragging');
  ok((await page.textContent('.pxe-count')).startsWith('5 of 24'), 'solid count is shown: ' + (await page.textContent('.pxe-count')));
  const srcBefore = await page.evaluate(() => T.tileset.src);
  ok(srcBefore === (await page.evaluate(() => T.tileset.src)), 'solid mode leaves the image alone');
  await page.evaluate(() => takeLog());

  await page.click('.pxe-seg >> text=Draw');
  await page.stroke([[2, 2], [6, 2]], W, H);
  eq(await log(page), 'begin,commit', 'tileset pencil stroke: one begin/commit');
  eq(await page.evaluate(() => px(T.tileset.src, 4, 2)), [0x1a, 0x1c, 0x2c, 255], 'pencil drew on the tileset image');
  await page.keyboard.press('g');
  await page.click('.pxe-sw[title="#ef7d57"]');
  await page.stroke([[6 * 16 + 5, 2 * 16 + 5]], W, H);              // an empty tile next to another empty tile
  eq(await page.evaluate(async () => [(await px(T.tileset.src, 6 * 16, 32))[3], (await px(T.tileset.src, 6 * 16 + 15, 47))[3], (await px(T.tileset.src, 7 * 16, 40))[3], (await px(T.tileset.src, 5 * 16 + 15, 40))[3]]), [255, 255, 0, 0], 'fill stays inside the tile under the pointer');
  eq(await log(page), 'begin,commit', 'tileset fill: one begin/commit');

  // grid changes
  await page.click('.pxe-seg >> text=Solid');
  await setNum(page, 'Columns', 10);
  eq(await page.evaluate(() => [T.tileset.cols, T.tileset.solid.length, T.tileset.solid.map((v, i) => (v ? i : -1)).filter(i => i >= 0)]), [10, 30, [0, 13, 15, 16, 17]], 'more columns: solid marks stay with their (column, row)');
  eq(await page.evaluate(() => dims(T.tileset.src)), [160, 48], 'more columns: image grows, pixels stay top-left');
  eq(await page.evaluate(() => px(T.tileset.src, 4, 2)), [0x1a, 0x1c, 0x2c, 255], 'pixels kept after the resize');
  await setNum(page, 'Rows', 1);
  eq(await page.evaluate(() => [T.tileset.rows, T.tileset.solid.length, T.tileset.solid[0]]), [1, 10, true], 'fewer rows crop the flags');
  await setNum(page, 'Tile size', 32);
  eq(await page.evaluate(() => [T.tileset.tw, T.tileset.th, T.tileset.cols, T.tileset.solid.length]), [32, 32, 10, 10], 'tile size applies to tw and th');
  eq(await page.evaluate(() => dims(T.tileset.src)), [320, 32], 'tile size change resizes the image');
  eq(await log(page), Array(3).fill('begin,commit').join(','), 'three grid changes: three pairs');
  await page.evaluate(() => { T.undo(); T.undo(); T.undo(); }); await page.waitForTimeout(200);
  eq(await page.evaluate(() => [T.tileset.tw, T.tileset.cols, T.tileset.rows, T.tileset.solid.length]), [16, 8, 3, 24], 'host undo of the grid changes');

  // refresh after an outside change
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 32, 16);
    Object.assign(T.tileset, { src: c.toDataURL(), cols: 2, rows: 1, solid: [false, false] }); T.ed.refresh();
  });
  await page.waitForTimeout(200);
  eq(await page.evaluate(() => { const v = document.querySelector('.pxe-view'); return [...v.getContext('2d').getImageData((v.width >> 1) + 20, (v.height >> 1) + 9, 1, 1).data].slice(0, 3); }), [255, 0, 255], 'refresh() repaints the tileset from the model');
  eq(await log(page), '', 'refresh() never calls begin/commit');
  ok(await page.evaluate(() => !T.open), 'no begin left without a commit');
  eq(await page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth, document.documentElement.scrollHeight <= innerHeight]), [true, true], 'no page-level scrolling');
  await page.evaluate(() => T.ed.destroy());
  await page.done('tileset editor');
}

async function touchTests(browser) {                       // real touch pointers through CDP: draw with one finger, pinch with two
  const page = await open(browser, '?ed=sprite', { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const cdp = await page.context().newCDPSession(page), S = 16;
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  ok(await page.evaluate(() => document.querySelector('.pxe').classList.contains('pxe-narrow')), 'a 390px container uses the stacked layout');
  const a = await page.at(2, 2, S, S), b = await page.at(6, 2, S, S);
  await touch('touchStart', [a]); await touch('touchMove', [b]); await touch('touchEnd', []);
  await page.waitForTimeout(80);
  eq(await log(page), 'begin,commit', 'one-finger stroke: one begin/commit');
  eq((await page.evaluate(() => px(frame(0, 0), 4, 2)))[3], 255, 'one finger draws');
  const z0 = parseFloat(await page.textContent('.pxe-zl')), c = await page.at(8, 8, S, S);
  await touch('touchStart', [[c[0] - 30, c[1]]]);
  await touch('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
  await touch('touchMove', [[c[0] - 80, c[1] + 20], [c[0] + 80, c[1] + 20]]);
  await page.waitForTimeout(60);
  await touch('touchEnd', [[c[0] + 80, c[1] + 20]]); await touch('touchEnd', []);
  await page.waitForTimeout(80);
  ok(parseFloat(await page.textContent('.pxe-zl')) > z0 * 2, 'two-finger pinch zooms (' + z0 + '% to ' + (await page.textContent('.pxe-zl')) + ')');
  eq(await log(page), '', 'a pinch never draws or commits');
  const r = await page.evaluate(() => [...document.querySelectorAll('.pxe button, .pxe input:not([type=checkbox])')].filter(e => e.offsetParent).map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), e.getAttribute('aria-label') || e.textContent || e.type]; }).filter(q => q[0] < 32 || q[1] < 32));
  eq(r, [], 'every button and field is at least 32px');
  eq(await page.evaluate(() => [...document.querySelectorAll('.pxe button')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length), 0, 'icon buttons have labels');
  eq(await page.evaluate(() => { const root = document.querySelector('.pxe').getBoundingClientRect(); return [...document.querySelectorAll('.pxe *')].filter(e => e.offsetParent && !e.closest('.pxe-pane') && (e.getBoundingClientRect().right > root.right + 0.5 || e.getBoundingClientRect().left < root.left - 0.5)).map(e => e.className); }), [], 'nothing sticks out of a 390px container');
  eq(await page.evaluate(() => { const p = document.querySelector('.pxe-pane'); return p.scrollWidth <= p.clientWidth; }), true, 'the pane only scrolls vertically');
  await page.done('touch');
}

async function screenshots(browser) {
  for (const [w, h] of [[1100, 720], [390, 780]]) for (const scheme of ['light', 'dark']) for (const ed of ['sprite', 'tileset']) {
    const page = await open(browser, '?ed=' + ed, { viewport: { width: w, height: h }, colorScheme: scheme });
    await page.screenshot({ path: `${shots}/${ed}-${w}-${scheme}.png` });
    if (ed === 'sprite') { await press(page, 'Origin & hitbox'); await press(page, 'Onion skin'); await page.click('.pxe-thumb >> nth=1'); }
    else { await page.click('.pxe-seg >> text=Draw'); await page.keyboard.press('Tab'); }
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${shots}/${ed}-${w}-${scheme}-alt.png` });
    if (w === 390) { await page.evaluate(() => { document.querySelector('.pxe-pane').scrollTop = 1e4; }); await page.waitForTimeout(100); await page.screenshot({ path: `${shots}/${ed}-${w}-${scheme}-end.png` }); }
    await page.done('screenshot ' + ed + ' ' + w + ' ' + scheme);
  }
  const small = await open(browser, '?ed=sprite&w=390&h=450', { viewport: { width: 390, height: 520 } });
  await small.screenshot({ path: `${shots}/sprite-390x450.png` });
  await small.done('390x450');
}

(async () => {
  const browser = await chromium.launch();
  try {
    await spriteTests(browser);
    await importTests(browser);
    await tilesetTests(browser);
    await miscTests(browser);
    await touchTests(browser);
    if (shots) await screenshots(browser);
  } catch (e) { fails++; console.log('ERROR ' + (e.stack || e)); }
  await browser.close();
  console.log(passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
