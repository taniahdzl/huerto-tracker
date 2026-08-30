// js/views/vista-tareas.js
//
// Vista de Tareas (Fase 13.5) — ya no es modal, es destino de navegación
// recurrente. "Crear" y "Completar" son modales puntuales (crearTareaModal/
// completarTareaModal), ambos solo visibles para admin. Rediseño de tareas
// (tipo/horas explícitas/foto de evidencia, reemplaza la Regla del Sábado
// fija de chores.js): completar ya no es un clic directo, pasa por
// completarTareaModal para poder pedir la foto cuando corresponde.
// abrirModalCompletarTarea() está exportada para que vista-proyectos.js
// reuse este mismo flujo desde un paso de proyecto (ver su comentario).
//
// estudiantesActuales se expone vía getEstudiantesActuales/
// setEstudiantesActuales porque vista-admin.js también lo usa (selector del
// modal de horas) — aunque en la práctica abrirAdminModal siempre vuelve a
// pedir el directorio en vez de confiar en este caché (ver su propio
// comentario), así que esto es consistencia de forma, no una dependencia de
// datos real entre las dos vistas. Extraído de main.js (Fase 19, división
// en módulos por vista).

import { AuthService } from '../services/auth.js';
import { obtenerTareas, crearTarea, completarTarea } from '../services/chores.js';
import { obtenerDirectorioCompleto } from '../services/usuarios.js';
import { renderListaTareas } from '../render/render.js';
import { nombreParaMostrar } from '../services/session.js';
import { mostrarToast, openModal, closeModal } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { getEsAdminActual } from '../shared/estado-app.js';

const tareasListaVista = document.getElementById('tareasListaVista');
const crearTareaBtn     = document.getElementById('crearTareaBtn');
const tareasFilterTabs  = document.querySelectorAll('#view-tareas .filter-tab');

const crearTareaModalClose = document.getElementById('crearTareaModalClose');
const crearTareaTitulo     = document.getElementById('crearTareaTitulo');
const crearTareaTipo       = document.getElementById('crearTareaTipo');
const crearTareaHoras      = document.getElementById('crearTareaHoras');
const crearTareaAssignees  = document.getElementById('crearTareaAssignees');
const crearTareaSaveBtn    = document.getElementById('crearTareaSaveBtn');

const completarTareaModalClose  = document.getElementById('completarTareaModalClose');
const completarTareaTitulo      = document.getElementById('completarTareaTitulo');
const completarTareaFotoLabel   = document.getElementById('completarTareaFotoLabel');
const completarTareaFoto        = document.getElementById('completarTareaFoto');
const completarTareaFotoPreview = document.getElementById('completarTareaFotoPreview');
const completarTareaSaveBtn     = document.getElementById('completarTareaSaveBtn');

let tareasActuales      = [];
let estudiantesActuales = [];
let filtroTareasActual  = 'mias';
let tareaEnCompletar    = null;
let onCompletadoExterno = null;

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

// Exportada — vista-proyectos.js la reusa para abrir el mismo flujo de
// completar/foto de evidencia desde un paso de proyecto, sin duplicar esta
// lógica (misma modal, mismo completarTarea() por debajo, mismas horas vía
// _registrarHoras). Recibe la tarea YA RESUELTA (no un id + lookup en
// tareasActuales) porque vista-proyectos.js ya la trae completa desde
// obtenerProyectosConProgreso() — pedirle un id obligaría a este módulo a
// tener tareasActuales poblado, que no está garantizado si se navega
// directo a Proyectos sin pasar antes por Tareas.
// `onCompletado` (opcional) se dispara tras un completado exitoso, ADEMÁS
// del cargarYRenderizarVistaTareas() de siempre — así el caller (ej. la
// galería de Proyectos) puede refrescar su propia vista sin que este
// módulo necesite saber que Proyectos existe.
export function abrirModalCompletarTarea(tarea, { onCompletado = null } = {}) {
    if (!tarea) return;
    tareaEnCompletar = tarea;
    onCompletadoExterno = onCompletado;

    completarTareaTitulo.textContent = tarea.titulo || 'Sin título';
    completarTareaFoto.value = '';
    completarTareaFotoPreview.src = '';
    completarTareaFotoPreview.classList.add('hidden');
    completarTareaFotoLabel.textContent = tarea.tipo === 'asistencia'
        ? 'Foto de evidencia (obligatoria)'
        : 'Foto de evidencia (opcional)';

    openModal('completarTareaModal');
}

// El clic en "✅ Completar" ya no completa directo — abre el modal único
// de finalización (mismo modal para ambos tipos). La foto solo se vuelve
// obligatoria si tipo:'asistencia' (ver handleCompletarTareaGuardar).
function handleCompletarTareaVista(tareaId) {
    const tarea = tareasActuales.find((t) => t.id === tareaId);
    abrirModalCompletarTarea(tarea);
}

completarTareaFoto.addEventListener('change', () => {
    const archivo = completarTareaFoto.files[0];
    if (!archivo) {
        completarTareaFotoPreview.classList.add('hidden');
        return;
    }
    completarTareaFotoPreview.src = URL.createObjectURL(archivo);
    completarTareaFotoPreview.classList.remove('hidden');
});

// Compresión del lado del cliente antes de subir — Canvas API nativa, sin
// dependencias nuevas. NO se prueba con jsdom (no implementa un
// getContext('2d')/toBlob reales sin el paquete `canvas`, que no es
// dependencia de este proyecto — mismo criterio de límites de jsdom ya
// documentado para PointerEvent/viewBox, ver AI_CONTEXT.md) — cubierto
// manualmente, ver punto 7 del diagnóstico de esta fase.
const EVIDENCIA_LADO_MAX_PX = 1600;
const EVIDENCIA_CALIDAD_JPEG = 0.7;

function comprimirImagen(archivo) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const escala = Math.min(1, EVIDENCIA_LADO_MAX_PX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * escala);
            canvas.height = Math.round(img.height * escala);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(img.src);
                blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen'));
            }, 'image/jpeg', EVIDENCIA_CALIDAD_JPEG);
        };
        img.onerror = () => reject(new Error('No se pudo leer el archivo de imagen'));
        img.src = URL.createObjectURL(archivo);
    });
}

async function handleCompletarTareaGuardar() {
    if (!tareaEnCompletar) return;
    const archivo = completarTareaFoto.files[0] || null;

    if (tareaEnCompletar.tipo === 'asistencia' && !archivo) {
        mostrarToast('Esta tarea requiere foto de evidencia', 'red');
        return;
    }

    // Deshabilita el botón específico (no un estado global) mientras la
    // escritura está en vuelo, para que un doble clic no dispare el
    // otorgamiento de horas dos veces sobre la misma tarea.
    const li = tareasListaVista.querySelector(`[data-tarea-id="${tareaEnCompletar.id}"]`);
    const botonLista = li?.querySelector('.chore-complete-btn');
    if (botonLista) botonLista.disabled = true;
    completarTareaSaveBtn.disabled = true;

    try {
        // Orden de operaciones: comprimir+subir la foto ANTES de tocar
        // Firestore (completarTarea espera la subida primero) — si falla,
        // completarTarea nunca llega a marcar 'completada', la tarea
        // queda 'pendiente' y este catch permite reintentar sin perder la
        // asignación de horas que le correspondía.
        const archivoComprimido = archivo ? await comprimirImagen(archivo) : null;
        await completarTarea(tareaEnCompletar.id, tareaEnCompletar.asignados || [], {
            horasAOtorgar: tareaEnCompletar.horasAOtorgar || 0,
            archivoEvidencia: archivoComprimido
        });
        closeModal('completarTareaModal');
        mostrarToast('Tarea completada', 'green');
        tareaEnCompletar = null;
        await cargarYRenderizarVistaTareas();
        if (onCompletadoExterno) {
            onCompletadoExterno();
            onCompletadoExterno = null;
        }
    } catch (e) {
        console.error('[vista-tareas] Error completando tarea:', e);
        mostrarToast('No se pudo completar la tarea — intenta de nuevo', 'red');
        if (botonLista) botonLista.disabled = false;
    } finally {
        completarTareaSaveBtn.disabled = false;
    }
}

completarTareaModalClose.addEventListener('click', () => closeModal('completarTareaModal'));
completarTareaSaveBtn.addEventListener('click', handleCompletarTareaGuardar);

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
    crearTareaTipo.value = '';
    crearTareaHoras.value = '';
    poblarAssigneesCrearTarea();
    openModal('crearTareaModal');
}

// Sugerencia de horas al crear: 15 solo si hoy es sábado Y el tipo
// elegido es 'asistencia' — editable, nunca bloqueada. `fecha` es
// inyectable (default new Date()) a propósito, para que esto sea
// testeable sin depender del día real del sistema — a diferencia de la
// vieja Regla del Sábado en chores.js, que documentaba esta misma
// limitación como excluida de los tests por no aceptar una fecha
// inyectada (ver AI_CONTEXT.md); acá se evitó desde el diseño.
export function calcularSugerenciaHoras(tipo, fecha = new Date()) {
    return (tipo === 'asistencia' && fecha.getDay() === 6) ? 15 : '';
}

crearTareaTipo.addEventListener('change', () => {
    crearTareaHoras.value = calcularSugerenciaHoras(crearTareaTipo.value);
});

async function handleCrearTareaGuardar() {
    const titulo = crearTareaTitulo.value.trim();
    if (!titulo) {
        mostrarToast('La tarea necesita un título', 'red');
        return;
    }

    const tipo = crearTareaTipo.value;
    if (!tipo) {
        mostrarToast('Selecciona un tipo de tarea', 'red');
        return;
    }

    const asignados = Array.from(crearTareaAssignees.querySelectorAll('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value);

    if (asignados.length === 0) {
        mostrarToast('Selecciona al menos un estudiante', 'red');
        return;
    }

    const horasAOtorgar = crearTareaHoras.value ? Number(crearTareaHoras.value) : 0;

    crearTareaSaveBtn.disabled = true;
    try {
        await crearTarea({ titulo, tipo, asignados, horasAOtorgar });
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
