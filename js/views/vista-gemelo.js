// js/vista-gemelo.js
//
// El mapa del huerto en espiral: pan/zoom (Fase 18.1), carga de datos
// (iniciarHuerto — el hub central de esta vista), el panel lateral
// arrastrable + drag&drop de plantas sobre la espiral (Fase 14.6b, con los
// fixes de mobile de la auditoría 2026-07-24: Fase 18.3/18.4/18.5), y los
// dos modales de detalle (cama completa — Fase 14.5/16.5 — y planta
// individual + cierre de cultivo — PASO D/E). Se mantiene como un solo
// módulo, no fragmentado por sub-sección, porque ninguna de estas piezas
// fue nunca independientemente reusable entre sí: cada handler de mutación
// de los modales de detalle existe específicamente para refrescar lo que
// iniciarHuerto()/renderEspiralSVG ya pintaron, y abrirDetalleCama/
// abrirDetallePlanta se pasan como callbacks directos a renderEspiralSVG
// desde DENTRO de esta misma función.
//
// catalogoActual se expone vía getCatalogoActual/setCatalogoActual porque
// vista-catalogos.js también lo lee y lo escribe — ver el comentario de
// cabecera de ese módulo para el porqué (mismo caché compartido que ya
// existía en main.js antes de esta división, no una simplificación nueva).
// camasActuales NO se expone: ningún otro módulo lo necesita hoy.
//
// Extraído de main.js (Fase 19, división en módulos por vista).

import { renderEspiralSVG, calcularEstadoFicha } from './render-spiral-2d.js';
import { emojiDePlanta, crearLeyendaCategorias } from './render.js';
import {
    obtenerCatalogo, obtenerCamas,
    agregarPlantaACama, marcarParaSemilla, crearHistorialCultivo,
    actualizarDetalleCama
} from './db.js';
import { mostrarToast, openModal, closeModal, marcarStatusError } from './core-ui.js';

const gemeloMapaContainer = document.getElementById('gemeloMapaContainer');
const gemeloMapaWrapper   = document.querySelector('#view-gemelo .gemelo-mapa-wrapper');
const gemeloPanelLista    = document.getElementById('gemeloPanelLista');
const gemeloZoomInBtn     = document.getElementById('gemeloZoomInBtn');
const gemeloZoomOutBtn    = document.getElementById('gemeloZoomOutBtn');

const dashboardResumenCamas = document.getElementById('dashboardResumenCamas');

const detallePlantaModalClose = document.getElementById('detallePlantaModalClose');
const detallePlantaTitulo     = document.getElementById('detallePlantaTitulo');
const detallePlantaEstado     = document.getElementById('detallePlantaEstado');
const detallePlantaFecha      = document.getElementById('detallePlantaFecha');
const detallePlantaProgreso   = document.getElementById('detallePlantaProgreso');
const detallePlantaPlagas     = document.getElementById('detallePlantaPlagas');
const detallePlantaSemillaBtn   = document.getElementById('detallePlantaSemillaBtn');
const detallePlantaCompletarBtn = document.getElementById('detallePlantaCompletarBtn');

// PASO E: formulario de cierre de cultivo
const detallePlantaCierreForm         = document.getElementById('detallePlantaCierreForm');
const cierreRendimientoTabs           = document.getElementById('cierreRendimientoTabs');
const cierreCantidadInput             = document.getElementById('cierreCantidadInput');
const cierreNotaInput                 = document.getElementById('cierreNotaInput');
const detallePlantaCierreCancelarBtn  = document.getElementById('detallePlantaCierreCancelarBtn');
const detallePlantaCierreConfirmarBtn = document.getElementById('detallePlantaCierreConfirmarBtn');

// ── Detalle de CAMA completa (Fase 14.5, editable desde Fase 16.5) ──
const detalleCamaModalClose  = document.getElementById('detalleCamaModalClose');
const detalleCamaTitulo      = document.getElementById('detalleCamaTitulo');
const detalleCamaNotasInput  = document.getElementById('detalleCamaNotasInput');
const detalleCamaPlagasInput = document.getElementById('detalleCamaPlagasInput');
const detalleCamaGuardarBtn  = document.getElementById('detalleCamaGuardarBtn');

// Leyenda de categorías: contenido fijo, se inserta una sola vez al
// arrancar — a diferencia de renderEspiralSVG, este contenedor NO se
// reemplaza por completo en cada render.
gemeloMapaWrapper.appendChild(crearLeyendaCategorias());

let catalogoActual = [];
let camasActuales   = [];

export function getCatalogoActual() {
    return catalogoActual;
}

export function setCatalogoActual(valor) {
    catalogoActual = valor;
}

// ── Pan/zoom del mapa en espiral (Fase 18.1) ─────────────────────────
//
// El estado {escala, offsetX, offsetY} vive ACÁ, no en render-spiral-2d.js
// — cada llamada a renderEspiralSVG() reemplaza el <svg> por completo
// (container.replaceChildren), así que cualquier estado que viviera solo
// en el viewBox del nodo anterior se perdería en cada re-render (drop de
// planta, marcar semilla, cerrar cultivo — todo pasa por iniciarHuerto()).
// aplicarVistaEspiral()/configurarPanZoomEspiral() se llaman de nuevo
// después de CADA renderEspiralSVG(), sobre el <svg> nuevo.
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

// Fase 14.6b ya usaba `.dragging`/ghost para señalar un arrastre de planta
// en curso, pero no había ninguna bandera que otro gesto pudiera consultar
// — el pan la necesita para quedarse quieto mientras dura un arrastre
// (prioridad total al drag de planta sobre el mapa, nunca al revés, ver
// diagnóstico de la fase). Se declara acá porque iniciarArrastrePlanta
// también vive en este archivo.
let arrastrandoPlanta = false;

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

function aplicarVistaEspiral(svg) {
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
// desmontados dinámicamente mientras dura el gesto — MISMO patrón que ya
// usa iniciarArrastrePlanta, a propósito. La primera versión de esta
// función usaba svg.setPointerCapture(), que parecía la solución más
// "moderna" — pero se verificó con Playwright (ver validación de la fase)
// que retargeta también el `click` sintético posterior al propio <svg> en
// vez de al elemento real bajo el puntero, así que un clic corto sobre
// una cama dejaba de llegarle a `forma`/`grupo` (onClickCama/onClickPlanta
// nunca se disparaban). Sin pointer capture, el click se resuelve normal.
function configurarPanZoomEspiral(svg) {
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
        if (arrastrandoPlanta) return;
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
        if (arrastrandoPlanta) return; // prioridad total al drag de planta
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

// ── Carga de datos ────────────────────────────────────────────────

export async function iniciarHuerto() {
    try {
        const [catalogo, camas] = await Promise.all([obtenerCatalogo(), obtenerCamas()]);
        catalogoActual = catalogo;
        camasActuales  = camas;

        // renderEspiralSVG filtra internamente a arco/circular — se le pasa
        // `camas` completo, mismo dato ya cargado arriba (sin una segunda
        // ida a Firestore).
        const svgEspiral = renderEspiralSVG(gemeloMapaContainer, camas, catalogo, {
            // Fase 14.5: reemplaza el toast "pendiente de construir" —
            // abrirDetalleCama() es la vista de solo lectura que faltaba.
            onClickCama: (cama) => abrirDetalleCama(cama),
            onClickPlanta: (cama, plantaEntry) => abrirDetallePlanta(cama, plantaEntry)
        });
        // Fase 18.1: el <svg> es un nodo nuevo en cada render — el estado
        // de pan/zoom (vistaEspiral) y los listeners que lo manejan se
        // reaplican acá, siempre, sin importar qué disparó este
        // iniciarHuerto() (carga inicial, drop de planta, marcar semilla,
        // cerrar cultivo — todos pasan por esta misma función).
        aplicarVistaEspiral(svgEspiral);
        configurarPanZoomEspiral(svgEspiral);

        // Panel lateral arrastrable (Fase 14.6b) — mismo `catalogo` ya
        // cargado arriba, sin query nueva. Se repinta en cada iniciarHuerto()
        // como el resto: tras un drop exitoso hay que volver a llamar esto
        // de todas formas para que el SVG refleje la planta nueva, así que
        // no vale la pena mantener el panel fuera de ese ciclo.
        renderPanelCatalogoArrastrable(catalogo);

        // Tarjeta 1 del Dashboard (Fase 14.3) — mismo `camas`/`catalogo` ya
        // cargados arriba, sin una tercera ida a Firestore.
        renderResumenCamasDashboard(camas, catalogo);
    } catch (e) {
        console.error('[vista-gemelo] Error cargando datos del huerto:', e);
        marcarStatusError();
        mostrarToast('No se pudo cargar el huerto', 'red');
    }
}

// Tarjeta 1 (Fase 14.3): agrupa TODAS las plantas de camas arco/circular
// por el `estado` que ya calcula calcularEstadoFicha (render-spiral-2d.js,
// función pura reutilizada tal cual, sin duplicarla) — 'atrasada' primero
// (son las que necesitan atención/cosecha), 'creciendo'+'sin-datos' juntas
// como "en proceso" (ninguna de las dos es un estado que requiera acción
// inmediata), 'semilla' al final. Círculos individuales sin clic — el clic
// vive en la tarjeta completa (ver listener del dashboard), navega a
// Gemelo sin abrir ningún detalle específico.
const GRUPOS_RESUMEN_CAMAS = [
    { titulo: 'Para cosechar', estados: ['atrasada'] },
    { titulo: 'En proceso', estados: ['creciendo', 'sin-datos'] },
    { titulo: 'Semilla', estados: ['semilla'] }
];

function renderResumenCamasDashboard(camas, catalogo) {
    const catalogoPorId = new Map(catalogo.map((p) => [p.id, p]));
    const camasEspiral = camas.filter((c) => c.tipo === 'arco' || c.tipo === 'circular');

    const porEstado = { atrasada: [], creciendo: [], 'sin-datos': [], semilla: [] };
    camasEspiral.forEach((cama) => {
        (cama.plantas || []).forEach((plantaEntry) => {
            const info = calcularEstadoFicha(plantaEntry, catalogoPorId);
            porEstado[info.estado].push({ plantaEntry, info });
        });
    });

    dashboardResumenCamas.replaceChildren();

    GRUPOS_RESUMEN_CAMAS.forEach(({ titulo, estados }) => {
        const items = estados.flatMap((estado) => porEstado[estado]);

        const grupo = document.createElement('div');
        grupo.className = 'dashboard-resumen-grupo';

        const encabezado = document.createElement('span');
        encabezado.className = 'dashboard-resumen-grupo-titulo';
        encabezado.textContent = `${titulo} (${items.length})`;
        grupo.appendChild(encabezado);

        if (items.length === 0) {
            const vacio = document.createElement('span');
            vacio.className = 'dashboard-resumen-vacio';
            vacio.textContent = '—';
            grupo.appendChild(vacio);
        } else {
            const fichas = document.createElement('div');
            fichas.className = 'dashboard-resumen-fichas';
            items.forEach(({ plantaEntry, info }) => {
                const ficha = document.createElement('span');
                ficha.className = 'mini-ficha';
                ficha.style.borderColor = info.color;

                const emoji = document.createElement('span');
                emoji.className = 'mini-ficha-emoji';
                emoji.textContent = emojiDePlanta(plantaEntry.plantaTipo);
                ficha.appendChild(emoji);

                // Mismo lenguaje visual que crearFichaPlanta (render-spiral-2d.js):
                // el badge es un círculo pequeño superpuesto en la esquina, nunca
                // reemplaza el emoji central.
                if (info.badge) {
                    const badge = document.createElement('span');
                    badge.className = `mini-ficha-badge ${info.badge === '⏳' ? 'mini-ficha-badge-semilla' : 'mini-ficha-badge-atrasada'}`;
                    badge.textContent = info.badge;
                    ficha.appendChild(badge);
                }

                fichas.appendChild(ficha);
            });
            grupo.appendChild(fichas);
        }

        dashboardResumenCamas.appendChild(grupo);
    });
}

// ── Panel lateral arrastrable + drag & drop sobre la espiral (Fase 14.6b) ──
//
// Reutiliza .plant-card/.plant-icon/.plant-info/.plant-name (mismas clases
// que pintaba el viejo renderCatalogo del layout pre-SPA — ver render.js)
// en vez de inventar un componente nuevo; esas clases ya traían cursor:grab
// y .dragging preparados desde #appRoot, que nunca llegó a conectarse a una
// interacción real y se retiró por completo en Fase 15 — el CSS de estas
// clases sobrevivió esa limpieza precisamente porque este panel las usa.
function renderPanelCatalogoArrastrable(catalogo) {
    if (!gemeloPanelLista) return;
    const fragment = document.createDocumentFragment();

    catalogo.forEach((planta) => {
        const tipo = (planta.tipo || 'desconocido').trim().toLowerCase();

        const card = document.createElement('div');
        card.className = 'plant-card';
        card.dataset.plantId = planta.id;

        const icon = document.createElement('div');
        icon.className = 'plant-icon';
        icon.textContent = emojiDePlanta(tipo);

        const info = document.createElement('div');
        info.className = 'plant-info';
        const name = document.createElement('div');
        name.className = 'plant-name';
        name.textContent = planta.nombre || 'Sin nombre';
        info.appendChild(name);

        card.append(icon, info);
        card.addEventListener('pointerdown', (e) => iniciarPosibleArrastrePlanta(e, planta.id, card));
        fragment.appendChild(card);
    });

    gemeloPanelLista.replaceChildren(fragment);
}

// Pointer Events (pointerdown/pointermove/pointerup), NUNCA la API de
// drag&drop nativa del navegador (draggable/dragstart/drop) — esa API no
// dispara en touch, y el proyecto es mobile-first desde Fase 13.
//
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
// (UMBRAL_PAN_PX), aplicado acá también por dirección.
const UMBRAL_ARRASTRE_PLANTA_PX = 9;

function iniciarPosibleArrastrePlanta(evento, plantaId, elementoOrigen) {
    // touch-action solo afecta gestos táctiles/pluma — mouse nunca tuvo el
    // problema de scroll bloqueado (la rueda/scrollbar no pelean con nada
    // acá), así que mouse conserva el comportamiento original de arrancar
    // el arrastre de inmediato. Importa además en desktop (≥720px, layout
    // en fila): ahí el panel scrollea VERTICAL y el mapa queda a la
    // derecha, el eje contrario a mobile — un drag real panel→mapa con
    // mouse puede ser bien horizontal, y esperar "dirección vertical" lo
    // interpretaría como scroll y jamás arrancaría el arrastre.
    if (evento.pointerType === 'mouse') {
        iniciarArrastrePlanta(evento, plantaId, elementoOrigen);
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
        iniciarArrastrePlanta(ev, plantaId, elementoOrigen);
    }

    function onPointerUpOCancel(ev) {
        if (ev.pointerId !== pointerId) return;
        limpiar();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUpOCancel);
    window.addEventListener('pointercancel', onPointerUpOCancel);
}

function iniciarArrastrePlanta(evento, plantaId, elementoOrigen) {
    evento.preventDefault();

    // Fase 18.1: bandera que el pan del mapa consulta en cada pointermove
    // — prioridad total al arrastre de planta, el pan se queda quieto
    // mientras dura (ver diagnóstico de la fase).
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
            // await iniciarHuerto() ANTES del toast, para no dejar ver un
            // instante la espiral vieja sin la ficha nueva (el parpadeo que
            // ya se corrigió en PASO D).
            await iniciarHuerto();
            mostrarToast('Planta agregada', 'green');
        } catch (e) {
            console.error('[vista-gemelo] Error agregando planta a la cama:', e);
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

// ── Detalle de CAMA completa en espiral (Fase 14.5) ─────────────────
// Reemplaza el toast "pendiente de construir" que tenía onClickCama desde
// PASO C. NO es el formulario completo de creación/edición de camas
// arco/circular (tipo/anillo/indiceSegmento siguen sin editor) — Fase 16.5
// solo agrega notas/plagas, mismo criterio ya confirmado.
//
// detalleCamaActual (Fase 16.5): a diferencia del diagnóstico original de
// 14.5 ("sin estado propio, no hay botones de acción que necesiten
// recordar sobre qué cama actuar"), ahora SÍ hace falta — el botón Guardar
// necesita saber sobre qué documento escribir. Solo se usa `.id`; no hace
// falta guardar una copia separada de notas/plagas porque los <textarea>
// ya son la fuente de verdad mientras el modal está abierto.
let detalleCamaActual = null;

function abrirDetalleCama(cama) {
    detalleCamaActual = cama;
    detalleCamaTitulo.textContent = cama.nombre || cama.id;
    detalleCamaNotasInput.value = cama.notas || '';
    detalleCamaPlagasInput.value = cama.plagas || '';
    openModal('detalleCamaModal');
}

detalleCamaModalClose.addEventListener('click', () => closeModal('detalleCamaModal'));

async function handleGuardarDetalleCama() {
    if (!detalleCamaActual) return;

    const notas = detalleCamaNotasInput.value.trim();
    const plagas = detalleCamaPlagasInput.value.trim();

    detalleCamaGuardarBtn.disabled = true;
    try {
        // Payload SOLO { notas, plagas } — mismo criterio de merge parcial
        // ya establecido con actualizarInventario, para no pisar tipo/
        // anillo/indiceSegmento/plantas por accidente.
        await actualizarDetalleCama(detalleCamaActual.id, { notas, plagas });
        // Mismo orden anti-parpadeo ya establecido (agregarPlantaACama,
        // cierre de cultivo): await iniciarHuerto() ANTES del toast, para
        // que camasActuales/el render en espiral ya reflejen el cambio
        // cuando el usuario vea la confirmación — incluye el `cama.plagas`
        // de solo lectura que ya se mostraba en detallePlantaModal.
        await iniciarHuerto();
        mostrarToast('Cama actualizada', 'green');
    } catch (e) {
        console.error('[vista-gemelo] Error actualizando la cama:', e);
        mostrarToast(e.message || 'No se pudo actualizar la cama', 'red');
    } finally {
        detalleCamaGuardarBtn.disabled = false;
    }
}

detalleCamaGuardarBtn.addEventListener('click', handleGuardarDetalleCama);

// ── Detalle de planta en espiral (PASO D) ───────────────────────────
// { cama, plantaEntry } de la tarjeta actualmente abierta, o null — los
// handlers de los botones lo necesitan para saber sobre qué instanciaId
// actuar sin volver a buscarlo en el DOM.
let detalleActual = null;

const NOMBRE_ESTADO_PLANTA = {
    semilla:     'Marcada para semilla',
    'sin-datos': 'Sin datos de ciclo de cultivo',
    atrasada:    'Atrasada',
    creciendo:   'Creciendo'
};

// NPK (cama.suelo) NO se muestra aquí a propósito — fuera de alcance hasta
// que exista un sistema real de riesgo nutricional (ver comentario del
// modal en index.html).
function abrirDetallePlanta(cama, plantaEntry) {
    detalleActual = { cama, plantaEntry };

    const infoCatalogo = catalogoActual.find((p) => p.id === plantaEntry.plantaId);
    // Mismo Map por-llamada que arma renderEspiralSVG internamente — no hay
    // caché compartida porque catalogoActual puede haber cambiado entre
    // renders y este Map es barato de reconstruir.
    const catalogoPorId = new Map(catalogoActual.map((p) => [p.id, p]));
    const estadoInfo = calcularEstadoFicha(plantaEntry, catalogoPorId);

    detallePlantaTitulo.textContent = `${emojiDePlanta(plantaEntry.plantaTipo)} ${infoCatalogo?.nombre || plantaEntry.plantaId}`;
    detallePlantaEstado.textContent = NOMBRE_ESTADO_PLANTA[estadoInfo.estado];
    // estadoInfo.color ya es un valor CSS válido tal cual (hex o var(...)) —
    // mismo valor que usa el anillo de progreso en render-spiral-2d.js.
    detallePlantaEstado.style.color = estadoInfo.color;

    detallePlantaFecha.textContent = `Sembrada: ${plantaEntry.fechaSiembra}`;

    if (estadoInfo.estado === 'sin-datos') {
        // El campo de estado ya dice "Sin datos de ciclo de cultivo" —
        // mostrar un segundo texto aquí con otras palabras sería el mismo
        // dato dos veces, no información nueva. Se oculta, mismo criterio
        // que detallePlantaPlagas.
        detallePlantaProgreso.style.display = 'none';
    } else if (estadoInfo.diasTranscurridos != null) {
        detallePlantaProgreso.textContent = `${estadoInfo.diasTranscurridos} de ${estadoInfo.diasSiembraACosecha} días`;
        detallePlantaProgreso.style.display = '';
    } else {
        // estado 'semilla': calcularEstadoFicha tampoco calcula progreso
        // aquí (el anillo no lo necesita — "sin importar cuánto haya
        // pasado"), pero por una razón DISTINTA a 'sin-datos' (sí hay
        // dias_siembra_a_cosecha en el catálogo, solo no se usó). Se oculta
        // igual por ahora — no pedido explícitamente, señalado en el chat.
        detallePlantaProgreso.style.display = 'none';
    }

    if (cama.plagas) {
        detallePlantaPlagas.textContent = `🐛 Plagas en esta cama: ${cama.plagas}`;
        detallePlantaPlagas.style.display = '';
    } else {
        detallePlantaPlagas.style.display = 'none';
    }

    const marcadaParaSemilla = (plantaEntry.finalidad || 'cosecha') === 'semilla';
    detallePlantaSemillaBtn.textContent = marcadaParaSemilla ? '🔙 Volver a modo cosecha' : '🌰 Marcar para semilla';

    // Cada apertura arranca con el formulario de cierre colapsado, aunque
    // el modal se haya dejado abierto a medio llenar en una planta anterior
    // — sin esto, abrir el detalle de OTRA planta podría heredar el estado
    // de formulario de la última que se estaba cerrando.
    ocultarFormularioCierre();

    openModal('detallePlantaModal');
}

detallePlantaModalClose.addEventListener('click', () => closeModal('detallePlantaModal'));

detallePlantaSemillaBtn.addEventListener('click', async () => {
    if (!detalleActual) return;
    const { cama, plantaEntry } = detalleActual;

    detallePlantaSemillaBtn.disabled = true;
    try {
        await marcarParaSemilla(cama.id, plantaEntry.instanciaId);
        // Refresca camasActuales/catalogoActual y vuelve a pintar ambos
        // mapas (rectangular + espiral) — mismo patrón que handleSaveBed.
        // closeModal va DESPUÉS de este await, no antes: el usuario debe
        // ver el modal cerrarse ya con la espiral actualizada detrás, no
        // con la ficha vieja (badge rojo, etc.) todavía visible durante el
        // round-trip — mismo cuidado que ya aplicamos con el parpadeo
        // Splash/Dashboard y el disabled de botones en escrituras en vuelo.
        await iniciarHuerto();
        closeModal('detallePlantaModal');
        mostrarToast('Actualizado', 'green');
    } catch (e) {
        console.error('[vista-gemelo] Error marcando para semilla:', e);
        mostrarToast('No se pudo actualizar la planta', 'red');
    } finally {
        detallePlantaSemillaBtn.disabled = false;
    }
});

// ── PASO E: formulario de cierre de cultivo ─────────────────────────
// Sub-formulario dentro del mismo detallePlantaModal (ver diagnóstico) en
// vez de un modal separado — oculta los dos botones de acción y muestra el
// selector de rendimiento + campos opcionales; "Confirmar cierre" nace
// disabled hasta que se elige un rendimiento (cantidadObtenida/notaCierre
// pueden quedar vacíos, según el pedido).
function ocultarFormularioCierre() {
    detallePlantaCierreForm.style.display = 'none';
    detallePlantaSemillaBtn.style.display = '';
    detallePlantaCompletarBtn.style.display = '';

    cierreRendimientoTabs.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
    cierreCantidadInput.value = '';
    cierreNotaInput.value = '';
    detallePlantaCierreConfirmarBtn.disabled = true;
}

function mostrarFormularioCierre() {
    detallePlantaSemillaBtn.style.display = 'none';
    detallePlantaCompletarBtn.style.display = 'none';
    detallePlantaCierreForm.style.display = '';
}

detallePlantaCompletarBtn.addEventListener('click', () => {
    if (!detalleActual) return;
    mostrarFormularioCierre();
});

detallePlantaCierreCancelarBtn.addEventListener('click', () => {
    ocultarFormularioCierre();
});

cierreRendimientoTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    cierreRendimientoTabs.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    detallePlantaCierreConfirmarBtn.disabled = false;
});

detallePlantaCierreConfirmarBtn.addEventListener('click', async () => {
    if (!detalleActual) return;
    const { cama, plantaEntry } = detalleActual;
    const rendimientoBtn = cierreRendimientoTabs.querySelector('.filter-tab.active');
    if (!rendimientoBtn) return; // el botón está disabled sin selección, esto no debería disparar

    detallePlantaCierreConfirmarBtn.disabled = true;
    try {
        // plantaEntry se pasa TAL CUAL (no se reconstruye ningún campo a
        // mano) — crearHistorialCultivo saca fechaSiembra/plantaId/
        // plantaTipo/finalidad de ahí mismo (ver diagnóstico), así que
        // fechaSiembra queda preservada sin que este handler la toque.
        // fechaFinalizacion la genera crearHistorialCultivo con
        // serverTimestamp() — tampoco hay que pasarla.
        await crearHistorialCultivo({
            camaId: cama.id,
            plantaEntry,
            rendimiento: rendimientoBtn.dataset.rendimiento,
            cantidadObtenida: cierreCantidadInput.value.trim() || null,
            notaCierre: cierreNotaInput.value.trim() || null
        });
        // Mismo orden anti-parpadeo que detallePlantaSemillaBtn: refresca
        // ANTES de cerrar el modal.
        await iniciarHuerto();
        closeModal('detallePlantaModal');
        mostrarToast('Cultivo cerrado', 'green');
    } catch (e) {
        console.error('[vista-gemelo] Error cerrando cultivo:', e);
        // Mensaje real del error (ej. "Esa planta ya no está en la cama"
        // si alguien más ya la cerró) — formulario sigue abierto para
        // reintentar, closeModal NO se llama en este branch.
        mostrarToast(e.message || 'No se pudo cerrar el cultivo', 'red');
    } finally {
        detallePlantaCierreConfirmarBtn.disabled = false;
    }
});
