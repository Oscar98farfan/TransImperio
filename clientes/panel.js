/* ============================================================
   TRANSIMPERIO — Panel de Clientes
   panel.js — sesión, navegación, carga masiva, guías, seguimiento
   ============================================================ */

'use strict';

// ── URL del Web App de Apps Script ──────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbxGwRg6BjkmxkQM-DQgaKUoRlj211DFtZKhD0T5KBcUFvgf30SjxmC7roZ90QIICyuJUw/exec";

// ── Helper único para llamar al backend (POST, sin headers → text/plain, sin preflight CORS) ──
async function apiCall(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Respuesta inesperada del servidor: " + text.slice(0, 120));
  }
}

// ── Estado global ────────────────────────────────────────────
let usuario = null;
let datosCarga = [];
let vistaActual = "";

// Estado propio de la vista "Mis Guías"
let guiasData = [];       // todas las guías tal cual vienen del backend
let guiasFiltradas = [];  // resultado del filtro activo
let paginaGuias = 1;
const GUIAS_POR_PAGINA = 15;

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {

  const raw = sessionStorage.getItem("usuario");
  if (!raw) { window.location.href = "index.html"; return; }

  usuario = JSON.parse(raw);

  document.getElementById("nombreUsuario").textContent = usuario.Nombre;
  document.getElementById("userAvatar").textContent =
    usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";

  // Navegación sidebar
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      cargarVista(btn.dataset.vista);
      cerrarSidebarMobile();
    });
  });

  document.getElementById("btnSalir").addEventListener("click", cerrarSesion);
  document.getElementById("btnMenuPanel").addEventListener("click", abrirSidebarMobile);
  document.getElementById("btnSidebarClose").addEventListener("click", cerrarSidebarMobile);

  cargarVista("carga-masiva");
});

// ════════════════════════════════════════════════════════════
// SESIÓN
// ════════════════════════════════════════════════════════════
function cerrarSesion() {
  sessionStorage.removeItem("usuario");
  window.location.href = "index.html";
}

// ════════════════════════════════════════════════════════════
// SIDEBAR MOBILE
// ════════════════════════════════════════════════════════════
function abrirSidebarMobile() {
  document.getElementById("sidebar").classList.add("open");
  let overlay = document.getElementById("sidebarOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sidebarOverlay";
    overlay.className = "sidebar-overlay";
    overlay.addEventListener("click", cerrarSidebarMobile);
    document.body.appendChild(overlay);
  }
  overlay.classList.add("visible");
}

function cerrarSidebarMobile() {
  document.getElementById("sidebar").classList.remove("open");
  const overlay = document.getElementById("sidebarOverlay");
  if (overlay) overlay.classList.remove("visible");
}

// ════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════════════════════════
function cargarVista(nombre) {
  vistaActual = nombre;
  const contenido = document.getElementById("contenido");
  switch (nombre) {
    case "carga-masiva": renderCargaMasiva(contenido); break;
    case "mis-guias": renderMisGuias(contenido); break;
    case "seguimiento": renderSeguimiento(contenido); break;
    case "mi-cuenta": renderMiCuenta(contenido); break;
    default: contenido.innerHTML = "<p>Vista no encontrada.</p>";
  }
}

// ════════════════════════════════════════════════════════════
// VISTA: CARGA MASIVA
// ════════════════════════════════════════════════════════════
function renderCargaMasiva(contenedor) {
  datosCarga = [];

  contenedor.innerHTML = `
    <div class="vista-header">
      <h2 class="vista-title">Carga Masiva de Envíos</h2>
      <p class="vista-subtitle">
        Sube un archivo Excel (.xlsx) o CSV con tus envíos y los importamos automáticamente.
        Máximo <strong>50 registros</strong> por archivo.
      </p>
    </div>

    <div class="upload-zone" id="uploadZone">
      <input type="file" id="archivoExcel" accept=".xlsx,.xls,.csv">
      <span class="upload-icon">📂</span>
      <p class="upload-title">Arrastra tu archivo aquí o haz clic para seleccionar</p>
      <p class="upload-hint">Formatos: .xlsx, .xls, .csv · máx. 50 filas</p>
    </div>

    <div style="text-align:center;margin-top:14px">
      <a href="../assets/plantilla-envios.xlsx" download class="btn-plantilla">
        ⬇ Descargar plantilla Excel
      </a>
    </div>

    <div class="columnas-tip">
      <strong>Columnas requeridas en el archivo:</strong><br>
      FechaEnvio · Unidades · TipoMercancia · PesoKg · TipoPago ·
      Destinatario · Origen · Destino · Direccion
      <br><br>
      <strong>Columnas opcionales:</strong><br>
      Kilo/ Vol · Cedula · Telefono · Observacion
    </div>

    <div id="resultadoCarga"></div>
  `;

  // Drag & drop
  const zone = document.getElementById("uploadZone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  });

  document.getElementById("archivoExcel")
    .addEventListener("change", e => {
      if (e.target.files[0]) procesarArchivo(e.target.files[0]);
    });
}

// ── Columnas que debe traer el archivo del usuario ──────────
// IMPORTANTE: esta lista debe coincidir exactamente con la validación
// de carga.gs → cargarEnvios(). Si agregas/quitas un campo requerido
// en el backend, actualízalo también aquí.
const COLUMNAS_REQUERIDAS = [
  "FechaEnvio", "Unidades", "TipoMercancia", "PesoKg", "TipoPago",
  "Destinatario", "Origen", "Destino", "Direccion"
];
const COLUMNAS_OPCIONALES = ["Kilo/ Vol", "Cedula", "Telefono", "Observacion"];
const TODAS_COLUMNAS = [...COLUMNAS_REQUERIDAS, ...COLUMNAS_OPCIONALES];

// ── Leer y parsear archivo ──────────────────────────────────
function procesarArchivo(archivo) {
  const ext = archivo.name.split(".").pop().toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    mostrarError("resultadoCarga", "Formato no válido. Usa .xlsx, .xls o .csv");
    return;
  }

  const lector = new FileReader();
  lector.onload = e => {
    try {
      const libro = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      datosCarga = XLSX.utils.sheet_to_json(hoja, { defval: "" });

      if (!datosCarga.length) {
        mostrarError("resultadoCarga", "El archivo está vacío o no tiene datos válidos.");
        return;
      }

      if (datosCarga.length > 50) {
        mostrarError("resultadoCarga",
          `El archivo tiene <b>${datosCarga.length}</b> registros. El máximo es 50.<br>
           Divídelo en partes y sube cada una por separado.`
        );
        return;
      }

      validarYMostrarPrevia(archivo.name);
    } catch {
      mostrarError("resultadoCarga", "No se pudo leer el archivo. Verifica que sea válido.");
    }
  };
  lector.readAsArrayBuffer(archivo);
}

// ── Validar columnas y mostrar previa ──────────────────────
function validarYMostrarPrevia(nombreArchivo) {
  const columnas = Object.keys(datosCarga[0]);
  const faltantes = COLUMNAS_REQUERIDAS.filter(c => !columnas.includes(c));

  if (faltantes.length) {
    mostrarError("resultadoCarga",
      `Faltan columnas requeridas: <b>${faltantes.join(", ")}</b>.<br>
       Descarga la plantilla y úsala como base.`
    );
    return;
  }

  // Validación fila por fila (solo las requeridas)
  const erroresFila = [];
  datosCarga.forEach((fila, i) => {
    COLUMNAS_REQUERIDAS.forEach(col => {
      if (!fila[col] || String(fila[col]).trim() === "") {
        erroresFila.push(`Fila ${i + 2}: <b>${col}</b> está vacío`);
      }
    });
    if (fila.Unidades && isNaN(Number(fila.Unidades)))
      erroresFila.push(`Fila ${i + 2}: Unidades debe ser número`);
    if (fila.PesoKg && isNaN(Number(fila.PesoKg)))
      erroresFila.push(`Fila ${i + 2}: PesoKg debe ser número`);
  });

  const colsMostrar = TODAS_COLUMNAS.filter(c => columnas.includes(c));
  const muestra = datosCarga.slice(0, 10);

  let htmlErrores = "";
  if (erroresFila.length) {
    htmlErrores = `
      <div class="alerta-errores">
        ⚠️ <strong>${erroresFila.length} problema(s) encontrado(s)</strong>. Corrígelos antes de importar:<br>
        <ul>${erroresFila.slice(0, 8).map(e => `<li>${e}</li>`).join("")}
        ${erroresFila.length > 8 ? `<li>...y ${erroresFila.length - 8} más.</li>` : ""}
        </ul>
      </div>`;
  }

  document.getElementById("resultadoCarga").innerHTML = `
    <div class="preview-wrap">
      <div class="preview-header">
        <span class="preview-title">📄 ${nombreArchivo}</span>
        <span class="preview-count">${datosCarga.length} registro(s)</span>
      </div>
      <div class="table-scroll">
        <table class="preview-table">
          <thead>
            <tr>${colsMostrar.map(c => `<th>${c}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${muestra.map(fila =>
    `<tr>${colsMostrar.map(c =>
      `<td>${fila[c] !== undefined && fila[c] !== "" ? fila[c] : "—"}</td>`
    ).join("")}</tr>`
  ).join("")}
          </tbody>
        </table>
      </div>
      ${datosCarga.length > 10
      ? `<p class="preview-note">Mostrando 10 de ${datosCarga.length} registros.</p>`
      : ""}
      ${htmlErrores}
      <div class="preview-footer">
        <button class="btn-link" onclick="renderCargaMasiva(document.getElementById('contenido'))">
          ✕ Cambiar archivo
        </button>
        <button class="btn-primary" id="btnImportar" ${erroresFila.length ? "disabled" : ""}>
          📤 Importar ${datosCarga.length} envío(s)
        </button>
      </div>
    </div>
  `;

  if (!erroresFila.length) {
    document.getElementById("btnImportar").addEventListener("click", importarDatos);
  }
}

// ── Enviar datos al Apps Script (UNA sola llamada, vía apiCall/POST) ──
async function importarDatos() {
  const boton = document.getElementById("btnImportar");
  boton.disabled = true;
  boton.textContent = "Importando…";

  // Barra de progreso
  const preview = document.querySelector(".preview-wrap");
  const progBar = document.createElement("div");
  progBar.className = "progreso-wrap";
  progBar.innerHTML = `
    <div class="progreso-bg"><div class="progreso-fill" id="progresoFill"></div></div>
    <p class="progreso-label" id="progresoLabel">Conectando con el servidor…</p>
  `;
  preview.appendChild(progBar);

  // Animación de progreso simulada
  let pct = 0;
  const mensajes = ["Validando rutas…", "Escribiendo envíos…", "Guardando registros…", "Finalizando…"];
  let mi = 0;
  const intervalo = setInterval(() => {
    pct = Math.min(pct + Math.random() * 7, 85);
    const fill = document.getElementById("progresoFill");
    const lbl = document.getElementById("progresoLabel");
    if (fill) fill.style.width = pct + "%";
    if (lbl && pct > 20 * (mi + 1) && mi < mensajes.length - 1) {
      mi++;
      lbl.textContent = mensajes[mi];
    }
  }, 400);

  try {
    const data = await apiCall({
      accion: "cargar",
      email: usuario.Email,
      clienteID: usuario.ClienteID,
      envios: datosCarga
    });

    clearInterval(intervalo);
    const fill = document.getElementById("progresoFill");
    if (fill) fill.style.width = "100%";
    await new Promise(r => setTimeout(r, 400));

    if (!data.ok) {
      mostrarError("resultadoCarga", data.mensaje || "El servidor rechazó la carga.");
      boton.disabled = false;
      boton.textContent = `📤 Importar ${datosCarga.length} envío(s)`;
      return;
    }

    _mostrarResultado(data);

  } catch (err) {
    clearInterval(intervalo);
    console.error(err);
    mostrarError("resultadoCarga", "Error de conexión: " + err.message);
    boton.disabled = false;
    boton.textContent = `📤 Importar ${datosCarga.length} envío(s)`;
  }
}

// ── Mostrar resultado final ─────────────────────────────────
function _mostrarResultado(data) {
  const hayErrores = data.errores && data.errores.length > 0;
  const todoFallo = data.importados === 0;

  const icono = todoFallo ? "❌" : hayErrores ? "⚠️" : "✅";
  const titulo = todoFallo
    ? "No se importó ningún registro"
    : hayErrores
      ? `${data.importados} importado(s) · ${data.errores.length} con error`
      : `${data.importados} envío(s) importados correctamente`;

  const claseCard = todoFallo ? "resultado-error" : hayErrores ? "resultado-parcial" : "resultado-ok";

  document.getElementById("resultadoCarga").innerHTML = `
    <div class="resultado-card ${claseCard}">
      <div class="resultado-icono">${icono}</div>
      <h3 class="resultado-titulo">${titulo}</h3>
      ${data.cargaID ? `<p class="resultado-lote">Lote: <code>${data.cargaID}</code></p>` : ""}
      ${hayErrores ? `
        <div class="errores-lista">
          <strong>Detalle de errores:</strong>
          <ul>${data.errores.map(e => `<li>${e}</li>`).join("")}</ul>
        </div>
      ` : ""}
      <button class="btn-primary" style="margin-top:20px"
              onclick="renderCargaMasiva(document.getElementById('contenido'))">
        ↩ Nueva carga
      </button>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
// VISTA: MIS GUÍAS
// ════════════════════════════════════════════════════════════
async function renderMisGuias(contenedor) {
  contenedor.innerHTML = `
    <div class="vista-header">
      <h2 class="vista-title">Mis Guías</h2>
      <p class="vista-subtitle">Historial de envíos asociados a tu cuenta.</p>
    </div>
    <div class="estado-vacio" id="guiasEstado">
      <div class="icono">🔄</div><p>Cargando guías…</p>
    </div>
  `;

  try {
    const data = await apiCall({ accion: "guias", clienteID: usuario.ClienteID });

    if (!data.ok || !data.guias || !data.guias.length) {
      document.getElementById("guiasEstado").innerHTML = `
        <div class="icono">📭</div><p>No tienes guías registradas aún.</p>`;
      return;
    }

    guiasData = data.guias;
    paginaGuias = 1;
    renderPanelGuias(contenedor);

  } catch (err) {
    document.getElementById("guiasEstado").innerHTML = `
      <div class="icono">⚠️</div><p>Error al cargar las guías. Intenta de nuevo.</p>`;
    console.error(err);
  }
}

// ── Arma resumen + filtros + tabla + paginación ────────────
function renderPanelGuias(contenedor) {
  const destinos = [...new Set(guiasData.map(g => g.Destino).filter(Boolean))].sort();

  contenedor.innerHTML = `
    <div class="vista-header">
      <h2 class="vista-title">Mis Guías</h2>
      <p class="vista-subtitle">Historial de envíos asociados a tu cuenta.</p>
    </div>

    <div class="guias-resumen" id="guiasResumen"></div>

    <div class="guias-filtros">
      <input type="text" id="filtroTexto" class="filtro-input"
             placeholder="🔎 Buscar por guía o destinatario…">

      <select id="filtroEstado" class="filtro-select">
        <option value="">Todos los estados</option>
        <option value="Recepcionado">Recepcionado</option>
        <option value="Re-Recepcionado">Re-Recepcionado</option>
        <option value="Despachado">Despachado</option>
        <option value="Validar">Validar</option>
        <option value="Entregado">Entregado</option>
        <option value="Devuelto">Devuelto</option>
        <option value="Anulada">Anulada</option>
      </select>

      <select id="filtroDestino" class="filtro-select">
        <option value="">Todos los destinos</option>
        ${destinos.map(d => `<option value="${d}">${d}</option>`).join("")}
      </select>

      <input type="date" id="filtroDesde" class="filtro-fecha" title="Desde">
      <input type="date" id="filtroHasta" class="filtro-fecha" title="Hasta">

      <button class="btn-link" id="btnLimpiarFiltros">✕ Limpiar filtros</button>
    </div>

    <div class="guias-table-wrap" id="guiasTablaWrap"></div>
    <div class="paginacion-wrap" id="guiasPaginacion"></div>
  `;

  ["filtroTexto", "filtroEstado", "filtroDestino", "filtroDesde", "filtroHasta"]
    .forEach(id => document.getElementById(id).addEventListener("input", () => {
      paginaGuias = 1;
      aplicarFiltrosGuias();
    }));

  document.getElementById("btnLimpiarFiltros").addEventListener("click", () => {
    document.getElementById("filtroTexto").value = "";
    document.getElementById("filtroEstado").value = "";
    document.getElementById("filtroDestino").value = "";
    document.getElementById("filtroDesde").value = "";
    document.getElementById("filtroHasta").value = "";
    paginaGuias = 1;
    aplicarFiltrosGuias();
  });

  aplicarFiltrosGuias();
}

// ── Recalcula filtro + resumen + tabla paginada ────────────
function aplicarFiltrosGuias() {
  const texto = document.getElementById("filtroTexto").value.trim().toLowerCase();
  const estado = document.getElementById("filtroEstado").value;
  const destino = document.getElementById("filtroDestino").value;
  const desde = document.getElementById("filtroDesde").value;
  const hasta = document.getElementById("filtroHasta").value;

  guiasFiltradas = guiasData.filter(g => {
    if (texto) {
      const enGuia = String(g.EnvioID).toLowerCase().includes(texto);
      const enDest = String(g.Destinatario || "").toLowerCase().includes(texto);
      if (!enGuia && !enDest) return false;
    }
    if (estado && (g.EstadoGuia || "") !== estado) return false;
    if (destino && g.Destino !== destino) return false;

    if (desde || hasta) {
      const f = new Date(g.FechaEnvio);
      if (!isNaN(f)) {
        if (desde && f < new Date(desde)) return false;
        if (hasta && f > new Date(hasta + "T23:59:59")) return false;
      }
    }
    return true;
  });

  renderResumenGuias(guiasData);   // el resumen SIEMPRE es sobre el total general
  renderTablaConPaginacion();
}

// ── Tarjetas de resumen (conteo sobre el total, no sobre el filtro) ──
function renderResumenGuias(guias) {
  const ESTADOS = ["Recepcionado", "Re-Recepcionado", "Despachado", "Validar", "Entregado", "Devuelto", "Anulada"];
  const conteo = {};
  ESTADOS.forEach(e => conteo[e] = 0);

  guias.forEach(g => {
    const est = g.EstadoGuia || "";
    if (est) conteo[est] = (conteo[est] || 0) + 1;
  });

  document.getElementById("guiasResumen").innerHTML = `
    <div class="stat-mini total">
      <span class="stat-mini-num">${guias.length}</span>
      <span class="stat-mini-lbl">Total</span>
    </div>
    ${ESTADOS.map(est => `
      <div class="stat-mini ${claseEstado(est)}">
        <span class="stat-mini-num">${conteo[est] || 0}</span>
        <span class="stat-mini-lbl">${est}</span>
      </div>`).join("")}
  `;
}

// ── Corta guiasFiltradas según la página actual y pinta tabla + paginación ──
function renderTablaConPaginacion() {
  const totalFiltradas = guiasFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltradas / GUIAS_POR_PAGINA));

  if (paginaGuias > totalPaginas) paginaGuias = totalPaginas;
  if (paginaGuias < 1) paginaGuias = 1;

  const inicio = (paginaGuias - 1) * GUIAS_POR_PAGINA;
  const slice = guiasFiltradas.slice(inicio, inicio + GUIAS_POR_PAGINA);

  renderTablaGuias(slice, totalFiltradas, inicio);
  renderPaginacionGuias(totalPaginas, totalFiltradas);
}

// ── Tabla de guías (recibe ya el slice de la página actual) ────
function renderTablaGuias(guias, totalFiltradas, inicio) {
  const wrap = document.getElementById("guiasTablaWrap");

  if (!guias.length) {
    wrap.innerHTML = `
      <div class="estado-vacio">
        <div class="icono">🔍</div><p>No hay guías que coincidan con el filtro.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="guias-table">
        <thead>
          <tr>
            <th>Guía</th><th>Fecha</th><th>Destinatario</th>
            <th>Destino</th><th>Valor</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${guias.map(g => `
            <tr>
              <td><b>${g.EnvioID}</b></td>
              <td>${formatearFecha(g.FechaEnvio)}</td>
              <td>${g.Destinatario || "—"}</td>
              <td>${g.Destino || "—"}</td>
              <td>${formatearPesos(g.ValorTotal)}</td>
              <td>${badgeEstado(g.EstadoGuia)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="preview-note">Mostrando ${inicio + 1}–${inicio + guias.length} de ${totalFiltradas} guía(s)${totalFiltradas !== guiasData.length ? ` (de ${guiasData.length} en total)` : ""}.</p>
  `;
}

// ── Controles de paginación ────────────────────────────────
function renderPaginacionGuias(totalPaginas, totalFiltradas) {
  const wrap = document.getElementById("guiasPaginacion");

  if (totalFiltradas <= GUIAS_POR_PAGINA) {
    wrap.innerHTML = "";
    return;
  }

  let botones = "";
  for (let i = 1; i <= totalPaginas; i++) {
    // Muestra máx. 7 botones de página para no saturar
    if (totalPaginas > 7 && Math.abs(i - paginaGuias) > 2 && i !== 1 && i !== totalPaginas) {
      if (i === 2 || i === totalPaginas - 1) botones += `<span class="pagina-dots">…</span>`;
      continue;
    }
    botones += `<button class="btn-pagina ${i === paginaGuias ? "active" : ""}" data-pagina="${i}">${i}</button>`;
  }

  wrap.innerHTML = `
    <button class="btn-pagina-nav" id="btnPaginaAnterior" ${paginaGuias === 1 ? "disabled" : ""}>← Anterior</button>
    <div class="paginacion-numeros">${botones}</div>
    <button class="btn-pagina-nav" id="btnPaginaSiguiente" ${paginaGuias === totalPaginas ? "disabled" : ""}>Siguiente →</button>
  `;

  document.getElementById("btnPaginaAnterior").addEventListener("click", () => {
    paginaGuias--;
    renderTablaConPaginacion();
  });
  document.getElementById("btnPaginaSiguiente").addEventListener("click", () => {
    paginaGuias++;
    renderTablaConPaginacion();
  });
  wrap.querySelectorAll(".btn-pagina").forEach(btn => {
    btn.addEventListener("click", () => {
      paginaGuias = Number(btn.dataset.pagina);
      renderTablaConPaginacion();
    });
  });
}

// ════════════════════════════════════════════════════════════
// VISTA: SEGUIMIENTO
// ════════════════════════════════════════════════════════════
function renderSeguimiento(contenedor) {
  contenedor.innerHTML = `
    <div class="vista-header">
      <h2 class="vista-title">Seguimiento de Envío</h2>
      <p class="vista-subtitle">Consulta el estado de cualquier guía en tiempo real.</p>
    </div>
    <div class="seguimiento-form">
      <div class="input-guia-row">
        <input type="text" id="inputGuia" class="input-guia"
               placeholder="Ej: 260305125152" maxlength="20">
        <button class="btn-primary" id="btnBuscarGuia">Buscar</button>
      </div>
      <div id="resultadoSeguimiento"></div>
    </div>`;

  document.getElementById("btnBuscarGuia").addEventListener("click", buscarGuia);
  document.getElementById("inputGuia")
    .addEventListener("keypress", e => { if (e.key === "Enter") buscarGuia(); });
}

async function buscarGuia() {
  const guia = document.getElementById("inputGuia").value.trim();
  const res = document.getElementById("resultadoSeguimiento");
  const boton = document.getElementById("btnBuscarGuia");

  if (!guia) {
    res.innerHTML = `<p class="txt-error">Ingresa un número de guía.</p>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = "Buscando…";
  res.innerHTML = "";

  try {
    const data = await apiCall({ accion: "seguimiento", guia });

    if (!data.ok || !data.envio) {
      res.innerHTML = `<p class="txt-error">No se encontró la guía <b>${guia}</b>.</p>`;
      return;
    }

    const v = data.envio;
    res.innerHTML = `
      <div class="seguimiento-card">
        <div class="seg-header">
          <span class="seg-guia-num">${v.EnvioID}</span>
          ${badgeEstado(v.EstadoGuia)}
        </div>
        <div class="seg-body">
          <div class="seg-field"><label>Destinatario</label><span>${v.Destinatario || "—"}</span></div>
          <div class="seg-field"><label>Destino</label><span>${v.Destino || "—"}</span></div>
          <div class="seg-field"><label>Fecha envío</label><span>${formatearFecha(v.FechaEnvio)}</span></div>
          <div class="seg-field"><label>Tipo de pago</label><span>${v.TipoPago || "—"}</span></div>
          <div class="seg-field"><label>Valor total</label><span>${formatearPesos(v.ValorTotal)}</span></div>
          <div class="seg-field"><label>Saldo pendiente</label><span>${formatearPesos(v.SaldoPendiente)}</span></div>
          ${v.Observacion ? `<div class="seg-field full"><label>Observación</label><span>${v.Observacion}</span></div>` : ""}
        </div>
      </div>`;

  } catch (err) {
    res.innerHTML = `<p class="txt-error">Error de conexión. Intenta de nuevo.</p>`;
    console.error(err);
  } finally {
    boton.disabled = false;
    boton.textContent = "Buscar";
  }
}

// ════════════════════════════════════════════════════════════
// VISTA: MI CUENTA
// ════════════════════════════════════════════════════════════
function renderMiCuenta(contenedor) {
  const ini = usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";
  contenedor.innerHTML = `
    <div class="vista-header">
      <h2 class="vista-title">Mi Cuenta</h2>
      <p class="vista-subtitle">Información de tu cuenta en TRANSIMPERIO.</p>
    </div>
    <div class="cuenta-card">
      <div class="cuenta-avatar">${ini}</div>
      <div class="cuenta-field"><label>Nombre</label><span>${usuario.Nombre || "—"}</span></div>
      <div class="cuenta-field"><label>Correo</label><span>${usuario.Email || "—"}</span></div>
      <div class="cuenta-field"><label>ID Cliente</label><span>${usuario.ClienteID || "—"}</span></div>
      <div class="cuenta-field"><label>Rol</label><span>${usuario.RolID || "—"}</span></div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════════════════════════════
function mostrarError(idContenedor, html) {
  document.getElementById(idContenedor).innerHTML = `
    <div class="alerta-error">⚠️ ${html}</div>`;
}

function claseEstado(estado) {
  const mapa = {
    "Recepcionado": "estado-recepcionado",
    "Re-Recepcionado": "estado-re-recepcionado",
    "Despachado": "estado-despachado",
    "Validar": "estado-validar",
    "Entregado": "estado-entregado",
    "Devuelto": "estado-devuelto",
    "Anulada": "estado-anulada"
  };
  return mapa[estado] || "estado-otro";
}

function badgeEstado(estado) {
  return `<span class="estado ${claseEstado(estado)}">${estado || "Sin estado"}</span>`;
}

function formatearFecha(valor) {
  if (!valor) return "—";
  const f = new Date(valor);
  if (isNaN(f)) return valor;
  return f.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function formatearPesos(valor) {
  if (!valor && valor !== 0) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0
  }).format(valor);
}










// /* ============================================================
//    TRANSIMPERIO — Panel de Clientes
//    panel.js — sesión, navegación, carga masiva, guías, seguimiento
//    ============================================================ */

// 'use strict';

// // ── URL del Web App de Apps Script ──────────────────────────
// const API_URL = "https://script.google.com/macros/s/AKfycbxGwRg6BjkmxkQM-DQgaKUoRlj211DFtZKhD0T5KBcUFvgf30SjxmC7roZ90QIICyuJUw/exec";

// // ── Helper único para llamar al backend (POST, sin headers → text/plain, sin preflight CORS) ──
// async function apiCall(payload) {
//   const res = await fetch(API_URL, {
//     method: "POST",
//     redirect: "follow",
//     body: JSON.stringify(payload)
//   });
//   const text = await res.text();
//   try {
//     return JSON.parse(text);
//   } catch {
//     throw new Error("Respuesta inesperada del servidor: " + text.slice(0, 120));
//   }
// }

// // ── Estado global ────────────────────────────────────────────
// let usuario = null;
// let datosCarga = [];
// let vistaActual = "";

// // ════════════════════════════════════════════════════════════
// // INIT
// // ════════════════════════════════════════════════════════════
// document.addEventListener("DOMContentLoaded", () => {

//   const raw = sessionStorage.getItem("usuario");
//   if (!raw) { window.location.href = "index.html"; return; }

//   usuario = JSON.parse(raw);

//   document.getElementById("nombreUsuario").textContent = usuario.Nombre;
//   document.getElementById("userAvatar").textContent =
//     usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";

//   // Navegación sidebar
//   document.querySelectorAll(".nav-item").forEach(btn => {
//     btn.addEventListener("click", () => {
//       document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
//       btn.classList.add("active");
//       cargarVista(btn.dataset.vista);
//       cerrarSidebarMobile();
//     });
//   });

//   document.getElementById("btnSalir").addEventListener("click", cerrarSesion);
//   document.getElementById("btnMenuPanel").addEventListener("click", abrirSidebarMobile);
//   document.getElementById("btnSidebarClose").addEventListener("click", cerrarSidebarMobile);

//   cargarVista("carga-masiva");
// });

// // ════════════════════════════════════════════════════════════
// // SESIÓN
// // ════════════════════════════════════════════════════════════
// function cerrarSesion() {
//   sessionStorage.removeItem("usuario");
//   window.location.href = "index.html";
// }

// // ════════════════════════════════════════════════════════════
// // SIDEBAR MOBILE
// // ════════════════════════════════════════════════════════════
// function abrirSidebarMobile() {
//   document.getElementById("sidebar").classList.add("open");
//   let overlay = document.getElementById("sidebarOverlay");
//   if (!overlay) {
//     overlay = document.createElement("div");
//     overlay.id = "sidebarOverlay";
//     overlay.className = "sidebar-overlay";
//     overlay.addEventListener("click", cerrarSidebarMobile);
//     document.body.appendChild(overlay);
//   }
//   overlay.classList.add("visible");
// }

// function cerrarSidebarMobile() {
//   document.getElementById("sidebar").classList.remove("open");
//   const overlay = document.getElementById("sidebarOverlay");
//   if (overlay) overlay.classList.remove("visible");
// }

// // ════════════════════════════════════════════════════════════
// // NAVEGACIÓN
// // ════════════════════════════════════════════════════════════
// function cargarVista(nombre) {
//   vistaActual = nombre;
//   const contenido = document.getElementById("contenido");
//   switch (nombre) {
//     case "carga-masiva": renderCargaMasiva(contenido); break;
//     case "mis-guias": renderMisGuias(contenido); break;
//     case "seguimiento": renderSeguimiento(contenido); break;
//     case "mi-cuenta": renderMiCuenta(contenido); break;
//     default: contenido.innerHTML = "<p>Vista no encontrada.</p>";
//   }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: CARGA MASIVA
// // ════════════════════════════════════════════════════════════
// function renderCargaMasiva(contenedor) {
//   datosCarga = [];

//   contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Carga Masiva de Envíos</h2>
//       <p class="vista-subtitle">
//         Sube un archivo Excel (.xlsx) o CSV con tus envíos y los importamos automáticamente.
//         Máximo <strong>50 registros</strong> por archivo.
//       </p>
//     </div>

//     <div class="upload-zone" id="uploadZone">
//       <input type="file" id="archivoExcel" accept=".xlsx,.xls,.csv">
//       <span class="upload-icon">📂</span>
//       <p class="upload-title">Arrastra tu archivo aquí o haz clic para seleccionar</p>
//       <p class="upload-hint">Formatos: .xlsx, .xls, .csv · máx. 50 filas</p>
//     </div>

//     <div style="text-align:center;margin-top:14px">
//       <a href="../assets/plantilla-envios.xlsx" download class="btn-plantilla">
//         ⬇ Descargar plantilla Excel
//       </a>
//     </div>

//     <div class="columnas-tip">
//       <strong>Columnas requeridas en el archivo:</strong><br>
//       FechaEnvio · Unidades · TipoMercancia · PesoKg · TipoPago ·
//       Destinatario · Origen · Destino · Direccion
//       <br><br>
//       <strong>Columnas opcionales:</strong><br>
//       Kilo/ Vol · Cedula · Telefono · Observacion
//     </div>

//     <div id="resultadoCarga"></div>
//   `;

//   // Drag & drop
//   const zone = document.getElementById("uploadZone");
//   zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
//   zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
//   zone.addEventListener("drop", e => {
//     e.preventDefault();
//     zone.classList.remove("drag-over");
//     const file = e.dataTransfer.files[0];
//     if (file) procesarArchivo(file);
//   });

//   document.getElementById("archivoExcel")
//     .addEventListener("change", e => {
//       if (e.target.files[0]) procesarArchivo(e.target.files[0]);
//     });
// }

// // ── Columnas que debe traer el archivo del usuario ──────────
// // IMPORTANTE: esta lista debe coincidir exactamente con la validación
// // de carga.gs → cargarEnvios(). Si agregas/quitas un campo requerido
// // en el backend, actualízalo también aquí.
// const COLUMNAS_REQUERIDAS = [
//   "FechaEnvio", "Unidades", "TipoMercancia", "PesoKg", "TipoPago",
//   "Destinatario", "Origen", "Destino", "Direccion"
// ];
// const COLUMNAS_OPCIONALES = ["Kilo/ Vol", "Cedula", "Telefono", "Observacion"];
// const TODAS_COLUMNAS = [...COLUMNAS_REQUERIDAS, ...COLUMNAS_OPCIONALES];

// // ── Leer y parsear archivo ──────────────────────────────────
// function procesarArchivo(archivo) {
//   const ext = archivo.name.split(".").pop().toLowerCase();
//   if (!["xlsx", "xls", "csv"].includes(ext)) {
//     mostrarError("resultadoCarga", "Formato no válido. Usa .xlsx, .xls o .csv");
//     return;
//   }

//   const lector = new FileReader();
//   lector.onload = e => {
//     try {
//       const libro = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
//       const hoja = libro.Sheets[libro.SheetNames[0]];
//       datosCarga = XLSX.utils.sheet_to_json(hoja, { defval: "" });

//       if (!datosCarga.length) {
//         mostrarError("resultadoCarga", "El archivo está vacío o no tiene datos válidos.");
//         return;
//       }

//       if (datosCarga.length > 50) {
//         mostrarError("resultadoCarga",
//           `El archivo tiene <b>${datosCarga.length}</b> registros. El máximo es 50.<br>
//            Divídelo en partes y sube cada una por separado.`
//         );
//         return;
//       }

//       validarYMostrarPrevia(archivo.name);
//     } catch {
//       mostrarError("resultadoCarga", "No se pudo leer el archivo. Verifica que sea válido.");
//     }
//   };
//   lector.readAsArrayBuffer(archivo);
// }

// // ── Validar columnas y mostrar previa ──────────────────────
// function validarYMostrarPrevia(nombreArchivo) {
//   const columnas = Object.keys(datosCarga[0]);
//   const faltantes = COLUMNAS_REQUERIDAS.filter(c => !columnas.includes(c));

//   if (faltantes.length) {
//     mostrarError("resultadoCarga",
//       `Faltan columnas requeridas: <b>${faltantes.join(", ")}</b>.<br>
//        Descarga la plantilla y úsala como base.`
//     );
//     return;
//   }

//   // Validación fila por fila (solo las requeridas)
//   const erroresFila = [];
//   datosCarga.forEach((fila, i) => {
//     COLUMNAS_REQUERIDAS.forEach(col => {
//       if (!fila[col] || String(fila[col]).trim() === "") {
//         erroresFila.push(`Fila ${i + 2}: <b>${col}</b> está vacío`);
//       }
//     });
//     if (fila.Unidades && isNaN(Number(fila.Unidades)))
//       erroresFila.push(`Fila ${i + 2}: Unidades debe ser número`);
//     if (fila.PesoKg && isNaN(Number(fila.PesoKg)))
//       erroresFila.push(`Fila ${i + 2}: PesoKg debe ser número`);
//   });

//   const colsMostrar = TODAS_COLUMNAS.filter(c => columnas.includes(c));
//   const muestra = datosCarga.slice(0, 10);

//   let htmlErrores = "";
//   if (erroresFila.length) {
//     htmlErrores = `
//       <div class="alerta-errores">
//         ⚠️ <strong>${erroresFila.length} problema(s) encontrado(s)</strong>. Corrígelos antes de importar:<br>
//         <ul>${erroresFila.slice(0, 8).map(e => `<li>${e}</li>`).join("")}
//         ${erroresFila.length > 8 ? `<li>...y ${erroresFila.length - 8} más.</li>` : ""}
//         </ul>
//       </div>`;
//   }

//   document.getElementById("resultadoCarga").innerHTML = `
//     <div class="preview-wrap">
//       <div class="preview-header">
//         <span class="preview-title">📄 ${nombreArchivo}</span>
//         <span class="preview-count">${datosCarga.length} registro(s)</span>
//       </div>
//       <div class="table-scroll">
//         <table class="preview-table">
//           <thead>
//             <tr>${colsMostrar.map(c => `<th>${c}</th>`).join("")}</tr>
//           </thead>
//           <tbody>
//             ${muestra.map(fila =>
//     `<tr>${colsMostrar.map(c =>
//       `<td>${fila[c] !== undefined && fila[c] !== "" ? fila[c] : "—"}</td>`
//     ).join("")}</tr>`
//   ).join("")}
//           </tbody>
//         </table>
//       </div>
//       ${datosCarga.length > 10
//       ? `<p class="preview-note">Mostrando 10 de ${datosCarga.length} registros.</p>`
//       : ""}
//       ${htmlErrores}
//       <div class="preview-footer">
//         <button class="btn-link" onclick="renderCargaMasiva(document.getElementById('contenido'))">
//           ✕ Cambiar archivo
//         </button>
//         <button class="btn-primary" id="btnImportar" ${erroresFila.length ? "disabled" : ""}>
//           📤 Importar ${datosCarga.length} envío(s)
//         </button>
//       </div>
//     </div>
//   `;

//   if (!erroresFila.length) {
//     document.getElementById("btnImportar").addEventListener("click", importarDatos);
//   }
// }

// // ── Enviar datos al Apps Script (UNA sola llamada, vía apiCall/POST) ──
// async function importarDatos() {
//   const boton = document.getElementById("btnImportar");
//   boton.disabled = true;
//   boton.textContent = "Importando…";

//   // Barra de progreso
//   const preview = document.querySelector(".preview-wrap");
//   const progBar = document.createElement("div");
//   progBar.className = "progreso-wrap";
//   progBar.innerHTML = `
//     <div class="progreso-bg"><div class="progreso-fill" id="progresoFill"></div></div>
//     <p class="progreso-label" id="progresoLabel">Conectando con el servidor…</p>
//   `;
//   preview.appendChild(progBar);

//   // Animación de progreso simulada
//   let pct = 0;
//   const mensajes = ["Validando rutas…", "Escribiendo envíos…", "Guardando registros…", "Finalizando…"];
//   let mi = 0;
//   const intervalo = setInterval(() => {
//     pct = Math.min(pct + Math.random() * 7, 85);
//     const fill = document.getElementById("progresoFill");
//     const lbl = document.getElementById("progresoLabel");
//     if (fill) fill.style.width = pct + "%";
//     if (lbl && pct > 20 * (mi + 1) && mi < mensajes.length - 1) {
//       mi++;
//       lbl.textContent = mensajes[mi];
//     }
//   }, 400);

//   try {
//     const data = await apiCall({
//       accion: "cargar",
//       email: usuario.Email,
//       clienteID: usuario.ClienteID,
//       envios: datosCarga
//     });

//     clearInterval(intervalo);
//     const fill = document.getElementById("progresoFill");
//     if (fill) fill.style.width = "100%";
//     await new Promise(r => setTimeout(r, 400));

//     if (!data.ok) {
//       mostrarError("resultadoCarga", data.mensaje || "El servidor rechazó la carga.");
//       boton.disabled = false;
//       boton.textContent = `📤 Importar ${datosCarga.length} envío(s)`;
//       return;
//     }

//     _mostrarResultado(data);

//   } catch (err) {
//     clearInterval(intervalo);
//     console.error(err);
//     mostrarError("resultadoCarga", "Error de conexión: " + err.message);
//     boton.disabled = false;
//     boton.textContent = `📤 Importar ${datosCarga.length} envío(s)`;
//   }
// }

// // ── Mostrar resultado final ─────────────────────────────────
// function _mostrarResultado(data) {
//   const hayErrores = data.errores && data.errores.length > 0;
//   const todoFallo = data.importados === 0;

//   const icono = todoFallo ? "❌" : hayErrores ? "⚠️" : "✅";
//   const titulo = todoFallo
//     ? "No se importó ningún registro"
//     : hayErrores
//       ? `${data.importados} importado(s) · ${data.errores.length} con error`
//       : `${data.importados} envío(s) importados correctamente`;

//   const claseCard = todoFallo ? "resultado-error" : hayErrores ? "resultado-parcial" : "resultado-ok";

//   document.getElementById("resultadoCarga").innerHTML = `
//     <div class="resultado-card ${claseCard}">
//       <div class="resultado-icono">${icono}</div>
//       <h3 class="resultado-titulo">${titulo}</h3>
//       ${data.cargaID ? `<p class="resultado-lote">Lote: <code>${data.cargaID}</code></p>` : ""}
//       ${hayErrores ? `
//         <div class="errores-lista">
//           <strong>Detalle de errores:</strong>
//           <ul>${data.errores.map(e => `<li>${e}</li>`).join("")}</ul>
//         </div>
//       ` : ""}
//       <button class="btn-primary" style="margin-top:20px"
//               onclick="renderCargaMasiva(document.getElementById('contenido'))">
//         ↩ Nueva carga
//       </button>
//     </div>
//   `;
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: MIS GUÍAS
// // ════════════════════════════════════════════════════════════
// async function renderMisGuias(contenedor) {
//   contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Mis Guías</h2>
//       <p class="vista-subtitle">Historial de envíos asociados a tu cuenta.</p>
//     </div>
//     <div class="guias-table-wrap">
//       <div class="estado-vacio" id="guiasEstado">
//         <div class="icono">🔄</div><p>Cargando guías…</p>
//       </div>
//     </div>
//   `;

//   try {
//     const data = await apiCall({ accion: "guias", clienteID: usuario.ClienteID });

//     if (!data.ok || !data.guias || !data.guias.length) {
//       document.querySelector(".guias-table-wrap").innerHTML = `
//         <div class="estado-vacio">
//           <div class="icono">📭</div><p>No tienes guías registradas aún.</p>
//         </div>`;
//       return;
//     }

//     document.querySelector(".guias-table-wrap").innerHTML = `
//       <div class="table-scroll">
//         <table class="guias-table">
//           <thead>
//             <tr>
//               <th>Guía</th><th>Fecha</th><th>Destinatario</th>
//               <th>Destino</th><th>Valor</th><th>Estado</th>
//             </tr>
//           </thead>
//           <tbody>
//             ${data.guias.map(g => `
//               <tr>
//                 <td><b>${g.EnvioID}</b></td>
//                 <td>${formatearFecha(g.FechaEnvio)}</td>
//                 <td>${g.Destinatario || "—"}</td>
//                 <td>${g.Destino || "—"}</td>
//                 <td>${formatearPesos(g.ValorTotal)}</td>
//                 <td>${badgeEstado(g.EstadoGuia)}</td>
//               </tr>`).join("")}
//           </tbody>
//         </table>
//       </div>`;

//   } catch (err) {
//     document.querySelector(".guias-table-wrap").innerHTML = `
//       <div class="estado-vacio">
//         <div class="icono">⚠️</div><p>Error al cargar las guías. Intenta de nuevo.</p>
//       </div>`;
//     console.error(err);
//   }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: SEGUIMIENTO
// // ════════════════════════════════════════════════════════════
// function renderSeguimiento(contenedor) {
//   contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Seguimiento de Envío</h2>
//       <p class="vista-subtitle">Consulta el estado de cualquier guía en tiempo real.</p>
//     </div>
//     <div class="seguimiento-form">
//       <div class="input-guia-row">
//         <input type="text" id="inputGuia" class="input-guia"
//                placeholder="Ej: 260305125152" maxlength="20">
//         <button class="btn-primary" id="btnBuscarGuia">Buscar</button>
//       </div>
//       <div id="resultadoSeguimiento"></div>
//     </div>`;

//   document.getElementById("btnBuscarGuia").addEventListener("click", buscarGuia);
//   document.getElementById("inputGuia")
//     .addEventListener("keypress", e => { if (e.key === "Enter") buscarGuia(); });
// }

// async function buscarGuia() {
//   const guia = document.getElementById("inputGuia").value.trim();
//   const res = document.getElementById("resultadoSeguimiento");
//   const boton = document.getElementById("btnBuscarGuia");

//   if (!guia) {
//     res.innerHTML = `<p class="txt-error">Ingresa un número de guía.</p>`;
//     return;
//   }

//   boton.disabled = true;
//   boton.textContent = "Buscando…";
//   res.innerHTML = "";

//   try {
//     const data = await apiCall({ accion: "seguimiento", guia });

//     if (!data.ok || !data.envio) {
//       res.innerHTML = `<p class="txt-error">No se encontró la guía <b>${guia}</b>.</p>`;
//       return;
//     }

//     const v = data.envio;
//     res.innerHTML = `
//       <div class="seguimiento-card">
//         <div class="seg-header">
//           <span class="seg-guia-num">${v.EnvioID}</span>
//           ${badgeEstado(v.EstadoGuia)}
//         </div>
//         <div class="seg-body">
//           <div class="seg-field"><label>Destinatario</label><span>${v.Destinatario || "—"}</span></div>
//           <div class="seg-field"><label>Destino</label><span>${v.Destino || "—"}</span></div>
//           <div class="seg-field"><label>Fecha envío</label><span>${formatearFecha(v.FechaEnvio)}</span></div>
//           <div class="seg-field"><label>Tipo de pago</label><span>${v.TipoPago || "—"}</span></div>
//           <div class="seg-field"><label>Valor total</label><span>${formatearPesos(v.ValorTotal)}</span></div>
//           <div class="seg-field"><label>Saldo pendiente</label><span>${formatearPesos(v.SaldoPendiente)}</span></div>
//           ${v.Observacion ? `<div class="seg-field full"><label>Observación</label><span>${v.Observacion}</span></div>` : ""}
//         </div>
//       </div>`;

//   } catch (err) {
//     res.innerHTML = `<p class="txt-error">Error de conexión. Intenta de nuevo.</p>`;
//     console.error(err);
//   } finally {
//     boton.disabled = false;
//     boton.textContent = "Buscar";
//   }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: MI CUENTA
// // ════════════════════════════════════════════════════════════
// function renderMiCuenta(contenedor) {
//   const ini = usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";
//   contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Mi Cuenta</h2>
//       <p class="vista-subtitle">Información de tu cuenta en TRANSIMPERIO.</p>
//     </div>
//     <div class="cuenta-card">
//       <div class="cuenta-avatar">${ini}</div>
//       <div class="cuenta-field"><label>Nombre</label><span>${usuario.Nombre || "—"}</span></div>
//       <div class="cuenta-field"><label>Correo</label><span>${usuario.Email || "—"}</span></div>
//       <div class="cuenta-field"><label>ID Cliente</label><span>${usuario.ClienteID || "—"}</span></div>
//       <div class="cuenta-field"><label>Rol</label><span>${usuario.RolID || "—"}</span></div>
//     </div>`;
// }

// // ════════════════════════════════════════════════════════════
// // UTILIDADES
// // ════════════════════════════════════════════════════════════
// function mostrarError(idContenedor, html) {
//   document.getElementById(idContenedor).innerHTML = `
//     <div class="alerta-error">⚠️ ${html}</div>`;
// }

// function badgeEstado(estado) {
//   const mapa = {
//     "Pendiente": "estado-pendiente",
//     "En tránsito": "estado-transito",
//     "Entregado": "estado-entregado",
//     "Novedad": "estado-novedad"
//   };
//   const cls = mapa[estado] || "estado-pendiente";
//   return `<span class="estado ${cls}">${estado || "Pendiente"}</span>`;
// }

// function formatearFecha(valor) {
//   if (!valor) return "—";
//   const f = new Date(valor);
//   if (isNaN(f)) return valor;
//   return f.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
// }

// function formatearPesos(valor) {
//   if (!valor && valor !== 0) return "—";
//   return new Intl.NumberFormat("es-CO", {
//     style: "currency", currency: "COP", maximumFractionDigits: 0
//   }).format(valor);
// }



