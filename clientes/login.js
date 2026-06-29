// =========================================
// LOGIN TRANSIMPERIO
// =========================================

const API_URL = "https://script.google.com/macros/s/AKfycbxGwRg6BjkmxkQM-DQgaKUoRlj211DFtZKhD0T5KBcUFvgf30SjxmC7roZ90QIICyuJUw/exec"
const form = document.getElementById("loginForm");
const mensaje = document.getElementById("mensaje");
const boton = document.querySelector(".login-btn");


form.addEventListener("submit", async function (e) {
    e.preventDefault();
    mensaje.innerHTML = "";
    boton.disabled = true;
    boton.innerHTML = "Ingresando...";
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                accion: "login",
                email: document.getElementById("email").value,
                password: document.getElementById("password").value
            })
        });
        const data = await response.json();
        if (data.ok) {
            mensaje.style.color = "green";
            mensaje.innerHTML = "Bienvenido " + data.usuario.Nombre;
        } else {
            mensaje.style.color = "red";
            mensaje.innerHTML = data.mensaje;
        }
    } catch (error) {
        mensaje.style.color = "red";
        mensaje.innerHTML = "No fue posible conectar con el servidor.";
    }
    boton.disabled = false;
    boton.innerHTML = "Ingresar";
});

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