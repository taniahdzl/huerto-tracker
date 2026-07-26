// test/gemelo-drag-drop.test.js
//
// js/views/gemelo-drag-drop.js con jsdom. jsdom no implementa el
// constructor PointerEvent ni document.elementFromPoint (limitaciones
// documentadas de jsdom, no de este código) — se simulan a mano:
//   - un Event genérico con clientX/clientY/pointerId/pointerType asignados
//     como propiedades extra (el código solo LEE esas propiedades, nunca
//     llama métodos específicos de PointerEvent, así que alcanza).
//   - document.elementFromPoint se sobreescribe por test para devolver el
//     elemento "bajo el puntero" que cada caso necesita.
//
// No se prueba el gesto de pellizco/multi-touch (2 punteros simultáneos) —
// vive en gemelo-pan-zoom.js, no en este módulo.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomVacio } from './helpers/dom.js';

instalarDomVacio();

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { iniciarPosibleArrastrePlanta, estaArrastrandoPlanta } = await import('../js/views/gemelo-drag-drop.js');

function crearEventoPuntero(tipo, { clientX = 0, clientY = 0, pointerId = 1, pointerType = 'mouse' } = {}) {
    const evento = new window.Event(tipo, { bubbles: true, cancelable: true });
    Object.assign(evento, { clientX, clientY, pointerId, pointerType });
    return evento;
}

function crearCard() {
    const card = document.createElement('div');
    card.textContent = '🍅';
    document.body.appendChild(card);
    return card;
}

function crearCamaFalsa(camaId) {
    const cama = document.createElement('div');
    cama.className = 'cama-espiral';
    cama.dataset.camaId = camaId;
    document.body.appendChild(cama);
    return cama;
}

beforeEach(() => {
    firebaseMock.reset();
    document.body.replaceChildren();
    document.elementFromPoint = () => null;
});

describe('iniciarPosibleArrastrePlanta — mouse (arranca de inmediato, sin umbral)', () => {
    test('estaArrastrandoPlanta() empieza en false', () => {
        assert.equal(estaArrastrandoPlanta(), false);
    });

    test('soltar sobre una .cama-espiral agrega la planta y llama a onSoltar', async () => {
        const card = crearCard();
        const cama = crearCamaFalsa('c1');
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'circular', plantas: [] } });
        document.elementFromPoint = () => cama;

        let onSoltarLlamado = false;
        const evento = crearEventoPuntero('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
        iniciarPosibleArrastrePlanta(evento, 'tomate', card, async () => { onSoltarLlamado = true; });

        assert.equal(estaArrastrandoPlanta(), true);
        assert.ok(card.classList.contains('dragging'));
        assert.ok(document.querySelector('.gemelo-drag-ghost'));

        window.dispatchEvent(crearEventoPuntero('pointermove', { pointerType: 'mouse', clientX: 20, clientY: 20 }));
        assert.ok(cama.classList.contains('drop-target'));

        window.dispatchEvent(crearEventoPuntero('pointerup', { pointerType: 'mouse', clientX: 20, clientY: 20 }));
        await new Promise((r) => setTimeout(r, 0));

        assert.equal(estaArrastrandoPlanta(), false);
        assert.equal(card.classList.contains('dragging'), false);
        assert.equal(document.querySelector('.gemelo-drag-ghost'), null);
        assert.equal(cama.classList.contains('drop-target'), false);
        assert.equal(onSoltarLlamado, true);
        assert.equal(firebaseMock.leerDoc('camas_cosecha', 'c1').plantas.length, 1);
    });

    test('soltar fuera de cualquier cama es un no-op: no llama a Firestore ni a onSoltar', async () => {
        const card = crearCard();
        document.elementFromPoint = () => null; // nada bajo el puntero

        let onSoltarLlamado = false;
        const evento = crearEventoPuntero('pointerdown', { pointerType: 'mouse' });
        iniciarPosibleArrastrePlanta(evento, 'tomate', card, async () => { onSoltarLlamado = true; });

        window.dispatchEvent(crearEventoPuntero('pointerup', { pointerType: 'mouse' }));
        await new Promise((r) => setTimeout(r, 0));

        assert.equal(onSoltarLlamado, false);
        assert.equal(firebaseMock.leerColeccion('camas_cosecha').length, 0);
    });

    test('si agregarPlantaACama rechaza (ej. cama saturada), limpia el estado de arrastre igual y no llama a onSoltar', async () => {
        const card = crearCard();
        const cama = crearCamaFalsa('no-existe'); // camas_cosecha vacío -> "La mesa no existe"
        document.elementFromPoint = () => cama;

        let onSoltarLlamado = false;
        iniciarPosibleArrastrePlanta(crearEventoPuntero('pointerdown', { pointerType: 'mouse' }), 'tomate', card, async () => { onSoltarLlamado = true; });
        window.dispatchEvent(crearEventoPuntero('pointerup', { pointerType: 'mouse' }));
        await new Promise((r) => setTimeout(r, 0));

        assert.equal(estaArrastrandoPlanta(), false); // el finally-like cleanup corrió antes del await que falla
        assert.equal(onSoltarLlamado, false);
    });
});

// Cada test usa un pointerId distinto (nunca 7 dos veces) — necesario
// porque un gesto que SÍ arranca el arrastre (iniciarArrastrePlanta) monta
// sus propios listeners de window sin filtrar por pointerId, y solo se
// desmontan en un pointerup/pointercancel posterior. Sin ids distintos, un
// dispatch de un test posterior podría disparar el listener "de arrastre en
// curso" que dejó vivo un test anterior que nunca completó su gesto.
let contadorPointerId = 100;
function siguientePointerId() {
    contadorPointerId += 1;
    return contadorPointerId;
}

describe('iniciarPosibleArrastrePlanta — touch (espera umbral + decide por dirección dominante)', () => {
    test('bajo el umbral de 9px, no arranca ningún arrastre', () => {
        const card = crearCard();
        const pid = siguientePointerId();
        iniciarPosibleArrastrePlanta(crearEventoPuntero('pointerdown', { pointerType: 'touch', pointerId: pid, clientX: 0, clientY: 0 }), 'tomate', card, async () => {});

        window.dispatchEvent(crearEventoPuntero('pointermove', { pointerType: 'touch', pointerId: pid, clientX: 3, clientY: 3 }));
        assert.equal(estaArrastrandoPlanta(), false);
    });

    test('mobile (matchMedia false): gesto dominante horizontal se interpreta como scroll de la lista, no arranca arrastre', () => {
        window.matchMedia = () => ({ matches: false }); // < 720px
        const card = crearCard();
        const pid = siguientePointerId();
        iniciarPosibleArrastrePlanta(crearEventoPuntero('pointerdown', { pointerType: 'touch', pointerId: pid, clientX: 0, clientY: 0 }), 'tomate', card, async () => {});

        window.dispatchEvent(crearEventoPuntero('pointermove', { pointerType: 'touch', pointerId: pid, clientX: 20, clientY: 1 })); // horizontal dominante
        assert.equal(estaArrastrandoPlanta(), false);
    });

    test('mobile: gesto dominante vertical (hacia el mapa) SÍ arranca el arrastre', () => {
        window.matchMedia = () => ({ matches: false });
        const card = crearCard();
        const pid = siguientePointerId();
        iniciarPosibleArrastrePlanta(crearEventoPuntero('pointerdown', { pointerType: 'touch', pointerId: pid, clientX: 0, clientY: 0 }), 'tomate', card, async () => {});

        window.dispatchEvent(crearEventoPuntero('pointermove', { pointerType: 'touch', pointerId: pid, clientX: 1, clientY: 20 })); // vertical dominante
        assert.equal(estaArrastrandoPlanta(), true);

        // Completa el gesto (soltar fuera de cualquier cama, no-op) para no
        // dejar el listener de arrastre-en-curso vivo para los tests siguientes.
        window.dispatchEvent(crearEventoPuntero('pointerup', { pointerType: 'touch', pointerId: pid, clientX: 1, clientY: 20 }));
        assert.equal(estaArrastrandoPlanta(), false);
    });

    test('desktop (matchMedia true, ≥720px): el criterio de eje se invierte — vertical es scroll, horizontal arranca el arrastre', () => {
        window.matchMedia = () => ({ matches: true }); // ≥720px
        const card = crearCard();
        const pid = siguientePointerId();
        iniciarPosibleArrastrePlanta(crearEventoPuntero('pointerdown', { pointerType: 'touch', pointerId: pid, clientX: 0, clientY: 0 }), 'tomate', card, async () => {});

        window.dispatchEvent(crearEventoPuntero('pointermove', { pointerType: 'touch', pointerId: pid, clientX: 1, clientY: 20 })); // vertical -> scroll en desktop
        assert.equal(estaArrastrandoPlanta(), false);
    });
});
