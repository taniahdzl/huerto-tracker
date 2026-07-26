// test/estado-app.test.js
//
// js/shared/estado-app.js es puro (sin DOM) — flag de RBAC/UI (esAdminActual)
// detrás de get/set, ver su propio comentario de cabecera para por qué
// vive separado de session.js. Poco que probar más allá del roundtrip,
// pero es gratis y documenta el default esperado (arranca en false, nunca
// admin hasta que algo lo confirme).
//
// Corre con: node --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getEsAdminActual, setEsAdminActual } from '../js/shared/estado-app.js';

describe('getEsAdminActual / setEsAdminActual', () => {
    test('arranca en false por defecto (nadie es admin hasta que se confirme)', () => {
        // Nota: este test asume que corre antes que cualquier otro test en
        // este mismo archivo mute el estado — node:test ejecuta los tests
        // de un mismo describe en orden de declaración por defecto.
        assert.equal(getEsAdminActual(), false);
    });

    test('roundtrip true', () => {
        setEsAdminActual(true);
        assert.equal(getEsAdminActual(), true);
    });

    test('roundtrip false', () => {
        setEsAdminActual(false);
        assert.equal(getEsAdminActual(), false);
    });
});
