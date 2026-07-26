// test/vista-dashboard.test.js
//
// js/views/vista-dashboard.js contra index.html real + Firestore falso.
// Importa vista-gemelo.js (iniciarHuerto) y vista-bitacora.js
// (cargarBannerBitacora) — se ejercitan transitivamente, sin mockearlas
// aparte (mismo criterio que el resto de la suite de vistas).
//
// mostrarDashboard() dispara varias llamadas fire-and-forget (iniciarHuerto,
// cargarTareasDashboard, cargarHorasDashboard, cargarBannerBitacora) — se
// espera un tick antes de aserciones que dependen de esas cargas.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomCompleto } from './helpers/dom.js';
import { getEsAdminActual } from '../js/shared/estado-app.js';

instalarDomCompleto();

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { mostrarDashboard } = await import('../js/views/vista-dashboard.js');

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    firebaseMock.reset();
    document.getElementById('login-overlay').classList.remove('hidden');
});

describe('mostrarDashboard — layout inmediato (sin esperar cargas async)', () => {
    test('oculta el login-overlay, navega a view-dashboard y pinta el nombre a mostrar', () => {
        mostrarDashboard({ uid: 'u1', email: 'ana@test.com' }, false, 'Ana');

        assert.ok(document.getElementById('login-overlay').classList.contains('hidden'));
        assert.equal(document.getElementById('view-dashboard').classList.contains('hidden'), false);
        assert.equal(document.getElementById('dashboardUserEmail').textContent, ' — Ana');
    });

    test('admin ve adminBtn/crearTareaBtn, no-admin no', () => {
        mostrarDashboard({ uid: 'u1', email: 'a@test.com' }, true, 'Ana');
        assert.equal(getEsAdminActual(), true);
        assert.notEqual(document.getElementById('adminBtn').style.display, 'none');
        assert.notEqual(document.getElementById('crearTareaBtn').style.display, 'none');

        mostrarDashboard({ uid: 'u1', email: 'a@test.com' }, false, 'Ana');
        assert.equal(getEsAdminActual(), false);
        assert.equal(document.getElementById('adminBtn').style.display, 'none');
        assert.equal(document.getElementById('crearTareaBtn').style.display, 'none');
    });

    test('sin nombre, usa el fallback de nombreParaMostrar (email)', () => {
        mostrarDashboard({ uid: 'u1', email: 'sin-nombre@test.com' }, false, null);
        assert.equal(document.getElementById('dashboardUserEmail').textContent, ' — sin-nombre@test.com');
    });
});

describe('mostrarDashboard — cargas fire-and-forget', () => {
    test('horas: muestra horasTotales del perfil (0 si no existe el campo)', async () => {
        firebaseMock.seed('usuarios', { u1: { horasTotales: 42 } });
        mostrarDashboard({ uid: 'u1', email: 'a@test.com' }, false, 'Ana');
        await esperar();
        assert.equal(document.getElementById('dashboardHorasTexto').textContent, 'Llevas 42 horas acumuladas.');
    });

    test('tareas: lista hasta 3 y anuncia "+N más" si el total real es mayor', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'A', estado: 'pendiente', asignados: ['u1'], fechaCreacion: { __ts: true, millis: 1 } },
            t2: { titulo: 'B', estado: 'pendiente', asignados: ['u1'], fechaCreacion: { __ts: true, millis: 2 } },
            t3: { titulo: 'C', estado: 'pendiente', asignados: ['u1'], fechaCreacion: { __ts: true, millis: 3 } },
            t4: { titulo: 'D', estado: 'pendiente', asignados: ['u1'], fechaCreacion: { __ts: true, millis: 4 } }
        });
        mostrarDashboard({ uid: 'u1', email: 'a@test.com' }, false, 'Ana');
        await esperar();

        const items = [...document.querySelectorAll('#dashboardTareasLista li')];
        assert.equal(items.length, 4); // 3 tareas + "+1 más"
        assert.equal(items[3].textContent, '+1 más');
    });

    test('sin tareas pendientes, muestra el estado vacío', async () => {
        mostrarDashboard({ uid: 'u1', email: 'a@test.com' }, false, 'Ana');
        await esperar();
        assert.equal(document.querySelector('#dashboardTareasLista li').textContent, 'Sin tareas pendientes');
    });

    test('el mapa (iniciarHuerto) y el banner de bitácora también se disparan sin bloquear el layout', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'circular', plantas: [] } });
        firebaseMock.seed('bitacora_sesiones', { s1: { fecha: '2026-07-26', pendientes: 'Regar' } });

        mostrarDashboard({ uid: 'u1', email: 'a@test.com' }, false, 'Ana');
        await esperar();

        assert.equal(document.querySelectorAll('#gemeloMapaContainer .cama-espiral').length, 1);
        assert.equal(document.getElementById('dashboardBannerPendientesTexto').textContent, 'Regar');
    });
});

describe('tarjetas de navegación rápida', () => {
    test('click en cada tarjeta navega a su vista', () => {
        mostrarDashboard({ uid: 'u1', email: 'a@test.com' }, false, 'Ana');

        document.getElementById('dashboardResumenCamasCard').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('view-gemelo').classList.contains('hidden'), false);

        document.getElementById('dashboardTareasCard').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('view-tareas').classList.contains('hidden'), false);

        document.getElementById('dashboardCatalogosCard').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('view-catalogos').classList.contains('hidden'), false);
    });
});
