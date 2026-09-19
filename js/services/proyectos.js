// js/services/proyectos.js
//
// Servicio de proyectos — organiza tareas EXISTENTES vía tareas.proyectoId,
// nunca las duplica en su propia colección. Mismo patrón que chores.js/db.js:
// funciones planas, _logActividad privado fire-and-forget.
//
// Shape de `proyectos/{proyectoId}`:
//   { nombre, descripcion, fechaObjetivo: 'YYYY-MM-DD'|null,
//     estado: 'activo'|'completado'|'pausado', pasos: [{ tareaId, orden }] }
// `pasos` guarda solo la referencia (tareaId) + el orden — el estado real
// de cada paso se resuelve leyendo la tarea referenciada
// (obtenerProyectosConProgreso), nunca un contador aparte que pueda
// desincronizarse.

import {
    db, PATHS,
    collection, doc,
    getDoc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
    writeBatch, arrayUnion,
    query, where
} from './firebase.js';
import { getUsuarioActual } from './session.js';
import { _datosNuevaTarea, crearTarea } from './chores.js';

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
    }).catch((e) => console.error('[proyectos] Error registrando actividad:', e));
}

export async function crearProyecto(datos) {
    if (!datos.nombre) {
        throw new Error('[proyectos] crearProyecto requiere "nombre"');
    }
    const ref = await addDoc(collection(db, PATHS.proyectos), {
        nombre: datos.nombre,
        descripcion: datos.descripcion || '',
        fechaObjetivo: datos.fechaObjetivo || null,
        // 'activo' siempre al crear — mismo criterio que estado:'pendiente'
        // en crearTarea, no es una opción del formulario (pausar/completar
        // son transiciones posteriores, no un estado inicial elegible).
        estado: 'activo',
        pasos: []
    });
    _logActividad('CREAR_PROYECTO', ref.id, datos.nombre);
    return ref.id;
}

// Crea la tarea Y la agrega al array `pasos` del proyecto en un batch
// atómico (mismo patrón que _registrarHoras en chores.js: doc ref
// generado del lado del cliente + writeBatch, para que ambas escrituras
// sean inseparables). No se puede llamar literalmente a crearTarea() acá
// dentro — esa función hace su propio addDoc independiente, incompatible
// con participar en el mismo batch — así que se usa _datosNuevaTarea()
// (la misma validación/shape, extraída de chores.js para esto) para armar
// el documento y agregarlo con batch.set() sobre un ref pre-generado.
export async function agregarPasoAProyecto(proyectoId, datosTarea, orden) {
    const datosCompletos = _datosNuevaTarea({ ...datosTarea, proyectoId });

    const batch = writeBatch(db);
    const tareaRef = doc(collection(db, PATHS.tareas));
    batch.set(tareaRef, datosCompletos);
    batch.update(doc(db, PATHS.proyectos, proyectoId), {
        pasos: arrayUnion({ tareaId: tareaRef.id, orden })
    });
    await batch.commit();

    _logActividad('AGREGAR_PASO_PROYECTO', proyectoId, `${datosTarea.titulo} (orden ${orden})`);
    return tareaRef.id;
}

// Un paso AUTOASIGNADO (2026-09-19) — a diferencia de agregarPasoAProyecto,
// NUNCA escribe en /proyectos (que sigue siendo admin-only en
// firestore.rules — ver comentario ahí sobre por qué se descartó permitir
// un update parcial de `pasos` a un no-admin: resultó explotable, ver
// auditoría de esta fase). Crea la tarea como cualquier autoasignada
// normal (crearTarea, chores.js — mismas reglas ya auditadas, sin
// necesidad de una regla nueva) con `proyectoId` seteado.
// obtenerProyectosConProgreso() la recoge vía query por proyectoId, NO
// vía el array `pasos`, así que no lleva un `orden` manual — se muestra
// después de los pasos asignados por admin, ordenada por fechaCreacion.
export async function agregarPasoPropio(proyectoId, datosTarea) {
    return crearTarea({ ...datosTarea, proyectoId, origen: 'autoasignada' });
}

// Concluir/reactivar/pausar un proyecto — transición de estado pura, sin
// tocar `pasos` ni las tareas referenciadas. "Concluir" (2026-09-19) es
// el caso de uso real pedido; 'pausado' ya existía en el esquema desde el
// diseño original pero nunca tuvo UI — esta función sirve para cualquier
// transición, no solo activo<->completado.
export async function actualizarEstadoProyecto(proyectoId, nuevoEstado) {
    if (!['activo', 'completado', 'pausado'].includes(nuevoEstado)) {
        throw new Error(`[proyectos] estado inválido: ${nuevoEstado}`);
    }
    await updateDoc(doc(db, PATHS.proyectos, proyectoId), { estado: nuevoEstado });
    _logActividad('ACTUALIZAR_ESTADO_PROYECTO', proyectoId, nuevoEstado);
}

// Elimina el documento del proyecto, SIN tocar las tareas referenciadas en
// `pasos` (decisión 2026-09-19, confirmada con la usuaria) — quedan como
// tareas sueltas con `proyectoId` apuntando a un documento que ya no
// existe, mismo criterio que el resto del proyecto: `tareas.proyectoId` ya
// está diseñado como opcional/tolerante a esto (ver comentario de cabecera
// de este archivo), y borrar en cascada es una operación más destructiva
// e irreversible de lo que se pidió. obtenerProyectosConProgreso() no se
// ve afectado por proyectos huérfanos porque ya no hay proyecto que
// listar; las tareas huérfanas simplemente se siguen viendo en la vista
// de Tareas, como cualquier tarea 'asignada' normal.
export async function eliminarProyecto(proyectoId) {
    await deleteDoc(doc(db, PATHS.proyectos, proyectoId));
    _logActividad('ELIMINAR_PROYECTO', proyectoId);
}

// Trae todos los proyectos y resuelve el progreso de cada uno leyendo el
// ESTADO REAL de las tareas referenciadas en `pasos` — nunca un contador
// guardado aparte (se desincronizaría si una tarea se completa, se borra,
// o cambia de estado por cualquier otro camino que no pase por acá).
// pasos.tarea queda null si la tarea referenciada ya no existe (borrada) —
// el caller decide cómo pintar ese caso, este módulo no inventa un
// placeholder.
//
// Pasos autoasignados (2026-09-19, ver agregarPasoPropio): NUNCA están en
// el array `pasos` del proyecto — se resuelven con una query aparte por
// `proyectoId` y se anexan al final, con `orden: null` (no participan del
// orden manual), ordenados por fechaCreacion ascendente. `idsYaListados`
// evita traerlas dos veces si alguna vez se agregara un paso admin
// apuntando a la misma tarea (no debería pasar, pero no cuesta nada
// blindarlo).
export async function obtenerProyectosConProgreso() {
    const snapshot = await getDocs(collection(db, PATHS.proyectos));
    const proyectos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    return Promise.all(proyectos.map(async (proyecto) => {
        const pasos = proyecto.pasos || [];
        const tareaSnaps = await Promise.all(
            pasos.map((paso) => getDoc(doc(db, PATHS.tareas, paso.tareaId)))
        );

        const pasosConEstado = pasos
            .map((paso, i) => ({
                ...paso,
                tarea: tareaSnaps[i].exists() ? { id: paso.tareaId, ...tareaSnaps[i].data() } : null
            }))
            .sort((a, b) => a.orden - b.orden);

        const idsYaListados = new Set(pasos.map((p) => p.tareaId));
        const propiosSnap = await getDocs(query(collection(db, PATHS.tareas), where('proyectoId', '==', proyecto.id)));
        const pasosPropios = propiosSnap.docs
            .filter((d) => !idsYaListados.has(d.id))
            .map((d) => ({ tareaId: d.id, orden: null, tarea: { id: d.id, ...d.data() } }))
            .sort((a, b) => (a.tarea.fechaCreacion?.toMillis?.() ?? 0) - (b.tarea.fechaCreacion?.toMillis?.() ?? 0));

        const todosPasos = [...pasosConEstado, ...pasosPropios];
        const pasosCompletados = todosPasos.filter((p) => p.tarea?.estado === 'completada').length;

        return {
            ...proyecto,
            pasos: todosPasos,
            totalPasos: todosPasos.length,
            pasosCompletados
        };
    }));
}
