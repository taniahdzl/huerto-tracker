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

// Lista para cuando exista la UI de administrador. Con las reglas actuales
// (firestore.rules: allow write si auth.uid == userId) SOLO funciona si el
// usuario se ajusta sus propias horas — un admin ajustando las de otra
// persona (el caso de uso real) fallará con permission-denied hasta que
// se agreguen reglas por rol.
export async function ajustarHoras(uid, nuevasHoras) {
    await updateDoc(doc(db, PATHS.usuarios, uid), { horasTotales: nuevasHoras });
    _logActividad('AJUSTE_HORAS_MANUAL', uid, nuevasHoras);
}
