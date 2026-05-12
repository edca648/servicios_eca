import { API, SHEETS } from '../core/api.js';
import { Cache }       from '../core/cache.js';
import { genId }       from '../core/utils.js';

const KEY = 'categorias';
export const CATEGORIAS_DEFAULT = [
  'Cables','Ranuras','Fuerza','Iluminacion','Motor','Tuberia','Especiales','Clima','Otros',
];

export const CategoriasDB = {
  async getAll() {
    if (Cache.get(KEY)) return Cache.get(KEY);
    try {
      const rows = await API.getAll(SHEETS.CATEGORIAS);
      const cats = rows.length ? rows.map(r => r.nombre).filter(Boolean) : CATEGORIAS_DEFAULT;
      Cache.set(KEY, cats);
      return cats;
    } catch { return CATEGORIAS_DEFAULT; }
  },

  async add(nombre) {
    const all = await this.getAll();
    if (all.includes(nombre)) return;
    await API.save(SHEETS.CATEGORIAS, { id: genId(), nombre });
    Cache.clear(KEY);
  },

  async update(original, nuevo) {
    const rows = await API.getAll(SHEETS.CATEGORIAS);
    const row  = rows.find(r => r.nombre === original);
    await API.save(SHEETS.CATEGORIAS, row ? { ...row, nombre: nuevo } : { id: genId(), nombre: nuevo });
    Cache.clear(KEY);
  },

  async delete(nombre) {
    const rows = await API.getAll(SHEETS.CATEGORIAS);
    const row  = rows.find(r => r.nombre === nombre);
    if (row?.id) await API.delete(SHEETS.CATEGORIAS, row.id);
    Cache.clear(KEY);
  },
};
