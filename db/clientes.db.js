import { API, SHEETS } from '../core/api.js';
import { Cache }       from '../core/cache.js';
import { genId }       from '../core/utils.js';

const KEY = 'clientes';

export const ClientesDB = {
  async getAll() {
    if (Cache.get(KEY)) return Cache.get(KEY);
    const data = await API.getAll(SHEETS.CLIENTES);
    Cache.set(KEY, data);
    return data;
  },

  async save(cliente) {
    if (!cliente.id) {
      const all      = await this.getAll();
      cliente.id     = genId();
      cliente.codigo = 'CLI-' + String(all.length + 1).padStart(4, '0');
      cliente.createdAt = new Date().toISOString();
    }
    const saved = await API.save(SHEETS.CLIENTES, cliente);
    Cache.clear(KEY);
    return saved;
  },

  async delete(id) {
    await API.delete(SHEETS.CLIENTES, id);
    Cache.clear(KEY);
  },

  async search(query = '') {
    const all = await this.getAll();
    if (!query) return all;
    const q = query.toLowerCase().trim();
    return all.filter(c =>
      (c.nombre  || '').toLowerCase().includes(q) ||
      (c.telefono|| '').includes(q) ||
      (c.codigo  || '').toLowerCase().includes(q)
    );
  },
};
