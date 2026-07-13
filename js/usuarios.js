// js/usuarios.js
//
// Directorio de usuarios — creación orgánica (lazy) en el primer login.
// Mismo patrón que db.js/chores.js: funciones planas, _logActividad
// privado fire-and-forget, identidad leída de session.js.

import {
    db, PATHS,
    doc,
    getDoc, getDocs, setDoc, updateDoc,
    collection, addDoc, serverTimestamp,
    query, where
} from './firebase.js';
import { getUsuarioActual } from './session.js';
// _registrarHoras vive en chores.js (junto con la colección asistencias
// que escribe) — usuarios.js la importa en vez de duplicar la escritura
// atómica asistencia+horasTotales. Ver el comentario de cabecera de
// _registrarHoras en chores.js para el porqué de este acoplamiento nuevo.
import { _registrarHoras } from './chores.js';

function _logActividad(tipo, entidad, detalle) {
    const usuario = getUsuarioActual();
    if (!usuario) return Promise.resolve();
    return addDoc(collection(db, PATHS.actividad), {
        tipo,
        entidad,
        detalle: detalle ?? null,
        usuario: usuario.email,
        uid: usuario.uid,
        fecha: serverTimestamp()
    }).catch((e) => console.error('[usuarios] Error registrando actividad:', e));
}

export async function obtenerUsuario(uid) {
    const snap = await getDoc(doc(db, PATHS.usuarios, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function obtenerDirectorioEstudiantes() {
    const q = query(collection(db, PATHS.usuarios), where('rol', '==', 'estudiante'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function registrarUsuario(uid, email, rol) {
    await setDoc(doc(db, PATHS.usuarios, uid), {
        email,
        rol,
        horasTotales: 0
    });
    // Aplica la regla del proyecto (Fase 8): toda escritura pasa por
    // _logActividad, aunque no se haya pedido explícitamente para esta
    // función — es el primer registro de la persona en el directorio,
    // vale la pena que quede en el log de auditoría igual que el resto.
    _logActividad('REGISTRAR_USUARIO', uid, rol);
}

// Fase 13.7: un usuario cambia su PROPIO rol (nunca el de otro — eso
// sigue siendo ajustarHoras/promoción manual por admin). 'admin' nunca es
// un valor aceptable aquí, mismo criterio que el Setup inicial — se
// rechaza en el cliente ANTES de escribir, aunque la regla de Firestore
// ya lo rechazaría igual (defensa en profundidad, mismo patrón que
// ajustarHoras con `motivo`). El payload contiene ÚNICAMENTE `rol`: la
// regla exige que horasTotales no cambie en este request, así que ni
// siquiera se referencia ese campo aquí — no hay forma de que este
// payload lo toque por accidente.
export async function actualizarRolPropio(uid, nuevoRol) {
    if (!['estudiante', 'externo'].includes(nuevoRol)) {
        throw new Error('Rol inválido.');
    }
    await updateDoc(doc(db, PATHS.usuarios, uid), { rol: nuevoRol });
    _logActividad('ACTUALIZAR_ROL_PROPIO', uid, nuevoRol);
}

// Fase 13.2: ya no existe forma de "poner" horasTotales a un valor
// absoluto — solo sumar/restar con motivo documentado, vía la misma
// escritura atómica (asistencia + increment) que usa la Regla del
// Sábado. `horas` puede ser negativo (corrección a la baja) o positivo
// (horas ad-hoc o migración de semestre anterior). El motivo es
// obligatorio y se valida aquí, no solo en la UI — main.js valida antes
// de llamar por UX, pero este es el guardia real.
export async function ajustarHoras(estudianteId, horas, motivo) {
    if (!motivo || !motivo.trim()) {
        throw new Error('El motivo es obligatorio para ajustar horas.');
    }
    const admin = getUsuarioActual();
    return _registrarHoras(estudianteId, horas, {
        motivo: motivo.trim(),
        origen: 'manual',
        autorizadoPor: admin?.uid ?? null
    });
}
