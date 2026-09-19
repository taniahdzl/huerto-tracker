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
//
// Autonomía en pasos de Proyectos (2026-09-19): "+ Agregar paso" dejó de
// ser admin-only — mismo criterio ya aplicado a "+ Crear tarea" en Tareas
// (2026-09-06). agregarPasoOrigenGroup/agregarPasoOrdenGroup (HTML) solo
// se muestran a admin, igual que crearTareaOrigenGroup en vista-tareas.js
// — un no-admin siempre crea vía agregarPasoPropio (proyectos.js), sin ver
// ninguno de los dos selectores. Editar/enviar a revisión un paso propio
// reusa abrirEditarTareaModal() (exportada de vista-tareas.js) — mismo
// modal/flujo que ya tiene Tareas, sin duplicar lógica de compresión/
// subida de evidencia acá. La aprobación de admin no necesitó ningún
// cambio: el panel "Tareas en Revisión" (vista-admin.js) ya filtra por
// origen/estado sobre TODAS las tareas, sin importar si tienen
// `proyectoId`.
//
// admin vs. no-admin al guardar "Agregar Paso" son dos caminos DISTINTOS
// (ver handleAgregarPasoGuardar) — admin sigue usando agregarPasoAProyecto
// (batch, escribe /proyectos.pasos); no-admin usa agregarPasoPropio (nunca
// toca /proyectos). No es una simplificación cosmética: firestore.rules
// deja /proyectos estrictamente admin-only — un primer diseño que
// permitía a un no-admin actualizar `pasos` directamente resultó
// explotable en auditoría (cualquiera podía inyectar referencias falsas
// sin crear ninguna tarea real) y se descartó. Ver comentario de cabecera
// de agregarPasoPropio/obtenerProyectosConProgreso (proyectos.js) para el
// diseño que sí se usó.
//
// Bug real encontrado al testear (no solo del test): abrirEditarTareaModal
// puebla sus checkboxes de asignados desde el `estudiantesActuales` de
// vista-tareas.js (su propio caché de módulo, separado del de este
// archivo) — si la persona nunca visitó Tareas antes de entrar a
// Proyectos, ese caché sigue vacío y el modal de edición se abre sin
// ningún estudiante para marcar, bloqueando el guardado ("Selecciona al
// menos un estudiante"). Se sincroniza con setEstudiantesActuales() —ya
// exportada de antes para vista-admin.js— justo antes de abrir el modal,
// con el directorio que Proyectos YA cargó (obtenerDirectorioCompleto en
// cargarYRenderizarProyectos), sin pedirlo dos veces.

import { crearProyecto, agregarPasoAProyecto, agregarPasoPropio, obtenerProyectosConProgreso, actualizarEstadoProyecto, eliminarProyecto } from '../services/proyectos.js';
import { obtenerDirectorioCompleto } from '../services/usuarios.js';
import { renderGaleriaProyectos } from '../render/render.js';
import { nombreParaMostrar } from '../services/session.js';
import { mostrarToast, openModal, closeModal } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { getEsAdminActual } from '../shared/estado-app.js';
import { AuthService } from '../services/auth.js';
import { abrirModalCompletarTarea, abrirEditarTareaModal, calcularSugerenciaHorasEfectivas, textoPreviewHoras, fechaHoyLocal, setEstudiantesActuales as setEstudiantesActualesTareas } from './vista-tareas.js';

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
const agregarPasoOrigenGroup = document.getElementById('agregarPasoOrigenGroup');
const agregarPasoOrigen      = document.getElementById('agregarPasoOrigen');
const agregarPasoTitulo      = document.getElementById('agregarPasoTitulo');
const agregarPasoTipo        = document.getElementById('agregarPasoTipo');
const agregarPasoHoras       = document.getElementById('agregarPasoHoras');
const agregarPasoHorasPreview = document.getElementById('agregarPasoHorasPreview');
const agregarPasoFechaLimite = document.getElementById('agregarPasoFechaLimite');
const agregarPasoFechaRealizada = document.getElementById('agregarPasoFechaRealizada');
const agregarPasoOrdenGroup  = document.getElementById('agregarPasoOrdenGroup');
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

// Clic en un paso — se bifurca según origen (2026-09-19), mismo criterio
// de RBAC de cliente que renderListaTareas (la seguridad real está en
// firestore.rules, esto solo evita ofrecer una acción que el backend
// rechazaría):
//   'asignada'     -> solo admin + pendiente, reusa abrirModalCompletarTarea
//                      (sin cambios, comportamiento de siempre).
//   'autoasignada' -> solo el CREADOR, y solo mientras 'pendiente'/
//                      'rechazada' (editable) — reusa abrirEditarTareaModal
//                      (vista-tareas.js). 'en_revision'/'completada' quedan
//                      congeladas — no se inventa una vista de detalle de
//                      solo lectura para ninguno de los dos orígenes.
function abrirPaso(paso) {
    if (!paso.tarea) return;
    const tarea = paso.tarea;
    const origen = tarea.origen === 'autoasignada' ? 'autoasignada' : 'asignada';

    if (origen === 'autoasignada') {
        const uid = AuthService.getCurrentUser()?.uid;
        const esCreador = uid != null && tarea.creadorId === uid;
        if (esCreador && ['pendiente', 'rechazada'].includes(tarea.estado)) {
            // Sincroniza el caché de vista-tareas.js ANTES de abrir el
            // modal — ver comentario de cabecera de este archivo.
            setEstudiantesActualesTareas(estudiantesActuales);
            abrirEditarTareaModal(tarea, { onGuardado: cargarYRenderizarProyectos });
        }
        return;
    }

    if (!getEsAdminActual() || tarea.estado === 'completada') return;
    abrirModalCompletarTarea(tarea, { onCompletado: cargarYRenderizarProyectos });
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

// Mismo criterio que actualizarPreseleccionPropia en vista-tareas.js: en
// modo autoasignada (siempre para no-admin; opcional para admin vía el
// selector) se pre-marca — no se fuerza — el checkbox del propio usuario.
function actualizarPreseleccionPropiaPaso() {
    const uid = AuthService.getCurrentUser()?.uid;
    const origenEfectivo = getEsAdminActual() ? agregarPasoOrigen.value : 'autoasignada';
    if (origenEfectivo !== 'autoasignada' || !uid) return;
    const propio = agregarPasoAssignees.querySelector(`input[value="${uid}"]`);
    if (propio) propio.checked = true;
}

function abrirAgregarPasoModal(proyectoId) {
    proyectoEnEdicion = proyectoId;
    const proyecto = proyectosActuales.find((p) => p.id === proyectoId);
    const esAdmin = getEsAdminActual();

    agregarPasoOrigenGroup.style.display = esAdmin ? '' : 'none';
    agregarPasoOrigen.value = 'asignada';
    agregarPasoTitulo.value = '';
    agregarPasoTipo.value = '';
    agregarPasoHoras.value = '';
    agregarPasoHorasPreview.textContent = '';
    agregarPasoFechaLimite.value = '';
    const hoy = fechaHoyLocal();
    agregarPasoFechaRealizada.max = hoy;
    agregarPasoFechaRealizada.value = hoy;
    // Orden es admin-only (2026-09-19) — un paso autoasignado no participa
    // del array `pasos` con orden manual (ver agregarPasoPropio,
    // proyectos.js), así que no tiene sentido pedirlo a un no-admin.
    agregarPasoOrdenGroup.style.display = esAdmin ? '' : 'none';
    // Siguiente número libre como sugerencia — orden es informativo, no
    // bloqueante (confirmado en requisitos), el admin puede cambiarlo.
    agregarPasoOrden.value = (proyecto?.pasos.length || 0) + 1;
    poblarAssigneesAgregarPaso();
    actualizarPreseleccionPropiaPaso();
    openModal('agregarPasoModal');
}

function actualizarPreviewAgregarPaso() {
    agregarPasoHorasPreview.textContent = textoPreviewHoras(agregarPasoTipo.value, Number(agregarPasoHoras.value));
}

agregarPasoOrigen.addEventListener('change', actualizarPreseleccionPropiaPaso);

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
    const fechaRealizada = agregarPasoFechaRealizada.value || fechaHoyLocal();
    const esAdmin = getEsAdminActual();

    agregarPasoSaveBtn.disabled = true;
    try {
        if (esAdmin) {
            // Un no-admin nunca ve agregarPasoOrigenGroup — pero esta rama
            // solo corre si esAdmin=true, así que agregarPasoOrigen.value
            // sí refleja una elección real del formulario.
            const origen = agregarPasoOrigen.value;
            const orden = agregarPasoOrden.value ? Number(agregarPasoOrden.value) : 1;
            await agregarPasoAProyecto(proyectoEnEdicion, { titulo, tipo, asignados, horasEfectivas, fechaLimite, fechaRealizada, origen }, orden);
        } else {
            // No-admin: SIEMPRE agregarPasoPropio (autoasignada, sin tocar
            // /proyectos — ver comentario de cabecera de ese archivo) —
            // nunca agregarPasoAProyecto, que requeriría permiso de
            // escritura sobre /proyectos que un no-admin no tiene.
            await agregarPasoPropio(proyectoEnEdicion, { titulo, tipo, asignados, horasEfectivas, fechaLimite, fechaRealizada });
        }
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
