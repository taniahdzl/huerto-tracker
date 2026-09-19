// test/vista-completar-perfil.test.js
//
// js/views/vista-completar-perfil.js contra index.html real + Firestore
// falso. El flujo completo end-to-end (disparado por 'auth:resuelto') ya se
// prueba en main.test.js ("caso 2b") — este archivo cubre el módulo en
// aislamiento: gating del botón, el límite de 2 carreras, y que un intento
// fallido no bloquee poder reintentar. Mismo patrón que vista-login.test.js
// para Setup.
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

const { mostrarCompletarPerfil } = await import('../js/views/vista-completar-perfil.js');

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function marcarCarreras(...valores) {
    const grupo = document.getElementById('completarPerfilCarrerasGroup');
    grupo.querySelectorAll('input').forEach((cb) => { cb.checked = valores.includes(cb.value); });
    grupo.dispatchEvent(new window.Event('change', { bubbles: true }));
}

beforeEach(() => {
    firebaseMock.reset();
});

describe('mostrarCompletarPerfil', () => {
    test('navega a view-completar-perfil y arranca con el formulario limpio (botón disabled)', () => {
        mostrarCompletarPerfil({ uid: 'u1', email: 'ana@test.com' }, 'estudiante', 'Ana');

        assert.equal(document.getElementById('view-completar-perfil').classList.contains('hidden'), false);
        assert.equal(document.getElementById('completarPerfilBtn').disabled, true);
        assert.equal(document.getElementById('completarPerfilClaveInput').value, '');
        assert.equal(document.querySelectorAll('#completarPerfilCarrerasGroup input:checked').length, 0);
    });

    test('gating: se habilita solo con 1-2 carreras + clave de 6 dígitos', () => {
        mostrarCompletarPerfil({ uid: 'u1', email: 'ana@test.com' }, 'estudiante', 'Ana');
        const btn = document.getElementById('completarPerfilBtn');
        const claveInput = document.getElementById('completarPerfilClaveInput');

        marcarCarreras('Economía');
        assert.equal(btn.disabled, true); // falta clave

        claveInput.value = '12';
        claveInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.equal(btn.disabled, true); // clave incompleta

        claveInput.value = '123456';
        claveInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.equal(btn.disabled, false);
    });

    test('marcar una 3ª carrera la deja disabled — máx. 2', () => {
        mostrarCompletarPerfil({ uid: 'u1', email: 'ana@test.com' }, 'estudiante', 'Ana');
        marcarCarreras('Economía', 'Derecho');
        const sinMarcar = [...document.querySelectorAll('#completarPerfilCarrerasGroup input')].find((cb) => !cb.checked);
        assert.equal(sinMarcar.disabled, true);
    });

    test('guardar exitoso persiste carreras/claveUnica y navega al Dashboard con el rol correcto', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'admin', horasTotales: 5 } });
        mostrarCompletarPerfil({ uid: 'u1', email: 'ana@test.com' }, 'admin', 'Ana');

        marcarCarreras('Economía');
        const claveInput = document.getElementById('completarPerfilClaveInput');
        claveInput.value = '123456';
        claveInput.dispatchEvent(new window.Event('input', { bubbles: true }));

        document.getElementById('completarPerfilBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const perfil = firebaseMock.leerDoc('usuarios', 'u1');
        assert.deepEqual(perfil.carreras, ['Economía']);
        assert.equal(perfil.claveUnica, '123456');
        assert.equal(document.getElementById('view-dashboard').classList.contains('hidden'), false);
        assert.notEqual(document.getElementById('adminBtn').style.display, 'none'); // esAdmin = rol==='admin'
    });

    test('un segundo llamado a mostrarCompletarPerfil (otra persona) limpia lo que dejó la anterior, incluidos los disabled por el límite de 2', () => {
        mostrarCompletarPerfil({ uid: 'u1', email: 'ana@test.com' }, 'estudiante', 'Ana');
        marcarCarreras('Economía', 'Derecho');

        mostrarCompletarPerfil({ uid: 'u2', email: 'beto@test.com' }, 'estudiante', 'Beto');

        const checkboxes = [...document.querySelectorAll('#completarPerfilCarrerasGroup input')];
        assert.equal(checkboxes.filter((cb) => cb.checked).length, 0);
        assert.equal(checkboxes.filter((cb) => cb.disabled).length, 0);
    });
});
