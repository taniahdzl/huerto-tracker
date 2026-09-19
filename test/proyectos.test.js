// test/proyectos.test.js
//
// js/services/proyectos.js contra un Firestore falso (test/helpers/
// firebase-mock.js) — mismo patrón que chores.test.js: mock.module() antes
// del import dinámico. arrayUnion() del mock (agregado para esta feature)
// se ejerce vía agregarPasoAProyecto.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { setUsuarioActual } from '../js/services/session.js';

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const {
    crearProyecto, agregarPasoAProyecto, obtenerProyectosConProgreso,
    actualizarEstadoProyecto, eliminarProyecto
} = await import('../js/services/proyectos.js');

beforeEach(() => {
    firebaseMock.reset();
    setUsuarioActual(null);
});

describe('crearProyecto', () => {
    test('crea con estado:activo y pasos:[] siempre, sin importar lo que mande el caller', async () => {
        const id = await crearProyecto({ nombre: 'Huerto de otoño', descripcion: 'X', fechaObjetivo: '2026-10-01' });

        const guardado = firebaseMock.leerDoc('proyectos', id);
        assert.equal(guardado.nombre, 'Huerto de otoño');
        assert.equal(guardado.descripcion, 'X');
        assert.equal(guardado.fechaObjetivo, '2026-10-01');
        assert.equal(guardado.estado, 'activo');
        assert.deepEqual(guardado.pasos, []);
    });

    test('descripcion/fechaObjetivo caen a "" / null si no vienen', async () => {
        const id = await crearProyecto({ nombre: 'Sin extras' });
        const guardado = firebaseMock.leerDoc('proyectos', id);
        assert.equal(guardado.descripcion, '');
        assert.equal(guardado.fechaObjetivo, null);
    });

    test('rechaza sin nombre', async () => {
        await assert.rejects(() => crearProyecto({}));
        assert.equal(firebaseMock.leerColeccion('proyectos').length, 0);
    });

    test('registra actividad solo si hay sesión', async () => {
        await crearProyecto({ nombre: 'X' });
        assert.equal(firebaseMock.leerColeccion('registro_actividad').length, 0);

        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });
        await crearProyecto({ nombre: 'Y' });
        const log = firebaseMock.leerColeccion('registro_actividad');
        assert.equal(log.length, 1);
        assert.equal(log[0].tipo, 'CREAR_PROYECTO');
    });
});

describe('agregarPasoAProyecto', () => {
    test('crea la tarea con proyectoId seteado Y la agrega a pasos[] del proyecto, atómicamente', async () => {
        const proyectoId = await crearProyecto({ nombre: 'Proyecto X' });

        const tareaId = await agregarPasoAProyecto(
            proyectoId,
            { titulo: 'Regar cama 3', tipo: 'individual', asignados: ['u1'] },
            1
        );

        const tarea = firebaseMock.leerDoc('tareas', tareaId);
        assert.equal(tarea.titulo, 'Regar cama 3');
        assert.equal(tarea.proyectoId, proyectoId);
        assert.equal(tarea.estado, 'pendiente');
        assert.deepEqual(tarea.asignados, ['u1']);

        const proyecto = firebaseMock.leerDoc('proyectos', proyectoId);
        assert.deepEqual(proyecto.pasos, [{ tareaId, orden: 1 }]);
    });

    test('varios pasos se acumulan en pasos[] sin pisarse (arrayUnion, no un set plano)', async () => {
        const proyectoId = await crearProyecto({ nombre: 'Proyecto X' });
        const t1 = await agregarPasoAProyecto(proyectoId, { titulo: 'Paso 1', tipo: 'individual' }, 1);
        const t2 = await agregarPasoAProyecto(proyectoId, { titulo: 'Paso 2', tipo: 'individual' }, 2);

        const proyecto = firebaseMock.leerDoc('proyectos', proyectoId);
        assert.deepEqual(
            proyecto.pasos.map((p) => p.tareaId).sort(),
            [t1, t2].sort()
        );
    });

    test('propaga la validación de tipo de _datosNuevaTarea (sin tipo, rechaza) y no deja escrituras a medias', async () => {
        const proyectoId = await crearProyecto({ nombre: 'Proyecto X' });

        await assert.rejects(() => agregarPasoAProyecto(proyectoId, { titulo: 'Sin tipo' }, 1));

        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
        assert.deepEqual(firebaseMock.leerDoc('proyectos', proyectoId).pasos, []);
    });

    test('respeta horasAOtorgar y fechaLimite si vienen en los datos del paso', async () => {
        const proyectoId = await crearProyecto({ nombre: 'Proyecto X' });
        const tareaId = await agregarPasoAProyecto(
            proyectoId,
            { titulo: 'Asistencia sábado', tipo: 'asistencia', horasAOtorgar: 15, fechaLimite: '2026-09-05' },
            1
        );
        const tarea = firebaseMock.leerDoc('tareas', tareaId);
        assert.equal(tarea.horasAOtorgar, 15);
        assert.equal(tarea.fechaLimite, '2026-09-05');
    });
});

// Gestión de proyectos (2026-09-19): concluir/reactivar/eliminar.
describe('actualizarEstadoProyecto', () => {
    test('transiciona a un estado válido y registra actividad', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo' } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await actualizarEstadoProyecto('p1', 'completado');

        assert.equal(firebaseMock.leerDoc('proyectos', 'p1').estado, 'completado');
        const [log] = firebaseMock.leerColeccion('registro_actividad');
        assert.equal(log.tipo, 'ACTUALIZAR_ESTADO_PROYECTO');
        assert.equal(log.detalle, 'completado');
    });

    test('reactivar es la transición inversa (completado -> activo)', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'completado' } });
        await actualizarEstadoProyecto('p1', 'activo');
        assert.equal(firebaseMock.leerDoc('proyectos', 'p1').estado, 'activo');
    });

    test('rechaza un estado fuera de la whitelist, sin escribir nada', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo' } });
        await assert.rejects(() => actualizarEstadoProyecto('p1', 'archivado'));
        assert.equal(firebaseMock.leerDoc('proyectos', 'p1').estado, 'activo');
    });
});

describe('eliminarProyecto', () => {
    test('borra el documento del proyecto, SIN tocar las tareas referenciadas en sus pasos', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Regar', proyectoId: 'p1' } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', pasos: [{ tareaId: 't1', orden: 1 }] } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await eliminarProyecto('p1');

        assert.equal(firebaseMock.leerDoc('proyectos', 'p1'), null);
        assert.ok(firebaseMock.leerDoc('tareas', 't1')); // la tarea sigue existiendo, huérfana
        const [log] = firebaseMock.leerColeccion('registro_actividad');
        assert.equal(log.tipo, 'ELIMINAR_PROYECTO');
    });
});

describe('obtenerProyectosConProgreso', () => {
    test('resuelve pasosCompletados/totalPasos leyendo el ESTADO REAL de cada tarea referenciada', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'A', estado: 'completada' },
            t2: { titulo: 'B', estado: 'pendiente' },
            t3: { titulo: 'C', estado: 'completada' }
        });
        firebaseMock.seed('proyectos', {
            p1: { nombre: 'X', pasos: [{ tareaId: 't2', orden: 2 }, { tareaId: 't1', orden: 1 }, { tareaId: 't3', orden: 3 }] }
        });

        const [proyecto] = await obtenerProyectosConProgreso();

        assert.equal(proyecto.totalPasos, 3);
        assert.equal(proyecto.pasosCompletados, 2);
        // ordenados por `orden`, no por el orden en que quedaron en el array
        assert.deepEqual(proyecto.pasos.map((p) => p.tareaId), ['t1', 't2', 't3']);
        assert.equal(proyecto.pasos[0].tarea.titulo, 'A');
    });

    test('un paso cuya tarea ya no existe (borrada) resuelve tarea:null, sin inventar un placeholder', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Sigue viva', estado: 'pendiente' } });
        firebaseMock.seed('proyectos', {
            p1: { nombre: 'X', pasos: [{ tareaId: 't1', orden: 1 }, { tareaId: 'no-existe', orden: 2 }] }
        });

        const [proyecto] = await obtenerProyectosConProgreso();

        assert.equal(proyecto.pasos[0].tarea.titulo, 'Sigue viva');
        assert.equal(proyecto.pasos[1].tarea, null);
        assert.equal(proyecto.totalPasos, 2);
        assert.equal(proyecto.pasosCompletados, 0);
    });

    test('un proyecto sin pasos da 0/0, no divide entre cero', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'Vacío', pasos: [] } });
        const [proyecto] = await obtenerProyectosConProgreso();
        assert.equal(proyecto.totalPasos, 0);
        assert.equal(proyecto.pasosCompletados, 0);
    });

    test('nunca usa un contador guardado aparte: si el doc de proyecto trajera un pasosCompletados propio, se ignora y se recalcula', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'A', estado: 'pendiente' } });
        firebaseMock.seed('proyectos', {
            p1: { nombre: 'X', pasos: [{ tareaId: 't1', orden: 1 }], pasosCompletados: 99 /* dato corrupto/desincronizado a propósito */ }
        });

        const [proyecto] = await obtenerProyectosConProgreso();
        assert.equal(proyecto.pasosCompletados, 0); // recalculado, ignora el 99 corrupto
    });
});
