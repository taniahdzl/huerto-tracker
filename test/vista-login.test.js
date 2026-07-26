// test/vista-login.test.js
//
// js/views/vista-login.js contra index.html real + Firestore falso.
// Importa vista-dashboard.js (mostrarDashboard) — se ejercita
// transitivamente. Es el módulo más "arriba" del árbol de vistas: al
// importarlo se evalúa casi todo el resto (vista-dashboard -> vista-gemelo
// -> gemelo-pan-zoom/gemelo-drag-drop, vista-dashboard -> vista-bitacora),
// mismo patrón que main.js en producción.
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
const { mostrarErrorLogin, mostrarErrorSetup, actualizarGatingSetup } = await import('../js/views/vista-login.js');

AuthService.init();

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    firebaseMock.reset();
    mostrarErrorLogin('');
    mostrarErrorSetup('');
});

describe('mostrarErrorLogin / mostrarErrorSetup', () => {
    test('con mensaje: lo muestra en su propio nodo (login/setup NO comparten uno)', () => {
        mostrarErrorLogin('Error de login');
        mostrarErrorSetup('Error de setup');
        assert.equal(document.getElementById('loginError').textContent, 'Error de login');
        assert.equal(document.getElementById('setupError').textContent, 'Error de setup');
    });

    test('con cadena vacía, se oculta', () => {
        mostrarErrorLogin('algo');
        mostrarErrorLogin('');
        assert.equal(document.getElementById('loginError').style.display, 'none');
    });
});

describe('login con Google', () => {
    test('éxito: no muestra error (AuthService.init() hace el resto)', async () => {
        firebaseMock.setSignInResultado({ user: { uid: 'u1', email: 'a@test.com' } });
        document.getElementById('googleLoginBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();
        assert.equal(document.getElementById('loginError').style.display, 'none');
    });

    test('error conocido (popup cerrado) muestra el mensaje específico en español', async () => {
        const error = new Error('popup closed');
        error.code = 'auth/popup-closed-by-user';
        firebaseMock.setSignInError(error);

        document.getElementById('googleLoginBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(document.getElementById('loginError').textContent, 'Cerraste la ventana de Google antes de terminar.');
    });

    test('error desconocido cae al mensaje genérico', async () => {
        const error = new Error('algo raro');
        error.code = 'auth/algo-no-mapeado';
        firebaseMock.setSignInError(error);

        document.getElementById('googleLoginBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(document.getElementById('loginError').textContent, 'No se pudo iniciar sesión con Google. Intenta de nuevo.');
    });

    test('el botón se reactiva después del intento (éxito o error)', async () => {
        const btn = document.getElementById('googleLoginBtn');
        firebaseMock.setSignInError(new Error('x'));
        btn.dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();
        assert.equal(btn.disabled, false);
    });
});

describe('Setup — gating del botón', () => {
    test('actualizarGatingSetup habilita el botón solo con nombre no vacío', () => {
        const input = document.getElementById('newUserNombre');
        const btn = document.getElementById('completeRegistroBtn');

        input.value = '   ';
        actualizarGatingSetup();
        assert.equal(btn.disabled, true);

        input.value = 'Ana';
        actualizarGatingSetup();
        assert.equal(btn.disabled, false);
    });

    test('escribir en el input de nombre dispara el gating automáticamente', () => {
        const input = document.getElementById('newUserNombre');
        input.value = 'Ana';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.equal(document.getElementById('completeRegistroBtn').disabled, false);
    });
});

describe('Setup — completar registro', () => {
    test('sin usuario en sesión (AuthService.getCurrentUser() null), no hace nada', async () => {
        await firebaseMock.triggerAuthState(null);
        document.getElementById('newUserNombre').value = 'Ana';
        document.getElementById('completeRegistroBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();
        assert.equal(firebaseMock.leerColeccion('usuarios').length, 0);
    });

    test('con usuario en sesión y nombre válido: registra, y navega al Dashboard (mostrarDashboard)', async () => {
        await firebaseMock.triggerAuthState({ uid: 'u1', email: 'nuevo@test.com' });
        document.getElementById('newUserNombre').value = 'Ana Nueva';
        document.getElementById('newUserRole').value = 'estudiante';

        document.getElementById('completeRegistroBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const perfil = firebaseMock.leerDoc('usuarios', 'u1');
        assert.equal(perfil.nombre, 'Ana Nueva');
        assert.equal(perfil.rol, 'estudiante');
        assert.equal(document.getElementById('view-dashboard').classList.contains('hidden'), false);
    });

    test('nombre vacío: el propio handler corta antes de llamar a registrarUsuario (defensa en profundidad, el botón ya debería estar disabled)', async () => {
        await firebaseMock.triggerAuthState({ uid: 'u2', email: 'x@test.com' });
        document.getElementById('newUserNombre').value = '';
        document.getElementById('completeRegistroBtn').disabled = false; // se fuerza el click igual, sin pasar por el gating normal

        document.getElementById('completeRegistroBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('usuarios').length, 0);
    });
});
