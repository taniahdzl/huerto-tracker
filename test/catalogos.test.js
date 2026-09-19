// test/catalogos.test.js
//
// js/shared/catalogos.js — módulo hoja puro, sin DOM ni Firebase, así que
// no hace falta instalarDomVacio() ni mockear firebase.js (mismo criterio
// que geometria-espiral.test.js).
//
// Corre con: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CARRERAS, HORAS_OBJETIVO_POR_CARRERA, calcularHorasObjetivo } from '../js/shared/catalogos.js';

describe('CARRERAS', () => {
    test('15 carreras, sin duplicados', () => {
        assert.equal(CARRERAS.length, 15);
        assert.equal(new Set(CARRERAS).size, 15);
    });

    test('incluye las confirmadas con la usuaria (2026-09-18)', () => {
        assert.ok(CARRERAS.includes('Matemáticas Aplicadas'));
        assert.ok(CARRERAS.includes('Ingeniería en Computación'));
    });
});

describe('calcularHorasObjetivo', () => {
    test('1 carrera -> 480h', () => {
        assert.equal(calcularHorasObjetivo(['Economía']), HORAS_OBJETIVO_POR_CARRERA);
    });

    test('2 carreras -> 960h (cada una suma su propio objetivo, no se promedian)', () => {
        assert.equal(calcularHorasObjetivo(['Economía', 'Derecho']), 960);
    });

    test('sin carreras (null/undefined/[]) -> 0, sin lanzar', () => {
        assert.equal(calcularHorasObjetivo(null), 0);
        assert.equal(calcularHorasObjetivo(undefined), 0);
        assert.equal(calcularHorasObjetivo([]), 0);
    });
});
