// js/db.js
import {
    db, PATHS,
    collection, doc,
    getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp
} from './firebase.js';

// Identidad del usuario actual, para _logActividad. La fija main.js una
// vez que AuthService confirma la sesión — db.js no importa auth.js
// directamente para no acoplar la capa de datos a la de sesión.
let _usuario = null;

export function setUsuarioActual(usuario) {
    _usuario = usuario;
}

function _logActividad(tipo, entidad, detalle) {
    if (!_usuario) return Promise.resolve();
    return addDoc(collection(db, PATHS.actividad), {
        tipo,
        entidad,
        detalle: detalle || null,
        usuario: _usuario.email,
        uid: _usuario.uid,
        fecha: serverTimestamp()
    }).catch((e) => console.error('[db] Error registrando actividad:', e));
}

export async function obtenerCatalogo() {
    const snapshot = await getDocs(collection(db, PATHS.catalogo));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function obtenerCamas() {
    const snapshot = await getDocs(collection(db, PATHS.camas));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function crearCama(camaId, datos) {
    const camaRef = doc(db, PATHS.camas, camaId);
    const existente = await getDoc(camaRef);
    if (existente.exists()) {
        throw new Error('Ya existe una mesa con este nombre.');
    }
    await setDoc(camaRef, datos);
    _logActividad('CREAR_CAMA', camaId, datos.nombre);
    return camaId;
}

export async function actualizarCama(camaId, datos) {
    await updateDoc(doc(db, PATHS.camas, camaId), datos);
    _logActividad('ACTUALIZAR_CAMA', camaId, datos.nombre);
}

export async function eliminarCama(camaId) {
    await deleteDoc(doc(db, PATHS.camas, camaId));
    _logActividad('ELIMINAR_CAMA', camaId);
}
