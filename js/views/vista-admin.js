// js/views/vista-admin.js
//
// Tres secciones históricamente separadas en main.js, fusionadas acá porque
// comparten el mismo gate de rol (VISTAS_ADMIN, router.js):
//
// - "Panel de Admin": el modal de ajuste manual de horas
//   (poblarSelectorAdmin/abrirAdminModal/handleAdminSave).
// - "Tareas en Revisión" (2026-09-06): panel de aprobación de autoasignadas
//   — ver comentario junto a cargarYRenderizarRevision más abajo.
// - "Vista de Admin" (Fase 13.8): el log de auditoría con sus 4 filtros
//   (irAVistaAdmin/cargarYRenderizarVistaAdmin/poblarFiltrosAuditoria/
//   aplicarFiltrosAuditoria/limpiarFiltrosAuditoria).
//
// "Quién" en el registro de actividad usa entrada.usuario directo (ya es el
// email, guardado por cada _logActividad — Fase 14.1: se mantiene como
// identificador estable, NO como display name, a propósito) — no resuelve
// contra obtenerDirectorioEstudiantes(), que además no tendría a los
// admins. Extraído de main.js (Fase 19, división en módulos por vista).

import { obtenerDirectorioEstudiantes, obtenerDirectorioCompleto, ajustarHoras } from '../services/usuarios.js';
import { obtenerRegistroActividad, extraerLinkIndice } from '../services/db.js';
import { obtenerTareas, aprobarTareaAutoasignada, rechazarTareaAutoasignada, obtenerHorasPorPeriodo } from '../services/chores.js';
import { renderRegistroActividad, renderResumenHoras, renderRevisionTareas, renderReporteHoras } from '../render/render.js';
import { nombreParaMostrar } from '../services/session.js';
import { mostrarToast, openModal, closeModal } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { getEstudiantesActuales, setEstudiantesActuales, fechaHoyLocal } from './vista-tareas.js';

const adminModalClose    = document.getElementById('adminModalClose');
const adminStudentSelect = document.getElementById('adminStudentSelect');
const adminHoursInput    = document.getElementById('adminHoursInput');
const adminHoursMotivo   = document.getElementById('adminHoursMotivo');
const adminHoursFecha    = document.getElementById('adminHoursFecha');
const adminSaveBtn       = document.getElementById('adminSaveBtn');

const abrirAjusteHorasBtn   = document.getElementById('abrirAjusteHorasBtn');
const resumenHorasBody      = document.getElementById('resumenHorasBody');
const registroActividadBody = document.getElementById('registroActividadBody');

const revisionTareasLista            = document.getElementById('revisionTareasLista');
const revisionVacio                  = document.getElementById('revisionVacio');
const revisionSeleccionarTodasBtn    = document.getElementById('revisionSeleccionarTodasBtn');
const revisionAprobarSeleccionadasBtn = document.getElementById('revisionAprobarSeleccionadasBtn');
const revisionAprobarTodasBtn        = document.getElementById('revisionAprobarTodasBtn');

const rechazarTareaModalClose    = document.getElementById('rechazarTareaModalClose');
const rechazarTareaTitulo        = document.getElementById('rechazarTareaTitulo');
const rechazarTareaMotivo        = document.getElementById('rechazarTareaMotivo');
const rechazarTareaConfirmarBtn  = document.getElementById('rechazarTareaConfirmarBtn');

const auditoriaFiltroTipo        = document.getElementById('auditoriaFiltroTipo');
const auditoriaFiltroPersona     = document.getElementById('auditoriaFiltroPersona');
const auditoriaFiltroDesde       = document.getElementById('auditoriaFiltroDesde');
const auditoriaFiltroHasta       = document.getElementById('auditoriaFiltroHasta');
const auditoriaLimpiarFiltrosBtn = document.getElementById('auditoriaLimpiarFiltrosBtn');
const auditoriaErrorIndice       = document.getElementById('auditoriaErrorIndice');
const auditoriaVacio             = document.getElementById('auditoriaVacio');

const reportePendientesAviso  = document.getElementById('reportePendientesAviso');
const reporteFechaInicio      = document.getElementById('reporteFechaInicio');
const reporteFechaFin         = document.getElementById('reporteFechaFin');
const reporteGenerarBtn       = document.getElementById('reporteGenerarBtn');
const reporteMesaDirectivaBody = document.getElementById('reporteMesaDirectivaBody');
const reportePrestadoresBody  = document.getElementById('reportePrestadoresBody');
const reporteVacio            = document.getElementById('reporteVacio');

// ── Panel de Admin (modal de horas) ─────────────────────────────────

function poblarSelectorAdmin() {
    adminStudentSelect.innerHTML = '<option value="">Selecciona un estudiante...</option>';
    getEstudiantesActuales().forEach((estudiante) => {
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
        setEstudiantesActuales(await obtenerDirectorioEstudiantes());
    } catch (e) {
        console.error('[vista-admin] Error cargando directorio de estudiantes:', e);
        mostrarToast('No se pudo cargar el directorio', 'red');
        return;
    }
    poblarSelectorAdmin();
    adminHoursInput.value = '';
    adminHoursMotivo.value = '';
    // Default hoy, editable — backdatear es para migraciones históricas
    // (ver comentario junto a adminHoursFecha en index.html).
    adminHoursFecha.value = fechaHoyLocal();
    openModal('adminModal');
}

async function handleAdminSave() {
    const uid = adminStudentSelect.value;
    const horas = parseInt(adminHoursInput.value, 10);
    const motivo = adminHoursMotivo.value.trim();
    const fecha = adminHoursFecha.value || null;

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
        await ajustarHoras(uid, horas, motivo, fecha);
        closeModal('adminModal');
        mostrarToast('Horas ajustadas', 'green');
    } catch (e) {
        console.error('[vista-admin] Error ajustando horas:', e);
        mostrarToast(e.message || 'No se pudo ajustar las horas', 'red');
    } finally {
        adminSaveBtn.disabled = false;
    }
}

// adminBtn ya no tiene listener propio — vive dentro de headerNav (Fase 16)
// y su clic se resuelve por delegación en el handler de headerNav, en
// main.js, igual que los demás data-vista. Un listener directo aquí
// duplicaría la llamada a irAVistaAdmin() (bubbling + delegación).
adminModalClose.addEventListener('click', () => closeModal('adminModal'));
adminSaveBtn.addEventListener('click', handleAdminSave);

// ── Vista de Admin (auditoría) ──────────────────────────────────────

export function irAVistaAdmin() {
    navegarA('view-admin');
    cargarYRenderizarVistaAdmin();
}

// directorioParaFiltroPersona: el actor de un registro de actividad puede
// ser cualquier rol (admin incluido — ver comentario arriba sobre
// entrada.usuario), así que el filtro de persona usa
// obtenerDirectorioCompleto(), no obtenerDirectorioEstudiantes() (esa sigue
// siendo solo para renderResumenHoras, que sí debe quedarse
// estudiantes-only).
let directorioParaFiltroPersona = [];

async function cargarYRenderizarVistaAdmin() {
    try {
        const [registro, estudiantes, directorioCompleto, tareas] = await Promise.all([
            obtenerRegistroActividad(),
            obtenerDirectorioEstudiantes(),
            obtenerDirectorioCompleto(),
            obtenerTareas()
        ]);
        renderRegistroActividad(registro, registroActividadBody);

        // TEMPORAL (2026-09-19): incluir también a la admin monicalira9377@gmail.com
        // en el resumen de horas mientras termina de registrar las suyas — sin tocar
        // obtenerDirectorioEstudiantes(), que a propósito sigue siendo estudiantes-only
        // (ver comentario arriba de directorioParaFiltroPersona). Quitar este bloque
        // cuando ya no haga falta.
        const miAdmin = directorioCompleto.find((u) => u.email === 'monicalira9377@gmail.com');
        const estudiantesConAdmin = miAdmin && !estudiantes.some((e) => e.id === miAdmin.id)
            ? [...estudiantes, miAdmin]
            : estudiantes;
        renderResumenHoras(estudiantesConAdmin, resumenHorasBody);
        auditoriaVacio.style.display = registro.length === 0 ? '' : 'none';

        directorioParaFiltroPersona = directorioCompleto;
        poblarFiltrosAuditoria(registro);

        cargarYRenderizarRevision(tareas, directorioCompleto);
        renderizarAvisoPendientes();
    } catch (e) {
        console.error('[vista-admin] Error cargando el panel de Admin:', e);
        mostrarToast('No se pudo cargar el panel de Admin', 'red');
    }
}

// ── Panel de revisión (tareas autoasignadas en 'en_revision') ───────
// No es una query aparte (where('estado','==','en_revision')): esta vista
// ya trae TODAS las tareas para el registro de auditoría/resumen de horas,
// así que se reusa esa misma lectura y se filtra en cliente — mismo
// criterio que el filtro "mías"/"todas" de vista-tareas.js, sin agregar un
// segundo round-trip ni arriesgar un índice compuesto nuevo para una
// colección que ya se trae completa en esta vista.
//
// Multi-selección: alimenta SOLO "Aprobar seleccionadas"/"Aprobar todas"
// (acciones masivas que no piden texto) — el rechazo se dejó fuera de la
// selección múltiple a propósito, ver comentario junto a
// renderRevisionTareas (render.js) para el porqué.
let tareasEnRevisionActuales = [];
const revisionSeleccionadas = new Set();
let tareaEnRechazo = null;

function cargarYRenderizarRevision(tareas, directorioCompleto) {
    const nombresPorUid = new Map(directorioCompleto.map((u) => [u.id, nombreParaMostrar(u)]));
    tareasEnRevisionActuales = tareas
        .filter((t) => (t.origen || 'asignada') === 'autoasignada' && t.estado === 'en_revision')
        .map((t) => ({ ...t, asignadosNombres: (t.asignados || []).map((uid) => nombresPorUid.get(uid) || uid) }));

    // Descarta de la selección cualquier id que ya se resolvió (aprobada/
    // rechazada) o ya no existe en esta carga — evita que "Aprobar
    // seleccionadas" intente reaprobar algo que ya salió de la cola.
    const idsVigentes = new Set(tareasEnRevisionActuales.map((t) => t.id));
    [...revisionSeleccionadas].forEach((id) => { if (!idsVigentes.has(id)) revisionSeleccionadas.delete(id); });

    renderizarRevision();
}

function renderizarRevision() {
    renderRevisionTareas(tareasEnRevisionActuales, revisionTareasLista, {
        seleccionadas: revisionSeleccionadas,
        onToggleSeleccion: (id, marcado) => { marcado ? revisionSeleccionadas.add(id) : revisionSeleccionadas.delete(id); },
        onAprobar: handleAprobarTarea,
        onRechazar: abrirRechazarTareaModal
    });
    revisionVacio.style.display = tareasEnRevisionActuales.length === 0 ? '' : 'none';
    revisionSeleccionarTodasBtn.textContent = (revisionSeleccionadas.size > 0 && revisionSeleccionadas.size === tareasEnRevisionActuales.length)
        ? 'Deseleccionar todas'
        : 'Seleccionar todas';
}

async function handleAprobarTarea(tareaId) {
    const tarea = tareasEnRevisionActuales.find((t) => t.id === tareaId);
    if (!tarea) return;
    try {
        await aprobarTareaAutoasignada(tareaId, tarea.asignados || [], tarea.horasAOtorgar || 0);
        mostrarToast('Tarea aprobada', 'green');
        await cargarYRenderizarVistaAdmin();
    } catch (e) {
        console.error('[vista-admin] Error aprobando tarea:', e);
        mostrarToast('No se pudo aprobar la tarea', 'red');
    }
}

revisionSeleccionarTodasBtn.addEventListener('click', () => {
    if (revisionSeleccionadas.size > 0 && revisionSeleccionadas.size === tareasEnRevisionActuales.length) {
        revisionSeleccionadas.clear();
    } else {
        tareasEnRevisionActuales.forEach((t) => revisionSeleccionadas.add(t.id));
    }
    renderizarRevision();
});

revisionAprobarSeleccionadasBtn.addEventListener('click', async () => {
    if (revisionSeleccionadas.size === 0) {
        mostrarToast('Selecciona al menos una tarea', 'red');
        return;
    }
    if (!window.confirm(`¿Aprobar ${revisionSeleccionadas.size} tarea(s) seleccionada(s)? Se otorgan las horas completas a cada asignado.`)) return;

    const idsSeleccionados = [...revisionSeleccionadas];
    try {
        for (const id of idsSeleccionados) {
            const tarea = tareasEnRevisionActuales.find((t) => t.id === id);
            if (tarea) await aprobarTareaAutoasignada(id, tarea.asignados || [], tarea.horasAOtorgar || 0);
        }
        mostrarToast('Tareas aprobadas', 'green');
        await cargarYRenderizarVistaAdmin();
    } catch (e) {
        console.error('[vista-admin] Error aprobando tareas seleccionadas:', e);
        mostrarToast('No se pudieron aprobar todas las tareas seleccionadas', 'red');
    }
});

revisionAprobarTodasBtn.addEventListener('click', async () => {
    if (tareasEnRevisionActuales.length === 0) return;
    if (!window.confirm(`¿Aprobar TODAS las tareas en revisión (${tareasEnRevisionActuales.length})? Se otorgan las horas completas a cada asignado.`)) return;

    try {
        for (const tarea of tareasEnRevisionActuales) {
            await aprobarTareaAutoasignada(tarea.id, tarea.asignados || [], tarea.horasAOtorgar || 0);
        }
        mostrarToast('Tareas aprobadas', 'green');
        await cargarYRenderizarVistaAdmin();
    } catch (e) {
        console.error('[vista-admin] Error aprobando todas las tareas:', e);
        mostrarToast('No se pudieron aprobar todas las tareas', 'red');
    }
});

// Rechazo SIEMPRE individual (ver comentario en render.js) — motivo
// obligatorio, un solo modal reusado fila por fila.
function abrirRechazarTareaModal(tareaId) {
    const tarea = tareasEnRevisionActuales.find((t) => t.id === tareaId);
    if (!tarea) return;
    tareaEnRechazo = tarea;
    rechazarTareaTitulo.textContent = tarea.titulo || 'Sin título';
    rechazarTareaMotivo.value = '';
    openModal('rechazarTareaModal');
}

async function handleRechazarTareaConfirmar() {
    if (!tareaEnRechazo) return;
    const motivo = rechazarTareaMotivo.value.trim();
    if (!motivo) {
        mostrarToast('El motivo es obligatorio', 'red');
        return;
    }

    rechazarTareaConfirmarBtn.disabled = true;
    try {
        await rechazarTareaAutoasignada(tareaEnRechazo.id, motivo);
        closeModal('rechazarTareaModal');
        mostrarToast('Tarea rechazada', 'green');
        tareaEnRechazo = null;
        await cargarYRenderizarVistaAdmin();
    } catch (e) {
        console.error('[vista-admin] Error rechazando tarea:', e);
        mostrarToast('No se pudo rechazar la tarea', 'red');
    } finally {
        rechazarTareaConfirmarBtn.disabled = false;
    }
}

// Aviso de pendientes (2026-09-19, primer reporte a la universidad):
// cuenta TODAS las autoasignadas en 'en_revision' ahorita mismo, sin
// filtrar por fecha — cualquiera pendiente contamina el reporte sin
// importar cuándo se reportó. Lee tareasEnRevisionActuales (ya calculado
// por cargarYRenderizarRevision, mismo filtro) en vez de recalcularlo, para
// no tener dos criterios de "qué es una pendiente" que puedan desalinearse.
function renderizarAvisoPendientes() {
    const n = tareasEnRevisionActuales.length;
    if (n === 0) {
        reportePendientesAviso.replaceChildren();
        reportePendientesAviso.style.display = 'none';
        return;
    }
    const texto = document.createTextNode(
        `Tienes ${n} tarea${n === 1 ? '' : 's'} esperando aprobación. Apruébalas o recházalas antes de generar el reporte, o las horas de esas personas van a salir incompletas. `
    );
    const link = document.createElement('a');
    link.href = '#revisionTareasLista';
    link.textContent = 'Ir a Tareas en Revisión';
    link.addEventListener('click', (e) => {
        e.preventDefault();
        revisionTareasLista.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    reportePendientesAviso.replaceChildren(texto, link);
    reportePendientesAviso.style.display = '';
}

// Generar Reporte (2026-09-19): rango libre, sin default de "mes". No
// bloquea la generación aunque haya pendientes (renderizarAvisoPendientes ya
// lo advirtió) — el admin decide si sigue de todos modos. Reusa
// directorioParaFiltroPersona (ya cargado por cargarYRenderizarVistaAdmin,
// mismo directorio completo que el filtro de auditoría) en vez de una query
// nueva. Split Mesa Directiva/Prestadores por rol==='admin', no por
// obtenerDirectorioEstudiantes() (esa es estudiantes-only y dejaría fuera a
// 'externo').
//
// Compilación de evidencia y exportación a Word/PDF quedan FUERA de
// alcance a propósito para este primer reporte — se arma a mano por fuera
// de la app; esto solo pinta las tablas en pantalla, listas para copiar.
async function handleGenerarReporte() {
    const fechaInicio = reporteFechaInicio.value;
    const fechaFin = reporteFechaFin.value;
    if (!fechaInicio || !fechaFin) {
        mostrarToast('Elige ambas fechas', 'red');
        return;
    }
    if (fechaInicio > fechaFin) {
        mostrarToast('"Desde" no puede ser posterior a "Hasta"', 'red');
        return;
    }

    reporteGenerarBtn.disabled = true;
    try {
        const conHorasPeriodo = await Promise.all(
            directorioParaFiltroPersona.map(async (persona) => ({
                ...persona,
                horasPeriodo: await obtenerHorasPorPeriodo(persona.id, fechaInicio, fechaFin)
            }))
        );

        const mesaDirectiva = conHorasPeriodo.filter((p) => p.rol === 'admin');
        const prestadores = conHorasPeriodo.filter((p) => p.rol !== 'admin');

        renderReporteHoras(mesaDirectiva, reporteMesaDirectivaBody);
        renderReporteHoras(prestadores, reportePrestadoresBody);
        reporteVacio.style.display = 'none';
    } catch (e) {
        console.error('[vista-admin] Error generando el reporte de horas:', e);
        mostrarToast('No se pudo generar el reporte', 'red');
    } finally {
        reporteGenerarBtn.disabled = false;
    }
}

reporteGenerarBtn.addEventListener('click', handleGenerarReporte);

rechazarTareaModalClose.addEventListener('click', () => closeModal('rechazarTareaModal'));
rechazarTareaConfirmarBtn.addEventListener('click', handleRechazarTareaConfirmar);

// Opciones de los selectores tipo/persona: derivadas de los valores REALES
// que ya trajo la carga inicial sin filtro — no una lista fija inventada en
// el código. Se puebla una sola vez al entrar a la vista, no se recalcula
// con cada filtro aplicado (así el usuario siempre puede volver a cualquier
// tipo/persona sin que las opciones se reduzcan por el filtro previo).
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
            console.error('[vista-admin] Índice faltante para filtros de auditoría:', link);
        } else {
            console.error('[vista-admin] Error aplicando filtros de auditoría:', e);
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

// Reutiliza el adminModal existente (Fase 13.2) sin tocar su lógica interna
// — solo cambia de dónde se abre.
abrirAjusteHorasBtn.addEventListener('click', abrirAdminModal);
