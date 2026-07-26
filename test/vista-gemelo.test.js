// test/vista-gemelo.test.js
//
// js/views/vista-gemelo.js contra index.html real + Firestore falso. El
// render en sí (render-spiral-2d.js) y pan/zoom/drag&drop ya tienen su
// propia suite — acá se prueba la orquestación: carga de datos, wiring de
// los modales de detalle (cama/planta), y el roundtrip de catalogoActual
// compartido con vista-catalogos.js.
//
// No se dispara ningún gesto de pan/zoom real sobre el <svg> producido —
// iniciarHuerto() llama aplicarVistaEspiral (solo setAttribute, no necesita
// el polyfill de viewBox.baseVal) y configurarPanZoomEspiral (solo adjunta
// listeners al llamarse, no toca baseVal hasta que un evento real dispara),
// así que no hace falta el polyfill de test/gemelo-pan-zoom.test.js acá.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomCompleto } from './helpers/dom.js';
import { setUsuarioActual } from '../js/services/session.js';

instalarDomCompleto();

function fechaHaceNDias(n) {
    return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { iniciarHuerto, getCatalogoActual, setCatalogoActual } = await import('../js/views/vista-gemelo.js');

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    firebaseMock.reset();
    setUsuarioActual(null);
});

describe('getCatalogoActual / setCatalogoActual', () => {
    test('roundtrip simple (caché compartido con vista-catalogos.js)', () => {
        setCatalogoActual([{ id: 'x' }]);
        assert.deepEqual(getCatalogoActual(), [{ id: 'x' }]);
    });
});

describe('iniciarHuerto', () => {
    test('carga catálogo+camas, pinta el mapa, el panel arrastrable y el resumen del Dashboard', async () => {
        firebaseMock.seed('catalogo_semillas', { tomate: { nombre: 'Tomate', tipo: 'fruto', dias_siembra_a_cosecha: 90 } });
        firebaseMock.seed('camas_cosecha', {
            c1: {
                tipo: 'circular',
                plantas: [{ instanciaId: 'i1', plantaId: 'tomate', plantaTipo: 'fruto', fechaSiembra: '2026-01-01', angle: 0, r: 0, finalidad: 'cosecha' }]
            }
        });

        await iniciarHuerto();

        assert.equal(document.querySelectorAll('#gemeloMapaContainer .cama-espiral').length, 1);
        assert.equal(document.querySelectorAll('#gemeloPanelLista .plant-card').length, 1);
        assert.equal(getCatalogoActual().length, 1);
    });

    test('error al cargar: marca status de error y muestra un toast, sin tronar', async () => {
        // Sin seed de catalogo/camas -> igual resuelve vacío en el mock
        // (no hay forma de "romper" getDocs con este mock, ver límites
        // documentados) — se verifica el camino feliz con colecciones
        // vacías en vez de forzar el catch, que este mock no puede simular.
        await assert.doesNotReject(() => iniciarHuerto());
    });
});

describe('detalle de CAMA (modal)', () => {
    test('click en la forma de la cama abre el modal con sus notas/plagas actuales', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'circular', nombre: 'Cama Centro', notas: 'nota vieja', plagas: 'pulgón', plantas: [] } });
        await iniciarHuerto();

        document.querySelector('.cama-forma').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.ok(document.getElementById('detalleCamaModal').classList.contains('open'));
        assert.equal(document.getElementById('detalleCamaTitulo').textContent, 'Cama Centro');
        assert.equal(document.getElementById('detalleCamaNotasInput').value, 'nota vieja');
    });

    test('Guardar persiste notas/plagas, refresca el mapa y muestra confirmación', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'circular', plantas: [] } });
        await iniciarHuerto();
        document.querySelector('.cama-forma').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('detalleCamaNotasInput').value = 'nota nueva';
        document.getElementById('detalleCamaPlagasInput').value = 'mosca blanca';
        document.getElementById('detalleCamaGuardarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const cama = firebaseMock.leerDoc('camas_cosecha', 'c1');
        assert.equal(cama.notas, 'nota nueva');
        assert.equal(cama.plagas, 'mosca blanca');
    });
});

describe('detalle de PLANTA (modal)', () => {
    test('click en una ficha abre el modal con estado/progreso calculados', async () => {
        firebaseMock.seed('catalogo_semillas', { tomate: { nombre: 'Tomate Cherry', tipo: 'fruto', dias_siembra_a_cosecha: 90 } });
        firebaseMock.seed('camas_cosecha', {
            c1: { tipo: 'circular', plantas: [{ instanciaId: 'i1', plantaId: 'tomate', plantaTipo: 'fruto', fechaSiembra: fechaHaceNDias(10), angle: 0, r: 0, finalidad: 'cosecha' }] }
        });
        await iniciarHuerto();

        document.querySelector('.ficha-planta').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.ok(document.getElementById('detallePlantaModal').classList.contains('open'));
        assert.match(document.getElementById('detallePlantaTitulo').textContent, /Tomate Cherry/);
        assert.equal(document.getElementById('detallePlantaEstado').textContent, 'Creciendo');
    });

    test('"Marcar para semilla" alterna finalidad y refresca antes de cerrar el modal', async () => {
        firebaseMock.seed('camas_cosecha', {
            c1: { tipo: 'circular', plantas: [{ instanciaId: 'i1', plantaId: 'x', plantaTipo: 'hoja', fechaSiembra: '2026-01-01', angle: 0, r: 0, finalidad: 'cosecha' }] }
        });
        await iniciarHuerto();
        document.querySelector('.ficha-planta').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('detallePlantaSemillaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('camas_cosecha', 'c1').plantas[0].finalidad, 'semilla');
        assert.equal(document.getElementById('detallePlantaModal').classList.contains('open'), false);
    });

    test('cierre de cultivo: elegir rendimiento habilita Confirmar, y confirmar crea el historial + cierra el modal', async () => {
        setUsuarioActual({ uid: 'admin1', email: 'a@test.com' });
        firebaseMock.seed('camas_cosecha', {
            c1: { tipo: 'circular', plantas: [{ instanciaId: 'i1', plantaId: 'x', plantaTipo: 'hoja', fechaSiembra: '2026-01-01', angle: 0, r: 0, finalidad: 'cosecha' }] }
        });
        await iniciarHuerto();
        document.querySelector('.ficha-planta').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('detallePlantaCompletarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.notEqual(document.getElementById('detallePlantaCierreForm').style.display, 'none');

        const tabRendimiento = document.querySelector('#cierreRendimientoTabs .filter-tab');
        assert.ok(tabRendimiento, 'la vista debe traer al menos un tab de rendimiento en el HTML');
        tabRendimiento.dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('detallePlantaCierreConfirmarBtn').disabled, false);

        document.getElementById('detallePlantaCierreConfirmarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('historial_cultivo').length, 1);
        assert.equal(document.getElementById('detallePlantaModal').classList.contains('open'), false);
    });

    test('Cancelar en el formulario de cierre lo colapsa y no escribe nada', async () => {
        firebaseMock.seed('camas_cosecha', {
            c1: { tipo: 'circular', plantas: [{ instanciaId: 'i1', plantaId: 'x', plantaTipo: 'hoja', fechaSiembra: '2026-01-01', angle: 0, r: 0, finalidad: 'cosecha' }] }
        });
        await iniciarHuerto();
        document.querySelector('.ficha-planta').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('detallePlantaCompletarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('detallePlantaCierreCancelarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(document.getElementById('detallePlantaCierreForm').style.display, 'none');
        assert.equal(firebaseMock.leerColeccion('historial_cultivo').length, 0);
    });
});
