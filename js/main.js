// js/main.js
// Orquestador de arranque + bridge de UI + router SPA (Fase 13). Escucha
// 'auth:resuelto' (emitido por auth.js — ver contrato documentado ahí) en
// vez de recibir un callback; decide desde ahí si muestra #login-overlay
// o navega a una vista. Tareas (Fase 13.5) ya se migró por completo:
// choresModal no existe más, es view-tareas + un modal pequeño
// (crearTareaModal) solo para crear.
//
// #appRoot (layout pre-SPA con camas tipo 'rectangular': grid cartesiano,
// bedModal) y todo su código de soporte se retiraron por completo en Fase
// 15 — ver diagnóstico. camas_cosecha sigue aceptando ese tipo en el
// esquema de Firestore (sin datos reales, confirmado en fases previas),
// solo ya no hay UI que lo cree/edite/pinte.
//
// auth.js, db.js, usuarios.js, render.js y ai.js se mantienen puros (sin
// conocerse entre sí ni conocer el DOM) — auth.js SÍ importa usuarios.js
// ahora (nuevo, Fase 13) porque el contrato del evento exige `rol`
// resuelto en el payload; sigue sin tocar el DOM salvo dispatchEvent.
//
// TODO (fuera de alcance): cálculo de alertas de cosecha/riego, y el modal
// de Configuración (openConfig / configModal) — sigue sin implementar, y
// NO es una vista (VISTAS_ADMIN no lo incluye). El Asistente IA (botón +
// panel) tiene su HTML retirado y sus listeners comentados desde Fase 15
// (vivían dentro de #appRoot) — generarRespuestaHuerto() (ai.js) sigue
// siendo un mock a propósito hasta que exista la Cloud Function que
// documenta su propio TODO; reconectar cuando ese backend exista.

import { AuthService } from './auth.js';
import {
    obtenerCatalogo, obtenerCamas,
    crearCatalogo, actualizarCatalogo, eliminarCatalogo,
    obtenerQuimicos, crearQuimico, actualizarQuimico, eliminarQuimico,
    obtenerInventario, crearInventario, actualizarInventario, eliminarInventario,
    obtenerRegistroActividad, extraerLinkIndice,
    marcarParaSemilla, agregarPlantaACama, crearHistorialCultivo,
    actualizarDetalleCama,
    obtenerBitacoraSesiones, crearBitacoraSesion, obtenerSesionConDetalle
} from './db.js';
import {
    renderListaTareas, renderListaCatalogos,
    renderRegistroActividad, renderResumenHoras, renderListaBitacora, emojiDePlanta,
    crearLeyendaCategorias
} from './render.js';
import { renderEspiralSVG, calcularEstadoFicha } from './render-spiral-2d.js';
import { generarRespuestaHuerto } from './ai.js';
import { setUsuarioActual, nombreParaMostrar } from './session.js';
import { obtenerTareas, crearTarea, completarTarea, obtenerTareasAsignadas } from './chores.js';
import { obtenerUsuario, registrarUsuario, obtenerDirectorioEstudiantes, obtenerDirectorioCompleto, ajustarHoras, actualizarRolPropio, actualizarNombrePropio } from './usuarios.js';

const statusDot   = document.getElementById('statusDot');
const statusText  = document.getElementById('statusText');
const toast       = document.getElementById('toast');
const gemeloMapaContainer = document.getElementById('gemeloMapaContainer');
const gemeloMapaWrapper    = document.querySelector('#view-gemelo .gemelo-mapa-wrapper');
const gemeloPanelLista     = document.getElementById('gemeloPanelLista');
const gemeloZoomInBtn      = document.getElementById('gemeloZoomInBtn');
const gemeloZoomOutBtn     = document.getElementById('gemeloZoomOutBtn');
const viewCatalogosToolbar = document.querySelector('#view-catalogos .view-catalogos-toolbar');

// Leyenda de categorías: contenido fijo (EMOJI_POR_TIPO/COLOR_POR_TIPO, no
// datos de Firestore), se inserta una sola vez al arrancar — a diferencia
// de renderListaCatalogos/renderEspiralSVG, estos contenedores NO se
// reemplazan por completo en cada carga, así que no hace falta
// re-insertarla en cada render.
viewCatalogosToolbar.appendChild(crearLeyendaCategorias());
gemeloMapaWrapper.appendChild(crearLeyendaCategorias());

const detallePlantaModalClose = document.getElementById('detallePlantaModalClose');
const detallePlantaTitulo    = document.getElementById('detallePlantaTitulo');
const detallePlantaEstado    = document.getElementById('detallePlantaEstado');
const detallePlantaFecha     = document.getElementById('detallePlantaFecha');
const detallePlantaProgreso  = document.getElementById('detallePlantaProgreso');
const detallePlantaPlagas    = document.getElementById('detallePlantaPlagas');
const detallePlantaSemillaBtn    = document.getElementById('detallePlantaSemillaBtn');
const detallePlantaCompletarBtn  = document.getElementById('detallePlantaCompletarBtn');

// PASO E: formulario de cierre de cultivo
const detallePlantaCierreForm       = document.getElementById('detallePlantaCierreForm');
const cierreRendimientoTabs         = document.getElementById('cierreRendimientoTabs');
const cierreCantidadInput           = document.getElementById('cierreCantidadInput');
const cierreNotaInput               = document.getElementById('cierreNotaInput');
const detallePlantaCierreCancelarBtn  = document.getElementById('detallePlantaCierreCancelarBtn');
const detallePlantaCierreConfirmarBtn = document.getElementById('detallePlantaCierreConfirmarBtn');

// ── Detalle de CAMA completa (Fase 14.5, editable desde Fase 16.5) ──
const detalleCamaModalClose = document.getElementById('detalleCamaModalClose');
const detalleCamaTitulo     = document.getElementById('detalleCamaTitulo');
const detalleCamaNotasInput  = document.getElementById('detalleCamaNotasInput');
const detalleCamaPlagasInput = document.getElementById('detalleCamaPlagasInput');
const detalleCamaGuardarBtn  = document.getElementById('detalleCamaGuardarBtn');

const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn    = document.getElementById('googleLoginBtn');
const newUserNombreInput = document.getElementById('newUserNombre');
const newUserRoleSelect = document.getElementById('newUserRole');
const completeRegistroBtn = document.getElementById('completeRegistroBtn');
const loginError    = document.getElementById('loginError');
const setupError    = document.getElementById('setupError');

// ── Dashboard (Fase 13) ─────────────────────────────────────────────
const dashboardUserEmail  = document.getElementById('dashboardUserEmail');
const dashboardHorasTexto = document.getElementById('dashboardHorasTexto');

// ── Barra de navegación persistente del header (Fase 16) ────────────
const headerLogo       = document.getElementById('headerLogo');
const headerNav        = document.getElementById('headerNav');
const headerNavToggle  = document.getElementById('headerNavToggle');

// ── Tarjetas del Dashboard (Fase 14.3) ──────────────────────────────
const dashboardResumenCamasCard = document.getElementById('dashboardResumenCamasCard');
const dashboardResumenCamas     = document.getElementById('dashboardResumenCamas');
const dashboardTareasCard       = document.getElementById('dashboardTareasCard');
const dashboardTareasLista      = document.getElementById('dashboardTareasLista');
const dashboardCatalogosCard    = document.getElementById('dashboardCatalogosCard');

// PASO F: banner de pendientes (Dashboard) + vista de bitácora
const dashboardBannerPendientes      = document.getElementById('dashboardBannerPendientes');
const dashboardBannerPendientesTexto = document.getElementById('dashboardBannerPendientesTexto');
const bitacoraFechaInput      = document.getElementById('bitacoraFechaInput');
const bitacoraResumenInput    = document.getElementById('bitacoraResumenInput');
const bitacoraPendientesInput = document.getElementById('bitacoraPendientesInput');
const bitacoraCrearBtn        = document.getElementById('bitacoraCrearBtn');
const bitacoraLista           = document.getElementById('bitacoraLista');

// ── Vista de Catálogos (Fase 13.6b) ─────────────────────────────────
const catalogosLista      = document.getElementById('catalogosLista');
const catalogosBusqueda   = document.getElementById('catalogosBusqueda');
const agregarCatalogoBtn  = document.getElementById('agregarCatalogoBtn');
const catalogosTabs       = document.querySelectorAll('#view-catalogos .filter-tab');

// ── Vista de Perfil (Fase 13.7) ──────────────────────────────────────
const perfilNombreInput       = document.getElementById('perfilNombreInput');
const perfilEditarNombreBtn   = document.getElementById('perfilEditarNombreBtn');
const perfilGuardarNombreBtn  = document.getElementById('perfilGuardarNombreBtn');
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

// Modal de mesa (bedModal, camas tipo 'rectangular') retirado por completo
// en Fase 15 junto con #appRoot/#gardenGrid — ver diagnóstico. Todos los
// DOM refs de este bloque (bedModalTitle, bedName/Col/Row/Plant/SeedDate/
// TransplantDate, soilN/P/K, bedNotes/Plagas/Compost, plantDateFields,
// saveBedBtn, deleteBedBtn) se retiraron junto con el HTML que apuntaban.

// ── Panel del Asistente IA ─────────────────────────────────────────
// .btn-ai/#aiBody/#aiMessages/#aiInput/.ai-toggle/.ai-send vivían dentro de
// #appRoot — se retiraron del HTML junto con él (Fase 15). A diferencia del
// modal de mesa, el CÓDIGO de soporte (toggleAI/agregarMensajeAI/
// handleSendAI/handleAiOverview, más abajo) NO se borra: ai.js sigue siendo
// un mock a propósito (ver su propio TODO — la llamada real requiere una
// Cloud Function que todavía no existe) y este código se reconecta cuando
// ese backend exista. Por ahora solo queda desconectado: sin estos DOM
// refs, los listeners que los usaban también se comentan más abajo.
//
// const aiToggleEl    = document.querySelector('.ai-toggle');
// const aiToggleIcon  = document.getElementById('aiToggleIcon');
// const aiBody         = document.getElementById('aiBody');
// const aiMessages     = document.getElementById('aiMessages');
// const aiInput        = document.getElementById('aiInput');
// const aiSendBtn       = document.querySelector('.ai-send');
// const aiOverviewBtn  = document.querySelector('.btn-ai');

// ── Vista de Tareas (Fase 13.5 — ya no es modal) ────────────────────
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

// Filtros de auditoría (tipo/persona/rango de fecha) — ver auditoria.
const auditoriaFiltroTipo     = document.getElementById('auditoriaFiltroTipo');
const auditoriaFiltroPersona  = document.getElementById('auditoriaFiltroPersona');
const auditoriaFiltroDesde    = document.getElementById('auditoriaFiltroDesde');
const auditoriaFiltroHasta    = document.getElementById('auditoriaFiltroHasta');
const auditoriaLimpiarFiltrosBtn = document.getElementById('auditoriaLimpiarFiltrosBtn');
const auditoriaErrorIndice    = document.getElementById('auditoriaErrorIndice');
const auditoriaVacio          = document.getElementById('auditoriaVacio');

let catalogoActual    = [];
let camasActuales     = [];
let tareasActuales    = [];
let estudiantesActuales = [];
// perfil.rol vive en Firestore (usuarios/{uid}), no en el usuario de
// Firebase Auth que guarda session.js — se cachea aquí porque varios
// handlers de la SPA (marcarParaSemilla, cierre de cultivo, RBAC de
// botones) necesitan saberlo y no tienen acceso al `perfil` local del
// portero.
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
    // Fase 16: resalta en headerNav el botón cuyo data-vista coincide con la
    // vista activa. Ningún botón coincide con 'view-dashboard' (no es uno de
    // los 6 destinos de la barra) — eso es correcto, no un bug: volver al
    // Dashboard es rol del logo clicable (ver headerLogo más abajo), no de
    // un ítem de esta barra.
    headerNav.querySelectorAll('[data-vista]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.vista === vistaId);
    });
    // Fase 16.3: cualquier navegación cierra el menú hamburguesa si estaba
    // abierto — sin esto, tras tocar un destino en móvil el panel se queda
    // desplegado tapando la vista nueva hasta que el usuario lo cierre a
    // mano. No-op en desktop (headerNav nunca tiene .open ahí, ver CSS).
    headerNav.classList.remove('open');
    headerNavToggle.setAttribute('aria-expanded', 'false');
    if (params) {
        document.dispatchEvent(new CustomEvent('vista:params', { detail: { vistaId, params } }));
    }
}

// Fase 16: el logo del header hace de "home" — única forma de volver al
// Dashboard ahora que headerNav (abajo) no incluye ese destino y el botón
// "Volver al Dashboard" por vista se retiró junto con .dashboard-quicklinks.
headerLogo.addEventListener('click', () => navegarA('view-dashboard'));

// Fase 16.3: toggle del menú hamburguesa (solo visible bajo 720px, ver
// CSS) — abre/cierra headerNav y mantiene aria-expanded sincronizado.
headerNavToggle.addEventListener('click', () => {
    const abierto = headerNav.classList.toggle('open');
    headerNavToggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
});

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
function mostrarDashboard(user, esAdmin, nombre) {
    loginOverlay.classList.add('hidden');
    esAdminActual = esAdmin;
    adminBtn.style.display = esAdmin ? '' : 'none';
    crearTareaBtn.style.display = esAdmin ? '' : 'none';
    const nombreMostrado = nombreParaMostrar({ email: user.email, nombre });
    dashboardUserEmail.textContent = ` — ${nombreMostrado}`;

    statusDot.classList.add('online');
    statusDot.classList.remove('error');
    statusText.textContent = `Conectado · ${nombreMostrado}`;

    navegarA('view-dashboard');

    // catalogoActual/camasActuales alimentan el modal de mesa (retirado del
    // header en Fase 14.2, sigue existiendo sin punto de entrada) y el mapa
    // dentro de #appRoot, que sigue oculto. También alimentan la Tarjeta 1
    // del Dashboard (renderResumenCamasDashboard, llamada al final de
    // iniciarHuerto() con los mismos datos ya cargados). Fire-and-forget:
    // obtenerCatalogo()/obtenerCamas() son fetches puntuales (getDocs, no
    // onSnapshot — confirmado), así que no hay riesgo de acumular
    // listeners si mostrarDashboard() se llama más de una vez en la misma
    // sesión.
    iniciarHuerto();

    cargarTareasDashboard(user.uid);
    cargarHorasDashboard(user.uid);

    // PASO F: banner de pendientes — fire-and-forget igual que
    // cargarTareasDashboard, con su propio try/catch (definido más abajo
    // en el archivo, disponible aquí por hoisting de function declarations,
    // mismo patrón ya usado con cargarTareasDashboard).
    cargarBannerBitacora();
}

// Fire-and-forget, con su propio manejo de error — mismo criterio que
// cargarTareasDashboard/cargarBannerBitacora: no debe tumbar el resto del
// Dashboard si obtenerUsuario() falla. Lectura propia (no extiende el
// contrato de 'auth:resuelto' en auth.js): ese evento ya lee este mismo
// documento para resolver rol/nombre, pero descarta horasTotales, y
// mostrarDashboard() se llama desde dos sitios (el listener de
// 'auth:resuelto' y handleCompletarRegistro, que NO redispara el evento) —
// extender el contrato ahí habría dejado una asimetría entre esos dos
// call-sites. Una lectura propia aquí, mismo patrón que
// cargarYRenderizarVistaPerfil (más abajo), evita tocar auth.js.
async function cargarHorasDashboard(uid) {
    try {
        const perfil = await obtenerUsuario(uid);
        // 0 es un valor real (así nace todo usuario nuevo — usuarios.js) y
        // se muestra tal cual, no como estado de carga o error.
        const horas = perfil ? (perfil.horasTotales ?? 0) : 0;
        dashboardHorasTexto.textContent = `Llevas ${horas} horas acumuladas.`;
    } catch (e) {
        console.error('[main] Error cargando horas acumuladas del Dashboard:', e);
        dashboardHorasTexto.textContent = 'No se pudieron cargar tus horas acumuladas.';
    }
}

// Fire-and-forget, con su propio manejo de error — no debe tumbar
// mostrarDashboard() si obtenerTareasAsignadas() falla (ej. falta el
// índice compuesto en Firestore, ver nota en chores.js). Alimenta la
// Tarjeta 2 (reemplaza a la vieja "Tu próxima tarea" — Fase 14.3).
async function cargarTareasDashboard(uid) {
    dashboardTareasLista.replaceChildren();
    try {
        const { tareas, total } = await obtenerTareasAsignadas(uid, 3);

        if (tareas.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Sin tareas pendientes';
            dashboardTareasLista.appendChild(li);
            return;
        }

        tareas.forEach((tarea) => {
            const li = document.createElement('li');
            li.textContent = tarea.titulo;
            dashboardTareasLista.appendChild(li);
        });

        // `total` es el conteo real (getCountFromServer), no una
        // estimación — si hay más de las `cantidad` traídas, el resto
        // exacto se anuncia aquí.
        if (total > tareas.length) {
            const li = document.createElement('li');
            li.className = 'dashboard-tareas-mas';
            li.textContent = `+${total - tareas.length} más`;
            dashboardTareasLista.appendChild(li);
        }
    } catch (e) {
        console.error('[main] Error cargando tareas del Dashboard:', e);
        const li = document.createElement('li');
        li.textContent = 'No se pudieron cargar';
        dashboardTareasLista.appendChild(li);
    }
}

// Tarjeta 1 (Fase 14.3): agrupa TODAS las plantas de camas arco/circular
// por el `estado` que ya calcula calcularEstadoFicha (render-spiral-2d.js,
// función pura reutilizada tal cual, sin duplicarla) — 'atrasada' primero
// (son las que necesitan atención/cosecha), 'creciendo'+'sin-datos' juntas
// como "en proceso" (ninguna de las dos es un estado que requiera acción
// inmediata), 'semilla' al final. Círculos individuales sin clic — el
// clic vive en la tarjeta completa (ver listener más abajo), navega a
// Gemelo sin abrir ningún detalle específico.
const GRUPOS_RESUMEN_CAMAS = [
    { titulo: 'Para cosechar', estados: ['atrasada'] },
    { titulo: 'En proceso', estados: ['creciendo', 'sin-datos'] },
    { titulo: 'Semilla', estados: ['semilla'] }
];

function renderResumenCamasDashboard(camas, catalogo) {
    const catalogoPorId = new Map(catalogo.map((p) => [p.id, p]));
    const camasEspiral = camas.filter((c) => c.tipo === 'arco' || c.tipo === 'circular');

    const porEstado = { atrasada: [], creciendo: [], 'sin-datos': [], semilla: [] };
    camasEspiral.forEach((cama) => {
        (cama.plantas || []).forEach((plantaEntry) => {
            const info = calcularEstadoFicha(plantaEntry, catalogoPorId);
            porEstado[info.estado].push({ plantaEntry, info });
        });
    });

    dashboardResumenCamas.replaceChildren();

    GRUPOS_RESUMEN_CAMAS.forEach(({ titulo, estados }) => {
        const items = estados.flatMap((estado) => porEstado[estado]);

        const grupo = document.createElement('div');
        grupo.className = 'dashboard-resumen-grupo';

        const encabezado = document.createElement('span');
        encabezado.className = 'dashboard-resumen-grupo-titulo';
        encabezado.textContent = `${titulo} (${items.length})`;
        grupo.appendChild(encabezado);

        if (items.length === 0) {
            const vacio = document.createElement('span');
            vacio.className = 'dashboard-resumen-vacio';
            vacio.textContent = '—';
            grupo.appendChild(vacio);
        } else {
            const fichas = document.createElement('div');
            fichas.className = 'dashboard-resumen-fichas';
            items.forEach(({ plantaEntry, info }) => {
                const ficha = document.createElement('span');
                ficha.className = 'mini-ficha';
                ficha.style.borderColor = info.color;

                const emoji = document.createElement('span');
                emoji.className = 'mini-ficha-emoji';
                emoji.textContent = emojiDePlanta(plantaEntry.plantaTipo);
                ficha.appendChild(emoji);

                // Mismo lenguaje visual que crearFichaPlanta (render-spiral-2d.js):
                // el badge es un círculo pequeño superpuesto en la esquina, nunca
                // reemplaza el emoji central.
                if (info.badge) {
                    const badge = document.createElement('span');
                    badge.className = `mini-ficha-badge ${info.badge === '⏳' ? 'mini-ficha-badge-semilla' : 'mini-ficha-badge-atrasada'}`;
                    badge.textContent = info.badge;
                    ficha.appendChild(badge);
                }

                fichas.appendChild(ficha);
            });
            grupo.appendChild(fichas);
        }

        dashboardResumenCamas.appendChild(grupo);
    });
}

dashboardResumenCamasCard.addEventListener('click', () => navegarA('view-gemelo'));
dashboardTareasCard.addEventListener('click', () => navegarA('view-tareas'));
dashboardCatalogosCard.addEventListener('click', () => navegarA('view-catalogos'));

// Fase 14.1: el botón arranca disabled en el HTML — solo se habilita
// cuando el nombre no está vacío (trim). El rol siempre tiene un valor
// válido por default (el <select> no tiene opción vacía), así que nombre
// es la única condición real de gating.
function actualizarGatingSetup() {
    completeRegistroBtn.disabled = !newUserNombreInput.value.trim();
}

newUserNombreInput.addEventListener('input', actualizarGatingSetup);

async function handleCompletarRegistro() {
    const user = AuthService.getCurrentUser();
    if (!user) return;

    const nombre = newUserNombreInput.value.trim();
    if (!nombre) return; // el botón ya debería estar disabled — defensa en profundidad.

    completeRegistroBtn.disabled = true;
    mostrarErrorSetup('');
    try {
        await registrarUsuario(user.uid, user.email, newUserRoleSelect.value, nombre);
        // El select de Setup solo ofrece estudiante/externo (bloqueante de
        // seguridad ya validado) — nunca puede dar 'admin' aquí. No hace
        // falta ocultar #roleSelection/#googleLoginBtn: mostrarDashboard()
        // navega a view-dashboard, y el router ya oculta view-setup.
        setUsuarioActual({ uid: user.uid, email: user.email });
        mostrarDashboard(user, false, nombre);
    } catch (e) {
        console.error('[main] Error registrando usuario:', e);
        mostrarErrorSetup('No se pudo completar el registro. Intenta de nuevo.');
    } finally {
        completeRegistroBtn.disabled = false;
    }
}

googleLoginBtn.addEventListener('click', handleLoginConGoogle);
completeRegistroBtn.addEventListener('click', handleCompletarRegistro);

// ── Pan/zoom del mapa en espiral (Fase 18.1) ─────────────────────────
//
// El estado {escala, offsetX, offsetY} vive ACÁ, no en render-spiral-2d.js
// — cada llamada a renderEspiralSVG() reemplaza el <svg> por completo
// (container.replaceChildren), así que cualquier estado que viviera solo
// en el viewBox del nodo anterior se perdería en cada re-render (drop de
// planta, marcar semilla, cerrar cultivo — todo pasa por iniciarHuerto()).
// aplicarVistaEspiral()/configurarPanZoomEspiral() se llaman de nuevo
// después de CADA renderEspiralSVG(), sobre el <svg> nuevo.
//
// R_MAPA debe coincidir con la constante `R` de render-spiral-2d.js — no
// se importa de ahí porque ese módulo no expone su viewBox base como
// valor público (es un detalle interno de cómo arma el <svg>), así que se
// duplica aquí de forma literal y documentada, mismo criterio ya usado
// para ESCALA/RADIO_FICHA_PX entre geometria-espiral.js y
// render-spiral-2d.js.
const R_MAPA = 420;
const ESCALA_MIN = 1;   // no se puede alejar más allá de la vista original
const ESCALA_MAX = 4;
const UMBRAL_PAN_PX = 9; // 8-10px pedido — punto medio del rango

let vistaEspiral = { escala: 1, offsetX: 0, offsetY: 0 };

// Fase 14.6b ya usaba `.dragging`/ghost para señalar un arrastre de planta
// en curso, pero no había ninguna bandera que otro gesto pudiera consultar
// — el pan la necesita para quedarse quieto mientras dura un arrastre
// (prioridad total al drag de planta sobre el mapa, nunca al revés, ver
// diagnóstico de la fase). Se declara acá porque iniciarArrastrePlanta
// también vive en este archivo.
let arrastrandoPlanta = false;

function clampVistaEspiral() {
    vistaEspiral.escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, vistaEspiral.escala));
    // El pan nunca puede alejarse tanto que el viewBox salga del cuadro
    // [-R_MAPA, R_MAPA] original — maxOffset = R*(1 - 1/escala) garantiza
    // que ambos bordes del viewBox (offset ± R/escala) queden siempre
    // dentro de ese cuadro. En escala=1 (sin zoom) maxOffset=0: no hay
    // pan posible sin zoom, correcto — no hay nada "extra" a donde
    // desplazarse si ya se ve todo el contenido.
    const maxOffset = R_MAPA * (1 - 1 / vistaEspiral.escala);
    vistaEspiral.offsetX = Math.min(maxOffset, Math.max(-maxOffset, vistaEspiral.offsetX));
    vistaEspiral.offsetY = Math.min(maxOffset, Math.max(-maxOffset, vistaEspiral.offsetY));
}

function aplicarVistaEspiral(svg) {
    if (!svg) return;
    const mitad = R_MAPA / vistaEspiral.escala;
    svg.setAttribute('viewBox', `${vistaEspiral.offsetX - mitad} ${vistaEspiral.offsetY - mitad} ${2 * mitad} ${2 * mitad}`);
}

// Convierte un punto de pantalla (clientX/clientY) a coordenadas del
// espacio SVG nativo, usando el viewBox y el tamaño real renderizado del
// <svg> — necesario para el pan (convertir px de pantalla a unidades SVG)
// y el zoom hacia el cursor/centro del pellizco (saber qué punto del mapa
// debe quedarse fijo bajo el puntero).
function pantallaASvg(clientX, clientY, svg) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
        x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
        y: vb.y + ((clientY - rect.top) / rect.height) * vb.height
    };
}

function zoomHacia(clientX, clientY, svg, nuevaEscala) {
    // Fija el punto (clientX,clientY) bajo el cursor/pellizco antes y
    // después del cambio de escala — sin esto, hacer zoom siempre
    // "empujaría" el mapa hacia el centro en vez de sentirse anclado a
    // donde apunta el usuario.
    const antes = pantallaASvg(clientX, clientY, svg);
    vistaEspiral.escala = nuevaEscala;
    clampVistaEspiral();
    aplicarVistaEspiral(svg);
    const despues = pantallaASvg(clientX, clientY, svg);
    vistaEspiral.offsetX += antes.x - despues.x;
    vistaEspiral.offsetY += antes.y - despues.y;
    clampVistaEspiral();
    aplicarVistaEspiral(svg);
}

// (Re)configura pan (arrastre de un puntero), zoom con rueda y pellizco
// (dos punteros) sobre un <svg> — se llama de nuevo en cada render porque
// el <svg> es un nodo nuevo cada vez (ver comentario de cabecera).
//
// pointermove/pointerup/pointercancel viven en `window`, montados/
// desmontados dinámicamente mientras dura el gesto — MISMO patrón que ya
// usa iniciarArrastrePlanta, a propósito. La primera versión de esta
// función usaba svg.setPointerCapture(), que parecía la solución más
// "moderna" — pero se verificó con Playwright (ver validación de la fase)
// que retargeta también el `click` sintético posterior al propio <svg> en
// vez de al elemento real bajo el puntero, así que un clic corto sobre
// una cama dejaba de llegarle a `forma`/`grupo` (onClickCama/onClickPlanta
// nunca se disparaban). Sin pointer capture, el click se resuelve normal.
function configurarPanZoomEspiral(svg) {
    if (!svg) return;

    // pointerId -> {x, y} de cada puntero activo — 1 entrada = pan de un
    // dedo/mouse, 2 entradas = pellizco. Un Map, no un array, porque el
    // pointerId de quien se levanta primero no es necesariamente el que
    // arrancó el gesto.
    const punteros = new Map();
    let panActivo = false;
    let panCruzoUmbral = false;
    let panInicioX = 0;
    let panInicioY = 0;
    let pellizcoActivo = false;
    let pellizcoDistanciaInicial = 0;
    let pellizcoEscalaInicial = 1;
    let listenersGlobalesMontados = false;

    function distanciaEntrePunteros() {
        const [a, b] = [...punteros.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function centroEntrePunteros() {
        const [a, b] = [...punteros.values()];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function onPointerMove(e) {
        if (arrastrandoPlanta) return;
        if (!punteros.has(e.pointerId)) return;
        const anterior = punteros.get(e.pointerId);
        punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pellizcoActivo && punteros.size === 2) {
            const distanciaActual = distanciaEntrePunteros();
            const factor = distanciaActual / pellizcoDistanciaInicial;
            const centro = centroEntrePunteros();
            zoomHacia(centro.x, centro.y, svg, pellizcoEscalaInicial * factor);
            return;
        }

        if (panActivo && punteros.size === 1) {
            const distDesdeInicio = Math.hypot(e.clientX - panInicioX, e.clientY - panInicioY);
            if (distDesdeInicio > UMBRAL_PAN_PX) panCruzoUmbral = true;
            if (!panCruzoUmbral) return; // bajo el umbral: no mover nada todavía, podría ser un clic

            const dx = e.clientX - anterior.x;
            const dy = e.clientY - anterior.y;
            // px de pantalla -> unidades SVG, usando el ancho actual del
            // viewBox contra el ancho real renderizado (cuadrado, mismo
            // factor para X e Y). Arrastrar a la derecha debe mover el
            // CONTENIDO a la derecha (manipulación directa), por eso resta.
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox.baseVal;
            const factorPxAUnidades = vb.width / rect.width;
            vistaEspiral.offsetX -= dx * factorPxAUnidades;
            vistaEspiral.offsetY -= dy * factorPxAUnidades;
            clampVistaEspiral();
            aplicarVistaEspiral(svg);
        }
    }

    function montarListenersGlobales() {
        if (listenersGlobalesMontados) return;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUpOCancel);
        window.addEventListener('pointercancel', onPointerUpOCancel);
        listenersGlobalesMontados = true;
    }
    function desmontarListenersGlobales() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUpOCancel);
        window.removeEventListener('pointercancel', onPointerUpOCancel);
        listenersGlobalesMontados = false;
    }

    function onPointerUpOCancel(e) {
        punteros.delete(e.pointerId);
        if (punteros.size < 2) pellizcoActivo = false;
        if (punteros.size === 0) {
            panActivo = false;
            desmontarListenersGlobales();
        }
    }

    svg.addEventListener('pointerdown', (e) => {
        if (arrastrandoPlanta) return; // prioridad total al drag de planta
        punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
        montarListenersGlobales();

        if (punteros.size === 1) {
            panActivo = true;
            panCruzoUmbral = false;
            panInicioX = e.clientX;
            panInicioY = e.clientY;
        } else if (punteros.size === 2) {
            // Un segundo puntero llegó a mitad de un pan de un dedo — se
            // pausa el pan (no lo cancela: si un dedo se levanta, el pan
            // NO se reanuda automáticamente con el dedo que queda, evita
            // un salto brusco) y arranca el pellizco.
            panActivo = false;
            pellizcoActivo = true;
            pellizcoDistanciaInicial = distanciaEntrePunteros();
            pellizcoEscalaInicial = vistaEspiral.escala;
        }
    });

    // Suprime el click sintético que el navegador dispara después de un
    // pointerup si el gesto cruzó el umbral — sin esto, soltar tras un pan
    // largo sobre una cama abriría igual su modal de notas. Fase de
    // CAPTURA (tercer argumento `true`): corre antes de que el evento
    // llegue a los listeners de clic de onClickCama/onClickPlanta (que
    // están en fase de burbuja, más profundo en el árbol — forma/grupo
    // dentro de cada <g class="cama-espiral">), así que detenerlo acá
    // nunca deja que lleguen a dispararse.
    svg.addEventListener('click', (e) => {
        if (panCruzoUmbral) {
            e.stopPropagation();
            e.preventDefault();
        }
        panCruzoUmbral = false; // listo para el próximo gesto
    }, true);

    // Rueda del mouse (desktop) — zoom hacia el cursor. preventDefault +
    // passive:false para que la página no haga scroll mientras se hace
    // zoom sobre el mapa.
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        zoomHacia(e.clientX, e.clientY, svg, vistaEspiral.escala * factor);
    }, { passive: false });
}

function zoomBotonEspiral(factor) {
    const svg = gemeloMapaContainer.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Sin cursor/dedo real, el zoom por botón ancla al centro visible del
    // mapa — mismo mecanismo (zoomHacia) que rueda/pellizco, solo con un
    // punto de referencia distinto.
    zoomHacia(rect.left + rect.width / 2, rect.top + rect.height / 2, svg, vistaEspiral.escala * factor);
}

gemeloZoomInBtn.addEventListener('click', () => zoomBotonEspiral(1.4));
gemeloZoomOutBtn.addEventListener('click', () => zoomBotonEspiral(1 / 1.4));

// ── Carga de datos ────────────────────────────────────────────────
// poblarSelectPlantas() (poblaba el <select> de bedModal) se retiró en
// Fase 15 junto con el resto del modal de mesa — ver diagnóstico.

async function iniciarHuerto() {
    try {
        const [catalogo, camas] = await Promise.all([obtenerCatalogo(), obtenerCamas()]);
        catalogoActual = catalogo;
        camasActuales  = camas;

        // renderEspiralSVG filtra internamente a arco/circular — se le pasa
        // `camas` completo, mismo dato ya cargado arriba (sin una segunda
        // ida a Firestore).
        const svgEspiral = renderEspiralSVG(gemeloMapaContainer, camas, catalogo, {
            // Fase 14.5: reemplaza el toast "pendiente de construir" —
            // abrirDetalleCama() es la vista de solo lectura que faltaba.
            onClickCama: (cama) => abrirDetalleCama(cama),
            onClickPlanta: (cama, plantaEntry) => abrirDetallePlanta(cama, plantaEntry)
        });
        // Fase 18.1: el <svg> es un nodo nuevo en cada render — el estado
        // de pan/zoom (vistaEspiral) y los listeners que lo manejan se
        // reaplican acá, siempre, sin importar qué disparó este
        // iniciarHuerto() (carga inicial, drop de planta, marcar semilla,
        // cerrar cultivo — todos pasan por esta misma función).
        aplicarVistaEspiral(svgEspiral);
        configurarPanZoomEspiral(svgEspiral);

        // Panel lateral arrastrable (Fase 14.6b) — mismo `catalogo` ya
        // cargado arriba, sin query nueva. Se repinta en cada iniciarHuerto()
        // como el resto: tras un drop exitoso hay que volver a llamar esto
        // de todas formas para que el SVG refleje la planta nueva, así que
        // no vale la pena mantener el panel fuera de ese ciclo.
        renderPanelCatalogoArrastrable(catalogo);

        // Tarjeta 1 del Dashboard (Fase 14.3) — mismo `camas`/`catalogo` ya
        // cargados arriba, sin una tercera ida a Firestore.
        renderResumenCamasDashboard(camas, catalogo);
    } catch (e) {
        console.error('[main] Error cargando datos del huerto:', e);
        statusDot.classList.add('error');
        statusDot.classList.remove('online');
        statusText.textContent = 'Error de conexión';
        mostrarToast('No se pudo cargar el huerto', 'red');
    }
}

// ── Panel lateral arrastrable + drag & drop sobre la espiral (Fase 14.6b) ──
//
// Reutiliza .plant-card/.plant-icon/.plant-info/.plant-name (mismas clases
// que pintaba el viejo renderCatalogo del layout pre-SPA — ver render.js)
// en vez de inventar un componente nuevo; esas clases ya traían cursor:grab
// y .dragging preparados desde #appRoot, que nunca llegó a conectarse a una
// interacción real y se retiró por completo en Fase 15 — el CSS de estas
// clases sobrevivió esa limpieza precisamente porque este panel las usa.
function renderPanelCatalogoArrastrable(catalogo) {
    if (!gemeloPanelLista) return;
    const fragment = document.createDocumentFragment();

    catalogo.forEach((planta) => {
        const tipo = (planta.tipo || 'desconocido').trim().toLowerCase();

        const card = document.createElement('div');
        card.className = 'plant-card';
        card.dataset.plantId = planta.id;

        const icon = document.createElement('div');
        icon.className = 'plant-icon';
        icon.textContent = emojiDePlanta(tipo);

        const info = document.createElement('div');
        info.className = 'plant-info';
        const name = document.createElement('div');
        name.className = 'plant-name';
        name.textContent = planta.nombre || 'Sin nombre';
        info.appendChild(name);

        card.append(icon, info);
        card.addEventListener('pointerdown', (e) => iniciarArrastrePlanta(e, planta.id, card));
        fragment.appendChild(card);
    });

    gemeloPanelLista.replaceChildren(fragment);
}

// Pointer Events (pointerdown/pointermove/pointerup), NUNCA la API de
// drag&drop nativa del navegador (draggable/dragstart/drop) — esa API no
// dispara en touch, y el proyecto es mobile-first desde Fase 13. Un solo
// listener de pointerdown por tarjeta arranca el arrastre; pointermove/up
// se escuchan en window mientras dura, y se desmontan al soltar — no hay
// listeners globales vivos fuera de un arrastre en curso.
function iniciarArrastrePlanta(evento, plantaId, elementoOrigen) {
    evento.preventDefault();

    // Fase 18.1: bandera que el pan del mapa consulta en cada pointermove
    // — prioridad total al arrastre de planta, el pan se queda quieto
    // mientras dura (ver diagnóstico de la fase).
    arrastrandoPlanta = true;

    const ghost = document.createElement('div');
    ghost.className = 'gemelo-drag-ghost';
    ghost.textContent = elementoOrigen.textContent;
    document.body.appendChild(ghost);

    const moverGhost = (x, y) => {
        ghost.style.left = `${x}px`;
        ghost.style.top = `${y}px`;
    };
    moverGhost(evento.clientX, evento.clientY);
    elementoOrigen.classList.add('dragging');

    // Cama (.cama-espiral) resaltada bajo el puntero en este momento del
    // arrastre — se recalcula en cada pointermove vía elementFromPoint;
    // .gemelo-drag-ghost tiene pointer-events:none así que nunca se
    // interpone a sí mismo en ese hit-test.
    let camaResaltada = null;

    function onPointerMove(ev) {
        moverGhost(ev.clientX, ev.clientY);

        const elBajoPuntero = document.elementFromPoint(ev.clientX, ev.clientY);
        const camaGrupo = elBajoPuntero ? elBajoPuntero.closest('.cama-espiral') : null;

        if (camaGrupo !== camaResaltada) {
            if (camaResaltada) camaResaltada.classList.remove('drop-target');
            camaResaltada = camaGrupo;
            if (camaResaltada) camaResaltada.classList.add('drop-target');
        }
    }

    async function onPointerUp() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        arrastrandoPlanta = false; // el pan puede retomar de inmediato, no hace falta esperar el guardado
        ghost.remove();
        elementoOrigen.classList.remove('dragging');

        const camaDestino = camaResaltada;
        if (camaDestino) camaDestino.classList.remove('drop-target');
        if (!camaDestino) return; // soltado fuera de cualquier cama — no-op

        const camaId = camaDestino.dataset.camaId;
        try {
            await agregarPlantaACama(camaId, plantaId);
            // Mismo patrón que detallePlantaSemillaBtn tras marcarParaSemilla:
            // await iniciarHuerto() ANTES del toast, para no dejar ver un
            // instante la espiral vieja sin la ficha nueva (el parpadeo que
            // ya se corrigió en PASO D).
            await iniciarHuerto();
            mostrarToast('Planta agregada', 'green');
        } catch (e) {
            console.error('[main] Error agregando planta a la cama:', e);
            // Mensaje real del error (ej. cama saturada, sin espacio sin
            // traslape) — no uno genérico, a diferencia de otros handlers
            // que sí generalizan; aquí el mensaje de proximaPosicionDisponible
            // es información accionable para quien está sembrando.
            mostrarToast(e.message || 'No se pudo agregar la planta', 'red');
        }
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
}

// Modal de mesa (bedModal) + openAddBed/openEditBed/handleSaveBed/
// handleDeleteBed/crearCama/actualizarCama/eliminarCama retirados en Fase
// 15 junto con #appRoot/gardenGrid, sus únicos puntos de entrada (ver
// diagnóstico) — camas tipo:'rectangular' ya no tienen ningún flujo de
// creación/edición en el cliente. editingCamaId (usado solo por esas
// funciones) también se retiró.

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
        // obtenerDirectorioCompleto() (no la versión filtrada a
        // 'estudiante'): el selector de asignados de "+ Crear tarea"
        // necesita poder asignar tareas a cualquier rol, incluido admin.
        // abrirAdminModal/cargarYRenderizarVistaAdmin/obtenerSesionConDetalle
        // siguen usando obtenerDirectorioEstudiantes() sin cambios (ver
        // auditoría) — no dependen de este call site.
        const [tareas, estudiantes] = await Promise.all([obtenerTareas(), obtenerDirectorioCompleto()]);
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
    const estudiantesPorUid = new Map(estudiantesActuales.map((e) => [e.id, nombreParaMostrar(e)]));
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
        label.appendChild(document.createTextNode(nombreParaMostrar(estudiante)));

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
        opt.textContent = nombreParaMostrar(estudiante);
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

// adminBtn ya no tiene listener propio — vive dentro de headerNav (Fase 16)
// y su clic se resuelve por delegación en el handler de headerNav más abajo,
// igual que los demás data-vista. Un listener directo aquí duplicaría la
// llamada a irAVistaAdmin() (bubbling + delegación).
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

        perfilNombreInput.value = perfil.nombre || '';
        bloquearEdicionNombre();
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

// Nombre bloqueado (readonly) por defecto — "Editar" lo habilita y muestra
// "Guardar", "Guardar" (si tiene éxito) vuelve a bloquear vía
// cargarYRenderizarVistaPerfil(), que ya llama a esta misma función. Si el
// guardado falla, NO se vuelve a bloquear (el catch de
// handleGuardarNombrePropio no llama a cargarYRenderizarVistaPerfil) —
// el usuario puede corregir y reintentar sin tener que volver a pulsar
// Editar.
function bloquearEdicionNombre() {
    perfilNombreInput.readOnly = true;
    perfilEditarNombreBtn.style.display = '';
    perfilGuardarNombreBtn.style.display = 'none';
}

function handleEditarNombre() {
    perfilNombreInput.readOnly = false;
    perfilNombreInput.focus();
    perfilEditarNombreBtn.style.display = 'none';
    perfilGuardarNombreBtn.style.display = '';
}

async function handleGuardarNombrePropio() {
    const nombre = perfilNombreInput.value.trim();
    const user = AuthService.getCurrentUser();
    if (!user) return;

    if (!nombre) {
        mostrarToast('El nombre no puede estar vacío', 'red');
        return;
    }

    perfilGuardarNombreBtn.disabled = true;
    try {
        await actualizarNombrePropio(user.uid, nombre);
        mostrarToast('Nombre actualizado', 'green');
        await cargarYRenderizarVistaPerfil();
    } catch (e) {
        console.error('[main] Error actualizando nombre:', e);
        mostrarToast(e.message || 'No se pudo actualizar el nombre', 'red');
    } finally {
        perfilGuardarNombreBtn.disabled = false;
    }
}

perfilEditarNombreBtn.addEventListener('click', handleEditarNombre);
perfilGuardarNombreBtn.addEventListener('click', handleGuardarNombrePropio);
perfilGuardarRolBtn.addEventListener('click', handleGuardarRolPropio);
perfilLogoutBtn.addEventListener('click', () => AuthService.logout());

// ── Vista de Admin (Fase 13.8) ──────────────────────────────────────
//
// "Quién" en el registro de actividad usa entrada.usuario directo (ya es
// el email, guardado por cada _logActividad — Fase 14.1: se mantiene como
// identificador estable, NO como display name, a propósito) — no resuelve
// contra obtenerDirectorioEstudiantes(), que además no tendría a los admins.

function irAVistaAdmin() {
    navegarA('view-admin');
    cargarYRenderizarVistaAdmin();
}

// directorioParaFiltroPersona: el actor de un registro de actividad puede
// ser cualquier rol (admin incluido — ver comentario arriba sobre
// entrada.usuario), así que el filtro de persona usa
// obtenerDirectorioCompleto(), no obtenerDirectorioEstudiantes() (esa
// sigue siendo solo para renderResumenHoras, que si debe quedarse
// estudiantes-only — ver auditoría de la Fase de obtenerDirectorioCompleto).
let directorioParaFiltroPersona = [];

async function cargarYRenderizarVistaAdmin() {
    try {
        const [registro, estudiantes, directorioCompleto] = await Promise.all([
            obtenerRegistroActividad(),
            obtenerDirectorioEstudiantes(),
            obtenerDirectorioCompleto()
        ]);
        renderRegistroActividad(registro, registroActividadBody);
        renderResumenHoras(estudiantes, resumenHorasBody);
        auditoriaVacio.style.display = registro.length === 0 ? '' : 'none';

        directorioParaFiltroPersona = directorioCompleto;
        poblarFiltrosAuditoria(registro);
    } catch (e) {
        console.error('[main] Error cargando el panel de Admin:', e);
        mostrarToast('No se pudo cargar el panel de Admin', 'red');
    }
}

// Opciones de los selectores tipo/persona: derivadas de los valores REALES
// que ya trajo la carga inicial sin filtro (12 documentos hoy, todos caben
// en el límite de 50) — no una lista fija inventada en el código. Se
// puebla una sola vez al entrar a la vista, no se recalcula con cada
// filtro aplicado (así el usuario siempre puede volver a cualquier tipo/
// persona sin que las opciones se reduzcan por el filtro previo).
function poblarFiltrosAuditoria(registroSinFiltrar) {
    const tiposReales = [...new Set(registroSinFiltrar.map((r) => r.tipo).filter(Boolean))].sort();
    auditoriaFiltroTipo.innerHTML = '<option value="">Todos los tipos</option>' +
        tiposReales.map((t) => `<option value="${t}">${t}</option>`).join('');

    auditoriaFiltroPersona.innerHTML = '<option value="">Todas las personas</option>';
    directorioParaFiltroPersona.forEach((persona) => {
        const opt = document.createElement('option');
        opt.value = persona.id;
        opt.textContent = nombreParaMostrar(persona);
        auditoriaFiltroPersona.appendChild(opt);
    });
}

async function aplicarFiltrosAuditoria() {
    const tipo = auditoriaFiltroTipo.value || undefined;
    const uid = auditoriaFiltroPersona.value || undefined;
    // input[type=date] da 'YYYY-MM-DD' en hora LOCAL del navegador — mismo
    // criterio que fechaSiembra en otras partes del proyecto (Gemelo):
    // fuerza T00:00:00/T23:59:59 explícitos para no caer en UTC medianoche.
    const desde = auditoriaFiltroDesde.value ? new Date(`${auditoriaFiltroDesde.value}T00:00:00`) : undefined;
    const hasta = auditoriaFiltroHasta.value ? new Date(`${auditoriaFiltroHasta.value}T23:59:59`) : undefined;

    auditoriaErrorIndice.style.display = 'none';
    try {
        const registro = await obtenerRegistroActividad({ tipo, uid, desde, hasta });
        renderRegistroActividad(registro, registroActividadBody);
        auditoriaVacio.style.display = registro.length === 0 ? '' : 'none';
    } catch (e) {
        // FAILED_PRECONDITION de Firestore por falta de índice compuesto —
        // de las 7 combinaciones posibles, 3 índices distintos ya se
        // identificaron y documentaron en obtenerRegistroActividad (db.js).
        // Si esto dispara, es una combinación que ya se anticipó (o una
        // nueva si el schema de filtros cambia) — se le muestra el link
        // real al admin en vez de fallar en silencio, mismo procedimiento
        // ya usado varias veces en este proyecto para índices faltantes.
        const link = extraerLinkIndice(e);
        if (link) {
            auditoriaErrorIndice.innerHTML = `Esta combinación de filtros necesita un índice nuevo en Firestore. <a href="${link}" target="_blank" rel="noopener">Crear índice</a>`;
            auditoriaErrorIndice.style.display = '';
            console.error('[main] Índice faltante para filtros de auditoría:', link);
        } else {
            console.error('[main] Error aplicando filtros de auditoría:', e);
            mostrarToast('No se pudieron aplicar los filtros', 'red');
        }
    }
}

function limpiarFiltrosAuditoria() {
    auditoriaFiltroTipo.value = '';
    auditoriaFiltroPersona.value = '';
    auditoriaFiltroDesde.value = '';
    auditoriaFiltroHasta.value = '';
    auditoriaErrorIndice.style.display = 'none';
    aplicarFiltrosAuditoria();
}

auditoriaFiltroTipo.addEventListener('change', aplicarFiltrosAuditoria);
auditoriaFiltroPersona.addEventListener('change', aplicarFiltrosAuditoria);
auditoriaFiltroDesde.addEventListener('change', aplicarFiltrosAuditoria);
auditoriaFiltroHasta.addEventListener('change', aplicarFiltrosAuditoria);
auditoriaLimpiarFiltrosBtn.addEventListener('click', limpiarFiltrosAuditoria);

// Reutiliza el adminModal existente (Fase 13.2) sin tocar su lógica
// interna — solo cambia de dónde se abre.
abrirAjusteHorasBtn.addEventListener('click', abrirAdminModal);

// ── PASO F: Bitácora de sesiones ────────────────────────────────────
// Vista independiente de view-admin (ver diagnóstico) — accesible a
// cualquier rol autenticado, tanto para crear entradas como para ver el
// historial.

function irAVistaBitacora() {
    navegarA('view-bitacora');
    cargarYRenderizarBitacora();
}

async function cargarYRenderizarBitacora() {
    try {
        const sesiones = await obtenerBitacoraSesiones();
        renderListaBitacora(sesiones, bitacoraLista, onExpandirSesion);
    } catch (e) {
        console.error('[main] Error cargando la bitácora:', e);
        mostrarToast('No se pudo cargar la bitácora', 'red');
    }
}

// Carga perezosa: obtenerSesionConDetalle(fecha) (db.js) solo se llama la
// PRIMERA vez que se expande una sesión — no al renderizar la lista
// completa, para no disparar N queries (asistencias+tareas+directorio) por
// cada entrada con solo abrir la vista. contenedor.dataset.cargado evita
// repetir el fetch en toggles subsecuentes de la misma sesión.
async function onExpandirSesion(sesion, contenedor) {
    const visible = contenedor.style.display !== 'none';
    if (visible) {
        contenedor.style.display = 'none';
        return;
    }
    contenedor.style.display = '';
    if (contenedor.dataset.cargado === 'true') return;

    contenedor.textContent = 'Cargando…';
    try {
        // Misma función que ya resuelve esto en otro lado del proyecto —
        // no se reconstruye "asistentes"/"tareasCompletadas" a mano aquí.
        const { asistentes, tareasCompletadas } = await obtenerSesionConDetalle(sesion.fecha);

        const asistentesP = document.createElement('p');
        asistentesP.textContent = `Asistentes: ${asistentes.length ? asistentes.join(', ') : 'Ninguno registrado'}`;

        const tareasP = document.createElement('p');
        tareasP.textContent = `Tareas completadas: ${tareasCompletadas.length ? tareasCompletadas.join(', ') : 'Ninguna'}`;

        contenedor.replaceChildren(asistentesP, tareasP);
        contenedor.dataset.cargado = 'true';
    } catch (e) {
        console.error('[main] Error cargando detalle de sesión:', e);
        contenedor.textContent = 'No se pudo cargar el detalle.';
    }
}

function actualizarEstadoBotonBitacora() {
    const fecha = bitacoraFechaInput.value;
    const resumen = bitacoraResumenInput.value.trim();
    bitacoraCrearBtn.disabled = !(fecha && resumen);
}

function limpiarFormularioBitacora() {
    bitacoraFechaInput.value = new Date().toISOString().slice(0, 10);
    bitacoraResumenInput.value = '';
    bitacoraPendientesInput.value = '';
    actualizarEstadoBotonBitacora();
}

bitacoraFechaInput.addEventListener('input', actualizarEstadoBotonBitacora);
bitacoraResumenInput.addEventListener('input', actualizarEstadoBotonBitacora);

async function handleCrearBitacora() {
    const fecha = bitacoraFechaInput.value;
    const resumen = bitacoraResumenInput.value.trim();
    if (!fecha || !resumen) return; // defensivo — el botón ya debería estar disabled

    bitacoraCrearBtn.disabled = true;
    try {
        await crearBitacoraSesion({
            fecha,
            resumen,
            pendientes: bitacoraPendientesInput.value.trim() || ''
        });
        // Refresca lista + banner del Dashboard sin recargar la página —
        // esta entrada puede ser la nueva "más reciente" que el banner
        // debe mostrar la próxima vez que alguien vea el Dashboard.
        await Promise.all([cargarYRenderizarBitacora(), cargarBannerBitacora()]);
        limpiarFormularioBitacora();
        mostrarToast('Entrada guardada', 'green');
    } catch (e) {
        console.error('[main] Error creando entrada de bitácora:', e);
        mostrarToast(e.message || 'No se pudo guardar la entrada', 'red');
    } finally {
        // No se fuerza a false: si la escritura falló, los campos siguen
        // llenos (no se limpiaron) y el botón debe re-habilitarse; si
        // tuvo éxito, limpiarFormularioBitacora() ya dejó fecha/resumen
        // vacíos y debe seguir disabled. actualizarEstadoBotonBitacora()
        // decide correctamente en ambos casos.
        actualizarEstadoBotonBitacora();
    }
}

bitacoraCrearBtn.addEventListener('click', handleCrearBitacora);
limpiarFormularioBitacora(); // fecha por defecto = hoy, botón disabled

// Banner de pendientes del Dashboard (punto 4) — visible a CUALQUIER rol.
// Reutiliza obtenerBitacoraSesiones() (ya ordenada desc por fecha, ver
// db.js) — sesiones[0] es la más reciente, sin ordenar nada aquí. Oculto
// si no hay ninguna entrada o si la más reciente no tiene `pendientes`
// (string vacío incluido) — nunca un estado vacío forzado.
async function cargarBannerBitacora() {
    try {
        const sesiones = await obtenerBitacoraSesiones();
        const masReciente = sesiones[0];
        if (masReciente && masReciente.pendientes) {
            dashboardBannerPendientesTexto.textContent = masReciente.pendientes;
            dashboardBannerPendientes.style.display = '';
        } else {
            dashboardBannerPendientes.style.display = 'none';
        }
    } catch (e) {
        console.error('[main] Error cargando el banner de pendientes:', e);
        dashboardBannerPendientes.style.display = 'none';
    }
}

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

// Listeners desconectados junto con el HTML del Asistente IA (Fase 15) —
// ver comentario junto a los DOM refs comentados más arriba. toggleAI/
// agregarMensajeAI/handleSendAI/handleAiOverview quedan intactos arriba,
// solo sin quién los invoque.
//
// aiToggleEl.addEventListener('click', toggleAI);
// aiSendBtn.addEventListener('click', handleSendAI);
// aiInput.addEventListener('keydown', (e) => {
//     if (e.key === 'Enter') handleSendAI();
// });
// aiOverviewBtn.addEventListener('click', handleAiOverview);

// ── Barra de navegación persistente del header (Fase 16) ────────────

headerNav.addEventListener('click', (e) => {
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
    if (btn.dataset.vista === 'view-bitacora') {
        irAVistaBitacora();
        return;
    }
    navegarA(btn.dataset.vista);
});

// ── Detalle de CAMA completa en espiral (Fase 14.5) ─────────────────
// Reemplaza el toast "pendiente de construir" que tenía onClickCama desde
// PASO C. NO es el formulario completo de creación/edición de camas
// arco/circular (tipo/anillo/indiceSegmento siguen sin editor) — Fase 16.5
// solo agrega notas/plagas, mismo criterio ya confirmado.
//
// detalleCamaActual (Fase 16.5): a diferencia del diagnóstico original de
// 14.5 ("sin estado propio, no hay botones de acción que necesiten
// recordar sobre qué cama actuar"), ahora SÍ hace falta — el botón Guardar
// necesita saber sobre qué documento escribir. Solo se usa `.id`; no hace
// falta guardar una copia separada de notas/plagas porque los <textarea>
// ya son la fuente de verdad mientras el modal está abierto.
let detalleCamaActual = null;

function abrirDetalleCama(cama) {
    detalleCamaActual = cama;
    detalleCamaTitulo.textContent = cama.nombre || cama.id;
    detalleCamaNotasInput.value = cama.notas || '';
    detalleCamaPlagasInput.value = cama.plagas || '';
    openModal('detalleCamaModal');
}

detalleCamaModalClose.addEventListener('click', () => closeModal('detalleCamaModal'));

async function handleGuardarDetalleCama() {
    if (!detalleCamaActual) return;

    const notas = detalleCamaNotasInput.value.trim();
    const plagas = detalleCamaPlagasInput.value.trim();

    detalleCamaGuardarBtn.disabled = true;
    try {
        // Payload SOLO { notas, plagas } — mismo criterio de merge parcial
        // ya establecido con actualizarInventario, para no pisar tipo/
        // anillo/indiceSegmento/plantas por accidente.
        await actualizarDetalleCama(detalleCamaActual.id, { notas, plagas });
        // Mismo orden anti-parpadeo ya establecido (agregarPlantaACama,
        // cierre de cultivo): await iniciarHuerto() ANTES del toast, para
        // que camasActuales/el render en espiral ya reflejen el cambio
        // cuando el usuario vea la confirmación — incluye el `cama.plagas`
        // de solo lectura que ya se mostraba en detallePlantaModal.
        await iniciarHuerto();
        mostrarToast('Cama actualizada', 'green');
    } catch (e) {
        console.error('[main] Error actualizando la cama:', e);
        mostrarToast(e.message || 'No se pudo actualizar la cama', 'red');
    } finally {
        detalleCamaGuardarBtn.disabled = false;
    }
}

detalleCamaGuardarBtn.addEventListener('click', handleGuardarDetalleCama);

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

    // Cada apertura arranca con el formulario de cierre colapsado, aunque
    // el modal se haya dejado abierto a medio llenar en una planta anterior
    // — sin esto, abrir el detalle de OTRA planta podría heredar el estado
    // de formulario de la última que se estaba cerrando.
    ocultarFormularioCierre();

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

// ── PASO E: formulario de cierre de cultivo ─────────────────────────
// Sub-formulario dentro del mismo detallePlantaModal (ver diagnóstico) en
// vez de un modal separado — oculta los dos botones de acción y muestra el
// selector de rendimiento + campos opcionales; "Confirmar cierre" nace
// disabled hasta que se elige un rendimiento (cantidadObtenida/notaCierre
// pueden quedar vacíos, según el pedido).
function ocultarFormularioCierre() {
    detallePlantaCierreForm.style.display = 'none';
    detallePlantaSemillaBtn.style.display = '';
    detallePlantaCompletarBtn.style.display = '';

    cierreRendimientoTabs.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
    cierreCantidadInput.value = '';
    cierreNotaInput.value = '';
    detallePlantaCierreConfirmarBtn.disabled = true;
}

function mostrarFormularioCierre() {
    detallePlantaSemillaBtn.style.display = 'none';
    detallePlantaCompletarBtn.style.display = 'none';
    detallePlantaCierreForm.style.display = '';
}

detallePlantaCompletarBtn.addEventListener('click', () => {
    if (!detalleActual) return;
    mostrarFormularioCierre();
});

detallePlantaCierreCancelarBtn.addEventListener('click', () => {
    ocultarFormularioCierre();
});

cierreRendimientoTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    cierreRendimientoTabs.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    detallePlantaCierreConfirmarBtn.disabled = false;
});

detallePlantaCierreConfirmarBtn.addEventListener('click', async () => {
    if (!detalleActual) return;
    const { cama, plantaEntry } = detalleActual;
    const rendimientoBtn = cierreRendimientoTabs.querySelector('.filter-tab.active');
    if (!rendimientoBtn) return; // el botón está disabled sin selección, esto no debería disparar

    detallePlantaCierreConfirmarBtn.disabled = true;
    try {
        // plantaEntry se pasa TAL CUAL (no se reconstruye ningún campo a
        // mano) — crearHistorialCultivo saca fechaSiembra/plantaId/
        // plantaTipo/finalidad de ahí mismo (ver diagnóstico), así que
        // fechaSiembra queda preservada sin que este handler la toque.
        // fechaFinalizacion la genera crearHistorialCultivo con
        // serverTimestamp() — tampoco hay que pasarla.
        await crearHistorialCultivo({
            camaId: cama.id,
            plantaEntry,
            rendimiento: rendimientoBtn.dataset.rendimiento,
            cantidadObtenida: cierreCantidadInput.value.trim() || null,
            notaCierre: cierreNotaInput.value.trim() || null
        });
        // Mismo orden anti-parpadeo que detallePlantaSemillaBtn: refresca
        // ANTES de cerrar el modal.
        await iniciarHuerto();
        closeModal('detallePlantaModal');
        mostrarToast('Cultivo cerrado', 'green');
    } catch (e) {
        console.error('[main] Error cerrando cultivo:', e);
        // Mensaje real del error (ej. "Esa planta ya no está en la cama"
        // si alguien más ya la cerró) — formulario sigue abierto para
        // reintentar, closeModal NO se llama en este branch.
        mostrarToast(e.message || 'No se pudo cerrar el cultivo', 'red');
    } finally {
        detallePlantaCierreConfirmarBtn.disabled = false;
    }
});

// ── Estado de sesión — escucha 'auth:resuelto' (ver contrato en auth.js) ──
//
// Ya no hay callback pasado a AuthService.init(): el evento trae el
// payload completo (user, rol, error) y este listener decide a dónde ir.
// Los 4 casos del contrato, en el mismo orden que están documentados en
// auth.js: sin sesión / con sesión sin perfil / con sesión con perfil /
// error consultando el perfil.

document.addEventListener('auth:resuelto', (e) => {
    const { user, rol, nombre, error } = e.detail;

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

    setUsuarioActual({ uid: user.uid, email: user.email });

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
        newUserNombreInput.value = '';
        actualizarGatingSetup();
        loginOverlay.classList.add('hidden');
        navegarA('view-setup');
        return;
    }

    // Caso 3: con sesión, con perfil resuelto.
    mostrarDashboard(user, rol === 'admin', nombre);
});

AuthService.init();
