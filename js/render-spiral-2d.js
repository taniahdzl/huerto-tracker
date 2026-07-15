// js/render-spiral-2d.js
//
// Render 2D de las camas en espiral (arco/circular). Mismo criterio que
// render.js: no sabe qué es Firestore, no importa nada de firebase.js ni de
// db.js — solo recibe arrays de datos ya resueltos (`camas`, `catalogo`) y
// un contenedor del DOM. Toda la carga de datos vive en main.js.
//
// Geometría (ángulos/radios/posiciones) SIEMPRE vía geometria-espiral.js —
// cero trigonometría nueva en este archivo. Colores por tipo/emoji vienen
// de render.js (COLOR_POR_TIPO/EMOJI_POR_TIPO) — misma fuente de verdad que
// el resto de la app, ninguna paleta nueva.
//
// SVG construido íntegramente con createElementNS/setAttribute — igual que
// la regla del proyecto de nunca usar innerHTML, extendida al namespace SVG.
//
// Reemplaza al prototipo anterior de este mismo archivo (renderEspiral2D):
// no tenía anillo de progreso, instanciaId, badges de estado ni colores de
// css/variables.css — confirmado por grep que nada en el repo lo importaba
// todavía, así que no hay ningún caller que romper.

import {
    polarACartesiano,
    calcularGeometriaArco,
    calcularGeometriaCentro,
    posicionPlantaEnArco,
    posicionPlantaEnCentro,
    RADIO_FICHA_UNIDADES
} from './geometria-espiral.js';
import { emojiDePlanta, colorDePlanta } from './render.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 1 unidad de geometria-espiral.js → 300px de espacio SVG. Con
// radioExternoExterior = 1.26 (ver PARAMS ahí), el sector más externo llega
// a ~378px de radio; GROSOR_CONTORNO/GROSOR_ANILLO_PROGRESO/RADIO_BADGE de
// esta sección están expresados directamente en ese mismo espacio "px" del
// viewBox, no en unidades de geometria-espiral.js. RADIO_FICHA es la
// excepción desde Fase 14.6a: geometria-espiral.js es la fuente de verdad
// (RADIO_FICHA_UNIDADES) porque proximaPosicionDisponible necesita el
// tamaño real de ficha en unidades nativas para calcular colocación sin
// traslape — aquí solo se deriva la versión en píxeles multiplicando por
// ESCALA, nunca al revés.
const ESCALA = 300;
const px = (v) => v * ESCALA;

// Fase 14.7: subido de 4.5 a 6.5 tras comparar 4.5/6.5/8 con capturas
// reales (Playwright + arnés mock, ver harness-14-7.html) — 6.5 ya separa
// claramente el caso de MENOR contraste (segmento interior, terracota
// claro contra --color-fondo) sin comerse demasiado el ancho del segmento
// interior (el más angosto, anchoCamaInterior=0.30 en geometria-espiral.js);
// 8 no mejoraba sustancialmente más ese punto crítico.
const GROSOR_CONTORNO = 6.5;       // "recorte de papel" entre sectores/círculo
const RADIO_FICHA = px(RADIO_FICHA_UNIDADES); // Fase 14.6a: fuente de verdad en geometria-espiral.js
const GROSOR_ANILLO_PROGRESO = 3.5;
const RADIO_BADGE = 8;

const COLOR_ANILLO_NEUTRO = '#9e9e9e';  // dias_siembra_a_cosecha desconocido
const COLOR_PISTA_ANILLO  = '#e0d9c8';  // pista de fondo del anillo de progreso

function crearElemento(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

// Sector anular (arco) o círculo completo (centro) — el contenedor visual
// de la cama, sin plantas todavía.
//
// class 'cama-forma' (Fase 14.7): el hover-scale se engancha AQUÍ, no en
// el `<g class="cama-espiral">` que la envuelve — ese grupo también
// contiene las fichas de planta como hijos, y CSS `:hover` sube a
// ancestros. Si el hover-scale viviera en el grupo completo, pasar el
// mouse sobre UNA ficha dispararía también el hover de la cama entera
// (doble-escala). `forma` es hermana de cada ficha, no ancestra — mismo
// elemento que ya recibe el listener de `onClickCama` un poco más abajo,
// así que el área de hover coincide exactamente con el área de clic.
function crearFormaCama(cama) {
    if (cama.tipo === 'circular') {
        const { radio } = calcularGeometriaCentro();
        return crearElemento('circle', {
            class: 'cama-forma',
            cx: 0, cy: 0, r: px(radio),
            fill: 'var(--color-primario)',
            stroke: 'var(--color-fondo)',
            'stroke-width': GROSOR_CONTORNO,
            'stroke-linejoin': 'round'
        });
    }

    // arco: anillo exterior en --color-secundario, interior en
    // --color-secundario-claro (tokens confirmados en css/variables.css).
    const geo = calcularGeometriaArco(cama.anillo, cama.indiceSegmento);
    const relleno = cama.anillo === 'exterior' ? 'var(--color-secundario)' : 'var(--color-secundario-claro)';

    const p1 = polarACartesiano(geo.anguloInicio, geo.radioInterno);
    const p2 = polarACartesiano(geo.anguloInicio, geo.radioExterno);
    const p3 = polarACartesiano(geo.anguloFin, geo.radioExterno);
    const p4 = polarACartesiano(geo.anguloFin, geo.radioInterno);

    // large-arc-flag por si algún día un segmento superara 180° — con los
    // PARAMS actuales (74°) siempre es 0, pero se calcula, no se asume.
    // sweep-flag=1 en el arco exterior (ángulo creciente = sentido horario
    // en el espacio de pantalla, y-hacia-abajo, de polarACartesiano) y 0 al
    // volver por el interior (ángulo decreciente).
    //
    // El segmento 3 del anillo exterior cruza la costura 0°/360°
    // (anguloInicio=323, anguloFin=397, ver nota en geometria-espiral.js) —
    // no se le aplica `% 360` porque aquí NUNCA se pasa un ángulo crudo a
    // una API SVG: solo se usan las coordenadas cartesianas ya resueltas
    // por polarACartesiano (periódica), así que la costura no afecta nada.
    const largeArc = Math.abs(geo.anguloFin - geo.anguloInicio) > 180 ? 1 : 0;

    const d = [
        `M ${px(p1.x)} ${px(p1.y)}`,
        `L ${px(p2.x)} ${px(p2.y)}`,
        `A ${px(geo.radioExterno)} ${px(geo.radioExterno)} 0 ${largeArc} 1 ${px(p3.x)} ${px(p3.y)}`,
        `L ${px(p4.x)} ${px(p4.y)}`,
        `A ${px(geo.radioInterno)} ${px(geo.radioInterno)} 0 ${largeArc} 0 ${px(p1.x)} ${px(p1.y)}`,
        'Z'
    ].join(' ');

    return crearElemento('path', {
        class: 'cama-forma',
        d,
        fill: relleno,
        stroke: 'var(--color-fondo)',
        'stroke-width': GROSOR_CONTORNO,
        'stroke-linejoin': 'round'
    });
}

// Estado visual de UNA planta: normal / atrasada / semilla / null (sin
// datos). dias_siembra_a_cosecha se resuelve de `catalogo` (Map por
// plantaId) — emoji y color de categoría vienen de plantaTipo, ya
// denormalizado en la propia entrada de plantas[].
//
// Exportada (no solo interna del render): PASO D reutiliza esta misma
// función para la tarjeta de detalle (estado/progreso en días), en vez de
// reimplementar la misma regla ahí — una sola fuente de verdad para
// "¿en qué estado está esta planta?", igual que EMOJI_POR_TIPO/COLOR_POR_TIPO.
//
// `estado`: 'semilla' | 'sin-datos' | 'atrasada' | 'creciendo' — string
// explícito para que quien consuma esto (main.js) no tenga que re-derivarlo
// comparando badge/color.
//
// Precedencia (mutuamente excluyentes): 'semilla' gana siempre, sin
// importar el progreso; si no, null-de-catálogo gana sobre atrasada/normal
// porque sin dias_siembra_a_cosecha no hay progreso que calcular.
export function calcularEstadoFicha(plantaEntry, catalogoPorId) {
    if ((plantaEntry.finalidad || 'cosecha') === 'semilla') {
        return { color: 'var(--color-acento)', fraccion: 1, badge: '🌰', estado: 'semilla', diasTranscurridos: null, diasSiembraACosecha: null };
    }

    const infoCatalogo = catalogoPorId.get(plantaEntry.plantaId);
    const dias = infoCatalogo?.dias_siembra_a_cosecha ?? null;

    // CASO NULL: dias_siembra_a_cosecha ausente/null o plantaId no
    // encontrado en el catálogo — gris neutro, SIN relleno calculado. Nunca
    // se sustituye por un default inventado.
    //
    // fraccion:1 (no 0): con stroke-dasharray, una fracción 0 dibuja un
    // trazo de longitud cero — invisible, indistinguible de una planta
    // normal con 0% de progreso real (p.ej. sembrada hoy mismo). El punto
    // de este estado es que SE VEA gris, así que el anillo se dibuja
    // completo en gris — "sin relleno calculado" significa que no se
    // computa un porcentaje a partir de un default inventado, no que el
    // anillo quede vacío.
    if (dias == null) {
        return { color: COLOR_ANILLO_NEUTRO, fraccion: 1, badge: null, estado: 'sin-datos', diasTranscurridos: null, diasSiembraACosecha: null };
    }

    // 'YYYY-MM-DD' + T00:00:00 fuerza parseo en hora LOCAL — sin la hora
    // explícita, Date trata la fecha como UTC medianoche y en husos
    // horarios negativos (América) el día calculado queda uno antes.
    const fechaSiembra = new Date(`${plantaEntry.fechaSiembra}T00:00:00`);
    const diasTranscurridos = Math.floor((Date.now() - fechaSiembra.getTime()) / 86400000);
    const progreso = diasTranscurridos / dias;

    if (progreso > 1) {
        return { color: 'var(--color-error)', fraccion: 1, badge: '!', estado: 'atrasada', diasTranscurridos, diasSiembraACosecha: dias };
    }
    return { color: colorDePlanta(plantaEntry.plantaTipo), fraccion: Math.max(0, progreso), badge: null, estado: 'creciendo', diasTranscurridos, diasSiembraACosecha: dias };
}

function crearFichaPlanta(cama, plantaEntry, posicion, catalogoPorId, onClickPlanta) {
    const { color, fraccion, badge } = calcularEstadoFicha(plantaEntry, catalogoPorId);

    const grupo = crearElemento('g', {
        transform: `translate(${px(posicion.x)}, ${px(posicion.y)})`,
        class: 'ficha-planta'
    });
    grupo.style.cursor = 'pointer';
    grupo.dataset.camaId = cama.id;
    grupo.dataset.instanciaId = plantaEntry.instanciaId ?? '';

    // Fase 14.7: sub-grupo dedicado SOLO al hover-scale. `grupo` (arriba)
    // ya usa el atributo `transform` de SVG para posicionarse (translate)
    // — un `transform` puesto por CSS en ese MISMO elemento lo
    // reemplazaría por completo (en SVG2 no se combinan, CSS gana sobre
    // el atributo de presentación), y la ficha saltaría al origen del SVG
    // al hacer hover. `escala` no tiene transform de atributo, así que el
    // scale por CSS no choca con nada — y su origen local (0,0) ya
    // coincide con el centro visual de la ficha (el círculo `fondo` está
    // centrado ahí), sin necesitar transform-box:fill-box.
    const escala = crearElemento('g', { class: 'ficha-planta-escala' });

    const fondo = crearElemento('circle', {
        cx: 0, cy: 0, r: RADIO_FICHA,
        fill: 'var(--color-fondo)',
        stroke: COLOR_PISTA_ANILLO,
        'stroke-width': GROSOR_ANILLO_PROGRESO
    });

    const radioAnillo = RADIO_FICHA - GROSOR_ANILLO_PROGRESO / 2;
    const anillo = crearElemento('circle', {
        cx: 0, cy: 0, r: radioAnillo,
        fill: 'none',
        stroke: color,
        'stroke-width': GROSOR_ANILLO_PROGRESO,
        'stroke-linecap': 'round',
        pathLength: 100,
        'stroke-dasharray': `${fraccion * 100} ${100 - fraccion * 100}`,
        // Arranca en las 12 (convención estándar de anillo de progreso) en
        // vez del default de SVG (3 en punto).
        transform: 'rotate(-90)'
    });

    const emoji = crearElemento('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': RADIO_FICHA,
        x: 0, y: 1
    });
    emoji.textContent = emojiDePlanta(plantaEntry.plantaTipo);

    escala.append(fondo, anillo, emoji);

    if (badge) {
        const badgeColor = badge === '🌰' ? 'var(--color-acento)' : 'var(--color-error)';
        const badgeCx = RADIO_FICHA * 0.72;
        const badgeCy = -RADIO_FICHA * 0.72;

        const badgeCirculo = crearElemento('circle', {
            cx: badgeCx, cy: badgeCy, r: RADIO_BADGE,
            fill: badgeColor,
            stroke: 'var(--color-fondo)',
            'stroke-width': 1.5
        });
        const badgeTexto = crearElemento('text', {
            x: badgeCx, y: badgeCy + 1,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': RADIO_BADGE * 1.3,
            fill: badge === '🌰' ? '#221D17' : '#fff',
            'font-weight': 'bold'
        });
        badgeTexto.textContent = badge;

        escala.append(badgeCirculo, badgeTexto);
    }

    grupo.append(escala);

    // Hook para PASO D (tarjeta de detalle) — no se construye aquí todavía.
    grupo.addEventListener('click', (evento) => {
        evento.stopPropagation();
        onClickPlanta(cama, plantaEntry);
    });

    return grupo;
}

function posicionDePlanta(cama, plantaEntry) {
    return cama.tipo === 'circular'
        ? posicionPlantaEnCentro(plantaEntry.angle, plantaEntry.r)
        : posicionPlantaEnArco(cama.anillo, cama.indiceSegmento, plantaEntry.t, plantaEntry.r);
}

// renderEspiralSVG(container, camas, catalogo, opciones)
//
// `catalogo` es un parámetro EXTRA respecto al `renderEspiralSVG(container,
// camas)` de la instrucción original: dias_siembra_a_cosecha se resuelve
// "desde catalogo_semillas por plantaId" (pedido explícito), y este módulo
// no puede tocar Firestore (regla ya establecida al inicio de render.js:
// "no sabe qué es Firestore ... toda la carga de datos vive en main.js").
// Sin este tercer argumento no hay forma de cumplir ambas reglas a la vez;
// main.js debe resolver `catalogo` (obtenerCatalogo()) antes de llamar aquí,
// igual que ya denormaliza plantaNombre/plantaTipo para camas rectangulares.
//
// `opciones.onClickCama`/`onClickPlanta`: mismo patrón de inyección de
// callbacks que renderListaTareas/renderListaCatalogos (render.js). main.js
// siempre pasa ambos (abrirDetalleCama — Fase 14.5 — y abrirDetallePlanta
// — PASO D); estos defaults solo cubren a un caller hipotético que no los
// pase, dejando constancia en consola sin lanzar ni romper el render.
export function renderEspiralSVG(container, camas, catalogo, opciones = {}) {
    const onClickCama = opciones.onClickCama || ((cama) => {
        console.info(`[render-spiral-2d] onClickCama no provisto por el caller: ${cama.id}`);
    });
    const onClickPlanta = opciones.onClickPlanta || ((cama, plantaEntry) => {
        console.info(`[render-spiral-2d] Detalle de planta pendiente (PASO D): ${cama.id} / ${plantaEntry.instanciaId}`);
    });

    // 1. Filtra silenciosamente cualquier cama rectangular (o sin `tipo`)
    // que llegue — main.js ya filtra, este módulo no debe romperse si no lo
    // hace.
    const camasEspiral = camas.filter((c) => c.tipo === 'arco' || c.tipo === 'circular');

    const catalogoPorId = new Map(catalogo.map((p) => [p.id, p]));

    const R = 420; // medio-lado del viewBox, en el mismo espacio "px" que ESCALA/RADIO_FICHA
    const svg = crearElemento('svg', {
        viewBox: `${-R} ${-R} ${2 * R} ${2 * R}`,
        width: '100%',
        height: '100%',
        'aria-label': 'Mapa del huerto en espiral'
    });

    camasEspiral.forEach((cama) => {
        const grupoCama = crearElemento('g', { class: 'cama-espiral', 'data-cama-id': cama.id });
        grupoCama.style.cursor = 'pointer';

        const forma = crearFormaCama(cama);
        forma.addEventListener('click', () => onClickCama(cama));
        grupoCama.appendChild(forma);

        (cama.plantas || []).forEach((plantaEntry) => {
            const posicion = posicionDePlanta(cama, plantaEntry);
            const ficha = crearFichaPlanta(cama, plantaEntry, posicion, catalogoPorId, onClickPlanta);
            grupoCama.appendChild(ficha);
        });

        svg.appendChild(grupoCama);
    });

    container.replaceChildren(svg);
    return svg;
}
