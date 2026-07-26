// test/main.test.js
//
// js/main.js — raíz de composición de toda la app. Importa el árbol
// completo de vistas (transitivamente, todo lo demás), así que este es el
// test más "integración" de la suite: valida los 4 casos documentados del
// contrato 'auth:resuelto' (ver cabecera de auth.js/main.js) end-to-end,
// desde el evento real hasta el DOM final, y el listener delegado de
// headerNav.
//
// El caso 4 (con sesión, error consultando el perfil) NO se prueba — mismo
// límite ya documentado en test/auth.test.js: el mock de Firestore nunca
// falla por sí solo, así que no hay forma de forzar ese branch sin romper
// la fidelidad del mock para todo lo demás.
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

await import('../js/main.js'); // AuthService.init() corre al final del propio módulo

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    firebaseMock.reset();
    document.getElementById('login-overlay').classList.remove('hidden');
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
});

describe('auth:resuelto — caso 1: sin sesión', () => {
    test('muestra el login-overlay, oculta todas las vistas, oculta botones de admin/crear tarea', async () => {
        await firebaseMock.triggerAuthState(null);
        await esperar();

        assert.equal(document.getElementById('login-overlay').classList.contains('hidden'), false);
        document.querySelectorAll('.view').forEach((v) => assert.ok(v.classList.contains('hidden')));
        assert.equal(document.getElementById('adminBtn').style.display, 'none');
        assert.equal(document.getElementById('crearTareaBtn').style.display, 'none');
        assert.equal(document.getElementById('googleLoginBtn').style.display, '');
        assert.equal(document.getElementById('statusText').textContent, 'Sin sesión');
    });
});

describe('auth:resuelto — caso 2: con sesión, sin perfil (Setup)', () => {
    test('navega a view-setup, oculta el overlay, limpia el formulario', async () => {
        await firebaseMock.triggerAuthState({ uid: 'nuevo1', email: 'nuevo@test.com' });
        await esperar();

        assert.equal(document.getElementById('login-overlay').classList.contains('hidden'), true);
        assert.equal(document.getElementById('view-setup').classList.contains('hidden'), false);
        assert.equal(document.getElementById('newUserNombre').value, '');
        assert.equal(document.getElementById('completeRegistroBtn').disabled, true); // sin nombre, gating aplicado
    });
});

describe('auth:resuelto — caso 3: con sesión y perfil', () => {
    test('rol estudiante: navega al Dashboard sin ver Admin', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante', horasTotales: 0 } });
        await firebaseMock.triggerAuthState({ uid: 'u1', email: 'ana@test.com' });
        await esperar();

        assert.equal(document.getElementById('view-dashboard').classList.contains('hidden'), false);
        assert.equal(document.getElementById('adminBtn').style.display, 'none');
    });

    test('rol admin: navega al Dashboard con Admin visible', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'admin', horasTotales: 0 } });
        await firebaseMock.triggerAuthState({ uid: 'u1', email: 'ana@test.com' });
        await esperar();

        assert.equal(document.getElementById('view-dashboard').classList.contains('hidden'), false);
        assert.notEqual(document.getElementById('adminBtn').style.display, 'none');
    });
});

describe('headerNav — delegación de clicks', () => {
    test('un data-vista de las 5 rutas con carga propia dispara su irAVistaX (ej. Tareas carga datos)', async () => {
        // vista-tareas.js filtra por default a "mías" (asignados incluye al
        // uid en sesión) — se fija la sesión acá para no depender de qué
        // usuario haya quedado autenticado por un test anterior.
        await firebaseMock.triggerAuthState({ uid: 'tester1', email: 't@test.com' });
        firebaseMock.seed('tareas', { t1: { titulo: 'Regar', estado: 'pendiente', asignados: ['tester1'] } });
        document.querySelector('[data-vista="view-tareas"]').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(document.getElementById('view-tareas').classList.contains('hidden'), false);
        assert.equal(document.querySelectorAll('#tareasListaVista .chore-item').length, 1);
    });

    test('un data-vista sin ruta especial (ej. Gemelo) cae al navegarA() genérico', () => {
        document.querySelector('[data-vista="view-gemelo"]').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('view-gemelo').classList.contains('hidden'), false);
    });

    test('un click fuera de cualquier [data-vista] no hace nada', () => {
        document.getElementById('headerNav').dispatchEvent(new window.Event('click', { bubbles: true }));
        // No debería tronar ni cambiar nada — todas las vistas siguen ocultas (estado del beforeEach).
        document.querySelectorAll('.view').forEach((v) => assert.ok(v.classList.contains('hidden')));
    });
});
