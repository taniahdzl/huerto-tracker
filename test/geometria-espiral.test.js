// test/geometria-espiral.test.js
//
// js/render/geometria-espiral.js es el único módulo del proyecto sin DOM ni
// Firebase — se puede probar tal cual con el test runner nativo de Node
// (`node --test`), sin ninguna dependencia nueva. Es también el de mayor
// riesgo lógico si se rompe en silencio: es la única fuente de verdad de
// dónde cae cada planta en el mapa, y proximaPosicionDisponible es la
// única garantía de que dos plantas nunca queden superpuestas.
//
// Corre con: node --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    polarACartesiano,
    calcularGeometriaArco,
    calcularGeometriaCentro,
    posicionPlantaEnArco,
    posicionPlantaEnCentro,
    proximaPosicionDisponible,
    RADIO_FICHA_UNIDADES
} from '../js/render/geometria-espiral.js';

// Tolerancia para comparaciones de punto flotante (trigonometría) — no se
// usa assert.equal en ningún valor derivado de sin/cos.
const EPS = 1e-9;
function assertClose(actual, expected, msg) {
    assert.ok(Math.abs(actual - expected) < EPS, `${msg}: esperado ${expected}, obtuvo ${actual}`);
}

describe('polarACartesiano', () => {
    test('0°/90°/180°/270° a radio 1 caen en los ejes cardinales', () => {
        assertClose(polarACartesiano(0, 1).x, 1, '0° x');
        assertClose(polarACartesiano(0, 1).y, 0, '0° y');
        assertClose(polarACartesiano(90, 1).x, 0, '90° x');
        assertClose(polarACartesiano(90, 1).y, 1, '90° y');
        assertClose(polarACartesiano(180, 1).x, -1, '180° x');
        assertClose(polarACartesiano(270, 1).y, -1, '270° y');
    });

    test('radio 0 siempre cae en el origen, sin importar el ángulo', () => {
        for (const angulo of [0, 37, 90, 180, 359]) {
            const p = polarACartesiano(angulo, 0);
            assertClose(p.x, 0, `radio 0 x en ${angulo}°`);
            assertClose(p.y, 0, `radio 0 y en ${angulo}°`);
        }
    });

    test('es periódica: 0° y 360° coinciden', () => {
        const a = polarACartesiano(0, 5);
        const b = polarACartesiano(360, 5);
        assertClose(a.x, b.x, 'x periódica');
        assertClose(a.y, b.y, 'y periódica');
    });
});

describe('calcularGeometriaArco', () => {
    test('rechaza un anillo que no sea interior/exterior', () => {
        assert.throws(() => calcularGeometriaArco('centro', 0), /anillo inválido/);
    });

    test('rechaza indiceSegmento fuera de [0, numSegmentosPorAnillo)', () => {
        assert.throws(() => calcularGeometriaArco('interior', -1), /indiceSegmento fuera de rango/);
        assert.throws(() => calcularGeometriaArco('interior', 4), /indiceSegmento fuera de rango/);
        assert.throws(() => calcularGeometriaArco('interior', 1.5), /indiceSegmento fuera de rango/);
    });

    test('segmento interior 0: 74° de span, sin rotación, radios 0.42–0.72', () => {
        const geo = calcularGeometriaArco('interior', 0);
        assertClose(geo.anguloInicio, 8, 'anguloInicio interior 0');
        assertClose(geo.anguloFin, 82, 'anguloFin interior 0');
        assertClose(geo.anguloFin - geo.anguloInicio, 74, 'span = 90 - gapDeg');
        assertClose(geo.radioInterno, 0.42, 'radioInterno interior');
        assertClose(geo.radioExterno, 0.72, 'radioExterno interior');
    });

    test('segmento exterior 0: offset de 45° respecto al interior, radios 0.86–1.26', () => {
        const geo = calcularGeometriaArco('exterior', 0);
        assertClose(geo.anguloInicio, 53, 'anguloInicio exterior 0');
        assertClose(geo.anguloFin, 127, 'anguloFin exterior 0');
        assertClose(geo.radioInterno, 0.86, 'radioInterno exterior');
        // 1.26 es el valor citado en los comentarios de render-spiral-2d.js
        // (radioExternoExterior) — si este número cambia, ese comentario
        // (y R_MAPA/ESCALA ahí) queda desactualizado también.
        assertClose(geo.radioExterno, 1.26, 'radioExterno exterior');
    });

    test('los 4 segmentos de un anillo no se traslapan en ángulo', () => {
        const segmentos = [0, 1, 2, 3].map((i) => calcularGeometriaArco('interior', i));
        const spans = segmentos.map((s) => [s.anguloInicio, s.anguloFin]).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) {
            assert.ok(spans[i][0] >= spans[i - 1][1], `segmento ${i} se traslapa con el anterior`);
        }
    });
});

describe('calcularGeometriaCentro', () => {
    test('devuelve el radio de la cama central', () => {
        const geo = calcularGeometriaCentro();
        assertClose(geo.radio, 0.30, 'radioCentro');
    });
});

describe('posicionPlantaEnArco', () => {
    test('rechaza t fuera de [0,1]', () => {
        assert.throws(() => posicionPlantaEnArco('interior', 0, -0.01, undefined), /t fuera de rango/);
        assert.throws(() => posicionPlantaEnArco('interior', 0, 1.01, undefined), /t fuera de rango/);
    });

    test('t=0 y t=1 caen exactamente en los extremos del segmento', () => {
        const geo = calcularGeometriaArco('interior', 0);
        const radioMedio = (geo.radioInterno + geo.radioExterno) / 2;

        const inicio = posicionPlantaEnArco('interior', 0, 0, undefined);
        const esperadoInicio = polarACartesiano(geo.anguloInicio, radioMedio);
        assertClose(inicio.x, esperadoInicio.x, 't=0 x');
        assertClose(inicio.y, esperadoInicio.y, 't=0 y');

        const fin = posicionPlantaEnArco('interior', 0, 1, undefined);
        const esperadoFin = polarACartesiano(geo.anguloFin, radioMedio);
        assertClose(fin.x, esperadoFin.x, 't=1 x');
        assertClose(fin.y, esperadoFin.y, 't=1 y');
    });

    test('sin `r` explícito, cae en el punto medio radial del segmento (fallback histórico)', () => {
        const geo = calcularGeometriaArco('exterior', 2);
        const radioMedio = (geo.radioInterno + geo.radioExterno) / 2;
        const pos = posicionPlantaEnArco('exterior', 2, 0.5, undefined);
        const esperado = polarACartesiano((geo.anguloInicio + geo.anguloFin) / 2, radioMedio);
        assertClose(pos.x, esperado.x, 'fallback r x');
        assertClose(pos.y, esperado.y, 'fallback r y');
    });

    test('rechaza `r` fuera del rango [radioInterno, radioExterno] del segmento', () => {
        const geo = calcularGeometriaArco('interior', 0);
        assert.throws(
            () => posicionPlantaEnArco('interior', 0, 0.5, geo.radioInterno - 0.01),
            /r fuera de rango/
        );
        assert.throws(
            () => posicionPlantaEnArco('interior', 0, 0.5, geo.radioExterno + 0.01),
            /r fuera de rango/
        );
    });
});

describe('posicionPlantaEnCentro', () => {
    test('r=0 cae en el origen sin importar el ángulo', () => {
        const p = posicionPlantaEnCentro(123, 0);
        assertClose(p.x, 0, 'r=0 x');
        assertClose(p.y, 0, 'r=0 y');
    });

    test('rechaza r negativo o mayor a radioCentro * 0.75', () => {
        assert.throws(() => posicionPlantaEnCentro(0, -0.01), /r fuera de rango/);
        assert.throws(() => posicionPlantaEnCentro(0, 0.30 * 0.75 + 0.001), /r fuera de rango/);
    });

    test('en el borde permitido (radioCentro * 0.75) no lanza', () => {
        assert.doesNotThrow(() => posicionPlantaEnCentro(45, 0.30 * 0.75));
    });
});

describe('proximaPosicionDisponible', () => {
    test('cama arco vacía: primer candidato es el centro geométrico del segmento (t=0.5)', () => {
        const cama = { tipo: 'arco', anillo: 'interior', indiceSegmento: 0 };
        const pos = proximaPosicionDisponible(cama, []);
        assertClose(pos.t, 0.5, 't del primer candidato');
    });

    test('cama circular vacía: primer candidato es el centro exacto (angle=0, r=0)', () => {
        const cama = { tipo: 'circular' };
        const pos = proximaPosicionDisponible(cama, []);
        assert.equal(pos.angle, 0);
        assert.equal(pos.r, 0);
    });

    test('nunca devuelve una posición traslapada con una planta ya existente (cama circular)', () => {
        const cama = { tipo: 'circular' };
        const diametro = RADIO_FICHA_UNIDADES * 2;

        // Coloca varias plantas en secuencia, cada vez alimentando de vuelta
        // las posiciones ya ocupadas — mismo patrón que usa el llamador real
        // (main.js/vista-gemelo.js) al sembrar una planta tras otra.
        const plantasExistentes = [];
        for (let i = 0; i < 6; i++) {
            const pos = proximaPosicionDisponible(cama, plantasExistentes);
            const cartesiana = posicionPlantaEnCentro(pos.angle, pos.r);

            for (const anterior of plantasExistentes) {
                const anteriorCartesiana = posicionPlantaEnCentro(anterior.angle, anterior.r);
                const distancia = Math.hypot(
                    cartesiana.x - anteriorCartesiana.x,
                    cartesiana.y - anteriorCartesiana.y
                );
                assert.ok(
                    distancia >= diametro - 1e-6,
                    `planta ${i} quedó a distancia ${distancia} de una existente (mínimo ${diametro})`
                );
            }
            plantasExistentes.push(pos);
        }
    });

    test('nunca devuelve una posición traslapada con una planta ya existente (cama arco)', () => {
        const cama = { tipo: 'arco', anillo: 'exterior', indiceSegmento: 1 };
        const diametro = RADIO_FICHA_UNIDADES * 2;

        const plantasExistentes = [];
        for (let i = 0; i < 4; i++) {
            const pos = proximaPosicionDisponible(cama, plantasExistentes);
            const cartesiana = posicionPlantaEnArco(cama.anillo, cama.indiceSegmento, pos.t, pos.r);

            for (const anterior of plantasExistentes) {
                const anteriorCartesiana = posicionPlantaEnArco(cama.anillo, cama.indiceSegmento, anterior.t, anterior.r);
                const distancia = Math.hypot(
                    cartesiana.x - anteriorCartesiana.x,
                    cartesiana.y - anteriorCartesiana.y
                );
                assert.ok(
                    distancia >= diametro - 1e-6,
                    `planta ${i} quedó a distancia ${distancia} de una existente (mínimo ${diametro})`
                );
            }
            plantasExistentes.push(pos);
        }
    });

    test('deniega (throw) cuando ya no cabe una ficha más, en vez de apilar con superposición', () => {
        // Cama circular pequeña saturada a mano con posiciones sintéticas
        // que cubren TODO el disco permitido (r hasta 0.225) — no depende
        // de haber llamado antes a la función, así que no hereda ningún
        // supuesto de los tests anteriores.
        const cama = { tipo: 'circular' };
        const diametro = RADIO_FICHA_UNIDADES * 2;
        const limite = 0.30 * 0.75;

        const saturada = [];
        for (let r = 0; r <= limite; r += diametro * 0.4) {
            for (let angle = 0; angle < 360; angle += 15) {
                saturada.push({ angle, r });
            }
        }

        assert.throws(
            () => proximaPosicionDisponible(cama, saturada),
            /No hay espacio disponible/
        );
    });
});
