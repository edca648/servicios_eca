// =============================================
// ECA · modules/configuracion.js
// Gestión del token secreto en localStorage.
// El token se lee en api.js via window.ECA_TOKEN.
// =============================================

const TOKEN_KEY = 'eca-token';

// Leer token guardado y ponerlo en window para que api.js lo use
export function loadToken() {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  window.ECA_TOKEN = token;
  return token;
}

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
  window.ECA_TOKEN = token.trim();
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.ECA_TOKEN = '';
}

// ── MODAL PRIMERA VEZ ────────────────────────────────────────────────────────
export function checkTokenModal() {
  const token = loadToken();
  if (token) return; // ya tiene token, no mostrar modal

  const overlay = document.getElementById('token-modal-overlay');
  overlay.style.display = 'flex';

  document.getElementById('modal-token-save').addEventListener('click', () => {
    const val = document.getElementById('modal-token-input').value.trim();
    if (!val) {
      document.getElementById('modal-token-input').style.borderColor = 'var(--red)';
      return;
    }
    saveToken(val);
    overlay.style.display = 'none';
  });

  // Guardar con Enter
  document.getElementById('modal-token-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('modal-token-save').click();
  });
}

// ── PÁGINA DE CONFIGURACIÓN ──────────────────────────────────────────────────
export function initConfiguracion() {
  _renderStatus();

  // Mostrar/ocultar token
  document.getElementById('cfg-token-toggle').addEventListener('click', () => {
    const input = document.getElementById('cfg-token-input');
    input.type  = input.type === 'password' ? 'text' : 'password';
  });

  // Guardar token
  document.getElementById('cfg-token-save').addEventListener('click', () => {
    const val = document.getElementById('cfg-token-input').value.trim();
    if (!val) { _shake('cfg-token-input'); return; }
    saveToken(val);
    document.getElementById('cfg-token-input').value = '';
    _renderStatus();
    // Importar showToast dinámicamente para no crear dependencia circular
    import('../core/ui.js').then(({ showToast }) => showToast('Token guardado ✓'));
  });

  // Borrar token
  document.getElementById('cfg-token-clear').addEventListener('click', () => {
    clearToken();
    document.getElementById('cfg-token-input').value = '';
    _renderStatus();
    import('../core/ui.js').then(({ showToast }) => showToast('Token eliminado', 'info'));
  });
}

export function renderConfiguracion() {
  _renderStatus();
}

function _renderStatus() {
  const el    = document.getElementById('cfg-status');
  if (!el) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    const masked = token.substring(0, 3) + '•'.repeat(Math.max(0, token.length - 3));
    el.style.background   = 'rgba(63,185,80,.08)';
    el.style.borderColor  = 'rgba(63,185,80,.25)';
    el.innerHTML = `
      <span style="width:10px;height:10px;border-radius:50%;background:#3fb950;flex-shrink:0"></span>
      <div>
        <div style="font-weight:600;font-size:.85rem;color:var(--text-primary)">Token configurado</div>
        <div style="font-size:.75rem;color:var(--text-muted);font-family:monospace">${masked}</div>
      </div>`;
  } else {
    el.style.background   = 'rgba(248,81,73,.08)';
    el.style.borderColor  = 'rgba(248,81,73,.25)';
    el.innerHTML = `
      <span style="width:10px;height:10px;border-radius:50%;background:var(--red);flex-shrink:0"></span>
      <div>
        <div style="font-weight:600;font-size:.85rem;color:var(--red)">Sin token</div>
        <div style="font-size:.75rem;color:var(--text-muted)">La app no puede conectar con Google Sheets</div>
      </div>`;
  }
}

function _shake(id) {
  const el = document.getElementById(id);
  el.style.borderColor = 'var(--red)';
  el.animate([
    { transform: 'translateX(0)' },
    { transform: 'translateX(-6px)' },
    { transform: 'translateX(6px)' },
    { transform: 'translateX(0)' },
  ], { duration: 250 });
}
