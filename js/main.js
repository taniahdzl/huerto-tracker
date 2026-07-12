// js/main.js
// Orquestador de arranque + bridge de UI + router SPA (Fase 13). Escucha
// 'auth:resuelto' (emitido por auth.js — ver contrato documentado ahí) en
// vez de recibir un callback; decide desde ahí si muestra #login-overlay
// o navega a una vista. #appRoot y sus modales (bed/config/chores/admin)
// siguen existiendo intactos mientras Mapa/Tareas/Admin se migran al
// sistema de vistas uno por uno — por ahora #appRoot queda oculto de
// forma permanente, no lo muestra nada.
//
// auth.js, db.js, usuarios.js, render.js y ai.js se mantienen puros (sin
// conocerse entre sí ni conocer el DOM) — auth.js SÍ importa usuarios.js
// ahora (nuevo, Fase 13) porque el contrato del evento exige `rol`
// resuelto en el payload; sigue sin tocar el DOM salvo dispatchEvent.
//
// TODO (fuera de alcance): drag&drop, cálculo de alertas de cosecha/riego,
// y el modal de Configuración (openConfig / configModal) — sigue sin
// implementar, y NO es una vista (VISTAS_ADMIN no lo incluye). El
// Asistente IA usa generarRespuestaHuerto() de ai.js, que hoy es un mock.

import { AuthService } from './auth.js';
import { obtenerCatalogo, obtenerCamas, crearCama, actualizarCama, eliminarCama } from './db.js';
import { renderCatalogo, renderMapaHuerto, renderListaTareas } from './render.js';
import { generarRespuestaHuerto } from './ai.js';
import { setUsuarioActual } from './session.js';
import { obtenerTareas, crearTarea, completarTarea, obtenerProximaTarea } from './chores.js';
import { registrarUsuario, obtenerDirectorioEstudiantes, ajustarHoras } from './usuarios.js';

const statusDot   = document.getElementById('statusDot');
const statusText  = document.getElementById('statusText');
const toast       = document.getElementById('toast');
const plantListEl  = document.getElementById('plantList');
const gardenGridEl = document.getElementById('gardenGrid');

const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn    = document.getElementById('googleLoginBtn');
const newUserRoleSelect = document.getElementById('newUserRole');
const completeRegistroBtn = document.getElementById('completeRegistroBtn');
const loginError    = document.getElementById('loginError');
const setupError    = document.getElementById('setupError');

// ── Dashboard (Fase 13) ─────────────────────────────────────────────
const dashboardUserEmail  = document.getElementById('dashboardUserEmail');
const dashboardAdminLink  = document.getElementById('dashboardAdminLink');
const dashboardQuicklinks = document.querySelector('.dashboard-quicklinks');
const dashboardProximaTareaTexto = document.getElementById('dashboardProximaTareaTexto');

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

// ── Modal de Tareas ────────────────────────────────────────────────
const openChoresBtn    = document.getElementById('openChoresBtn');
const choresModalClose = document.getElementById('choresModalClose');
const newChoreInput     = document.getElementById('newChoreInput');
const addChoreBtn       = document.getElementById('addChoreBtn');
const choresListEl       = document.getElementById('choresList');
const choreAssigneesEl   = document.getElementById('choreAssignees');
const choreFormEl        = document.querySelector('.chore-form');

// ── Panel de Admin ─────────────────────────────────────────────────
const adminBtn          = document.getElementById('adminBtn');
const adminModalClose   = document.getElementById('adminModalClose');
const adminStudentSelect = document.getElementById('adminStudentSelect');
const adminHoursInput    = document.getElementById('adminHoursInput');
const adminHoursMotivo   = document.getElementById('adminHoursMotivo');
const adminSaveBtn       = document.getElementById('adminSaveBtn');

let catalogoActual    = [];
let camasActuales     = [];
let tareasActuales    = [];
let estudiantesActuales = [];
let editingCamaId     = null;
// perfil.rol vive en Firestore (usuarios/{uid}), no en el usuario de
// Firebase Auth que guarda session.js — se cachea aquí porque openEditBed()
// necesita saberlo y no tiene acceso al `perfil` local del portero.
let esAdminActual     = false;

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

// ── Router SPA (Fase 13) ─────────────────────────────────────────────

const VISTAS_ADMIN = ['view-admin']; // view-config NO va aquí, sigue siendo modal

function navegarA(vistaId, params = null) {
    // Guard de UX — la seguridad real está en firestore.rules, esto solo
    // evita mostrar una pantalla cuyas queries van a fallar en silencio.
    if (VISTAS_ADMIN.includes(vistaId) && !esAdminActual) {
        vistaId = 'view-dashboard';
    }
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById(vistaId).classList.remove('hidden');
    if (params) {
        document.dispatchEvent(new CustomEvent('vista:params', { detail: { vistaId, params } }));
    }
}

// Para los casos en que lo que debe mostrarse es #login-overlay, no una
// vista — oculta TODAS las .view (incluida Splash) sin navegar "a" nada,
// para que Splash (z-index 3000) no tape el overlay (z-index 2000).
function ocultarTodasLasVistas() {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
}

// ── Login (Google Auth) ─────────────────────────────────────────────

const LOGIN_ERROR_MESSAGES = {
    'auth/popup-closed-by-user':     'Cerraste la ventana de Google antes de terminar.',
    'auth/cancelled-popup-request':  'Ya había una ventana de Google abierta.',
    'auth/popup-blocked':            'El navegador bloqueó la ventana emergente — permite popups para este sitio.',
    'auth/network-request-failed':   'Sin conexión. Revisa tu internet.'
};

function mostrarErrorLogin(mensaje) {
    if (!loginError) return;
    loginError.textContent = mensaje;
    loginError.style.display = mensaje ? 'block' : 'none';
}

// view-setup necesita su propio elemento de error — #loginError vive
// dentro de #login-overlay, que ya no se muestra durante el Setup
// (Fase 13.4). Escribir ahí sería un error invisible en un nodo oculto.
function mostrarErrorSetup(mensaje) {
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

// Entrada única al sistema de vistas — la usan tanto el listener de
// 'auth:resuelto' (login normal) como handleCompletarRegistro (justo
// después de crear el perfil, donde no hay re-disparo del evento porque
// registrar un documento en Firestore no cambia el estado de Firebase Auth).
function mostrarDashboard(user, esAdmin) {
    loginOverlay.classList.add('hidden');
    esAdminActual = esAdmin;
    adminBtn.style.display = esAdmin ? '' : 'none';
    choreFormEl.style.display = esAdmin ? '' : 'none';
    dashboardUserEmail.textContent = ` — ${user.email}`;
    dashboardAdminLink.style.display = esAdmin ? '' : 'none';

    statusDot.classList.add('online');
    statusDot.classList.remove('error');
    statusText.textContent = `Conectado · ${user.email}`;

    navegarA('view-dashboard');

    // catalogoActual/camasActuales alimentan el modal de mesa y el mapa
    // dentro de #appRoot, que sigue oculto pero cuyos botones de header
    // (+Mesa, Tareas, Admin) están fuera de #appRoot y son clicables
    // siempre. Sin esto, esos botones abren modales con datos vacíos.
    // Fire-and-forget: obtenerCatalogo()/obtenerCamas() son fetches
    // puntuales (getDocs, no onSnapshot — confirmado), así que no hay
    // riesgo de acumular listeners si mostrarDashboard() se llama más de
    // una vez en la misma sesión.
    iniciarHuerto();

    cargarProximaTarea(user.uid);
}

// Fire-and-forget, con su propio manejo de error — no debe tumbar
// mostrarDashboard() si obtenerProximaTarea() falla (ej. falta el índice
// compuesto en Firestore, ver nota en chores.js).
async function cargarProximaTarea(uid) {
    try {
        const tarea = await obtenerProximaTarea(uid);
        dashboardProximaTareaTexto.textContent = tarea ? tarea.titulo : 'Sin tareas pendientes';
    } catch (e) {
        console.error('[main] Error cargando la próxima tarea:', e);
        dashboardProximaTareaTexto.textContent = 'No se pudo cargar';
    }
}

async function handleCompletarRegistro() {
    const user = AuthService.getCurrentUser();
    if (!user) return;

    completeRegistroBtn.disabled = true;
    mostrarErrorSetup('');
    try {
        await registrarUsuario(user.uid, user.email, newUserRoleSelect.value);
        // El select de Setup solo ofrece estudiante/externo (bloqueante de
        // seguridad ya validado) — nunca puede dar 'admin' aquí. No hace
        // falta ocultar #roleSelection/#googleLoginBtn: mostrarDashboard()
        // navega a view-dashboard, y el router ya oculta view-setup.
        mostrarDashboard(user, false);
    } catch (e) {
        console.error('[main] Error registrando usuario:', e);
        mostrarErrorSetup('No se pudo completar el registro. Intenta de nuevo.');
    } finally {
        completeRegistroBtn.disabled = false;
    }
}

googleLoginBtn.addEventListener('click', handleLoginConGoogle);
completeRegistroBtn.addEventListener('click', handleCompletarRegistro);

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
        // renderMapaHuerto solo sabe dibujar el grid cartesiano — camas de
        // tipo 'arco'/'circular' no tienen col/fila y se dibujarían todas
        // apiladas en la celda 1,1. Se filtran aquí (no en render.js, que
        // se mantiene agnóstico a qué es un "tipo") hasta que exista el
        // renderer de espiral.
        const camasRectangulares = camas.filter((c) => (c.tipo || 'rectangular') === 'rectangular');
        renderMapaHuerto(camasRectangulares, gardenGridEl);
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
    // RBAC (Fase 12): camas_cosecha solo permite `delete` a admins.
    deleteBedBtn.style.display = esAdminActual ? '' : 'none';

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
        // El modal actual solo sabe crear/editar camas rectangulares.
        // Arco/circular llegan en una fase futura con su propio flujo.
        tipo: 'rectangular',
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

openChoresBtn.addEventListener('click', () => {
    openModal('choresModal');
    cargarYRenderizarTareas();
});
choresModalClose.addEventListener('click', () => closeModal('choresModal'));

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

// ── Tareas ─────────────────────────────────────────────────────────

// NOTA: esta función pinta DOM y por convención del proyecto debería vivir
// en render.js (así viven renderCatalogo/renderMapaHuerto/renderListaTareas).
// Se deja aquí porque fue instrucción explícita; si más adelante se quiere
// alinear con el resto, es un mover-y-exportar sin lógica que cambiar.
function renderizarSelectorEstudiantes() {
    choreAssigneesEl.replaceChildren();
    estudiantesActuales.forEach((estudiante) => {
        const label = document.createElement('label');
        label.className = 'chore-assignee-chip';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = estudiante.id;

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(estudiante.email));

        choreAssigneesEl.appendChild(label);
    });
}

async function cargarYRenderizarTareas() {
    try {
        const [tareas, estudiantes] = await Promise.all([obtenerTareas(), obtenerDirectorioEstudiantes()]);
        tareasActuales = tareas;
        estudiantesActuales = estudiantes;
        renderListaTareas(tareas, choresListEl, handleCompletarTarea);
        renderizarSelectorEstudiantes();
    } catch (e) {
        console.error('[main] Error cargando tareas:', e);
        mostrarToast('No se pudieron cargar las tareas', 'red');
    }
}

async function handleAddChore() {
    const titulo = newChoreInput.value.trim();
    if (!titulo) return;

    const asignados = Array.from(choreAssigneesEl.querySelectorAll('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value);

    addChoreBtn.disabled = true;
    try {
        await crearTarea({ titulo, asignados });
        newChoreInput.value = '';
        await cargarYRenderizarTareas(); // también re-renderiza el selector, ya sin marcar
    } catch (e) {
        console.error('[main] Error creando tarea:', e);
        mostrarToast('No se pudo crear la tarea', 'red');
    } finally {
        addChoreBtn.disabled = false;
    }
}

async function handleCompletarTarea(tareaId) {
    const tarea = tareasActuales.find((t) => t.id === tareaId);
    if (!tarea) return;

    try {
        await completarTarea(tareaId, tarea.asignados || []);
        mostrarToast('Tarea completada', 'green');
        await cargarYRenderizarTareas();
    } catch (e) {
        console.error('[main] Error completando tarea:', e);
        mostrarToast('No se pudo completar la tarea', 'red');
    }
}

addChoreBtn.addEventListener('click', handleAddChore);
newChoreInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddChore();
});

// ── Panel de Admin ─────────────────────────────────────────────────

function poblarSelectorAdmin() {
    adminStudentSelect.innerHTML = '<option value="">Selecciona un estudiante...</option>';
    estudiantesActuales.forEach((estudiante) => {
        const opt = document.createElement('option');
        opt.value = estudiante.id;
        opt.textContent = estudiante.email;
        adminStudentSelect.appendChild(opt);
    });
}

async function abrirAdminModal() {
    // No confío solo en el caché de estudiantesActuales (Fase 11): si un
    // admin abre este modal sin haber abierto antes el de Tareas, ese
    // caché sigue vacío y el selector se vería vacío también.
    try {
        estudiantesActuales = await obtenerDirectorioEstudiantes();
    } catch (e) {
        console.error('[main] Error cargando directorio de estudiantes:', e);
        mostrarToast('No se pudo cargar el directorio', 'red');
        return;
    }
    poblarSelectorAdmin();
    adminHoursInput.value = '';
    adminHoursMotivo.value = '';
    openModal('adminModal');
}

async function handleAdminSave() {
    const uid = adminStudentSelect.value;
    const horas = parseInt(adminHoursInput.value, 10);
    const motivo = adminHoursMotivo.value.trim();

    if (!uid) {
        mostrarToast('Selecciona un estudiante', 'red');
        return;
    }
    if (Number.isNaN(horas) || horas === 0) {
        mostrarToast('Ingresa un número de horas distinto de cero', 'red');
        return;
    }
    if (!motivo) {
        mostrarToast('El motivo es obligatorio', 'red');
        return;
    }

    adminSaveBtn.disabled = true;
    try {
        await ajustarHoras(uid, horas, motivo);
        closeModal('adminModal');
        mostrarToast('Horas ajustadas', 'green');
    } catch (e) {
        console.error('[main] Error ajustando horas:', e);
        mostrarToast(e.message || 'No se pudo ajustar las horas', 'red');
    } finally {
        adminSaveBtn.disabled = false;
    }
}

adminBtn.addEventListener('click', abrirAdminModal);
adminModalClose.addEventListener('click', () => closeModal('adminModal'));
adminSaveBtn.addEventListener('click', handleAdminSave);

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

// ── Accesos rápidos del Dashboard ─────────────────────────────────

dashboardQuicklinks.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vista]');
    if (!btn) return;
    navegarA(btn.dataset.vista);
});

// ── Estado de sesión — escucha 'auth:resuelto' (ver contrato en auth.js) ──
//
// Ya no hay callback pasado a AuthService.init(): el evento trae el
// payload completo (user, rol, error) y este listener decide a dónde ir.
// Los 4 casos del contrato, en el mismo orden que están documentados en
// auth.js: sin sesión / con sesión sin perfil / con sesión con perfil /
// error consultando el perfil.

document.addEventListener('auth:resuelto', (e) => {
    const { user, rol, error } = e.detail;

    // Caso 1: sin sesión. `rol` viene null pero NO significa "falta
    // Setup" — se distingue del caso 2 únicamente por `user` ser null.
    if (!user) {
        setUsuarioActual(null);
        esAdminActual = false;
        adminBtn.style.display = 'none';
        choreFormEl.style.display = '';
        googleLoginBtn.style.display = '';
        mostrarErrorLogin('');
        ocultarTodasLasVistas();
        loginOverlay.classList.remove('hidden');

        statusDot.classList.remove('online');
        statusText.textContent = 'Sin sesión';
        return;
    }

    setUsuarioActual(user);

    // Caso 4: error consultando el perfil. Se ve igual que el caso 2 en
    // user/rol — por eso `error` se revisa ANTES que `rol`, para no
    // mandar al flujo de Setup a alguien que sí tiene perfil pero no se
    // pudo leer por una falla transitoria (eso reescribiría su perfil).
    if (error) {
        console.error('[main] Error consultando el perfil:', error);
        mostrarErrorLogin('No se pudo verificar tu perfil. Intenta de nuevo.');
        ocultarTodasLasVistas();
        loginOverlay.classList.remove('hidden');
        return;
    }

    // Caso 2: con sesión, sin perfil — falta Setup. Migrado a view-setup
    // (Fase 13.4) — ya no reutiliza #login-overlay/#roleSelection.
    if (rol === null) {
        mostrarErrorSetup('');
        loginOverlay.classList.add('hidden');
        navegarA('view-setup');
        return;
    }

    // Caso 3: con sesión, con perfil resuelto.
    mostrarDashboard(user, rol === 'admin');
});

AuthService.init();
