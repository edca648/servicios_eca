import { API, SHEETS } from '../core/api.js';
import { genId }       from '../core/utils.js';

export const CotizacionesDB = {
  async getAll() {
    const data = await API.getAll(SHEETS.COTIZACIONES);
    return data.map(c => ({
      ...c,
      numero:        parseInt(c.numero)         || 0,
      totalServicio: parseFloat(c.totalServicio) || 0,
      totalMaterial: parseFloat(c.totalMaterial) || 0,
      totalCompra:   parseFloat(c.totalCompra)   || 0,
      total:         parseFloat(c.total)         || 0,
    }));
  },

  async save(cotizacion) {
    if (!cotizacion.id) {
      const all           = await this.getAll();
      cotizacion.id       = genId();
      // Número provisional si estamos offline
      cotizacion.numero   = navigator.onLine
        ? all.length + 1
        : 'TEMP-' + (all.filter(c => String(c.numero).startsWith('TEMP')).length + 1);
      cotizacion.fecha    = new Date().toISOString();
      cotizacion.estado   = 'guardado';
    }
    const saved = await API.save(SHEETS.COTIZACIONES, {
      id:            cotizacion.id,
      numero:        cotizacion.numero,
      fecha:         cotizacion.fecha,
      estado:        cotizacion.estado,
      clienteId:     cotizacion.clienteId  || '',
      totalServicio: cotizacion.totalServicio,
      totalMaterial: cotizacion.totalMaterial,
      totalCompra:   cotizacion.totalCompra || 0,
      total:         cotizacion.total,
    });

    const items = [
      ...(cotizacion.items_servicio || []),
      ...(cotizacion.items_material || []),
      ...(cotizacion.items_compra   || []),
    ];
    for (const item of items) {
      await API.save(SHEETS.COTIZACION_ITEMS, {
        id:             genId(),
        cotizacionId:   cotizacion.id,
        tipo:           item.tipo,
        articuloId:     item.articuloId,
        nombre:         item.nombre,
        cantidad:       item.cantidad,
        precioUnitario: item.precioUnitario,
        descuentoId:    item.descuentoId    || '',
        aplicarImpuesto: item.aplicarImpuesto ? 'TRUE' : 'FALSE',
      });
    }
    return saved;
  },

  async getProyectos() {
    const all = await this.getAll();
    return all.filter(c => c.estado === 'guardado' || c.estado === 'pagado');
  },

  async getItemsByProyecto(cotizacionId) {
    const all = await API.getAll(SHEETS.COTIZACION_ITEMS);
    return all.filter(i => i.cotizacionId === cotizacionId);
  },

  async updateItem(itemId, cambios) {
    const all  = await API.getAll(SHEETS.COTIZACION_ITEMS);
    const item = all.find(i => i.id === itemId);
    if (!item) throw new Error('Item no encontrado: ' + itemId);
    await API.save(SHEETS.COTIZACION_ITEMS, { ...item, ...cambios });
  },

  async deleteItem(itemId) {
    await API.delete(SHEETS.COTIZACION_ITEMS, itemId);
  },

  async delete(id) {
    await API.delete(SHEETS.COTIZACIONES, id);
  },
};
