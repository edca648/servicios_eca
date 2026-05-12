import { DescuentosDB } from '../db/descuentos.db.js';
import { openDrawer, closeDrawer, showToast, setLoading, renderEmpty, confirmDialog } from '../core/ui.js';
import { formatMoney, escapeHtml }  from '../core/utils.js';

let _editId = null;

export function initDescuentos() {
  renderDescuentosList();
  document.getElementById('btn-add-descuento').addEventListener('click', () => {
    _editId = null;
    document.getElementById('desc-nombre').value = '';
    document.getElementById('desc-valor').value  = '';
    document.getElementById('desc-tipo').value   = 'porcentaje';
    document.getElementById('desc-drawer-title').textContent = 'Nuevo Descuento';
    openDrawer('desc-drawer');
  });
  document.getElementById('desc-drawer-close').addEventListener('click',   () => closeDrawer('desc-drawer'));
  document.getElementById('desc-drawer-overlay').addEventListener('click', () => closeDrawer('desc-drawer'));
  document.getElementById('btn-desc-save').addEventListener('click', _saveDescuento);
}

export async function renderDescuentosList() {
  const container = document.getElementById('desc-list');
  setLoading(container);
  try {
    const items = await DescuentosDB.getAll();
    if (!items.length) { renderEmpty(container, 'No hay descuentos guardados'); return; }
    container.innerHTML = items.map(d => `
      <div class="list-item">
        <div class="list-item-icon" style="background:rgba(248,81,73,0.1);color:var(--red);font-size:1.1rem;font-weight:700">%</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(d.nombre)}</div>
          <div class="list-item-sub">${d.tipo === 'porcentaje' ? escapeHtml(String(d.valor)) + '%' : formatMoney(d.valor)}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="window._editDescuento('${escapeHtml(d.id)}')">Editar</button>
          <button class="btn btn-danger btn-sm"    onclick="window._deleteDescuento('${escapeHtml(d.id)}')">&#10005;</button>
        </div>
      </div>`).join('');
  } catch (err) { console.error('renderDescuentosList:', err); renderEmpty(container, 'Error al cargar descuentos'); }
}

window._editDescuento = async function(id) {
  const items = await DescuentosDB.getAll();
  const d = items.find(x => x.id === id);
  if (!d) return;
  _editId = id;
  document.getElementById('desc-nombre').value = d.nombre;
  document.getElementById('desc-valor').value  = d.valor;
  document.getElementById('desc-tipo').value   = d.tipo;
  document.getElementById('desc-drawer-title').textContent = 'Editar Descuento';
  openDrawer('desc-drawer');
};

window._deleteDescuento = function(id) {
  confirmDialog('Eliminar este descuento?', async () => {
    await DescuentosDB.delete(id);
    renderDescuentosList();
    showToast('Descuento eliminado');
  });
};

async function _saveDescuento() {
  const nombre = document.getElementById('desc-nombre').value.trim();
  const valor  = parseFloat(document.getElementById('desc-valor').value);
  if (!nombre)     { showToast('El nombre es requerido', 'error'); return; }
  if (isNaN(valor)) { showToast('Ingresa un valor valido', 'error'); return; }

  const btn = document.getElementById('btn-desc-save');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await DescuentosDB.save({ id: _editId || undefined, nombre, valor, tipo: document.getElementById('desc-tipo').value });
    closeDrawer('desc-drawer');
    renderDescuentosList();
    showToast(_editId ? 'Descuento actualizado' : 'Descuento guardado');
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
}