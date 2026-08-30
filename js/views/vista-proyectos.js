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

import { crearProyecto, agregarPasoAProyecto, obtenerProyectosConProgreso } from '../services/proyectos.js';
import { obtenerDirectorioCompleto } from '../services/usuarios.js';
import { renderGaleriaProyectos } from '../render/render.js';
import { nombreParaMostrar } from '../services/session.js';
import { mostrarToast, openModal, closeModal } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { getEsAdminActual } from '../shared/estado-app.js';
import { abrirModalCompletarTarea, calcularSugerenciaHoras } from './vista-tareas.js';

const proyectosGaleria = document.getElementById('proyectosGaleria');
const crearProyectoBtn = document.getElementById('crearProyectoBtn');

const crearProyectoModalClose  = document.getElementById('crearProyectoModalClose');
const crearProyectoNombre      = document.getElementById('crearProyectoNombre');
const crearProyectoDescripcion = document.getElementById('crearProyectoDescripcion');
const crearProyectoFecha       = document.getElementById('crearProyectoFecha');
const crearProyectoSaveBtn     = document.getElementById('crearProyectoSaveBtn');

const agregarPasoModalClose  = document.getElementById('agregarPasoModalClose');
const agregarPasoTitulo      = document.getElementById('agregarPasoTitulo');
const agregarPasoTipo        = document.getElementById('agregarPasoTipo');
const agregarPasoHoras       = document.getElementById('agregarPasoHoras');
const agregarPasoFechaLimite = document.getElementById('agregarPasoFechaLimite');
const agregarPasoOrden       = document.getElementById('agregarPasoOrden');
const agregarPasoAssignees   = document.getElementById('agregarPasoAssignees');
const agregarPasoSaveBtn     = document.getElementById('agregarPasoSaveBtn');

let proyectosActuales   = [];
let estudiantesActuales = [];
let proyectoEnEdicion   = null;

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
    renderGaleriaProyectos(proyectosActuales, proyectosGaleria, abrirPaso, {
        esAdmin,
        onAgregarPaso: abrirAgregarPasoModal
    });
}

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
    agregarPasoFechaLimite.value = '';
    // Siguiente número libre como sugerencia — orden es informativo, no
    // bloqueante (confirmado en requisitos), el admin puede cambiarlo.
    agregarPasoOrden.value = (proyecto?.pasos.length || 0) + 1;
    poblarAssigneesAgregarPaso();
    openModal('agregarPasoModal');
}

// Misma sugerencia de horas que crearTareaModal — la regla ("15h si es
// sábado y tipo:'asistencia'") no es exclusiva del formulario de Tareas,
// aplica a cualquier formulario que cree una tarea.
agregarPasoTipo.addEventListener('change', () => {
    agregarPasoHoras.value = calcularSugerenciaHoras(agregarPasoTipo.value);
});

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

    const horasAOtorgar = agregarPasoHoras.value ? Number(agregarPasoHoras.value) : 0;
    const fechaLimite = agregarPasoFechaLimite.value || null;
    const orden = agregarPasoOrden.value ? Number(agregarPasoOrden.value) : 1;

    agregarPasoSaveBtn.disabled = true;
    try {
        await agregarPasoAProyecto(proyectoEnEdicion, { titulo, tipo, asignados, horasAOtorgar, fechaLimite }, orden);
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
