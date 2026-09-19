// test/tipos-tarea.test.js
//
// js/shared/tipos-tarea.js — módulo hoja puro, sin DOM ni Firebase (mismo
// criterio que test/catalogos.test.js).
//
// Corre con: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_TAREA, esTipoValido, calcularHorasAOtorgar } from '../js/shared/tipos-tarea.js';

describe('TIPOS_TAREA', () => {
    test('6 categorías, con los multiplicadores confirmados con la usuaria (2026-09-19)', () => {
        assert.equal(Object.keys(TIPOS_TAREA).length, 6);
        assert.equal(TIPOS_TAREA.riego.multiplicador, 2);
        assert.equal(TIPOS_TAREA.trabajo_fisico.multiplicador, 3.7);
        assert.equal(TIPOS_TAREA.redes.multiplicador, 1.5);
        assert.equal(TIPOS_TAREA.comunidad.multiplicador, 2);
        assert.equal(TIPOS_TAREA.investigacion.multiplicador, 2.5);
        assert.equal(TIPOS_TAREA.hoyos_composta.multiplicador, 7);
    });
});

describe('esTipoValido', () => {
    test('acepta las 6 claves del catálogo', () => {
        Object.keys(TIPOS_TAREA).forEach((clave) => assert.equal(esTipoValido(clave), true));
    });

    test('rechaza los tipos viejos retirados y cualquier otro valor', () => {
        assert.equal(esTipoValido('individual'), false);
        assert.equal(esTipoValido('asistencia'), false);
        assert.equal(esTipoValido('otro'), false);
        assert.equal(esTipoValido(''), false);
        assert.equal(esTipoValido(undefined), false);
    });
});

describe('calcularHorasAOtorgar', () => {
    test('horasEfectivas × multiplicador del tipo', () => {
        assert.equal(calcularHorasAOtorgar('riego', 5), 10);
        assert.equal(calcularHorasAOtorgar('redes', 2), 3);
        assert.equal(calcularHorasAOtorgar('hoyos_composta', 1), 7);
    });

    test('redondea al entero más cercano — 4h de trabajo_fisico (×3.7) da 15, no 14.8', () => {
        assert.equal(calcularHorasAOtorgar('trabajo_fisico', 4), 15);
    });

    test('sin horasEfectivas (null/undefined/0) da 0, sin lanzar', () => {
        assert.equal(calcularHorasAOtorgar('riego', 0), 0);
        assert.equal(calcularHorasAOtorgar('riego', null), 0);
        assert.equal(calcularHorasAOtorgar('riego', undefined), 0);
    });

    test('lanza con un tipo inválido — no inventa un multiplicador default', () => {
        assert.throws(() => calcularHorasAOtorgar('individual', 5));
        assert.throws(() => calcularHorasAOtorgar('otro', 5));
    });
});
