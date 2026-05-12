// =============================================
// ECA · core/idb.js
// Capa IndexedDB.
// Dos object stores:
//   "data"  — espejo local de cada sheet (key: sheetName)
//   "queue" — operaciones pendientes de sincronizar con el servidor
//
// Para agregar un store nuevo: incrementar DB_VERSION
// y agregar la creación en onupgradeneeded.
// =============================================

const DB_NAME    = 'eca-db';
const DB_VERSION = 1;

let _db = null;

function _open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Espejo de datos por sheet
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data'); // key = sheetName
      }
      // Cola de operaciones pendientes
      if (!db.objectStoreNames.contains('queue')) {
        const qs = db.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
        qs.createIndex('by_sheet', 'sheet', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = ()  => reject(req.error);
  });
}

function _tx(store, mode, fn) {
  return _open().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, mode);
    const res = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(res?.result ?? res);
    tx.onerror    = ()  => reject(tx.error);
    if (res instanceof IDBRequest) {
      res.onsuccess = () => {}; // result available via tx.oncomplete
    }
  }));
}

// ── DATA store ───────────────────────────────────────────────────────────────
export const IDB = {
  // Guardar snapshot completo de un sheet
  setSheet(sheet, rows) {
    return _open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('data', 'readwrite');
      const req = tx.objectStore('data').put(rows, sheet);
      tx.oncomplete = () => resolve();
      tx.onerror    = ()  => reject(tx.error);
    }));
  },

  // Leer snapshot de un sheet (null si no existe)
  getSheet(sheet) {
    return _open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('data', 'readonly');
      const req = tx.objectStore('data').get(sheet);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = ()  => reject(req.error);
    }));
  },

  // Actualizar un registro individual dentro de un sheet local
  async upsertRow(sheet, row) {
    const rows = await this.getSheet(sheet) || [];
    const idx  = rows.findIndex(r => r.id === row.id);
    if (idx !== -1) rows[idx] = row;
    else rows.push(row);
    return this.setSheet(sheet, rows);
  },

  // Eliminar un registro individual dentro del snapshot local
  async removeRow(sheet, id) {
    const rows = await this.getSheet(sheet) || [];
    return this.setSheet(sheet, rows.filter(r => r.id !== id));
  },

// ── QUEUE store ──────────────────────────────────────────────────────────────
  // Encolar una operación para sincronizar después
  // op: { action: 'save'|'delete', sheet, data?, id? }
  enqueue(op) {
    return _open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('queue', 'readwrite');
      const req = tx.objectStore('queue').add({ ...op, ts: Date.now() });
      req.onsuccess = () => resolve(req.result); // retorna qid
      tx.onerror    = ()  => reject(tx.error);
    }));
  },

  // Leer todas las operaciones pendientes en orden FIFO
  getAllQueued() {
    return _open().then(db => new Promise((resolve, reject) => {
      const tx   = db.transaction('queue', 'readonly');
      const req  = tx.objectStore('queue').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = ()  => reject(req.error);
    }));
  },

  // Eliminar una operación ya sincronizada
  dequeue(qid) {
    return _open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('queue', 'readwrite');
      const req = tx.objectStore('queue').delete(qid);
      tx.oncomplete = () => resolve();
      tx.onerror    = ()  => reject(tx.error);
    }));
  },

  // Cantidad de operaciones pendientes
  queueCount() {
    return _open().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction('queue', 'readonly');
      const req = tx.objectStore('queue').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = ()  => reject(req.error);
    }));
  },
};
