// =============================================
// ECA · core/api.js
// Unica capa que habla con Google Apps Script.
// Offline-first:
//   - getAll  → intenta red, guarda en IDB; si falla usa IDB local
//   - save    → intenta red; si falla encola en IDB para sync posterior
//   - delete  → intenta red; si falla encola en IDB
// Para cambiar el backend, solo se toca este archivo.
// =============================================

import { IDB } from './idb.js';

export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyIE4vCCV9Y5IK0oPMFrKXKqGt7N8JIpl-_tsU57T4kThS990Y3BA9QQy8RTI3o6Tmp/exec';

export const SHEETS = {
  ARTICULOS:        'Articulos',
  CATEGORIAS:       'Categorias',
  DESCUENTOS:       'Descuentos',
  IMPUESTOS:        'Impuestos',
  CLIENTES:         'Clientes',
  COTIZACIONES:     'Cotizaciones',
  COTIZACION_ITEMS: 'CotizacionItems',
};

async function _fetch(action, sheet, extra = {}) {
  const token = window.ECA_TOKEN || '';
  const res   = await fetch(SCRIPT_URL, {
    method: 'POST',
    body:   JSON.stringify({ action, sheet, token, ...extra }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error en API');
  return json.data;
}

// Notifica a sync.js que la cola cambió, sin importarlo directamente
function _notifyQueue() {
  document.dispatchEvent(new CustomEvent('eca-queue-changed'));
}

export const API = {
  async getAll(sheet) {
    if (navigator.onLine) {
      try {
        const data = await _fetch('getAll', sheet);
        await IDB.setSheet(sheet, data);
        return data;
      } catch (err) {
        console.warn(`[api] getAll(${sheet}) falló en red, usando IDB:`, err);
      }
    }
    const local = await IDB.getSheet(sheet);
    if (local) return local;
    throw new Error(`Sin conexión y sin datos locales para ${sheet}`);
  },

  async save(sheet, data) {
    if (navigator.onLine) {
      try {
        const saved = await _fetch('save', sheet, { data });
        await IDB.upsertRow(sheet, saved ?? data);
        return saved;
      } catch (err) {
        console.warn(`[api] save(${sheet}) falló en red, encolando:`, err);
      }
    }
    await IDB.enqueue({ action: 'save', sheet, data });
    await IDB.upsertRow(sheet, data);
    _notifyQueue();
    return data;
  },

  async delete(sheet, id) {
    if (navigator.onLine) {
      try {
        await _fetch('delete', sheet, { id });
        await IDB.removeRow(sheet, id);
        return;
      } catch (err) {
        console.warn(`[api] delete(${sheet}:${id}) falló en red, encolando:`, err);
      }
    }
    await IDB.enqueue({ action: 'delete', sheet, id });
    await IDB.removeRow(sheet, id);
    _notifyQueue();
  },

  async getById(sheet, id) {
    const all = await this.getAll(sheet);
    return all.find(r => r.id === id) ?? null;
  },
};