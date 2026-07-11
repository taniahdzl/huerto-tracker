// js/main.js
// Orquestador de arranque + bridge de UI (login, modal de mesas, panel IA).
// AuthService.init() decide si se muestra el huerto o el overlay de login;
// este archivo es el único que toca el DOM — auth.js, db.js, render.js y
// ai.js se mantienen puros (sin conocerse entre sí ni conocer el DOM).
//
// TODO (fuera de alcance): drag&drop, cálculo de alertas de cosecha/riego,
// y el modal de Configuración (openConfig / configModal) — sigue sin
// implementar. El Asistente IA usa generarRespuestaHuerto() de ai.js, que
// hoy es un mock (ver TODO ahí sobre la Cloud Function pendiente).

import { AuthService } from './auth.js';
import { obtenerCatalogo, obtenerCamas, crearCama, actualizarCama, eliminarCama, setUsuarioActual } from './db.js';
import { renderCatalogo, renderMapaHuerto } from './render.js';
import { generarRespuestaHuerto } from './ai.js';

const statusDot   = document.getElementById('statusDot');
const statusText  = document.getElementById('statusText');
const toast       = document.getElementById('toast');
const plantListEl  = document.getElementById('plantList');
const gardenGridEl = document.getElementById('gardenGrid');

const loginOverlay = document.getElementById('login-overlay');
const appRoot       = document.getElementById('appRoot');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn       = document.getElementById('login-btn');
const loginError    = document.getElementById('loginError');

// ── Modal de mesa (cama) ──────────────────────────────────────────
const addBedBtn        = document.getElementById('addBedBtn');
const bedModalTitle     = document.getElementById('bedModalTitle');
const bedModalClose     = document.getElementById('bedModalClose');
const bedModalCancel    = document.getElementById('bedModalCancel');
const saveBedBtn         = document.getElementById('saveBedBtn');
const deleteBedBtn       = document.getElementById('deleteBedBtn');
const plantDateFields    = document.getElementById('plantDateFields');

const bedNameInput           = document.getElementById('bedName');
const bedColInput            = document.getElementById('bedCol');
const bedRowInput            = document.getElementById('bedRow');
const bedPlantSelect         = document.getElementById('bedPlant');
const bedSeedDateInput       = document.getElementById('bedSeedDate');
const bedTransplantDateInput = document.getElementById('bedTransplantDate');
const soilNInput = document.getElementById('soilN');
const soilPInput = document.getElementById('soilP');
const soilKInput = document.getElementById('soilK');
const soilNVal   = document.getElementById('soilNVal');
const soilPVal   = document.getElementById('soilPVal');
const soilKVal   = document.getElementById('soilKVal');
const bedNotesInput   = document.getElementById('bedNotes');
const bedPlagasInput  = document.getElementById('bedPlagas');
const bedCompostSelect = document.getElementById('bedCompost');

// ── Panel del Asistente IA ─────────────────────────────────────────
const aiToggleEl    = document.querySelector('.ai-toggle');
const aiToggleIcon  = document.getElementById('aiToggleIcon');
const aiBody         = document.getElementById('aiBody');
const aiMessages     = document.getElementById('aiMessages');
const aiInput        = document.getElementById('aiInput');
const aiSendBtn       = document.querySelector('.ai-send');
const aiOverviewBtn  = document.querySelector('.btn-ai');

let catalogoActual = [];
let camasActuales  = [];
let editingCamaId  = null;

function mostrarToast(mensaje, tipo = '') {
    if (!toast) return;
    toast.textContent = mensaje;
    toast.className = tipo ? `show ${tipo}` : 'show';
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function openModal(id) {
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// ── Login ──────────────────────────────────────────────────────────

const LOGIN_ERROR_MESSAGES = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password':     'Correo o contraseña incorrectos.',
    'auth/user-not-found':     'Correo o contraseña incorrectos.',
    'auth/invalid-email':      'El correo no tiene un formato válido.',
    'auth/too-many-requests':  'Demasiados intentos. Espera un momento antes de volver a intentar.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu internet.'
};

function mostrarErrorLogin(mensaje) {
    if (!loginError) return;
    loginError.textContent = mensaje;
    loginError.style.display = mensaje ? 'block' : 'none';
}

async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    mostrarErrorLogin('');

    if (!email || !password) {
        mostrarErrorLogin('Ingresa correo y contraseña.');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando…';
    try {
        await AuthService.login(email, password);
        // AuthService.init() se encarga de ocultar el overlay al detectar la sesión.
    } catch (e) {
        mostrarErrorLogin(LOGIN_ERROR_MESSAGES[e.code] || 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Iniciar sesión';
    }
}

loginBtn.addEventListener('click', handleLogin);
passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// ── Carga de datos ────────────────────────────────────────────────

function poblarSelectPlantas() {
    bedPlantSelect.innerHTML = '<option value="">— Sin planta —</option>';
    catalogoActual.forEach((planta) => {
        const opt = document.createElement('option');
        opt.value = planta.id;
        opt.textContent = planta.nombre;
        bedPlantSelect.appendChild(opt);
    });
}

async function iniciarHuerto() {
    try {
        const [catalogo, camas] = await Promise.all([obtenerCatalogo(), obtenerCamas()]);
        catalogoActual = catalogo;
        camasActuales  = camas;
        poblarSelectPlantas();
        renderCatalogo(catalogo, plantListEl);
        renderMapaHuerto(camas, gardenGridEl);
    } catch (e) {
        console.error('[main] Error cargando datos del huerto:', e);
        statusDot.classList.add('error');
        statusDot.classList.remove('online');
        statusText.textContent = 'Error de conexión';
        mostrarToast('No se pudo cargar el huerto', 'red');
    }
}

// ── Modal de mesa: abrir / poblar ─────────────────────────────────

function limpiarFormularioBed() {
    bedNameInput.value = '';
    bedColInput.value = 1;
    bedRowInput.value = 1;
    bedPlantSelect.value = '';
    plantDateFields.style.display = 'none';
    bedSeedDateInput.value = '';
    bedTransplantDateInput.value = '';
    soilNInput.value = 1.5; soilNVal.textContent = '1.5';
    soilPInput.value = 1;   soilPVal.textContent = '1.0';
    soilKInput.value = 1.2; soilKVal.textContent = '1.2';
    bedNotesInput.value = '';
    bedPlagasInput.value = '';
    bedCompostSelect.value = 'no';
}

function openAddBed() {
    editingCamaId = null;
    bedModalTitle.textContent = 'Nueva Mesa de Cultivo';
    deleteBedBtn.style.display = 'none';
    limpiarFormularioBed();
    openModal('bedModal');
}

function openEditBed(camaId) {
    const cama = camasActuales.find((c) => c.id === camaId);
    if (!cama) return;

    editingCamaId = camaId;
    bedModalTitle.textContent = 'Editar Mesa de Cultivo';
    deleteBedBtn.style.display = '';

    bedNameInput.value = cama.nombre || '';
    bedColInput.value = cama.col || 1;
    bedRowInput.value = cama.fila || 1;
    bedPlantSelect.value = cama.plantaId || '';
    plantDateFields.style.display = cama.plantaId ? 'block' : 'none';
    bedSeedDateInput.value = cama.fechaSiembra || '';
    bedTransplantDateInput.value = cama.fechaTrasplante || '';

    const suelo = cama.suelo || {};
    soilNInput.value = suelo.N ?? 1.5; soilNVal.textContent = Number(soilNInput.value).toFixed(1);
    soilPInput.value = suelo.P ?? 1;   soilPVal.textContent = Number(soilPInput.value).toFixed(1);
    soilKInput.value = suelo.K ?? 1.2; soilKVal.textContent = Number(soilKInput.value).toFixed(1);

    bedNotesInput.value = cama.notas || '';
    bedPlagasInput.value = cama.plagas || '';
    bedCompostSelect.value = cama.composta || 'no';

    openModal('bedModal');
}

// ── Modal de mesa: guardar ────────────────────────────────────────

async function handleSaveBed() {
    const nombre = bedNameInput.value.trim();
    if (!nombre) {
        mostrarToast('La mesa necesita un nombre', 'red');
        return;
    }

    const plantaId = bedPlantSelect.value || null;
    const planta = plantaId ? catalogoActual.find((p) => p.id === plantaId) : null;

    const datos = {
        nombre,
        col:  Number(bedColInput.value) || 1,
        fila: Number(bedRowInput.value) || 1,
        plantaId,
        // Denormalizado desde el catálogo solo para que render.js pueda
        // pintar el mapa sin recibir el catálogo completo (ver nota en
        // render.js). plantaId sigue siendo la referencia real.
        plantaNombre: planta?.nombre || null,
        plantaTipo:   planta?.tipo || null,
        fechaSiembra:    bedSeedDateInput.value || null,
        fechaTrasplante: bedTransplantDateInput.value || null,
        suelo: {
            N: Number(soilNInput.value),
            P: Number(soilPInput.value),
            K: Number(soilKInput.value)
        },
        composta: bedCompostSelect.value,
        notas:  bedNotesInput.value,
        plagas: bedPlagasInput.value
    };

    saveBedBtn.disabled = true;
    try {
        if (editingCamaId) {
            await actualizarCama(editingCamaId, datos);
        } else {
            const camaId = nombre.toLowerCase().replace(/\s+/g, '_');
            await crearCama(camaId, datos);
        }
        closeModal('bedModal');
        mostrarToast('Mesa guardada', 'green');
        await iniciarHuerto();
    } catch (e) {
        console.error('[main] Error guardando mesa:', e);
        mostrarToast(e.message || 'No se pudo guardar la mesa', 'red');
    } finally {
        saveBedBtn.disabled = false;
    }
}

async function handleDeleteBed() {
    if (!editingCamaId) return;
    if (!window.confirm('¿Seguro que deseas eliminar esta mesa?')) return;

    deleteBedBtn.disabled = true;
    try {
        await eliminarCama(editingCamaId);
        closeModal('bedModal');
        mostrarToast('Mesa eliminada', 'green');
        await iniciarHuerto();
    } catch (e) {
        console.error('[main] Error eliminando mesa:', e);
        mostrarToast('No se pudo eliminar la mesa', 'red');
    } finally {
        deleteBedBtn.disabled = false;
    }
}

// ── Eventos del modal ──────────────────────────────────────────────

addBedBtn.addEventListener('click', openAddBed);
bedModalClose.addEventListener('click', () => closeModal('bedModal'));
bedModalCancel.addEventListener('click', () => closeModal('bedModal'));
saveBedBtn.addEventListener('click', handleSaveBed);
deleteBedBtn.addEventListener('click', handleDeleteBed);

bedPlantSelect.addEventListener('change', () => {
    plantDateFields.style.display = bedPlantSelect.value ? 'block' : 'none';
});

soilNInput.addEventListener('input', () => { soilNVal.textContent = Number(soilNInput.value).toFixed(1); });
soilPInput.addEventListener('input', () => { soilPVal.textContent = Number(soilPInput.value).toFixed(1); });
soilKInput.addEventListener('input', () => { soilKVal.textContent = Number(soilKInput.value).toFixed(1); });

// Delegación de eventos: gardenGridEl se re-crea por completo en cada
// renderMapaHuerto(), así que un listener por mesa se perdería en cada
// refresco. Un solo listener en el contenedor (que nunca se reemplaza)
// sobrevive a los re-renders.
gardenGridEl.addEventListener('click', (e) => {
    const bed = e.target.closest('.bed');
    if (!bed) return;
    openEditBed(bed.dataset.bedId);
});

// ── Asistente IA ───────────────────────────────────────────────────

function toggleAI() {
    const abierto = aiBody.classList.toggle('open');
    aiToggleIcon.textContent = abierto ? '▼' : '▲';
}

function agregarMensajeAI(texto, tipo) {
    const msg = document.createElement('div');
    msg.className = `ai-msg ${tipo}`;
    msg.textContent = texto;
    aiMessages.appendChild(msg);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return msg;
}

async function handleSendAI() {
    const mensaje = aiInput.value.trim();
    if (!mensaje) return;

    agregarMensajeAI(mensaje, 'user');
    aiInput.value = '';

    const loading = agregarMensajeAI('Pensando…', 'loading');
    try {
        const respuesta = await generarRespuestaHuerto(mensaje, {
            catalogo: catalogoActual,
            camas: camasActuales
        });
        loading.remove();
        agregarMensajeAI(respuesta, 'ai');
    } catch (e) {
        console.error('[main] Error del asistente IA:', e);
        loading.remove();
        agregarMensajeAI('No pude responder en este momento.', 'ai');
    }
}

function handleAiOverview() {
    if (!aiBody.classList.contains('open')) toggleAI();
    aiInput.value = 'Dame un resumen del estado de las mesas';
    handleSendAI();
}

aiToggleEl.addEventListener('click', toggleAI);
aiSendBtn.addEventListener('click', handleSendAI);
aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendAI();
});
aiOverviewBtn.addEventListener('click', handleAiOverview);

// ── Estado de sesión (portero) ───────────────────────────────────

AuthService.init((user) => {
    if (user) {
        setUsuarioActual(user);
        loginOverlay.classList.add('hidden');
        appRoot.classList.remove('app-hidden');
        mostrarErrorLogin('');
        emailInput.value = '';
        passwordInput.value = '';

        statusDot.classList.add('online');
        statusDot.classList.remove('error');
        statusText.textContent = `Conectado · ${user.email}`;
        iniciarHuerto();
    } else {
        setUsuarioActual(null);
        loginOverlay.classList.remove('hidden');
        appRoot.classList.add('app-hidden');

        statusDot.classList.remove('online');
        statusText.textContent = 'Sin sesión';
    }
});
