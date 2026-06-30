// =========================================
// LOGIN TRANSIMPERIO
// =========================================

const API_URL = "https://script.google.com/macros/s/AKfycbxGwRg6BjkmxkQM-DQgaKUoRlj211DFtZKhD0T5KBcUFvgf30SjxmC7roZ90QIICyuJUw/exec";

const form = document.getElementById("loginForm");
const mensaje = document.getElementById("mensaje");
const boton = document.querySelector(".login-btn");

form.addEventListener("submit", async function (e) {
    e.preventDefault();

    mensaje.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Ingresando...";

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            // SIN headers Content-Type — Apps Script lo requiere así
            body: JSON.stringify({
                accion: "login",
                email: document.getElementById("email").value.trim(),
                password: document.getElementById("password").value
            })
        });

        const data = await res.json();

        if (data.ok) {
            // Guardar sesión y redirigir al panel
            sessionStorage.setItem("usuario", JSON.stringify(data.usuario));
            window.location.href = "panel.html";
        } else {
            mostrarError(data.mensaje);
        }

    } catch (error) {
        mostrarError("No fue posible conectar con el servidor.");
        console.error(error);
    }

    boton.disabled = false;
    boton.textContent = "Ingresar";
});

function mostrarError(texto) {
    mensaje.style.color = "#e53e3e";
    mensaje.textContent = texto;
}



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