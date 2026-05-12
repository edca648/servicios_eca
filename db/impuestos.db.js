import { API, SHEETS } from '../core/api.js';
import { Cache }       from '../core/cache.js';
import { Store }       from '../core/store.js';
import { genId, parseBool } from '../core/utils.js';

const KEY = 'impuestos';

export const ImpuestosDB = {
  async getAll() {
    if (Cache.get(KEY)) return Cache.get(KEY);
    const rows = await API.getAll(SHEETS.IMPUESTOS);
    const data = rows.map(i => ({
      ...i,
      tasa:            parseFloat(i.tasa) || 0,
      agregarAlPrecio: parseBool(i.agregarAlPrecio),
    }));
    Cache.set(KEY, data);
    return data;
  },

  async save(impuesto) {
    if (!impuesto.id) impuesto.id = genId();
    const payload = { ...impuesto, agregarAlPrecio: impuesto.agregarAlPrecio ? 'TRUE' : 'FALSE' };
    const saved   = await API.save(SHEETS.IMPUESTOS, payload);
    Cache.clear(KEY);
    // FIX #5: Invalidar cache de tasas en el Store para que calcTotales use valores frescos
    Store.invalidateRates();
    return saved;
  },

  async delete(id) {
    await API.delete(SHEETS.IMPUESTOS, id);
    Cache.clear(KEY);
    // FIX #5: Invalidar cache de tasas en el Store
    Store.invalidateRates();
  },
};
