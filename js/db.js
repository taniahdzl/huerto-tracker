// js/db.js
import {
    db, PATHS,
    collection, doc,
    getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
    query, where, orderBy, limit,
    writeBatch
} from './firebase.js';
import { getUsuarioActual } from './session.js';
// obtenerSesionConDetalle deriva asistentes/tareas de otros módulos en vez
// de duplicar esos datos dentro de bitacora_sesiones — ver su cabecera.
import { obtenerTareas, obtenerAsistenciasPorFecha } from './chores.js';
import { obtenerDirectorioEstudiantes } from './usuarios.js';

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

// registro_actividad no "pertenece" a ningún módulo — los tres
// (db/chores/usuarios) escriben ahí vía su propio _logActividad. Vive
// aquí en db.js por ser el módulo de datos general, no porque sea su
// dueño exclusivo.
export async function obtenerRegistroActividad(cantidad = 50) {
    const q = query(collection(db, PATHS.actividad), orderBy('fecha', 'desc'), limit(cantidad));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// bitacora_sesiones permite varias entradas para la misma fecha (sin
// restricción de una-por-fecha) — por eso `sesiones` es un array, nunca un
// único documento asumido. asistentes/tareasCompletadas se derivan de
// asistencias en el momento de leer; nunca se guardan en bitacora_sesiones.
export async function obtenerSesionConDetalle(fecha) {
    const q = query(collection(db, PATHS.bitacora), where('fecha', '==', fecha));
    const [bitacoraSnap, asistenciasDelDia, tareas, estudiantes] = await Promise.all([
        getDocs(q),
        obtenerAsistenciasPorFecha(fecha),
        obtenerTareas(),
        obtenerDirectorioEstudiantes()
    ]);

    const sesiones = bitacoraSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Mismo fallback que renderResumenHoras (render.js) para estudiantes sin
    // campo `nombre` en el directorio: usuarios solo guarda email/rol/horasTotales.
    const asistentes = [...new Set(asistenciasDelDia.map(a => a.estudianteId))]
        .map((uid) => {
            const estudiante = estudiantes.find((e) => e.id === uid);
            return estudiante ? (estudiante.email || estudiante.id) : uid;
        });

    // tareaId es null en ajustes manuales de horas (_registrarHoras) — se
    // excluyen aquí porque no representan una tarea completada ese día.
    const tareasCompletadas = [...new Set(asistenciasDelDia.map(a => a.tareaId).filter(Boolean))]
        .map((tareaId) => {
            const tarea = tareas.find((t) => t.id === tareaId);
            return tarea ? tarea.titulo : tareaId;
        });

    return { sesiones, asistentes, tareasCompletadas };
}

export async function obtenerCatalogo() {
    const snapshot = await getDocs(collection(db, PATHS.catalogo));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ID derivado de `nombre` con la MISMA lógica exacta de scripts/upload.js
// (nombre.toLowerCase().replace(/\s+/g, '_')) — sin quitar acentos, para
// que no convivan dos convenciones de slug distintas en la misma
// colección. Verificación de colisión igual que crearCama: si el slug ya
// existe, RECHAZA (throw), no informa/continúa — mismo criterio que
// mesas, consistente en todo el proyecto.
export async function crearCatalogo(datos) {
    const plantaId = datos.nombre.toLowerCase().replace(/\s+/g, '_');
    const plantaRef = doc(db, PATHS.catalogo, plantaId);
    const existente = await getDoc(plantaRef);
    if (existente.exists()) {
        throw new Error('Ya existe una planta con este nombre en el catálogo.');
    }
    await setDoc(plantaRef, datos);
    _logActividad('CREAR_CATALOGO', plantaId, datos.nombre);
    return plantaId;
}

export async function actualizarCatalogo(plantaId, datos) {
    await updateDoc(doc(db, PATHS.catalogo, plantaId), datos);
    _logActividad('ACTUALIZAR_CATALOGO', plantaId, datos.nombre || plantaId);
}

// No valida rol aquí — ya lo cubre la regla de Firestore (delete
// admin-only en catalogo_semillas). Esta función es solo la escritura.
export async function eliminarCatalogo(plantaId) {
    await deleteDoc(doc(db, PATHS.catalogo, plantaId));
    _logActividad('ELIMINAR_CATALOGO', plantaId);
}

export async function obtenerCamas() {
    const snapshot = await getDocs(collection(db, PATHS.camas));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function obtenerQuimicos() {
    const snapshot = await getDocs(collection(db, PATHS.quimicos));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Esquema nuevo (Fase 13.6a), sin precedente — colección vacía, sin
// campo humano único como el `nombre` de camas/semillas, así que usa
// addDoc con ID autogenerado, no setDoc con slug.
export async function crearQuimico(datos) {
    const ref = await addDoc(collection(db, PATHS.quimicos), {
        nombre: datos.nombre,
        notas_uso: datos.notas_uso || ''
    });
    _logActividad('CREAR_QUIMICO', ref.id, datos.nombre);
    return ref.id;
}

export async function actualizarQuimico(quimicoId, datos) {
    await updateDoc(doc(db, PATHS.quimicos, quimicoId), datos);
    _logActividad('ACTUALIZAR_QUIMICO', quimicoId, datos.nombre || quimicoId);
}

export async function eliminarQuimico(quimicoId) {
    await deleteDoc(doc(db, PATHS.quimicos, quimicoId));
    _logActividad('ELIMINAR_QUIMICO', quimicoId);
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

// updateDoc es un merge parcial — solo toca las claves presentes en
// `datos`. Si el llamador no incluye `categoria`, esta función NUNCA la
// toca ni le vuelve a aplicar el default de crearInventario; el default
// es exclusivo de la creación. La responsabilidad de no mandar
// `categoria` en cada edición (a menos que el usuario la esté cambiando
// de verdad) es de quien construya el formulario de editar, no de esta
// función — documentado aquí para no repetir el error al construir esa
// vista.
export async function actualizarInventario(itemId, datos) {
    await updateDoc(doc(db, PATHS.inventario, itemId), datos);
    _logActividad('ACTUALIZAR_INVENTARIO', itemId, datos.categoria || null);
}

export async function eliminarInventario(itemId) {
    await deleteDoc(doc(db, PATHS.inventario, itemId));
    _logActividad('ELIMINAR_INVENTARIO', itemId);
}

export async function crearCama(camaId, datos) {
    const camaRef = doc(db, PATHS.camas, camaId);
    const existente = await getDoc(camaRef);
    if (existente.exists()) {
        throw new Error('Ya existe una mesa con este nombre.');
    }
    await setDoc(camaRef, datos);
    _logActividad('CREAR_CAMA', camaId, datos.nombre || camaId);
    return camaId;
}

export async function actualizarCama(camaId, datos) {
    await updateDoc(doc(db, PATHS.camas, camaId), datos);
    _logActividad('ACTUALIZAR_CAMA', camaId, datos.nombre || camaId);
}

export async function eliminarCama(camaId) {
    await deleteDoc(doc(db, PATHS.camas, camaId));
    _logActividad('ELIMINAR_CAMA', camaId);
}

// Cierra el ciclo de cultivo de UNA planta específica: escribe su historial
// (append-only) y libera su espacio en la cama, en un batch atómico — o
// pasan las dos escrituras, o ninguna, mismo criterio que _registrarHoras.
//
// `plantaEntry` debe ser el objeto TAL CUAL está guardado ahora mismo en
// `cama.plantas[]` (arco/circular), con su `instanciaId` — el identificador
// único que toda función que agregue una planta a plantas[] DEBE generar
// (crypto.randomUUID()) para que dos plantas de la misma especie en la
// misma cama sigan siendo distinguibles. Se identifica por instanciaId, no
// por plantaId ni por comparación del objeto completo — instanciaId no
// cambia aunque el resto de los campos de esa planta sí (p.ej. finalidad,
// alternada por marcarParaSemilla entre la lectura y este cierre). Si el
// instanciaId ya no está en el array (alguien más ya cerró esa planta
// mientras tanto), esta función rechaza en vez de no hacer nada.
//
// Camas rectangulares no usan plantas[] — la planta vive en campos planos
// del propio doc (plantaId/plantaNombre/plantaTipo/fechaSiembra/
// fechaTrasplante), así que ahí "liberar el slot" es limpiar esos campos,
// no filtrar un array. plantaEntry para este caso lo arma el llamador con
// esos mismos campos planos (sin instanciaId, no aplica).
export async function crearHistorialCultivo(datos) {
    const { camaId, plantaEntry, rendimiento, cantidadObtenida, notaCierre } = datos;

    const usuario = getUsuarioActual();
    if (!usuario) {
        throw new Error('Debes iniciar sesión para cerrar un cultivo.');
    }

    const camaRef = doc(db, PATHS.camas, camaId);
    const camaSnap = await getDoc(camaRef);
    if (!camaSnap.exists()) {
        throw new Error('La mesa no existe.');
    }
    const cama = camaSnap.data();

    const plantaSnap = await getDoc(doc(db, PATHS.catalogo, plantaEntry.plantaId));
    const plantaNombre = plantaSnap.exists() ? plantaSnap.data().nombre : null;

    const batch = writeBatch(db);

    const historialRef = doc(collection(db, PATHS.historial));
    batch.set(historialRef, {
        camaId,
        plantaId: plantaEntry.plantaId,
        plantaTipo: plantaEntry.plantaTipo,
        plantaNombre,
        fechaSiembra: plantaEntry.fechaSiembra,
        fechaTrasplante: plantaEntry.fechaTrasplante ?? null,
        fechaFinalizacion: serverTimestamp(),
        finalidad: plantaEntry.finalidad || 'cosecha',
        rendimiento,
        cantidadObtenida,
        notaCierre: notaCierre || null,
        registradoPor: usuario.uid
    });

    if (cama.tipo === 'rectangular') {
        batch.update(camaRef, {
            plantaId: null,
            plantaNombre: null,
            plantaTipo: null,
            fechaSiembra: null,
            fechaTrasplante: null
        });
    } else {
        const plantasActuales = cama.plantas || [];
        const plantasRestantes = plantasActuales.filter(
            (p) => p.instanciaId !== plantaEntry.instanciaId
        );
        if (plantasRestantes.length === plantasActuales.length) {
            throw new Error('Esa planta ya no está en la cama (¿alguien más ya cerró este cultivo?).');
        }
        batch.update(camaRef, { plantas: plantasRestantes });
    }

    await batch.commit();
    _logActividad('CERRAR_CULTIVO', camaId, plantaNombre || plantaEntry.plantaId);
    return historialRef.id;
}

// Alterna finalidad 'cosecha' <-> 'semilla' de UNA entrada de plantas[],
// identificada por instanciaId (determinístico, sin importar cuántas
// plantas idénticas convivan en la misma cama — ver crearHistorialCultivo),
// sin tocar el resto de sus campos ni las demás plantas de la cama. Solo
// aplica a arco/circular (mismo alcance de B2) — rectangular no tiene este
// campo porque no tiene plantas[].
export async function marcarParaSemilla(camaId, instanciaId) {
    const camaRef = doc(db, PATHS.camas, camaId);
    const camaSnap = await getDoc(camaRef);
    if (!camaSnap.exists()) {
        throw new Error('La mesa no existe.');
    }
    const cama = camaSnap.data();
    if (cama.tipo === 'rectangular') {
        throw new Error('marcarParaSemilla solo aplica a camas arco/circular.');
    }

    const plantas = cama.plantas || [];
    const idx = plantas.findIndex((p) => p.instanciaId === instanciaId);
    if (idx === -1) {
        throw new Error('Esa planta ya no está en la cama.');
    }

    const nuevaFinalidad = (plantas[idx].finalidad || 'cosecha') === 'semilla' ? 'cosecha' : 'semilla';
    const plantasActualizadas = [...plantas];
    plantasActualizadas[idx] = { ...plantasActualizadas[idx], finalidad: nuevaFinalidad };

    await updateDoc(camaRef, { plantas: plantasActualizadas });
    _logActividad('MARCAR_PARA_SEMILLA', camaId, `${plantas[idx].plantaId}: ${nuevaFinalidad}`);
}
