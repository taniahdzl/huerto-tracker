// test/vista-perfil.test.js
//
// js/views/vista-perfil.js contra index.html real (jsdom, ver
// test/helpers/dom.js) + Firestore falso. Sin dependencias de otras vistas
// (a diferencia de catalogos/admin/dashboard/login) — el único de los 8 que
// se puede testear en aislamiento real.
//
// AuthService.getCurrentUser() es privado a auth.js — para controlarlo en
// los tests hay que pasar por el mismo camino real: AuthService.init() una
// vez, y firebaseMock.triggerAuthState(user) para simular el login.
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
const { irAVistaPerfil } = await import('../js/views/vista-perfil.js');

AuthService.init();

function esperarMicrotareas() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
    firebaseMock.reset();
    await firebaseMock.triggerAuthState({ uid: 'u1', email: 'ana@test.com' });
});

describe('irAVistaPerfil', () => {
    test('navega a view-perfil y pinta email/rol/horas del perfil cargado', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante', horasTotales: 12 } });

        irAVistaPerfil();
        await esperarMicrotareas();

        assert.equal(document.getElementById('view-perfil').classList.contains('hidden'), false);
        assert.equal(document.getElementById('perfilEmail').textContent, 'ana@test.com');
        assert.equal(document.getElementById('perfilNombreInput').value, 'Ana');
        assert.equal(document.getElementById('perfilRolTexto').textContent, 'estudiante');
        assert.equal(document.getElementById('perfilHoras').textContent, '12 horas');
    });

    test('el selector de rol se oculta para admin (nunca se auto-degrada)', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'admin', horasTotales: 0 } });
        irAVistaPerfil();
        await esperarMicrotareas();
        assert.equal(document.getElementById('perfilRolSelectorGroup').style.display, 'none');
    });

    test('el selector de rol se muestra para estudiante/externo, con su valor actual', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'externo', horasTotales: 0 } });
        irAVistaPerfil();
        await esperarMicrotareas();
        assert.notEqual(document.getElementById('perfilRolSelectorGroup').style.display, 'none');
        assert.equal(document.getElementById('perfilRolSelect').value, 'externo');
    });
});

describe('edición de nombre', () => {
    test('Editar habilita el input y muestra Guardar; Guardar exitoso persiste y vuelve a bloquear', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Viejo', rol: 'estudiante', horasTotales: 0 } });
        irAVistaPerfil();
        await esperarMicrotareas();

        const input = document.getElementById('perfilNombreInput');
        const editarBtn = document.getElementById('perfilEditarNombreBtn');
        const guardarBtn = document.getElementById('perfilGuardarNombreBtn');

        assert.equal(input.readOnly, true);
        editarBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(input.readOnly, false);
        assert.equal(guardarBtn.style.display, '');

        input.value = 'Nombre Nuevo';
        guardarBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperarMicrotareas();

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').nombre, 'Nombre Nuevo');
        assert.equal(input.readOnly, true); // vuelve a bloquear tras éxito
    });

    test('Guardar con nombre vacío no llama a Firestore y no vuelve a bloquear (permite reintentar)', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Viejo', rol: 'estudiante', horasTotales: 0 } });
        irAVistaPerfil();
        await esperarMicrotareas();

        document.getElementById('perfilEditarNombreBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        const input = document.getElementById('perfilNombreInput');
        input.value = '   ';
        document.getElementById('perfilGuardarNombreBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperarMicrotareas();

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').nombre, 'Viejo'); // sin cambios
        assert.equal(input.readOnly, false); // sigue editable para reintentar
    });
});

describe('cambio de rol propio', () => {
    test('guarda el nuevo rol y recarga el perfil', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante', horasTotales: 0 } });
        irAVistaPerfil();
        await esperarMicrotareas();

        document.getElementById('perfilRolSelect').value = 'externo';
        document.getElementById('perfilGuardarRolBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperarMicrotareas();

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').rol, 'externo');
        assert.equal(document.getElementById('perfilRolTexto').textContent, 'externo');
    });
});

describe('logout', () => {
    test('perfilLogoutBtn llama a AuthService.logout()', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante', horasTotales: 0 } });
        irAVistaPerfil();
        await esperarMicrotareas();

        document.getElementById('perfilLogoutBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperarMicrotareas();

        assert.equal(AuthService.isAuthenticated(), false);
    });
});
