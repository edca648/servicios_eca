// =============================================
// ECA · core/cache.js
// Cache en memoria con TTL de 10 minutos.
// Se invalida tras cada escritura o al expirar.
// =============================================

const _store = {};
const TTL_MS = 10 * 60 * 1000; // 10 minutos

export const Cache = {
  get(key) {
    const entry = _store[key];
    if (!entry) return undefined;
    // FIX: Invalidar si expiró el TTL
    if (Date.now() - entry.ts > TTL_MS) {
      delete _store[key];
      return undefined;
    }
    return entry.val;
  },

  set(key, val) {
    _store[key] = { val, ts: Date.now() };
  },

  clear(key)  { delete _store[key]; },
  clearAll()  { Object.keys(_store).forEach(k => delete _store[k]); },
};
