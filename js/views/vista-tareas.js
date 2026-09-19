// js/views/vista-tareas.js
//
// Vista de Tareas (Fase 13.5) — ya no es modal, es destino de navegación
// recurrente. "Crear" y "Completar" son modales puntuales (crearTareaModal/
// completarTareaModal). Rediseño de tareas (tipo/horas explícitas/foto de
// evidencia, reemplaza la Regla del Sábado fija de chores.js): completar ya
// no es un clic directo, pasa por completarTareaModal para poder pedir la
// foto cuando corresponde. abrirModalCompletarTarea() está exportada para
// que vista-proyectos.js reuse este mismo flujo desde un paso de proyecto
// (ver su comentario).
//
// Tareas autoasignadas con aprobación de admin (2026-09-06): "+ Crear
// tarea" dejó de ser admin-only — cualquier autenticado puede proponerse
// una tarea (origen:'autoasignada'), eligiendo a quién más incluye (puede
// ser grupal). "Completar" (completarTareaModal) sigue siendo EXCLUSIVO de
// admin + origen:'asignada', sin cambios. El ciclo de una autoasignada
// (editar/enviar a revisión/eliminar mientras 'pendiente'; editar+reenviar
// si 'rechazada') vive en editarTareaModal, un solo modal para los 2 casos
// — ver abrirEditarTareaModal. La resolución (aprobar/rechazar una
// 'en_revision') vive en vista-admin.js, no acá — esta vista nunca pinta
// ningún botón para 'en_revision' (congelada, ver renderListaTareas).
//
// estudiantesActuales se expone vía getEstudiantesActuales/
// setEstudiantesActuales porque vista-admin.js también lo usa (selector del
// modal de horas) — aunque en la práctica abrirAdminModal siempre vuelve a
// pedir el directorio en vez de confiar en este caché (ver su propio
// comentario), así que esto es consistencia de forma, no una dependencia de
// datos real entre las dos vistas. Extraído de main.js (Fase 19, división
// en módulos por vista).

import { AuthService } from '../services/auth.js';
import {
    obtenerTareas, crearTarea, completarTarea,
    enviarARevision, editarTareaAutoasignada, eliminarTarea
} from '../services/chores.js';
import { obtenerDirectorioCompleto } from '../services/usuarios.js';
import { renderListaTareas } from '../render/render.js';
import { nombreParaMostrar } from '../services/session.js';
import { mostrarToast, openModal, closeModal } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { getEsAdminActual } from '../shared/estado-app.js';
import { calcularHorasAOtorgar } from '../shared/tipos-tarea.js';

const tareasListaVista = document.getElementById('tareasListaVista');
const crearTareaBtn     = document.getElementById('crearTareaBtn');
const tareasFilterTabs  = document.querySelectorAll('#view-tareas .filter-tab');

const crearTareaModalClose = document.getElementById('crearTareaModalClose');
const crearTareaOrigenGroup = document.getElementById('crearTareaOrigenGroup');
const crearTareaOrigen     = document.getElementById('crearTareaOrigen');
const crearTareaTitulo     = document.getElementById('crearTareaTitulo');
const crearTareaTipo       = document.getElementById('crearTareaTipo');
const crearTareaHoras      = document.getElementById('crearTareaHoras');
const crearTareaHorasPreview = document.getElementById('crearTareaHorasPreview');
const crearTareaAssignees  = document.getElementById('crearTareaAssignees');
const crearTareaSaveBtn    = document.getElementById('crearTareaSaveBtn');

const completarTareaModalClose  = document.getElementById('completarTareaModalClose');
const completarTareaTitulo      = document.getElementById('completarTareaTitulo');
const completarTareaFotoLabel   = document.getElementById('completarTareaFotoLabel');
const completarTareaFoto        = document.getElementById('completarTareaFoto');
const completarTareaFotoPreview = document.getElementById('completarTareaFotoPreview');
const completarTareaSaveBtn     = document.getElementById('completarTareaSaveBtn');

const editarTareaModalClose    = document.getElementById('editarTareaModalClose');
const editarTareaMotivoRechazo = document.getElementById('editarTareaMotivoRechazo');
const editarTareaTitulo        = document.getElementById('editarTareaTitulo');
const editarTareaTipo          = document.getElementById('editarTareaTipo');
const editarTareaHoras         = document.getElementById('editarTareaHoras');
const editarTareaAssignees     = document.getElementById('editarTareaAssignees');
const editarTareaFoto          = document.getElementById('editarTareaFoto');
const editarTareaFotoPreview   = document.getElementById('editarTareaFotoPreview');
const editarTareaGuardarBtn    = document.getElementById('editarTareaGuardarBtn');
const editarTareaEnviarBtn     = document.getElementById('editarTareaEnviarBtn');

let tareasActuales      = [];
let estudiantesActuales = [];
let filtroTareasActual  = 'mias';
let tareaEnCompletar    = null;
let tareaEnEdicion      = null;
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

    renderListaTareas(
        tareasEnriquecidas,
        tareasListaVista,
        { onCompletar: handleCompletarTareaVista, onEditar: abrirEditarTareaModal, onEliminar: handleEliminarTareaVista },
        { esAdmin: getEsAdminActual(), uidActual: uid }
    );
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
    // Siempre obligatoria (2026-09-19) — las 6 categorías de tipo
    // reemplazaron tanto a 'asistencia' como a 'individual', ya no hay un
    // tipo sin necesidad de evidencia.
    completarTareaFotoLabel.textContent = 'Foto de evidencia (obligatoria)';

    openModal('completarTareaModal');
}

// El clic en "✅ Completar" ya no completa directo — abre el modal único
// de finalización. La foto es siempre obligatoria (ver
// handleCompletarTareaGuardar).
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

    // Siempre obligatoria (2026-09-19) — ver abrirModalCompletarTarea.
    if (!archivo) {
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

// ── Modal "Crear Tarea" ──────────────────────────────────────────────
// Reutiliza el mismo patrón de chips que ya existía para el selector de
// estudiantes (checkbox + email, ver Fase 11) — poblarAssignees() genérico
// (contenedor + preseleccionados) porque editarTareaModal necesita la
// misma UI con checkboxes pre-marcados según tarea.asignados.
function poblarAssignees(contenedor, seleccionados = []) {
    contenedor.replaceChildren();
    estudiantesActuales.forEach((estudiante) => {
        const label = document.createElement('label');
        label.className = 'chore-assignee-chip';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = estudiante.id;
        checkbox.checked = seleccionados.includes(estudiante.id);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(nombreParaMostrar(estudiante)));

        contenedor.appendChild(label);
    });
}

// origen:'autoasignada' desde el rediseño 2026-09-06 — crearTareaOrigenGroup
// solo se muestra a admin (puede elegir asignar a alguien más, flujo de
// siempre, o autoasignarse); un no-admin siempre crea 'autoasignada' sin
// ver el selector. En modo autoasignada se pre-marca (no se fuerza) el
// checkbox del propio usuario, por conveniencia — sigue pudiendo
// desmarcarse o agregar a otros (tarea grupal, ver chores.js).
function actualizarPreseleccionPropia() {
    const uid = AuthService.getCurrentUser()?.uid;
    const origenEfectivo = getEsAdminActual() ? crearTareaOrigen.value : 'autoasignada';
    if (origenEfectivo !== 'autoasignada' || !uid) return;
    const propio = crearTareaAssignees.querySelector(`input[value="${uid}"]`);
    if (propio) propio.checked = true;
}

function abrirCrearTareaModal() {
    // estudiantesActuales ya está fresco: este botón solo es visible
    // dentro de view-tareas, que siempre se recarga al entrar.
    const esAdmin = getEsAdminActual();
    crearTareaOrigenGroup.style.display = esAdmin ? '' : 'none';
    crearTareaOrigen.value = 'asignada';
    crearTareaTitulo.value = '';
    crearTareaTipo.value = '';
    crearTareaHoras.value = '';
    crearTareaHorasPreview.textContent = '';
    poblarAssignees(crearTareaAssignees);
    actualizarPreseleccionPropia();
    openModal('crearTareaModal');
}

crearTareaOrigen.addEventListener('change', actualizarPreseleccionPropia);

// Sugerencia de horas EFECTIVAS al crear (2026-09-19, reemplaza la
// sugerencia de horas A OTORGAR de la Regla del Sábado): 4h efectivas
// solo si hoy es sábado Y el tipo elegido es 'trabajo_fisico'
// (4×3.7=14.8 -> redondea a 15, el número histórico) — editable, nunca
// bloqueada. `fecha` es inyectable (default new Date()) a propósito, para
// que esto sea testeable sin depender del día real del sistema — mismo
// criterio ya documentado para la vieja Regla del Sábado (ver
// AI_CONTEXT.md).
export function calcularSugerenciaHorasEfectivas(tipo, fecha = new Date()) {
    return (tipo === 'trabajo_fisico' && fecha.getDay() === 6) ? 4 : '';
}

// Preview en vivo: "horas efectivas × multiplicador = horas a acreditar"
// — exportado para que vista-proyectos.js pinte el mismo texto en su
// propio preview de agregarPasoModal, sin duplicar el formato.
export function textoPreviewHoras(tipo, horasEfectivas) {
    if (!tipo || !horasEfectivas) return '';
    try {
        const horasAOtorgar = calcularHorasAOtorgar(tipo, horasEfectivas);
        return `${horasEfectivas} horas efectivas × multiplicador = ${horasAOtorgar}h a acreditar`;
    } catch {
        return ''; // tipo inválido — no debería pasar con un <select>, defensivo
    }
}

function actualizarPreviewCrearTarea() {
    crearTareaHorasPreview.textContent = textoPreviewHoras(crearTareaTipo.value, Number(crearTareaHoras.value));
}

crearTareaTipo.addEventListener('change', () => {
    crearTareaHoras.value = calcularSugerenciaHorasEfectivas(crearTareaTipo.value);
    actualizarPreviewCrearTarea();
});
crearTareaHoras.addEventListener('input', actualizarPreviewCrearTarea);

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

    // horasEfectivas, no horasAOtorgar (2026-09-19) — chores.js calcula y
    // congela horasAOtorgar = horasEfectivas × multiplicador del tipo.
    const horasEfectivas = crearTareaHoras.value ? Number(crearTareaHoras.value) : 0;
    // Un no-admin nunca ve crearTareaOrigenGroup — siempre 'autoasignada'
    // sin importar qué value tenga el <select> oculto (defensivo, aunque
    // hoy el select ya se resetea a 'asignada' en abrirCrearTareaModal).
    const origen = getEsAdminActual() ? crearTareaOrigen.value : 'autoasignada';

    crearTareaSaveBtn.disabled = true;
    try {
        await crearTarea({ titulo, tipo, asignados, horasEfectivas, origen });
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

// ── Modal "Editar Tarea" (autoasignadas: pendiente/rechazada) ───────
// Un solo modal para 2 casos, decididos por tarea.estado:
//   'pendiente'  -> ambos botones visibles ("Guardar cambios" no toca
//                   estado; "Guardar y enviar a revisión" exige evidencia
//                   y mueve a 'en_revision').
//   'rechazada'  -> solo "Guardar y enviar a revisión" (relabeled
//                   "Reenviar a revisión"), la única salida posible — se
//                   muestra motivoRechazo para que el creador sepa qué
//                   corregir (pedido explícito de la instrucción).
// editarTareaAutoasignada() y enviarARevision() son 2 escrituras
// separadas — firestore.rules las restringe cada una a EXACTAMENTE los
// campos que toca (ver diagnóstico de esta fase), así que no pueden
// combinarse en una sola llamada aunque acá se disparen una tras otra.
function abrirEditarTareaModal(tareaId) {
    const tarea = tareasActuales.find((t) => t.id === tareaId);
    if (!tarea) return;
    tareaEnEdicion = tarea;

    if (tarea.estado === 'rechazada' && tarea.motivoRechazo) {
        editarTareaMotivoRechazo.textContent = `Rechazada: ${tarea.motivoRechazo}`;
        editarTareaMotivoRechazo.style.display = '';
    } else {
        editarTareaMotivoRechazo.style.display = 'none';
    }

    editarTareaTitulo.value = tarea.titulo || '';
    // Sin default (2026-09-19, "individual" ya no existe en el catálogo) —
    // si la tarea trae un tipo legacy que ya no está en el <select>
    // (ej. 'asistencia'/'individual' de antes de este cambio), el select
    // simplemente no lo selecciona; se deja como una elección explícita.
    editarTareaTipo.value = tarea.tipo || '';
    editarTareaHoras.value = tarea.horasAOtorgar || '';
    poblarAssignees(editarTareaAssignees, tarea.asignados || []);
    editarTareaFoto.value = '';
    editarTareaFotoPreview.src = '';
    editarTareaFotoPreview.classList.add('hidden');

    const esPendiente = tarea.estado === 'pendiente';
    editarTareaGuardarBtn.style.display = esPendiente ? '' : 'none';
    editarTareaEnviarBtn.textContent = esPendiente ? 'Guardar y enviar a revisión' : 'Reenviar a revisión';

    openModal('editarTareaModal');
}

editarTareaFoto.addEventListener('change', () => {
    const archivo = editarTareaFoto.files[0];
    if (!archivo) {
        editarTareaFotoPreview.classList.add('hidden');
        return;
    }
    editarTareaFotoPreview.src = URL.createObjectURL(archivo);
    editarTareaFotoPreview.classList.remove('hidden');
});

// Lee/valida los campos del formulario — compartido por "Guardar cambios"
// y "Guardar y enviar a revisión" (misma validación, distinto destino).
function leerCambiosEditarTarea() {
    const titulo = editarTareaTitulo.value.trim();
    if (!titulo) {
        mostrarToast('La tarea necesita un título', 'red');
        return null;
    }
    const asignados = Array.from(editarTareaAssignees.querySelectorAll('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value);
    if (asignados.length === 0) {
        mostrarToast('Selecciona al menos un estudiante', 'red');
        return null;
    }
    return {
        titulo,
        tipo: editarTareaTipo.value,
        horasAOtorgar: editarTareaHoras.value ? Number(editarTareaHoras.value) : 0,
        asignados
    };
}

async function handleEditarTareaGuardar() {
    if (!tareaEnEdicion) return;
    const cambios = leerCambiosEditarTarea();
    if (!cambios) return;

    editarTareaGuardarBtn.disabled = true;
    try {
        await editarTareaAutoasignada(tareaEnEdicion.id, cambios);
        closeModal('editarTareaModal');
        mostrarToast('Tarea actualizada', 'green');
        tareaEnEdicion = null;
        await cargarYRenderizarVistaTareas();
    } catch (e) {
        console.error('[vista-tareas] Error editando tarea:', e);
        mostrarToast('No se pudo guardar la tarea', 'red');
    } finally {
        editarTareaGuardarBtn.disabled = false;
    }
}

async function handleEditarTareaEnviar() {
    if (!tareaEnEdicion) return;
    const cambios = leerCambiosEditarTarea();
    if (!cambios) return;

    const archivo = editarTareaFoto.files[0] || null;
    if (!archivo) {
        mostrarToast('La evidencia es obligatoria para enviar a revisión', 'red');
        return;
    }

    editarTareaEnviarBtn.disabled = true;
    try {
        // Guarda los campos primero (mientras la tarea sigue editable) y
        // recién después sube evidencia + cambia estado — mismo orden que
        // completarTarea: si la subida falla, la tarea ya quedó con los
        // campos corregidos pero NUNCA pasa a 'en_revision' sin evidencia.
        await editarTareaAutoasignada(tareaEnEdicion.id, cambios);
        const archivoComprimido = await comprimirImagen(archivo);
        await enviarARevision(tareaEnEdicion.id, archivoComprimido);
        closeModal('editarTareaModal');
        mostrarToast('Tarea enviada a revisión', 'green');
        tareaEnEdicion = null;
        await cargarYRenderizarVistaTareas();
    } catch (e) {
        console.error('[vista-tareas] Error enviando tarea a revisión:', e);
        mostrarToast('No se pudo enviar la tarea a revisión — intenta de nuevo', 'red');
    } finally {
        editarTareaEnviarBtn.disabled = false;
    }
}

editarTareaModalClose.addEventListener('click', () => closeModal('editarTareaModal'));
editarTareaGuardarBtn.addEventListener('click', handleEditarTareaGuardar);
editarTareaEnviarBtn.addEventListener('click', handleEditarTareaEnviar);

// ── Eliminar (autoasignada, solo mientras 'pendiente') ──────────────
// Mismo patrón de confirmación nativa que vista-catalogos.js
// (window.confirm) — la seguridad real está en firestore.rules.
async function handleEliminarTareaVista(tareaId) {
    if (!window.confirm('¿Seguro que deseas eliminar esta tarea?')) return;
    try {
        await eliminarTarea(tareaId);
        mostrarToast('Tarea eliminada', 'green');
        await cargarYRenderizarVistaTareas();
    } catch (e) {
        console.error('[vista-tareas] Error eliminando tarea:', e);
        mostrarToast('No se pudo eliminar la tarea', 'red');
    }
}
