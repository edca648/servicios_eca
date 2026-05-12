// =============================================
// ECA · core/store.js
// Estado global de la cotizacion activa.
// Solo vive en memoria; se persiste al guardar.
// =============================================

import { ImpuestosDB }  from '../db/impuestos.db.js';
import { DescuentosDB } from '../db/descuentos.db.js';

const _state = {
  items_servicio: [],
  items_material: [],
  items_compra:   [],
  clienteId: null,
};

// FIX: Cache local para no llamar la DB en cada recalculo de totales
let _impuestosCache  = null;
let _descuentosCache = null;

// STOCK: Mapa de cambios de stock en esta sesión de cotización.
// Clave: articuloId, Valor: { stockAnterior, cantidadTotal }
// Se usa para saber qué artículos hay que persistir en Sheets al guardar.
const _stockCambios = new Map();

export const Store = {
  get() { return _state; },

  reset() {
    _state.items_servicio = [];
    _state.items_material = [];
    _state.items_compra   = [];
    _state.clienteId = null;
    _stockCambios.clear(); // STOCK: limpiar cambios al resetear
  },

  // FIX: Invalidar caches de impuestos/descuentos cuando se modifiquen
  invalidateRates() {
    _impuestosCache  = null;
    _descuentosCache = null;
  },

  /**
   * Agrega o acumula un item en el carrito.
   * Si es material con inventario, registra el cambio de stock.
   * @param {string} tipo - 'servicio' | 'material' | 'compra'
   * @param {object} item
   * @param {number} [stockAnterior] - stock antes del decremento (para poder revertir)
   */
  addItem(tipo, item, stockAnterior) {
    const key      = tipo === 'servicio' ? 'items_servicio' : tipo === 'material' ? 'items_material' : 'items_compra';
    const existing = _state[key].find(i => i.articuloId === item.articuloId);
    if (existing) existing.cantidad += item.cantidad;
    else          _state[key].push({ ...item, tipo });

    // STOCK: registrar el cambio para materiales con inventario
    if (tipo === 'material' && stockAnterior !== undefined) {
      if (!_stockCambios.has(item.articuloId)) {
        _stockCambios.set(item.articuloId, { stockAnterior, cantidadTotal: 0 });
      }
      _stockCambios.get(item.articuloId).cantidadTotal += item.cantidad;
    }
  },

  /**
   * Actualiza cantidad (y opcionalmente otros campos) de un item del carrito.
   * Si es material con inventario, ajusta el delta de stock en memoria.
   * @param {string} tipo
   * @param {string} articuloId
   * @param {object} cambios  - debe incluir `cantidad` si cambia
   * @param {Function} [ajustarStock] - callback(delta) para ajustar stock local
   */
  updateItem(tipo, articuloId, cambios, ajustarStock) {
    const key = tipo === 'servicio' ? 'items_servicio' : tipo === 'material' ? 'items_material' : 'items_compra';
    const idx = _state[key].findIndex(i => i.articuloId === articuloId);
    if (idx === -1) return;

    // STOCK: si cambia la cantidad en material, ajustar delta
    if (tipo === 'material' && cambios.cantidad !== undefined && ajustarStock) {
      const delta = cambios.cantidad - _state[key][idx].cantidad;
      if (delta !== 0) {
        ajustarStock(delta);
        if (_stockCambios.has(articuloId)) {
          _stockCambios.get(articuloId).cantidadTotal += delta;
        }
      }
    }

    Object.assign(_state[key][idx], cambios);
  },

  /**
   * Quita un item del carrito.
   * Si es material con inventario, devuelve la cantidad al stock local.
   * @param {string} tipo
   * @param {string} articuloId
   * @param {Function} [devolverStock] - callback(cantidad) para devolver stock local
   */
  removeItem(tipo, articuloId, devolverStock) {
    const key  = tipo === 'servicio' ? 'items_servicio' : tipo === 'material' ? 'items_material' : 'items_compra';
    const item = _state[key].find(i => i.articuloId === articuloId);

    // STOCK: devolver al stock local si aplica
    if (item && tipo === 'material' && devolverStock) {
      devolverStock(item.cantidad);
      _stockCambios.delete(articuloId); // ya no hay cambio neto para este artículo
    }

    _state[key] = _state[key].filter(i => i.articuloId !== articuloId);
  },

  setCliente(id) { _state.clienteId = id; },

  /** Devuelve los cambios de stock pendientes de flush a Sheets */
  getStockCambios() {
    return Array.from(_stockCambios.entries()).map(([id, v]) => ({ id, ...v }));
  },

  async calcTotales() {
    // FIX: Reutilizar cache en memoria para impuestos y descuentos
    if (!_impuestosCache || !_descuentosCache) {
      [_impuestosCache, _descuentosCache] = await Promise.all([
        ImpuestosDB.getAll(),
        DescuentosDB.getAll(),
      ]);
    }

    const impuestos  = _impuestosCache;
    const descuentos = _descuentosCache;

    const autoRate = impuestos
      .filter(i => i.agregarAlPrecio)
      .reduce((s, i) => s + (i.tasa || 0), 0) / 100;

    const calcItems = (items) => items.reduce((sum, item) => {
      let base = item.cantidad * parseFloat(item.precioUnitario || 0);
      if (item.descuentoId) {
        const desc = descuentos.find(d => d.id === item.descuentoId);
        if (desc) {
          base -= desc.tipo === 'porcentaje'
            ? base * (desc.valor / 100)
            : desc.valor;
        }
      }
      if (item.aplicarImpuesto) base += base * autoRate;
      return sum + Math.max(0, base);
    }, 0);

    const calcCompra = (items) => items.reduce((sum, item) =>
      sum + Math.max(0, item.cantidad * parseFloat(item.precioUnitario || 0)), 0);

    return {
      servicio: calcItems(_state.items_servicio),
      material: calcItems(_state.items_material),
      compra:   calcCompra(_state.items_compra),
    };
  },
};