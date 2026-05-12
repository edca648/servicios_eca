import { API, SHEETS } from '../core/api.js';
import { Cache }       from '../core/cache.js';
import { Store }       from '../core/store.js';
import { genId }       from '../core/utils.js';

const KEY = 'descuentos';

export const DescuentosDB = {
  async getAll() {
    if (Cache.get(KEY)) return Cache.get(KEY);
    const rows = await API.getAll(SHEETS.DESCUENTOS);
    const data = rows.map(d => ({ ...d, valor: parseFloat(d.valor) || 0 }));
    Cache.set(KEY, data);
    return data;
  },

  async save(descuento) {
    if (!descuento.id) descuento.id = genId();
    const saved = await API.save(SHEETS.DESCUENTOS, descuento);
    Cache.clear(KEY);
    // FIX #5: Invalidar cache de tasas en el Store para que calcTotales use valores frescos
    Store.invalidateRates();
    return saved;
  },

  async delete(id) {
    await API.delete(SHEETS.DESCUENTOS, id);
    Cache.clear(KEY);
    // FIX #5: Invalidar cache de tasas en el Store
    Store.invalidateRates();
  },
};
