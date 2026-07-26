// test/usuarios.test.js
//
// js/services/usuarios.js contra el Firestore falso — ver cabecera de
// test/chores.test.js para el porqué del orden mock.module() -> import
// dinámico. usuarios.js importa chores.js internamente (_registrarHoras),
// así que este mismo mock de firebase.js cubre la cadena completa sin
// mockear chores.js aparte.
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
    obtenerUsuario, obtenerDirectorioEstudiantes, obtenerDirectorioCompleto,
    registrarUsuario, actualizarRolPropio, actualizarNombrePropio, ajustarHoras
} = await import('../js/services/usuarios.js');

beforeEach(() => {
    firebaseMock.reset();
    setUsuarioActual(null);
});

describe('obtenerUsuario', () => {
    test('devuelve el perfil con id si existe', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        const perfil = await obtenerUsuario('u1');
        assert.deepEqual(perfil, { id: 'u1', nombre: 'Ana', rol: 'estudiante' });
    });

    test('devuelve null si no existe (primer login, falta Setup)', async () => {
        assert.equal(await obtenerUsuario('desconocido'), null);
    });
});

describe('obtenerDirectorioEstudiantes / obtenerDirectorioCompleto', () => {
    test('el directorio de estudiantes filtra por rol==estudiante, el completo trae todos los roles', async () => {
        firebaseMock.seed('usuarios', {
            u1: { nombre: 'Ana', rol: 'estudiante' },
            u2: { nombre: 'Beto', rol: 'externo' },
            u3: { nombre: 'Cami', rol: 'admin' }
        });

        const estudiantes = await obtenerDirectorioEstudiantes();
        assert.deepEqual(estudiantes.map((e) => e.id), ['u1']);

        const completo = await obtenerDirectorioCompleto();
        assert.equal(completo.length, 3);
    });
});

describe('registrarUsuario', () => {
    test('crea el perfil con horasTotales en 0 y nombre recortado', async () => {
        await registrarUsuario('u1', 'ana@test.com', 'estudiante', '  Ana  ');

        const perfil = firebaseMock.leerDoc('usuarios', 'u1');
        assert.equal(perfil.email, 'ana@test.com');
        assert.equal(perfil.rol, 'estudiante');
        assert.equal(perfil.nombre, 'Ana');
        assert.equal(perfil.horasTotales, 0);
    });

    test('rechaza nombre vacío o solo espacios, sin escribir nada', async () => {
        await assert.rejects(() => registrarUsuario('u1', 'a@test.com', 'estudiante', '   '));
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1'), null);
    });

    test('registra en el log de actividad aunque no haya sesión activa aún (primer registro)', async () => {
        // registrarUsuario se llama DURANTE el flujo de Setup, antes de que
        // haya una sesión "completa" en session.js en algunos flujos — pero
        // _logActividad exige getUsuarioActual() no-null. Documentado tal
        // cual está hoy: sin sesión seteada, no queda log (mismo criterio
        // que crearTarea sin sesión).
        await registrarUsuario('u1', 'a@test.com', 'estudiante', 'Ana');
        assert.equal(firebaseMock.leerColeccion('registro_actividad').length, 0);
    });
});

describe('actualizarRolPropio', () => {
    test('acepta estudiante/externo y actualiza solo `rol`', async () => {
        firebaseMock.seed('usuarios', { u1: { rol: 'estudiante', horasTotales: 5 } });
        await actualizarRolPropio('u1', 'externo');
        const perfil = firebaseMock.leerDoc('usuarios', 'u1');
        assert.equal(perfil.rol, 'externo');
        assert.equal(perfil.horasTotales, 5); // intacto — updateDoc es merge parcial
    });

    test('rechaza "admin" (autopromoción) en el cliente, antes de escribir', async () => {
        firebaseMock.seed('usuarios', { u1: { rol: 'estudiante' } });
        await assert.rejects(() => actualizarRolPropio('u1', 'admin'));
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').rol, 'estudiante');
    });

    test('rechaza cualquier valor fuera de la whitelist', async () => {
        await assert.rejects(() => actualizarRolPropio('u1', 'lo-que-sea'));
    });
});

describe('actualizarNombrePropio', () => {
    test('recorta espacios y actualiza solo `nombre`', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Viejo', rol: 'estudiante' } });
        await actualizarNombrePropio('u1', '  Nuevo Nombre  ');
        const perfil = firebaseMock.leerDoc('usuarios', 'u1');
        assert.equal(perfil.nombre, 'Nuevo Nombre');
        assert.equal(perfil.rol, 'estudiante');
    });

    test('rechaza nombre vacío', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Viejo' } });
        await assert.rejects(() => actualizarNombrePropio('u1', '   '));
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').nombre, 'Viejo');
    });
});

describe('ajustarHoras', () => {
    test('exige motivo no vacío antes de tocar Firestore', async () => {
        await assert.rejects(() => ajustarHoras('u1', 5, '  '));
        assert.equal(firebaseMock.leerColeccion('asistencias').length, 0);
    });

    test('delega en _registrarHoras (chores.js) con origen manual y autorizadoPor del admin en sesión', async () => {
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });
        setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });

        await ajustarHoras('u1', 4, 'compensación');

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 4);
        const [asistencia] = firebaseMock.leerColeccion('asistencias');
        assert.equal(asistencia.origen, 'manual');
        assert.equal(asistencia.motivo, 'compensación');
        assert.equal(asistencia.autorizadoPor, 'admin1');
    });

    test('autorizadoPor es null si nadie tiene sesión (no debería pasar en la UI real, pero el código lo tolera)', async () => {
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });
        await ajustarHoras('u1', 1, 'motivo');
        assert.equal(firebaseMock.leerColeccion('asistencias')[0].autorizadoPor, null);
    });
});
