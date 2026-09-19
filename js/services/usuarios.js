// js/services/usuarios.js
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
import { CARRERAS } from '../shared/catalogos.js';

// Carrera(s) + clave única (2026-09-18): datos autodeclarados para
// automatizar reportes, sin implicación de seguridad/permisos/horas — por
// eso se validan aquí (capa de servicio) pero NO en firestore.rules, mismo
// criterio ya aplicado a `nombre` (tampoco tiene regla de formato ahí).
// Agregar el catálogo de 15 carreras a las reglas duplicaría el mismo
// problema de sincronización que ya existe entre firestore.rules/
// storage.rules para isAdmin() — sin ganancia real de seguridad, nadie
// gana horas ni permisos por declarar una carrera falsa.
function _validarCarreras(carreras) {
    if (!Array.isArray(carreras) || carreras.length < 1 || carreras.length > 2) {
        throw new Error('Selecciona 1 o 2 carreras.');
    }
    if (carreras.some((c) => !CARRERAS.includes(c))) {
        throw new Error('Carrera inválida.');
    }
}

// La matrícula real trae 3 ceros de prefijo (ej. "000123456") — el prefijo
// es siempre el mismo para todos, así que para los reportes solo se guardan
// los 6 dígitos que sí distinguen a cada persona (confirmado con la
// usuaria 2026-09-18). Se valida el formato ya recortado, no el original.
function _validarClaveUnica(claveUnica) {
    if (typeof claveUnica !== 'string' || !/^\d{6}$/.test(claveUnica)) {
        throw new Error('La clave única debe ser de 6 dígitos.');
    }
}

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

// Mismo shape que obtenerDirectorioEstudiantes(), sin el where('rol') —
// trae estudiante, externo Y admin. Uso: selector de asignados de tareas
// (cualquier rol puede ser asignado a una tarea), NO reemplaza a la
// función filtrada — "ajustar horas", el resumen de horas de Admin y el
// detalle de bitácora siguen usando la vieja a propósito (ver auditoría).
export async function obtenerDirectorioCompleto() {
    const snapshot = await getDocs(collection(db, PATHS.usuarios));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function registrarUsuario(uid, email, rol, nombre, carreras, claveUnica) {
    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre es obligatorio para completar el registro.');
    }
    _validarCarreras(carreras);
    _validarClaveUnica(claveUnica);
    await setDoc(doc(db, PATHS.usuarios, uid), {
        email,
        rol,
        nombre: nombre.trim(),
        horasTotales: 0,
        carreras,
        claveUnica
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

// Fase 14.1: mismo espíritu que actualizarRolPropio — el usuario edita
// SOLO su propio `nombre`. El payload contiene ÚNICAMENTE { nombre }, así
// que en un updateDoc (fusión parcial) rol/horasTotales quedan intactos en
// el documento resultante — la regla de 'update' de Firestore (que exige
// rol en la whitelist y horasTotales sin cambio) se sigue cumpliendo sin
// tocar firestore.rules, igual que ya ocurre con actualizarRolPropio.
export async function actualizarNombrePropio(uid, nombre) {
    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre no puede estar vacío.');
    }
    await updateDoc(doc(db, PATHS.usuarios, uid), { nombre: nombre.trim() });
    _logActividad('ACTUALIZAR_NOMBRE_PROPIO', uid, nombre.trim());
}

// Carrera(s) + clave única (2026-09-18) — misma función sirve para DOS
// flujos distintos: completar el perfil de alguien que ya tenía cuenta
// antes de este cambio (gate en view-completar-perfil, ver main.js) y
// editar esos datos más tarde desde Perfil. Ambos son un `update` sobre un
// documento que YA existe, a diferencia de registrarUsuario (create) — no
// se pudo compartir la validación llamando a registrarUsuario porque esa
// función asume que el documento no existe todavía (rol/nombre/
// horasTotales de un registro nuevo).
export async function actualizarCarrerasYClavePropia(uid, carreras, claveUnica) {
    _validarCarreras(carreras);
    _validarClaveUnica(claveUnica);
    await updateDoc(doc(db, PATHS.usuarios, uid), { carreras, claveUnica });
    // `detalle` es siempre string|null en el resto del proyecto (ver
    // cualquier otro _logActividad de este archivo/db.js/chores.js) — el
    // registro de auditoría (renderRegistroActividad, render.js) hace
    // `.textContent = entrada.detalle` directo, sin serializar objetos.
    _logActividad('ACTUALIZAR_CARRERAS_CLAVE_PROPIA', uid, `${carreras.join(', ')} (clave ${claveUnica})`);
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
