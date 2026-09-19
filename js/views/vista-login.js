// js/views/vista-login.js
//
// Login con Google + Setup (primer registro). mostrarErrorLogin/
// mostrarErrorSetup/actualizarGatingSetup se exportan porque el bootstrap
// de 'auth:resuelto' (en main.js, el único módulo al que le toca escuchar
// ese evento) también los usa en sus 4 casos — ver el comentario de
// cabecera de main.js. Extraído de main.js (Fase 19, división en módulos
// por vista).

import { AuthService } from '../services/auth.js';
import { registrarUsuario } from '../services/usuarios.js';
import { setUsuarioActual } from '../services/session.js';
import { mostrarDashboard } from './vista-dashboard.js';
import { crearCheckboxesCarreras } from '../render/render.js';
import { aplicarLimiteCheckboxes } from '../shared/core-ui.js';

const googleLoginBtn      = document.getElementById('googleLoginBtn');
const newUserNombreInput  = document.getElementById('newUserNombre');
const newUserRoleSelect   = document.getElementById('newUserRole');
const newUserCarrerasGroup = document.getElementById('newUserCarrerasGroup');
const newUserClaveInput   = document.getElementById('newUserClaveInput');
const completeRegistroBtn = document.getElementById('completeRegistroBtn');
const loginError = document.getElementById('loginError');
const setupError = document.getElementById('setupError');

// Carrera(s) (2026-09-18): checkboxes se pintan UNA sola vez al cargar el
// módulo (no cambian entre logins) — actualizarGatingSetup() los relee en
// cada cambio, no hace falta re-pintarlos.
newUserCarrerasGroup.appendChild(crearCheckboxesCarreras());
aplicarLimiteCheckboxes(newUserCarrerasGroup, 2);
newUserCarrerasGroup.addEventListener('change', actualizarGatingSetup);
newUserClaveInput.addEventListener('input', actualizarGatingSetup);

const LOGIN_ERROR_MESSAGES = {
    'auth/popup-closed-by-user':     'Cerraste la ventana de Google antes de terminar.',
    'auth/cancelled-popup-request':  'Ya había una ventana de Google abierta.',
    'auth/popup-blocked':            'El navegador bloqueó la ventana emergente — permite popups para este sitio.',
    'auth/network-request-failed':   'Sin conexión. Revisa tu internet.'
};

export function mostrarErrorLogin(mensaje) {
    if (!loginError) return;
    loginError.textContent = mensaje;
    loginError.style.display = mensaje ? 'block' : 'none';
}

// view-setup necesita su propio elemento de error — #loginError vive
// dentro de #login-overlay, que ya no se muestra durante el Setup
// (Fase 13.4). Escribir ahí sería un error invisible en un nodo oculto.
export function mostrarErrorSetup(mensaje) {
    if (!setupError) return;
    setupError.textContent = mensaje;
    setupError.style.display = mensaje ? 'block' : 'none';
}

async function handleLoginConGoogle() {
    mostrarErrorLogin('');
    googleLoginBtn.disabled = true;
    try {
        await AuthService.loginConGoogle();
        // AuthService.init() se encarga del resto: overlay, directorio orgánico, huerto.
    } catch (e) {
        mostrarErrorLogin(LOGIN_ERROR_MESSAGES[e.code] || 'No se pudo iniciar sesión con Google. Intenta de nuevo.');
    } finally {
        googleLoginBtn.disabled = false;
    }
}

// Fase 14.1: el botón arranca disabled en el HTML — solo se habilita
// cuando el nombre no está vacío (trim). El rol siempre tiene un valor
// válido por default (el <select> no tiene opción vacía).
// Carrera(s)/clave única (2026-09-18) se suman al gating: 1-2 carreras
// marcadas + clave de exactamente 6 dígitos — mismo formato que valida
// registrarUsuario() en el servidor (defensa en profundidad, igual que el
// resto del proyecto).
function carrerasMarcadas() {
    return [...newUserCarrerasGroup.querySelectorAll('input:checked')].map((cb) => cb.value);
}

export function actualizarGatingSetup() {
    const carreras = carrerasMarcadas();
    const claveValida = /^\d{6}$/.test(newUserClaveInput.value.trim());
    completeRegistroBtn.disabled = !newUserNombreInput.value.trim()
        || carreras.length < 1 || carreras.length > 2
        || !claveValida;
}

newUserNombreInput.addEventListener('input', actualizarGatingSetup);

async function handleCompletarRegistro() {
    const user = AuthService.getCurrentUser();
    if (!user) return;

    const nombre = newUserNombreInput.value.trim();
    if (!nombre) return; // el botón ya debería estar disabled — defensa en profundidad.
    const carreras = carrerasMarcadas();
    const claveUnica = newUserClaveInput.value.trim();

    completeRegistroBtn.disabled = true;
    mostrarErrorSetup('');
    try {
        await registrarUsuario(user.uid, user.email, newUserRoleSelect.value, nombre, carreras, claveUnica);
        // El select de Setup solo ofrece estudiante/externo (bloqueante de
        // seguridad ya validado) — nunca puede dar 'admin' aquí. No hace
        // falta ocultar #roleSelection/#googleLoginBtn: mostrarDashboard()
        // navega a view-dashboard, y el router ya oculta view-setup.
        setUsuarioActual({ uid: user.uid, email: user.email });
        mostrarDashboard(user, false, nombre);
    } catch (e) {
        console.error('[vista-login] Error registrando usuario:', e);
        mostrarErrorSetup('No se pudo completar el registro. Intenta de nuevo.');
    } finally {
        completeRegistroBtn.disabled = false;
    }
}

googleLoginBtn.addEventListener('click', handleLoginConGoogle);
completeRegistroBtn.addEventListener('click', handleCompletarRegistro);
