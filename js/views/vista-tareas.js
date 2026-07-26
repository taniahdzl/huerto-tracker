// js/vista-tareas.js
//
// Vista de Tareas (Fase 13.5) — ya no es modal, es destino de navegación
// recurrente. "Crear" sigue siendo un modal puntual (crearTareaModal), solo
// visible para admin.
//
// estudiantesActuales se expone vía getEstudiantesActuales/
// setEstudiantesActuales porque vista-admin.js también lo usa (selector del
// modal de horas) — aunque en la práctica abrirAdminModal siempre vuelve a
// pedir el directorio en vez de confiar en este caché (ver su propio
// comentario), así que esto es consistencia de forma, no una dependencia de
// datos real entre las dos vistas. Extraído de main.js (Fase 19, división
// en módulos por vista).

import { AuthService } from './auth.js';
import { obtenerTareas, crearTarea, completarTarea } from './chores.js';
import { obtenerDirectorioCompleto } from './usuarios.js';
import { renderListaTareas } from './render.js';
import { nombreParaMostrar } from './session.js';
import { mostrarToast, openModal, closeModal } from './core-ui.js';
import { navegarA } from './router.js';
import { getEsAdminActual } from './estado-app.js';

const tareasListaVista = document.getElementById('tareasListaVista');
const crearTareaBtn     = document.getElementById('crearTareaBtn');
const tareasFilterTabs  = document.querySelectorAll('#view-tareas .filter-tab');

const crearTareaModalClose = document.getElementById('crearTareaModalClose');
const crearTareaTitulo     = document.getElementById('crearTareaTitulo');
const crearTareaAssignees  = document.getElementById('crearTareaAssignees');
const crearTareaSaveBtn    = document.getElementById('crearTareaSaveBtn');

let tareasActuales      = [];
let estudiantesActuales = [];
let filtroTareasActual  = 'mias';

export function getEstudiantesActuales() {
    return estudiantesActuales;
}

export function setEstudiantesActuales(valor) {
    estudiantesActuales = valor;
}

export function irAVistaTareas() {
    navegarA('view-tareas');
    cargarYRenderizarVistaTareas();
}

async function cargarYRenderizarVistaTareas() {
    try {
        // obtenerDirectorioCompleto() (no la versión filtrada a
        // 'estudiante'): el selector de asignados de "+ Crear tarea"
        // necesita poder asignar tareas a cualquier rol, incluido admin.
        // vista-admin.js sigue usando obtenerDirectorioEstudiantes() sin
        // cambios — no depende de este call site.
        const [tareas, estudiantes] = await Promise.all([obtenerTareas(), obtenerDirectorioCompleto()]);
        tareasActuales = tareas;
        estudiantesActuales = estudiantes;
        renderizarVistaTareas();
    } catch (e) {
        console.error('[vista-tareas] Error cargando tareas:', e);
        mostrarToast('No se pudieron cargar las tareas', 'red');
    }
}

// Re-filtra/re-pinta con lo ya cacheado — no vuelve a pedir a Firestore (lo
// usan las pestañas de filtro, que solo cambian qué se muestra, no qué
// existe).
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

    renderListaTareas(tareasEnriquecidas, tareasListaVista, handleCompletarTareaVista, { esAdmin: getEsAdminActual() });
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
    // escritura está en vuelo, para que un doble clic no dispare la Regla
    // del Sábado dos veces sobre la misma tarea.
    const li = tareasListaVista.querySelector(`[data-tarea-id="${tareaId}"]`);
    const boton = li?.querySelector('.chore-complete-btn');
    if (boton) boton.disabled = true;

    try {
        await completarTarea(tareaId, tarea.asignados || []);
        mostrarToast('Tarea completada', 'green');
        await cargarYRenderizarVistaTareas();
    } catch (e) {
        console.error('[vista-tareas] Error completando tarea:', e);
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
        console.error('[vista-tareas] Error creando tarea:', e);
        mostrarToast('No se pudo crear la tarea', 'red');
    } finally {
        crearTareaSaveBtn.disabled = false;
    }
}

crearTareaBtn.addEventListener('click', abrirCrearTareaModal);
crearTareaModalClose.addEventListener('click', () => closeModal('crearTareaModal'));
crearTareaSaveBtn.addEventListener('click', handleCrearTareaGuardar);
