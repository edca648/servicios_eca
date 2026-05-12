import { API, SHEETS } from '../core/api.js';
import { Cache }       from '../core/cache.js';
import { genId, parseBool } from '../core/utils.js';

const KEY = 'articulos';

function normalize(a) {
  return {
    ...a,
    nombre:        (a.nombre        || '').toString().trim(),
    categoria:     (a.categoria     || '').toString().trim(),
    referencia:    (a.referencia    || '').toString().trim(),
    vendidoPor:    (a.vendidoPor    || '').toString().trim(),
    precioMaterial: parseFloat(a.precioMaterial) || 0,
    precioServicio: parseFloat(a.precioServicio) || 0,
    stock:          parseFloat(a.stock)          || 0,
    inventario:     parseBool(a.inventario),
    impuesto:       parseBool(a.impuesto),
    rep: a.repTipo ? { tipo: a.repTipo, valor: a.repValor } : null,
  };
}

export const ArticulosDB = {
  async getAll() {
    if (Cache.get(KEY)) return Cache.get(KEY);
    const rows = await API.getAll(SHEETS.ARTICULOS);
    const data = rows.map(normalize);
    Cache.set(KEY, data);
    return data;
  },

  async getById(id) {
    const all = await this.getAll();
    return all.find(a => a.id === id) || null;
  },

  async search(query = '', categoria = '') {
    const all = await this.getAll();
    const q   = (query || '').trim().toLowerCase();
    return all.filter(a => {
      const matchQ   = !q || (a.nombre || '').toLowerCase().includes(q)
                          || (a.referencia || '').toLowerCase().includes(q);
      const matchCat = !categoria || categoria === 'todas' || a.categoria === categoria;
      return matchQ && matchCat;
    });
  },

  async save(articulo) {
    const payload = { ...articulo };
    if (payload.rep) {
      payload.repTipo  = payload.rep.tipo;
      payload.repValor = payload.rep.valor;
      delete payload.rep;
    }
    if (!payload.id) {
      payload.id        = genId();
      payload.createdAt = new Date().toISOString();
    }
    payload.inventario = payload.inventario ? 'TRUE' : 'FALSE';
    payload.impuesto   = payload.impuesto   ? 'TRUE' : 'FALSE';

    const saved = await API.save(SHEETS.ARTICULOS, payload);
    Cache.clear(KEY);
    return saved;
  },

  async delete(id) {
    await API.delete(SHEETS.ARTICULOS, id);
    Cache.clear(KEY);
  },

  // ─── STOCK LOCAL (en memoria) ───────────────────────────────────────────────
  // Muta el cache en memoria SIN llamar a la API.
  // El stock real en Sheets solo se actualiza al llamar flushStockToSheets().

  /**
   * Descuenta qty unidades del stock local del artículo.
   * Solo actúa si el artículo tiene inventario activo.
   * @returns {boolean} false si no hay stock suficiente (el caller debe bloquearlo)
   */
  decrementStockLocal(id, qty) {
    const cache = Cache.get(KEY);
    if (!cache) return true; // sin cache no podemos validar, dejar pasar
    const art = cache.find(a => a.id === id);
    if (!art || !art.inventario) return true; // sin inventario, sin restricción
    if (art.stock < qty) return false;        // stock insuficiente
    art.stock = parseFloat((art.stock - qty).toFixed(4));
    return true;
  },

  /**
   * Devuelve qty unidades al stock local (al quitar/editar un item del carrito).
   */
  incrementStockLocal(id, qty) {
    const cache = Cache.get(KEY);
    if (!cache) return;
    const art = cache.find(a => a.id === id);
    if (!art || !art.inventario) return;
    art.stock = parseFloat((art.stock + qty).toFixed(4));
  },

  /**
   * Persiste en Sheets el stock de todos los artículos afectados.
   * Se llama SOLO al guardar la cotización.
   * @param {Array<{id, stockAnterior, stockNuevo}>} cambios
   */
  async flushStockToSheets(cambios) {
    if (!cambios.length) return;
    const all = await this.getAll();
    await Promise.all(
      cambios.map(({ id }) => {
        const art = all.find(a => a.id === id);
        if (!art) return Promise.resolve();
        // Preparar payload igual que ArticulosDB.save pero sin generar nuevo id
        const payload = {
          ...art,
          stock:      art.stock,
          inventario: art.inventario ? 'TRUE' : 'FALSE',
          impuesto:   art.impuesto   ? 'TRUE' : 'FALSE',
        };
        if (art.rep) {
          payload.repTipo  = art.rep.tipo;
          payload.repValor = art.rep.valor;
          delete payload.rep;
        }
        return API.save(SHEETS.ARTICULOS, payload);
      })
    );

  },
};