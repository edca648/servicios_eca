// =============================================
// ECA · core/utils.js
// Funciones puras sin dependencias externas.
// =============================================

// Escapar HTML para prevenir XSS al insertar datos en innerHTML
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function formatMoney(amount) {
  return '$' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string')  return val.toUpperCase() === 'TRUE';
  return !!val;
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Representacion visual de un articulo
export function getRepIcon(articulo) {
  const rep = articulo.rep;
  if (!rep || !rep.tipo) return '<span style="font-size:1.2rem">&#128119;</span>';
  if (rep.tipo === 'color')
    return `<div style="width:24px;height:24px;border-radius:50%;background:${rep.valor};border:2px solid rgba(255,255,255,.2)"></div>`;
  if (rep.tipo === 'forma')
    return `<span style="font-size:1.4rem">${rep.valor}</span>`;
  if (rep.tipo === 'imagen')
    return `<img src="${rep.valor}" style="width:36px;height:36px;object-fit:cover;border-radius:4px">`;
  return '<span style="font-size:1.2rem">&#128119;</span>';
}

export function getArticuloBg(articulo) {
  const rep = articulo.rep;
  if (!rep || !rep.tipo) return 'background:var(--bg-elevated)';
  if (rep.tipo === 'color')
    return `background:${rep.valor}22;border:1px solid ${rep.valor}44`;
  return 'background:var(--bg-elevated)';
}