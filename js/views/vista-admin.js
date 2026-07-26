// js/vista-admin.js
//
// Dos secciones históricamente separadas en main.js, fusionadas acá porque
// están conectadas por un botón real (abrirAjusteHorasBtn dentro de esta
// misma vista abre el modal de horas) y comparten el mismo gate de rol:
//
// - "Panel de Admin": el modal de ajuste manual de horas
//   (poblarSelectorAdmin/abrirAdminModal/handleAdminSave).
// - "Vista de Admin" (Fase 13.8): el log de auditoría con sus 4 filtros
//   (irAVistaAdmin/cargarYRenderizarVistaAdmin/poblarFiltrosAuditoria/
//   aplicarFiltrosAuditoria/limpiarFiltrosAuditoria).
//
// "Quién" en el registro de actividad usa entrada.usuario directo (ya es el
// email, guardado por cada _logActividad — Fase 14.1: se mantiene como
// identificador estable, NO como display name, a propósito) — no resuelve
// contra obtenerDirectorioEstudiantes(), que además no tendría a los
// admins. Extraído de main.js (Fase 19, división en módulos por vista).

import { obtenerDirectorioEstudiantes, obtenerDirectorioCompleto, ajustarHoras } from './usuarios.js';
import { obtenerRegistroActividad, extraerLinkIndice } from './db.js';
import { renderRegistroActividad, renderResumenHoras } from './render.js';
import { nombreParaMostrar } from './session.js';
import { mostrarToast, openModal, closeModal } from './core-ui.js';
import { navegarA } from './router.js';
import { getEstudiantesActuales, setEstudiantesActuales } from './vista-tareas.js';

const adminModalClose    = document.getElementById('adminModalClose');
const adminStudentSelect = document.getElementById('adminStudentSelect');
const adminHoursInput    = document.getElementById('adminHoursInput');
const adminHoursMotivo   = document.getElementById('adminHoursMotivo');
const adminSaveBtn       = document.getElementById('adminSaveBtn');

const abrirAjusteHorasBtn   = document.getElementById('abrirAjusteHorasBtn');
const resumenHorasBody      = document.getElementById('resumenHorasBody');
const registroActividadBody = document.getElementById('registroActividadBody');

const auditoriaFiltroTipo        = document.getElementById('auditoriaFiltroTipo');
const auditoriaFiltroPersona     = document.getElementById('auditoriaFiltroPersona');
const auditoriaFiltroDesde       = document.getElementById('auditoriaFiltroDesde');
const auditoriaFiltroHasta       = document.getElementById('auditoriaFiltroHasta');
const auditoriaLimpiarFiltrosBtn = document.getElementById('auditoriaLimpiarFiltrosBtn');
const auditoriaErrorIndice       = document.getElementById('auditoriaErrorIndice');
const auditoriaVacio             = document.getElementById('auditoriaVacio');

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
        console.error('[vista-admin] Error cargando el panel de Admin:', e);
        mostrarToast('No se pudo cargar el panel de Admin', 'red');
    }
}

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
