// test/helpers/dom.js
//
// Instala un `document`/`window` de jsdom en los globals de Node para los
// tests de módulos que tocan el DOM (js/render/*.js, js/views/*.js). Los
// módulos reales usan `document.getElementById`/`createElement` como si
// corrieran en un navegador — jsdom es la pieza que hace eso cierto también
// bajo `node --test` (decisión tomada 2026-07-26, ver AI_CONTEXT.md).
//
// instalarDomCompleto() carga el `index.html` real — necesario para
// cualquier módulo que haga document.getElementById('algoDelIndexHtml') a
// nivel de módulo (todas las vista-*.js) — si el id no existe en el
// documento, esas líneas devuelven null y el import entero truena al
// primer .addEventListener sobre null.
//
// instalarDomVacio() alcanza para módulos que solo reciben un `contenedor`
// por parámetro (la mayoría de js/render/render.js) y no consultan ningún
// id fijo — evita el costo de parsear el index.html completo en esos tests.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INDEX_HTML_PATH = fileURLToPath(new URL('../../index.html', import.meta.url));

function instalarGlobals(dom) {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    // navigator NO se reasigna: Node 21+ ya define un global `navigator`
    // propio de solo lectura (getter sin setter) — reasignarlo tira
    // TypeError. Ningún módulo de este proyecto usa `navigator` (confirmado
    // por grep, 2026-07-26), así que no hace falta.
    // matchMedia no existe en jsdom (limitación conocida) — gemelo-drag-drop.js
    // lo llama para decidir el eje de scroll; el valor exacto no importa para
    // los tests de este módulo (no simulan touch real), solo que no truene.
    dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false }));
    globalThis.matchMedia = dom.window.matchMedia;
    return dom;
}

export function instalarDomCompleto() {
    const html = readFileSync(INDEX_HTML_PATH, 'utf8');
    return instalarGlobals(new JSDOM(html, { url: 'https://localhost/' }));
}

export function instalarDomVacio() {
    return instalarGlobals(new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://localhost/' }));
}
