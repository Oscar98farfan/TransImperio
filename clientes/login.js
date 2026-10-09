'use strict';

// La URL del API vive solo en config.js
const API_URL = CONFIG.API_URL;

const form = document.getElementById("loginForm");
const mensaje = document.getElementById("mensaje");
const boton = document.querySelector(".login-btn");

form.addEventListener("submit", async function (e) {
    e.preventDefault();

    mensaje.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Ingresando...";

    try {
        const cuerpo = JSON.stringify({
            accion: "login",
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value
        });

        // Google Apps Script a veces responde con una página de error momentánea
        // (servidor ocupado o "arrancando"). Se reintenta automáticamente hasta 2 veces.
        let data = null, texto = "";
        for (let intento = 1; intento <= 3 && !data; intento++) {
            if (intento > 1) {
                boton.textContent = "Reintentando...";
                await new Promise(r => setTimeout(r, 1500 * (intento - 1)));
            }
            const res = await fetch(API_URL, { method: "POST", redirect: "follow", body: cuerpo });
            texto = await res.text();
            try { data = JSON.parse(texto); } catch { data = null; }
        }

        if (!data) {
            console.error("Respuesta no es JSON:", texto.slice(0, 300));
            mostrarError("El servidor está ocupado en este momento. Espera unos segundos e intenta de nuevo.");
            boton.disabled = false;
            boton.textContent = "Ingresar";
            return;
        }

        if (data.ok) {
            sessionStorage.setItem("token", data.token);
            sessionStorage.setItem("usuario", JSON.stringify(data.usuario));
            window.location.href = "panel.html";
        } else {
            mostrarError(data.mensaje);
        }

    } catch (err) {
        mostrarError("No fue posible conectar con el servidor.");
        console.error(err);
    }

    boton.disabled = false;
    boton.textContent = "Ingresar";
});

function mostrarError(texto) {
    mensaje.style.color = "#e53e3e";
    mensaje.textContent = texto;
}


// // Agregar esta función al final del archivo
// async function fetchConReintento(url, opciones, intentos = 2) {
//     for (let i = 0; i < intentos; i++) {
//         try {
//             const res = await fetch(url, opciones);
//             return res;
//         } catch (err) {
//             if (i === intentos - 1) throw err;
//             await new Promise(r => setTimeout(r, 1500)); // espera 1.5s y reintenta
//         }
//     }
// }


// form.addEventListener("submit", function (e) {
//     e.preventDefault();
//     mensaje.innerHTML = "";
//     const email = document.getElementById("email").value.trim();
//     const password = document.getElementById("password").value.trim();
//     if (email === "" || password === "") {
//         mensaje.innerHTML = "Debes completar todos los campos.";
//         return;
//     }
//     boton.disabled = true;
//     boton.innerHTML = "Ingresando...";
//     // Aquí luego llamaremos Apps Script
//     setTimeout(() => {
//         boton.disabled = false;
//         boton.innerHTML = "Ingresar";
//         mensaje.innerHTML =
//             "✅ El login visual ya funciona. En el siguiente paso lo conectaremos con Google Sheets.";
//     }, 1200);
// });

// ── Ver / ocultar contraseña ──
(function () {
    const btn = document.getElementById("btnVerClave");
    const input = document.getElementById("password");
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
        const mostrar = input.type === "password";
        input.type = mostrar ? "text" : "password";
        btn.classList.toggle("visible", mostrar);
        const txt = mostrar ? "Ocultar contraseña" : "Mostrar contraseña";
        btn.setAttribute("aria-label", txt);
        btn.title = txt;
        input.focus();
    });
    // Al enviar el formulario se vuelve a ocultar
    document.getElementById("loginForm").addEventListener("submit", () => {
        input.type = "password";
        btn.classList.remove("visible");
    });
})();
