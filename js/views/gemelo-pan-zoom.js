// js/views/gemelo-pan-zoom.js
//
// Pan (arrastre de 1 dedo/mouse) y zoom (rueda / pellizco de 2 dedos /
// botones ±) del mapa en espiral (Fase 18.1). Extraído de vista-gemelo.js
// (que hasta ahora concentraba pan/zoom + drag&drop de plantas + carga de
// datos + modales de detalle en un solo archivo de 871 líneas) porque esta
// pieza es genuinamente autocontenida: solo opera sobre el nodo <svg> que
// recibe como parámetro y no conoce Firestore, catálogo ni camas.
//
// Única dependencia cruzada: estaArrastrandoPlanta() (gemelo-drag-drop.js)
// — el pan debe quedarse quieto por completo mientras dura un arrastre de
// planta (prioridad total al drag sobre el mapa, nunca al revés, ver
// diagnóstico de la fase 18.1 original). Dirección única (este módulo
// importa de gemelo-drag-drop.js, nunca al revés) — mismo criterio "sin
// ciclos entre módulos" ya documentado para router.js/vista-*.js en
// AI_CONTEXT.md.

import { estaArrastrandoPlanta } from './gemelo-drag-drop.js';

const gemeloMapaContainer = document.getElementById('gemeloMapaContainer');
const gemeloZoomInBtn     = document.getElementById('gemeloZoomInBtn');
const gemeloZoomOutBtn    = document.getElementById('gemeloZoomOutBtn');

// El estado {escala, offsetX, offsetY} vive ACÁ, no en render-spiral-2d.js
// — cada llamada a renderEspiralSVG() reemplaza el <svg> por completo
// (container.replaceChildren), así que cualquier estado que viviera solo
// en el viewBox del nodo anterior se perdería en cada re-render (drop de
// planta, marcar semilla, cerrar cultivo — todo pasa por iniciarHuerto()).
// aplicarVistaEspiral()/configurarPanZoomEspiral() se llaman de nuevo
// después de CADA renderEspiralSVG(), sobre el <svg> nuevo — el caller
// (vista-gemelo.js) es responsable de eso, este módulo no sabe cuándo
// ocurre un render.
//
// R_MAPA debe coincidir con la constante `R` de render-spiral-2d.js — no
// se importa de ahí porque ese módulo no expone su viewBox base como
// valor público (es un detalle interno de cómo arma el <svg>), así que se
// duplica aquí de forma literal y documentada, mismo criterio ya usado
// para ESCALA/RADIO_FICHA_PX entre geometria-espiral.js y
// render-spiral-2d.js.
const R_MAPA = 420;
const ESCALA_MIN = 1;   // no se puede alejar más allá de la vista original
const ESCALA_MAX = 4;
const UMBRAL_PAN_PX = 9; // 8-10px pedido — punto medio del rango

let vistaEspiral = { escala: 1, offsetX: 0, offsetY: 0 };

function clampVistaEspiral() {
    vistaEspiral.escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, vistaEspiral.escala));
    // El pan nunca puede alejarse tanto que el viewBox salga del cuadro
    // [-R_MAPA, R_MAPA] original — maxOffset = R*(1 - 1/escala) garantiza
    // que ambos bordes del viewBox (offset ± R/escala) queden siempre
    // dentro de ese cuadro. En escala=1 (sin zoom) maxOffset=0: no hay
    // pan posible sin zoom, correcto — no hay nada "extra" a donde
    // desplazarse si ya se ve todo el contenido.
    const maxOffset = R_MAPA * (1 - 1 / vistaEspiral.escala);
    vistaEspiral.offsetX = Math.min(maxOffset, Math.max(-maxOffset, vistaEspiral.offsetX));
    vistaEspiral.offsetY = Math.min(maxOffset, Math.max(-maxOffset, vistaEspiral.offsetY));
}

export function aplicarVistaEspiral(svg) {
    if (!svg) return;
    const mitad = R_MAPA / vistaEspiral.escala;
    svg.setAttribute('viewBox', `${vistaEspiral.offsetX - mitad} ${vistaEspiral.offsetY - mitad} ${2 * mitad} ${2 * mitad}`);
}

// Convierte un punto de pantalla (clientX/clientY) a coordenadas del
// espacio SVG nativo, usando el viewBox y el tamaño real renderizado del
// <svg> — necesario para el pan (convertir px de pantalla a unidades SVG)
// y el zoom hacia el cursor/centro del pellizco (saber qué punto del mapa
// debe quedarse fijo bajo el puntero).
function pantallaASvg(clientX, clientY, svg) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
        x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
        y: vb.y + ((clientY - rect.top) / rect.height) * vb.height
    };
}

function zoomHacia(clientX, clientY, svg, nuevaEscala) {
    // Fija el punto (clientX,clientY) bajo el cursor/pellizco antes y
    // después del cambio de escala — sin esto, hacer zoom siempre
    // "empujaría" el mapa hacia el centro en vez de sentirse anclado a
    // donde apunta el usuario.
    const antes = pantallaASvg(clientX, clientY, svg);
    vistaEspiral.escala = nuevaEscala;
    clampVistaEspiral();
    aplicarVistaEspiral(svg);
    const despues = pantallaASvg(clientX, clientY, svg);
    vistaEspiral.offsetX += antes.x - despues.x;
    vistaEspiral.offsetY += antes.y - despues.y;
    clampVistaEspiral();
    aplicarVistaEspiral(svg);
}

// (Re)configura pan (arrastre de un puntero), zoom con rueda y pellizco
// (dos punteros) sobre un <svg> — se llama de nuevo en cada render porque
// el <svg> es un nodo nuevo cada vez (ver comentario de cabecera).
//
// pointermove/pointerup/pointercancel viven en `window`, montados/
// desmontados dinámicamente mientras dura el gesto — MISMO patrón que usa
// iniciarArrastrePlanta (gemelo-drag-drop.js), a propósito. La primera
// versión de esta función usaba svg.setPointerCapture(), que parecía la
// solución más "moderna" — pero se verificó con Playwright (ver
// validación de la fase) que retargeta también el `click` sintético
// posterior al propio <svg> en vez de al elemento real bajo el puntero,
// así que un clic corto sobre una cama dejaba de llegarle a
// `forma`/`grupo` (onClickCama/onClickPlanta nunca se disparaban). Sin
// pointer capture, el click se resuelve normal.
export function configurarPanZoomEspiral(svg) {
    if (!svg) return;

    // pointerId -> {x, y} de cada puntero activo — 1 entrada = pan de un
    // dedo/mouse, 2 entradas = pellizco. Un Map, no un array, porque el
    // pointerId de quien se levanta primero no es necesariamente el que
    // arrancó el gesto.
    const punteros = new Map();
    let panActivo = false;
    let panCruzoUmbral = false;
    let panInicioX = 0;
    let panInicioY = 0;
    let pellizcoActivo = false;
    let pellizcoDistanciaInicial = 0;
    let pellizcoEscalaInicial = 1;
    let listenersGlobalesMontados = false;

    function distanciaEntrePunteros() {
        const [a, b] = [...punteros.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function centroEntrePunteros() {
        const [a, b] = [...punteros.values()];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function onPointerMove(e) {
        if (estaArrastrandoPlanta()) return;
        if (!punteros.has(e.pointerId)) return;
        const anterior = punteros.get(e.pointerId);
        punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pellizcoActivo && punteros.size === 2) {
            const distanciaActual = distanciaEntrePunteros();
            const factor = distanciaActual / pellizcoDistanciaInicial;
            const centro = centroEntrePunteros();
            zoomHacia(centro.x, centro.y, svg, pellizcoEscalaInicial * factor);
            return;
        }

        if (panActivo && punteros.size === 1) {
            const distDesdeInicio = Math.hypot(e.clientX - panInicioX, e.clientY - panInicioY);
            if (distDesdeInicio > UMBRAL_PAN_PX) panCruzoUmbral = true;
            if (!panCruzoUmbral) return; // bajo el umbral: no mover nada todavía, podría ser un clic

            const dx = e.clientX - anterior.x;
            const dy = e.clientY - anterior.y;
            // px de pantalla -> unidades SVG, usando el ancho actual del
            // viewBox contra el ancho real renderizado (cuadrado, mismo
            // factor para X e Y). Arrastrar a la derecha debe mover el
            // CONTENIDO a la derecha (manipulación directa), por eso resta.
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox.baseVal;
            const factorPxAUnidades = vb.width / rect.width;
            vistaEspiral.offsetX -= dx * factorPxAUnidades;
            vistaEspiral.offsetY -= dy * factorPxAUnidades;
            clampVistaEspiral();
            aplicarVistaEspiral(svg);
        }
    }

    function montarListenersGlobales() {
        if (listenersGlobalesMontados) return;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUpOCancel);
        window.addEventListener('pointercancel', onPointerUpOCancel);
        listenersGlobalesMontados = true;
    }
    function desmontarListenersGlobales() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUpOCancel);
        window.removeEventListener('pointercancel', onPointerUpOCancel);
        listenersGlobalesMontados = false;
    }

    function onPointerUpOCancel(e) {
        punteros.delete(e.pointerId);
        if (punteros.size < 2) pellizcoActivo = false;
        if (punteros.size === 0) {
            panActivo = false;
            desmontarListenersGlobales();
        }
    }

    svg.addEventListener('pointerdown', (e) => {
        if (estaArrastrandoPlanta()) return; // prioridad total al drag de planta
        punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
        montarListenersGlobales();

        if (punteros.size === 1) {
            panActivo = true;
            panCruzoUmbral = false;
            panInicioX = e.clientX;
            panInicioY = e.clientY;
        } else if (punteros.size === 2) {
            // Un segundo puntero llegó a mitad de un pan de un dedo — se
            // pausa el pan (no lo cancela: si un dedo se levanta, el pan
            // NO se reanuda automáticamente con el dedo que queda, evita
            // un salto brusco) y arranca el pellizco.
            panActivo = false;
            pellizcoActivo = true;
            pellizcoDistanciaInicial = distanciaEntrePunteros();
            pellizcoEscalaInicial = vistaEspiral.escala;
        }
    });

    // Suprime el click sintético que el navegador dispara después de un
    // pointerup si el gesto cruzó el umbral — sin esto, soltar tras un pan
    // largo sobre una cama abriría igual su modal de notas. Fase de
    // CAPTURA (tercer argumento `true`): corre antes de que el evento
    // llegue a los listeners de clic de onClickCama/onClickPlanta (que
    // están en fase de burbuja, más profundo en el árbol — forma/grupo
    // dentro de cada <g class="cama-espiral">), así que detenerlo acá
    // nunca deja que lleguen a dispararse.
    svg.addEventListener('click', (e) => {
        if (panCruzoUmbral) {
            e.stopPropagation();
            e.preventDefault();
        }
        panCruzoUmbral = false; // listo para el próximo gesto
    }, true);

    // Rueda del mouse (desktop) — zoom hacia el cursor. preventDefault +
    // passive:false para que la página no haga scroll mientras se hace
    // zoom sobre el mapa.
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        zoomHacia(e.clientX, e.clientY, svg, vistaEspiral.escala * factor);
    }, { passive: false });
}

function zoomBotonEspiral(factor) {
    const svg = gemeloMapaContainer.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Sin cursor/dedo real, el zoom por botón ancla al centro visible del
    // mapa — mismo mecanismo (zoomHacia) que rueda/pellizco, solo con un
    // punto de referencia distinto.
    zoomHacia(rect.left + rect.width / 2, rect.top + rect.height / 2, svg, vistaEspiral.escala * factor);
}

gemeloZoomInBtn.addEventListener('click', () => zoomBotonEspiral(1.4));
gemeloZoomOutBtn.addEventListener('click', () => zoomBotonEspiral(1 / 1.4));
