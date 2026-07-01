/* ============================================================
   TRANSIMPERIO — Panel de Clientes
   panel.js — sesión, navegación, carga masiva, guías, seguimiento
   ============================================================ */

// import { API_URL } from "./config.js"

'use strict';

// ── URL del Web App de Apps Script ──────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbxGwRg6BjkmxkQM-DQgaKUoRlj211DFtZKhD0T5KBcUFvgf30SjxmC7roZ90QIICyuJUw/exec";


// ── Helper CORS-safe para llamar Apps Script desde GitHub Pages ──
// Apps Script bloquea POST cross-origin; mandamos el payload como GET+base64
async function apiCall(payload) {
    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const url = API_URL + "?d=" + encodeURIComponent(b64);
    const res = await fetch(url, { method: "GET" });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error("Respuesta inesperada del servidor: " + text.slice(0, 120)); }
}

// ── Estado global ────────────────────────────────────────────
let usuario = null;
let datosCarga = [];
let vistaActual = "";

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
      FechaEnvio · Unidades · TipoMercancia · Kilo/ Vol · PesoKg · TipoPago ·
      Destinatario · Cedula · Origen · Destino · Direccion · Telefono · Observacion
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
const COLUMNAS_REQUERIDAS = [
    "FechaEnvio", "Unidades", "TipoMercancia", "Kilo/ Vol", "PesoKg", "TipoPago",
    "Destinatario", "Origen", "Destino", "Direccion", "Telefono", "Observacion"
];
const COLUMNAS_OPCIONALES = ["Cedula", "Telefono", "Observacion"];
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
            `<td>${fila[c] !== undefined ? fila[c] : "—"}</td>`
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

// ── Enviar datos al Apps Script ─────────────────────────────
async function importarDatos() {
    const boton = document.getElementById("btnImportar");
    boton.disabled = true;
    boton.textContent = "Importando…";

    // Mostrar barra de progreso
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

    // ── Apps Script bloquea POST cross-origin con CORS.
    // Solución: mandar los datos como parámetro GET en la URL (jsonp-style).
    // El payload va codificado en base64 para no romper la URL.
    try {
        const payload = JSON.stringify({
            accion: "cargar",
            email: usuario.Email,
            clienteID: usuario.ClienteID,
            envios: datosCarga
        });
        const encoded = btoa(unescape(encodeURIComponent(payload)));
        const url = API_URL + "?d=" + encodeURIComponent(encoded);

        const res = await fetch(url, { method: "GET" });
        const text = await res.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.error("Respuesta no JSON:", text);
            throw new Error("El servidor devolvió una respuesta inesperada.");
        }

        clearInterval(intervalo);
        const fill = document.getElementById("progresoFill");
        if (fill) fill.style.width = "100%";
        await new Promise(r => setTimeout(r, 400));
        _mostrarResultado(data);

    } catch (err) {
        clearInterval(intervalo);
        console.error(err);
        mostrarError("resultadoCarga",
            "Error de conexión: " + err.message
        );
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
    <div class="guias-table-wrap">
      <div class="estado-vacio" id="guiasEstado">
        <div class="icono">🔄</div><p>Cargando guías…</p>
      </div>
    </div>
  `;

    try {
        const data = await apiCall({ accion: "guias", clienteID: usuario.ClienteID });

        if (!data.ok || !data.guias || !data.guias.length) {
            document.querySelector(".guias-table-wrap").innerHTML = `
        <div class="estado-vacio">
          <div class="icono">📭</div><p>No tienes guías registradas aún.</p>
        </div>`;
            return;
        }

        document.querySelector(".guias-table-wrap").innerHTML = `
      <div class="table-scroll">
        <table class="guias-table">
          <thead>
            <tr>
              <th>Guía</th><th>Fecha</th><th>Destinatario</th>
              <th>Destino</th><th>Valor</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${data.guias.map(g => `
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
      </div>`;

    } catch (err) {
        document.querySelector(".guias-table-wrap").innerHTML = `
      <div class="estado-vacio">
        <div class="icono">⚠️</div><p>Error al cargar las guías. Intenta de nuevo.</p>
      </div>`;
        console.error(err);
    }
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

function badgeEstado(estado) {
    const mapa = {
        "Pendiente": "estado-pendiente",
        "En tránsito": "estado-transito",
        "Entregado": "estado-entregado",
        "Novedad": "estado-novedad"
    };
    const cls = mapa[estado] || "estado-pendiente";
    return `<span class="estado ${cls}">${estado || "Pendiente"}</span>`;
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

// // ── Estado global ────────────────────────────────────────────
// let usuario = null;
// let datosCarga = [];
// let vistaActual = "";

// // ════════════════════════════════════════════════════════════
// // INIT
// // ════════════════════════════════════════════════════════════
// document.addEventListener("DOMContentLoaded", () => {

//     const raw = sessionStorage.getItem("usuario");
//     if (!raw) { window.location.href = "index.html"; return; }

//     usuario = JSON.parse(raw);

//     document.getElementById("nombreUsuario").textContent = usuario.Nombre;
//     document.getElementById("userAvatar").textContent =
//         usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";

//     // Navegación sidebar
//     document.querySelectorAll(".nav-item").forEach(btn => {
//         btn.addEventListener("click", () => {
//             document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
//             btn.classList.add("active");
//             cargarVista(btn.dataset.vista);
//             cerrarSidebarMobile();
//         });
//     });

//     document.getElementById("btnSalir").addEventListener("click", cerrarSesion);
//     document.getElementById("btnMenuPanel").addEventListener("click", abrirSidebarMobile);
//     document.getElementById("btnSidebarClose").addEventListener("click", cerrarSidebarMobile);

//     cargarVista("carga-masiva");
// });

// // ════════════════════════════════════════════════════════════
// // SESIÓN
// // ════════════════════════════════════════════════════════════
// function cerrarSesion() {
//     sessionStorage.removeItem("usuario");
//     window.location.href = "index.html";
// }

// // ════════════════════════════════════════════════════════════
// // SIDEBAR MOBILE
// // ════════════════════════════════════════════════════════════
// function abrirSidebarMobile() {
//     document.getElementById("sidebar").classList.add("open");
//     let overlay = document.getElementById("sidebarOverlay");
//     if (!overlay) {
//         overlay = document.createElement("div");
//         overlay.id = "sidebarOverlay";
//         overlay.className = "sidebar-overlay";
//         overlay.addEventListener("click", cerrarSidebarMobile);
//         document.body.appendChild(overlay);
//     }
//     overlay.classList.add("visible");
// }

// function cerrarSidebarMobile() {
//     document.getElementById("sidebar").classList.remove("open");
//     const overlay = document.getElementById("sidebarOverlay");
//     if (overlay) overlay.classList.remove("visible");
// }

// // ════════════════════════════════════════════════════════════
// // NAVEGACIÓN
// // ════════════════════════════════════════════════════════════
// function cargarVista(nombre) {
//     vistaActual = nombre;
//     const contenido = document.getElementById("contenido");
//     switch (nombre) {
//         case "carga-masiva": renderCargaMasiva(contenido); break;
//         case "mis-guias": renderMisGuias(contenido); break;
//         case "seguimiento": renderSeguimiento(contenido); break;
//         case "mi-cuenta": renderMiCuenta(contenido); break;
//         default: contenido.innerHTML = "<p>Vista no encontrada.</p>";
//     }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: CARGA MASIVA
// // ════════════════════════════════════════════════════════════
// function renderCargaMasiva(contenedor) {
//     datosCarga = [];

//     contenedor.innerHTML = `
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
//       FechaEnvio · Unidades · TipoMercancia · Kilo/ Vol · PesoKg · TipoPago ·
//       Destinatario · Cedula · Origen · Destino · Direccion · Telefono · Observacion
//     </div>

//     <div id="resultadoCarga"></div>
//   `;

//     // Drag & drop
//     const zone = document.getElementById("uploadZone");
//     zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
//     zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
//     zone.addEventListener("drop", e => {
//         e.preventDefault();
//         zone.classList.remove("drag-over");
//         const file = e.dataTransfer.files[0];
//         if (file) procesarArchivo(file);
//     });

//     document.getElementById("archivoExcel")
//         .addEventListener("change", e => {
//             if (e.target.files[0]) procesarArchivo(e.target.files[0]);
//         });
// }

// // ── Columnas que debe traer el archivo del usuario ──────────
// const COLUMNAS_REQUERIDAS = [
//     "FechaEnvio", "Unidades", "TipoMercancia", "Kilo/ Vol", "PesoKg", "TipoPago",
//     "Destinatario", "Origen", "Destino", "Direccion"
// ];
// const COLUMNAS_OPCIONALES = ["Cedula", "Telefono", "Observacion"];
// const TODAS_COLUMNAS = [...COLUMNAS_REQUERIDAS, ...COLUMNAS_OPCIONALES];

// // ── Leer y parsear archivo ──────────────────────────────────
// function procesarArchivo(archivo) {
//     const ext = archivo.name.split(".").pop().toLowerCase();
//     if (!["xlsx", "xls", "csv"].includes(ext)) {
//         mostrarError("resultadoCarga", "Formato no válido. Usa .xlsx, .xls o .csv");
//         return;
//     }

//     const lector = new FileReader();
//     lector.onload = e => {
//         try {
//             const libro = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
//             const hoja = libro.Sheets[libro.SheetNames[0]];
//             datosCarga = XLSX.utils.sheet_to_json(hoja, { defval: "" });

//             if (!datosCarga.length) {
//                 mostrarError("resultadoCarga", "El archivo está vacío o no tiene datos válidos.");
//                 return;
//             }

//             if (datosCarga.length > 50) {
//                 mostrarError("resultadoCarga",
//                     `El archivo tiene <b>${datosCarga.length}</b> registros. El máximo es 50.<br>
//            Divídelo en partes y sube cada una por separado.`
//                 );
//                 return;
//             }

//             validarYMostrarPrevia(archivo.name);
//         } catch {
//             mostrarError("resultadoCarga", "No se pudo leer el archivo. Verifica que sea válido.");
//         }
//     };
//     lector.readAsArrayBuffer(archivo);
// }

// // ── Validar columnas y mostrar previa ──────────────────────
// function validarYMostrarPrevia(nombreArchivo) {
//     const columnas = Object.keys(datosCarga[0]);
//     const faltantes = COLUMNAS_REQUERIDAS.filter(c => !columnas.includes(c));

//     if (faltantes.length) {
//         mostrarError("resultadoCarga",
//             `Faltan columnas requeridas: <b>${faltantes.join(", ")}</b>.<br>
//        Descarga la plantilla y úsala como base.`
//         );
//         return;
//     }

//     // Validación fila por fila (solo las requeridas)
//     const erroresFila = [];
//     datosCarga.forEach((fila, i) => {
//         COLUMNAS_REQUERIDAS.forEach(col => {
//             if (!fila[col] || String(fila[col]).trim() === "") {
//                 erroresFila.push(`Fila ${i + 2}: <b>${col}</b> está vacío`);
//             }
//         });
//         if (fila.Unidades && isNaN(Number(fila.Unidades)))
//             erroresFila.push(`Fila ${i + 2}: Unidades debe ser número`);
//         if (fila.PesoKg && isNaN(Number(fila.PesoKg)))
//             erroresFila.push(`Fila ${i + 2}: PesoKg debe ser número`);
//     });

//     const colsMostrar = TODAS_COLUMNAS.filter(c => columnas.includes(c));
//     const muestra = datosCarga.slice(0, 10);

//     let htmlErrores = "";
//     if (erroresFila.length) {
//         htmlErrores = `
//       <div class="alerta-errores">
//         ⚠️ <strong>${erroresFila.length} problema(s) encontrado(s)</strong>. Corrígelos antes de importar:<br>
//         <ul>${erroresFila.slice(0, 8).map(e => `<li>${e}</li>`).join("")}
//         ${erroresFila.length > 8 ? `<li>...y ${erroresFila.length - 8} más.</li>` : ""}
//         </ul>
//       </div>`;
//     }

//     document.getElementById("resultadoCarga").innerHTML = `
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
//         `<tr>${colsMostrar.map(c =>
//             `<td>${fila[c] !== undefined ? fila[c] : "—"}</td>`
//         ).join("")}</tr>`
//     ).join("")}
//           </tbody>
//         </table>
//       </div>
//       ${datosCarga.length > 10
//             ? `<p class="preview-note">Mostrando 10 de ${datosCarga.length} registros.</p>`
//             : ""}
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

//     if (!erroresFila.length) {
//         document.getElementById("btnImportar").addEventListener("click", importarDatos);
//     }
// }

// // ── Enviar datos al Apps Script ─────────────────────────────
// async function importarDatos() {
//     const boton = document.getElementById("btnImportar");
//     boton.disabled = true;
//     boton.textContent = "Importando…";

//     // Mostrar barra de progreso
//     const preview = document.querySelector(".preview-wrap");
//     const progBar = document.createElement("div");
//     progBar.className = "progreso-wrap";
//     progBar.innerHTML = `
//     <div class="progreso-bg"><div class="progreso-fill" id="progresoFill"></div></div>
//     <p class="progreso-label" id="progresoLabel">Conectando con el servidor…</p>
//   `;
//     preview.appendChild(progBar);

//     // Animación de progreso simulada
//     let pct = 0;
//     const mensajes = ["Validando rutas…", "Escribiendo envíos…", "Guardando registros…", "Finalizando…"];
//     let mi = 0;
//     const intervalo = setInterval(() => {
//         pct = Math.min(pct + Math.random() * 7, 85);
//         const fill = document.getElementById("progresoFill");
//         const lbl = document.getElementById("progresoLabel");
//         if (fill) fill.style.width = pct + "%";
//         if (lbl && pct > 20 * (mi + 1) && mi < mensajes.length - 1) {
//             mi++;
//             lbl.textContent = mensajes[mi];
//         }
//     }, 400);

//     try {
//         const res = await fetch(API_URL, {
//             method: "POST",
//             // No pongas Content-Type manualmente con Apps Script (evita CORS preflight)
//             body: JSON.stringify({
//                 accion: "cargar",
//                 email: usuario.Email,
//                 clienteID: usuario.ClienteID,
//                 envios: datosCarga
//             })
//         });

//         const data = await res.json();

//         clearInterval(intervalo);
//         const fill = document.getElementById("progresoFill");
//         if (fill) fill.style.width = "100%";

//         // Pequeña pausa para que se vea el 100%
//         await new Promise(r => setTimeout(r, 400));

//         _mostrarResultado(data);

//     } catch (err) {
//         clearInterval(intervalo);
//         console.error(err);
//         mostrarError("resultadoCarga",
//             "Error de conexión con el servidor. Verifica tu acceso a internet e intenta de nuevo."
//         );
//         boton.disabled = false;
//         boton.textContent = `📤 Importar ${datosCarga.length} envío(s)`;
//     }
// }

// // ── Mostrar resultado final ─────────────────────────────────
// function _mostrarResultado(data) {
//     const hayErrores = data.errores && data.errores.length > 0;
//     const todoFallo = data.importados === 0;

//     const icono = todoFallo ? "❌" : hayErrores ? "⚠️" : "✅";
//     const titulo = todoFallo
//         ? "No se importó ningún registro"
//         : hayErrores
//             ? `${data.importados} importado(s) · ${data.errores.length} con error`
//             : `${data.importados} envío(s) importados correctamente`;

//     const claseCard = todoFallo ? "resultado-error" : hayErrores ? "resultado-parcial" : "resultado-ok";

//     document.getElementById("resultadoCarga").innerHTML = `
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
//     contenedor.innerHTML = `
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

//     try {
//         const res = await fetch(API_URL, {
//             method: "POST",
//             body: JSON.stringify({ accion: "guias", clienteID: usuario.ClienteID })
//         });
//         const data = await res.json();

//         if (!data.ok || !data.guias || !data.guias.length) {
//             document.querySelector(".guias-table-wrap").innerHTML = `
//         <div class="estado-vacio">
//           <div class="icono">📭</div><p>No tienes guías registradas aún.</p>
//         </div>`;
//             return;
//         }

//         document.querySelector(".guias-table-wrap").innerHTML = `
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

//     } catch (err) {
//         document.querySelector(".guias-table-wrap").innerHTML = `
//       <div class="estado-vacio">
//         <div class="icono">⚠️</div><p>Error al cargar las guías. Intenta de nuevo.</p>
//       </div>`;
//         console.error(err);
//     }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: SEGUIMIENTO
// // ════════════════════════════════════════════════════════════
// function renderSeguimiento(contenedor) {
//     contenedor.innerHTML = `
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

//     document.getElementById("btnBuscarGuia").addEventListener("click", buscarGuia);
//     document.getElementById("inputGuia")
//         .addEventListener("keypress", e => { if (e.key === "Enter") buscarGuia(); });
// }

// async function buscarGuia() {
//     const guia = document.getElementById("inputGuia").value.trim();
//     const res = document.getElementById("resultadoSeguimiento");
//     const boton = document.getElementById("btnBuscarGuia");

//     if (!guia) {
//         res.innerHTML = `<p class="txt-error">Ingresa un número de guía.</p>`;
//         return;
//     }

//     boton.disabled = true;
//     boton.textContent = "Buscando…";
//     res.innerHTML = "";

//     try {
//         const response = await fetch(API_URL, {
//             method: "POST",
//             body: JSON.stringify({ accion: "seguimiento", guia })
//         });
//         const data = await response.json();

//         if (!data.ok || !data.envio) {
//             res.innerHTML = `<p class="txt-error">No se encontró la guía <b>${guia}</b>.</p>`;
//             return;
//         }

//         const v = data.envio;
//         res.innerHTML = `
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

//     } catch (err) {
//         res.innerHTML = `<p class="txt-error">Error de conexión. Intenta de nuevo.</p>`;
//         console.error(err);
//     } finally {
//         boton.disabled = false;
//         boton.textContent = "Buscar";
//     }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: MI CUENTA
// // ════════════════════════════════════════════════════════════
// function renderMiCuenta(contenedor) {
//     const ini = usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";
//     contenedor.innerHTML = `
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
//     document.getElementById(idContenedor).innerHTML = `
//     <div class="alerta-error">⚠️ ${html}</div>`;
// }

// function badgeEstado(estado) {
//     const mapa = {
//         "Pendiente": "estado-pendiente",
//         "En tránsito": "estado-transito",
//         "Entregado": "estado-entregado",
//         "Novedad": "estado-novedad"
//     };
//     const cls = mapa[estado] || "estado-pendiente";
//     return `<span class="estado ${cls}">${estado || "Pendiente"}</span>`;
// }

// function formatearFecha(valor) {
//     if (!valor) return "—";
//     const f = new Date(valor);
//     if (isNaN(f)) return valor;
//     return f.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
// }

// function formatearPesos(valor) {
//     if (!valor && valor !== 0) return "—";
//     return new Intl.NumberFormat("es-CO", {
//         style: "currency", currency: "COP", maximumFractionDigits: 0
//     }).format(valor);
// }











// /* ============================================================
//    TRANSIMPERIO — Panel de Clientes
//    panel.js — sesión, navegación, carga masiva, guías, seguimiento
//    ============================================================ */

// 'use strict';

// // ── URL del Web App de Apps Script ──────────────────────────
// const API_URL = "https://script.google.com/macros/s/AKfycbxGwRg6BjkmxkQM-DQgaKUoRlj211DFtZKhD0T5KBcUFvgf30SjxmC7roZ90QIICyuJUw/exec";

// // ── Estado global ────────────────────────────────────────────
// let usuario = null;
// let datosCarga = [];
// let vistaActual = "";

// // ════════════════════════════════════════════════════════════
// // INIT
// // ════════════════════════════════════════════════════════════
// document.addEventListener("DOMContentLoaded", () => {

//     // Verificar sesión
//     const raw = sessionStorage.getItem("usuario");
//     if (!raw) {
//         window.location.href = "index.html";
//         return;
//     }

//     usuario = JSON.parse(raw);

//     // Nombre e inicial del usuario
//     document.getElementById("nombreUsuario").textContent = usuario.Nombre;
//     document.getElementById("userAvatar").textContent =
//         usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";

//     // Navegación sidebar
//     document.querySelectorAll(".nav-item").forEach(btn => {
//         btn.addEventListener("click", () => {
//             document.querySelectorAll(".nav-item")
//                 .forEach(b => b.classList.remove("active"));
//             btn.classList.add("active");
//             cargarVista(btn.dataset.vista);
//             cerrarSidebarMobile();
//         });
//     });

//     // Cerrar sesión
//     document.getElementById("btnSalir").addEventListener("click", cerrarSesion);

//     // Hamburger mobile
//     document.getElementById("btnMenuPanel")
//         .addEventListener("click", abrirSidebarMobile);
//     document.getElementById("btnSidebarClose")
//         .addEventListener("click", cerrarSidebarMobile);

//     // Vista inicial
//     cargarVista("carga-masiva");
// });

// // ════════════════════════════════════════════════════════════
// // SESIÓN
// // ════════════════════════════════════════════════════════════
// function cerrarSesion() {
//     sessionStorage.removeItem("usuario");
//     window.location.href = "index.html";
// }

// // ════════════════════════════════════════════════════════════
// // SIDEBAR MOBILE
// // ════════════════════════════════════════════════════════════
// function abrirSidebarMobile() {
//     document.getElementById("sidebar").classList.add("open");
//     // Overlay
//     let overlay = document.getElementById("sidebarOverlay");
//     if (!overlay) {
//         overlay = document.createElement("div");
//         overlay.id = "sidebarOverlay";
//         overlay.className = "sidebar-overlay";
//         overlay.addEventListener("click", cerrarSidebarMobile);
//         document.body.appendChild(overlay);
//     }
//     overlay.classList.add("visible");
// }

// function cerrarSidebarMobile() {
//     document.getElementById("sidebar").classList.remove("open");
//     const overlay = document.getElementById("sidebarOverlay");
//     if (overlay) overlay.classList.remove("visible");
// }

// // ════════════════════════════════════════════════════════════
// // NAVEGACIÓN — VISTAS
// // ════════════════════════════════════════════════════════════
// function cargarVista(nombre) {
//     vistaActual = nombre;
//     const contenido = document.getElementById("contenido");

//     switch (nombre) {
//         case "carga-masiva": renderCargaMasiva(contenido); break;
//         case "mis-guias": renderMisGuias(contenido); break;
//         case "seguimiento": renderSeguimiento(contenido); break;
//         case "mi-cuenta": renderMiCuenta(contenido); break;
//         default:
//             contenido.innerHTML = "<p>Vista no encontrada.</p>";
//     }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: CARGA MASIVA
// // ════════════════════════════════════════════════════════════
// function renderCargaMasiva(contenedor) {
//     datosCarga = [];

//     contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Carga Masiva de Envíos</h2>
//       <p class="vista-subtitle">
//         Sube un archivo Excel (.xlsx) o CSV con tus envíos y los importamos automáticamente.
//       </p>
//     </div>

//     <div class="upload-zone" id="uploadZone">
//       <input type="file" id="archivoExcel" accept=".xlsx,.xls,.csv">
//       <span class="upload-icon">📂</span>
//       <p class="upload-title">Arrastra tu archivo aquí o haz clic para seleccionar</p>
//       <p class="upload-hint">Formatos aceptados: .xlsx, .xls, .csv</p>
//     </div>

//     <div style="text-align:center;margin-top:16px">
//       <a href="../assets/plantilla-envios.xlsx"
//          download class="btn-plantilla">
//         ⬇ Descargar plantilla Excel
//       </a>
//     </div>

//     <div id="resultadoCarga"></div>
//   `;

//     // Drag & drop visual
//     const zone = document.getElementById("uploadZone");
//     zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
//     zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
//     zone.addEventListener("drop", e => {
//         e.preventDefault();
//         zone.classList.remove("drag-over");
//         const file = e.dataTransfer.files[0];
//         if (file) procesarArchivo(file);
//     });

//     document.getElementById("archivoExcel")
//         .addEventListener("change", e => {
//             if (e.target.files[0]) procesarArchivo(e.target.files[0]);
//         });
// }

// function procesarArchivo(archivo) {
//     const extensiones = ["xlsx", "xls", "csv"];
//     const ext = archivo.name.split(".").pop().toLowerCase();

//     if (!extensiones.includes(ext)) {
//         mostrarError("resultadoCarga", "Formato no válido. Usa .xlsx, .xls o .csv");
//         return;
//     }

//     const lector = new FileReader();
//     lector.onload = e => {
//         try {
//             const libro = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
//             const hoja = libro.Sheets[libro.SheetNames[0]];
//             datosCarga = XLSX.utils.sheet_to_json(hoja);

//             if (!datosCarga.length) {
//                 mostrarError("resultadoCarga", "El archivo está vacío o no tiene datos válidos.");
//                 return;
//             }

//             validarYMostrarPrevia();
//         } catch {
//             mostrarError("resultadoCarga", "No se pudo leer el archivo. Verifica que sea un Excel o CSV válido.");
//         }
//     };
//     lector.readAsArrayBuffer(archivo);
// }

// // ── Columnas requeridas en la plantilla ──
// const COLUMNAS_REQUERIDAS = [
//     "FechaEnvio", "Unidades", "TipoMercancia", "Kilo/ Vol", "PesoKg", "TipoPago", "Destinatario", "Cedula", "Origen", "Destino", "Direccion", "Telefono", "Observacion"
// ];

// function validarYMostrarPrevia() {
//     const columnas = Object.keys(datosCarga[0]);
//     const faltantes = COLUMNAS_REQUERIDAS.filter(c => !columnas.includes(c));

//     if (faltantes.length) {
//         mostrarError("resultadoCarga",
//             `El archivo no tiene las columnas requeridas: <b>${faltantes.join(", ")}</b>. Descarga la plantilla correcta.`
//         );
//         return;
//     }

//     const muestra = datosCarga.slice(0, 10);

//     document.getElementById("resultadoCarga").innerHTML = `
//     <div class="preview-wrap">
//       <div class="preview-header">
//         <span class="preview-title">Vista previa del archivo</span>
//         <span class="preview-count">${datosCarga.length} registros encontrados</span>
//       </div>
//       <div class="table-scroll">
//         <table class="preview-table">
//           <thead>
//             <tr>${columnas.map(c => `<th>${c}</th>`).join("")}</tr>
//           </thead>
//           <tbody>
//             ${muestra.map(fila =>
//         `<tr>${columnas.map(c =>
//             `<td>${fila[c] !== undefined ? fila[c] : "—"}</td>`
//         ).join("")}</tr>`
//     ).join("")}
//           </tbody>
//         </table>
//       </div>
//       <div class="preview-footer">
//         <span class="preview-note">
//           ${datosCarga.length > 10
//             ? `Mostrando 10 de ${datosCarga.length} registros.`
//             : `Mostrando todos los registros.`}
//         </span>
//         <button class="btn-primary" id="btnImportar">
//           📤 Importar ${datosCarga.length} envíos
//         </button>
//       </div>
//     </div>
//   `;

//     document.getElementById("btnImportar")
//         .addEventListener("click", importarDatos);
// }

// async function importarDatos() {
//     const boton = document.getElementById("btnImportar");
//     boton.disabled = true;
//     boton.textContent = "Importando…";

//     try {
//         const res = await fetch(API_URL, {
//             method: "POST",
//             body: JSON.stringify({
//                 accion: "cargar",
//                 clienteID: usuario.ClienteID,
//                 envios: datosCarga
//             })
//         });

//         const data = await res.json();

//         document.getElementById("resultadoCarga").innerHTML = `
//       <div class="resultado-card">
//         <div class="resultado-ok">
//           <h3>Resultado de la importación</h3>
//           <div class="resultado-stats">
//             <div class="stat-badge ok">
//               <span class="num">${data.importados}</span>
//               <span class="lbl">Importados</span>
//             </div>
//             <div class="stat-badge err">
//               <span class="num">${data.errores ? data.errores.length : 0}</span>
//               <span class="lbl">Con errores</span>
//             </div>
//           </div>
//           ${data.errores && data.errores.length ? `
//             <div class="errores-lista">
//               <h4>Errores encontrados</h4>
//               <ul>${data.errores.map(e => `<li>${e}</li>`).join("")}</ul>
//             </div>
//           ` : ""}
//           <button class="btn-plantilla" style="margin-top:16px"
//                   onclick="cargarVista('carga-masiva')">
//             ↩ Nueva carga
//           </button>
//         </div>
//       </div>
//     `;

//     } catch (err) {
//         mostrarError("resultadoCarga", "Error al conectar con el servidor. Intenta de nuevo.");
//         boton.disabled = false;
//         boton.textContent = `📤 Importar ${datosCarga.length} envíos`;
//         console.error(err);
//     }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: MIS GUÍAS
// // ════════════════════════════════════════════════════════════
// async function renderMisGuias(contenedor) {
//     contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Mis Guías</h2>
//       <p class="vista-subtitle">Historial de envíos asociados a tu cuenta.</p>
//     </div>
//     <div class="guias-table-wrap">
//       <div class="estado-vacio" id="guiasEstado">
//         <div class="icono">🔄</div>
//         <p>Cargando guías…</p>
//       </div>
//     </div>
//   `;

//     try {
//         const res = await fetch(API_URL, {
//             method: "POST",
//             body: JSON.stringify({
//                 accion: "guias",
//                 clienteID: usuario.ClienteID
//             })
//         });

//         const data = await res.json();

//         if (!data.ok || !data.guias || !data.guias.length) {
//             document.querySelector(".guias-table-wrap").innerHTML = `
//         <div class="estado-vacio">
//           <div class="icono">📭</div>
//           <p>No tienes guías registradas aún.</p>
//         </div>
//       `;
//             return;
//         }

//         document.querySelector(".guias-table-wrap").innerHTML = `
//       <div class="table-scroll">
//         <table class="guias-table">
//           <thead>
//             <tr>
//               <th>Guía</th>
//               <th>Fecha</th>
//               <th>Destinatario</th>
//               <th>Destino</th>
//               <th>Valor</th>
//               <th>Estado</th>
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
//               </tr>
//             `).join("")}
//           </tbody>
//         </table>
//       </div>
//     `;

//     } catch (err) {
//         document.querySelector(".guias-table-wrap").innerHTML = `
//       <div class="estado-vacio">
//         <div class="icono">⚠️</div>
//         <p>Error al cargar las guías. Intenta de nuevo.</p>
//       </div>
//     `;
//         console.error(err);
//     }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: SEGUIMIENTO
// // ════════════════════════════════════════════════════════════
// function renderSeguimiento(contenedor) {
//     contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Seguimiento de Envío</h2>
//       <p class="vista-subtitle">Consulta el estado de cualquier guía en tiempo real.</p>
//     </div>
//     <div class="seguimiento-form">
//       <div class="input-guia-row">
//         <input type="text" id="inputGuia"
//                class="input-guia"
//                placeholder="Ej: ENV-001"
//                maxlength="40">
//         <button class="btn-primary" id="btnBuscarGuia">Buscar</button>
//       </div>
//       <div id="resultadoSeguimiento"></div>
//     </div>
//   `;

//     const input = document.getElementById("inputGuia");
//     const boton = document.getElementById("btnBuscarGuia");

//     boton.addEventListener("click", buscarGuia);
//     input.addEventListener("keypress", e => {
//         if (e.key === "Enter") buscarGuia();
//     });
// }

// async function buscarGuia() {
//     const guia = document.getElementById("inputGuia").value.trim();
//     const res = document.getElementById("resultadoSeguimiento");
//     const boton = document.getElementById("btnBuscarGuia");

//     if (!guia) {
//         res.innerHTML = `<p style="color:#e53e3e;margin-top:12px;font-size:13px">
//       Ingresa un número de guía.
//     </p>`;
//         return;
//     }

//     boton.disabled = true;
//     boton.textContent = "Buscando…";
//     res.innerHTML = "";

//     try {
//         const response = await fetch(API_URL, {
//             method: "POST",
//             body: JSON.stringify({ accion: "seguimiento", guia })
//         });

//         const data = await response.json();

//         if (!data.ok || !data.envio) {
//             res.innerHTML = `<p style="color:#e53e3e;margin-top:16px;font-size:13px">
//         No se encontró información para la guía <b>${guia}</b>.
//       </p>`;
//             return;
//         }

//         const e = data.envio;
//         res.innerHTML = `
//       <div class="resultado-seguimiento">
//         <div class="seguimiento-card">
//           <div class="seg-header">
//             <span class="seg-guia-num">${e.EnvioID}</span>
//             ${badgeEstado(e.EstadoGuia)}
//           </div>
//           <div class="seg-body">
//             <div class="seg-field">
//               <label>Destinatario</label>
//               <span>${e.Destinatario || "—"}</span>
//             </div>
//             <div class="seg-field">
//               <label>Destino</label>
//               <span>${e.Destino || "—"}</span>
//             </div>
//             <div class="seg-field">
//               <label>Fecha de envío</label>
//               <span>${formatearFecha(e.FechaEnvio)}</span>
//             </div>
//             <div class="seg-field">
//               <label>Tipo de pago</label>
//               <span>${e.TipoPago || "—"}</span>
//             </div>
//             <div class="seg-field">
//               <label>Valor total</label>
//               <span>${formatearPesos(e.ValorTotal)}</span>
//             </div>
//             <div class="seg-field">
//               <label>Saldo pendiente</label>
//               <span>${formatearPesos(e.SaldoPendiente)}</span>
//             </div>
//           </div>
//         </div>
//       </div>
//     `;

//     } catch (err) {
//         res.innerHTML = `<p style="color:#e53e3e;margin-top:16px;font-size:13px">
//       Error de conexión. Intenta de nuevo.
//     </p>`;
//         console.error(err);
//     } finally {
//         boton.disabled = false;
//         boton.textContent = "Buscar";
//     }
// }

// // ════════════════════════════════════════════════════════════
// // VISTA: MI CUENTA
// // ════════════════════════════════════════════════════════════
// function renderMiCuenta(contenedor) {
//     const inicial = usuario.Nombre ? usuario.Nombre.charAt(0).toUpperCase() : "U";

//     contenedor.innerHTML = `
//     <div class="vista-header">
//       <h2 class="vista-title">Mi Cuenta</h2>
//       <p class="vista-subtitle">Información de tu cuenta en TRANSIMPERIO.</p>
//     </div>
//     <div class="cuenta-card">
//       <div class="cuenta-avatar">${inicial}</div>
//       <div class="cuenta-field">
//         <label>Nombre</label>
//         <span>${usuario.Nombre || "—"}</span>
//       </div>
//       <div class="cuenta-field">
//         <label>Correo electrónico</label>
//         <span>${usuario.Email || "—"}</span>
//       </div>
//       <div class="cuenta-field">
//         <label>ID de Cliente</label>
//         <span>${usuario.ClienteID || "—"}</span>
//       </div>
//       <div class="cuenta-field">
//         <label>Rol</label>
//         <span>${usuario.RolID || "—"}</span>
//       </div>
//     </div>
//   `;
// }

// // ════════════════════════════════════════════════════════════
// // UTILIDADES
// // ════════════════════════════════════════════════════════════
// function mostrarError(idContenedor, html) {
//     document.getElementById(idContenedor).innerHTML = `
//     <div style="
//       margin-top:20px;
//       padding:16px 20px;
//       background:#fff1f2;
//       border:1px solid #fca5a5;
//       border-radius:12px;
//       color:#b91c1c;
//       font-size:14px;
//     ">⚠️ ${html}</div>
//   `;
// }

// function badgeEstado(estado) {
//     const mapa = {
//         "Pendiente": "estado-pendiente",
//         "En tránsito": "estado-transito",
//         "Entregado": "estado-entregado",
//         "Novedad": "estado-novedad"
//     };
//     const clase = mapa[estado] || "estado-pendiente";
//     return `<span class="estado ${clase}">${estado || "Pendiente"}</span>`;
// }

// function formatearFecha(valor) {
//     if (!valor) return "—";
//     const fecha = new Date(valor);
//     if (isNaN(fecha)) return valor;
//     return fecha.toLocaleDateString("es-CO", {
//         day: "2-digit", month: "short", year: "numeric"
//     });
// }

// function formatearPesos(valor) {
//     if (!valor && valor !== 0) return "—";
//     return new Intl.NumberFormat("es-CO", {
//         style: "currency", currency: "COP", maximumFractionDigits: 0
//     }).format(valor);
// }