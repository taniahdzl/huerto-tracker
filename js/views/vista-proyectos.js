// js/views/vista-proyectos.js
//
// Vista de Proyectos (galería de tarjetas) — organiza tareas EXISTENTES vía
// tareas.proyectoId, nunca las duplica (ver js/services/proyectos.js). Vista
// propia (view-proyectos), no una pestaña dentro de Tareas: la galería es un
// grid de tarjetas, un layout distinto al de la lista plana de Tareas/
// Catálogos, así que el patrón de tabs (mismo shape de item, distinta
// categoría) no encaja igual acá.
//
// Visibilidad admin-only de "+ Nuevo proyecto"/"+ Agregar paso": patrón
// local (estilo vista-catalogos.js), NO el patrón heredado de
// vista-dashboard.js que togglea crearTareaBtn centralmente — ver nota en
// .claude/skills/add-feature/SKILL.md sobre por qué éste es el patrón
// canónico para vistas nuevas.
//
// Completar un paso reusa abrirModalCompletarTarea() (exportada de
// vista-tareas.js) — mismo modal, mismo completarTarea()/_registrarHoras()
// de siempre, sin camino alterno para otorgar horas.
//
// Gestión de proyectos (2026-09-19): Concluir/Reactivar/Eliminar, toggle
// Activos/Concluidos. Eliminar un proyecto NO borra sus tareas (decisión
// confirmada con la usuaria) — quedan sueltas con `proyectoId` apuntando a
// un doc que ya no existe, mismo criterio de "no inventar cascadas
// destructivas" del resto del proyecto (ver comentario de cabecera de
// eliminarProyecto, proyectos.js). El toggle solo distingue
// 'activo'/'completado' — 'pausado' existe en el esquema pero no tiene UI
// (fuera de alcance de esta fase, ningún flujo real lo produce todavía).

import { crearProyecto, agregarPasoAProyecto, obtenerProyectosConProgreso, actualizarEstadoProyecto, eliminarProyecto } from '../services/proyectos.js';
import { obtenerDirectorioCompleto } from '../services/usuarios.js';
import { renderGaleriaProyectos } from '../render/render.js';
import { nombreParaMostrar } from '../services/session.js';
import { mostrarToast, openModal, closeModal } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { getEsAdminActual } from '../shared/estado-app.js';
import { abrirModalCompletarTarea, calcularSugerenciaHorasEfectivas, textoPreviewHoras } from './vista-tareas.js';

const proyectosGaleria = document.getElementById('proyectosGaleria');
const proyectosVacio   = document.getElementById('proyectosVacio');
const crearProyectoBtn = document.getElementById('crearProyectoBtn');
const proyectosFilterTabs = document.querySelectorAll('#view-proyectos .filter-tab');

const crearProyectoModalClose  = document.getElementById('crearProyectoModalClose');
const crearProyectoNombre      = document.getElementById('crearProyectoNombre');
const crearProyectoDescripcion = document.getElementById('crearProyectoDescripcion');
const crearProyectoFecha       = document.getElementById('crearProyectoFecha');
const crearProyectoSaveBtn     = document.getElementById('crearProyectoSaveBtn');

const agregarPasoModalClose  = document.getElementById('agregarPasoModalClose');
const agregarPasoTitulo      = document.getElementById('agregarPasoTitulo');
const agregarPasoTipo        = document.getElementById('agregarPasoTipo');
const agregarPasoHoras       = document.getElementById('agregarPasoHoras');
const agregarPasoHorasPreview = document.getElementById('agregarPasoHorasPreview');
const agregarPasoFechaLimite = document.getElementById('agregarPasoFechaLimite');
const agregarPasoOrden       = document.getElementById('agregarPasoOrden');
const agregarPasoAssignees   = document.getElementById('agregarPasoAssignees');
const agregarPasoSaveBtn     = document.getElementById('agregarPasoSaveBtn');

let proyectosActuales   = [];
let estudiantesActuales = [];
let proyectoEnEdicion   = null;
let filtroProyectosActual = 'activo';

export function irAVistaProyectos() {
    navegarA('view-proyectos');
    cargarYRenderizarProyectos();
}

async function cargarYRenderizarProyectos() {
    try {
        const [proyectos, estudiantes] = await Promise.all([
            obtenerProyectosConProgreso(), obtenerDirectorioCompleto()
        ]);
        proyectosActuales = proyectos;
        estudiantesActuales = estudiantes;
        renderizarVistaProyectos();
    } catch (e) {
        console.error('[vista-proyectos] Error cargando proyectos:', e);
        mostrarToast('No se pudieron cargar los proyectos', 'red');
    }
}

function renderizarVistaProyectos() {
    const esAdmin = getEsAdminActual();
    // Patrón local (estilo Catálogos) — ver cabecera del archivo.
    crearProyectoBtn.style.display = esAdmin ? '' : 'none';

    // Activo == 'activo'; Concluidos == 'completado' — filtrado en cliente
    // sobre lo ya cargado, mismo patrón que mías/todas en Tareas (sin
    // volver a pedir a Firestore por cambiar de pestaña).
    const estadoObjetivo = filtroProyectosActual === 'concluido' ? 'completado' : 'activo';
    const proyectosFiltrados = proyectosActuales.filter((p) => p.estado === estadoObjetivo);

    renderGaleriaProyectos(proyectosFiltrados, proyectosGaleria, abrirPaso, {
        esAdmin,
        onAgregarPaso: abrirAgregarPasoModal,
        onConcluir: handleConcluirProyecto,
        onReactivar: handleReactivarProyecto,
        onEliminar: handleEliminarProyecto
    });

    proyectosVacio.textContent = filtroProyectosActual === 'concluido'
        ? 'No hay proyectos concluidos todavía.'
        : 'No hay proyectos activos.';
    proyectosVacio.style.display = proyectosFiltrados.length === 0 ? '' : 'none';
}

proyectosFilterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        filtroProyectosActual = tab.dataset.filtroProyecto;
        proyectosFilterTabs.forEach((t) => t.classList.toggle('active', t === tab));
        renderizarVistaProyectos();
    });
});

// Clic en un paso: reutiliza abrirModalCompletarTarea (vista-tareas.js) —
// mismo modal/flujo de completar+foto de evidencia, no se duplica acá.
// Solo admin + paso pendiente abre algo: mismo criterio de RBAC de cliente
// que renderListaTareas (la seguridad real está en firestore.rules, esto
// solo evita ofrecer una acción que el backend rechazaría). Un paso ya
// completado no abre nada — no existe una vista de detalle de solo
// lectura para una tarea completada, el check + el progreso de la tarjeta
// ya comunican el estado, no se inventa un modal nuevo para eso.
function abrirPaso(paso) {
    if (!getEsAdminActual() || !paso.tarea || paso.tarea.estado === 'completada') return;
    abrirModalCompletarTarea(paso.tarea, { onCompletado: cargarYRenderizarProyectos });
}

// ── Modal "Nuevo Proyecto" (admin) ──────────────────────────────────

function abrirCrearProyectoModal() {
    crearProyectoNombre.value = '';
    crearProyectoDescripcion.value = '';
    crearProyectoFecha.value = '';
    openModal('crearProyectoModal');
}

async function handleCrearProyectoGuardar() {
    const nombre = crearProyectoNombre.value.trim();
    if (!nombre) {
        mostrarToast('El proyecto necesita un nombre', 'red');
        return;
    }

    crearProyectoSaveBtn.disabled = true;
    try {
        await crearProyecto({
            nombre,
            descripcion: crearProyectoDescripcion.value.trim(),
            fechaObjetivo: crearProyectoFecha.value || null
        });
        closeModal('crearProyectoModal');
        mostrarToast('Proyecto creado', 'green');
        await cargarYRenderizarProyectos();
    } catch (e) {
        console.error('[vista-proyectos] Error creando proyecto:', e);
        mostrarToast('No se pudo crear el proyecto', 'red');
    } finally {
        crearProyectoSaveBtn.disabled = false;
    }
}

crearProyectoBtn.addEventListener('click', abrirCrearProyectoModal);
crearProyectoModalClose.addEventListener('click', () => closeModal('crearProyectoModal'));
crearProyectoSaveBtn.addEventListener('click', handleCrearProyectoGuardar);

// ── Modal "Agregar Paso" (admin) ────────────────────────────────────
// Mismo patrón de chips que crearTareaModal (vista-tareas.js) — no se
// reusa el DOM (son modales distintos) pero sí el criterio de armado.

function poblarAssigneesAgregarPaso() {
    agregarPasoAssignees.replaceChildren();
    estudiantesActuales.forEach((estudiante) => {
        const label = document.createElement('label');
        label.className = 'chore-assignee-chip';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = estudiante.id;

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(nombreParaMostrar(estudiante)));

        agregarPasoAssignees.appendChild(label);
    });
}

function abrirAgregarPasoModal(proyectoId) {
    proyectoEnEdicion = proyectoId;
    const proyecto = proyectosActuales.find((p) => p.id === proyectoId);

    agregarPasoTitulo.value = '';
    agregarPasoTipo.value = '';
    agregarPasoHoras.value = '';
    agregarPasoHorasPreview.textContent = '';
    agregarPasoFechaLimite.value = '';
    // Siguiente número libre como sugerencia — orden es informativo, no
    // bloqueante (confirmado en requisitos), el admin puede cambiarlo.
    agregarPasoOrden.value = (proyecto?.pasos.length || 0) + 1;
    poblarAssigneesAgregarPaso();
    openModal('agregarPasoModal');
}

function actualizarPreviewAgregarPaso() {
    agregarPasoHorasPreview.textContent = textoPreviewHoras(agregarPasoTipo.value, Number(agregarPasoHoras.value));
}

// Misma sugerencia de horas EFECTIVAS que crearTareaModal (2026-09-19) —
// la regla ("4h efectivas si es sábado y tipo:'trabajo_fisico'") no es
// exclusiva del formulario de Tareas, aplica a cualquier formulario que
// cree una tarea.
agregarPasoTipo.addEventListener('change', () => {
    agregarPasoHoras.value = calcularSugerenciaHorasEfectivas(agregarPasoTipo.value);
    actualizarPreviewAgregarPaso();
});
agregarPasoHoras.addEventListener('input', actualizarPreviewAgregarPaso);

async function handleAgregarPasoGuardar() {
    if (!proyectoEnEdicion) return;

    const titulo = agregarPasoTitulo.value.trim();
    if (!titulo) {
        mostrarToast('El paso necesita un título', 'red');
        return;
    }

    const tipo = agregarPasoTipo.value;
    if (!tipo) {
        mostrarToast('Selecciona un tipo de tarea', 'red');
        return;
    }

    const asignados = Array.from(agregarPasoAssignees.querySelectorAll('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value);
    if (asignados.length === 0) {
        mostrarToast('Selecciona al menos un estudiante', 'red');
        return;
    }

    // horasEfectivas, no horasAOtorgar (2026-09-19) — ver comentario en
    // handleCrearTareaGuardar (vista-tareas.js).
    const horasEfectivas = agregarPasoHoras.value ? Number(agregarPasoHoras.value) : 0;
    const fechaLimite = agregarPasoFechaLimite.value || null;
    const orden = agregarPasoOrden.value ? Number(agregarPasoOrden.value) : 1;

    agregarPasoSaveBtn.disabled = true;
    try {
        await agregarPasoAProyecto(proyectoEnEdicion, { titulo, tipo, asignados, horasEfectivas, fechaLimite }, orden);
        closeModal('agregarPasoModal');
        mostrarToast('Paso agregado', 'green');
        proyectoEnEdicion = null;
        await cargarYRenderizarProyectos();
    } catch (e) {
        console.error('[vista-proyectos] Error agregando paso:', e);
        mostrarToast('No se pudo agregar el paso', 'red');
    } finally {
        agregarPasoSaveBtn.disabled = false;
    }
}

agregarPasoModalClose.addEventListener('click', () => closeModal('agregarPasoModal'));
agregarPasoSaveBtn.addEventListener('click', handleAgregarPasoGuardar);

// ── Concluir / Reactivar / Eliminar (admin) ─────────────────────────
// Sin modal de confirmación para Concluir/Reactivar (reversible entre sí,
// una es la inversa exacta de la otra) — sí para Eliminar (irreversible),
// mismo window.confirm nativo que ya usa el resto del proyecto para
// borrados (vista-catalogos.js, vista-tareas.js).

async function handleConcluirProyecto(proyectoId) {
    try {
        await actualizarEstadoProyecto(proyectoId, 'completado');
        mostrarToast('Proyecto concluido', 'green');
        await cargarYRenderizarProyectos();
    } catch (e) {
        console.error('[vista-proyectos] Error concluyendo el proyecto:', e);
        mostrarToast('No se pudo concluir el proyecto', 'red');
    }
}

async function handleReactivarProyecto(proyectoId) {
    try {
        await actualizarEstadoProyecto(proyectoId, 'activo');
        mostrarToast('Proyecto reactivado', 'green');
        await cargarYRenderizarProyectos();
    } catch (e) {
        console.error('[vista-proyectos] Error reactivando el proyecto:', e);
        mostrarToast('No se pudo reactivar el proyecto', 'red');
    }
}

async function handleEliminarProyecto(proyectoId) {
    if (!window.confirm('¿Eliminar este proyecto? Sus tareas NO se eliminan — quedan sueltas en Tareas.')) return;
    try {
        await eliminarProyecto(proyectoId);
        mostrarToast('Proyecto eliminado', 'green');
        await cargarYRenderizarProyectos();
    } catch (e) {
        console.error('[vista-proyectos] Error eliminando el proyecto:', e);
        mostrarToast('No se pudo eliminar el proyecto', 'red');
    }
}
