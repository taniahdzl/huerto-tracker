// js/db.js
import {
    db, PATHS,
    collection, doc,
    getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp
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

export async function obtenerQuimicos() {
    const snapshot = await getDocs(collection(db, PATHS.quimicos));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function obtenerInventario() {
    const snapshot = await getDocs(collection(db, PATHS.inventario));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// inventario_general no tiene un campo humano único como el `nombre` de
// camas_cosecha (un ítem de inventario puede repetirse: varias
// herramientas del mismo tipo, etc.) — por eso usa addDoc con ID
// autogenerado, como crearTarea, no setDoc con verificación de colisión
// como crearCama.
//
// `categoria` es de propósito general, NO un enum estricto todavía. El
// único valor conocido hasta ahora es 'herramienta' (el que va a filtrar
// la futura pestaña "Herramientas" de la vista de Catálogos) — la
// colección puede recibir otras categorías en el futuro sin que eso
// rompa nada aquí; este default solo cubre el caso de que no se
// especifique ninguna.
export async function crearInventario(datos) {
    const ref = await addDoc(collection(db, PATHS.inventario), {
        ...datos,
        categoria: datos.categoria || 'herramienta'
    });
    _logActividad('CREAR_INVENTARIO', ref.id, datos.categoria || 'herramienta');
    return ref.id;
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
