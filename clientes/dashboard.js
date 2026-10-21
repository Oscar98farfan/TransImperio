// ════════════════════════════════════════════════════════════
// VISTA: DASHBOARD
// Usa las mismas guías que "Mis Guías" (el servidor ya las filtra:
// R1 ve todo, R3 solo sus clientes, cada cliente lo suyo).
// Todo se calcula aquí en el navegador: no gasta cuota de Google.
// ════════════════════════════════════════════════════════════

const DASH_ESTADOS = [
  { clave: "recepcionado",    nombre: "Recepcionado",    color: "#3B82F6", grupo: "curso" },
  { clave: "re-recepcionado", nombre: "Re-Recepcionado", color: "#6366F1", grupo: "curso" },
  { clave: "despachado",      nombre: "Despachado",      color: "#0891B2", grupo: "curso" },
  { clave: "validar",         nombre: "Validar",         color: "#CA8A04", grupo: "curso" },
  { clave: "pendiente",       nombre: "Pendiente",       color: "#94A3B8", grupo: "curso" },
  { clave: "entregado",       nombre: "Entregado",       color: "#16A34A", grupo: "entregado" },
  { clave: "devuelto",        nombre: "Devuelto",        color: "#EA580C", grupo: "devuelto" },
  { clave: "anulada",         nombre: "Anulada",         color: "#DC2626", grupo: "anulada" }
];

const DASH_PERIODOS = [
  { id: "7d",   nombre: "7 días" },
  { id: "30d",  nombre: "30 días" },
  { id: "mes",  nombre: "Este mes" },
  { id: "mesAnt", nombre: "Mes anterior" },
  { id: "90d",  nombre: "90 días" },
  { id: "todo", nombre: "Todo" }
];

const dash = {
  periodo: "30d",
  desde: null,          // Date (inclusive)
  hasta: null,          // Date (inclusive)
  clientes: new Set(),  // vacío = todos
  ordenCli: { col: "total", asc: false },
  verTodosCli: false,
  verTablaSerie: false
};

// ── Utilidades ──
function dashFecha(g) {
  const s = String(g.FechaEnvio || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(g.FechaEnvio);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dashDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dashSumarDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dashISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dashDeISO(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function dashNum(n) { return Number(n || 0).toLocaleString("es-CO"); }
function dashPesos(n) { return "$ " + Math.round(Number(n || 0)).toLocaleString("es-CO"); }
function dashPct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
function dashPctTxt(a, b) { return dashPct(a, b).toLocaleString("es-CO") + " %"; }
function dashPesosCorto(n) {   // $ 12,7 M · $ 850 mil
  n = Math.round(Number(n || 0));
  if (n >= 1e6) return "$ " + (n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: n >= 1e8 ? 0 : 1 }) + " M";
  if (n >= 1e4) return "$ " + Math.round(n / 1e3).toLocaleString("es-CO") + " mil";
  return dashPesos(n);
}
function dashMayus(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
function dashEstado(g) {
  const k = normalizarTxt(g.EstadoGuia);
  return DASH_ESTADOS.find(e => e.clave === k) || (k ? { clave: k, nombre: g.EstadoGuia, color: "#64748B", grupo: "curso" } : DASH_ESTADOS[4]);
}

function dashRangoPeriodo(id) {
  const hoy = dashDia(new Date());
  switch (id) {
    case "7d":  return [dashSumarDias(hoy, -6), hoy];
    case "30d": return [dashSumarDias(hoy, -29), hoy];
    case "90d": return [dashSumarDias(hoy, -89), hoy];
    case "mes": return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy];
    case "mesAnt": return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), new Date(hoy.getFullYear(), hoy.getMonth(), 0)];
    default: {   // todo: desde la guía más antigua
      const fechas = guiasData.map(dashFecha).filter(Boolean);
      if (!fechas.length) return [hoy, hoy];
      return [new Date(Math.min(...fechas)), new Date(Math.max(Math.max(...fechas), hoy))];
    }
  }
}

// ── Entrada a la vista ──
async function renderDashboard(contenedor) {
  if (!dash.desde) [dash.desde, dash.hasta] = dashRangoPeriodo(dash.periodo);

  if (!guiasData.length) {
    const local = leerGuiasLocal();
    if (local) aplicarDatosGuias(local);
  }
  if (!guiasData.length) {
    contenedor.innerHTML = `
      <div class="vista-header"><h2 class="vista-title">Dashboard</h2>
        <p class="vista-subtitle">Resumen de tus envíos.</p></div>
      <div class="estado-vacio" id="dashEstado"><div class="icono">🔄</div><p>Cargando datos…</p></div>`;
    try {
      const data = await apiCall({ accion: "guias" });
      if (!data.ok) throw new Error(data.mensaje || "No se pudieron cargar los datos.");
      aplicarDatosGuias(data);
      guardarGuiasLocal(data);
    } catch (err) {
      const e = document.getElementById("dashEstado");
      if (e && err.message !== "Sesión expirada") e.innerHTML = `<div class="icono">⚠️</div><p>${escHtml(err.message)}</p>`;
      return;
    }
    if (vistaActual !== "dashboard") return;
    if (!guiasData.length) {
      contenedor.innerHTML = `
        <div class="vista-header"><h2 class="vista-title">Dashboard</h2></div>
        <div class="estado-vacio"><div class="icono">📭</div><p>Aún no hay guías para mostrar.</p></div>`;
      return;
    }
  }
  dashMarco(contenedor);
  dashActualizar({ silencioso: true });   // trae lo último en segundo plano
}

function dashMarco(contenedor) {
  contenedor.innerHTML = `
    <div class="vista-header vista-header-flex">
      <div>
        <h2 class="vista-title">Dashboard</h2>
        <p class="vista-subtitle">${guiasCfg.admin ? "Todos los clientes" : guiasCfg.multi ? "Tus clientes" : "Resumen de tus envíos"}</p>
      </div>
      <div class="actualizar-wrap">
        <span class="actualizado-txt" id="dashActualizado">${textoActualizado()}</span>
        <button class="btn-secundario btn-sm" id="dashBtnActualizar">🔄 Actualizar</button>
      </div>
    </div>

    <div class="dash-filtros">
      <div class="dash-periodos" role="group" aria-label="Periodo">
        ${DASH_PERIODOS.map(p => `<button type="button" class="dash-periodo ${p.id === dash.periodo ? "activo" : ""}" data-periodo="${p.id}">${p.nombre}</button>`).join("")}
      </div>
      <div class="dash-fechas">
        <input type="date" id="dashDesde" class="filtro-fecha" value="${dashISO(dash.desde)}" title="Desde">
        <span>a</span>
        <input type="date" id="dashHasta" class="filtro-fecha" value="${dashISO(dash.hasta)}" title="Hasta">
      </div>
      ${guiasCfg.multi ? htmlSelectorClientes("d") : ""}
    </div>

    <div id="dashCuerpo"></div>
  `;

  document.getElementById("dashBtnActualizar").addEventListener("click", () => dashActualizar({ forzar: true }));
  contenedor.querySelector(".dash-periodos").addEventListener("click", e => {
    const b = e.target.closest("[data-periodo]");
    if (!b) return;
    dash.periodo = b.dataset.periodo;
    [dash.desde, dash.hasta] = dashRangoPeriodo(dash.periodo);
    document.getElementById("dashDesde").value = dashISO(dash.desde);
    document.getElementById("dashHasta").value = dashISO(dash.hasta);
    contenedor.querySelectorAll(".dash-periodo").forEach(x => x.classList.toggle("activo", x === b));
    dashPintar();
  });
  ["dashDesde", "dashHasta"].forEach(id => document.getElementById(id).addEventListener("change", () => {
    const d = dashDeISO(document.getElementById("dashDesde").value);
    const h = dashDeISO(document.getElementById("dashHasta").value);
    if (!d || !h) return;
    [dash.desde, dash.hasta] = d <= h ? [d, h] : [h, d];
    dash.periodo = "personalizado";
    contenedor.querySelectorAll(".dash-periodo").forEach(x => x.classList.remove("activo"));
    dashPintar();
  }));
  if (guiasCfg.multi) iniciarSelectorClientes("d", dash.clientes, dashPintar);
  dashPintar();
}

async function dashActualizar(opc) {
  const btn = document.getElementById("dashBtnActualizar");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "⏳ Actualizando…";
  try {
    const data = await apiCall({ accion: "guias", forzar: opc.forzar === true });
    if (!data.ok) throw new Error(data.mensaje || "No se pudo actualizar.");
    aplicarDatosGuias(data);
    guardarGuiasLocal(data);
    if (vistaActual !== "dashboard" || !document.getElementById("dashCuerpo")) return;
    if (dash.periodo === "todo") [dash.desde, dash.hasta] = dashRangoPeriodo("todo");
    refrescarSelectorClientes("d");
    dashPintar();
    document.getElementById("dashActualizado").textContent = textoActualizado();
  } catch (err) {
    if (!opc.silencioso && err.message !== "Sesión expirada") {
      const c = document.getElementById("dashCuerpo");
      if (c) c.insertAdjacentHTML("afterbegin", `<div class="dash-aviso txt-error">⚠️ ${escHtml(err.message)}</div>`);
    }
  } finally {
    const b = document.getElementById("dashBtnActualizar");
    if (b) { b.disabled = false; b.textContent = "🔄 Actualizar"; }
  }
}

// ── Cálculos ──
function dashFiltrar(desde, hasta) {
  return guiasData.filter(g => {
    if (dash.clientes.size && !dash.clientes.has(g.ClienteID)) return false;
    const f = dashFecha(g);
    return f && f >= desde && f <= hasta;
  });
}

function dashResumen(lista) {
  const r = { guias: lista.length, unidades: 0, valor: 0, sinValor: 0, curso: 0, entregado: 0, devuelto: 0, anulada: 0 };
  lista.forEach(g => {
    r.unidades += Number(g.Unidades) || 0;
    const est = dashEstado(g);
    r[est.grupo]++;
    if (est.grupo !== "anulada") r.valor += Number(g.ValorTotal) || 0;
    if ((g.ValorEnvio === null || g.ValorEnvio === undefined || Number(g.ValorEnvio) <= 0) && est.grupo !== "anulada") r.sinValor++;
  });
  return r;
}

// ── Pintado ──
function dashPintar() {
  const cuerpo = document.getElementById("dashCuerpo");
  if (!cuerpo) return;
  const lista = dashFiltrar(dash.desde, dash.hasta);
  const r = dashResumen(lista);

  // Periodo anterior del mismo largo (para comparar el total de guías)
  const dias = Math.round((dash.hasta - dash.desde) / 86400000) + 1;
  const previo = dash.periodo === "todo" ? null
    : dashFiltrar(dashSumarDias(dash.desde, -dias), dashSumarDias(dash.desde, -1)).length;

  if (!lista.length) {
    cuerpo.innerHTML = `<div class="estado-vacio dash-vacio"><div class="icono">📭</div>
      <p>No hay guías en este periodo${dash.clientes.size ? " para los clientes elegidos" : ""}.</p></div>`;
    return;
  }

  cuerpo.innerHTML = `
    <div class="dash-kpis ${verValores() ? "n6" : "n5"}">
      ${dashKpi("📦", "Guías", dashNum(r.guias), previo === null ? `<span class="dash-kpi-sub">en el periodo</span>` : dashDelta(r.guias, previo), "azul")}
      ${dashKpi("🧺", "Unidades", dashNum(r.unidades), `<span class="dash-kpi-sub">paquetes enviados</span>`, "indigo")}
      ${dashKpi("✅", "Entregadas", dashNum(r.entregado), `<span class="dash-kpi-sub">${dashPctTxt(r.entregado, r.guias)} del total</span>`, "verde")}
      ${dashKpi("🚚", "En curso", dashNum(r.curso), `<span class="dash-kpi-sub">por entregar</span>`, "cian")}
      ${dashKpi("↩️", "Devueltas", dashNum(r.devuelto), `<span class="dash-kpi-sub">${dashPctTxt(r.devuelto, r.guias)} del total</span>`, "naranja")}
      ${verValores() ? dashKpi("💰", "Valor", `<span title="${dashPesos(r.valor)}">${dashPesosCorto(r.valor)}</span>`,
          `<span class="dash-kpi-sub">${r.sinValor ? `${dashNum(r.sinValor)} sin valor asignado` : "sin anuladas"}</span>`, "oro") : ""}
    </div>

    <section class="dash-card dash-ancho">
      <div class="dash-card-cab">
        <h3>Guías en el tiempo</h3>
        <button type="button" class="btn-link" id="dashToggleTabla">${dash.verTablaSerie ? "Ver gráfica" : "Ver como tabla"}</button>
      </div>
      <div id="dashSerie" class="dash-serie"></div>
    </section>

    <div class="dash-grid">
      <section class="dash-card">
        <div class="dash-card-cab"><h3>Por estado</h3></div>
        ${dashBarras(DASH_ESTADOS.map(e => ({ nombre: e.nombre, color: e.color, valor: lista.filter(g => dashEstado(g).clave === e.clave).length }))
            .concat(dashEstadosExtra(lista)).filter(x => x.valor > 0), r.guias, true)}
      </section>
      <section class="dash-card">
        <div class="dash-card-cab"><h3>Destinos principales</h3></div>
        ${dashBarras(dashTop(lista, g => g.Destino || "Sin destino", 8), r.guias)}
      </section>
      <section class="dash-card">
        <div class="dash-card-cab"><h3>Tipo de pago</h3></div>
        ${dashBarras(dashTop(lista, g => g.TipoPago || "Sin tipo", 5), r.guias)}
      </section>
      <section class="dash-card">
        <div class="dash-card-cab"><h3>Entregas</h3></div>
        ${dashAnillo(r)}
      </section>
    </div>

    ${guiasCfg.multi ? `
    <section class="dash-card dash-ancho">
      <div class="dash-card-cab"><h3>Por cliente</h3><span class="dash-card-nota">Toca un encabezado para ordenar</span></div>
      <div id="dashClientes"></div>
    </section>` : ""}
  `;

  document.getElementById("dashToggleTabla").addEventListener("click", () => {
    dash.verTablaSerie = !dash.verTablaSerie;
    document.getElementById("dashToggleTabla").textContent = dash.verTablaSerie ? "Ver gráfica" : "Ver como tabla";
    dashPintarSerie(lista);
  });
  dashPintarSerie(lista);
  if (guiasCfg.multi) dashPintarClientes(lista);
  dash.listaActual = lista;
}

// Al cambiar el tamaño de la ventana, la gráfica se vuelve a dibujar a su nuevo ancho
let dashResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(dashResizeTimer);
  dashResizeTimer = setTimeout(() => {
    if (vistaActual === "dashboard" && dash.listaActual && !dash.verTablaSerie) dashPintarSerie(dash.listaActual);
  }, 150);
});

// Las cifras de dinero solo las ve el administrador (R1)
function verValores() { return guiasCfg.admin === true; }

function dashKpi(icono, titulo, valor, extra, tono) {
  return `<div class="dash-kpi tono-${tono || "azul"}">
      <div class="dash-kpi-cab"><span class="dash-kpi-ico" aria-hidden="true">${icono}</span><span class="dash-kpi-lbl">${titulo}</span></div>
      <div class="dash-kpi-num">${valor}</div>
      ${extra || ""}
    </div>`;
}

function dashDelta(actual, previo) {
  if (!previo) return `<span class="dash-kpi-sub">en el periodo</span>`;
  const d = Math.round(((actual - previo) / previo) * 100);
  const cls = d > 0 ? "sube" : d < 0 ? "baja" : "igual";
  const flecha = d > 0 ? "▲" : d < 0 ? "▼" : "＝";
  return `<span class="dash-kpi-sub" title="Periodo anterior: ${dashNum(previo)} guías"><span class="dash-delta ${cls}">${flecha} ${Math.abs(d)} %</span> vs. periodo anterior</span>`;
}

function dashEstadosExtra(lista) {   // estados que no están en la lista fija (por si AppSheet tiene otros)
  const extra = {};
  lista.forEach(g => { const e = dashEstado(g); if (!DASH_ESTADOS.includes(e)) extra[e.nombre] = (extra[e.nombre] || 0) + 1; });
  return Object.keys(extra).map(n => ({ nombre: n, color: "#64748B", valor: extra[n] }));
}

function dashTop(lista, fn, max) {
  const c = {};
  lista.forEach(g => { const k = String(fn(g)).trim() || "—"; c[k] = (c[k] || 0) + 1; });
  const orden = Object.keys(c).map(k => ({ nombre: k, valor: c[k] })).sort((a, b) => b.valor - a.valor);
  if (orden.length <= max) return orden;
  const otros = orden.slice(max - 1).reduce((s, x) => s + x.valor, 0);
  return orden.slice(0, max - 1).concat([{ nombre: `Otros (${orden.length - max + 1})`, valor: otros, otros: true }]);
}

// Barras horizontales con etiqueta, valor y porcentaje (el color nunca va solo)
function dashBarras(items, total, conPunto) {
  if (!items.length) return `<p class="dash-nada">Sin datos</p>`;
  const max = Math.max(...items.map(x => x.valor), 1);
  return `<div class="dash-barras">${items.map(x => `
      <div class="dash-barra" title="${escHtml(x.nombre)}: ${dashNum(x.valor)} (${dashPctTxt(x.valor, total)})">
        <span class="dash-barra-lbl">${conPunto ? `<i class="dash-punto" style="background:${x.color}"></i>` : ""}${escHtml(x.nombre)}</span>
        <span class="dash-barra-pista"><span class="dash-barra-fill ${x.otros ? "otros" : ""}" style="width:${Math.max(2, (x.valor / max) * 100)}%;${x.color ? `background:${x.color}` : ""}"></span></span>
        <span class="dash-barra-num">${dashNum(x.valor)} <small>${dashPctTxt(x.valor, total)}</small></span>
      </div>`).join("")}</div>`;
}

// Anillo de entregas
function dashAnillo(r) {
  const pct = dashPct(r.entregado, r.guias);
  const R = 52, C = 2 * Math.PI * R;
  const largo = (pct / 100) * C;
  return `<div class="dash-anillo">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="${pct.toLocaleString("es-CO")} % entregadas">
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="#E6F1FB" stroke-width="14"/>
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="#16A34A" stroke-width="14" stroke-linecap="round"
                stroke-dasharray="${largo} ${C}" transform="rotate(-90 70 70)"/>
        <text x="70" y="68" text-anchor="middle" class="dash-anillo-num">${pct.toLocaleString("es-CO")}%</text>
        <text x="70" y="88" text-anchor="middle" class="dash-anillo-lbl">entregadas</text>
      </svg>
      <ul class="dash-anillo-lista">
        <li><i class="dash-punto" style="background:#16A34A"></i>Entregadas <b>${dashNum(r.entregado)}</b></li>
        <li><i class="dash-punto" style="background:#3B82F6"></i>En curso <b>${dashNum(r.curso)}</b></li>
        <li><i class="dash-punto" style="background:#EA580C"></i>Devueltas <b>${dashNum(r.devuelto)}</b></li>
        ${r.anulada ? `<li><i class="dash-punto" style="background:#DC2626"></i>Anuladas <b>${dashNum(r.anulada)}</b></li>` : ""}
      </ul>
    </div>`;
}

// ── Serie de tiempo (columnas por día / semana / mes) ──
function dashSerie(lista) {
  const dias = Math.round((dash.hasta - dash.desde) / 86400000) + 1;
  const tipo = dias <= 45 ? "dia" : dias <= 200 ? "semana" : "mes";
  const inicioDe = d => {
    if (tipo === "dia") return dashDia(d);
    if (tipo === "semana") { const x = dashDia(d); const dow = (x.getDay() + 6) % 7; return dashSumarDias(x, -dow); }
    return new Date(d.getFullYear(), d.getMonth(), 1);
  };
  const sig = d => tipo === "dia" ? dashSumarDias(d, 1) : tipo === "semana" ? dashSumarDias(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const cubetas = [];
  for (let d = inicioDe(dash.desde); d <= dash.hasta; d = sig(d)) cubetas.push({ ini: d, total: 0, entregadas: 0 });
  const idx = {};
  cubetas.forEach((c, i) => { idx[dashISO(c.ini)] = i; });
  lista.forEach(g => {
    const f = dashFecha(g);
    const i = idx[dashISO(inicioDe(f))];
    if (i === undefined) return;
    cubetas[i].total++;
    if (dashEstado(g).grupo === "entregado") cubetas[i].entregadas++;
  });
  const fmt = d => tipo === "mes"
    ? d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" })
    : d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  cubetas.forEach(c => {
    c.etiqueta = fmt(c.ini);
    c.detalle = dashMayus(tipo === "dia" ? c.ini.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })
      : tipo === "semana" ? `Semana del ${fmt(c.ini)}` : c.ini.toLocaleDateString("es-CO", { month: "long", year: "numeric" }));
  });
  return { tipo, cubetas };
}

function dashPintarSerie(lista) {
  const cont = document.getElementById("dashSerie");
  if (!cont) return;
  const { tipo, cubetas } = dashSerie(lista);
  const unidad = tipo === "dia" ? "Día" : tipo === "semana" ? "Semana" : "Mes";

  if (dash.verTablaSerie) {
    cont.innerHTML = `<div class="dash-tabla-wrap"><table class="dash-tabla">
      <thead><tr><th>${unidad}</th><th class="num">Guías</th><th class="num">Entregadas</th></tr></thead>
      <tbody>${cubetas.map(c => `<tr><td>${escHtml(c.detalle)}</td><td class="num">${dashNum(c.total)}</td><td class="num">${dashNum(c.entregadas)}</td></tr>`).join("")}</tbody>
    </table></div>`;
    return;
  }

  const W = Math.max(300, Math.round(cont.clientWidth || 760)), H = W < 500 ? 200 : 230, mI = 34, mD = 8, mA = 10, mB = 26;
  const anchoUtil = W - mI - mD, altoUtil = H - mA - mB;
  const max = Math.max(...cubetas.map(c => c.total), 1);
  const paso = max <= 4 ? 1 : Math.ceil(max / 4 / Math.pow(10, Math.floor(Math.log10(max / 4)))) * Math.pow(10, Math.floor(Math.log10(max / 4)));
  const tope = Math.ceil(max / paso) * paso;
  const y = v => mA + altoUtil - (v / tope) * altoUtil;
  const n = cubetas.length, banda = anchoUtil / n;
  const anchoBarra = Math.max(2, Math.min(36, banda - 2));
  const cadaEtiqueta = Math.ceil(n / Math.max(1, Math.floor(anchoUtil / 62)));

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-svg" role="img" aria-label="Guías por ${unidad.toLowerCase()}">`;
  for (let v = 0; v <= tope; v += paso) {
    svg += `<line x1="${mI}" x2="${W - mD}" y1="${y(v)}" y2="${y(v)}" class="dash-grilla ${v === 0 ? "base" : ""}"/>
            <text x="${mI - 6}" y="${y(v) + 3.5}" text-anchor="end" class="dash-eje">${dashNum(v)}</text>`;
  }
  cubetas.forEach((c, i) => {
    const cx = mI + banda * i + banda / 2;
    const x0 = cx - anchoBarra / 2;
    if (c.total > 0) {
      const top = y(c.total), alto = mA + altoUtil - top, rr = Math.min(4, anchoBarra / 2, alto);
      svg += `<path class="dash-col" d="M${x0},${mA + altoUtil} V${top + rr} Q${x0},${top} ${x0 + rr},${top} H${x0 + anchoBarra - rr} Q${x0 + anchoBarra},${top} ${x0 + anchoBarra},${top + rr} V${mA + altoUtil} Z"/>`;
    }
    if (i % cadaEtiqueta === 0) svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="dash-eje">${escHtml(c.etiqueta)}</text>`;
    svg += `<rect class="dash-hit" data-i="${i}" x="${mI + banda * i}" y="${mA}" width="${banda}" height="${altoUtil}"/>`;
  });
  svg += `</svg>`;
  cont.innerHTML = svg + `<div class="dash-tooltip" id="dashTooltip" hidden></div>`;

  const tip = document.getElementById("dashTooltip");
  const svgEl = cont.querySelector("svg");
  const mostrar = (rect) => {
    const c = cubetas[Number(rect.dataset.i)];
    cont.querySelectorAll(".dash-hit.activo").forEach(r => r.classList.remove("activo"));
    rect.classList.add("activo");
    tip.innerHTML = `<b>${escHtml(c.detalle)}</b><span>${dashNum(c.total)} guía${c.total === 1 ? "" : "s"}</span>
                     <span class="dash-tip-sub">${dashNum(c.entregadas)} entregada${c.entregadas === 1 ? "" : "s"}</span>`;
    tip.hidden = false;
    const caja = cont.getBoundingClientRect(), r = rect.getBoundingClientRect();
    let left = r.left - caja.left + r.width / 2 - tip.offsetWidth / 2;
    left = Math.max(0, Math.min(left, caja.width - tip.offsetWidth));
    tip.style.left = left + "px";
    tip.style.top = Math.max(0, (svgEl.getBoundingClientRect().height * 0.05)) + "px";
  };
  cont.querySelectorAll(".dash-hit").forEach(rect => {
    rect.addEventListener("mouseenter", () => mostrar(rect));
    rect.addEventListener("click", () => mostrar(rect));
  });
  svgEl.addEventListener("mouseleave", () => { tip.hidden = true; cont.querySelectorAll(".dash-hit.activo").forEach(r => r.classList.remove("activo")); });
}

// ── Tabla por cliente (administrador / comercial) ──
function dashPintarClientes(lista) {
  const cont = document.getElementById("dashClientes");
  if (!cont) return;
  const m = {};
  lista.forEach(g => {
    const id = g.ClienteID || "—";
    if (!m[id]) m[id] = { id, nombre: g.Cliente || id, total: 0, entregado: 0, curso: 0, devuelto: 0, anulada: 0, unidades: 0, valor: 0 };
    const x = m[id], gr = dashEstado(g).grupo;
    x.total++; x[gr]++;
    x.unidades += Number(g.Unidades) || 0;
    if (gr !== "anulada") x.valor += Number(g.ValorTotal) || 0;
  });
  const filas = Object.values(m).map(x => Object.assign(x, { pctEnt: dashPct(x.entregado, x.total) }));
  const { col, asc } = dash.ordenCli;
  filas.sort((a, b) => {
    const va = a[col], vb = b[col];
    const r = typeof va === "string" ? va.localeCompare(vb, "es") : va - vb;
    return asc ? r : -r;
  });
  const max = Math.max(...filas.map(f => f.total), 1);
  const visibles = dash.verTodosCli ? filas : filas.slice(0, 10);
  const cols = [
    ["nombre", "Cliente", ""], ["total", "Guías", "num"], ["unidades", "Unidades", "num"], ["entregado", "Entregadas", "num"],
    ["curso", "En curso", "num"], ["devuelto", "Devueltas", "num"], ["pctEnt", "% entrega", "num"]
  ].concat(verValores() ? [["valor", "Valor", "num"]] : []);
  cont.innerHTML = `
    <div class="dash-tabla-wrap"><table class="dash-tabla dash-tabla-cli">
      <thead><tr>${cols.map(([k, t, c]) => `<th class="${c} ordenable ${col === k ? "orden-activo" : ""}" data-col="${k}">${t}${col === k ? (asc ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
      <tbody>${visibles.map(f => `
        <tr>
          <td class="dash-cli-nombre">${escHtml(f.nombre)}</td>
          <td class="num"><span class="dash-mini-barra"><i style="width:${(f.total / max) * 100}%"></i></span>${dashNum(f.total)}</td>
          <td class="num">${dashNum(f.unidades)}</td>
          <td class="num">${dashNum(f.entregado)}</td>
          <td class="num">${dashNum(f.curso)}</td>
          <td class="num">${dashNum(f.devuelto)}</td>
          <td class="num"><span class="dash-pct ${f.pctEnt >= 80 ? "alto" : f.pctEnt >= 50 ? "medio" : "bajo"}">${f.pctEnt.toLocaleString("es-CO")} %</span></td>
          ${verValores() ? `<td class="num">${dashPesos(f.valor)}</td>` : ""}
        </tr>`).join("")}</tbody>
    </table></div>
    ${filas.length > 10 ? `<button type="button" class="btn-link dash-ver-todos" id="dashVerTodos">${dash.verTodosCli ? "Ver solo los 10 primeros" : `Ver los ${filas.length} clientes`}</button>` : ""}
  `;
  cont.querySelectorAll("th.ordenable").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.col;
    dash.ordenCli = { col: k, asc: dash.ordenCli.col === k ? !dash.ordenCli.asc : k === "nombre" };
    dashPintarClientes(lista);
  }));
  const vt = document.getElementById("dashVerTodos");
  if (vt) vt.addEventListener("click", () => { dash.verTodosCli = !dash.verTodosCli; dashPintarClientes(lista); });
}
