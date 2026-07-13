// js/main.js
// Orquestador de arranque + bridge de UI + router SPA (Fase 13). Escucha
// 'auth:resuelto' (emitido por auth.js — ver contrato documentado ahí) en
// vez de recibir un callback; decide desde ahí si muestra #login-overlay
// o navega a una vista. #appRoot y sus modales de mesa/config (bed/config)
// siguen existiendo intactos mientras Mapa/Catálogos/Admin se migran al
// sistema de vistas uno por uno — por ahora #appRoot queda oculto de
// forma permanente, no lo muestra nada. Tareas (Fase 13.5) ya se migró
// por completo: choresModal no existe más, es view-tareas + un modal
// pequeño (crearTareaModal) solo para crear.
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
import {
    obtenerCatalogo, obtenerCamas, crearCama, actualizarCama, eliminarCama,
    crearCatalogo, actualizarCatalogo, eliminarCatalogo,
    obtenerQuimicos, crearQuimico, actualizarQuimico, eliminarQuimico,
    obtenerInventario, crearInventario, actualizarInventario, eliminarInventario,
    obtenerRegistroActividad,
    marcarParaSemilla
} from './db.js';
import {
    renderCatalogo, renderMapaHuerto, renderListaTareas, renderListaCatalogos,
    renderRegistroActividad, renderResumenHoras, emojiDePlanta
} from './render.js';
import { renderEspiralSVG, calcularEstadoFicha } from './render-spiral-2d.js';
import { generarRespuestaHuerto } from './ai.js';
import { setUsuarioActual } from './session.js';
import { obtenerTareas, crearTarea, completarTarea, obtenerProximaTarea } from './chores.js';
import { obtenerUsuario, registrarUsuario, obtenerDirectorioEstudiantes, ajustarHoras, actualizarRolPropio } from './usuarios.js';

const statusDot   = document.getElementById('statusDot');
const statusText  = document.getElementById('statusText');
const toast       = document.getElementById('toast');
const plantListEl  = document.getElementById('plantList');
const gardenGridEl = document.getElementById('gardenGrid');
const gemeloMapaContainer = document.getElementById('gemeloMapaContainer');

const detallePlantaModalClose = document.getElementById('detallePlantaModalClose');
const detallePlantaTitulo    = document.getElementById('detallePlantaTitulo');
const detallePlantaEstado    = document.getElementById('detallePlantaEstado');
const detallePlantaFecha     = document.getElementById('detallePlantaFecha');
const detallePlantaProgreso  = document.getElementById('detallePlantaProgreso');
const detallePlantaPlagas    = document.getElementById('detallePlantaPlagas');
const detallePlantaSemillaBtn    = document.getElementById('detallePlantaSemillaBtn');
const detallePlantaCompletarBtn  = document.getElementById('detallePlantaCompletarBtn');

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

// ── Vista de Catálogos (Fase 13.6b) ─────────────────────────────────
const catalogosLista      = document.getElementById('catalogosLista');
const catalogosBusqueda   = document.getElementById('catalogosBusqueda');
const agregarCatalogoBtn  = document.getElementById('agregarCatalogoBtn');
const catalogosTabs       = document.querySelectorAll('#view-catalogos .filter-tab');

// ── Vista de Perfil (Fase 13.7) ──────────────────────────────────────
const perfilEmail             = document.getElementById('perfilEmail');
const perfilRolTexto          = document.getElementById('perfilRolTexto');
const perfilHoras             = document.getElementById('perfilHoras');
const perfilRolSelectorGroup  = document.getElementById('perfilRolSelectorGroup');
const perfilRolSelect         = document.getElementById('perfilRolSelect');
const perfilGuardarRolBtn     = document.getElementById('perfilGuardarRolBtn');
const perfilLogoutBtn         = document.getElementById('perfilLogoutBtn');

const semillaModalClose  = document.getElementById('semillaModalClose');
const semillaModalTitle  = document.getElementById('semillaModalTitle');
const semillaNombreInput = document.getElementById('semillaNombreInput');
const semillaTipoInput   = document.getElementById('semillaTipoInput');
const semillaDiasInput   = document.getElementById('semillaDiasInput');
const semillaSaveBtn     = document.getElementById('semillaSaveBtn');

const quimicoModalClose  = document.getElementById('quimicoModalClose');
const quimicoModalTitle  = document.getElementById('quimicoModalTitle');
const quimicoNombreInput = document.getElementById('quimicoNombreInput');
const quimicoNotasInput  = document.getElementById('quimicoNotasInput');
const quimicoSaveBtn     = document.getElementById('quimicoSaveBtn');

const herramientaModalClose    = document.getElementById('herramientaModalClose');
const herramientaModalTitle    = document.getElementById('herramientaModalTitle');
const herramientaNombreInput   = document.getElementById('herramientaNombreInput');
const herramientaCantidadInput = document.getElementById('herramientaCantidadInput');
const herramientaSaveBtn       = document.getElementById('herramientaSaveBtn');

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

// ── Vista de Tareas (Fase 13.5 — ya no es modal) ────────────────────
const openChoresBtn      = document.getElementById('openChoresBtn');
const tareasListaVista    = document.getElementById('tareasListaVista');
const crearTareaBtn       = document.getElementById('crearTareaBtn');
const tareasFilterTabs    = document.querySelectorAll('#view-tareas .filter-tab');

// Modal pequeño "Crear Tarea" (solo admin) — Tareas en sí es una vista.
const crearTareaModalClose = document.getElementById('crearTareaModalClose');
const crearTareaTitulo      = document.getElementById('crearTareaTitulo');
const crearTareaAssignees   = document.getElementById('crearTareaAssignees');
const crearTareaSaveBtn     = document.getElementById('crearTareaSaveBtn');

// ── Panel de Admin ─────────────────────────────────────────────────
const adminBtn          = document.getElementById('adminBtn');
const adminModalClose   = document.getElementById('adminModalClose');
const adminStudentSelect = document.getElementById('adminStudentSelect');
const adminHoursInput    = document.getElementById('adminHoursInput');
const adminHoursMotivo   = document.getElementById('adminHoursMotivo');
const adminSaveBtn       = document.getElementById('adminSaveBtn');

// ── Vista de Admin (Fase 13.8) ───────────────────────────────────────
const abrirAjusteHorasBtn = document.getElementById('abrirAjusteHorasBtn');
const resumenHorasBody     = document.getElementById('resumenHorasBody');
const registroActividadBody = document.getElementById('registroActividadBody');

let catalogoActual    = [];
let camasActuales     = [];
let tareasActuales    = [];
let estudiantesActuales = [];
let editingCamaId     = null;
// perfil.rol vive en Firestore (usuarios/{uid}), no en el usuario de
// Firebase Auth que guarda session.js — se cachea aquí porque openEditBed()
// necesita saberlo y no tiene acceso al `perfil` local del portero.
let esAdminActual     = false;

let quimicosActuales    = [];
let inventarioActual    = [];
let tabCatalogosActual  = 'semillas'; // 'semillas' | 'quimicos' | 'herramientas'
let editandoCatalogoId  = null;

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
    crearTareaBtn.style.display = esAdmin ? '' : 'none';
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

        // renderEspiralSVG filtra internamente a arco/circular — se le pasa
        // `camas` completo, mismo dato ya cargado arriba (sin una segunda
        // ida a Firestore).
        renderEspiralSVG(gemeloMapaContainer, camas, catalogo, {
            onClickCama: (cama) => {
                // mostrarDetalleCama no existe todavía (ver PASO A) — la
                // vista de detalle de CAMA completa queda pendiente.
                mostrarToast(`Detalle de "${cama.nombre || cama.id}" — pendiente de construir`, '');
            },
            onClickPlanta: (cama, plantaEntry) => abrirDetallePlanta(cama, plantaEntry)
        });
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

openChoresBtn.addEventListener('click', irAVistaTareas);

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

// ── Vista de Tareas (Fase 13.5) ─────────────────────────────────────
// Ya no es modal — es destino de navegación recurrente. "Crear" sigue
// siendo un modal puntual (crearTareaModal), solo visible para admin.

let filtroTareasActual = 'mias';

function irAVistaTareas() {
    navegarA('view-tareas');
    cargarYRenderizarVistaTareas();
}

async function cargarYRenderizarVistaTareas() {
    try {
        const [tareas, estudiantes] = await Promise.all([obtenerTareas(), obtenerDirectorioEstudiantes()]);
        tareasActuales = tareas;
        estudiantesActuales = estudiantes;
        renderizarVistaTareas();
    } catch (e) {
        console.error('[main] Error cargando tareas:', e);
        mostrarToast('No se pudieron cargar las tareas', 'red');
    }
}

// Re-filtra/re-pinta con lo ya cacheado — no vuelve a pedir a Firestore
// (lo usan las pestañas de filtro, que solo cambian qué se muestra, no
// qué existe).
function renderizarVistaTareas() {
    const uid = AuthService.getCurrentUser()?.uid;
    const tareasFiltradas = filtroTareasActual === 'mias'
        ? tareasActuales.filter((t) => (t.asignados || []).includes(uid))
        : tareasActuales;

    // Denormalización de nombres para pintar (mismo patrón que
    // plantaNombre/plantaTipo en camas) — render.js no conoce el
    // directorio de usuarios, solo recibe los nombres ya resueltos.
    const estudiantesPorUid = new Map(estudiantesActuales.map((e) => [e.id, e.email]));
    const tareasEnriquecidas = tareasFiltradas.map((t) => ({
        ...t,
        asignadosNombres: (t.asignados || []).map((uid2) => estudiantesPorUid.get(uid2) || uid2)
    }));

    renderListaTareas(tareasEnriquecidas, tareasListaVista, handleCompletarTareaVista, { esAdmin: esAdminActual });
}

tareasFilterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        filtroTareasActual = tab.dataset.filtro;
        tareasFilterTabs.forEach((t) => t.classList.toggle('active', t === tab));
        renderizarVistaTareas();
    });
});

async function handleCompletarTareaVista(tareaId) {
    const tarea = tareasActuales.find((t) => t.id === tareaId);
    if (!tarea) return;

    // Deshabilita el botón específico (no un estado global) mientras la
    // escritura está en vuelo, para que un doble clic no dispare la
    // Regla del Sábado dos veces sobre la misma tarea.
    const li = tareasListaVista.querySelector(`[data-tarea-id="${tareaId}"]`);
    const boton = li?.querySelector('.chore-complete-btn');
    if (boton) boton.disabled = true;

    try {
        await completarTarea(tareaId, tarea.asignados || []);
        mostrarToast('Tarea completada', 'green');
        await cargarYRenderizarVistaTareas();
    } catch (e) {
        console.error('[main] Error completando tarea:', e);
        mostrarToast('No se pudo completar la tarea', 'red');
        if (boton) boton.disabled = false;
    }
}

// ── Modal "Crear Tarea" (admin) ─────────────────────────────────────
// Reutiliza el mismo patrón de chips que ya existía para el selector de
// estudiantes (checkbox + email, ver Fase 11).

function poblarAssigneesCrearTarea() {
    crearTareaAssignees.replaceChildren();
    estudiantesActuales.forEach((estudiante) => {
        const label = document.createElement('label');
        label.className = 'chore-assignee-chip';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = estudiante.id;

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(estudiante.email));

        crearTareaAssignees.appendChild(label);
    });
}

function abrirCrearTareaModal() {
    // estudiantesActuales ya está fresco: este botón solo es visible
    // dentro de view-tareas, que siempre se recarga al entrar.
    crearTareaTitulo.value = '';
    poblarAssigneesCrearTarea();
    openModal('crearTareaModal');
}

async function handleCrearTareaGuardar() {
    const titulo = crearTareaTitulo.value.trim();
    if (!titulo) {
        mostrarToast('La tarea necesita un título', 'red');
        return;
    }

    const asignados = Array.from(crearTareaAssignees.querySelectorAll('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value);

    if (asignados.length === 0) {
        mostrarToast('Selecciona al menos un estudiante', 'red');
        return;
    }

    crearTareaSaveBtn.disabled = true;
    try {
        await crearTarea({ titulo, asignados });
        closeModal('crearTareaModal');
        mostrarToast('Tarea creada', 'green');
        await cargarYRenderizarVistaTareas();
    } catch (e) {
        console.error('[main] Error creando tarea:', e);
        mostrarToast('No se pudo crear la tarea', 'red');
    } finally {
        crearTareaSaveBtn.disabled = false;
    }
}

crearTareaBtn.addEventListener('click', abrirCrearTareaModal);
crearTareaModalClose.addEventListener('click', () => closeModal('crearTareaModal'));
crearTareaSaveBtn.addEventListener('click', handleCrearTareaGuardar);

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

adminBtn.addEventListener('click', irAVistaAdmin);
adminModalClose.addEventListener('click', () => closeModal('adminModal'));
adminSaveBtn.addEventListener('click', handleAdminSave);

// ── Vista de Catálogos (Fase 13.6b) ─────────────────────────────────
//
// Asimetría real de permisos (matriz de RBAC del equipo, no una
// simplificación): Semillas y Químicos → cualquier autenticado
// edita/crea, solo admin elimina. Herramientas (inventario_general) →
// solo admin en los tres verbos, sin excepción — un no-admin ahí es de
// solo lectura completa.
//
// "Herramientas" filtra inventario_general por categoria==='herramienta'
// EN EL CLIENTE, sobre el resultado completo de obtenerInventario() — no
// hay query separada. Razonable hoy (colección vacía, sin volumen); si
// inventario_general crece mucho, esto debería moverse a un
// where('categoria','==','herramienta') en la query.
//
// Búsqueda por nombre: client-side sobre lo ya cargado en memoria, sin
// query nueva por tecleo.

function irAVistaCatalogos() {
    navegarA('view-catalogos');
    cargarYRenderizarVistaCatalogos();
}

async function cargarYRenderizarVistaCatalogos() {
    try {
        const [semillas, quimicos, inventario] = await Promise.all([
            obtenerCatalogo(), obtenerQuimicos(), obtenerInventario()
        ]);
        catalogoActual   = semillas;
        quimicosActuales = quimicos;
        inventarioActual = inventario;
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[main] Error cargando catálogos:', e);
        mostrarToast('No se pudieron cargar los catálogos', 'red');
    }
}

function renderizarVistaCatalogos() {
    const termino = catalogosBusqueda.value.trim().toLowerCase();

    let items, puedeEditar, puedeCrear, puedeEliminar;

    if (tabCatalogosActual === 'semillas') {
        items = catalogoActual;
        puedeEditar = true;
        puedeCrear = true;
        puedeEliminar = esAdminActual;
    } else if (tabCatalogosActual === 'quimicos') {
        items = quimicosActuales;
        puedeEditar = true;
        puedeCrear = true;
        puedeEliminar = esAdminActual;
    } else {
        // Herramientas: solo-admin en los tres verbos, sin excepción.
        items = inventarioActual.filter((i) => i.categoria === 'herramienta');
        puedeEditar = esAdminActual;
        puedeCrear = esAdminActual;
        puedeEliminar = esAdminActual;
    }

    const filtrados = termino
        ? items.filter((i) => (i.nombre || '').toLowerCase().includes(termino))
        : items;

    agregarCatalogoBtn.style.display = puedeCrear ? '' : 'none';

    renderListaCatalogos(tabCatalogosActual, filtrados, catalogosLista, {
        puedeEditar,
        puedeEliminar,
        onEditar: abrirEditarCatalogoModal,
        onEliminar: handleEliminarCatalogoItem
    });
}

catalogosTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        tabCatalogosActual = tab.dataset.tabCatalogo;
        catalogosTabs.forEach((t) => t.classList.toggle('active', t === tab));
        renderizarVistaCatalogos();
    });
});

catalogosBusqueda.addEventListener('input', renderizarVistaCatalogos);

agregarCatalogoBtn.addEventListener('click', () => {
    editandoCatalogoId = null;
    if (tabCatalogosActual === 'semillas') {
        semillaModalTitle.textContent = 'Agregar Semilla';
        semillaNombreInput.value = '';
        semillaTipoInput.value = '';
        semillaDiasInput.value = '';
        openModal('semillaModal');
    } else if (tabCatalogosActual === 'quimicos') {
        quimicoModalTitle.textContent = 'Agregar Químico';
        quimicoNombreInput.value = '';
        quimicoNotasInput.value = '';
        openModal('quimicoModal');
    } else {
        herramientaModalTitle.textContent = 'Agregar Herramienta';
        herramientaNombreInput.value = '';
        herramientaCantidadInput.value = '';
        openModal('herramientaModal');
    }
});

function abrirEditarCatalogoModal(tipo, itemId) {
    editandoCatalogoId = itemId;

    if (tipo === 'semillas') {
        const item = catalogoActual.find((i) => i.id === itemId);
        if (!item) return;
        semillaModalTitle.textContent = 'Editar Semilla';
        semillaNombreInput.value = item.nombre || '';
        semillaTipoInput.value = item.tipo || '';
        semillaDiasInput.value = item.dias_siembra_a_cosecha ?? '';
        openModal('semillaModal');
    } else if (tipo === 'quimicos') {
        const item = quimicosActuales.find((i) => i.id === itemId);
        if (!item) return;
        quimicoModalTitle.textContent = 'Editar Químico';
        quimicoNombreInput.value = item.nombre || '';
        quimicoNotasInput.value = item.notas_uso || '';
        openModal('quimicoModal');
    } else {
        const item = inventarioActual.find((i) => i.id === itemId);
        if (!item) return;
        herramientaModalTitle.textContent = 'Editar Herramienta';
        herramientaNombreInput.value = item.nombre || '';
        herramientaCantidadInput.value = item.cantidad ?? '';
        openModal('herramientaModal');
    }
}

async function handleEliminarCatalogoItem(tipo, itemId) {
    if (!window.confirm('¿Seguro que deseas eliminar este elemento?')) return;

    try {
        if (tipo === 'semillas') {
            await eliminarCatalogo(itemId);
            catalogoActual = await obtenerCatalogo();
        } else if (tipo === 'quimicos') {
            await eliminarQuimico(itemId);
            quimicosActuales = await obtenerQuimicos();
        } else {
            await eliminarInventario(itemId);
            inventarioActual = await obtenerInventario();
        }
        mostrarToast('Eliminado', 'green');
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[main] Error eliminando del catálogo:', e);
        mostrarToast('No se pudo eliminar', 'red');
    }
}

async function handleGuardarSemilla() {
    const nombre = semillaNombreInput.value.trim();
    if (!nombre) {
        mostrarToast('El nombre es obligatorio', 'red');
        return;
    }

    // Solo estos 3 campos top-level — nunca se toca requerimientos ni
    // condiciones_optimas desde aquí. updateDoc es merge parcial: al no
    // incluir esas claves, quedan intactas. Si algún día se agregan al
    // formulario, hay que mandar el objeto anidado COMPLETO (Firestore
    // reemplaza el valor entero de una clave anidada, no hace deep-merge),
    // o se repetiría el mismo bug que ya evitamos con `categoria`.
    const datos = {
        nombre,
        tipo: semillaTipoInput.value.trim(),
        dias_siembra_a_cosecha: semillaDiasInput.value ? Number(semillaDiasInput.value) : null
    };

    semillaSaveBtn.disabled = true;
    try {
        if (editandoCatalogoId) {
            await actualizarCatalogo(editandoCatalogoId, datos);
        } else {
            await crearCatalogo(datos);
        }
        closeModal('semillaModal');
        mostrarToast('Semilla guardada', 'green');
        catalogoActual = await obtenerCatalogo(); // también refresca el <select> de plantas del modal de mesa
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[main] Error guardando semilla:', e);
        mostrarToast(e.message || 'No se pudo guardar', 'red');
    } finally {
        semillaSaveBtn.disabled = false;
    }
}

async function handleGuardarQuimico() {
    const nombre = quimicoNombreInput.value.trim();
    if (!nombre) {
        mostrarToast('El nombre es obligatorio', 'red');
        return;
    }

    const datos = { nombre, notas_uso: quimicoNotasInput.value.trim() };

    quimicoSaveBtn.disabled = true;
    try {
        if (editandoCatalogoId) {
            await actualizarQuimico(editandoCatalogoId, datos);
        } else {
            await crearQuimico(datos);
        }
        closeModal('quimicoModal');
        mostrarToast('Químico guardado', 'green');
        quimicosActuales = await obtenerQuimicos();
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[main] Error guardando químico:', e);
        mostrarToast(e.message || 'No se pudo guardar', 'red');
    } finally {
        quimicoSaveBtn.disabled = false;
    }
}

async function handleGuardarHerramienta() {
    const nombre = herramientaNombreInput.value.trim();
    if (!nombre) {
        mostrarToast('El nombre es obligatorio', 'red');
        return;
    }

    const cantidad = herramientaCantidadInput.value ? Number(herramientaCantidadInput.value) : null;

    herramientaSaveBtn.disabled = true;
    try {
        if (editandoCatalogoId) {
            // NUNCA se manda `categoria` aquí — este formulario no ofrece
            // cambiarla, y esta pestaña ya filtra por categoria==='herramienta'.
            // Omitirla del payload (en vez de reenviar el valor actual)
            // es la forma más segura: aunque cargar mal el valor actual
            // fuera un bug, no habría forma de que ese bug pise la
            // categoría real, porque la clave ni siquiera está presente.
            await actualizarInventario(editandoCatalogoId, { nombre, cantidad });
        } else {
            await crearInventario({ nombre, cantidad, categoria: 'herramienta' });
        }
        closeModal('herramientaModal');
        mostrarToast('Herramienta guardada', 'green');
        inventarioActual = await obtenerInventario();
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[main] Error guardando herramienta:', e);
        mostrarToast(e.message || 'No se pudo guardar', 'red');
    } finally {
        herramientaSaveBtn.disabled = false;
    }
}

semillaModalClose.addEventListener('click', () => closeModal('semillaModal'));
semillaSaveBtn.addEventListener('click', handleGuardarSemilla);

quimicoModalClose.addEventListener('click', () => closeModal('quimicoModal'));
quimicoSaveBtn.addEventListener('click', handleGuardarQuimico);

herramientaModalClose.addEventListener('click', () => closeModal('herramientaModal'));
herramientaSaveBtn.addEventListener('click', handleGuardarHerramienta);

// ── Vista de Perfil (Fase 13.7) ─────────────────────────────────────
//
// A diferencia de Tareas/Catálogos, esta vista SÍ hace una query nueva al
// entrar (obtenerUsuario) — no había ningún caché de rol/horasTotales en
// memoria que reutilizar (verificado: ningún widget del Dashboard lee
// horasTotales hoy). Es una sola lectura de documento, no una query cara.

function irAVistaPerfil() {
    navegarA('view-perfil');
    cargarYRenderizarVistaPerfil();
}

async function cargarYRenderizarVistaPerfil() {
    const user = AuthService.getCurrentUser();
    if (!user) return;

    perfilEmail.textContent = user.email;

    try {
        const perfil = await obtenerUsuario(user.uid);
        if (!perfil) return; // no debería pasar — si estás en Dashboard, ya tienes perfil.

        perfilRolTexto.textContent = perfil.rol;
        perfilHoras.textContent = `${perfil.horasTotales ?? 0} horas`;

        // Un admin nunca se auto-degrada desde aquí — ese cambio, si algún
        // día hace falta, lo hace OTRO admin, no autoservicio.
        if (perfil.rol === 'admin') {
            perfilRolSelectorGroup.style.display = 'none';
        } else {
            perfilRolSelectorGroup.style.display = '';
            perfilRolSelect.value = perfil.rol;
        }
    } catch (e) {
        console.error('[main] Error cargando el perfil:', e);
        mostrarToast('No se pudo cargar tu perfil', 'red');
    }
}

async function handleGuardarRolPropio() {
    const nuevoRol = perfilRolSelect.value;
    const user = AuthService.getCurrentUser();
    if (!user) return;

    perfilGuardarRolBtn.disabled = true;
    try {
        await actualizarRolPropio(user.uid, nuevoRol);
        mostrarToast('Rol actualizado', 'green');
        await cargarYRenderizarVistaPerfil();
    } catch (e) {
        console.error('[main] Error actualizando rol:', e);
        mostrarToast(e.message || 'No se pudo actualizar el rol', 'red');
    } finally {
        perfilGuardarRolBtn.disabled = false;
    }
}

perfilGuardarRolBtn.addEventListener('click', handleGuardarRolPropio);
perfilLogoutBtn.addEventListener('click', () => AuthService.logout());

// ── Vista de Admin (Fase 13.8) ──────────────────────────────────────
//
// "Quién" en el registro de actividad usa entrada.usuario directo (ya es
// el email, guardado por cada _logActividad) — no resuelve contra
// obtenerDirectorioEstudiantes(), que además no tendría a los admins.

function irAVistaAdmin() {
    navegarA('view-admin');
    cargarYRenderizarVistaAdmin();
}

async function cargarYRenderizarVistaAdmin() {
    try {
        const [registro, estudiantes] = await Promise.all([
            obtenerRegistroActividad(50),
            obtenerDirectorioEstudiantes()
        ]);
        renderRegistroActividad(registro, registroActividadBody);
        renderResumenHoras(estudiantes, resumenHorasBody);
    } catch (e) {
        console.error('[main] Error cargando el panel de Admin:', e);
        mostrarToast('No se pudo cargar el panel de Admin', 'red');
    }
}

// Reutiliza el adminModal existente (Fase 13.2) sin tocar su lógica
// interna — solo cambia de dónde se abre.
abrirAjusteHorasBtn.addEventListener('click', abrirAdminModal);

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
    if (btn.dataset.vista === 'view-tareas') {
        irAVistaTareas();
        return;
    }
    if (btn.dataset.vista === 'view-catalogos') {
        irAVistaCatalogos();
        return;
    }
    if (btn.dataset.vista === 'view-perfil') {
        irAVistaPerfil();
        return;
    }
    if (btn.dataset.vista === 'view-admin') {
        irAVistaAdmin();
        return;
    }
    navegarA(btn.dataset.vista);
});

// ── Detalle de planta en espiral (PASO D) ───────────────────────────
// { cama, plantaEntry } de la tarjeta actualmente abierta, o null — los
// handlers de los botones lo necesitan para saber sobre qué instanciaId
// actuar sin volver a buscarlo en el DOM.
let detalleActual = null;

const NOMBRE_ESTADO_PLANTA = {
    semilla:     'Marcada para semilla',
    'sin-datos': 'Sin datos de ciclo de cultivo',
    atrasada:    'Atrasada',
    creciendo:   'Creciendo'
};

// NPK (cama.suelo) NO se muestra aquí a propósito — fuera de alcance hasta
// que exista un sistema real de riesgo nutricional (ver comentario del
// modal en index.html).
function abrirDetallePlanta(cama, plantaEntry) {
    detalleActual = { cama, plantaEntry };

    const infoCatalogo = catalogoActual.find((p) => p.id === plantaEntry.plantaId);
    // Mismo Map por-llamada que arma renderEspiralSVG internamente — no hay
    // caché compartida porque catalogoActual puede haber cambiado entre
    // renders y este Map es barato de reconstruir.
    const catalogoPorId = new Map(catalogoActual.map((p) => [p.id, p]));
    const estadoInfo = calcularEstadoFicha(plantaEntry, catalogoPorId);

    detallePlantaTitulo.textContent = `${emojiDePlanta(plantaEntry.plantaTipo)} ${infoCatalogo?.nombre || plantaEntry.plantaId}`;
    detallePlantaEstado.textContent = NOMBRE_ESTADO_PLANTA[estadoInfo.estado];
    // estadoInfo.color ya es un valor CSS válido tal cual (hex o var(...)) —
    // mismo valor que usa el anillo de progreso en render-spiral-2d.js.
    detallePlantaEstado.style.color = estadoInfo.color;

    detallePlantaFecha.textContent = `Sembrada: ${plantaEntry.fechaSiembra}`;

    if (estadoInfo.estado === 'sin-datos') {
        // El campo de estado ya dice "Sin datos de ciclo de cultivo" —
        // mostrar un segundo texto aquí con otras palabras sería el mismo
        // dato dos veces, no información nueva. Se oculta, mismo criterio
        // que detallePlantaPlagas.
        detallePlantaProgreso.style.display = 'none';
    } else if (estadoInfo.diasTranscurridos != null) {
        detallePlantaProgreso.textContent = `${estadoInfo.diasTranscurridos} de ${estadoInfo.diasSiembraACosecha} días`;
        detallePlantaProgreso.style.display = '';
    } else {
        // estado 'semilla': calcularEstadoFicha tampoco calcula progreso
        // aquí (el anillo no lo necesita — "sin importar cuánto haya
        // pasado"), pero por una razón DISTINTA a 'sin-datos' (sí hay
        // dias_siembra_a_cosecha en el catálogo, solo no se usó). Se oculta
        // igual por ahora — no pedido explícitamente, señalado en el chat.
        detallePlantaProgreso.style.display = 'none';
    }

    if (cama.plagas) {
        detallePlantaPlagas.textContent = `🐛 Plagas en esta cama: ${cama.plagas}`;
        detallePlantaPlagas.style.display = '';
    } else {
        detallePlantaPlagas.style.display = 'none';
    }

    const marcadaParaSemilla = (plantaEntry.finalidad || 'cosecha') === 'semilla';
    detallePlantaSemillaBtn.textContent = marcadaParaSemilla ? '🔙 Volver a modo cosecha' : '🌰 Marcar para semilla';

    openModal('detallePlantaModal');
}

detallePlantaModalClose.addEventListener('click', () => closeModal('detallePlantaModal'));

detallePlantaSemillaBtn.addEventListener('click', async () => {
    if (!detalleActual) return;
    const { cama, plantaEntry } = detalleActual;

    detallePlantaSemillaBtn.disabled = true;
    try {
        await marcarParaSemilla(cama.id, plantaEntry.instanciaId);
        // Refresca camasActuales/catalogoActual y vuelve a pintar ambos
        // mapas (rectangular + espiral) — mismo patrón que handleSaveBed.
        // closeModal va DESPUÉS de este await, no antes: el usuario debe
        // ver el modal cerrarse ya con la espiral actualizada detrás, no
        // con la ficha vieja (badge rojo, etc.) todavía visible durante el
        // round-trip — mismo cuidado que ya aplicamos con el parpadeo
        // Splash/Dashboard y el disabled de botones en escrituras en vuelo.
        await iniciarHuerto();
        closeModal('detallePlantaModal');
        mostrarToast('Actualizado', 'green');
    } catch (e) {
        console.error('[main] Error marcando para semilla:', e);
        mostrarToast('No se pudo actualizar la planta', 'red');
    } finally {
        detallePlantaSemillaBtn.disabled = false;
    }
});

// PASO E (formulario de cierre de cultivo) todavía no existe — mismo
// criterio de "hook, no lo construyas todavía" que onClickCama/onClickPlanta
// en render-spiral-2d.js.
detallePlantaCompletarBtn.addEventListener('click', () => {
    if (!detalleActual) return;
    console.info(
        '[main] Formulario de cierre de cultivo pendiente (PASO E):',
        detalleActual.cama.id, detalleActual.plantaEntry.instanciaId
    );
    mostrarToast('Cerrar cultivo: formulario pendiente (próxima fase)', '');
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
        crearTareaBtn.style.display = 'none';
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
