// js/chores.js
//
// Servicio de tareas (chores) y asistencias. Mismo patrón que db.js:
// funciones planas, _logActividad privado fire-and-forget, identidad leída
// de session.js (no de auth.js directamente).

import {
    db, PATHS,
    collection, doc,
    getDocs, addDoc, updateDoc, serverTimestamp
} from './firebase.js';
import { getUsuarioActual } from './session.js';

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

export async function crearTarea(datos) {
    const ref = await addDoc(collection(db, PATHS.tareas), {
        titulo: datos.titulo,
        estado: 'pendiente',
        asignados: datos.asignados || []
    });
    _logActividad('CREAR_TAREA', ref.id, datos.titulo);
    return ref.id;
}

export async function asignarEstudiantes(tareaId, arrayDeIds) {
    await updateDoc(doc(db, PATHS.tareas, tareaId), { asignados: arrayDeIds });
    _logActividad('ASIGNAR_ESTUDIANTES', tareaId, arrayDeIds.join(', '));
}

export async function registrarAsistencia({ estudianteId, horasTrabajadas, tareaIdAsociada }) {
    await addDoc(collection(db, PATHS.asistencias), {
        estudianteId,
        fecha: new Date().toISOString().slice(0, 10),
        horasTrabajadas,
        tareaIdAsociada
    });
    _logActividad('REGISTRAR_ASISTENCIA', estudianteId, `${horasTrabajadas}h en ${tareaIdAsociada}`);
}

// LA REGLA DEL SÁBADO: si la tarea se completa en sábado, cada estudiante
// asignado recibe asistencia automática de 15 horas para esa tarea.
// Valor tal cual lo especifica la operación real del huerto (no lo ajusto:
// una fila normal de 2-4h se registraría manualmente vía registrarAsistencia).
export async function completarTarea(tareaId, arrayDeAsignados) {
    await updateDoc(doc(db, PATHS.tareas, tareaId), { estado: 'completada' });
    _logActividad('COMPLETAR_TAREA', tareaId);

    const esSabado = new Date().getDay() === 6;
    if (esSabado) {
        await Promise.all(
            arrayDeAsignados.map((estudianteId) =>
                registrarAsistencia({
                    estudianteId,
                    horasTrabajadas: 15,
                    tareaIdAsociada: tareaId
                })
            )
        );
    }
}
