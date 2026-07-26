// test/vista-bitacora.test.js
//
// js/views/vista-bitacora.js contra index.html real + Firestore falso. Sin
// AuthService ni dependencias de otras vistas.
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

const { irAVistaBitacora, cargarBannerBitacora } = await import('../js/views/vista-bitacora.js');

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    firebaseMock.reset();
});

describe('irAVistaBitacora', () => {
    test('carga y pinta la lista de sesiones (orden ya resuelto por db.js)', async () => {
        firebaseMock.seed('bitacora_sesiones', {
            s1: { fecha: '2026-07-20', resumen: 'Ok' },
            s2: { fecha: '2026-07-25', resumen: 'Bien' }
        });
        irAVistaBitacora();
        await esperar();
        assert.equal(document.querySelectorAll('#bitacoraLista li').length, 2);
    });
});

describe('onExpandirSesion (detalle perezoso)', () => {
    test('primer click: carga el detalle vía obtenerSesionConDetalle y lo muestra', async () => {
        firebaseMock.seed('bitacora_sesiones', { s1: { fecha: '2026-07-26', resumen: 'x' } });
        firebaseMock.seed('asistencias', { a1: { estudianteId: 'u1', fecha: '2026-07-26', tareaId: null } });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });

        irAVistaBitacora();
        await esperar();

        document.querySelector('#bitacoraLista .chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const detalle = document.querySelector('#bitacoraLista .bitacora-detalle');
        assert.match(detalle.textContent, /Ana/);
        assert.notEqual(detalle.style.display, 'none');
    });

    test('segundo click sobre la misma sesión: colapsa sin volver a pedir datos', async () => {
        firebaseMock.seed('bitacora_sesiones', { s1: { fecha: '2026-07-26', resumen: 'x' } });
        irAVistaBitacora();
        await esperar();

        const boton = document.querySelector('#bitacoraLista .chore-complete-btn');
        boton.dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();
        const detalle = document.querySelector('#bitacoraLista .bitacora-detalle');
        assert.equal(detalle.dataset.cargado, 'true');

        boton.dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(detalle.style.display, 'none'); // colapsado, sin re-fetch (no truena sin datos nuevos)
    });
});

describe('formulario "Nueva entrada"', () => {
    test('arranca con fecha de hoy y el botón disabled (sin resumen)', () => {
        const hoy = new Date().toISOString().slice(0, 10);
        assert.equal(document.getElementById('bitacoraFechaInput').value, hoy);
        assert.equal(document.getElementById('bitacoraCrearBtn').disabled, true);
    });

    test('se habilita solo con fecha Y resumen', () => {
        const fechaInput = document.getElementById('bitacoraFechaInput');
        const resumenInput = document.getElementById('bitacoraResumenInput');
        const boton = document.getElementById('bitacoraCrearBtn');

        fechaInput.value = '';
        resumenInput.value = 'Todo bien';
        resumenInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.equal(boton.disabled, true);

        fechaInput.value = '2026-07-26';
        fechaInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.equal(boton.disabled, false);
    });

    test('al crear con éxito: refresca lista + banner y limpia el formulario', async () => {
        firebaseMock.seed('bitacora_sesiones', {});
        document.getElementById('bitacoraFechaInput').value = '2026-07-26';
        document.getElementById('bitacoraResumenInput').value = 'Resumen de hoy';
        document.getElementById('bitacoraPendientesInput').value = 'Regar mañana';
        document.getElementById('bitacoraCrearBtn').disabled = false;

        document.getElementById('bitacoraCrearBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('bitacora_sesiones').length, 1);
        assert.equal(document.getElementById('bitacoraResumenInput').value, '');
        assert.equal(document.getElementById('bitacoraCrearBtn').disabled, true); // sin resumen tras limpiar
        assert.equal(document.querySelectorAll('#bitacoraLista li').length, 1);
    });
});

describe('cargarBannerBitacora', () => {
    test('muestra el banner con `pendientes` de la sesión más reciente', async () => {
        firebaseMock.seed('bitacora_sesiones', {
            vieja:    { fecha: '2026-07-01', pendientes: 'no debería verse' },
            reciente: { fecha: '2026-07-26', pendientes: 'Comprar semillas' }
        });
        await cargarBannerBitacora();
        assert.equal(document.getElementById('dashboardBannerPendientesTexto').textContent, 'Comprar semillas');
        assert.notEqual(document.getElementById('dashboardBannerPendientes').style.display, 'none');
    });

    test('oculta el banner si no hay sesiones o la más reciente no tiene pendientes', async () => {
        firebaseMock.seed('bitacora_sesiones', {});
        await cargarBannerBitacora();
        assert.equal(document.getElementById('dashboardBannerPendientes').style.display, 'none');

        firebaseMock.seed('bitacora_sesiones', { s1: { fecha: '2026-07-26', pendientes: '' } });
        await cargarBannerBitacora();
        assert.equal(document.getElementById('dashboardBannerPendientes').style.display, 'none');
    });
});
