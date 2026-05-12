// =============================================
// ECA · core/theme.js
// Modo claro / oscuro con persistencia en localStorage.
// =============================================

const STORAGE_KEY = 'eca-theme';

export function initTheme() {
  // Aplicar tema guardado (o preferencia del sistema)
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  _apply(theme);

  // Inyectar boton en el header
  const header = document.querySelector('.header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.id = 'theme-toggle';
  btn.className = 'theme-toggle';
  btn.title = 'Cambiar tema';
  btn.innerHTML = `
    <!-- Luna: visible en modo oscuro -->
    <svg class="icon-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/>
    </svg>
    <!-- Sol: visible en modo claro -->
    <svg class="icon-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5"/>
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42
           M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>`;

  header.appendChild(btn);

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    _apply(current === 'dark' ? 'light' : 'dark');
  });
}

function _apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}