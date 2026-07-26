// js/shared/core-ui.js
//
// Helpers de UI genéricos, usados por todas las vistas — módulo hoja, sin
// imports salientes, para que cualquier otro módulo pueda depender de él
// sin riesgo de crear un ciclo. Extraído de main.js (Fase 19, división en
// módulos por vista — ver AI_CONTEXT.md).

const toast      = document.getElementById('toast');
const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

export function mostrarToast(mensaje, tipo = '') {
    if (!toast) return;
    toast.textContent = mensaje;
    toast.className = tipo ? `show ${tipo}` : 'show';
    setTimeout(() => toast.classList.remove('show'), 3000);
}

export function openModal(id) {
    document.getElementById(id).classList.add('open');
}

export function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// Los 3 estados del status dot del header — antes tocados inline en 3
// lugares distintos de main.js (login exitoso, catch de iniciarHuerto, sin
// sesión). Centralizados acá solo para no repetir los nombres de clase CSS
// en 3 sitios — el comportamiento es idéntico al de antes de la división.
export function marcarStatusConectado(nombreMostrado) {
    statusDot.classList.add('online');
    statusDot.classList.remove('error');
    statusText.textContent = `Conectado · ${nombreMostrado}`;
}

export function marcarStatusError() {
    statusDot.classList.add('error');
    statusDot.classList.remove('online');
    statusText.textContent = 'Error de conexión';
}

export function marcarStatusSinSesion() {
    statusDot.classList.remove('online');
    statusText.textContent = 'Sin sesión';
}
