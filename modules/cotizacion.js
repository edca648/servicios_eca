// =============================================
// ECA · modules/cotizacion.js
// Solo el flujo de cotizar: grid, carritos, guardar.
// =============================================
import { ArticulosDB }    from '../db/articulos.db.js';
import { CategoriasDB }   from '../db/categorias.db.js';
import { DescuentosDB }   from '../db/descuentos.db.js';
import { ImpuestosDB }   from '../db/impuestos.db.js';
import { CotizacionesDB } from '../db/cotizaciones.db.js';
import { ClientesDB }     from '../db/clientes.db.js';
import { Store }          from '../core/store.js';
import { openDrawer, closeDrawer, showToast, setLoading, renderEmpty, confirmDialog } from '../core/ui.js';
import { formatMoney, debounce, getRepIcon, getArticuloBg, escapeHtml } from '../core/utils.js';

let _selectedArticulo  = null;
let _editCartTipo      = '';
let _editCartItemId    = '';
// Cache local para el preview del drawer (se llena al abrir)
let _previewDescuentos = [];
let _previewAutoRate   = 0;

export function initCotizacion() {
  _initCarritos();
  _initItemDrawer();
  _initCartItemDrawer();
  _initSearchFilter();
  _initAcciones();

  // Escuchar evento de cliente asignado/quitado desde modulo clientes
  document.addEventListener('clienteAsignado', () => _renderBadgeCliente());

  // --- Proteger contra pérdida de datos ---
  _initExitGuard();

  // Carga inicial
  poblarCatFilter().then(() => renderArticulosTiles());
  _renderBadgeCliente();
}

// --- Guardia de salida ---
function _initExitGuard() {
  // 1. Navegador: cerrar pestaña / recargar
  window.addEventListener('beforeunload', (e) => {
    if (_tieneItemsSinGuardar()) {
      e.preventDefault();
      e.returnValue = 'Tienes una cotización en progreso. ¿Salir sin guardar?';
      return e.returnValue;
    }
  });

  // 2. SPA: página por sidebar
  document.addEventListener('eca-navigate', (e) => {
    if (e.detail?.page && e.detail.page !== 'cotizacion' && _tieneItemsSinGuardar()) {
      e.preventDefault();
      confirmDialog(
        'Tienes artículos en la cotización actual. Si cambias de página los perderás.',
        () => {
          Store.reset();
          renderCartTotales();
          // Re-despachar sin bloqueo
          document.dispatchEvent(new CustomEvent('eca-navigate-force', { detail: e.detail }));
        }
      );
    }
  });

  // 3. Botón "Nueva" — modificar _initAcciones
}

function _tieneItemsSinGuardar() {
  const state = Store.get();
  return !!(state.items_servicio.length || state.items_material.length || state.items_compra.length);
}

// Exponer para que app.js pueda consultarlo
export function tieneItemsSinGuardar() {
  return _tieneItemsSinGuardar();
}
// ---- CATEGORY FILTER ----
export async function poblarCatFilter() {
  const cats      = await CategoriasDB.getAll();
  const catFilter = document.getElementById('cot-cat-filter');
  const val       = catFilter.value;
  catFilter.innerHTML = `<option value="">Todas</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
  catFilter.value = val;
}

// ---- ARTICLE TILES ----
export async function renderArticulosTiles(q = '', cat = '') {
  const container = document.getElementById('cot-articulos-grid');
  setLoading(container, true);
  try {
    const items = await ArticulosDB.search(q, cat);
    if (!items.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <p>${q || cat ? 'Sin resultados' : 'Agrega articulos en el modulo Articulos.'}</p></div>`;
      return;
    }
    container.innerHTML = items.map(a => `
      <div class="article-tile" onclick="window._openItemDrawer('${escapeHtml(a.id)}')">
        <div class="article-tile-icon" style="${getArticuloBg(a)}">${getRepIcon(a)}</div>
        <div class="article-tile-name">${escapeHtml(a.nombre)}</div>
        <div class="article-tile-cat">${escapeHtml(a.categoria || 'Sin categoría')}</div>
        <div class="article-tile-prices">
          <span class="article-tile-price-serv" title="Servicio">&#128119; ${formatMoney(a.precioServicio)}</span>
          <span class="article-tile-price-mat"  title="Material">&#128230; ${formatMoney(a.precioMaterial)}</span>
        </div>
      </div>`).join('');
  } catch (err) {
    console.error('renderArticulosTiles:', err);
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Error al cargar articulos</p></div>`;
  }
}

// ---- CART TOTALES ----
export async function renderCartTotales() {
  const data    = Store.get();
  const totales = await Store.calcTotales();
  document.getElementById('cart-serv-total').textContent  = formatMoney(totales.servicio);
  document.getElementById('cart-mat-total').textContent   = formatMoney(totales.material);
  document.getElementById('cart-serv-count').textContent  = data.items_servicio.length + ' articulo(s)';
  document.getElementById('cart-mat-count').textContent   = data.items_material.length + ' articulo(s)';
  document.getElementById('cart-compra-count').textContent = data.items_compra.length + ' articulo(s)';
  document.getElementById('cart-compra-total').textContent = formatMoney(totales.compra);
  // El gran total solo incluye servicios + materiales que yo proveo
  document.getElementById('cot-grand-total').textContent  = formatMoney(totales.servicio + totales.material);
  await _renderBadgeCliente();
}

async function _renderBadgeCliente() {
  const btn    = document.getElementById('btn-cliente');
  const icon   = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`;
  const { clienteId } = Store.get();
  if (clienteId) {
    const all = await ClientesDB.getAll();
    const cl  = all.find(c => c.id === clienteId);
    btn.innerHTML = icon + (cl ? escapeHtml(cl.nombre) : 'Cliente');
  } else {
    btn.innerHTML = icon + 'Cliente';
  }
}

// ---- SEARCH & FILTER ----
function _initSearchFilter() {
  const debouncedRender = debounce((q) => {
    const cat = document.getElementById('cot-cat-filter').value;
    renderArticulosTiles(q, cat);
  }, 280);

  document.getElementById('cot-search').addEventListener('input', (e) => {
    const q = e.target.value; // capturar ANTES del debounce
    debouncedRender(q);
  });

  document.getElementById('cot-cat-filter').addEventListener('change', (e) => {
    const q = document.getElementById('cot-search').value;
    renderArticulosTiles(q, e.target.value);
  });
}

// ---- ITEM DRAWER (agregar articulo al carrito) ----
window._openItemDrawer = async function(id) {
  const a = await ArticulosDB.getById(id);
  if (!a) return;
  _selectedArticulo = a;

  document.getElementById('item-drawer-title').textContent = a.nombre;
  document.getElementById('item-detail-cat').textContent   = a.categoria  || 'Sin categoria';
  document.getElementById('item-detail-unit').textContent  = a.vendidoPor || 'Unidad';

  // Mostrar precio base como referencia y pre-llenar los inputs con el precio del artículo
  document.getElementById('item-detail-serv').textContent  = formatMoney(a.precioServicio);
  document.getElementById('item-detail-mat').textContent   = formatMoney(a.precioMaterial);
  document.getElementById('item-precio-serv').value        = a.precioServicio || 0;
  document.getElementById('item-precio-mat').value         = a.precioMaterial || 0;

  document.getElementById('qty-value').value               = 1;
  document.getElementById('item-impuesto').checked         = a.impuesto || false;
  document.getElementById('item-mat-soy-proveedor').checked = false;
  document.getElementById('item-mat-proveedor-section').style.display = 'none';
  _resetMatPasos();

  const [descs, impuestos] = await Promise.all([DescuentosDB.getAll(), ImpuestosDB.getAll()]);
  _previewDescuentos = descs;
  _previewAutoRate   = impuestos
    .filter(i => i.agregarAlPrecio)
    .reduce((s, i) => s + (i.tasa || 0), 0) / 100;

  document.getElementById('item-descuento').innerHTML =
    `<option value="">Sin descuento</option>` +
    descs.map(d => `<option value="${d.id}">${d.nombre} (${d.tipo === 'porcentaje' ? d.valor + '%' : formatMoney(d.valor)})</option>`).join('');

  _updateQtyPreview();
  openDrawer('item-drawer');
};

function _initItemDrawer() {
  document.getElementById('item-drawer-close').addEventListener('click',   () => { _resetMatPasos(); closeDrawer('item-drawer'); });
  document.getElementById('item-drawer-overlay').addEventListener('click', () => { _resetMatPasos(); closeDrawer('item-drawer'); });
  document.getElementById('qty-minus').addEventListener('click', () => _changeQty(-1));
  document.getElementById('qty-plus').addEventListener('click',  () => _changeQty(1));
  document.getElementById('qty-value').addEventListener('input', _updateQtyPreview);
  document.getElementById('item-precio-serv').addEventListener('input', _updateQtyPreview);
  document.getElementById('item-precio-mat').addEventListener('input',  _updateQtyPreview);
  document.getElementById('item-descuento').addEventListener('change',  _updateQtyPreview);
  document.getElementById('item-impuesto').addEventListener('change',   _updateQtyPreview);

  // Botón Material → mostrar paso 2 con toggle proveedor
  document.getElementById('btn-show-mat-options').addEventListener('click', () => {
    document.getElementById('item-footer-paso1').style.display          = 'none';
    document.getElementById('item-footer-paso2').style.display          = 'flex';
    document.getElementById('item-mat-proveedor-section').style.display = 'block';
    _updateQtyPreview();
  });

  // Volver → regresar a paso 1
  document.getElementById('btn-mat-volver').addEventListener('click', () => {
    _resetMatPasos();
  });

  // Toggle "Lo proveo yo" — muestra/oculta desc e imp, recalcula preview
  document.getElementById('item-mat-soy-proveedor').addEventListener('change', (e) => {
    _updateQtyPreview();
  });
}

function _resetMatPasos() {
  document.getElementById('item-footer-paso1').style.display          = 'flex';
  document.getElementById('item-footer-paso2').style.display          = 'none';
  document.getElementById('item-mat-proveedor-section').style.display = 'none';
  document.getElementById('item-mat-soy-proveedor').checked           = false;
}

function _changeQty(delta) {
  const input = document.getElementById('qty-value');
  input.value = Math.max(0.5, +(parseFloat(input.value || 0) + delta).toFixed(2));
  _updateQtyPreview();
}

function _updateQtyPreview() {
  if (!_selectedArticulo) return;
  const qty        = parseFloat(document.getElementById('qty-value').value) || 0;
  const precioServ = parseFloat(document.getElementById('item-precio-serv').value) || 0;
  const precioMat  = parseFloat(document.getElementById('item-precio-mat').value)  || 0;

  const descuentoId  = document.getElementById('item-descuento').value || null;
  const aplicarImp   = document.getElementById('item-impuesto').checked;
  const soyProveedor = document.getElementById('item-mat-soy-proveedor').checked;
  const desc         = descuentoId ? _previewDescuentos.find(d => d.id === descuentoId) : null;

  const calcNeto = (precio, aplicarAjustes) => {
    let base = qty * precio;
    if (aplicarAjustes && desc) {
      base -= desc.tipo === 'porcentaje' ? base * (desc.valor / 100) : desc.valor;
    }
    base = Math.max(0, base);
    if (aplicarAjustes && aplicarImp) base += base * _previewAutoRate;
    return base;
  };

  // Servicio: siempre con ajustes
  document.getElementById('item-preview-serv').textContent = formatMoney(calcNeto(precioServ, true));
  // Material: con ajustes solo si soy proveedor, sino precio simple de referencia
  document.getElementById('item-preview-mat').textContent  = formatMoney(calcNeto(precioMat, soyProveedor));
}

// Expuesto en window para los botones onclick del drawer
window._addToCart = function(tipo) {
  const a   = _selectedArticulo;
  if (!a) return;
  const qty = parseFloat(document.getElementById('qty-value').value) || 0;
  if (qty <= 0) { showToast('Cantidad invalida', 'error'); return; }

  const precioServ = parseFloat(document.getElementById('item-precio-serv').value) || 0;
  const precioMat  = parseFloat(document.getElementById('item-precio-mat').value)  || 0;

  if (tipo === 'servicio') {
    Store.addItem('servicio', {
      articuloId:      a.id,
      nombre:          a.nombre,
      cantidad:        qty,
      precioUnitario:  precioServ,
      descuentoId:     document.getElementById('item-descuento').value || null,
      aplicarImpuesto: document.getElementById('item-impuesto').checked,
      vendidoPor:      a.vendidoPor,
    });
    closeDrawer('item-drawer');
    renderCartTotales();
    showToast('Agregado a Servicios');
    return;
  }

  if (tipo === 'material') {
    const soyProveedor = document.getElementById('item-mat-soy-proveedor').checked;
    const tipoFinal    = soyProveedor ? 'material' : 'compra';
    Store.addItem(tipoFinal, {
      articuloId:      a.id,
      nombre:          a.nombre,
      cantidad:        qty,
      precioUnitario:  precioMat,
      descuentoId:     soyProveedor ? (document.getElementById('item-descuento').value || null) : null,
      aplicarImpuesto: soyProveedor ? document.getElementById('item-impuesto').checked : false,
      vendidoPor:      a.vendidoPor,
      esCompra:        !soyProveedor,
    });
    closeDrawer('item-drawer');
    renderCartTotales();
    showToast(soyProveedor ? 'Agregado a Materiales (venta)' : 'Agregado a Lista de compra');
  }
};

// ---- CART DRAWERS ----
function _initCarritos() {
  document.getElementById('cart-serv').addEventListener('click',   () => _openCartDrawer('servicio'));
  document.getElementById('cart-mat').addEventListener('click',    () => _openCartDrawer('material'));
  document.getElementById('cart-compra').addEventListener('click', () => _openCartDrawer('compra'));
  document.getElementById('cart-drawer-close').addEventListener('click',   () => closeDrawer('cart-drawer'));
  document.getElementById('cart-drawer-overlay').addEventListener('click', () => closeDrawer('cart-drawer'));
}

async function _openCartDrawer(tipo) {
  const data  = Store.get();
  const items = tipo === 'servicio' ? data.items_servicio
              : tipo === 'material' ? data.items_material
              : data.items_compra;
  const body  = document.getElementById('cart-drawer-body');

  const titulos = {
    servicio: '&#128119; Servicios',
    material: '&#128230; Materiales (venta)',
    compra:   '&#128722; Lista de compra',
  };
  document.getElementById('cart-drawer-title').innerHTML = titulos[tipo];

  if (!items.length) {
    body.innerHTML = `<div class="empty-state"><p>No hay articulos en este carrito</p></div>`;
  } else {
    body.innerHTML = items.map(item => `
      <div class="cart-item-row" onclick="window._openCartItemEdit('${escapeHtml(tipo)}','${escapeHtml(item.articuloId)}')" style="cursor:pointer">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.nombre)}</div>
          <div class="cart-item-qty">${escapeHtml(String(item.cantidad))} &times; ${formatMoney(item.precioUnitario)}</div>
        </div>
        <div class="cart-item-price">${formatMoney(item.cantidad * item.precioUnitario)}</div>
      </div>`).join('');

    const totales = await Store.calcTotales();
    const t = tipo === 'servicio' ? totales.servicio : tipo === 'material' ? totales.material : totales.compra;
    const label = tipo === 'compra' ? 'Ref. Lista de compra' : `Total ${tipo === 'servicio' ? 'Servicios' : 'Materiales'}`;
    body.innerHTML += `<div class="total-row grand" style="margin-top:14px">
      <span>${label}</span>
      <span>${formatMoney(t)}</span></div>`;

    if (tipo === 'compra') {
      body.innerHTML += `<div style="font-size:.78rem;color:var(--text-muted);margin-top:8px;text-align:center">
        Precios de referencia · no incluidos en el total de la cotización</div>`;
    }
  }
  openDrawer('cart-drawer');
}

// ---- CART ITEM EDIT ----
function _initCartItemDrawer() {
  document.getElementById('cart-item-drawer-close').addEventListener('click',   () => closeDrawer('cart-item-drawer'));
  document.getElementById('cart-item-drawer-overlay').addEventListener('click', () => closeDrawer('cart-item-drawer'));
  document.getElementById('btn-cart-item-save').addEventListener('click',   _saveCartItem);
  document.getElementById('btn-cart-item-delete').addEventListener('click', _deleteCartItem);
}

window._openCartItemEdit = async function(tipo, articuloId) {
  _editCartTipo   = tipo;
  _editCartItemId = articuloId;
  const data = Store.get();
  const key  = tipo === 'servicio' ? 'items_servicio' : tipo === 'material' ? 'items_material' : 'items_compra';
  const item = data[key].find(i => i.articuloId === articuloId);
  if (!item) return;

  document.getElementById('cart-item-edit-name').textContent = item.nombre;
  document.getElementById('cart-item-qty-edit').value        = item.cantidad;
  document.getElementById('cart-item-impuesto').checked      = item.aplicarImpuesto || false;

  // Ocultar descuento e impuesto para lista de compra
  const esCompra = tipo === 'compra';
  document.getElementById('cart-item-desc-row').style.display = esCompra ? 'none' : '';
  document.getElementById('cart-item-imp-row').style.display  = esCompra ? 'none' : '';

  const descs = await DescuentosDB.getAll();
  document.getElementById('cart-item-descuento').innerHTML =
    `<option value="">Sin descuento</option>` +
    descs.map(d => `<option value="${d.id}" ${item.descuentoId === d.id ? 'selected' : ''}>${d.nombre}</option>`).join('');

  closeDrawer('cart-drawer');
  openDrawer('cart-item-drawer');
};

function _saveCartItem() {
  const qty = parseFloat(document.getElementById('cart-item-qty-edit').value) || 0;
  if (qty <= 0) { showToast('Cantidad invalida', 'error'); return; }
  Store.updateItem(_editCartTipo, _editCartItemId, {
    cantidad:        qty,
    descuentoId:     document.getElementById('cart-item-descuento').value || null,
    aplicarImpuesto: document.getElementById('cart-item-impuesto').checked,
  });
  closeDrawer('cart-item-drawer');
  renderCartTotales();
  showToast('Articulo actualizado');
}

function _deleteCartItem() {
  confirmDialog('Quitar este articulo del carrito?', () => {
    Store.removeItem(_editCartTipo, _editCartItemId);
    closeDrawer('cart-item-drawer');
    renderCartTotales();
    showToast('Articulo eliminado del carrito');
  });
}

// ---- GUARDAR / NUEVA COTIZACION ----
function _initAcciones() {
  const btnGuardar = document.getElementById('btn-guardar-cot');
  // Icono + texto Guardar
  btnGuardar.innerHTML = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
  </svg> Guardar`;

  btnGuardar.addEventListener('click', _guardarCotizacion);
  document.getElementById('btn-nueva-cot').addEventListener('click', _nuevaCotizacion);
}

async function _guardarCotizacion() {
  const data = Store.get();
  if (!data.items_servicio.length && !data.items_material.length && !data.items_compra.length) {
    showToast('Agrega articulos antes de guardar', 'error'); return;
  }
  const btn = document.getElementById('btn-guardar-cot');
  btn.disabled = true;
  btn.innerHTML = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
  </svg> Guardando...`;

  try {
    const totales = await Store.calcTotales();
    await CotizacionesDB.save({
      items_servicio: [...data.items_servicio],
      items_material: [...data.items_material],
      items_compra:   [...data.items_compra],
      clienteId:      data.clienteId,
      totalServicio:  totales.servicio,
      totalMaterial:  totales.material,
      totalCompra:    totales.compra,
      total:          totales.servicio + totales.material,
    });
    Store.reset();
    await renderCartTotales();
    renderArticulosTiles();
    // Feedback visual: flash verde en los carritos
    ['cart-serv', 'cart-mat', 'cart-compra'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.transition = 'background 0.3s';
      el.style.background = 'rgba(63,185,80,0.15)';
      el.style.borderColor = 'var(--green, #3fb950)';
      setTimeout(() => {
        el.style.background = '';
        el.style.borderColor = '';
      }, 1200);
    });
    showToast('Cotizacion guardada ✓', 'success');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
    </svg> Guardar`;
  }
}

function _nuevaCotizacion() {
  confirmDialog('Iniciar nueva cotizacion? Se perdera la actual si no la guardaste.', () => {
    Store.reset();
    renderCartTotales();
    showToast('Nueva cotizacion iniciada');
  });
}