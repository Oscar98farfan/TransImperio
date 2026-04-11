/* ============================================================
   TRANSIMPERIO — main.js
   Módulo principal: nav, rastreo, formulario, animaciones
   ============================================================ */

'use strict';

/* ── NAV SCROLL EFFECT ── */
(function initNav() {
  const nav = document.getElementById('main-nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
})();

/* ── HAMBURGER MENU ── */
function toggleMenu() {
  const menu  = document.getElementById('mobileMenu');
  const btn   = document.querySelector('.hamburger');
  menu.classList.toggle('open');
  btn.classList.toggle('open');
}

/* ── CERRAR MOBILE MENU AL HACER CLICK EN UN LINK ── */
document.querySelectorAll('.mobile-menu a').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('mobileMenu').classList.remove('open');
    document.querySelector('.hamburger').classList.remove('open');
  });
});

/* ── SCROLL REVEAL ── */
(function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();

/* ── APPSHEET IFRAME LOADER ── */
(function initIframeLoader() {
  const iframe = document.getElementById('appsheet-iframe');
  const loader = document.getElementById('iframe-loader');
  if (!iframe || !loader) return;

  iframe.addEventListener('load', () => {
    loader.classList.add('hidden');
  });
  // fallback por timeout
  setTimeout(() => loader.classList.add('hidden'), 8000);
})();

/* ============================================================
   RASTREO DE GUÍAS
   - En modo DEMO usa datos locales.
   - Descomenta la sección "API REAL" y rellena tus credenciales
     de AppSheet cuando tu app esté publicada.
   ============================================================ */

const DEMO_DATA = {
  'TI-001': { destinatario: 'Cliente XYZ',     ciudad: 'Medellín', estado: 'En tránsito', fecha: '06/04/2025' },
  'TI-002': { destinatario: 'Almacén Sur',      ciudad: 'Bogotá',   estado: 'Entregado',   fecha: '05/04/2025' },
  'TI-003': { destinatario: 'Bodega Cali',      ciudad: 'Cali',     estado: 'Pendiente',   fecha: '07/04/2025' },
};

async function rastrearEnvio() {
  const input = document.getElementById('guia-input');
  const res   = document.getElementById('tracking-result');
  const guia  = input.value.trim();

  if (!guia) {
    showTrackingError(res, 'Por favor ingresa un número de guía.');
    return;
  }

  res.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;color:var(--blue-200);font-size:14px;">
      <div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div>
      <span>Consultando...</span>
    </div>`;

  // ── MODO DEMO ──────────────────────────────────────────
  await new Promise(r => setTimeout(r, 800));
  const data = DEMO_DATA[guia.toUpperCase()];

  if (!data) {
    showTrackingError(res, `No se encontró información para la guía <strong>${guia}</strong>. Verifica el número o contáctanos.`);
    return;
  }
  renderTrackingResult(res, guia, data);

  // ── API REAL (AppSheet) ─────────────────────────────────
  // 1. Reemplaza APP_ID, TABLE y API_KEY con tus datos reales.
  // 2. Elimina el bloque DEMO de arriba y descomenta esto:
  /*
  const APP_ID  = 'TU_APP_ID';
  const TABLE   = 'Guias';       // nombre de tu tabla en AppSheet
  const API_KEY = 'TU_API_KEY';  // App Access Key de la app publicada

  try {
    const response = await fetch(
      `https://api.appsheet.com/api/v2/apps/${APP_ID}/tables/${TABLE}/Action`,
      {
        method: 'POST',
        headers: {
          'ApplicationAccessKey': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          Action: 'Find',
          Properties: {},
          Rows: [{ 'Numero_Guia': guia }]
        })
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    if (!json || json.length === 0) {
      showTrackingError(res, `No se encontró la guía <strong>${guia}</strong>.`);
      return;
    }

    const d = json[0];
    renderTrackingResult(res, guia, {
      destinatario: d['Destinatario'],
      ciudad:       d['Ciudad_Destino'],
      estado:       d['Estado'],
      fecha:        d['Fecha_Actualizacion']
    });
  } catch (err) {
    console.error('Error rastreo:', err);
    showTrackingError(res, 'Error al consultar el servidor. Intenta de nuevo.');
  }
  */
}

function renderTrackingResult(container, guia, data) {
  const statusClass = {
    'Entregado':   'status-entregado',
    'En tránsito': 'status-transito',
    'Pendiente':   'status-pendiente',
  }[data.estado] || 'status-pendiente';

  container.innerHTML = `
    <div class="result-card">
      <div style="font-size:12px;color:var(--blue-200);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Guía</div>
      <div style="font-size:15px;color:var(--white);font-weight:500;margin-bottom:12px">${guia.toUpperCase()}</div>

      <div style="font-size:12px;color:var(--blue-200);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Estado</div>
      <div style="margin-bottom:12px"><span class="status-badge ${statusClass}">${data.estado}</span></div>

      <div style="font-size:12px;color:var(--blue-200);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Destino</div>
      <div style="font-size:15px;color:var(--white);font-weight:500;margin-bottom:12px">${data.destinatario} — ${data.ciudad}</div>

      <div style="font-size:12px;color:var(--blue-200);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Última actualización</div>
      <div style="font-size:15px;color:var(--white);font-weight:500">${data.fecha}</div>
    </div>`;
}

function showTrackingError(container, msg) {
  container.innerHTML = `<span class="error-msg">${msg}</span>`;
}

/* Enter en el input de rastreo */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('guia-input');
  if (input) input.addEventListener('keypress', e => { if (e.key === 'Enter') rastrearEnvio(); });
});

/* ── FORMULARIO DE CONTACTO ── */
function enviarFormulario() {
  const campos = {
    nombre:  document.getElementById('f-nombre').value.trim(),
    empresa: document.getElementById('f-empresa').value.trim(),
    email:   document.getElementById('f-email').value.trim(),
    servicio:document.getElementById('f-servicio').value,
    mensaje: document.getElementById('f-mensaje').value.trim(),
  };
  const msg = document.getElementById('form-msg');

  if (!campos.nombre || !campos.email || !campos.mensaje) {
    msg.style.color = '#F09595';
    msg.textContent = 'Por favor completa nombre, correo y mensaje.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email)) {
    msg.style.color = '#F09595';
    msg.textContent = 'Por favor ingresa un correo válido.';
    return;
  }

  const asunto = encodeURIComponent('Contacto desde web — TRANSIMPERIO');
  const cuerpo = encodeURIComponent(
    `Nombre: ${campos.nombre}\nCorreo: ${campos.email}\nEmpresa: ${campos.empresa || 'No indicada'}\nServicio: ${campos.servicio || 'No indicado'}\n\n${campos.mensaje}`
  );
  window.location.href = `mailto:logisticatransimperio@gmail.com?subject=${asunto}&body=${cuerpo}`;

  msg.style.color = 'var(--accent)';
  msg.textContent = '¡Gracias! Se abrirá tu correo para enviar el mensaje.';
}