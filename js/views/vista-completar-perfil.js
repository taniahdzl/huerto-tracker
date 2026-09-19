// js/views/vista-completar-perfil.js
//
// Gate para cuentas creadas ANTES de carrera(s)/clave única (2026-09-18) —
// main.js manda aquí en vez de mostrarDashboard() cuando 'auth:resuelto'
// trae `carreras`/`claveUnica` en null pero `rol` ya resuelto (caso 2b, ver
// comentario en main.js). A diferencia de Setup (vista-login.js), acá
// nombre/rol YA existen — es un update, no un create — así que se llama a
// actualizarCarrerasYClavePropia() (usuarios.js), no a registrarUsuario().
//
// mostrarCompletarPerfil() guarda { user, rol, nombre } en un closure
// privado (_pendiente) para poder llamar a mostrarDashboard() con esos
// mismos datos justo después de guardar — no hay un segundo 'auth:resuelto'
// que disparar (completar el perfil no cambia el estado de Firebase Auth,
// mismo motivo documentado en vista-login.js para handleCompletarRegistro).

import { actualizarCarrerasYClavePropia } from '../services/usuarios.js';
import { crearCheckboxesCarreras } from '../render/render.js';
import { aplicarLimiteCheckboxes } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { mostrarDashboard } from './vista-dashboard.js';

const completarPerfilCarrerasGroup = document.getElementById('completarPerfilCarrerasGroup');
const completarPerfilClaveInput    = document.getElementById('completarPerfilClaveInput');
const completarPerfilError         = document.getElementById('completarPerfilError');
const completarPerfilBtn           = document.getElementById('completarPerfilBtn');

completarPerfilCarrerasGroup.appendChild(crearCheckboxesCarreras());
aplicarLimiteCheckboxes(completarPerfilCarrerasGroup, 2);

let _pendiente = null; // { user, rol, nombre } — ver cabecera.

function carrerasMarcadas() {
    return [...completarPerfilCarrerasGroup.querySelectorAll('input:checked')].map((cb) => cb.value);
}

function actualizarGating() {
    const carreras = carrerasMarcadas();
    const claveValida = /^\d{6}$/.test(completarPerfilClaveInput.value.trim());
    completarPerfilBtn.disabled = carreras.length < 1 || carreras.length > 2 || !claveValida;
}

completarPerfilCarrerasGroup.addEventListener('change', actualizarGating);
completarPerfilClaveInput.addEventListener('input', actualizarGating);

export function mostrarCompletarPerfil(user, rol, nombre) {
    _pendiente = { user, rol, nombre };

    completarPerfilError.textContent = '';
    completarPerfilError.style.display = 'none';
    completarPerfilClaveInput.value = '';
    completarPerfilCarrerasGroup.querySelectorAll('input:checked').forEach((cb) => { cb.checked = false; });
    // Recalcula `disabled` tras desmarcar todo (ver mismo dispatch manual
    // en vista-perfil.js) — sin esto, checkboxes que quedaron disabled por
    // haber llegado al máx. de 2 en un intento anterior seguirían
    // deshabilitados aunque ya nada esté marcado.
    completarPerfilCarrerasGroup.dispatchEvent(new Event('change'));
    actualizarGating();

    navegarA('view-completar-perfil');
}

async function handleCompletarPerfil() {
    if (!_pendiente) return;
    const carreras = carrerasMarcadas();
    const claveUnica = completarPerfilClaveInput.value.trim();

    completarPerfilBtn.disabled = true;
    try {
        await actualizarCarrerasYClavePropia(_pendiente.user.uid, carreras, claveUnica);
        const { user, rol, nombre } = _pendiente;
        _pendiente = null;
        mostrarDashboard(user, rol === 'admin', nombre);
    } catch (e) {
        console.error('[vista-completar-perfil] Error completando el perfil:', e);
        completarPerfilError.textContent = e.message || 'No se pudo guardar. Intenta de nuevo.';
        completarPerfilError.style.display = 'block';
    } finally {
        completarPerfilBtn.disabled = false;
    }
}

completarPerfilBtn.addEventListener('click', handleCompletarPerfil);
