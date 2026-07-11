// js/render-spiral-2d.js
//
// Vista 2D top-down de las camas en espiral: SVG con sectores anulares
// reales (arco SVG, no polígonos aproximados) para el contenedor, más un
// overlay de íconos de planta. Cero trigonometría propia — toda la
// geometría viene de geometria-espiral.js, que es la única fuente de
// verdad de la forma física (2D y 3D consumen el mismo módulo para no
// divergir nunca entre sí).
//
// No sabe qué es Firestore ni conoce main.js. Recibe camas ya resueltas,
// un contenedor del DOM y un callback de clic — quién abre qué modal al
// hacer clic es decisión de quien llama a renderEspiral2D, no de este
// archivo (mismo patrón que renderListaTareas/onCompletarClick).
//
// tipo:'rectangular' se ignora aquí — esa vista sigue siendo responsabilidad
// de renderMapaHuerto en render.js.

import {
    calcularGeometriaArco,
    calcularGeometriaCentro,
    posicionPlantaEnArco,
    posicionPlantaEnCentro,
    polarACartesiano
} from './geometria-espiral.js';
import { emojiDePlanta } from './render.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Radio máximo posible (radioExternoExterior) + margen, calculado una vez
// contra el propio módulo de geometría en vez de hardcodear el número —
// si algún día cambian los parámetros aprobados, el viewBox se ajusta solo.
const RADIO_MAX = calcularGeometriaArco('exterior', 0).radioExterno + 0.1;

function crearSVG(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, String(val));
    return el;
}

// Sector anular (donut slice) vía arco SVG real: dos arcos (externo e
// interno) unidos por dos líneas rectas radiales.
function pathSectorAnular(anguloInicio, anguloFin, radioInterno, radioExterno) {
    const largeArc = (anguloFin - anguloInicio) > 180 ? 1 : 0;

    const outerStart = polarACartesiano(anguloInicio, radioExterno);
    const outerEnd    = polarACartesiano(anguloFin, radioExterno);
    const innerEnd     = polarACartesiano(anguloFin, radioInterno);
    const innerStart  = polarACartesiano(anguloInicio, radioInterno);

    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${radioExterno} ${radioExterno} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${radioInterno} ${radioInterno} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        'Z'
    ].join(' ');
}

function crearIconoPlanta(planta, x, y) {
    const tipo = (planta.plantaTipo || '').trim().toLowerCase();
    const texto = crearSVG('text', {
        x, y,
        class: 'cama-espiral-planta',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': 0.09
    });
    texto.textContent = emojiDePlanta(tipo);
    return texto;
}

function dibujarCamaArco(cama) {
    const { anillo, indiceSegmento } = cama;
    const { anguloInicio, anguloFin, radioInterno, radioExterno } = calcularGeometriaArco(anillo, indiceSegmento);

    const grupo = crearSVG('g', {
        class: `cama-espiral cama-arco anillo-${anillo}`,
        'data-cama-id': cama.id
    });

    grupo.appendChild(crearSVG('path', {
        d: pathSectorAnular(anguloInicio, anguloFin, radioInterno, radioExterno),
        class: 'cama-espiral-pared'
    }));

    (cama.plantas || []).forEach((planta) => {
        const { x, y } = posicionPlantaEnArco(anillo, indiceSegmento, planta.t);
        grupo.appendChild(crearIconoPlanta(planta, x, y));
    });

    return grupo;
}

function dibujarCamaCircular(cama) {
    const { radio } = calcularGeometriaCentro();

    const grupo = crearSVG('g', {
        class: 'cama-espiral cama-circular',
        'data-cama-id': cama.id
    });

    grupo.appendChild(crearSVG('circle', {
        cx: 0, cy: 0, r: radio,
        class: 'cama-espiral-pared'
    }));

    (cama.plantas || []).forEach((planta) => {
        const { x, y } = posicionPlantaEnCentro(planta.angle, planta.r);
        grupo.appendChild(crearIconoPlanta(planta, x, y));
    });

    return grupo;
}

// Colores aproximados a la paleta ya usada en index.html (--soil, --compost)
// para que la vista se sienta parte del mismo huerto y no un widget aparte.
// No importa las variables CSS reales porque este módulo debe poder
// validarse solo, sin index.html — cuando se cablee, esto puede migrar a
// clases que sí las usen.
const ESTILOS = `
  .cama-espiral-pared { fill: #8b6f47; stroke: #3d2b1f; stroke-width: 0.012; cursor: pointer; }
  .cama-espiral-pared:hover { fill: #a08359; }
  .cama-espiral-planta { pointer-events: none; }
`;

export function renderEspiral2D(camas, contenedor, onBedClick) {
    const svg = crearSVG('svg', {
        viewBox: `${-RADIO_MAX} ${-RADIO_MAX} ${RADIO_MAX * 2} ${RADIO_MAX * 2}`,
        class: 'huerto-espiral-svg'
    });

    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = ESTILOS;
    svg.appendChild(style);

    camas.forEach((cama) => {
        if (cama.tipo === 'arco') {
            svg.appendChild(dibujarCamaArco(cama));
        } else if (cama.tipo === 'circular') {
            svg.appendChild(dibujarCamaCircular(cama));
        }
        // tipo 'rectangular': no pertenece a esta vista, se ignora.
    });

    svg.addEventListener('click', (e) => {
        const grupo = e.target.closest('[data-cama-id]');
        if (!grupo) return;
        onBedClick(grupo.dataset.camaId);
    });

    contenedor.replaceChildren(svg);
}
