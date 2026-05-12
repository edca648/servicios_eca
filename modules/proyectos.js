// =============================================
// ECA · modules/proyectos.js
// =============================================
import { CotizacionesDB } from '../db/cotizaciones.db.js';
import { ClientesDB }     from '../db/clientes.db.js';
import { DescuentosDB }   from '../db/descuentos.db.js';
import { ImpuestosDB }    from '../db/impuestos.db.js';
import { openDrawer, closeDrawer, showToast, setLoading, renderEmpty, confirmDialog } from '../core/ui.js';
import { formatMoney, formatDate, parseBool, escapeHtml } from '../core/utils.js';

// jsPDF desde CDN — se carga una sola vez al primer uso
let _jsPDFReady = false;
function _loadJsPDF() {
  if (_jsPDFReady || document.getElementById('jspdf-script')) return Promise.resolve();
  return new Promise((res, rej) => {
    const s   = document.createElement('script');
    s.id      = 'jspdf-script';
    s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload  = () => { _jsPDFReady = true; res(); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

let _proyectoActual   = null;
let _proyectoItemEdit = null;
// Contexto compartido para PDF / WhatsApp / correo
let _ctx = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
// Caché local para filtrado instantáneo (igual que artículos)
let _proyectosCache = [];
let _clientesCache  = [];

export function initProyectos() {
  renderProyectos();
  document.getElementById('proyecto-drawer-close').addEventListener('click',   () => closeDrawer('proyecto-drawer'));
  document.getElementById('proyecto-drawer-overlay').addEventListener('click', () => closeDrawer('proyecto-drawer'));
  document.getElementById('proy-item-drawer-close').addEventListener('click',   () => closeDrawer('proy-item-drawer'));
  document.getElementById('proy-item-drawer-overlay').addEventListener('click', () => closeDrawer('proy-item-drawer'));
  document.getElementById('btn-proy-item-save').addEventListener('click',   _saveProyectoItem);
  document.getElementById('btn-proy-item-delete').addEventListener('click', _deleteProyectoItem);
  document.getElementById('proy-search').addEventListener('input', _filtrarProyectos);
}

function _filtrarProyectos() {
  const q = document.getElementById('proy-search').value.toLowerCase().trim();
  const container = document.getElementById('recibos-list');
  const filtrados = _proyectosCache.filter(p => {
    if (!q) return true;
    const cl = p.clienteId ? _clientesCache.find(x => x.id === p.clienteId) : null;
    return (cl?.nombre || '').toLowerCase().includes(q)
        || String(p.numero).includes(q)
        || formatDate(p.fecha).toLowerCase().includes(q);
  });
  _renderListaProyectos(container, filtrados);
}

function _renderListaProyectos(container, proyectos) {
  if (!proyectos.length) {
    renderEmpty(container, document.getElementById('proy-search').value ? 'Sin resultados' : 'No hay proyectos guardados');
    return;
  }
  container.innerHTML = proyectos.map(p => {
    const cl = p.clienteId ? _clientesCache.find(x => x.id === p.clienteId) : null;
    return `
      <div class="list-item" onclick="window._abrirProyecto('${escapeHtml(p.id)}')">
        <div class="list-item-icon" style="background:var(--accent-glow);color:var(--accent);font-family:var(--font-display);font-weight:700;font-size:.9rem">#${escapeHtml(String(p.numero))}</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(cl ? cl.nombre : 'Sin cliente')}</div>
          <div class="list-item-sub">${formatDate(p.fecha)} &middot; &#128119;${formatMoney(p.totalServicio)} &middot; &#128230;${formatMoney(p.totalMaterial)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="list-item-badge">${formatMoney(p.total)}</div>
          <button class="btn btn-danger btn-sm"
                  onclick="event.stopPropagation();window._eliminarProyecto('${escapeHtml(p.id)}','${escapeHtml(String(p.numero))}')"
                  title="Eliminar proyecto">&#10005;</button>
        </div>
      </div>`;
  }).join('');
}

// ─── ELIMINAR PROYECTO ────────────────────────────────────────────────────────
window._eliminarProyecto = function(id, numero) {
  confirmDialog(`¿Eliminar el proyecto #${numero}? Esta acción no se puede deshacer.`, async () => {
    try {
      // Borrar todos los ítems del proyecto primero
      const items = await CotizacionesDB.getItemsByProyecto(id);
      for (const item of items) {
        await CotizacionesDB.deleteItem(item.id);
      }
      // Borrar la cotización
      await CotizacionesDB.delete(id);
      showToast(`Proyecto #${numero} eliminado`);
      renderProyectos();
    } catch (err) {
      console.error('_eliminarProyecto:', err);
      showToast('Error al eliminar el proyecto', 'error');
    }
  });
};

// ─── LISTA DE PROYECTOS ───────────────────────────────────────────────────────
export async function renderProyectos(query = '') {
  const container = document.getElementById('recibos-list');
  setLoading(container);
  try {
    [_proyectosCache, _clientesCache] = await Promise.all([CotizacionesDB.getProyectos(), ClientesDB.getAll()]);
    _renderListaProyectos(container, _proyectosCache);
    // Restaurar filtro activo si lo había
    const q = document.getElementById('proy-search')?.value || '';
    if (q) _filtrarProyectos();
  } catch { renderEmpty(container, 'Error al cargar proyectos'); }
}

// ─── CALCULAR DESGLOSE DE UN ÍTEM ────────────────────────────────────────────
function _calcItem(item, descuentos, autoRate) {
  const qty         = parseFloat(item.cantidad)       || 0;
  const precio      = parseFloat(item.precioUnitario) || 0;
  const bruto       = qty * precio;
  const desc        = item.descuentoId ? descuentos.find(d => d.id === item.descuentoId) : null;
  const descMonto   = desc
    ? (desc.tipo === 'porcentaje' ? bruto * (desc.valor / 100) : parseFloat(desc.valor))
    : 0;
  const baseConDesc = Math.max(0, bruto - descMonto);
  const aplicaImp   = parseBool(item.aplicarImpuesto);
  const impMonto    = aplicaImp ? baseConDesc * autoRate : 0;
  const total       = baseConDesc + impMonto;
  return { qty, precio, bruto, desc, descMonto, baseConDesc, aplicaImp, impMonto, total };
}

// ─── ABRIR PROYECTO ───────────────────────────────────────────────────────────
window._abrirProyecto = async function(id) {
  const body = document.getElementById('proyecto-drawer-body');
  setLoading(body);
  openDrawer('proyecto-drawer');
  try {
    const [proyectos, clientes, descuentos, impuestos] = await Promise.all([
      CotizacionesDB.getAll(), ClientesDB.getAll(), DescuentosDB.getAll(), ImpuestosDB.getAll(),
    ]);
    const p = proyectos.find(x => x.id === id);
    if (!p) { body.innerHTML = '<p>Proyecto no encontrado</p>'; return; }
    _proyectoActual = p;
    document.getElementById('proyecto-drawer-title').textContent = `Proyecto #${p.numero}`;

    const todosItems    = await CotizacionesDB.getItemsByProyecto(id);
    _proyectoActual._items = todosItems;
    const itemsServ     = todosItems.filter(i => i.tipo === 'servicio');
    const itemsMat      = todosItems.filter(i => i.tipo === 'material');
    const itemsCompra   = todosItems.filter(i => i.tipo === 'compra');
    const cl            = p.clienteId ? clientes.find(x => x.id === p.clienteId) : null;
    const autoImpuestos = impuestos.filter(i => i.agregarAlPrecio);
    const autoRate      = autoImpuestos.reduce((s, i) => s + (parseFloat(i.tasa) || 0), 0) / 100;
    const sumar         = (items) => items.reduce((s, i) => s + _calcItem(i, descuentos, autoRate).total, 0);
    const subtotalServ  = sumar(itemsServ);
    const subtotalMat   = sumar(itemsMat);
    const subtotalCompra = itemsCompra.reduce((s, i) =>
      s + Math.max(0, (parseFloat(i.cantidad) || 0) * (parseFloat(i.precioUnitario) || 0)), 0);
    const grandTotal    = subtotalServ + subtotalMat;

    // Guardar contexto reutilizable
    _ctx = { p, cl, itemsServ, itemsMat, itemsCompra, descuentos, impuestos, autoImpuestos, autoRate, subtotalServ, subtotalMat, subtotalCompra, grandTotal };

    // ── Render ítems ──────────────────────────────────────────────────────────
    const renderItems = (items, tipo) => {
      if (!items.length) return `<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0;text-align:center">Sin artículos</div>`;
      return items.map(item => {
        const { qty, precio, bruto, desc, descMonto, aplicaImp, impMonto, total } = _calcItem(item, descuentos, autoRate);
        const hayAjustes = desc || aplicaImp;
        return `
          <div class="cart-item-row" onclick="window._editarProyectoItem('${id}','${item.id}','${tipo}')"
               style="cursor:pointer;align-items:flex-start;padding:12px 0">
            <div class="cart-item-info">
              <div class="cart-item-name">${item.nombre}</div>
              <div class="cart-item-qty" style="margin-top:3px">
                ${qty} &times; ${formatMoney(precio)}
                ${qty !== 1 ? `<span style="color:var(--text-muted)"> = ${formatMoney(bruto)}</span>` : ''}
              </div>
              ${desc ? `<div style="font-size:.78rem;color:var(--red);margin-top:2px">
                − Desc. ${desc.nombre}: <strong>${formatMoney(descMonto)}</strong>
                ${desc.tipo === 'porcentaje' ? `<span style="color:var(--text-muted)">(${desc.valor}%)</span>` : ''}
              </div>` : ''}
              ${aplicaImp && impMonto > 0 ? `<div style="font-size:.78rem;color:var(--electric-blue);margin-top:2px">
                + Imp. (${(autoRate * 100).toFixed(0)}%): <strong>${formatMoney(impMonto)}</strong>
              </div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;padding-left:8px">
              ${hayAjustes ? `<div style="font-size:.72rem;color:var(--text-muted);text-decoration:line-through">${formatMoney(bruto)}</div>` : ''}
              <div class="cart-item-price">${formatMoney(total)}</div>
            </div>
          </div>`;
      }).join('');
    };

    // ── Desglose de impuestos al pie ─────────────────────────────────────────
    const impFooter = autoImpuestos.map(imp => {
      const monto = todosItems
        .filter(i => parseBool(i.aplicarImpuesto))
        .reduce((s, i) => {
          const base = Math.max(0, _calcItem(i, descuentos, autoRate).baseConDesc);
          return s + base * ((parseFloat(imp.tasa) || 0) / 100);
        }, 0);
      return monto > 0 ? `
        <div class="total-row" style="font-size:.85rem">
          <span style="color:var(--text-secondary)">${imp.nombre} (${imp.tasa}%)</span>
          <span style="color:var(--electric-blue)">${formatMoney(monto)}</span>
        </div>` : '';
    }).join('');

    body.innerHTML = `
      <!-- CLIENTE -->
      <div class="card" style="margin-bottom:14px">
        <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Cliente</div>
        <div style="font-weight:600;font-size:.95rem">${cl ? cl.nombre : 'Sin cliente'}</div>
        ${cl?.telefono ? `<div style="font-size:.83rem;color:var(--text-secondary);margin-top:2px">${cl.telefono}</div>` : ''}
        ${cl?.email    ? `<div style="font-size:.83rem;color:var(--text-muted);margin-top:1px">${cl.email}</div>` : ''}
        <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px">${formatDate(p.fecha)}</div>
      </div>

      <!-- SERVICIOS -->
      <div style="font-family:var(--font-display);font-size:.83rem;font-weight:700;color:var(--electric-blue);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">&#128119; Servicios</div>
      ${renderItems(itemsServ, 'servicio')}
      <div class="total-row" style="margin-top:4px;border-top:1px solid var(--border-light);padding-top:8px">
        <span style="font-weight:600">Subtotal Servicios</span>
        <span style="font-family:var(--font-display);font-weight:700;color:var(--electric-blue)">${formatMoney(subtotalServ)}</span>
      </div>

      <div class="divider"></div>

      <!-- MATERIALES -->
      <div style="font-family:var(--font-display);font-size:.83rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">&#128230; Materiales (venta)</div>
      ${renderItems(itemsMat, 'material')}
      <div class="total-row" style="margin-top:4px;border-top:1px solid var(--border-light);padding-top:8px">
        <span style="font-weight:600">Subtotal Materiales</span>
        <span style="font-family:var(--font-display);font-weight:700;color:var(--accent)">${formatMoney(subtotalMat)}</span>
      </div>

      <div class="divider"></div>
      ${impFooter}
      <div class="total-row grand">
        <span>Total Proyecto</span>
        <span>${formatMoney(grandTotal)}</span>
      </div>

      ${itemsCompra.length ? `
      <div class="divider"></div>
      <!-- LISTA DE COMPRA -->
      <div style="font-family:var(--font-display);font-size:.83rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">&#128722; Lista de compra</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px">Materiales a adquirir por el cliente · precios de referencia</div>
      ${itemsCompra.map(item => {
        const qty    = parseFloat(item.cantidad) || 0;
        const precio = parseFloat(item.precioUnitario) || 0;
        return `
          <div class="cart-item-row" onclick="window._editarProyectoItem('${id}','${item.id}','compra')"
               style="cursor:pointer;padding:10px 0;opacity:.85">
            <div class="cart-item-info">
              <div class="cart-item-name">${item.nombre}</div>
              <div class="cart-item-qty">${qty} &times; ${formatMoney(precio)}</div>
            </div>
            <div class="cart-item-price" style="color:var(--text-secondary)">${formatMoney(qty * precio)}</div>
          </div>`;
      }).join('')}
      <div class="total-row" style="margin-top:4px;border-top:1px solid var(--border-light);padding-top:8px;opacity:.8">
        <span style="font-weight:600">Ref. Lista de compra</span>
        <span style="font-family:var(--font-display);font-weight:700;color:var(--text-secondary)">${formatMoney(subtotalCompra)}</span>
      </div>` : ''}

      <!-- BOTONES ENVÍO -->
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn btn-secondary" id="btn-wsp"
                style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px"
                onclick="window._enviarWhatsApp()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          WhatsApp
        </button>
        <button class="btn btn-secondary" id="btn-mail"
                style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px"
                onclick="window._enviarCorreo()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          Correo
        </button>
        <button class="btn btn-primary" id="btn-pdf"
                style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px"
                onclick="window._descargarPDF()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          </svg>
          PDF
        </button>
      </div>`;

  } catch (err) {
    body.innerHTML = `<p style="color:var(--red)">Error al cargar el proyecto</p>`;
    console.error(err);
  }
};

// ─── TEXTO RESUMEN (WhatsApp + correo) ────────────────────────────────────────
function _generarTexto() {
  if (!_ctx) return '';
  const { p, cl, itemsServ, itemsMat, itemsCompra, descuentos, autoRate, subtotalServ, subtotalMat, subtotalCompra, grandTotal } = _ctx;

  const bloque = (items, label) => {
    if (!items.length) return '';
    let txt = `\n${label}\n`;
    items.forEach(item => {
      const { qty, precio, desc, descMonto, aplicaImp, impMonto, total } = _calcItem(item, descuentos, autoRate);
      txt += `• ${item.nombre}\n`;
      txt += `  ${qty} × ${formatMoney(precio)}`;
      if (desc)      txt += `  −${desc.nombre}: ${formatMoney(descMonto)}`;
      if (aplicaImp && impMonto > 0) txt += `  +Imp: ${formatMoney(impMonto)}`;
      txt += `  → ${formatMoney(total)}\n`;
    });
    return txt;
  };

  const bloqueCompra = (items) => {
    if (!items.length) return '';
    let txt = `\nLISTA DE COMPRA (referencia)\n`;
    items.forEach(item => {
      const qty    = parseFloat(item.cantidad) || 0;
      const precio = parseFloat(item.precioUnitario) || 0;
      txt += `• ${item.nombre}  ${qty} × ${formatMoney(precio)}  ≈ ${formatMoney(qty * precio)}\n`;
    });
    txt += `Ref. total compra: ${formatMoney(subtotalCompra)}\n`;
    return txt;
  };

  let msg = `*Cotización ECA #${p.numero}*\n`;
  msg += `Fecha: ${formatDate(p.fecha)}\n`;
  if (cl) msg += `Cliente: ${cl.nombre}\n`;
  msg += bloque(itemsServ, 'SERVICIOS');
  msg += `Subtotal Servicios: ${formatMoney(subtotalServ)}\n`;
  msg += bloque(itemsMat, 'MATERIALES (venta)');
  if (itemsMat.length) msg += `Subtotal Materiales: ${formatMoney(subtotalMat)}\n`;
  msg += `\n*TOTAL: ${formatMoney(grandTotal)}*`;
  msg += bloqueCompra(itemsCompra);
  return msg;
}

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
window._enviarWhatsApp = function() {
  if (!_ctx) return;
  const { cl } = _ctx;
  const texto  = _generarTexto();
  let tel      = String(cl?.telefono || '').replace(/\D/g, '');
  // Agregar código de país México (52) si el número tiene 10 dígitos
  if (tel.length === 10) tel = '52' + tel;
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
};

// ─── CORREO ───────────────────────────────────────────────────────────────────
window._enviarCorreo = function() {
  if (!_ctx) return;
  const { p, cl } = _ctx;
  const email  = cl?.email || '';
  const asunto = encodeURIComponent(`Cotización ECA #${p.numero}`);
  const cuerpo = encodeURIComponent(_generarTexto());
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, '_blank');
};

// ─── PDF ──────────────────────────────────────────────────────────────────────
window._descargarPDF = async function() {
  if (!_ctx) return;
  const btn = document.getElementById('btn-pdf');
  if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }

  try {
    await _loadJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const { p, cl, itemsServ, itemsMat, itemsCompra, descuentos, autoImpuestos, autoRate, subtotalServ, subtotalMat, subtotalCompra, grandTotal } = _ctx;
    const todosItems = [...itemsServ, ...itemsMat]; // compra no aplica impuestos automáticos

    const W     = 210;
    const MAR   = 14;
    const INNER = W - MAR * 2;
    let   y     = 0;

    const nextLine = (h = 6) => {
      y += h;
      if (y > 275) { doc.addPage(); y = 20; }
    };

    // ── ENCABEZADO ────────────────────────────────────────────────────────────
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(MAR, 10, 36, 16, 2, 2, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 180, 180);
    doc.text('LOGO', MAR + 18, 19, { align: 'center' });

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('ECA', W - MAR, 17, { align: 'right' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Cotización #${p.numero}`, W - MAR, 23, { align: 'right' });
    doc.text(`Fecha: ${formatDate(p.fecha)}`, W - MAR, 28, { align: 'right' });

    y = 32;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(MAR, y, W - MAR, y);
    y = 38;

    // ── CLIENTE ───────────────────────────────────────────────────────────────
    if (cl) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(160, 160, 160);
      doc.text('CLIENTE', MAR, y);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(30, 30, 30);
      doc.text(String(cl.nombre || ''), MAR, y);
      y += 5.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      if (cl.telefono)  { doc.text(String(cl.telefono),  MAR, y); y += 4.5; }
      if (cl.email)     { doc.text(String(cl.email),     MAR, y); y += 4.5; }
      y += 3;
    }

    // ── TABLA DE ÍTEMS ────────────────────────────────────────────────────────
    const renderTabla = (items, titulo, rgb) => {
      if (!items.length) return;

      // Determinar si algún ítem usa descuento y/o impuesto
      const hayDesc = items.some(i => {
        const { desc } = _calcItem(i, descuentos, autoRate);
        return !!desc;
      });
      const hayImp = items.some(i => {
        const { aplicaImp, impMonto } = _calcItem(i, descuentos, autoRate);
        return aplicaImp && impMonto > 0;
      });

      // Título de Sección
      doc.setFillColor(...rgb);
      doc.roundedRect(MAR, y, INNER, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(titulo, MAR + 3, y + 4.8);
      y += 11;

      // Cabecera de Columnas — solo mostrar DESC. e IMP. si aplican
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text('CONCEPTO', MAR + 1, y);
      doc.text('CANT.',    MAR + 75,  y, { align: 'right' });
      doc.text('P. UNIT.', MAR + 100, y, { align: 'right' });
      if (hayDesc) doc.text('DESC.',  MAR + 125, y, { align: 'right' });
      if (hayImp)  doc.text('IMP.',   MAR + 150, y, { align: 'right' });
      doc.text('NETO', W - MAR, y, { align: 'right' });

      y += 3;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.line(MAR, y, W - MAR, y);
      y += 6;

      // Filas de artículos
      items.forEach((item, idx) => {
        const { qty, precio, desc, descMonto, aplicaImp, impMonto, total } = _calcItem(item, descuentos, autoRate);
        const rowH = 7;
        if (y + rowH > 275) { doc.addPage(); y = 20; }

        if (idx % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(MAR, y - 4, INNER, rowH, 'F');
        }

        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'bold');
        doc.text(String(item.nombre || '').substring(0, 35), MAR + 1, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(qty),          MAR + 75,  y, { align: 'right' });
        doc.text(formatMoney(precio),  MAR + 100, y, { align: 'right' });

        if (hayDesc) {
          if (desc) {
            doc.setTextColor(180, 60, 60);
            doc.setFontSize(7);
            doc.text(`-${formatMoney(descMonto)}`, MAR + 125, y, { align: 'right' });
          } else {
            doc.setTextColor(200, 200, 200);
            doc.setFontSize(7);
            doc.text('-', MAR + 125, y, { align: 'right' });
          }
        }

        if (hayImp) {
          doc.setFontSize(7);
          if (aplicaImp && impMonto > 0) {
            doc.setTextColor(30, 100, 180);
            doc.text(`+${formatMoney(impMonto)}`, MAR + 150, y, { align: 'right' });
          } else {
            doc.setTextColor(200, 200, 200);
            doc.text('-', MAR + 150, y, { align: 'right' });
          }
        }

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(formatMoney(total), W - MAR, y, { align: 'right' });
        y += rowH;
      });
      y += 2;
    };

    // Renderizar Secciones — solo las que tienen ítems
    if (itemsServ.length) {
      renderTabla(itemsServ, 'SERVICIOS', [40, 100, 180]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(40, 100, 180);
      doc.text('Subtotal Servicios', W - MAR - 50, y, { align: 'right' });
      doc.text(formatMoney(subtotalServ), W - MAR, y, { align: 'right' });
      y += 10;
    }

    if (itemsMat.length) {
      renderTabla(itemsMat, 'MATERIALES (VENTA)', [180, 120, 10]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(180, 120, 10);
      doc.text('Subtotal Materiales', W - MAR - 50, y, { align: 'right' });
      doc.text(formatMoney(subtotalMat), W - MAR, y, { align: 'right' });
      y += 10;
    }

    // ── DESGLOSE IMPUESTOS GLOBALES (solo si alguno aplica) ───────────────────
    if (itemsServ.length || itemsMat.length) {
      autoImpuestos.forEach(imp => {
        const monto = todosItems
          .filter(i => parseBool(i.aplicarImpuesto))
          .reduce((s, i) => s + Math.max(0, _calcItem(i, descuentos, autoRate).baseConDesc) * ((parseFloat(imp.tasa) || 0) / 100), 0);
        if (monto > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(80, 80, 80);
          doc.text(`${imp.nombre} (${imp.tasa}%)`, W - MAR - 50, y, { align: 'right' });
          doc.setTextColor(30, 100, 180);
          doc.text(formatMoney(monto), W - MAR, y, { align: 'right' });
          y += 6;
        }
      });

      doc.setDrawColor(50, 50, 50);
      doc.setLineWidth(0.5);
      doc.line(W - MAR - 70, y, W - MAR, y);
      y += 7;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 30, 30);
      doc.text('TOTAL', W - MAR - 50, y, { align: 'right' });
      doc.text(formatMoney(grandTotal), W - MAR, y, { align: 'right' });
      y += 14;
    }

    // ── LISTA DE COMPRA (referencia, página separada si hay ítems) ────────────
    if (itemsCompra.length) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(MAR, y, W - MAR, y);
      y += 8;

      doc.setFillColor(240, 240, 240);
      doc.roundedRect(MAR, y, INNER, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('LISTA DE COMPRA  ·  Materiales a adquirir por el cliente', MAR + 3, y + 4.8);
      y += 11;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text('CONCEPTO', MAR + 1, y);
      doc.text('CANT.',    MAR + 100, y, { align: 'right' });
      doc.text('P. REF.',  MAR + 130, y, { align: 'right' });
      doc.text('SUBTOTAL', W - MAR,   y, { align: 'right' });
      y += 3;
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.2);
      doc.line(MAR, y, W - MAR, y);
      y += 6;

      itemsCompra.forEach((item, idx) => {
        const qty    = parseFloat(item.cantidad) || 0;
        const precio = parseFloat(item.precioUnitario) || 0;
        const rowH   = 7;
        if (y + rowH > 275) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) {
          doc.setFillColor(249, 249, 249);
          doc.rect(MAR, y - 4, INNER, rowH, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(String(item.nombre || '').substring(0, 45), MAR + 1, y);
        doc.text(String(qty),           MAR + 100, y, { align: 'right' });
        doc.text(formatMoney(precio),   MAR + 130, y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(formatMoney(qty * precio), W - MAR, y, { align: 'right' });
        y += rowH;
      });

      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text('Ref. total lista de compra', W - MAR - 50, y, { align: 'right' });
      doc.text(formatMoney(subtotalCompra), W - MAR, y, { align: 'right' });
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(170, 170, 170);
      doc.text('* Precios de referencia, no incluidos en el total de la cotización.', MAR, y);
    }

    // Pie de página
    const totalPags = doc.getNumberOfPages();
    for (let i = 1; i <= totalPags; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(190, 190, 190);
      doc.text('ECA · Cotización generada automáticamente', MAR, 290);
      doc.text(`Página ${i} / ${totalPags}`, W - MAR, 290, { align: 'right' });
    }

    doc.save(`ECA-Cotizacion-${p.numero}.pdf`);
    showToast('PDF descargado ✓');
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Error al generar el PDF', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg> PDF`;
    }
  }
};

// ─── EDITAR ÍTEM DEL PROYECTO ─────────────────────────────────────────────────
window._editarProyectoItem = async function(proyectoId, itemId, tipo) {
  const item = _proyectoActual?._items?.find(i => i.id === itemId);
  if (!item) return;
  _proyectoItemEdit = { proyectoId, itemId, tipo };

  document.getElementById('proy-item-drawer-title').textContent = item.nombre;
  document.getElementById('proy-item-qty').value    = item.cantidad;
  document.getElementById('proy-item-precio').value = item.precioUnitario;
  document.getElementById('proy-item-impuesto').checked = parseBool(item.aplicarImpuesto);

  const descs = await DescuentosDB.getAll();
  document.getElementById('proy-item-descuento').innerHTML =
    `<option value="">Sin descuento</option>` +
    descs.map(d => `<option value="${d.id}" ${item.descuentoId === d.id ? 'selected' : ''}>${d.nombre}</option>`).join('');

  openDrawer('proy-item-drawer');
};

async function _saveProyectoItem() {
  if (!_proyectoItemEdit) return;
  const { proyectoId, itemId } = _proyectoItemEdit;
  const btn = document.getElementById('btn-proy-item-save');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await CotizacionesDB.updateItem(itemId, {
      cantidad:        parseFloat(document.getElementById('proy-item-qty').value)    || 0,
      precioUnitario:  parseFloat(document.getElementById('proy-item-precio').value) || 0,
      descuentoId:     document.getElementById('proy-item-descuento').value || '',
      aplicarImpuesto: document.getElementById('proy-item-impuesto').checked ? 'TRUE' : 'FALSE',
    });
    closeDrawer('proy-item-drawer');
    showToast('Artículo actualizado');
    await window._abrirProyecto(proyectoId);
    await renderProyectos();
  } finally { btn.disabled = false; btn.textContent = 'Actualizar'; }
}

function _deleteProyectoItem() {
  if (!_proyectoItemEdit) return;
  const { proyectoId, itemId } = _proyectoItemEdit;
  confirmDialog('Eliminar este artículo del proyecto?', async () => {
    await CotizacionesDB.deleteItem(itemId);
    closeDrawer('proy-item-drawer');
    showToast('Artículo eliminado');
    await window._abrirProyecto(proyectoId);
    await renderProyectos();
  });
}