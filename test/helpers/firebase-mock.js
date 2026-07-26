// test/helpers/firebase-mock.js
//
// Firestore + Auth falsos, en memoria, para testear db.js/chores.js/
// usuarios.js/auth.js sin pegarle a Firestore real. Implementa el
// subconjunto de la API que js/services/firebase.js re-exporta y que esos
// 4 módulos realmente usan (confirmado por grep contra los 4 archivos,
// 2026-07-26) — no es una réplica completa del SDK de Firebase, así que no
// sirve como sustituto de firebase.js en ningún otro contexto sin revisar
// primero qué falta.
//
// Uso: cada test file llama createFirebaseMock(), sustituye
// '../js/services/firebase.js' con mock.module() (node:test,
// --experimental-test-module-mocks) usando `.exports`, y recién DESPUÉS
// importa dinámicamente el módulo real que se va a probar — el orden
// importa, ver comentario en cualquier test/*.service.test.js.
//
// Limitaciones deliberadas (no hacen falta para los 4 módulos reales):
// sin campos anidados (a.b.c) en where()/orderBy(), sin límite de
// tamaño de batch, sin validación de qué combinaciones de where/orderBy
// requieren un índice compuesto (eso es responsabilidad de Firestore real,
// no de la lógica de la app).

function generarId() {
    return 'mock_' + Math.random().toString(36).slice(2, 12);
}

function clonar(valor) {
    return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

function normalizar(valor) {
    // Timestamps del mock (ver serverTimestamp/Timestamp.fromDate abajo) se
    // comparan por su valor numérico interno, no por identidad de objeto.
    if (valor && typeof valor === 'object' && valor.__ts) return valor.millis;
    return valor;
}

function comparar(a, b) {
    const na = normalizar(a);
    const nb = normalizar(b);
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
}

function cumpleCondicion(datos, { campo, operador, valor }) {
    const actual = datos[campo];
    switch (operador) {
        case '==': return comparar(actual, valor) === 0;
        case '>=': return comparar(actual, valor) >= 0;
        case '<=': return comparar(actual, valor) <= 0;
        case 'array-contains': return Array.isArray(actual) && actual.includes(valor);
        default: throw new Error(`[firebase-mock] operador where() no soportado: ${operador}`);
    }
}

export function createFirebaseMock() {
    // path (string) -> Map(id -> datos)
    const colecciones = new Map();
    let contadorTs = 0;

    function obtenerColeccion(path) {
        if (!colecciones.has(path)) colecciones.set(path, new Map());
        return colecciones.get(path);
    }

    function leerTodos(path) {
        return [...obtenerColeccion(path).entries()].map(([id, datos]) => ({ id, datos }));
    }

    // ── Referencias ──────────────────────────────────────────────────
    function collection(_db, path) {
        return { __tipo: 'collection', path };
    }

    function doc(refODb, path, id) {
        if (refODb && refODb.__tipo === 'collection') {
            // doc(collectionRef) de un solo argumento — auto-genera ID
            // (mismo patrón que usa chores.js._registrarHoras para
            // asistenciaRef, o db.js.crearHistorialCultivo para
            // historialRef).
            return { __tipo: 'doc', path: refODb.path, id: generarId() };
        }
        // doc(db, path, id) de tres argumentos.
        return { __tipo: 'doc', path, id };
    }

    function query(collectionRef, ...constraints) {
        return { __tipo: 'query', path: collectionRef.path, constraints };
    }

    function where(campo, operador, valor) {
        return { __tipo: 'where', campo, operador, valor };
    }

    function orderBy(campo, direccion = 'asc') {
        return { __tipo: 'orderBy', campo, direccion };
    }

    function limit(n) {
        return { __tipo: 'limit', n };
    }

    // ── Lecturas ─────────────────────────────────────────────────────
    function crearSnapDoc(id, datos) {
        return {
            id,
            exists: () => datos !== undefined,
            data: () => clonar(datos)
        };
    }

    async function getDoc(ref) {
        return crearSnapDoc(ref.id, obtenerColeccion(ref.path).get(ref.id));
    }

    function resolverQuery(refOQuery) {
        const path = refOQuery.path;
        const constraints = refOQuery.constraints || [];
        let items = leerTodos(path);

        constraints.filter((c) => c.__tipo === 'where').forEach((c) => {
            items = items.filter(({ datos }) => cumpleCondicion(datos, c));
        });

        const orden = constraints.find((c) => c.__tipo === 'orderBy');
        if (orden) {
            items = [...items].sort((a, b) => {
                const cmp = comparar(a.datos[orden.campo], b.datos[orden.campo]);
                return orden.direccion === 'desc' ? -cmp : cmp;
            });
        }

        const lim = constraints.find((c) => c.__tipo === 'limit');
        if (lim) items = items.slice(0, lim.n);

        return items;
    }

    async function getDocs(refOQuery) {
        return { docs: resolverQuery(refOQuery).map(({ id, datos }) => crearSnapDoc(id, datos)) };
    }

    async function getCountFromServer(refOQuery) {
        const count = resolverQuery(refOQuery).length;
        return { data: () => ({ count }) };
    }

    // ── Escrituras ───────────────────────────────────────────────────
    function aplicarIncrementos(existente, datos) {
        const resultado = { ...existente };
        Object.entries(datos).forEach(([campo, valor]) => {
            if (valor && typeof valor === 'object' && '__increment' in valor) {
                resultado[campo] = (existente?.[campo] || 0) + valor.__increment;
            } else {
                resultado[campo] = valor;
            }
        });
        return resultado;
    }

    async function addDoc(collectionRef, datos) {
        const id = generarId();
        obtenerColeccion(collectionRef.path).set(id, clonar(datos));
        return { __tipo: 'doc', path: collectionRef.path, id };
    }

    async function setDoc(ref, datos) {
        obtenerColeccion(ref.path).set(ref.id, clonar(datos));
    }

    async function updateDoc(ref, datos) {
        const mapa = obtenerColeccion(ref.path);
        if (!mapa.has(ref.id)) {
            throw new Error(`[firebase-mock] updateDoc sobre documento inexistente: ${ref.path}/${ref.id}`);
        }
        mapa.set(ref.id, aplicarIncrementos(mapa.get(ref.id), datos));
    }

    async function deleteDoc(ref) {
        obtenerColeccion(ref.path).delete(ref.id);
    }

    function writeBatch(_db) {
        const operaciones = [];
        return {
            set(ref, datos) { operaciones.push({ tipo: 'set', ref, datos }); },
            update(ref, datos) { operaciones.push({ tipo: 'update', ref, datos }); },
            delete(ref) { operaciones.push({ tipo: 'delete', ref }); },
            async commit() {
                for (const op of operaciones) {
                    if (op.tipo === 'set') await setDoc(op.ref, op.datos);
                    else if (op.tipo === 'update') await updateDoc(op.ref, op.datos);
                    else await deleteDoc(op.ref);
                }
            }
        };
    }

    function increment(n) {
        return { __increment: n };
    }

    function serverTimestamp() {
        // Resuelve a un valor concreto de inmediato (a diferencia del
        // sentinel real de Firestore, que el servidor resuelve async) —
        // el contador desempata llamadas en el mismo milisegundo para que
        // orderBy('fecha') dé un orden estable y predecible en los tests.
        contadorTs += 1;
        return { __ts: true, millis: Date.now() + contadorTs };
    }

    const Timestamp = {
        fromDate(date) {
            return { __ts: true, millis: date.getTime(), toDate: () => date };
        }
    };

    function onSnapshot() {
        // Ningún módulo probado lo usa (confirmado por grep, 2026-07-26) —
        // stub sin comportamiento real, solo para que un import no truene
        // si algo llega a referenciarlo.
        return () => {};
    }

    // ── Auth ─────────────────────────────────────────────────────────
    const authState = { currentUser: null, callback: null };
    let signInResultado = null;
    let signInError = null;

    const auth = { __tipo: 'auth' };

    function GoogleAuthProvider() {}

    function onAuthStateChanged(_auth, callback) {
        authState.callback = callback;
        callback(authState.currentUser);
        return () => { authState.callback = null; };
    }

    async function signInWithPopup() {
        if (signInError) throw signInError;
        return signInResultado;
    }

    async function signOut() {
        authState.currentUser = null;
        if (authState.callback) await authState.callback(null);
    }

    const PATHS = {
        catalogo:    'catalogo_semillas',
        camas:       'camas_cosecha',
        actividad:   'registro_actividad',
        tareas:      'tareas',
        asistencias: 'asistencias',
        usuarios:    'usuarios',
        quimicos:    'catalogo_quimicos',
        inventario:  'inventario_general',
        historial:   'historial_cultivo',
        bitacora:    'bitacora_sesiones'
    };

    return {
        // Namedexports a pasar tal cual a mock.module(url, { namedExports }).
        exports: {
            db: {}, PATHS,
            collection, doc,
            onSnapshot,
            addDoc, updateDoc, deleteDoc, setDoc, getDoc, getDocs,
            query, where, orderBy, limit, serverTimestamp, Timestamp,
            writeBatch, increment,
            getCountFromServer,
            GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
            auth
        },

        // ── Controles para los tests ─────────────────────────────────
        seed(path, docsPorId) {
            const mapa = obtenerColeccion(path);
            mapa.clear();
            Object.entries(docsPorId).forEach(([id, datos]) => mapa.set(id, clonar(datos)));
        },
        reset() {
            // authState.callback NO se limpia acá a propósito: representa el
            // listener de onAuthStateChanged ya registrado (AuthService.init()
            // normalmente se llama UNA vez por proceso, no en cada test) — un
            // reset "de datos" entre tests no debe des-registrarlo, igual que
            // el SDK real no pierde el listener entre operaciones.
            colecciones.clear();
            authState.currentUser = null;
            signInResultado = null;
            signInError = null;
        },
        leerColeccion(path) {
            return leerTodos(path).map(({ id, datos }) => ({ id, ...clonar(datos) }));
        },
        leerDoc(path, id) {
            const datos = obtenerColeccion(path).get(id);
            return datos === undefined ? null : clonar(datos);
        },
        async triggerAuthState(user) {
            authState.currentUser = user;
            if (authState.callback) await authState.callback(user);
        },
        setSignInResultado(resultado) { signInResultado = resultado; signInError = null; },
        setSignInError(error) { signInError = error; signInResultado = null; }
    };
}
