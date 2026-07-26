// test/chores.test.js
//
// js/services/chores.js contra un Firestore falso (test/helpers/
// firebase-mock.js) — requiere --experimental-test-module-mocks (ver
// package.json "test" script). mock.module() se llama ANTES del import
// dinámico de chores.js, a propósito: los bindings de ES modules se
// resuelven al evaluar el módulo importador por primera vez, así que
// mockear firebase.js DESPUÉS de que algo ya haya importado chores.js (en
// este mismo proceso) no tendría efecto — node --test aísla cada archivo
// de test en su propio proceso, así que esto es seguro dentro de este
// archivo sin coordinarlo con los demás test/*.test.js.
//
// La rama de completarTarea() que dispara asistencia automática en sábado
// (`new Date().getDay() === 6`) NO se prueba acá — depende del día real
// del sistema y el código no acepta una fecha inyectada, así que fijarla
// requeriría reemplazar el Date global (frágil, con riesgo de romper el
// resto del test) en vez de mockear un límite real del módulo. Se
// documenta como excluida a propósito, mismo criterio que otras exclusiones
// ya documentadas en este proyecto (ver AI_CONTEXT.md).
//
// Corre con: npm test (equivalente a node --experimental-test-module-mocks --test)

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { setUsuarioActual } from '../js/services/session.js';

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const {
    obtenerTareas, crearTarea, obtenerTareasAsignadas, asignarEstudiantes,
    _registrarHoras, registrarAsistencia, obtenerAsistenciasPorFecha, completarTarea
} = await import('../js/services/chores.js');

beforeEach(() => {
    firebaseMock.reset();
    setUsuarioActual(null);
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
    test('crea con estado pendiente, asignados por default y fechaCreacion', async () => {
        const id = await crearTarea({ titulo: 'Cosechar' });

        const guardada = firebaseMock.leerDoc('tareas', id);
        assert.equal(guardada.titulo, 'Cosechar');
        assert.equal(guardada.estado, 'pendiente');
        assert.deepEqual(guardada.asignados, []);
        assert.ok(guardada.fechaCreacion);
    });

    test('respeta el array de asignados si viene en los datos', async () => {
        const id = await crearTarea({ titulo: 'Cosechar', asignados: ['u1', 'u2'] });
        assert.deepEqual(firebaseMock.leerDoc('tareas', id).asignados, ['u1', 'u2']);
    });

    test('registra actividad solo si hay un usuario en sesión', async () => {
        await crearTarea({ titulo: 'Sin sesión' });
        assert.equal(firebaseMock.leerColeccion('registro_actividad').length, 0);

        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });
        await crearTarea({ titulo: 'Con sesión' });
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

describe('registrarAsistencia', () => {
    test('siempre 15 horas, origen automatica', async () => {
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });
        await registrarAsistencia('u1', 'tareaX');
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 15);
        const [asistencia] = firebaseMock.leerColeccion('asistencias');
        assert.equal(asistencia.origen, 'automatica');
        assert.equal(asistencia.tareaId, 'tareaX');
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
    test('marca estado completada y registra actividad (rama de sábado excluida, ver cabecera)', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'X', estado: 'pendiente' } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await completarTarea('t1', []);

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'completada');
        assert.equal(firebaseMock.leerColeccion('registro_actividad')[0].tipo, 'COMPLETAR_TAREA');
    });
});
