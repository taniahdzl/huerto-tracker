// js/views/vista-gemelo.js
//
// El mapa del huerto en espiral: carga de datos (iniciarHuerto — el hub
// central de esta vista), el panel lateral arrastrable de plantas, y los
// dos modales de detalle (cama completa — Fase 14.5/16.5 — y planta
// individual + cierre de cultivo — PASO D/E). Pan/zoom (Fase 18.1) vive en
// gemelo-pan-zoom.js y el drag&drop de plantas sobre la espiral (Fase
// 14.6b, con los fixes de mobile de la auditoría 2026-07-24: Fase
// 18.3/18.4/18.5) vive en gemelo-drag-drop.js — ambos extraídos de este
// archivo porque eran genuinamente autocontenidos (ver sus propios
// comentarios de cabecera). Lo que SIGUE acá, a propósito, no se fragmenta
// más: cada handler de mutación de los modales de detalle existe
// específicamente para refrescar lo que iniciarHuerto()/renderEspiralSVG ya
// pintaron, y abrirDetalleCama/abrirDetallePlanta se pasan como callbacks
// directos a renderEspiralSVG desde DENTRO de esta misma función — ninguna
// de estas piezas es independientemente reusable.
//
// catalogoActual se expone vía getCatalogoActual/setCatalogoActual porque
// vista-catalogos.js también lo lee y lo escribe — ver el comentario de
// cabecera de ese módulo para el porqué (mismo caché compartido que ya
// existía en main.js antes de esta división, no una simplificación nueva).
// camasActuales NO se expone: ningún otro módulo lo necesita hoy.
//
// Extraído de main.js (Fase 19, división en módulos por vista).

import { renderEspiralSVG, calcularEstadoFicha } from '../render/render-spiral-2d.js';
import { emojiDePlanta, crearLeyendaCategorias } from '../render/render.js';
import {
    obtenerCatalogo, obtenerCamas,
    marcarParaSemilla, crearHistorialCultivo,
    actualizarDetalleCama
} from '../services/db.js';
import { mostrarToast, openModal, closeModal, marcarStatusError } from '../shared/core-ui.js';
import { aplicarVistaEspiral, configurarPanZoomEspiral } from './gemelo-pan-zoom.js';
import { iniciarPosibleArrastrePlanta } from './gemelo-drag-drop.js';

const gemeloMapaContainer = document.getElementById('gemeloMapaContainer');
const gemeloMapaWrapper   = document.querySelector('#view-gemelo .gemelo-mapa-wrapper');
const gemeloPanelLista    = document.getElementById('gemeloPanelLista');

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
        // iniciarHuerto se pasa como `onSoltar` — ver comentario de cabecera
        // de gemelo-drag-drop.js para por qué ese módulo no lo importa
        // directo (evitar un ciclo entre los dos archivos).
        card.addEventListener('pointerdown', (e) => iniciarPosibleArrastrePlanta(e, planta.id, card, iniciarHuerto));
        fragment.appendChild(card);
    });

    gemeloPanelLista.replaceChildren(fragment);
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
