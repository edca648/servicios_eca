// =============================================
// ECA · core/sync.js
// Gestiona la sincronización offline → online.
//
// Responsabilidades:
//   1. Inyectar indicador de estado de conexión en el header
//   2. Escuchar eventos online/offline
//   3. Procesar la cola de IndexedDB cuando vuelve la conexión
//   4. Exponer syncNow() para llamar manualmente
// =============================================

import { IDB }   from './idb.js';
import { Cache } from './cache.js';

let _syncing = false;

// ── INDICADOR UI ─────────────────────────────────────────────────────────────
function _renderIndicator() {
  // Evitar duplicados
  if (document.getElementById('sync-indicator')) return;

  const el = document.createElement('div');
  el.id    = 'sync-indicator';
  el.style.cssText = `
    display:flex;align-items:center;gap:6px;
    font-size:.75rem;font-weight:600;
    padding:4px 10px;border-radius:20px;
    cursor:pointer;transition:all .3s;
    border:1px solid transparent;
  `;
  el.title = 'Estado de sincronización';
  el.addEventListener('click', () => { if (navigator.onLine) syncNow(); });
  document.querySelector('.header')?.appendChild(el);
  _updateIndicator();
}

async function _updateIndicator() {
  const el = document.getElementById('sync-indicator');
  if (!el) return;

  const count   = await IDB.queueCount();
  const online  = navigator.onLine;

  if (!online) {
    el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#f0a500;flex-shrink:0"></span> Sin conexión`;
    el.style.background   = 'rgba(240,165,0,.1)';
    el.style.borderColor  = 'rgba(240,165,0,.3)';
    el.style.color        = 'var(--accent)';
  } else if (count > 0) {
    el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#58a6ff;flex-shrink:0;animation:pulse-sync .8s ease-in-out infinite"></span> ${count} pendiente${count > 1 ? 's' : ''}`;
    el.style.background   = 'rgba(88,166,255,.1)';
    el.style.borderColor  = 'rgba(88,166,255,.3)';
    el.style.color        = 'var(--electric-blue, #58a6ff)';
  } else {
    el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#3fb950;flex-shrink:0"></span> Sincronizado`;
    el.style.background   = 'rgba(63,185,80,.08)';
    el.style.borderColor  = 'rgba(63,185,80,.2)';
    el.style.color        = 'var(--green, #3fb950)';
  }
}

// ── SYNC ─────────────────────────────────────────────────────────────────────
export async function syncNow() {
  if (_syncing || !navigator.onLine) return;
  _syncing = true;

  try {
    const queue = await IDB.getAllQueued();
    if (!queue.length) { _syncing = false; return; }

    // Importar API aquí (lazy) para evitar dependencia circular
    const { API } = await import('./api.js');

    let ok = 0;
    let fail = 0;

    for (const op of queue) {
      try {
        if (op.action === 'save') {
          // Reemplazar número provisional TEMP-N por número real
          if (op.data?.numero && String(op.data.numero).startsWith('TEMP')) {
            const real = await API.getAll(op.sheet);
            op.data.numero = real.length + 1;
          }
          await API.save(op.sheet, op.data);
        } else if (op.action === 'delete') {
          await API.delete(op.sheet, op.id);
        }
        await IDB.dequeue(op.qid);
        // Invalidar cache en memoria para forzar re-fetch
        Cache.clear(op.sheet.toLowerCase());
        ok++;
      } catch (err) {
        console.warn('[sync] fallo op:', op, err);
        fail++;
      }
    }

    if (ok)   console.info(`[sync] ${ok} operación(es) sincronizada(s)`);
    if (fail) console.warn(`[sync] ${fail} operación(es) fallida(s), reintentar`);

    // Recargar datos frescos del servidor en cache de memoria
    Cache.clearAll();

  } finally {
    _syncing = false;
    await _updateIndicator();
    // Notificar a los módulos para que re-rendericen si están visibles
    document.dispatchEvent(new CustomEvent('eca-synced'));
  }
}

// ── INIT ─────────────────────────────────────────────────────────────────────
export function initSync() {
  // Inyectar keyframe para el punto pulsante
  if (!document.getElementById('sync-style')) {
    const s = document.createElement('style');
    s.id = 'sync-style';
    s.textContent = `@keyframes pulse-sync {
      0%,100%{opacity:1;transform:scale(1)}
      50%{opacity:.5;transform:scale(1.3)}
    }`;
    document.head.appendChild(s);
  }

  _renderIndicator();

  window.addEventListener('online',  async () => {
    await _updateIndicator();
    await syncNow();
  });

  window.addEventListener('offline', () => _updateIndicator());

  // Actualizar badge cuando api.js encola una operación
  document.addEventListener('eca-queue-changed', () => _updateIndicator());

  // Intentar sincronizar al arrancar si hay cola pendiente y hay conexión
  if (navigator.onLine) syncNow();
}

// initSync es el único export público necesario