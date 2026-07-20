// js/db.js
import {
    db, PATHS,
    collection, doc,
    getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, Timestamp,
    query, where, orderBy, limit,
    writeBatch
} from './firebase.js';
import { getUsuarioActual, nombreParaMostrar } from './session.js';
import { proximaPosicionDisponible } from './geometria-espiral.js';
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
//
// Filtros de la tabla de auditoría de Admin (tipo/persona/rango de fecha).
// Los tres son opcionales y combinables — el caller (main.js) arma el
// objeto según qué filtros tenga activos el usuario en ese momento.
//
// ── Índices compuestos: las 7 combinaciones posibles se probaron contra
// Firestore real (proyecto huerto-57477, colección con 12 documentos
// reales) antes de escribir este código, no en software de prueba. Nunca
// se crearon los índices desde aquí — se dejó fallar cada combinación una
// vez para capturar el link exacto que Firestore devuelve. Resultado:
// solo 3 índices compuestos DISTINTOS cubren las 7 combinaciones (los
// campos duplicados en dos combinaciones piden literalmente el mismo
// índice, confirmado comparando el query string de cada link):
//
//   1. tipo(ASC) + fecha(DESC)         — cubre "solo tipo" y "tipo + fecha"
//      https://console.firebase.google.com/v1/r/project/huerto-57477/firestore/indexes?create_composite=Cldwcm9qZWN0cy9odWVydG8tNTc0NzcvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3JlZ2lzdHJvX2FjdGl2aWRhZC9pbmRleGVzL18QARoICgR0aXBvEAEaCQoFZmVjaGEQAhoMCghfX25hbWVfXxAC
//   2. uid(ASC) + fecha(DESC)          — cubre "solo persona" y "persona + fecha"
//      https://console.firebase.google.com/v1/r/project/huerto-57477/firestore/indexes?create_composite=Cldwcm9qZWN0cy9odWVydG8tNTc0NzcvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3JlZ2lzdHJvX2FjdGl2aWRhZC9pbmRleGVzL18QARoHCgN1aWQQARoJCgVmZWNoYRACGgwKCF9fbmFtZV9fEAI
//   3. tipo(ASC) + uid(ASC) + fecha(DESC) — cubre "tipo + persona" y "tipo + persona + fecha"
//      https://console.firebase.google.com/v1/r/project/huerto-57477/firestore/indexes?create_composite=Cldwcm9qZWN0cy9odWVydG8tNTc0NzcvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3JlZ2lzdHJvX2FjdGl2aWRhZC9pbmRleGVzL18QARoICgR0aXBvEAEaBwoDdWlkEAEaCQoFZmVjaGEQAhoMCghfX25hbWVfXxAC
//
// Único caso SIN índice compuesto (solo el índice de campo simple que
// Firestore crea por default): rango de fecha SOLO — where('fecha','>=')
// + where('fecha','<=') + orderBy('fecha'), porque el rango y el orderBy
// caen sobre el MISMO campo.
//
// Hasta que esos 3 índices existan en producción, cualquier combinación
// que los necesite lanza FAILED_PRECONDITION — el catch del caller (ver
// abrirFiltroAuditoria en main.js) usa extraerLinkIndice() para mostrarle
// al admin el link real del error tal cual lo devuelve Firestore, en vez
// de fallar en silencio.
export async function obtenerRegistroActividad({ cantidad = 50, tipo, uid, desde, hasta } = {}) {
    const condiciones = [];
    if (tipo) condiciones.push(where('tipo', '==', tipo));
    if (uid) condiciones.push(where('uid', '==', uid));
    if (desde) condiciones.push(where('fecha', '>=', Timestamp.fromDate(desde)));
    if (hasta) condiciones.push(where('fecha', '<=', Timestamp.fromDate(hasta)));

    const q = query(collection(db, PATHS.actividad), ...condiciones, orderBy('fecha', 'desc'), limit(cantidad));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Extrae el link de creación de índice del mensaje de error de Firestore
// (código 'failed-precondition') — mismo procedimiento manual ya usado
// varias veces en este proyecto para resolver índices faltantes, ahora
// expuesto para que la UI se lo muestre directo al admin en vez de que
// tenga que ir a leer la consola del navegador.
export function extraerLinkIndice(error) {
    const match = error?.message?.match(/https:\/\/console\.firebase\.google\.com\S+/);
    return match ? match[0] : null;
}

// bitacora_sesiones permite varias entradas para la misma fecha (sin
// restricción de una-por-fecha) — por eso `sesiones` es un array, nunca un
// único documento asumido. asistentes/tareasCompletadas se derivan de
// asistencias en el momento de leer; nunca se guardan en bitacora_sesiones.
// Todas las entradas de bitacora_sesiones, sin filtro de fecha — a
// diferencia de obtenerSesionConDetalle (una fecha puntual), esta es para
// la lista de sesiones pasadas en view-bitacora (PASO F) y para el banner
// de pendientes del Dashboard (la más reciente = sesiones[0]). Orden
// descendente resuelto en el query mismo (orderBy), no en el cliente —
// funciona porque fecha es 'YYYY-MM-DD', que ordena correctamente como
// string sin parsear a Date.
export async function obtenerBitacoraSesiones() {
    const q = query(collection(db, PATHS.bitacora), orderBy('fecha', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// bitacora_sesiones es append-only (firestore.rules: create sin
// isAdmin(), update/delete:false) — mismo criterio que historial_cultivo:
// corregir una entrada mal escrita es crear una nueva, nunca editar la
// vieja. Sin campo humano único como `nombre` (varias entradas pueden
// compartir la misma fecha — ver comentario de obtenerSesionConDetalle) —
// addDoc con ID autogenerado, mismo patrón que crearTarea/crearQuimico.
export async function crearBitacoraSesion(datos) {
    const ref = await addDoc(collection(db, PATHS.bitacora), {
        fecha: datos.fecha,
        resumen: datos.resumen,
        pendientes: datos.pendientes || ''
    });
    _logActividad('CREAR_BITACORA', ref.id, datos.fecha);
    return ref.id;
}

export async function obtenerSesionConDetalle(fecha) {
    const q = query(collection(db, PATHS.bitacora), where('fecha', '==', fecha));
    const [bitacoraSnap, asistenciasDelDia, tareas, estudiantes] = await Promise.all([
        getDocs(q),
        obtenerAsistenciasPorFecha(fecha),
        obtenerTareas(),
        obtenerDirectorioEstudiantes()
    ]);

    const sesiones = bitacoraSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Mismo fallback que renderResumenHoras (render.js): nombre → email →
    // id, vía nombreParaMostrar (Fase 14.1).
    const asistentes = [...new Set(asistenciasDelDia.map(a => a.estudianteId))]
        .map((uid) => {
            const estudiante = estudiantes.find((e) => e.id === uid);
            return estudiante ? nombreParaMostrar(estudiante) : uid;
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
// colección. Si el slug ya existe, RECHAZA (throw), no informa/continúa.
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
// catalogo_semillas (un ítem de inventario puede repetirse: varias
// herramientas del mismo tipo, etc.) — por eso usa addDoc con ID
// autogenerado, como crearTarea, no setDoc con verificación de colisión
// como crearCatalogo.
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

// crearCama/actualizarCama/eliminarCama (camas tipo 'rectangular') retiradas
// en Fase 15 junto con #appRoot/bedModal, su único caller — ver diagnóstico.
// camas_cosecha y la colección en Firestore NO se tocan: si algún día
// existiera un documento tipo:'rectangular' real, obtenerCamas() lo sigue
// leyendo igual que a cualquier otro; agregarPlantaACama (abajo) es la
// función de escritura vigente, y es exclusiva de arco/circular.

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

// Agrega una entrada nueva a plantas[] de una cama arco/circular (Fase
// 14.6a) — sin panel lateral ni drag todavía (14.6b), solo la escritura.
// La posición (t/r o angle/r) la calcula proximaPosicionDisponible
// (geometria-espiral.js) sobre las plantas que ya están en la cama, así
// que nunca se recibe a mano — mismo espíritu que instanciaId/
// fechaSiembra, que esta función también genera, no el llamador.
//
// finalidad nace siempre en 'cosecha' — cambiarla a 'semilla' sigue siendo
// responsabilidad exclusiva de marcarParaSemilla, después de sembrada.
// plantaTipo se denormaliza desde catalogo_semillas para que render-
// spiral-2d.js no necesite el catálogo completo solo para pintar color/
// emoji (mismo criterio que usaba handleSaveBed para camas rectangulares,
// retirado en Fase 15 — el patrón de denormalización sobrevive aunque ese
// código ya no exista).
//
// Regla de Firestore (camas_cosecha): create/update permitido a cualquier
// usuario autenticado, sin restricción de rol — igual que marcarParaSemilla,
// esta función no valida rol aquí porque la regla ya lo cubre.
export async function agregarPlantaACama(camaId, plantaId) {
    const camaRef = doc(db, PATHS.camas, camaId);
    const camaSnap = await getDoc(camaRef);
    if (!camaSnap.exists()) {
        throw new Error('La mesa no existe.');
    }
    const cama = camaSnap.data();
    if (cama.tipo !== 'arco' && cama.tipo !== 'circular') {
        throw new Error('agregarPlantaACama solo aplica a camas arco/circular.');
    }

    const plantaSnap = await getDoc(doc(db, PATHS.catalogo, plantaId));
    const plantaTipo = plantaSnap.exists() ? (plantaSnap.data().tipo || null) : null;

    const plantasActuales = cama.plantas || [];
    const posicion = proximaPosicionDisponible(cama, plantasActuales);

    const nuevaPlanta = {
        instanciaId: crypto.randomUUID(),
        plantaId,
        plantaTipo,
        fechaSiembra: new Date().toISOString().slice(0, 10),
        finalidad: 'cosecha',
        ...posicion
    };

    await updateDoc(camaRef, { plantas: [...plantasActuales, nuevaPlanta] });
    _logActividad('AGREGAR_PLANTA', camaId, plantaId);
    return nuevaPlanta;
}

// Fase 16.5: notas/plagas de una cama arco/circular, editables desde
// detalleCamaModal por cualquier usuario autenticado — misma regla de
// Firestore que agregarPlantaACama (create/update sin restricción de rol
// en camas_cosecha, ver diagnóstico de la fase). A diferencia de
// agregarPlantaACama, esta función NO lee el documento primero: no depende
// de ningún valor calculado a partir del estado actual en Firestore (no
// hay posición que no-traslapar, no hay array que fusionar a mano) — es un
// merge parcial directo, mismo molde que actualizarInventario/
// actualizarQuimico. El llamador es responsable de mandar SOLO
// { notas, plagas } — updateDoc nunca toca `plantas`/`tipo`/`nombre`/etc.
// aunque existan en el documento, mismo criterio ya documentado en
// actualizarInventario sobre no mandar de más.
//
// Nombre: actualizarDetalleCama, no actualizarCamaDetalle ni
// actualizarNotasPlagasCama. Sigue el orden ya establecido por
// abrirDetalleCama/detalleCamaModal (Fase 14.5) en vez de invertirlo, y
// nombra el ALCANCE ("lo que sea que detalleCamaModal edite") en vez de
// los campos de hoy — si ese modal gana un tercer campo editable más
// adelante, esta función no necesita renombrarse. Mismo criterio que
// radiosAnillo en geometria-espiral.js: el nombre describe el concepto
// estable, no el parámetro de turno.
export async function actualizarDetalleCama(camaId, datos) {
    await updateDoc(doc(db, PATHS.camas, camaId), datos);
    _logActividad('ACTUALIZAR_DETALLE_CAMA', camaId, null);
}
