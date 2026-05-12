import { ImpuestosDB } from '../db/impuestos.db.js';
import { openDrawer, closeDrawer, showToast, setLoading, renderEmpty, confirmDialog } from '../core/ui.js';
import { escapeHtml } from '../core/utils.js';

let _editId = null;

export function initImpuestos() {
  renderImpuestosList();
  document.getElementById('btn-add-impuesto').addEventListener('click', () => {
    _editId = null;
    document.getElementById('imp-nombre').value  = '';
    document.getElementById('imp-tasa').value    = '';
    document.getElementById('imp-auto').checked  = false;
    document.getElementById('imp-drawer-title').textContent = 'Nuevo Impuesto';
    openDrawer('imp-drawer');
  });
  document.getElementById('imp-drawer-close').addEventListener('click',   () => closeDrawer('imp-drawer'));
  document.getElementById('imp-drawer-overlay').addEventListener('click', () => closeDrawer('imp-drawer'));
  document.getElementById('btn-imp-save').addEventListener('click', _saveImpuesto);
}

export async function renderImpuestosList() {
  const container = document.getElementById('imp-list');
  setLoading(container);
  try {
    const items = await ImpuestosDB.getAll();
    if (!items.length) { renderEmpty(container, 'No hay impuestos configurados'); return; }
    container.innerHTML = items.map(i => `
      <div class="list-item">
        <div class="list-item-icon" style="background:rgba(88,166,255,0.1);color:var(--electric-blue);font-size:.85rem;font-weight:700">IVA</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(i.nombre)}</div>
          <div class="list-item-sub">${escapeHtml(String(i.tasa))}% · ${i.agregarAlPrecio ? 'Automatico' : 'Manual por articulo'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="window._editImpuesto('${escapeHtml(i.id)}')">Editar</button>
          <button class="btn btn-danger btn-sm"    onclick="window._deleteImpuesto('${escapeHtml(i.id)}')">&#10005;</button>
        </div>
      </div>`).join('');
  } catch (err) { console.error('renderImpuestosList:', err); renderEmpty(container, 'Error al cargar impuestos'); }
}

window._editImpuesto = async function(id) {
  const items = await ImpuestosDB.getAll();
  const i = items.find(x => x.id === id);
  if (!i) return;
  _editId = id;
  document.getElementById('imp-nombre').value = i.nombre;
  document.getElementById('imp-tasa').value   = i.tasa;
  document.getElementById('imp-auto').checked = i.agregarAlPrecio;
  document.getElementById('imp-drawer-title').textContent = 'Editar Impuesto';
  openDrawer('imp-drawer');
};

window._deleteImpuesto = function(id) {
  confirmDialog('Eliminar este impuesto?', async () => {
    await ImpuestosDB.delete(id);
    renderImpuestosList();
    showToast('Impuesto eliminado');
  });
};

async function _saveImpuesto() {
  const nombre = document.getElementById('imp-nombre').value.trim();
  const tasa   = parseFloat(document.getElementById('imp-tasa').value);
  if (!nombre)     { showToast('El nombre es requerido', 'error'); return; }
  if (isNaN(tasa)) { showToast('Ingresa una tasa valida', 'error'); return; }

  const btn = document.getElementById('btn-imp-save');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await ImpuestosDB.save({ id: _editId || undefined, nombre, tasa, agregarAlPrecio: document.getElementById('imp-auto').checked });
    closeDrawer('imp-drawer');
    renderImpuestosList();
    showToast(_editId ? 'Impuesto actualizado' : 'Impuesto guardado');
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
}