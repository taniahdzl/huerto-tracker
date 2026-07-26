// test/vista-tareas.test.js
//
// js/views/vista-tareas.js contra index.html real + Firestore falso. Sin
// dependencias de otras vistas — ver cabecera de test/vista-perfil.test.js
// para el patrón general (AuthService.init() una vez, firebaseMock.
// triggerAuthState() por test).
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomCompleto } from './helpers/dom.js';

instalarDomCompleto();

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { AuthService } = await import('../js/services/auth.js');
const { setEsAdminActual } = await import('../js/shared/estado-app.js');
const { irAVistaTareas, getEstudiantesActuales, setEstudiantesActuales } = await import('../js/views/vista-tareas.js');

AuthService.init();

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
    firebaseMock.reset();
    setEsAdminActual(false);
    await firebaseMock.triggerAuthState({ uid: 'u1', email: 'ana@test.com' });
});

describe('irAVistaTareas — carga y filtro', () => {
    test('filtro default "mias": solo tareas asignadas al usuario en sesión', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Mía', estado: 'pendiente', asignados: ['u1'] },
            t2: { titulo: 'De otro', estado: 'pendiente', asignados: ['u2'] }
        });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });

        irAVistaTareas();
        await esperar();

        const titulos = [...document.querySelectorAll('#tareasListaVista .chore-item-titulo')].map((el) => el.textContent);
        assert.deepEqual(titulos, ['Mía']);
    });

    test('pestaña "todas" re-filtra con lo ya cacheado, sin volver a pedir a Firestore', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Mía', estado: 'pendiente', asignados: ['u1'] },
            t2: { titulo: 'De otro', estado: 'pendiente', asignados: ['u2'] }
        });
        irAVistaTareas();
        await esperar();

        const tabTodas = [...document.querySelectorAll('#view-tareas .filter-tab')].find((t) => t.dataset.filtro === 'todas');
        tabTodas.dispatchEvent(new window.Event('click', { bubbles: true }));

        const titulos = [...document.querySelectorAll('#tareasListaVista .chore-item-titulo')].map((el) => el.textContent);
        assert.deepEqual(titulos.sort(), ['De otro', 'Mía']);
        assert.ok(tabTodas.classList.contains('active'));
    });

    test('denormaliza asignadosNombres vía nombreParaMostrar contra el directorio completo', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'X', estado: 'pendiente', asignados: ['u1', 'u2'] } });
        firebaseMock.seed('usuarios', {
            u1: { nombre: 'Ana', rol: 'estudiante' },
            u2: { email: 'sin-nombre@test.com', rol: 'estudiante' }
        });

        irAVistaTareas();
        await esperar();

        const tabTodas = [...document.querySelectorAll('#view-tareas .filter-tab')].find((t) => t.dataset.filtro === 'todas');
        tabTodas.dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(document.querySelector('.chore-item-asignados').textContent, 'Ana, sin-nombre@test.com');
    });
});

describe('completar tarea', () => {
    test('admin ve el botón Completar; al hacer click completa, refresca y sale de la lista si ya no cumple el filtro', async () => {
        setEsAdminActual(true);
        firebaseMock.seed('tareas', { t1: { titulo: 'X', estado: 'pendiente', asignados: ['u1'] } });

        irAVistaTareas();
        await esperar();

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'completada');
        // sigue siendo "mía" (asignada a u1), pero ya no debería tener botón Completar
        assert.equal(document.querySelector('.chore-complete-btn'), null);
    });

    test('no-admin nunca ve el botón Completar', async () => {
        setEsAdminActual(false);
        firebaseMock.seed('tareas', { t1: { titulo: 'X', estado: 'pendiente', asignados: ['u1'] } });
        irAVistaTareas();
        await esperar();
        assert.equal(document.querySelector('.chore-complete-btn'), null);
    });
});

describe('modal Crear Tarea', () => {
    test('abrir el modal puebla los checkboxes de estudiantesActuales', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' }, u2: { nombre: 'Beto', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();

        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        const checkboxes = document.querySelectorAll('#crearTareaAssignees input[type="checkbox"]');
        assert.equal(checkboxes.length, 2);
        assert.ok(document.getElementById('crearTareaModal').classList.contains('open'));
    });

    test('rechaza guardar sin título', async () => {
        firebaseMock.seed('tareas', {});
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = '   ';
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });

    test('rechaza guardar sin ningún estudiante seleccionado', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = 'Nueva tarea';
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });

    test('con título y al menos un asignado, crea la tarea, cierra el modal y refresca la lista', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = 'Regar cama 3';
        document.querySelector('#crearTareaAssignees input[type="checkbox"]').checked = true;
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 1);
        assert.equal(document.getElementById('crearTareaModal').classList.contains('open'), false);
    });
});

describe('getEstudiantesActuales / setEstudiantesActuales', () => {
    test('roundtrip simple (caché compartido con vista-admin.js)', () => {
        setEstudiantesActuales([{ id: 'x' }]);
        assert.deepEqual(getEstudiantesActuales(), [{ id: 'x' }]);
    });
});
