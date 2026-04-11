# TRANSIMPERIO — Página Web

Sitio web informativo para empresa de logística y distribución empresarial en Colombia.

---

## 📁 Estructura de carpetas

```
transimperio/
│
├── index.html                  # HTML principal
│
├── css/
│   └── styles.css              # Estilos personalizados (complementa Tailwind)
│
├── js/
│   └── main.js                 # JavaScript modular: nav, rastreo, formulario
│
└── assets/
    ├── images/
    │   ├── envios_nacionales.jpg
    │   ├── logistica_urbana.jpg
    │   ├── paqueteria_aerea.jpg
    │   ├── reexpediciones.jpg
    │   ├── radicacion_documentos.jpg
    │   └── mapa_colombia.jpg
    └── icons/
        └── favicon.svg
```

---

## 🚀 Tecnologías

| Tecnología | Uso |
|---|---|
| HTML5 semántico | Estructura accesible |
| Tailwind CSS (CDN) | Utilidades de estilo |
| CSS custom (`styles.css`) | Tokens, animaciones, componentes |
| JavaScript vanilla (`main.js`) | Interactividad |
| AppSheet (iframe) | Plataforma de rastreo |

---

## ⚙️ Configuración de AppSheet (iframe)

### Pasos para integrar tu app AppSheet:

1. Abre tu proyecto en [AppSheet](https://www.appsheet.com).
2. Ve a **Manage → Deploy → Share**.
3. Activa la opción **"Require Sign-In: OFF"** (para acceso público).
4. Copia el enlace de la app (App URL).
5. En `index.html`, reemplaza `APPSHEET_APP_URL` en el iframe:

```html
<iframe
  id="appsheet-iframe"
  src="https://www.appsheet.com/start/TU-APP-ID-AQUI"
  ...
></iframe>
```

### Notas del iframe:
- **Height**: ajustable en `css/styles.css` → `.appsheet-iframe-wrap iframe { height: 560px; }`
- **Loader**: se oculta automáticamente al cargar el iframe (máx. 8 segundos).
- **Responsive**: en móvil se reduce a 420–480px de altura.

---

## 🖼️ Imágenes

Ubica tus imágenes en `assets/images/` con estos nombres exactos:

| Archivo | Sección |
|---|---|
| `envios_nacionales.jpg` | Servicio — Envíos nacionales |
| `logistica_urbana.jpg` | Servicio — Logística premium urbana |
| `paqueteria_aerea.jpg` | Servicio — Paquetería aérea |
| `reexpediciones.jpg` | Servicio — Reexpediciones |
| `radicacion_documentos.jpg` | Servicio — Radicación de documentos |
| `mapa_colombia.jpg` | Sección cobertura |

> Si una imagen no existe o falla, el sitio muestra un ícono SVG como fallback automático (atributo `onerror`).

**Dimensiones recomendadas:**
- Imágenes de servicios: **800 × 500 px** (JPG, calidad 80%)
- Mapa Colombia: **600 × 500 px**
- Formato: JPG o WebP para mejor rendimiento

---

## 🔌 Integración de API (futuro)

El archivo `js/main.js` tiene comentado el bloque de API real de AppSheet. Cuando estés listo:

1. Busca el comentario `── API REAL (AppSheet) ──` en `main.js`.
2. Rellena `APP_ID`, `TABLE` y `API_KEY`.
3. Elimina el bloque DEMO que está encima.

---

## 🌐 Despliegue en GitHub Pages

```bash
# 1. Inicializa el repositorio
git init
git add .
git commit -m "feat: sitio web TRANSIMPERIO v1"

# 2. Sube a GitHub
git remote add origin https://github.com/TU_USUARIO/transimperio.git
git branch -M main
git push -u origin main

# 3. Activa GitHub Pages
# GitHub → Settings → Pages → Source: main / root
```

La URL resultante será: `https://TU_USUARIO.github.io/transimperio/`

---

## 📌 Recomendaciones adicionales

- **Favicon**: Añade un `favicon.svg` en `assets/icons/` y descomenta la línea en el `<head>`.
- **Dominio custom**: En GitHub Pages puedes apuntar un dominio propio (ej. `transimperio.co`).
- **Formulario backend**: Para producción, reemplaza el `mailto:` por [Formspree](https://formspree.io) o un endpoint en Python (FastAPI/Flask).
- **Analytics**: Añade Google Analytics o Plausible antes del cierre del `</head>`.
- **SEO**: Completa las meta tags `og:image` con una imagen de portada de 1200×630px.
- **Imágenes WebP**: Convierte tus JPG a WebP para reducir tiempos de carga (~30% más ligeras).
