// js/services/chores.js
//
// Servicio de tareas (chores) y asistencias. Mismo patrón que db.js:
// funciones planas, _logActividad privado fire-and-forget, identidad leída
// de session.js (no de auth.js directamente).

import {
    db, PATHS,
    collection, doc,
    getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
    writeBatch, increment,
    query, where, orderBy, limit,
    getCountFromServer
} from './firebase.js';
import { getUsuarioActual } from './session.js';
import { subirEvidenciaTarea } from './storage.js';

function _logActividad(tipo, entidad, detalle) {
    const usuario = getUsuarioActual();
    if (!usuario) return Promise.resolve();
    return addDoc(collection(db, PATHS.actividad), {
        tipo,
        entidad,
        detalle: detalle || null,
        usuario: usuario.email,
        uid: usuario.uid,
        fecha: serverTimestamp()
    }).catch((e) => console.error('[chores] Error registrando actividad:', e));
}

export async function obtenerTareas() {
    const snapshot = await getDocs(collection(db, PATHS.tareas));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Rediseño de tareas (reemplaza la Regla del Sábado, ver completarTarea):
// `tipo` decide si la tarea otorga horas de asistencia o es un encargo
// individual — sin default, mismo criterio "no inventar ante datos
// faltantes" que el resto del proyecto, así que se rechaza explícito en
// vez de dejar pasar una tarea sin tipo. `horasAOtorgar` es la cantidad
// EXPLÍCITA declarada al crear (la UI sugiere 15 si es sábado y
// tipo:'asistencia', editable — ver calcularSugerenciaHoras en
// vista-tareas.js) — completarTarea ya no decide horas por el día en que
// se completa, sino que aplica lo ya declarado aquí. `fotoEvidenciaUrl`
// nace null y se llena al completar (ver completarTarea), nunca al crear.
//
// `proyectoId` (null por default — una tarea suelta no rompe nada) y
// `fechaLimite` (opcional, string 'YYYY-MM-DD'|null, cualquier tarea, no
// exclusivo de proyectos) se agregaron en el rediseño de Proyectos —
// Proyectos ORGANIZA tareas existentes vía este campo, nunca las duplica
// en su propia colección (ver js/services/proyectos.js).
//
// Tareas autoasignadas con aprobación de admin (2026-09-06): `origen`
// decide si la tarea la asignó un admin (flujo de siempre, sin cambios —
// completarTarea() sigue siendo el único camino de horas para estas) o si
// la propuso/auto-asignó cualquier autenticado (flujo nuevo, ver
// enviarARevision/aprobarTareaAutoasignada/rechazarTareaAutoasignada más
// abajo). Default 'asignada' — un documento viejo sin este campo (creado
// antes de este cambio) también debe leerse como 'asignada', ver el mismo
// criterio `|| 'asignada'` en firestore.rules (`.get('origen','asignada')`)
// y en el consumo de este campo en render.js/vista-tareas.js. `creadorId`
// es nuevo para AMBOS orígenes (antes no existía) — en 'asignada' queda
// como metadata sin uso (siempre el admin que la creó), en 'autoasignada'
// es la identidad que firestore.rules verifica para permitir
// editar/borrar/reenviar. `motivoRechazo` nace null, solo lo escribe
// rechazarTareaAutoasignada().
//
// _datosNuevaTarea separado de crearTarea (en vez de un solo bloque
// inline) porque js/services/proyectos.js.agregarPasoAProyecto() necesita
// la MISMA forma/validación pero escrita dentro de un writeBatch atómico
// (junto con el update al array `pasos` del proyecto) — un batch no puede
// llamar a una función async con su propio addDoc como crearTarea, así
// que la parte pura (armar el objeto) se separó para reusarse sin duplicar
// el criterio de validación/shape en dos archivos. Proyectos nunca pasa
// `origen` — cae en el default 'asignada', correcto: agregar un paso es
// coordinación de admin, no autoservicio (ver firestore.rules).
export function _datosNuevaTarea(datos) {
    if (datos.tipo !== 'asistencia' && datos.tipo !== 'individual') {
        throw new Error(`[chores] tipo requerido: 'asistencia'|'individual', recibió: ${datos.tipo}`);
    }
    return {
        titulo: datos.titulo,
        tipo: datos.tipo,
        origen: datos.origen === 'autoasignada' ? 'autoasignada' : 'asignada',
        creadorId: getUsuarioActual()?.uid ?? null,
        estado: 'pendiente',
        motivoRechazo: null,
        asignados: datos.asignados || [],
        horasAOtorgar: datos.horasAOtorgar || 0,
        fotoEvidenciaUrl: null,
        proyectoId: datos.proyectoId || null,
        fechaLimite: datos.fechaLimite || null,
        // Exclusivamente para ordenar por antigüedad (obtenerTareasAsignadas).
        // NO es fecha límite/vencimiento — el huerto no maneja eso, es un
        // backlog que se va completando, ya descartado explícitamente.
        // (fechaLimite, arriba, es un campo distinto y separado — opcional,
        // agregado después, ver comentario de la sección de arriba).
        fechaCreacion: serverTimestamp()
    };
}

export async function crearTarea(datos) {
    const ref = await addDoc(collection(db, PATHS.tareas), _datosNuevaTarea(datos));
    _logActividad('CREAR_TAREA', ref.id, datos.titulo);
    return ref.id;
}

// Fase 14.3: reemplaza a obtenerProximaTarea (limit(1), devolvía un solo
// doc o null). Su único caller era la tarjeta "Tu próxima tarea" del
// Dashboard, retirada en esta misma fase a favor de la Tarjeta 2 (lista de
// hasta `cantidad`) — no quedó ningún consumidor con la firma vieja, así
// que se reemplaza en vez de mantener dos queries casi idénticas
// (array-contains + estado pendiente + orden por antigüedad) en paralelo.
//
// Devuelve `{ tareas, total }`: `tareas` son las `cantidad` más antiguas
// (para pintar títulos), `total` es el conteo real de TODAS las pendientes
// asignadas a `uid` (vía getCountFromServer, aggregation query — no se
// infiere "+N más" a partir de un límite+1, que daría un número
// inventado/incorrecto en cuanto hubiera más de cantidad+1 pendientes).
//
// Requiere el mismo índice compuesto en Firestore que ya usaba
// obtenerProximaTarea (asignados array-contains + estado == + fechaCreacion
// orderBy) — no existe por defecto. Si no está creado, Firestore lanza un
// error con un link directo para crearlo en un clic.
export async function obtenerTareasAsignadas(uid, cantidad = 3) {
    const filtros = [
        where('asignados', 'array-contains', uid),
        where('estado', '==', 'pendiente')
    ];
    const qLista = query(collection(db, PATHS.tareas), ...filtros, orderBy('fechaCreacion', 'asc'), limit(cantidad));
    const qConteo = query(collection(db, PATHS.tareas), ...filtros);

    const [snapshot, conteoSnap] = await Promise.all([
        getDocs(qLista),
        getCountFromServer(qConteo)
    ]);

    return {
        tareas: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        total: conteoSnap.data().count
    };
}

export async function asignarEstudiantes(tareaId, arrayDeIds) {
    await updateDoc(doc(db, PATHS.tareas, tareaId), { asignados: arrayDeIds });
    _logActividad('ASIGNAR_ESTUDIANTES', tareaId, arrayDeIds.length > 0 ? arrayDeIds.join(', ') : '(sin asignados)');
}

// ── Horas: fuente única en `asistencias`, append-only ──────────────
// Contexto (Fase 13.2): no todas las horas vienen de la Regla del Sábado.
// También hay horas ad-hoc que un admin autoriza por tareas fuera del
// ciclo semanal, y ajustes de migración de horas de semestres anteriores.
// Los tres casos quedan en la MISMA colección (con `origen` distinguiendo
// cuál es cuál) para que un reporte a la universidad sea una sola query,
// no una reconciliación entre asistencias + registro_actividad.
//
// _registrarHoras es el único punto de escritura real de horas: hace, en
// un writeBatch atómico, (a) crear el documento de asistencia y (b)
// incrementar usuarios/{estudianteId}.horasTotales por el MISMO valor —
// nunca dos números por separado, para que ambas escrituras sean
// inseparables (o pasan las dos, o ninguna).
//
// Exportada — no es puramente privada al archivo, porque
// usuarios.js.ajustarHoras() también la necesita (misma escritura
// atómica, origen distinto). El prefijo `_` señala "no la llames desde
// main.js directamente", no "privada a este módulo" — es la única
// función de chores.js que otro módulo de datos importa.
export async function _registrarHoras(estudianteId, horas, { tareaId = null, motivo = null, origen, autorizadoPor }) {
    const batch = writeBatch(db);

    const asistenciaRef = doc(collection(db, PATHS.asistencias));
    batch.set(asistenciaRef, {
        estudianteId,
        fecha: new Date().toISOString().slice(0, 10),
        horasTrabajadas: horas,
        tareaId,
        origen,
        motivo,
        autorizadoPor
    });

    batch.update(doc(db, PATHS.usuarios, estudianteId), {
        horasTotales: increment(horas)
    });

    await batch.commit();

    _logActividad(
        origen === 'automatica' ? 'REGISTRAR_ASISTENCIA' : 'AJUSTE_HORAS_MANUAL',
        estudianteId,
        motivo ? `${horas}h — ${motivo}` : `${horas}h`
    );

    return asistenciaRef.id;
}

// Usada por obtenerSesionConDetalle (db.js) para derivar asistentes/tareas
// completadas de una fecha de bitácora — asistencias sigue siendo la fuente
// única, bitacora_sesiones nunca duplica estos datos.
export async function obtenerAsistenciasPorFecha(fecha) {
    const q = query(collection(db, PATHS.asistencias), where('fecha', '==', fecha));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Reemplaza la Regla del Sábado: las horas a otorgar ya se declararon
// explícitamente al CREAR la tarea (horasAOtorgar, ver crearTarea) — esta
// función ya no consulta el día en que se completa, solo aplica lo
// declarado. `archivoEvidencia` es un Blob ya comprimido (o null/undefined
// si la tarea no lleva foto — tipo:'individual', o tipo:'asistencia' cuya
// obligatoriedad ya validó el caller antes de llegar aquí, ver
// vista-tareas.js). Orden de operaciones a propósito: la subida a Storage
// va PRIMERO y se espera (`await`) antes de tocar Firestore — si falla,
// la función lanza antes del updateDoc y la tarea se queda en 'pendiente',
// nunca se marca completada sin la evidencia que se suponía que llevaba.
export async function completarTarea(tareaId, arrayDeAsignados, { horasAOtorgar = 0, archivoEvidencia = null } = {}) {
    const fotoEvidenciaUrl = archivoEvidencia
        ? await subirEvidenciaTarea(tareaId, archivoEvidencia)
        : null;

    const datosActualizados = { estado: 'completada' };
    if (fotoEvidenciaUrl) datosActualizados.fotoEvidenciaUrl = fotoEvidenciaUrl;
    await updateDoc(doc(db, PATHS.tareas, tareaId), datosActualizados);
    _logActividad('COMPLETAR_TAREA', tareaId);

    if (horasAOtorgar > 0) {
        const admin = getUsuarioActual();
        await Promise.all(
            arrayDeAsignados.map((estudianteId) => _registrarHoras(estudianteId, horasAOtorgar, {
                tareaId,
                origen: 'automatica',
                autorizadoPor: admin?.uid ?? null
            }))
        );
    }
}

// ── Tareas autoasignadas: flujo de aprobación por admin (2026-09-06) ──
// completarTarea()/crearTarea() de arriba siguen siendo el único camino
// para tareas origen:'asignada', sin ningún cambio de comportamiento. Las
// 4 funciones de acá abajo son exclusivas del flujo nuevo — su seguridad
// real vive en firestore.rules (una autoasignada en 'en_revision' queda
// congelada ahí incluso si algo llamara estas funciones fuera de orden).

// El creador sube evidencia y pide revisión: 'pendiente'|'rechazada' ->
// 'en_revision'. A diferencia de completarTarea() (donde la foto solo es
// obligatoria si tipo:'asistencia'), acá es SIEMPRE obligatoria sin
// importar tipo — se valida acá Y en firestore.rules
// (fotoEvidenciaUrl is string). Limpia motivoRechazo de un rechazo
// anterior: al reenviar, esa observación ya se está atendiendo — que no
// se siga mostrando como si aplicara a la evidencia nueva.
export async function enviarARevision(tareaId, archivoEvidencia) {
    if (!archivoEvidencia) {
        throw new Error('[chores] enviarARevision requiere una foto de evidencia');
    }
    const fotoEvidenciaUrl = await subirEvidenciaTarea(tareaId, archivoEvidencia);
    await updateDoc(doc(db, PATHS.tareas, tareaId), {
        estado: 'en_revision',
        fotoEvidenciaUrl,
        motivoRechazo: null
    });
    _logActividad('ENVIAR_A_REVISION', tareaId);
}

// Admin aprueba: 'en_revision' -> 'completada'. horasAOtorgar se otorga
// COMPLETO (sin repartir) a cada uid de asignados — mismo _registrarHoras
// que completarTarea(), nunca un segundo camino de horas.
export async function aprobarTareaAutoasignada(tareaId, arrayDeAsignados, horasAOtorgar = 0) {
    await updateDoc(doc(db, PATHS.tareas, tareaId), { estado: 'completada' });
    _logActividad('APROBAR_TAREA', tareaId);

    if (horasAOtorgar > 0) {
        const admin = getUsuarioActual();
        await Promise.all(
            arrayDeAsignados.map((estudianteId) => _registrarHoras(estudianteId, horasAOtorgar, {
                tareaId,
                origen: 'automatica',
                autorizadoPor: admin?.uid ?? null
            }))
        );
    }
}

// Admin rechaza: 'en_revision' -> 'rechazada'. motivoRechazo obligatorio,
// sin excepción (también forzado en firestore.rules) — es lo único que le
// dice al creador qué corregir antes de reenviar.
export async function rechazarTareaAutoasignada(tareaId, motivoRechazo) {
    const motivo = (motivoRechazo || '').trim();
    if (!motivo) {
        throw new Error('[chores] rechazarTareaAutoasignada requiere motivoRechazo');
    }
    await updateDoc(doc(db, PATHS.tareas, tareaId), { estado: 'rechazada', motivoRechazo: motivo });
    _logActividad('RECHAZAR_TAREA', tareaId, motivo);
}

// El creador edita su autoasignada mientras sigue editable ('pendiente' o
// 'rechazada' — 'en_revision' está congelada, ver firestore.rules). No
// toca origen/creadorId/estado/motivoRechazo por este camino, esos los
// manejan las funciones de arriba.
export async function editarTareaAutoasignada(tareaId, { titulo, tipo, horasAOtorgar, asignados }) {
    await updateDoc(doc(db, PATHS.tareas, tareaId), { titulo, tipo, horasAOtorgar, asignados });
    _logActividad('EDITAR_TAREA', tareaId, titulo);
}

// El admin edita una tarea 'asignada' (creada por admin para otros, no
// autoservicio) — sin restricción de campos a nivel de reglas
// (isAdmin() && origen=='asignada' es unrestricted en firestore.rules), a
// diferencia de editarTareaAutoasignada (creador, campos limitados a
// titulo/tipo). Pensada sobre todo para los pasos de Proyectos
// (agregarPasoAProyecto siempre crea con origen:'asignada', ver
// _datosNuevaTarea) — un proyecto grupal cambia de alcance/horas/
// asignados después de creado, y hasta 2026-09-19 no había forma de
// corregir eso sin borrar y recrear el paso. `orden` NO se edita por
// aquí — vive en el array `pasos` del proyecto (proyectos.js), no en el
// documento de la tarea; reordenar pasos queda fuera de alcance de este
// cambio.
export async function editarTarea(tareaId, { titulo, tipo, horasAOtorgar, asignados, fechaLimite }) {
    await updateDoc(doc(db, PATHS.tareas, tareaId), { titulo, tipo, horasAOtorgar, asignados, fechaLimite });
    _logActividad('EDITAR_TAREA_ASIGNADA', tareaId, titulo);
}

// El creador borra su autoasignada mientras sigue 'pendiente' (congelada
// desde 'en_revision' en adelante). Admin sigue pudiendo borrar cualquier
// tarea en cualquier estado — comportamiento previo, sin cambios.
export async function eliminarTarea(tareaId) {
    await deleteDoc(doc(db, PATHS.tareas, tareaId));
    _logActividad('ELIMINAR_TAREA', tareaId);
}
