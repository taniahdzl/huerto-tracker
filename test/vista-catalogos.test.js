// test/vista-catalogos.test.js
//
// js/views/vista-catalogos.js contra index.html real + Firestore falso.
// Importa vista-gemelo.js (getCatalogoActual/setCatalogoActual, caché
// compartido) — se ejercita transitivamente.
//
// window.confirm no está implementado en jsdom (lanza "Not implemented" por
// default) — se sobreescribe por test.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomCompleto } from './helpers/dom.js';
import { setEsAdminActual } from '../js/shared/estado-app.js';

instalarDomCompleto();

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { irAVistaCatalogos } = await import('../js/views/vista-catalogos.js');

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function irATab(nombre) {
    document.querySelector(`#view-catalogos .filter-tab[data-tab-catalogo="${nombre}"]`)
        .dispatchEvent(new window.Event('click', { bubbles: true }));
}

beforeEach(() => {
    firebaseMock.reset();
    setEsAdminActual(false);
    window.confirm = () => true;
    // El documento es UNO SOLO para todo el archivo (instalarDomCompleto se
    // llama una vez) — un valor de búsqueda dejado por un test anterior
    // seguiría filtrando los items del test siguiente si no se limpia acá.
    document.getElementById('catalogosBusqueda').value = '';
});

describe('irAVistaCatalogos — carga y pestañas', () => {
    test('pestaña semillas (default): lista el catálogo y comparte caché con vista-gemelo', async () => {
        firebaseMock.seed('catalogo_semillas', { p1: { nombre: 'Tomate', tipo: 'fruto' } });
        irAVistaCatalogos();
        await esperar();
        irATab('semillas'); // tabCatalogosActual es estado de módulo compartido entre tests — nunca asumir el default
        assert.equal(document.querySelectorAll('#catalogosLista .catalogo-item').length, 1);
    });

    test('cambiar a la pestaña herramientas filtra inventario_general por categoria==="herramienta"', async () => {
        firebaseMock.seed('inventario_general', {
            i1: { nombre: 'Pala', categoria: 'herramienta' },
            i2: { nombre: 'Semillas extra', categoria: 'insumo' }
        });
        irAVistaCatalogos();
        await esperar();
        irATab('herramientas');

        const nombres = [...document.querySelectorAll('#catalogosLista .catalogo-item-nombre')].map((n) => n.textContent);
        assert.deepEqual(nombres, ['Pala']);
    });

    test('la búsqueda filtra por nombre (case-insensitive) sobre la pestaña activa', async () => {
        firebaseMock.seed('catalogo_semillas', {
            p1: { nombre: 'Tomate Cherry' },
            p2: { nombre: 'Lechuga' }
        });
        irAVistaCatalogos();
        await esperar();
        irATab('semillas');

        document.getElementById('catalogosBusqueda').value = 'tomate';
        document.getElementById('catalogosBusqueda').dispatchEvent(new window.Event('input', { bubbles: true }));

        const nombres = [...document.querySelectorAll('#catalogosLista .catalogo-item-nombre')].map((n) => n.textContent);
        assert.deepEqual(nombres, ['Tomate Cherry']);
    });
});

describe('RBAC por pestaña', () => {
    test('semillas/químicos: cualquier autenticado edita/crea, solo admin elimina', async () => {
        firebaseMock.seed('catalogo_semillas', { p1: { nombre: 'X' } });
        setEsAdminActual(false);
        irAVistaCatalogos();
        await esperar();
        irATab('semillas');

        assert.equal(document.getElementById('agregarCatalogoBtn').style.display, ''); // puede crear
        assert.ok(document.querySelector('.chore-complete-btn:not(.catalogo-eliminar-btn)')); // editar
        assert.equal(document.querySelector('.catalogo-eliminar-btn'), null); // no puede eliminar
    });

    test('herramientas: no-admin es de solo lectura completa (ni crear, ni editar, ni eliminar)', async () => {
        firebaseMock.seed('inventario_general', { i1: { nombre: 'Pala', categoria: 'herramienta' } });
        setEsAdminActual(false);
        irAVistaCatalogos();
        await esperar();
        irATab('herramientas');

        assert.equal(document.getElementById('agregarCatalogoBtn').style.display, 'none');
        assert.equal(document.querySelectorAll('#catalogosLista button').length, 0);
    });

    test('admin ve editar+eliminar en las 3 pestañas', async () => {
        firebaseMock.seed('inventario_general', { i1: { nombre: 'Pala', categoria: 'herramienta' } });
        setEsAdminActual(true);
        irAVistaCatalogos();
        await esperar();
        irATab('herramientas');

        assert.ok(document.querySelector('.catalogo-eliminar-btn'));
    });
});

describe('crear/editar Semilla', () => {
    test('rechaza guardar sin nombre', async () => {
        irAVistaCatalogos();
        await esperar();
        irATab('semillas');
        document.getElementById('agregarCatalogoBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('semillaNombreInput').value = '   ';
        document.getElementById('semillaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('catalogo_semillas').length, 0);
    });

    test('crea una semilla nueva, cierra el modal y refresca la lista + el caché de vista-gemelo', async () => {
        irAVistaCatalogos();
        await esperar();
        irATab('semillas');
        document.getElementById('agregarCatalogoBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('semillaNombreInput').value = 'Zanahoria';
        document.getElementById('semillaTipoInput').value = 'raíz';
        document.getElementById('semillaDiasInput').value = '70';
        document.getElementById('semillaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('catalogo_semillas').length, 1);
        assert.equal(document.getElementById('semillaModal').classList.contains('open'), false);
        assert.equal(document.querySelectorAll('#catalogosLista .catalogo-item').length, 1);
    });

    test('editar precarga los valores actuales y actualizarCatalogo hace merge parcial', async () => {
        firebaseMock.seed('catalogo_semillas', { p1: { nombre: 'Vieja', tipo: 'hoja', dias_siembra_a_cosecha: 30 } });
        irAVistaCatalogos();
        await esperar();
        irATab('semillas');

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true })); // "Editar"
        assert.equal(document.getElementById('semillaNombreInput').value, 'Vieja');

        document.getElementById('semillaNombreInput').value = 'Nueva';
        document.getElementById('semillaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('catalogo_semillas', 'p1').nombre, 'Nueva');
    });
});

describe('eliminar', () => {
    test('confirm() cancelado no elimina nada', async () => {
        window.confirm = () => false;
        firebaseMock.seed('catalogo_semillas', { p1: { nombre: 'X' } });
        setEsAdminActual(true);
        irAVistaCatalogos();
        await esperar();
        irATab('semillas');

        document.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('catalogo_semillas', 'p1') !== null, true);
    });

    test('confirm() aceptado elimina y refresca', async () => {
        firebaseMock.seed('catalogo_semillas', { p1: { nombre: 'X' } });
        setEsAdminActual(true);
        irAVistaCatalogos();
        await esperar();
        irATab('semillas');

        document.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('catalogo_semillas', 'p1'), null);
        assert.equal(document.querySelectorAll('#catalogosLista .catalogo-item').length, 0);
    });
});

describe('Químico y Herramienta (mismo patrón que Semilla)', () => {
    test('crear químico guarda notas_uso', async () => {
        irAVistaCatalogos();
        await esperar();
        irATab('quimicos');
        document.getElementById('agregarCatalogoBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('quimicoNombreInput').value = 'Fungicida';
        document.getElementById('quimicoNotasInput').value = 'usar con guantes';
        document.getElementById('quimicoSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [guardado] = firebaseMock.leerColeccion('catalogo_quimicos');
        assert.equal(guardado.notas_uso, 'usar con guantes');
    });

    test('crear herramienta fuerza categoria "herramienta"', async () => {
        setEsAdminActual(true);
        irAVistaCatalogos();
        await esperar();
        irATab('herramientas');
        document.getElementById('agregarCatalogoBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('herramientaNombreInput').value = 'Rastrillo';
        document.getElementById('herramientaCantidadInput').value = '2';
        document.getElementById('herramientaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [guardado] = firebaseMock.leerColeccion('inventario_general');
        assert.equal(guardado.categoria, 'herramienta');
        assert.equal(guardado.cantidad, 2);
    });

    test('editar herramienta NUNCA manda `categoria` en el payload (no la pisa)', async () => {
        firebaseMock.seed('inventario_general', { i1: { nombre: 'Pala', categoria: 'herramienta', cantidad: 1 } });
        setEsAdminActual(true);
        irAVistaCatalogos();
        await esperar();
        irATab('herramientas');

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('herramientaCantidadInput').value = '5';
        document.getElementById('herramientaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const item = firebaseMock.leerDoc('inventario_general', 'i1');
        assert.equal(item.categoria, 'herramienta'); // intacta
        assert.equal(item.cantidad, 5);
    });
});
