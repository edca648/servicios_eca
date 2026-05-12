// =============================================
// ECA · app.js
// Bootstrap: importa modulos, arranca el router.
// Para agregar un nuevo modulo:
//   1. Crear modules/nuevo.js
//   2. Importar initNuevo y renderNuevo aqui
//   3. Agregar a PAGE_MAP y llamar initNuevo()
// =============================================

import { initCotizacion, renderArticulosTiles, renderCartTotales, poblarCatFilter } from './modules/cotizacion.js';
import { initArticulos,  renderArticulosList }  from './modules/articulos.js';
import { initCategorias, renderCategorias }     from './modules/categorias.js';
import { initDescuentos, renderDescuentosList } from './modules/descuentos.js';
import { initImpuestos,  renderImpuestosList }  from './modules/impuestos.js';
import { initClientes }                         from './modules/clientes.js';
import { initProyectos,  renderProyectos }      from './modules/proyectos.js';
import { initConfiguracion, renderConfiguracion, checkTokenModal, loadToken } from './modules/configuracion.js';
import { CategoriasDB }                         from './db/categorias.db.js';
import { showToast }                            from './core/ui.js';
import { initTheme }                            from './core/theme.js';
import { initSync }                             from './core/sync.js';

// =============================================
// ROUTER — mapa de paginas a sus funciones
// Para agregar una pagina nueva: agregar aqui.
// =============================================
const PAGE_MAP = {
  cotizacion:    async () => { await poblarCatFilter(); await renderArticulosTiles(); await renderCartTotales(); },
  articulos:     async () => {
    const cats = await CategoriasDB.getAll();
    const f    = document.getElementById('art-cat-filter');
    f.innerHTML = `<option value="todas">Todas</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    await renderArticulosList();
  },
  recibos:       () => renderProyectos(),
  descuentos:    () => renderDescuentosList(),
  impuestos:     () => renderImpuestosList(),
  categorias:    () => renderCategorias(),
  configuracion: () => renderConfiguracion(),
};

// =============================================
// SIDEBAR
// =============================================
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');

  const closeSidebar = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    hamburger.classList.remove('open');
  };

  hamburger.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', open);
    hamburger.classList.toggle('open', open);
  });
  overlay.addEventListener('click', closeSidebar);

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => { navigateTo(item.dataset.page); closeSidebar(); });
  });

  document.querySelectorAll('.nav-item[data-submenu]').forEach(item => {
    item.addEventListener('click', () => {
      const sub   = document.getElementById(item.dataset.submenu);
      const arrow = item.querySelector('.nav-arrow');
      const open  = sub.classList.toggle('open');
      arrow?.classList.toggle('open', open);
    });
  });

  document.querySelectorAll('.nav-subitem[data-page]').forEach(item => {
    item.addEventListener('click', () => { navigateTo(item.dataset.page); closeSidebar(); });
  });
}

// =============================================
// NAVIGATE
// =============================================
const PAGE_TITLES = {
  cotizacion:    'Cotizacion',
  recibos:       'Proyectos',
  articulos:     'Articulos',
  categorias:    'Categorias',
  descuentos:    'Descuentos',
  impuestos:     'Configuracion > Impuestos',
  configuracion: 'Configuracion > Token',
};

export function navigateTo(page) {
  // --- NUEVO: Emitir evento antes de navegar (el guard puede cancelarlo) ---
  let cancelado = false;
  const event = new CustomEvent('eca-navigate', {
    detail: { page },
    cancelable: true,
  });
  
  // Listener temporal para saber si fue cancelado
  const onCancel = (e) => { cancelado = true; };
  document.addEventListener('eca-navigate-force', onCancel, { once: true });
  
  document.dispatchEvent(event);
  
  if (event.defaultPrevented && !cancelado) return;
  document.removeEventListener('eca-navigate-force', onCancel);
  // --- FIN NUEVO ---

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .nav-subitem').forEach(i => i.classList.remove('active'));

  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  const hdr = document.getElementById('header-title');
  if (hdr) hdr.textContent = PAGE_TITLES[page] || '';

  // Llamar la funcion de render de la pagina
  PAGE_MAP[page]?.().catch(err => {
    console.error(`[navigate] ${page}:`, err);
    showToast('Error al cargar la pagina', 'error');
  });
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  // Cargar token guardado en window.ECA_TOKEN antes de cualquier petición
  loadToken();

  initTheme();
  initSidebar();
  initSync();
  checkTokenModal();

  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(r => console.info('[SW] registrado:', r.scope))
      .catch(e => console.warn('[SW] fallo:', e));
  }

  // Re-renderizar la página activa tras sincronización
  document.addEventListener('eca-synced', () => {
    const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
    if (activePage) PAGE_MAP[activePage]?.().catch(() => {});
    showToast('Sincronización completada ✓', 'success');
  });

  // Inicializar todos los modulos
  initCotizacion();
  initArticulos();
  initCategorias();
  initDescuentos();
  initImpuestos();
  initClientes();
  initProyectos();
  initConfiguracion();
});