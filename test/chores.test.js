// test/chores.test.js
//
// js/services/chores.js contra un Firestore falso (test/helpers/
// firebase-mock.js) — requiere --experimental-test-module-mocks (ver
// package.json "test" script). mock.module() se llama ANTES del import
// dinámico de chores.js, a propósito: los bindings de ES modules se
// resuelven al evaluar el módulo importador por primera vez, así que
// mockear firebase.js/storage.js DESPUÉS de que algo ya haya importado
// chores.js (en este mismo proceso) no tendría efecto — node --test aísla
// cada archivo de test en su propio proceso, así que esto es seguro dentro
// de este archivo sin coordinarlo con los demás test/*.test.js.
//
// storage.js se mockea aparte de firebase.js (no vía firebaseMock.exports)
// porque chores.js importa subirEvidenciaTarea directo de './storage.js',
// no de firebase.js — subirEvidenciaTareaImpl es reasignable por test para
// simular éxito/fallo de la subida sin tocar el mock de Firestore.
//
// Corre con: npm test (equivalente a node --experimental-test-module-mocks --test)

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { setUsuarioActual } from '../js/services/session.js';

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

let subirEvidenciaTareaImpl = async (tareaId) => `https://fake-url/${tareaId}.jpg`;
const storageUrl = new URL('../js/services/storage.js', import.meta.url).href;
mock.module(storageUrl, {
    namedExports: {
        subirEvidenciaTarea: (...args) => subirEvidenciaTareaImpl(...args)
    }
});

const {
    obtenerTareas, crearTarea, obtenerTareasAsignadas, asignarEstudiantes,
    _registrarHoras, obtenerAsistenciasPorFecha, completarTarea,
    enviarARevision, aprobarTareaAutoasignada, rechazarTareaAutoasignada,
    editarTareaAutoasignada, eliminarTarea
} = await import('../js/services/chores.js');

beforeEach(() => {
    firebaseMock.reset();
    setUsuarioActual(null);
    subirEvidenciaTareaImpl = async (tareaId) => `https://fake-url/${tareaId}.jpg`;
});

describe('obtenerTareas', () => {
    test('devuelve todos los documentos de la colección tareas con su id', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Regar', estado: 'pendiente' },
            t2: { titulo: 'Podar', estado: 'completada' }
        });

        const tareas = await obtenerTareas();

        assert.equal(tareas.length, 2);
        assert.deepEqual(
            tareas.map((t) => t.id).sort(),
            ['t1', 't2']
        );
    });
});

describe('crearTarea', () => {
    test('crea con estado pendiente, asignados por default, horasAOtorgar/fotoEvidenciaUrl en null/0 y fechaCreacion', async () => {
        const id = await crearTarea({ titulo: 'Cosechar', tipo: 'individual' });

        const guardada = firebaseMock.leerDoc('tareas', id);
        assert.equal(guardada.titulo, 'Cosechar');
        assert.equal(guardada.tipo, 'individual');
        assert.equal(guardada.estado, 'pendiente');
        assert.deepEqual(guardada.asignados, []);
        assert.equal(guardada.horasAOtorgar, 0);
        assert.equal(guardada.fotoEvidenciaUrl, null);
        assert.ok(guardada.fechaCreacion);
    });

    test('origen por default es "asignada" (no rompe tareas/llamadas viejas); "autoasignada" solo si se pide', async () => {
        const idViejo = await crearTarea({ titulo: 'X', tipo: 'individual' });
        assert.equal(firebaseMock.leerDoc('tareas', idViejo).origen, 'asignada');

        const idAuto = await crearTarea({ titulo: 'Y', tipo: 'individual', origen: 'autoasignada' });
        assert.equal(firebaseMock.leerDoc('tareas', idAuto).origen, 'autoasignada');

        // Cualquier otro valor (o typo) cae también a 'asignada' — no se
        // inventa un tercer origen silencioso.
        const idRaro = await crearTarea({ titulo: 'Z', tipo: 'individual', origen: 'otro' });
        assert.equal(firebaseMock.leerDoc('tareas', idRaro).origen, 'asignada');
    });

    test('creadorId es el uid en sesión al crear; motivoRechazo nace null', async () => {
        setUsuarioActual({ uid: 'u1', email: 'ana@test.com' });
        const id = await crearTarea({ titulo: 'X', tipo: 'individual', origen: 'autoasignada' });
        const guardada = firebaseMock.leerDoc('tareas', id);
        assert.equal(guardada.creadorId, 'u1');
        assert.equal(guardada.motivoRechazo, null);
    });

    test('respeta el array de asignados y horasAOtorgar si vienen en los datos', async () => {
        const id = await crearTarea({ titulo: 'Cosechar', tipo: 'asistencia', asignados: ['u1', 'u2'], horasAOtorgar: 15 });
        const guardada = firebaseMock.leerDoc('tareas', id);
        assert.deepEqual(guardada.asignados, ['u1', 'u2']);
        assert.equal(guardada.horasAOtorgar, 15);
    });

    test('rechaza sin un tipo válido — no inventa default', async () => {
        await assert.rejects(() => crearTarea({ titulo: 'Sin tipo' }));
        await assert.rejects(() => crearTarea({ titulo: 'Tipo inválido', tipo: 'otro' }));
        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });

    // fechaRealizada (2026-09-19): el día en que el trabajo pasó — el
    // caller (vista-tareas.js/vista-proyectos.js) siempre manda un valor
    // (default hoy, editable a una fecha pasada); esta función no inventa
    // "hoy" si no viene, para no duplicar esa lógica en dos lugares.
    test('respeta fechaRealizada si viene en los datos; sin ella, null (no inventa "hoy")', async () => {
        const id = await crearTarea({ titulo: 'Riego de ayer', tipo: 'individual', fechaRealizada: '2026-09-18' });
        assert.equal(firebaseMock.leerDoc('tareas', id).fechaRealizada, '2026-09-18');

        const idSinFecha = await crearTarea({ titulo: 'Sin fecha', tipo: 'individual' });
        assert.equal(firebaseMock.leerDoc('tareas', idSinFecha).fechaRealizada, null);
    });

    test('registra actividad solo si hay un usuario en sesión', async () => {
        await crearTarea({ titulo: 'Sin sesión', tipo: 'individual' });
        assert.equal(firebaseMock.leerColeccion('registro_actividad').length, 0);

        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });
        await crearTarea({ titulo: 'Con sesión', tipo: 'individual' });
        const log = firebaseMock.leerColeccion('registro_actividad');
        assert.equal(log.length, 1);
        assert.equal(log[0].tipo, 'CREAR_TAREA');
        assert.equal(log[0].uid, 'admin1');
    });
});

describe('obtenerTareasAsignadas', () => {
    test('filtra por asignados array-contains + estado pendiente, ordena por fechaCreacion asc, respeta cantidad y total real', async () => {
        firebaseMock.seed('tareas', {
            a: { asignados: ['u1'], estado: 'pendiente', fechaCreacion: { __ts: true, millis: 3 } },
            b: { asignados: ['u1'], estado: 'pendiente', fechaCreacion: { __ts: true, millis: 1 } },
            c: { asignados: ['u1'], estado: 'pendiente', fechaCreacion: { __ts: true, millis: 2 } },
            d: { asignados: ['u1'], estado: 'completada', fechaCreacion: { __ts: true, millis: 0 } }, // excluida: no pendiente
            e: { asignados: ['u2'], estado: 'pendiente', fechaCreacion: { __ts: true, millis: 0 } }   // excluida: otro uid
        });

        const { tareas, total } = await obtenerTareasAsignadas('u1', 2);

        assert.deepEqual(tareas.map((t) => t.id), ['b', 'c']); // las 2 más antiguas
        assert.equal(total, 3); // b, c, a — d y e no cuentan
    });
});

describe('asignarEstudiantes', () => {
    test('sobreescribe el array de asignados y registra actividad', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'X', asignados: [] } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await asignarEstudiantes('t1', ['u1', 'u2']);

        assert.deepEqual(firebaseMock.leerDoc('tareas', 't1').asignados, ['u1', 'u2']);
        const log = firebaseMock.leerColeccion('registro_actividad');
        assert.equal(log[0].tipo, 'ASIGNAR_ESTUDIANTES');
        assert.equal(log[0].detalle, 'u1, u2');
    });

    test('detalle del log dice "(sin asignados)" cuando el array queda vacío', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'X', asignados: ['u1'] } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await asignarEstudiantes('t1', []);

        assert.equal(firebaseMock.leerColeccion('registro_actividad')[0].detalle, '(sin asignados)');
    });
});

describe('_registrarHoras', () => {
    test('escritura atómica: crea la asistencia Y suma horasTotales en el mismo commit', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', horasTotales: 5 } });

        const asistenciaId = await _registrarHoras('u1', 3, { origen: 'manual', motivo: 'ajuste', autorizadoPor: 'admin1' });

        const asistencia = firebaseMock.leerDoc('asistencias', asistenciaId);
        assert.equal(asistencia.estudianteId, 'u1');
        assert.equal(asistencia.horasTrabajadas, 3);
        assert.equal(asistencia.origen, 'manual');
        assert.equal(asistencia.motivo, 'ajuste');

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 8);
    });

    test('horas negativas restan (corrección a la baja)', async () => {
        firebaseMock.seed('usuarios', { u1: { horasTotales: 10 } });
        await _registrarHoras('u1', -4, { origen: 'manual', motivo: 'corrección', autorizadoPor: 'admin1' });
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 6);
    });

    test('tipo de log depende de origen: automatica -> REGISTRAR_ASISTENCIA, manual -> AJUSTE_HORAS_MANUAL', async () => {
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 }, u2: { horasTotales: 0 } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await _registrarHoras('u1', 15, { origen: 'automatica', autorizadoPor: 'admin1' });
        await _registrarHoras('u2', 2, { origen: 'manual', motivo: 'x', autorizadoPor: 'admin1' });

        const log = firebaseMock.leerColeccion('registro_actividad');
        assert.deepEqual(log.map((l) => l.tipo).sort(), ['AJUSTE_HORAS_MANUAL', 'REGISTRAR_ASISTENCIA']);
    });
});

describe('obtenerAsistenciasPorFecha', () => {
    test('filtra por igualdad exacta de fecha', async () => {
        firebaseMock.seed('asistencias', {
            a1: { estudianteId: 'u1', fecha: '2026-07-25' },
            a2: { estudianteId: 'u2', fecha: '2026-07-26' }
        });
        const resultado = await obtenerAsistenciasPorFecha('2026-07-26');
        assert.equal(resultado.length, 1);
        assert.equal(resultado[0].estudianteId, 'u2');
    });
});

describe('completarTarea', () => {
    test('marca estado completada y registra actividad', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'X', estado: 'pendiente' } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await completarTarea('t1', []);

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'completada');
        assert.equal(firebaseMock.leerColeccion('registro_actividad')[0].tipo, 'COMPLETAR_TAREA');
    });

    test('sin horasAOtorgar (o en 0): no otorga horas a nadie', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'pendiente' } });
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });

        await completarTarea('t1', ['u1']);

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 0);
        assert.equal(firebaseMock.leerColeccion('asistencias').length, 0);
    });

    test('con horasAOtorgar explícito: otorga esas horas a TODOS los asignados, origen automatica', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'pendiente' } });
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 }, u2: { horasTotales: 5 } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await completarTarea('t1', ['u1', 'u2'], { horasAOtorgar: 15 });

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 15);
        assert.equal(firebaseMock.leerDoc('usuarios', 'u2').horasTotales, 20);
        const asistencias = firebaseMock.leerColeccion('asistencias');
        assert.equal(asistencias.length, 2);
        assert.ok(asistencias.every((a) => a.origen === 'automatica' && a.tareaId === 't1'));
    });

    test('sin evidencia (archivoEvidencia null/omitido): no llama a Storage, fotoEvidenciaUrl no se toca', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'pendiente', fotoEvidenciaUrl: null } });
        let llamadas = 0;
        subirEvidenciaTareaImpl = async () => { llamadas += 1; return 'no-debería-llamarse'; };

        await completarTarea('t1', []);

        assert.equal(llamadas, 0);
        assert.equal(firebaseMock.leerDoc('tareas', 't1').fotoEvidenciaUrl, null);
    });

    test('con evidencia: sube la foto y guarda la URL devuelta en fotoEvidenciaUrl', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'pendiente', fotoEvidenciaUrl: null } });
        subirEvidenciaTareaImpl = async (tareaId) => `https://storage.test/${tareaId}.jpg`;

        await completarTarea('t1', [], { archivoEvidencia: { size: 100 } });

        assert.equal(firebaseMock.leerDoc('tareas', 't1').fotoEvidenciaUrl, 'https://storage.test/t1.jpg');
    });

    test('orden de operaciones: si la subida falla, la tarea NUNCA se marca completada ni se otorgan horas', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'pendiente' } });
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });
        subirEvidenciaTareaImpl = async () => { throw new Error('falló la subida'); };

        await assert.rejects(
            () => completarTarea('t1', ['u1'], { horasAOtorgar: 15, archivoEvidencia: { size: 100 } }),
            /falló la subida/
        );

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'pendiente');
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 0);
        assert.equal(firebaseMock.leerColeccion('asistencias').length, 0);
        assert.equal(firebaseMock.leerColeccion('registro_actividad').length, 0);
    });
});

describe('enviarARevision', () => {
    test('requiere evidencia — rechaza sin archivo, no toca Firestore', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'pendiente' } });
        await assert.rejects(() => enviarARevision('t1', null));
        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'pendiente');
    });

    test('sube evidencia, pasa a en_revision y limpia un motivoRechazo anterior', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'rechazada', motivoRechazo: 'Falta la foto' } });
        subirEvidenciaTareaImpl = async (tareaId) => `https://storage.test/${tareaId}.jpg`;

        await enviarARevision('t1', { size: 100 });

        const guardada = firebaseMock.leerDoc('tareas', 't1');
        assert.equal(guardada.estado, 'en_revision');
        assert.equal(guardada.fotoEvidenciaUrl, 'https://storage.test/t1.jpg');
        assert.equal(guardada.motivoRechazo, null);
    });
});

describe('aprobarTareaAutoasignada', () => {
    test('marca completada y otorga horasAOtorgar COMPLETAS a cada asignado (sin repartir)', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'en_revision' } });
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 }, u2: { horasTotales: 5 } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await aprobarTareaAutoasignada('t1', ['u1', 'u2'], 10);

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'completada');
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 10);
        assert.equal(firebaseMock.leerDoc('usuarios', 'u2').horasTotales, 15);
        assert.equal(firebaseMock.leerColeccion('registro_actividad').some((l) => l.tipo === 'APROBAR_TAREA'), true);
    });

    test('sin horasAOtorgar (o en 0): no otorga horas a nadie', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'en_revision' } });
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });

        await aprobarTareaAutoasignada('t1', ['u1'], 0);

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 0);
        assert.equal(firebaseMock.leerColeccion('asistencias').length, 0);
    });
});

describe('rechazarTareaAutoasignada', () => {
    test('motivo obligatorio — rechaza sin motivo o con solo espacios', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'en_revision' } });
        await assert.rejects(() => rechazarTareaAutoasignada('t1', ''));
        await assert.rejects(() => rechazarTareaAutoasignada('t1', '   '));
        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'en_revision');
    });

    test('con motivo: pasa a rechazada y guarda el motivo (trim)', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'en_revision' } });
        await rechazarTareaAutoasignada('t1', '  Falta la foto  ');
        const guardada = firebaseMock.leerDoc('tareas', 't1');
        assert.equal(guardada.estado, 'rechazada');
        assert.equal(guardada.motivoRechazo, 'Falta la foto');
    });
});

describe('editarTareaAutoasignada', () => {
    test('actualiza título/tipo/horas/asignados sin tocar estado', async () => {
        firebaseMock.seed('tareas', { t1: { estado: 'pendiente', titulo: 'Vieja', tipo: 'individual', horasAOtorgar: 0, asignados: ['u1'] } });

        await editarTareaAutoasignada('t1', { titulo: 'Nueva', tipo: 'asistencia', horasAOtorgar: 5, asignados: ['u1', 'u2'] });

        const guardada = firebaseMock.leerDoc('tareas', 't1');
        assert.equal(guardada.titulo, 'Nueva');
        assert.equal(guardada.tipo, 'asistencia');
        assert.equal(guardada.horasAOtorgar, 5);
        assert.deepEqual(guardada.asignados, ['u1', 'u2']);
        assert.equal(guardada.estado, 'pendiente');
    });
});

describe('eliminarTarea', () => {
    test('borra el documento y registra actividad', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'X' } });
        setUsuarioActual({ uid: 'u1', email: 'ana@test.com' });

        await eliminarTarea('t1');

        assert.equal(firebaseMock.leerDoc('tareas', 't1'), null);
        assert.equal(firebaseMock.leerColeccion('registro_actividad')[0].tipo, 'ELIMINAR_TAREA');
    });
});

// Escenario: horas infladas antes de revisión (fix 2026-09-06)
//
// El mock de Firestore (firebase-mock.js) NO simula firestore.rules —
// updateDoc() del mock escribe lo que le pidan, sin importar qué diga el
// archivo de reglas. Por eso editarTareaAutoasignada() de chores.js (que
// tampoco valida nada client-side, ver su código) va a "tener éxito"
// contra el mock pase lo que pase aquí — el mock por sí solo NO puede
// demostrar que el hueco de horas infladas está cerrado.
//
// Dos tests, cada uno cubriendo lo que el otro no puede:
//
// 1) 'la regla en el archivo ya no declara horasAOtorgar/asignados como
//    editables' lee firestore.rules como texto y confirma que el fix
//    sigue ahí. Es la alarma si alguien revierte el cambio sin querer:
//    detecta el texto, no el comportamiento.
//
// 2) 'paso 3 (inflar horas) es rechazado por la regla' reimplementa esa
//    misma rama de la regla como función pura en JS (reglaEdicionCreador,
//    abajo) y corre la secuencia completa de 4 pasos contra ella. Es una
//    RÉPLICA manual del texto de firestore.rules, no el motor real de
//    Firestore (eso solo lo valida el emulador) — si esa rama de la regla
//    cambia en el futuro, esta función y este test deben actualizarse a
//    mano, no hay sincronía automática entre ambos. El test (1) es
//    justamente la red de seguridad para ese riesgo: avisa si el texto
//    fuente cambia sin que alguien también revise este mirror.
describe('Escenario: horas infladas antes de revisión (firestore.rules)', () => {
    let contenidoReglas;

    test('la regla en el archivo ya no declara horasAOtorgar/asignados como editables', async () => {
        contenidoReglas = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

        const marcador = 'El creador edita campos de la suya';
        const idx = contenidoReglas.indexOf(marcador);
        assert.notEqual(idx, -1, `no se encontró el comentario "${marcador}" en firestore.rules — ¿se reescribió esta rama de la regla?`);

        const match = contenidoReglas.slice(idx).match(/hasOnly\(\[([^\]]*)\]\)/);
        assert.ok(match, 'no se encontró un hasOnly([...]) después de ese comentario');

        const campos = match[1].split(',').map((s) => s.trim().replace(/'/g, ''));
        assert.deepEqual(campos.sort(), ['tipo', 'titulo']);
    });

    // Mirror manual de la rama "el creador edita campos de la suya" de
    // firestore.rules (match /tareas/{tareaId} { allow update: ... }).
    // Mantener en sync a mano con esa rama — ver comentario de arriba.
    function reglaEdicionCreador({ actual, uid, cambios }) {
        const origen = actual.origen ?? 'asignada';
        if (origen !== 'autoasignada') return false;
        if (actual.creadorId !== uid) return false;
        if (!['pendiente', 'rechazada'].includes(actual.estado)) return false;
        const camposPermitidos = ['titulo', 'tipo'];
        return Object.keys(cambios).every((campo) => camposPermitidos.includes(campo));
    }

    // Simula lo que pasaría contra Firestore real: si la regla rechaza el
    // update, lanza (como haría un permission-denied real) ANTES de tocar
    // el mock — así el mock nunca llega a aplicar un cambio que la regla
    // real no permitiría.
    async function intentarEditarComoCreador(tareaId, actual, uid, cambios) {
        if (!reglaEdicionCreador({ actual, uid, cambios })) {
            throw new Error('PERMISSION_DENIED (simulado): firestore.rules rechaza este update');
        }
        return editarTareaAutoasignada(tareaId, {
            titulo: actual.titulo,
            tipo: actual.tipo,
            horasAOtorgar: cambios.horasAOtorgar ?? actual.horasAOtorgar,
            asignados: cambios.asignados ?? actual.asignados
        });
    }

    test('paso 3 (inflar horas) es rechazado por la regla, y nunca llega inflado a revisión', async () => {
        setUsuarioActual({ uid: 'u1', email: 'ana@test.com' });

        // Paso 1: crear tarea autoasignada con horasAOtorgar: 1, pendiente.
        const id = await crearTarea({ titulo: 'Regar', tipo: 'individual', origen: 'autoasignada', horasAOtorgar: 1 });
        const tarea = firebaseMock.leerDoc('tareas', id);
        assert.equal(tarea.estado, 'pendiente');
        assert.equal(tarea.horasAOtorgar, 1);
        assert.equal(tarea.creadorId, 'u1');

        // Control: la misma regla SÍ permite editar solo título/tipo —
        // así el test de abajo no es una regla vacía que rechaza todo.
        assert.equal(reglaEdicionCreador({ actual: tarea, uid: 'u1', cambios: { titulo: 'Regar plantas' } }), true);

        // Paso 2: subir evidencia real a Storage — permitido, es el creador.
        subirEvidenciaTareaImpl = async (tareaId) => `https://storage.test/${tareaId}.jpg`;
        const urlEvidencia = await subirEvidenciaTareaImpl(id, { size: 100 });
        assert.equal(urlEvidencia, `https://storage.test/${id}.jpg`);

        // Paso 3: intentar editar horasAOtorgar a 999 — debe ser RECHAZADO.
        await assert.rejects(
            () => intentarEditarComoCreador(id, tarea, 'u1', { horasAOtorgar: 999 }),
            /PERMISSION_DENIED/
        );

        // El rechazo del paso 3 pasó ANTES de tocar el mock: horasAOtorgar
        // sigue en 1, no en 999.
        assert.equal(firebaseMock.leerDoc('tareas', id).horasAOtorgar, 1);

        // Paso 4: como el paso 3 falló, enviar a revisión ahora nunca
        // carga un número inflado — sigue siendo 1, el declarado al crear.
        await enviarARevision(id, { size: 100 });
        const enRevision = firebaseMock.leerDoc('tareas', id);
        assert.equal(enRevision.estado, 'en_revision');
        assert.equal(enRevision.horasAOtorgar, 1);
    });
});
