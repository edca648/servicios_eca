// =============================================
// ECA · core/ui.js
// Componentes de UI reutilizables.
// =============================================

// ---- TOAST ----
export function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  const icons     = { success: '&#10003;', error: '&#10005;', info: '&#9432;' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '&bull;'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

// ---- DRAWERS ----
export function openDrawer(id) {
  document.getElementById(id + '-overlay').classList.add('active');
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeDrawer(id) {
  document.getElementById(id + '-overlay').classList.remove('active');
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ---- LOADING SPINNER ----
export function setLoading(container, grid = false) {
  const cols = grid ? 'grid-column:1/-1;' : '';
  container.innerHTML = `
    <div style="${cols}text-align:center;padding:32px 0;color:var(--text-muted)">
      <div style="display:inline-block;width:22px;height:22px;border:2px solid var(--border);
        border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>`;
}

// ---- EMPTY STATE ----
export function renderEmpty(container, msg = 'No hay elementos') {
  container.innerHTML = `
    <div class="empty-state">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0
          01-2-2v-5m16 0H4"/>
      </svg>
      <p>${msg}</p>
    </div>`;
}

// ---- CONFIRM DIALOG ----
export function confirmDialog(msg, onYes) {
  const existing = document.getElementById('confirm-wrap');
  if (existing) existing.remove();

  // Escapar el mensaje para prevenir XSS
  const safeMsgEl = document.createElement('p');
  safeMsgEl.style.cssText = 'color:var(--text-secondary);font-size:.95rem;line-height:1.5';
  safeMsgEl.textContent = msg;

  const el = document.createElement('div');
  el.id = 'confirm-wrap';
  el.innerHTML = `
    <div class="drawer-overlay active" id="confirm-overlay" style="z-index:2000"></div>
    <div class="drawer open" style="z-index:2100;max-height:240px">
      <div class="drawer-handle"></div>
      <div class="drawer-header">
        <span class="drawer-title">Confirmar</span>
      </div>
      <div class="drawer-body" id="confirm-body"></div>
      <div class="drawer-footer">
        <button class="btn btn-secondary" id="confirm-no">Cancelar</button>
        <button class="btn btn-danger"    id="confirm-yes">Eliminar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('confirm-body').appendChild(safeMsgEl);

  const close = () => { el.remove(); document.body.style.overflow = ''; };
  document.getElementById('confirm-no').addEventListener('click', close);
  document.getElementById('confirm-overlay').addEventListener('click', close);
  document.getElementById('confirm-yes').addEventListener('click', () => { close(); onYes(); });
}