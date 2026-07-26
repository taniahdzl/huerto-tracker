// test/session.test.js
//
// js/services/session.js es puro (sin DOM, sin Firebase) — estado de módulo
// (_usuario) expuesto vía getUsuarioActual/setUsuarioActual, mismo patrón
// que luego copiaron estado-app.js y las vista-*.js con estado propio (ver
// AI_CONTEXT.md, Fase 19). Cada test resetea el estado explícitamente al
// empezar — dentro de un mismo archivo de test, node:test corre todos los
// tests contra la MISMA instancia del módulo (los imports de ES modules
// son singletons cacheados por proceso), así que no asumir que un test
// corre antes o después de otro.
//
// Corre con: node --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setUsuarioActual, getUsuarioActual, nombreParaMostrar } from '../js/services/session.js';

describe('setUsuarioActual / getUsuarioActual', () => {
    test('guarda y devuelve el usuario tal cual, sin transformarlo', () => {
        const usuario = { uid: 'abc123', email: 'persona@itam.mx' };
        setUsuarioActual(usuario);
        assert.equal(getUsuarioActual(), usuario);
    });

    test('null representa "sin sesión" explícitamente', () => {
        setUsuarioActual(null);
        assert.equal(getUsuarioActual(), null);
    });
});

describe('nombreParaMostrar', () => {
    test('usuario null/undefined devuelve cadena vacía', () => {
        assert.equal(nombreParaMostrar(null), '');
        assert.equal(nombreParaMostrar(undefined), '');
    });

    test('prioriza `nombre` si existe y no es solo espacios', () => {
        assert.equal(nombreParaMostrar({ nombre: 'Tania', email: 'x@itam.mx' }), 'Tania');
    });

    test('nombre vacío o solo espacios cae al fallback de email', () => {
        assert.equal(nombreParaMostrar({ nombre: '   ', email: 'x@itam.mx' }), 'x@itam.mx');
        assert.equal(nombreParaMostrar({ nombre: '', email: 'x@itam.mx' }), 'x@itam.mx');
    });

    test('sin nombre, usa email', () => {
        assert.equal(nombreParaMostrar({ email: 'x@itam.mx' }), 'x@itam.mx');
    });

    test('sin nombre ni email, usa id (shape de documento usuarios/{uid})', () => {
        assert.equal(nombreParaMostrar({ id: 'uid-del-documento' }), 'uid-del-documento');
    });

    test('sin nombre/email/id, usa uid (shape de sesión {uid,email})', () => {
        assert.equal(nombreParaMostrar({ uid: 'uid-de-sesion' }), 'uid-de-sesion');
    });

    test('sin ningún campo utilizable, devuelve cadena vacía', () => {
        assert.equal(nombreParaMostrar({}), '');
    });
});
