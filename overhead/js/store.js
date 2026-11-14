/* Overhead Studio: where projects are kept. Today that is this browser's IndexedDB (a small
   built-in database with room for lots of art). Everything goes through this one object, so
   moving to cloud saving later means replacing only this file. Every method returns a Promise. */
(function () {
  'use strict';
  const OV = window.OV;
  const DB = 'overhead-studio', LAST = 'overhead.lastProject';
  let dbp = null; const mem = new Map();

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(res => {
      try {
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { const db = rq.result; db.createObjectStore('projects', { keyPath: 'id' }); db.createObjectStore('meta', { keyPath: 'id' }); };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  const done = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });

  OV.Store = {
    persistent: true,
    async list() {
      const db = await open();
      if (!db) return Array.from(mem.values()).map(p => ({ id: p.id, name: p.name, updated: p.updated || 0 }));
      try { const all = await done(db.transaction('meta').objectStore('meta').getAll()); return all.sort((a, b) => b.updated - a.updated); } catch (e) { return []; }
    },
    async load(id) {
      const db = await open();
      if (!db) return mem.get(id) || null;
      try { const rec = await done(db.transaction('projects').objectStore('projects').get(id)); return rec ? rec.data : null; } catch (e) { return null; }
    },
    async save(project) {
      const db = await open(), updated = Date.now();
      if (!db) { mem.set(project.id, project); this.persistent = false; return false; }
      try {
        const tx = db.transaction(['projects', 'meta'], 'readwrite');
        tx.objectStore('projects').put({ id: project.id, data: project });
        tx.objectStore('meta').put({ id: project.id, name: project.name, updated: updated });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
        return true;
      } catch (e) { return false; }
    },
    async remove(id) {
      const db = await open(); mem.delete(id);
      if (!db) return;
      try { const tx = db.transaction(['projects', 'meta'], 'readwrite'); tx.objectStore('projects').delete(id); tx.objectStore('meta').delete(id); await new Promise(res => { tx.oncomplete = res; tx.onerror = res; }); } catch (e) {}
    },
    lastId() { try { return localStorage.getItem(LAST); } catch (e) { return null; } },
    setLast(id) { try { localStorage.setItem(LAST, id); } catch (e) {} },
  };
})();
