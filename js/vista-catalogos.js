// js/vista-catalogos.js
//
// Vista de Catálogos (Fase 13.6b) — 3 subcategorías (semillas, químicos,
// herramientas) sobre 2 colecciones de Firestore (catalogo_semillas,
// catalogo_quimicos, inventario_general filtrado a categoria==='herramienta'
// en el cliente — colección chica hoy, ver nota en handleGuardarHerramienta
// si algún día crece).
//
// Asimetría real de permisos (matriz de RBAC del equipo, no una
// simplificación): Semillas y Químicos → cualquier autenticado edita/crea,
// solo admin elimina. Herramientas → solo admin en los tres verbos, sin
// excepción — un no-admin ahí es de solo lectura completa.
//
// El caché de semillas (getCatalogoActual/setCatalogoActual) NO es privado
// de este módulo — se comparte con vista-gemelo.js, que también lo lee
// (abrirDetallePlanta) y lo escribe (iniciarHuerto): ambos módulos
// terminan pidiendo la misma colección (catalogo_semillas) de forma
// independiente y escriben al mismo caché, tal como ya pasaba en main.js
// antes de esta división — no es una simplificación nueva, es preservar el
// comportamiento exacto de antes (editar una semilla acá se refleja de
// inmediato si luego se abre el detalle de una planta en Gemelo, sin
// esperar a la próxima carga del mapa). Extraído de main.js (Fase 19,
// división en módulos por vista).

import {
    obtenerCatalogo, crearCatalogo, actualizarCatalogo, eliminarCatalogo,
    obtenerQuimicos, crearQuimico, actualizarQuimico, eliminarQuimico,
    obtenerInventario, crearInventario, actualizarInventario, eliminarInventario
} from './db.js';
import { renderListaCatalogos, crearLeyendaCategorias } from './render.js';
import { mostrarToast, openModal, closeModal } from './core-ui.js';
import { navegarA } from './router.js';
import { getEsAdminActual } from './estado-app.js';
import { getCatalogoActual, setCatalogoActual } from './vista-gemelo.js';

const viewCatalogosToolbar = document.querySelector('#view-catalogos .view-catalogos-toolbar');
const catalogosLista     = document.getElementById('catalogosLista');
const catalogosBusqueda  = document.getElementById('catalogosBusqueda');
const agregarCatalogoBtn = document.getElementById('agregarCatalogoBtn');
const catalogosTabs      = document.querySelectorAll('#view-catalogos .filter-tab');

const semillaModalClose  = document.getElementById('semillaModalClose');
const semillaModalTitle  = document.getElementById('semillaModalTitle');
const semillaNombreInput = document.getElementById('semillaNombreInput');
const semillaTipoInput   = document.getElementById('semillaTipoInput');
const semillaDiasInput   = document.getElementById('semillaDiasInput');
const semillaSaveBtn     = document.getElementById('semillaSaveBtn');

const quimicoModalClose  = document.getElementById('quimicoModalClose');
const quimicoModalTitle  = document.getElementById('quimicoModalTitle');
const quimicoNombreInput = document.getElementById('quimicoNombreInput');
const quimicoNotasInput  = document.getElementById('quimicoNotasInput');
const quimicoSaveBtn     = document.getElementById('quimicoSaveBtn');

const herramientaModalClose    = document.getElementById('herramientaModalClose');
const herramientaModalTitle    = document.getElementById('herramientaModalTitle');
const herramientaNombreInput   = document.getElementById('herramientaNombreInput');
const herramientaCantidadInput = document.getElementById('herramientaCantidadInput');
const herramientaSaveBtn       = document.getElementById('herramientaSaveBtn');

// Leyenda de categorías: contenido fijo (EMOJI_POR_TIPO/COLOR_POR_TIPO, no
// datos de Firestore), se inserta una sola vez al arrancar — a diferencia
// de renderListaCatalogos, este contenedor NO se reemplaza por completo en
// cada render, así que no hace falta re-insertarla.
viewCatalogosToolbar.appendChild(crearLeyendaCategorias());

let quimicosActuales   = [];
let inventarioActual   = [];
let tabCatalogosActual = 'semillas'; // 'semillas' | 'quimicos' | 'herramientas'
let editandoCatalogoId = null;

export function irAVistaCatalogos() {
    navegarA('view-catalogos');
    cargarYRenderizarVistaCatalogos();
}

async function cargarYRenderizarVistaCatalogos() {
    try {
        const [semillas, quimicos, inventario] = await Promise.all([
            obtenerCatalogo(), obtenerQuimicos(), obtenerInventario()
        ]);
        setCatalogoActual(semillas);
        quimicosActuales = quimicos;
        inventarioActual = inventario;
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[vista-catalogos] Error cargando catálogos:', e);
        mostrarToast('No se pudieron cargar los catálogos', 'red');
    }
}

function renderizarVistaCatalogos() {
    const termino = catalogosBusqueda.value.trim().toLowerCase();
    const esAdminActual = getEsAdminActual();

    let items, puedeEditar, puedeCrear, puedeEliminar;

    if (tabCatalogosActual === 'semillas') {
        items = getCatalogoActual();
        puedeEditar = true;
        puedeCrear = true;
        puedeEliminar = esAdminActual;
    } else if (tabCatalogosActual === 'quimicos') {
        items = quimicosActuales;
        puedeEditar = true;
        puedeCrear = true;
        puedeEliminar = esAdminActual;
    } else {
        // Herramientas: solo-admin en los tres verbos, sin excepción.
        items = inventarioActual.filter((i) => i.categoria === 'herramienta');
        puedeEditar = esAdminActual;
        puedeCrear = esAdminActual;
        puedeEliminar = esAdminActual;
    }

    const filtrados = termino
        ? items.filter((i) => (i.nombre || '').toLowerCase().includes(termino))
        : items;

    agregarCatalogoBtn.style.display = puedeCrear ? '' : 'none';

    renderListaCatalogos(tabCatalogosActual, filtrados, catalogosLista, {
        puedeEditar,
        puedeEliminar,
        onEditar: abrirEditarCatalogoModal,
        onEliminar: handleEliminarCatalogoItem
    });
}

catalogosTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        tabCatalogosActual = tab.dataset.tabCatalogo;
        catalogosTabs.forEach((t) => t.classList.toggle('active', t === tab));
        renderizarVistaCatalogos();
    });
});

catalogosBusqueda.addEventListener('input', renderizarVistaCatalogos);

agregarCatalogoBtn.addEventListener('click', () => {
    editandoCatalogoId = null;
    if (tabCatalogosActual === 'semillas') {
        semillaModalTitle.textContent = 'Agregar Semilla';
        semillaNombreInput.value = '';
        semillaTipoInput.value = '';
        semillaDiasInput.value = '';
        openModal('semillaModal');
    } else if (tabCatalogosActual === 'quimicos') {
        quimicoModalTitle.textContent = 'Agregar Químico';
        quimicoNombreInput.value = '';
        quimicoNotasInput.value = '';
        openModal('quimicoModal');
    } else {
        herramientaModalTitle.textContent = 'Agregar Herramienta';
        herramientaNombreInput.value = '';
        herramientaCantidadInput.value = '';
        openModal('herramientaModal');
    }
});

function abrirEditarCatalogoModal(tipo, itemId) {
    editandoCatalogoId = itemId;

    if (tipo === 'semillas') {
        const item = getCatalogoActual().find((i) => i.id === itemId);
        if (!item) return;
        semillaModalTitle.textContent = 'Editar Semilla';
        semillaNombreInput.value = item.nombre || '';
        semillaTipoInput.value = item.tipo || '';
        semillaDiasInput.value = item.dias_siembra_a_cosecha ?? '';
        openModal('semillaModal');
    } else if (tipo === 'quimicos') {
        const item = quimicosActuales.find((i) => i.id === itemId);
        if (!item) return;
        quimicoModalTitle.textContent = 'Editar Químico';
        quimicoNombreInput.value = item.nombre || '';
        quimicoNotasInput.value = item.notas_uso || '';
        openModal('quimicoModal');
    } else {
        const item = inventarioActual.find((i) => i.id === itemId);
        if (!item) return;
        herramientaModalTitle.textContent = 'Editar Herramienta';
        herramientaNombreInput.value = item.nombre || '';
        herramientaCantidadInput.value = item.cantidad ?? '';
        openModal('herramientaModal');
    }
}

async function handleEliminarCatalogoItem(tipo, itemId) {
    if (!window.confirm('¿Seguro que deseas eliminar este elemento?')) return;

    try {
        if (tipo === 'semillas') {
            await eliminarCatalogo(itemId);
            setCatalogoActual(await obtenerCatalogo());
        } else if (tipo === 'quimicos') {
            await eliminarQuimico(itemId);
            quimicosActuales = await obtenerQuimicos();
        } else {
            await eliminarInventario(itemId);
            inventarioActual = await obtenerInventario();
        }
        mostrarToast('Eliminado', 'green');
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[vista-catalogos] Error eliminando del catálogo:', e);
        mostrarToast('No se pudo eliminar', 'red');
    }
}

async function handleGuardarSemilla() {
    const nombre = semillaNombreInput.value.trim();
    if (!nombre) {
        mostrarToast('El nombre es obligatorio', 'red');
        return;
    }

    // Solo estos 3 campos top-level — nunca se toca requerimientos ni
    // condiciones_optimas desde aquí. updateDoc es merge parcial: al no
    // incluir esas claves, quedan intactas. Si algún día se agregan al
    // formulario, hay que mandar el objeto anidado COMPLETO (Firestore
    // reemplaza el valor entero de una clave anidada, no hace deep-merge),
    // o se repetiría el mismo bug que ya evitamos con `categoria`.
    const datos = {
        nombre,
        tipo: semillaTipoInput.value.trim(),
        dias_siembra_a_cosecha: semillaDiasInput.value ? Number(semillaDiasInput.value) : null
    };

    semillaSaveBtn.disabled = true;
    try {
        if (editandoCatalogoId) {
            await actualizarCatalogo(editandoCatalogoId, datos);
        } else {
            await crearCatalogo(datos);
        }
        closeModal('semillaModal');
        mostrarToast('Semilla guardada', 'green');
        setCatalogoActual(await obtenerCatalogo());
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[vista-catalogos] Error guardando semilla:', e);
        mostrarToast(e.message || 'No se pudo guardar', 'red');
    } finally {
        semillaSaveBtn.disabled = false;
    }
}

async function handleGuardarQuimico() {
    const nombre = quimicoNombreInput.value.trim();
    if (!nombre) {
        mostrarToast('El nombre es obligatorio', 'red');
        return;
    }

    const datos = { nombre, notas_uso: quimicoNotasInput.value.trim() };

    quimicoSaveBtn.disabled = true;
    try {
        if (editandoCatalogoId) {
            await actualizarQuimico(editandoCatalogoId, datos);
        } else {
            await crearQuimico(datos);
        }
        closeModal('quimicoModal');
        mostrarToast('Químico guardado', 'green');
        quimicosActuales = await obtenerQuimicos();
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[vista-catalogos] Error guardando químico:', e);
        mostrarToast(e.message || 'No se pudo guardar', 'red');
    } finally {
        quimicoSaveBtn.disabled = false;
    }
}

async function handleGuardarHerramienta() {
    const nombre = herramientaNombreInput.value.trim();
    if (!nombre) {
        mostrarToast('El nombre es obligatorio', 'red');
        return;
    }

    const cantidad = herramientaCantidadInput.value ? Number(herramientaCantidadInput.value) : null;

    herramientaSaveBtn.disabled = true;
    try {
        if (editandoCatalogoId) {
            // NUNCA se manda `categoria` aquí — este formulario no ofrece
            // cambiarla, y esta pestaña ya filtra por categoria==='herramienta'.
            // Omitirla del payload (en vez de reenviar el valor actual) es
            // la forma más segura: aunque cargar mal el valor actual fuera
            // un bug, no habría forma de que ese bug pise la categoría
            // real, porque la clave ni siquiera está presente.
            await actualizarInventario(editandoCatalogoId, { nombre, cantidad });
        } else {
            await crearInventario({ nombre, cantidad, categoria: 'herramienta' });
        }
        closeModal('herramientaModal');
        mostrarToast('Herramienta guardada', 'green');
        inventarioActual = await obtenerInventario();
        renderizarVistaCatalogos();
    } catch (e) {
        console.error('[vista-catalogos] Error guardando herramienta:', e);
        mostrarToast(e.message || 'No se pudo guardar', 'red');
    } finally {
        herramientaSaveBtn.disabled = false;
    }
}

semillaModalClose.addEventListener('click', () => closeModal('semillaModal'));
semillaSaveBtn.addEventListener('click', handleGuardarSemilla);

quimicoModalClose.addEventListener('click', () => closeModal('quimicoModal'));
quimicoSaveBtn.addEventListener('click', handleGuardarQuimico);

herramientaModalClose.addEventListener('click', () => closeModal('herramientaModal'));
herramientaSaveBtn.addEventListener('click', handleGuardarHerramienta);
