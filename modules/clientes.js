// =============================================
// ECA · modules/clientes.js
// Drawer de clientes con vista lista / formulario.
// =============================================
import { ClientesDB } from '../db/clientes.db.js';
import { Store }      from '../core/store.js';
import { openDrawer, closeDrawer, showToast, setLoading, renderEmpty, confirmDialog } from '../core/ui.js';
import { escapeHtml } from '../core/utils.js';

export function initClientes() {
  document.getElementById('btn-cliente').addEventListener('click', openClienteDrawer);
  document.getElementById('cliente-drawer-close').addEventListener('click',   () => closeDrawer('cliente-drawer'));
  document.getElementById('cliente-drawer-overlay').addEventListener('click', () => closeDrawer('cliente-drawer'));
  document.getElementById('btn-add-cliente').addEventListener('click',        () => mostrarVistaForm());
  document.getElementById('cli-back-btn').addEventListener('click',           () => mostrarVistaLista());
  document.getElementById('cli-cancel-btn').addEventListener('click',         () => mostrarVistaLista());
  document.getElementById('cliente-form-close-btn').addEventListener('click', () => closeDrawer('cliente-drawer'));
  document.getElementById('btn-save-cliente').addEventListener('click', _saveCliente);
  document.getElementById('cli-search').addEventListener('input', renderClientesList);
}

export function mostrarVistaLista() {
  document.getElementById('cli-view-lista').style.display = 'block';
  document.getElementById('cli-view-form').style.display  = 'none';
}

export function mostrarVistaForm(editId = null) {
  ['cli-nombre','cli-direccion','cli-telefono','cli-email','cli-nota'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('cli-form-id').value = editId || '';
  document.getElementById('cli-form-title').textContent = editId ? 'Editar Cliente' : 'Nuevo Cliente';

  if (editId) {
    ClientesDB.getAll().then(all => {
      const c = all.find(x => x.id === editId);
      if (!c) return;
      document.getElementById('cli-nombre').value    = c.nombre    || '';
      document.getElementById('cli-direccion').value = c.direccion || '';
      document.getElementById('cli-telefono').value  = c.telefono  || '';
      document.getElementById('cli-email').value     = c.email     || '';
      document.getElementById('cli-nota').value      = c.nota      || '';
    });
  }
  document.getElementById('cli-view-lista').style.display = 'none';
  document.getElementById('cli-view-form').style.display  = 'flex';
}

export async function openClienteDrawer() {
  mostrarVistaLista();
  await renderClientesList();
  openDrawer('cliente-drawer');
}

export async function renderClientesList() {
  const container = document.getElementById('cli-list');
  const query     = document.getElementById('cli-search')?.value || '';
  setLoading(container);
  try {
    const [items, state] = await Promise.all([ClientesDB.search(query), Promise.resolve(Store.get())]);
    if (!items.length) { renderEmpty(container, 'No hay clientes registrados'); return; }
    container.innerHTML = items.map(c => `
      <div class="list-item">
        <div class="list-item-icon" style="background:rgba(88,166,255,0.1);color:var(--electric-blue)">&#128100;</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(c.nombre)}</div>
          <div class="list-item-sub">${escapeHtml(c.codigo || '')} · ${escapeHtml(c.telefono || '')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          ${state.clienteId === c.id
            ? `<button class="btn btn-danger btn-sm"  onclick="window._quitarCliente()">Quitar</button>`
            : `<button class="btn btn-primary btn-sm" onclick="window._asignarCliente('${escapeHtml(c.id)}')">Asignar</button>`}
          <button class="btn btn-secondary btn-sm" onclick="window._editCliente('${escapeHtml(c.id)}')">Editar</button>
          <button class="btn btn-danger btn-sm"    onclick="window._eliminarCliente('${escapeHtml(c.id)}')">&#10005;</button>
        </div>
      </div>`).join('');
  } catch { renderEmpty(container, 'Error al cargar clientes'); }
}

window._asignarCliente = async function(id) {
  Store.setCliente(id);
  closeDrawer('cliente-drawer');
  // Notificar a cotizacion para actualizar badge
  document.dispatchEvent(new CustomEvent('clienteAsignado'));
  const all = await ClientesDB.getAll();
  showToast('Cliente asignado: ' + (all.find(c => c.id === id)?.nombre || ''));
};

window._quitarCliente = function() {
  Store.setCliente(null);
  closeDrawer('cliente-drawer');
  document.dispatchEvent(new CustomEvent('clienteAsignado'));
  showToast('Cliente removido');
};

window._editCliente = function(id) { mostrarVistaForm(id); };

window._eliminarCliente = function(id) {
  confirmDialog('Eliminar este cliente permanentemente?', async () => {
    await ClientesDB.delete(id);
    if (Store.get().clienteId === id) {
      Store.setCliente(null);
      document.dispatchEvent(new CustomEvent('clienteAsignado'));
    }
    await renderClientesList();
    showToast('Cliente eliminado');
  });
};

async function _saveCliente() {
  const nombre = document.getElementById('cli-nombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }

  const btn = document.getElementById('btn-save-cliente');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const editId = document.getElementById('cli-form-id').value || undefined;

    // Traer datos originales para no perder codigo ni createdAt
    let original = {};
    if (editId) {
      const all = await ClientesDB.getAll();
      original  = all.find(c => c.id === editId) || {};
    }

    await ClientesDB.save({
      ...original,           // preserva codigo, createdAt y cualquier otro campo
      id:        editId,
      nombre,
      direccion: document.getElementById('cli-direccion').value.trim(),
      telefono:  document.getElementById('cli-telefono').value.trim(),
      email:     document.getElementById('cli-email').value.trim(),
      nota:      document.getElementById('cli-nota').value.trim(),
    });
    showToast('Cliente guardado');
    await renderClientesList();
    mostrarVistaLista();
  } finally { btn.disabled = false; btn.textContent = 'Guardar Cliente'; }
}