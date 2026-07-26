// test/render.test.js
//
// js/render/render.js con jsdom (test/helpers/dom.js) — módulo puro de
// pintado, sin Firebase. instalarDomVacio() alcanza: cada función recibe su
// `contenedor` por parámetro, ninguna consulta un id fijo de index.html.
//
// Corre con: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDomVacio } from './helpers/dom.js';

instalarDomVacio();

const {
    emojiDePlanta, colorDePlanta, crearLeyendaCategorias,
    renderListaTareas, renderListaCatalogos, renderRegistroActividad,
    renderListaBitacora, renderResumenHoras
} = await import('../js/render/render.js');

describe('emojiDePlanta / colorDePlanta', () => {
    test('devuelven el valor mapeado para tipos conocidos', () => {
        assert.equal(emojiDePlanta('fruto'), '🍅');
        assert.equal(colorDePlanta('fruto'), '#c62828');
    });

    test('caen a un default genérico para tipos desconocidos, nunca undefined', () => {
        assert.equal(emojiDePlanta('inventado'), '🌿');
        assert.equal(colorDePlanta('inventado'), '#757575');
    });
});

describe('crearLeyendaCategorias', () => {
    test('genera un <details> con un <li> por cada tipo de EMOJI_POR_TIPO', () => {
        const leyenda = crearLeyendaCategorias();
        assert.equal(leyenda.tagName, 'DETAILS');
        const items = leyenda.querySelectorAll('li');
        assert.equal(items.length, 6); // hoja/raíz/fruto/flor/tallo/semilla
        assert.match(items[0].textContent, /🥬 Hoja/);
    });
});

describe('renderListaTareas', () => {
    test('pinta título, asignados y clase completada', () => {
        const contenedor = document.createElement('ul');
        renderListaTareas(
            [
                { id: 't1', titulo: 'Regar', estado: 'pendiente', asignadosNombres: ['Ana', 'Beto'] },
                { id: 't2', titulo: 'Podar', estado: 'completada' }
            ],
            contenedor,
            () => {}
        );

        const items = contenedor.querySelectorAll('li');
        assert.equal(items.length, 2);
        assert.equal(items[0].className, 'chore-item');
        assert.equal(items[1].className, 'chore-item completada');
        assert.match(items[0].querySelector('.chore-item-asignados').textContent, /Ana, Beto/);
        assert.match(items[1].querySelector('.chore-item-asignados').textContent, /Sin asignar/);
    });

    test('botón "Completar" solo aparece si esAdmin=true y la tarea no está completada', () => {
        const casos = [
            { esAdmin: true, estado: 'pendiente', esperaBoton: true },
            { esAdmin: false, estado: 'pendiente', esperaBoton: false },
            { esAdmin: true, estado: 'completada', esperaBoton: false }
        ];

        casos.forEach(({ esAdmin, estado, esperaBoton }) => {
            const contenedor = document.createElement('ul');
            renderListaTareas([{ id: 't1', titulo: 'X', estado }], contenedor, () => {}, { esAdmin });
            const boton = contenedor.querySelector('.chore-complete-btn');
            assert.equal(!!boton, esperaBoton, `esAdmin=${esAdmin} estado=${estado}`);
        });
    });

    test('el botón Completar dispara onCompletarClick con el id de la tarea', () => {
        const contenedor = document.createElement('ul');
        const clicks = [];
        renderListaTareas([{ id: 'tX', titulo: 'X', estado: 'pendiente' }], contenedor, (id) => clicks.push(id), { esAdmin: true });

        contenedor.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.deepEqual(clicks, ['tX']);
    });

    test('título sin valor cae a "Sin título"', () => {
        const contenedor = document.createElement('ul');
        renderListaTareas([{ id: 't1', estado: 'pendiente' }], contenedor, () => {});
        assert.equal(contenedor.querySelector('.chore-item-titulo').textContent, 'Sin título');
    });
});

describe('renderListaCatalogos', () => {
    test('tipo semillas: meta muestra tipo + días', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('semillas', [{ id: 'p1', nombre: 'Tomate', tipo: 'fruto', dias_siembra_a_cosecha: 90 }], contenedor, {});
        assert.equal(contenedor.querySelector('.catalogo-item-meta').textContent, 'fruto · 90 días');
    });

    test('tipo quimicos: meta muestra notas_uso o "Sin notas"', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('quimicos', [{ id: 'q1', nombre: 'X' }], contenedor, {});
        assert.equal(contenedor.querySelector('.catalogo-item-meta').textContent, 'Sin notas');
    });

    test('otro tipo (herramientas): meta muestra Cantidad', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('herramientas', [{ id: 'h1', nombre: 'Pala', cantidad: 3 }], contenedor, {});
        assert.equal(contenedor.querySelector('.catalogo-item-meta').textContent, 'Cantidad: 3');
    });

    test('botones editar/eliminar respetan los flags puedeEditar/puedeEliminar y disparan sus callbacks con (tipo, id)', () => {
        const contenedor = document.createElement('ul');
        const editados = [];
        const eliminados = [];
        renderListaCatalogos('semillas', [{ id: 'p1', nombre: 'X' }], contenedor, {
            puedeEditar: true,
            puedeEliminar: true,
            onEditar: (tipo, id) => editados.push([tipo, id]),
            onEliminar: (tipo, id) => eliminados.push([tipo, id])
        });

        contenedor.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        contenedor.querySelectorAll('.chore-complete-btn')[0].dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.deepEqual(editados, [['semillas', 'p1']]);
        assert.deepEqual(eliminados, [['semillas', 'p1']]);
    });

    test('sin permisos, no se pintan botones de acción', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('semillas', [{ id: 'p1', nombre: 'X' }], contenedor, { puedeEditar: false, puedeEliminar: false });
        assert.equal(contenedor.querySelectorAll('button').length, 0);
    });
});

describe('renderRegistroActividad', () => {
    test('formatea fecha con .toDate(), y usuario cae a uid si no hay email', () => {
        const contenedor = document.createElement('table');
        const fechaFalsa = { toDate: () => new Date('2026-07-26T12:00:00Z') };
        renderRegistroActividad([
            { tipo: 'CREAR_TAREA', entidad: 't1', detalle: 'x', usuario: 'ana@test.com', fecha: fechaFalsa },
            { tipo: 'ELIMINAR_TAREA', uid: 'u2', fecha: null }
        ], contenedor);

        const filas = contenedor.querySelectorAll('tr');
        assert.equal(filas.length, 2);
        assert.notEqual(filas[0].children[0].textContent, '—'); // fecha formateada
        assert.equal(filas[0].children[4].textContent, 'ana@test.com');
        assert.equal(filas[1].children[0].textContent, '—'); // sin fecha
        assert.equal(filas[1].children[4].textContent, 'u2'); // sin usuario, cae a uid
    });
});

describe('renderListaBitacora', () => {
    test('pendientes solo se pinta si el campo viene con valor', () => {
        const contenedor = document.createElement('ul');
        renderListaBitacora([
            { id: 's1', fecha: '2026-07-26', resumen: 'Todo bien', pendientes: 'Regar cama 3' },
            { id: 's2', fecha: '2026-07-25', resumen: 'Ok' }
        ], contenedor, () => {});

        const items = contenedor.querySelectorAll('li');
        assert.equal(items[0].querySelectorAll('.chore-item-asignados').length, 2); // resumen + pendientes
        assert.equal(items[1].querySelectorAll('.chore-item-asignados').length, 1); // solo resumen
    });

    test('el botón de detalle llama onExpandirClick con la sesión y su contenedor de detalle', () => {
        const contenedor = document.createElement('ul');
        const llamadas = [];
        const sesion = { id: 's1', fecha: '2026-07-26', resumen: 'x' };
        renderListaBitacora([sesion], contenedor, (s, c) => llamadas.push([s, c]));

        contenedor.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(llamadas.length, 1);
        assert.equal(llamadas[0][0], sesion);
        assert.equal(llamadas[0][1].className, 'bitacora-detalle');
    });
});

describe('renderResumenHoras', () => {
    test('ordena descendente por horasTotales sin mutar el array original', () => {
        const contenedor = document.createElement('table');
        const estudiantes = [
            { id: 'u1', nombre: 'Ana', horasTotales: 5 },
            { id: 'u2', nombre: 'Beto', horasTotales: 20 },
            { id: 'u3', nombre: 'Cami', horasTotales: 10 }
        ];
        const copiaOriginal = [...estudiantes];

        renderResumenHoras(estudiantes, contenedor);

        const nombres = [...contenedor.querySelectorAll('tr')].map((tr) => tr.children[0].textContent);
        assert.deepEqual(nombres, ['Beto', 'Cami', 'Ana']);
        assert.deepEqual(estudiantes, copiaOriginal); // sin mutar
    });

    test('usa nombreParaMostrar (nombre -> email -> id) y horasTotales default 0', () => {
        const contenedor = document.createElement('table');
        renderResumenHoras([{ id: 'u1', email: 'sin-nombre@test.com' }], contenedor);
        const fila = contenedor.querySelector('tr');
        assert.equal(fila.children[0].textContent, 'sin-nombre@test.com');
        assert.equal(fila.children[1].textContent, '0');
    });
});
