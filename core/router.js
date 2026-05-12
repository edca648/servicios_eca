// =============================================
// ECA · core/router.js
// Router / navegación SPA.
// Extraído de app.js para romper la dependencia
// circular con cotizacion.js.
// =============================================

const PAGE_TITLES = {
  cotizacion: 'Cotizacion',
  recibos:    'Proyectos',
  articulos:  'Articulos',
  categorias: 'Categorias',
  descuentos: 'Descuentos',
  impuestos:  'Configuracion > Impuestos',
};

// Flag para saltar el guard de cotizacion en navegaciones forzadas
let _navigateForced = false;

/**
 * Navega forzosamente sin disparar el guard de cotizacion.
 * Usado por cotizacion.js tras confirmar descarte del carrito.
 */
export function forceNavigate(page) {
  _navigateForced = true;
  navigateTo(page);
  _navigateForced = false;
}

/**
 * Navega a una página del SPA.
 * Emite el evento cancelable 'eca-navigate' antes de hacerlo;
 * cotizacion.js puede cancelarlo con e.preventDefault() si hay items sin guardar.
 *
 * @param {string} page
 * @param {Function} [renderFn] - función async de render asociada a la página
 */
export function navigateTo(page, renderFn) {
  if (!_navigateForced) {
    const event = new CustomEvent('eca-navigate', {
      detail: { page },
      cancelable: true,
    });
    document.dispatchEvent(event);
    if (event.defaultPrevented) return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .nav-subitem').forEach(i => i.classList.remove('active'));

  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  const hdr = document.getElementById('header-title');
  if (hdr) hdr.textContent = PAGE_TITLES[page] || '';

  renderFn?.();
}
