import { CategoriasDB } from '../db/categorias.db.js';
import { ArticulosDB }  from '../db/articulos.db.js';
import { openDrawer, closeDrawer, showToast, setLoading, renderEmpty, confirmDialog } from '../core/ui.js';
import { escapeHtml } from '../core/utils.js';

export function initCategorias() {
  document.getElementById('btn-add-categoria').addEventListener('click', () => {
    document.getElementById('cat-nombre').value        = '';
    document.getElementById('cat-edit-original').value = '';
    document.getElementById('cat-drawer-title').textContent = 'Nueva Categoria';
    openDrawer('cat-drawer');
  });
  document.getElementById('cat-drawer-close').addEventListener('click',   () => closeDrawer('cat-drawer'));
  document.getElementById('cat-drawer-overlay').addEventListener('click', () => closeDrawer('cat-drawer'));
  document.getElementById('btn-cat-save').addEventListener('click', _saveCategoria);
}

export async function renderCategorias() {
  const container = document.getElementById('cat-list');
  setLoading(container);
  try {
    const [cats, articulos] = await Promise.all([CategoriasDB.getAll(), ArticulosDB.getAll()]);
    if (!cats.length) { renderEmpty(container, 'No hay categorias'); return; }
    container.innerHTML = cats.map(c => {
      const count = articulos.filter(a => a.categoria === c).length;
      return `
        <div class="list-item">
          <div class="list-item-icon" style="background:rgba(240,165,0,0.1);font-size:1rem">&#128278</div>
          <div class="list-item-info">
            <div class="list-item-name">${escapeHtml(c)}</div>
            <div class="list-item-sub">${count} articulo(s)</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="window._editarCategoria('${escapeHtml(c)}')">Editar</button>
            <button class="btn btn-danger btn-sm"    onclick="window._eliminarCategoria('${escapeHtml(c)}')">&#10005;</button>
          </div>
        </div>`;
    }).join('');
  } catch { renderEmpty(container, 'Error al cargar categorias'); }
}

window._editarCategoria = function(nombre) {
  document.getElementById('cat-nombre').value        = nombre;
  document.getElementById('cat-edit-original').value = nombre;
  document.getElementById('cat-drawer-title').textContent = 'Editar Categoria';
  openDrawer('cat-drawer');
};

window._eliminarCategoria = function(nombre) {
  confirmDialog(`Eliminar la categoria "${nombre}"?`, async () => {
    await CategoriasDB.delete(nombre);
    renderCategorias();
    showToast('Categoria eliminada');
  });
};

async function _saveCategoria() {
  const nombre   = document.getElementById('cat-nombre').value.trim();
  const original = document.getElementById('cat-edit-original').value;
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }

  const btn = document.getElementById('btn-cat-save');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    if (original) { await CategoriasDB.update(original, nombre); showToast('Categoria actualizada'); }
    else          { await CategoriasDB.add(nombre);               showToast('Categoria guardada'); }
    closeDrawer('cat-drawer');
    renderCategorias();
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
}