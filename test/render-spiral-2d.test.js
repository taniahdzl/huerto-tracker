// test/render-spiral-2d.test.js
//
// js/render/render-spiral-2d.js con jsdom — construye el SVG a mano
// (createElementNS/setAttribute), sin Firebase. La geometría en sí
// (ángulos/radios) ya está cubierta por test/geometria-espiral.test.js; acá
// se verifica que el render arme la estructura correcta a partir de esa
// geometría (cuántos nodos, qué clases/atributos, qué handlers), no los
// valores numéricos exactos.
//
// calcularEstadoFicha depende de Date.now() para diasTranscurridos (sin
// fecha inyectable) — se construye fechaSiembra relativa a "hoy" al vuelo y
// se tolera +/-1 día en las aserciones, mismo criterio de tolerancia que ya
// usa geometria-espiral.test.js para valores derivados de trigonometría.
//
// Corre con: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDomVacio } from './helpers/dom.js';

instalarDomVacio();

const { calcularEstadoFicha, renderEspiralSVG } = await import('../js/render/render-spiral-2d.js');

function fechaHaceNDias(n) {
    return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

describe('calcularEstadoFicha', () => {
    test('finalidad semilla gana siempre, badge ⏳, sin importar el progreso', () => {
        const catalogoPorId = new Map([['tomate', { dias_siembra_a_cosecha: 10 }]]);
        const info = calcularEstadoFicha(
            { plantaId: 'tomate', fechaSiembra: fechaHaceNDias(999), finalidad: 'semilla' },
            catalogoPorId
        );
        assert.equal(info.estado, 'semilla');
        assert.equal(info.badge, '⏳');
        assert.equal(info.fraccion, 1);
    });

    test('sin dias_siembra_a_cosecha en el catálogo (o planta no encontrada) -> estado sin-datos, gris, sin inventar progreso', () => {
        const catalogoPorId = new Map();
        const info = calcularEstadoFicha({ plantaId: 'fantasma', fechaSiembra: '2026-01-01', finalidad: 'cosecha' }, catalogoPorId);
        assert.equal(info.estado, 'sin-datos');
        assert.equal(info.color, '#9e9e9e');
        assert.equal(info.diasTranscurridos, null);
    });

    test('progreso > 1 (pasó la fecha de cosecha) -> atrasada, badge !', () => {
        const catalogoPorId = new Map([['tomate', { dias_siembra_a_cosecha: 5 }]]);
        const info = calcularEstadoFicha({ plantaId: 'tomate', fechaSiembra: fechaHaceNDias(20), finalidad: 'cosecha', plantaTipo: 'fruto' }, catalogoPorId);
        assert.equal(info.estado, 'atrasada');
        assert.equal(info.badge, '!');
        assert.equal(info.fraccion, 1);
    });

    test('progreso normal -> creciendo, color por tipo, sin badge, fraccion entre 0 y 1', () => {
        const catalogoPorId = new Map([['tomate', { dias_siembra_a_cosecha: 100 }]]);
        const info = calcularEstadoFicha({ plantaId: 'tomate', fechaSiembra: fechaHaceNDias(10), finalidad: 'cosecha', plantaTipo: 'fruto' }, catalogoPorId);
        assert.equal(info.estado, 'creciendo');
        assert.equal(info.badge, null);
        assert.equal(info.color, '#c62828'); // colorDePlanta('fruto')
        assert.ok(info.fraccion > 0 && info.fraccion < 1);
        assert.ok(Math.abs(info.diasTranscurridos - 10) <= 1); // tolerancia de huso horario/redondeo
    });
});

describe('renderEspiralSVG', () => {
    test('filtra camas rectangulares (o sin tipo), solo pinta arco/circular', () => {
        const contenedor = document.createElement('div');
        renderEspiralSVG(contenedor, [
            { id: 'c1', tipo: 'rectangular' },
            { id: 'c2', tipo: 'arco', anillo: 'interior', indiceSegmento: 0, plantas: [] },
            { id: 'sinTipo', plantas: [] }
        ], []);

        const grupos = contenedor.querySelectorAll('.cama-espiral');
        assert.equal(grupos.length, 1);
        assert.equal(grupos[0].dataset.camaId, 'c2');
    });

    test('cama circular pinta un <circle class="cama-forma">, arco pinta un <path>', () => {
        const contenedor = document.createElement('div');
        renderEspiralSVG(contenedor, [
            { id: 'centro', tipo: 'circular', plantas: [] },
            { id: 'anillo', tipo: 'arco', anillo: 'interior', indiceSegmento: 0, plantas: [] }
        ], []);

        const formaCentro = contenedor.querySelector('[data-cama-id="centro"] .cama-forma');
        const formaAnillo = contenedor.querySelector('[data-cama-id="anillo"] .cama-forma');
        assert.equal(formaCentro.tagName, 'circle');
        assert.equal(formaAnillo.tagName, 'path');
        assert.ok(formaAnillo.getAttribute('d').startsWith('M '));
    });

    test('cada planta en plantas[] genera una .ficha-planta con el emoji de su tipo', () => {
        const contenedor = document.createElement('div');
        renderEspiralSVG(contenedor, [{
            id: 'c1', tipo: 'circular',
            plantas: [
                { instanciaId: 'i1', plantaId: 'tomate', plantaTipo: 'fruto', fechaSiembra: '2026-01-01', angle: 0, r: 0, finalidad: 'cosecha' }
            ]
        }], [{ id: 'tomate', dias_siembra_a_cosecha: 90 }]);

        const fichas = contenedor.querySelectorAll('.ficha-planta');
        assert.equal(fichas.length, 1);
        assert.equal(fichas[0].dataset.instanciaId, 'i1');
        assert.equal(fichas[0].querySelector('text').textContent, '🍅');
    });

    test('planta con finalidad semilla pinta un badge visible', () => {
        const contenedor = document.createElement('div');
        renderEspiralSVG(contenedor, [{
            id: 'c1', tipo: 'circular',
            plantas: [{ instanciaId: 'i1', plantaId: 'x', plantaTipo: 'hoja', fechaSiembra: '2026-01-01', angle: 0, r: 0, finalidad: 'semilla' }]
        }], []);

        const textos = [...contenedor.querySelectorAll('.ficha-planta text')].map((t) => t.textContent);
        assert.ok(textos.includes('⏳'));
    });

    test('onClickCama se dispara al clickear la forma de la cama, con la cama completa', () => {
        const contenedor = document.createElement('div');
        const clicks = [];
        renderEspiralSVG(contenedor, [{ id: 'c1', tipo: 'circular', plantas: [] }], [], {
            onClickCama: (cama) => clicks.push(cama)
        });

        contenedor.querySelector('.cama-forma').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(clicks.length, 1);
        assert.equal(clicks[0].id, 'c1');
    });

    test('onClickPlanta se dispara al clickear una ficha, con (cama, plantaEntry), y detiene la propagación (no dispara también onClickCama)', () => {
        const contenedor = document.createElement('div');
        const clicksCama = [];
        const clicksPlanta = [];
        renderEspiralSVG(contenedor, [{
            id: 'c1', tipo: 'circular',
            plantas: [{ instanciaId: 'i1', plantaId: 'x', plantaTipo: 'hoja', fechaSiembra: '2026-01-01', angle: 0, r: 0 }]
        }], [], {
            onClickCama: (cama) => clicksCama.push(cama),
            onClickPlanta: (cama, plantaEntry) => clicksPlanta.push([cama, plantaEntry])
        });

        contenedor.querySelector('.ficha-planta').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(clicksPlanta.length, 1);
        assert.equal(clicksPlanta[0][0].id, 'c1');
        assert.equal(clicksPlanta[0][1].instanciaId, 'i1');
        assert.equal(clicksCama.length, 0); // stopPropagation evita el doble disparo
    });

    test('reemplaza el contenido del contenedor en cada llamada (no acumula SVGs viejos)', () => {
        const contenedor = document.createElement('div');
        renderEspiralSVG(contenedor, [{ id: 'c1', tipo: 'circular', plantas: [] }], []);
        renderEspiralSVG(contenedor, [{ id: 'c2', tipo: 'circular', plantas: [] }], []);

        assert.equal(contenedor.querySelectorAll('svg').length, 1);
        assert.equal(contenedor.querySelector('[data-cama-id]').dataset.camaId, 'c2');
    });

    test('sin callbacks provistos, no truena al clickear (usa el default que solo loguea)', () => {
        const contenedor = document.createElement('div');
        renderEspiralSVG(contenedor, [{ id: 'c1', tipo: 'circular', plantas: [] }], []);
        assert.doesNotThrow(() => {
            contenedor.querySelector('.cama-forma').dispatchEvent(new window.Event('click', { bubbles: true }));
        });
    });
});
