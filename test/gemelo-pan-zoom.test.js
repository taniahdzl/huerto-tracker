// test/gemelo-pan-zoom.test.js
//
// js/views/gemelo-pan-zoom.js con jsdom. jsdom NO implementa
// SVGSVGElement.viewBox.baseVal ni layout real (getBoundingClientRect
// siempre {0,0,0,0}) — limitaciones documentadas de jsdom, no de este
// código. Se instala un polyfill mínimo por test: `viewBox` como getter que
// parsea el atributo (que sí es real — aplicarVistaEspiral usa
// setAttribute), y un getBoundingClientRect fijo no-cero para que la
// conversión pantalla->SVG (pantallaASvg) no divida por cero.
//
// El gesto de pellizco (2 punteros simultáneos) NO se prueba acá — más
// infraestructura (2 pointerId concurrentes) por una ganancia marginal
// sobre lo que ya cubre el zoom de rueda (misma función zoomHacia
// subyacente); documentado como límite de esta suite, no del código.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomCompleto } from './helpers/dom.js';

// instalarDomCompleto (no vacío): el módulo consulta gemeloMapaContainer/
// gemeloZoomInBtn/gemeloZoomOutBtn por id a nivel de módulo — necesita el
// index.html real para no explotar con null.addEventListener.
instalarDomCompleto();

// gemelo-pan-zoom.js importa gemelo-drag-drop.js (por estaArrastrandoPlanta),
// que a su vez importa db.js -> firebase.js — se mockea igual que en el
// resto de la suite aunque este módulo en sí no toque Firestore, solo para
// que la cadena de imports no truene al evaluarse.
const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
mock.module(firebaseUrl, { namedExports: createFirebaseMock().exports });

const { aplicarVistaEspiral, configurarPanZoomEspiral } = await import('../js/views/gemelo-pan-zoom.js');

function crearSvgConPolyfill() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);

    Object.defineProperty(svg, 'viewBox', {
        configurable: true,
        get() {
            const partes = (svg.getAttribute('viewBox') || '0 0 0 0').split(' ').map(Number);
            const [x, y, width, height] = partes;
            return { baseVal: { x, y, width, height } };
        }
    });
    // Rect fijo de 800x800 en (0,0) — coincide con el ancho/alto reales
    // renderizados asumidos por pantallaASvg (px de pantalla -> unidades SVG).
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 });

    return svg;
}

function evento(tipo, props) {
    const e = new window.Event(tipo, { bubbles: true, cancelable: true });
    Object.assign(e, props);
    return e;
}

let svg;
beforeEach(() => {
    document.body.replaceChildren();
    svg = crearSvgConPolyfill();
});

describe('aplicarVistaEspiral', () => {
    test('con el estado inicial (escala 1, offset 0,0) el viewBox cubre el cuadro completo [-420,420]', () => {
        aplicarVistaEspiral(svg);
        assert.equal(svg.getAttribute('viewBox'), '-420 -420 840 840');
    });
});

describe('configurarPanZoomEspiral — zoom con rueda', () => {
    test('rueda hacia arriba (deltaY<0) acerca (achica el viewBox), respetando ESCALA_MAX=4', () => {
        aplicarVistaEspiral(svg);
        configurarPanZoomEspiral(svg);

        // Muchas ruedas seguidas para forzar el clamp en el tope.
        for (let i = 0; i < 30; i++) {
            svg.dispatchEvent(evento('wheel', { deltaY: -100, clientX: 400, clientY: 400 }));
        }

        const [, , width] = svg.getAttribute('viewBox').split(' ').map(Number);
        // escala máxima 4 -> mitad = 420/4 = 105 -> width = 210
        assert.ok(Math.abs(width - 210) < 0.01);
    });

    test('rueda hacia abajo (deltaY>0) aleja, respetando ESCALA_MIN=1 (no se achica más que el cuadro original)', () => {
        aplicarVistaEspiral(svg);
        configurarPanZoomEspiral(svg);

        // vistaEspiral es estado de módulo compartido entre tests (mismo
        // proceso) — se aleja muchas veces para garantizar tocar el piso de
        // ESCALA_MIN sin importar en qué escala haya quedado un test previo.
        for (let i = 0; i < 30; i++) {
            svg.dispatchEvent(evento('wheel', { deltaY: 100, clientX: 400, clientY: 400 }));
        }

        const [, , width] = svg.getAttribute('viewBox').split(' ').map(Number);
        assert.equal(width, 840); // ESCALA_MIN=1 -> mitad=420 -> width=840, sin importar el punto de partida
    });

    test('el zoom ancla el punto bajo el cursor: acercar centrado en el cursor no lo desplaza fuera de foco', () => {
        aplicarVistaEspiral(svg);
        configurarPanZoomEspiral(svg);

        // Zoom hacia una esquina (100,100 en vez del centro 400,400).
        svg.dispatchEvent(evento('wheel', { deltaY: -100, clientX: 100, clientY: 100 }));

        const [x, y, width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
        // El viewBox se hizo más chico (zoom in) y se desplazó hacia esa
        // esquina (x/y ya no son -mitad simétrico respecto al centro previo).
        assert.ok(width < 840);
        assert.ok(x > -420); // se movió desde el borde izquierdo original hacia el cursor
        assert.ok(y > -420);
    });
});

describe('configurarPanZoomEspiral — pan de un puntero', () => {
    test('arrastrar más allá del umbral mueve el viewBox (pan)', () => {
        aplicarVistaEspiral(svg);
        configurarPanZoomEspiral(svg);

        // Hace falta zoom primero: en escala 1 el pan está clampeado a 0
        // (ver comentario de clampVistaEspiral en el módulo) — nada que
        // mover si ya se ve todo el contenido.
        svg.dispatchEvent(evento('wheel', { deltaY: -300, clientX: 400, clientY: 400 }));
        const viewBoxTrasZoom = svg.getAttribute('viewBox');

        svg.dispatchEvent(evento('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }));
        window.dispatchEvent(evento('pointermove', { pointerId: 1, clientX: 350, clientY: 400 })); // arrastra 50px a la izquierda
        window.dispatchEvent(evento('pointerup', { pointerId: 1, clientX: 350, clientY: 400 }));

        assert.notEqual(svg.getAttribute('viewBox'), viewBoxTrasZoom);
    });

    test('sin cruzar el umbral de pan (8-10px), el viewBox no cambia (podría ser un clic)', () => {
        aplicarVistaEspiral(svg);
        configurarPanZoomEspiral(svg);
        svg.dispatchEvent(evento('wheel', { deltaY: -300, clientX: 400, clientY: 400 }));
        const viewBoxTrasZoom = svg.getAttribute('viewBox');

        svg.dispatchEvent(evento('pointerdown', { pointerId: 1, clientX: 400, clientY: 400 }));
        window.dispatchEvent(evento('pointermove', { pointerId: 1, clientX: 403, clientY: 400 })); // 3px, bajo el umbral de 9
        window.dispatchEvent(evento('pointerup', { pointerId: 1, clientX: 403, clientY: 400 }));

        assert.equal(svg.getAttribute('viewBox'), viewBoxTrasZoom);
    });
});
