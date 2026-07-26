// js/views/gemelo-drag-drop.js
//
// Drag&drop de plantas del panel lateral hacia el mapa en espiral (Fase
// 14.6b, con los fixes de mobile de la auditoría 2026-07-24: Fase
// 18.3/18.4/18.5). Extraído de vista-gemelo.js (ver comentario de cabecera
// de gemelo-pan-zoom.js para el motivo de la división general).
//
// iniciarPosibleArrastrePlanta recibe `onSoltar` (un callback async) en vez
// de importar iniciarHuerto directamente desde vista-gemelo.js — hacerlo
// crearía un ciclo (vista-gemelo.js ya importa este módulo para usar
// iniciarPosibleArrastrePlanta), y el proyecto evita ciclos entre módulos a
// propósito (mismo criterio que router.js NO conociendo ningún vista-*.js,
// ver AI_CONTEXT.md). El caller (vista-gemelo.js) pasa iniciarHuerto tal
// cual como onSoltar.
//
// Pointer Events (pointerdown/pointermove/pointerup), NUNCA la API de
// drag&drop nativa del navegador (draggable/dragstart/drop) — esa API no
// dispara en touch, y el proyecto es mobile-first desde Fase 13.

import { agregarPlantaACama } from '../services/db.js';
import { mostrarToast } from '../shared/core-ui.js';

// Fase 18.1: bandera que el pan del mapa (gemelo-pan-zoom.js) consulta en
// cada pointermove vía estaArrastrandoPlanta() — prioridad total al
// arrastre de planta, el pan se queda quieto mientras dura (ver
// diagnóstico de la fase).
let arrastrandoPlanta = false;

export function estaArrastrandoPlanta() {
    return arrastrandoPlanta;
}

// Fase 18.4 (auditoría mobile 2026-07-24): antes de esta fase, un solo
// pointerdown por tarjeta arrancaba el arrastre de inmediato — con
// touch-action:none en .plant-card (ver index.html) eso bloqueaba TAMBIÉN
// el scroll horizontal nativo de .gemelo-panel-lista, así que en mobile
// (fila apilada arriba del mapa, ~33 plantas en el catálogo) no había forma
// de deslizar el dedo para ver más plantas: cualquier toque sobre una
// tarjeta quedaba marcado "sin scroll nativo" desde el touchstart, antes de
// que corriera JS. touch-action ahora es pan-x (scroll horizontal nativo
// permitido, vertical no), e iniciarPosibleArrastrePlanta espera a que el
// gesto cruce UMBRAL_ARRASTRE_PLANTA_PX para decidir, por la dirección
// dominante, si es scroll de la lista (horizontal — no hace nada, deja que
// el navegador siga con el pan-x que ya venía haciendo) o arrastre hacia el
// mapa (vertical — recién ahí arranca iniciarArrastrePlanta). Mismo
// criterio de umbral por distancia que ya usa el pan del mapa
// (UMBRAL_PAN_PX en gemelo-pan-zoom.js), aplicado acá también por
// dirección.
const UMBRAL_ARRASTRE_PLANTA_PX = 9;

export function iniciarPosibleArrastrePlanta(evento, plantaId, elementoOrigen, onSoltar) {
    // touch-action solo afecta gestos táctiles/pluma — mouse nunca tuvo el
    // problema de scroll bloqueado (la rueda/scrollbar no pelean con nada
    // acá), así que mouse conserva el comportamiento original de arrancar
    // el arrastre de inmediato. Importa además en desktop (≥720px, layout
    // en fila): ahí el panel scrollea VERTICAL y el mapa queda a la
    // derecha, el eje contrario a mobile — un drag real panel→mapa con
    // mouse puede ser bien horizontal, y esperar "dirección vertical" lo
    // interpretaría como scroll y jamás arrancaría el arrastre.
    if (evento.pointerType === 'mouse') {
        iniciarArrastrePlanta(evento, plantaId, elementoOrigen, onSoltar);
        return;
    }

    const pointerId = evento.pointerId;
    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    let resuelto = false;

    function limpiar() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUpOCancel);
        window.removeEventListener('pointercancel', onPointerUpOCancel);
    }

    function onPointerMove(ev) {
        if (ev.pointerId !== pointerId || resuelto) return;
        const dx = ev.clientX - inicioX;
        const dy = ev.clientY - inicioY;
        if (Math.hypot(dx, dy) < UMBRAL_ARRASTRE_PLANTA_PX) return;

        resuelto = true;
        limpiar();

        // Mismo breakpoint que .gemelo-panel-lista (720px, index.html):
        // bajo eso la lista scrollea horizontal (fila arriba del mapa, ver
        // touch-action:pan-x base), desde ahí scrollea vertical (columna a
        // la izquierda del mapa, ver override touch-action:pan-y dentro del
        // media query) — el eje "es scroll, no arrastre" se invierte según
        // el layout, no es siempre horizontal.
        const esDesktop = window.matchMedia('(min-width: 720px)').matches;
        const esGestoDeScroll = esDesktop
            ? Math.abs(dy) > Math.abs(dx)   // desktop: scroll vertical
            : Math.abs(dx) > Math.abs(dy);  // mobile: scroll horizontal

        if (esGestoDeScroll) return; // ya en curso vía pan-x/pan-y nativo

        // Intención de arrastre hacia el mapa. Se le pasa `ev` (no el
        // pointerdown original) para que el ghost arranque en la posición
        // actual del dedo, no en la de hace varios px de movimiento.
        iniciarArrastrePlanta(ev, plantaId, elementoOrigen, onSoltar);
    }

    function onPointerUpOCancel(ev) {
        if (ev.pointerId !== pointerId) return;
        limpiar();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUpOCancel);
    window.addEventListener('pointercancel', onPointerUpOCancel);
}

function iniciarArrastrePlanta(evento, plantaId, elementoOrigen, onSoltar) {
    evento.preventDefault();

    arrastrandoPlanta = true;

    const ghost = document.createElement('div');
    ghost.className = 'gemelo-drag-ghost';
    ghost.textContent = elementoOrigen.textContent;
    document.body.appendChild(ghost);

    // Fase 18.5 (auditoría mobile 2026-07-24): en touch, el ghost centrado
    // exactamente en clientX/clientY queda tapado por el propio dedo — ni
    // el ghost ni el resaltado .drop-target de la cama se ven mientras se
    // arrastra. Se desplaza el ghost hacia ARRIBA del punto de contacto
    // solo para touch/pen (mouse no tapa nada, sigue centrado como antes).
    // Puramente visual: onPointerMove más abajo sigue pasando
    // ev.clientX/clientY SIN este desplazamiento a elementFromPoint — el
    // drop tiene que sentirse anclado a donde está el dedo, no a donde se
    // ve el ghost.
    const desplazamientoGhostY = evento.pointerType === 'mouse' ? 0 : -70;

    const moverGhost = (x, y) => {
        ghost.style.left = `${x}px`;
        ghost.style.top = `${y + desplazamientoGhostY}px`;
    };
    moverGhost(evento.clientX, evento.clientY);
    elementoOrigen.classList.add('dragging');

    // Cama (.cama-espiral) resaltada bajo el puntero en este momento del
    // arrastre — se recalcula en cada pointermove vía elementFromPoint;
    // .gemelo-drag-ghost tiene pointer-events:none así que nunca se
    // interpone a sí mismo en ese hit-test.
    let camaResaltada = null;

    function onPointerMove(ev) {
        moverGhost(ev.clientX, ev.clientY);

        const elBajoPuntero = document.elementFromPoint(ev.clientX, ev.clientY);
        const camaGrupo = elBajoPuntero ? elBajoPuntero.closest('.cama-espiral') : null;

        if (camaGrupo !== camaResaltada) {
            if (camaResaltada) camaResaltada.classList.remove('drop-target');
            camaResaltada = camaGrupo;
            if (camaResaltada) camaResaltada.classList.add('drop-target');
        }
    }

    async function onPointerUp() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        arrastrandoPlanta = false; // el pan puede retomar de inmediato, no hace falta esperar el guardado
        ghost.remove();
        elementoOrigen.classList.remove('dragging');

        const camaDestino = camaResaltada;
        if (camaDestino) camaDestino.classList.remove('drop-target');
        if (!camaDestino) return; // soltado fuera de cualquier cama — no-op

        const camaId = camaDestino.dataset.camaId;
        try {
            await agregarPlantaACama(camaId, plantaId);
            // Mismo patrón que detallePlantaSemillaBtn tras marcarParaSemilla:
            // await onSoltar() (iniciarHuerto) ANTES del toast, para no
            // dejar ver un instante la espiral vieja sin la ficha nueva (el
            // parpadeo que ya se corrigió en PASO D).
            await onSoltar();
            mostrarToast('Planta agregada', 'green');
        } catch (e) {
            console.error('[gemelo-drag-drop] Error agregando planta a la cama:', e);
            // Mensaje real del error (ej. cama saturada, sin espacio sin
            // traslape) — no uno genérico, a diferencia de otros handlers
            // que sí generalizan; aquí el mensaje de proximaPosicionDisponible
            // es información accionable para quien está sembrando.
            mostrarToast(e.message || 'No se pudo agregar la planta', 'red');
        }
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
}
