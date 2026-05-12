// =============================================
// ECA· modules/articulos.js
// =============================================
import { ArticulosDB }  from '../db/articulos.db.js';
import { CategoriasDB } from '../db/categorias.db.js';
import { openDrawer, closeDrawer, showToast, setLoading, renderEmpty, confirmDialog } from '../core/ui.js';
import { getRepIcon, getArticuloBg, formatMoney, escapeHtml } from '../core/utils.js';

// Estado local del modulo
let _editId       = null;
let _repTipo      = 'color';
let _selColor     = '#f0a500';
let _selShape     = 'square';
let _imageDataUrl = null;

export function initArticulos() {
  renderArticulosList();

  document.getElementById('art-search').addEventListener('input', _filterArticulos);
  document.getElementById('art-cat-filter').addEventListener('change', _filterArticulos);

  document.getElementById('btn-add-articulo').addEventListener('click', async () => {
    _editId = null;
    _resetForm();
    await _poblarCatSelect();
    document.getElementById('art-drawer-title').textContent = 'Nuevo Articulo';
    openDrawer('art-drawer');
  });

  document.getElementById('art-drawer-close').addEventListener('click',   () => closeDrawer('art-drawer'));
  document.getElementById('art-drawer-overlay').addEventListener('click', () => closeDrawer('art-drawer'));
  document.getElementById('btn-art-save').addEventListener('click', _saveArticulo);

  // Rep tabs
  document.querySelectorAll('#art-drawer .rep-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#art-drawer .rep-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _repTipo = tab.dataset.rep;
      document.querySelectorAll('#art-drawer .rep-content').forEach(c => c.classList.remove('active'));
      document.getElementById('rep-' + _repTipo).classList.add('active');
    });
  });

  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      _selColor = sw.dataset.color;
    });
  });

  document.querySelectorAll('.shape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _selShape = btn.dataset.shape;
    });
  });

  document.getElementById('art-img-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      _imageDataUrl = ev.target.result;
      document.getElementById('art-img-preview').innerHTML =
        `<img src="${_imageDataUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`;
    };
    reader.readAsDataURL(file);
  });
}

function _filterArticulos() {
  const q   = document.getElementById('art-search').value;
  const cat = document.getElementById('art-cat-filter').value;
  renderArticulosList(q, cat);
}

async function _poblarCatSelect(valorActual = '') {
  const cats = await CategoriasDB.getAll();
  const sel  = document.getElementById('art-categoria');
  sel.innerHTML =
    `<option value="">Sin categoria</option>` +
    cats.map(c => `<option value="${c}" ${c === valorActual ? 'selected' : ''}>${c}</option>`).join('');
}

export async function renderArticulosList(q = '', cat = '') {
  const container = document.getElementById('art-list');
  setLoading(container);
  try {
    const items = await ArticulosDB.search(q, cat);
    if (!items.length) { renderEmpty(container, 'No se encontraron articulos'); return; }
    container.innerHTML = items.map(a => `
      <div class="list-item" onclick="window._editArticulo('${escapeHtml(a.id)}')">
        <div class="list-item-icon" style="${getArticuloBg(a)}">${getRepIcon(a)}</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(a.nombre)}</div>
          <div class="list-item-sub">
            ${escapeHtml(a.categoria || 'Sin categoria')} · ${escapeHtml(a.vendidoPor || 'Unidad')}
            ${a.inventario ? ` · Inv: ${escapeHtml(String(a.stock ?? 0))}` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="text-align:right">
            <div class="list-item-badge">Servicio: ${formatMoney(a.precioServicio)}</div>
            <div style="font-size:.85rem;color:var(--text-secondary);margin-top:2px">Material: ${formatMoney(a.precioMaterial)}</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();window._deleteArticulo('${escapeHtml(a.id)}','${escapeHtml(a.nombre.replace(/'/g,"\\'"))}')">&#10005;</button>
        </div>
      </div>`).join('');
  } catch (err) {
    console.error('renderArticulosList:', err);
    renderEmpty(container, 'Error al cargar articulos');
  }
}

// Expuesto en window para llamadas desde innerHTML onclick
window._editArticulo = async function(id) {
  _editId = id;
  const a = await ArticulosDB.getById(id);
  if (!a) return;

  document.getElementById('art-drawer-title').textContent = 'Editar Articulo';
  document.getElementById('art-nombre').value          = a.nombre        || '';
  await _poblarCatSelect(a.categoria || '');
  document.getElementById('art-vendido-por').value     = a.vendidoPor    || 'Unidad';
  document.getElementById('art-precio-mat').value      = a.precioMaterial || '';
  document.getElementById('art-precio-serv').value     = a.precioServicio || '';
  document.getElementById('art-referencia').value      = a.referencia    || '';
  document.getElementById('art-inventario-toggle').checked = a.inventario || false;
  document.getElementById('art-impuesto-toggle').checked   = a.impuesto   || false;
  document.getElementById('art-stock').value           = a.stock || 0;
  document.getElementById('art-inventario-wrap').style.display = a.inventario ? 'block' : 'none';

  if (a.rep) {
    _repTipo = a.rep.tipo;
    document.querySelectorAll('#art-drawer .rep-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.rep === _repTipo));
    document.querySelectorAll('#art-drawer .rep-content').forEach(c =>
      c.classList.toggle('active', c.id === 'rep-' + _repTipo));
    if (a.rep.tipo === 'color') {
      _selColor = a.rep.valor;
      document.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.toggle('selected', s.dataset.color === a.rep.valor));
    } else if (a.rep.tipo === 'forma') {
      _selShape = a.rep.valor;
      document.querySelectorAll('.shape-btn').forEach(b =>
        b.classList.toggle('selected', b.dataset.shape === a.rep.valor));
    } else if (a.rep.tipo === 'imagen') {
      _imageDataUrl = a.rep.valor;
      document.getElementById('art-img-preview').innerHTML =
        `<img src="${_imageDataUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:6px">`;
    }
  }
  openDrawer('art-drawer');
};

function _resetForm() {
  ['art-nombre','art-referencia','art-precio-mat','art-precio-serv'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('art-categoria').value   = '';
  document.getElementById('art-vendido-por').value = 'Unidad';
  document.getElementById('art-inventario-toggle').checked = false;
  document.getElementById('art-impuesto-toggle').checked   = false;
  document.getElementById('art-stock').value = 0;
  document.getElementById('art-inventario-wrap').style.display = 'none';
  _repTipo = 'color'; _selColor = '#f0a500'; _imageDataUrl = null;
  document.getElementById('art-img-preview').innerHTML = '';
  document.querySelectorAll('#art-drawer .rep-tab').forEach((t, i)     => t.classList.toggle('active', i === 0));
  document.querySelectorAll('#art-drawer .rep-content').forEach((c, i) => c.classList.toggle('active', i === 0));
  document.querySelectorAll('.color-swatch').forEach((s, i)            => s.classList.toggle('selected', i === 0));
}

window._deleteArticulo = function(id, nombre) {
  confirmDialog(`Eliminar el artículo "${nombre}"?`, async () => {
    await ArticulosDB.delete(id);
    renderArticulosList();
    showToast('Artículo eliminado');
  });
};

async function _saveArticulo() {
  const nombre = document.getElementById('art-nombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }

  const btn = document.getElementById('btn-art-save');
  btn.disabled = true; btn.textContent = 'Guardando...';

  let rep = null;
  if (_repTipo === 'color')                        rep = { tipo: 'color',  valor: _selColor };
  else if (_repTipo === 'forma')                   rep = { tipo: 'forma',  valor: _selShape };
  else if (_repTipo === 'imagen' && _imageDataUrl) rep = { tipo: 'imagen', valor: _imageDataUrl };

  try {
    // Traer datos originales para no perder createdAt
    let original = {};
    if (_editId) {
      original = await ArticulosDB.getById(_editId) || {};
    }

    await ArticulosDB.save({
      ...original,           // preserva createdAt y cualquier otro campo
      id:             _editId || undefined,
      nombre,
      categoria:      document.getElementById('art-categoria').value,
      vendidoPor:     document.getElementById('art-vendido-por').value,
      precioMaterial: parseFloat(document.getElementById('art-precio-mat').value)  || 0,
      precioServicio: parseFloat(document.getElementById('art-precio-serv').value) || 0,
      referencia:     document.getElementById('art-referencia').value.trim(),
      inventario:     document.getElementById('art-inventario-toggle').checked,
      stock:          parseFloat(document.getElementById('art-stock').value) || 0,
      impuesto:       document.getElementById('art-impuesto-toggle').checked,
      rep,
    });
    closeDrawer('art-drawer');
    renderArticulosList();
    showToast(_editId ? 'Articulo actualizado' : 'Articulo guardado');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar Articulo';
  }
}