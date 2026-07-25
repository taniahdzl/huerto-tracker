// js/vista-bitacora.js
//
// PASO F: Bitácora de sesiones — vista independiente de view-admin,
// accesible a cualquier rol autenticado tanto para crear entradas como para
// ver el historial. cargarBannerBitacora() vive acá aunque pinta un nodo
// DOM de #view-dashboard (dashboardBannerPendientes*): es 100% lógica de
// bitácora (misma fuente de datos, mismo criterio de "más reciente"), solo
// que el nodo que pinta vive en el markup de otra vista — vista-dashboard.js
// la importa desde acá en vez de duplicarla. Extraído de main.js (Fase 19,
// división en módulos por vista).

import { obtenerBitacoraSesiones, crearBitacoraSesion, obtenerSesionConDetalle } from './db.js';
import { renderListaBitacora } from './render.js';
import { mostrarToast } from './core-ui.js';
import { navegarA } from './router.js';

const bitacoraFechaInput      = document.getElementById('bitacoraFechaInput');
const bitacoraResumenInput    = document.getElementById('bitacoraResumenInput');
const bitacoraPendientesInput = document.getElementById('bitacoraPendientesInput');
const bitacoraCrearBtn        = document.getElementById('bitacoraCrearBtn');
const bitacoraLista           = document.getElementById('bitacoraLista');

const dashboardBannerPendientes      = document.getElementById('dashboardBannerPendientes');
const dashboardBannerPendientesTexto = document.getElementById('dashboardBannerPendientesTexto');

export function irAVistaBitacora() {
    navegarA('view-bitacora');
    cargarYRenderizarBitacora();
}

async function cargarYRenderizarBitacora() {
    try {
        const sesiones = await obtenerBitacoraSesiones();
        renderListaBitacora(sesiones, bitacoraLista, onExpandirSesion);
    } catch (e) {
        console.error('[vista-bitacora] Error cargando la bitácora:', e);
        mostrarToast('No se pudo cargar la bitácora', 'red');
    }
}

// Carga perezosa: obtenerSesionConDetalle(fecha) (db.js) solo se llama la
// PRIMERA vez que se expande una sesión — no al renderizar la lista
// completa, para no disparar N queries (asistencias+tareas+directorio) por
// cada entrada con solo abrir la vista. contenedor.dataset.cargado evita
// repetir el fetch en toggles subsecuentes de la misma sesión.
async function onExpandirSesion(sesion, contenedor) {
    const visible = contenedor.style.display !== 'none';
    if (visible) {
        contenedor.style.display = 'none';
        return;
    }
    contenedor.style.display = '';
    if (contenedor.dataset.cargado === 'true') return;

    contenedor.textContent = 'Cargando…';
    try {
        // Misma función que ya resuelve esto en otro lado del proyecto —
        // no se reconstruye "asistentes"/"tareasCompletadas" a mano aquí.
        const { asistentes, tareasCompletadas } = await obtenerSesionConDetalle(sesion.fecha);

        const asistentesP = document.createElement('p');
        asistentesP.textContent = `Asistentes: ${asistentes.length ? asistentes.join(', ') : 'Ninguno registrado'}`;

        const tareasP = document.createElement('p');
        tareasP.textContent = `Tareas completadas: ${tareasCompletadas.length ? tareasCompletadas.join(', ') : 'Ninguna'}`;

        contenedor.replaceChildren(asistentesP, tareasP);
        contenedor.dataset.cargado = 'true';
    } catch (e) {
        console.error('[vista-bitacora] Error cargando detalle de sesión:', e);
        contenedor.textContent = 'No se pudo cargar el detalle.';
    }
}

function actualizarEstadoBotonBitacora() {
    const fecha = bitacoraFechaInput.value;
    const resumen = bitacoraResumenInput.value.trim();
    bitacoraCrearBtn.disabled = !(fecha && resumen);
}

function limpiarFormularioBitacora() {
    bitacoraFechaInput.value = new Date().toISOString().slice(0, 10);
    bitacoraResumenInput.value = '';
    bitacoraPendientesInput.value = '';
    actualizarEstadoBotonBitacora();
}

bitacoraFechaInput.addEventListener('input', actualizarEstadoBotonBitacora);
bitacoraResumenInput.addEventListener('input', actualizarEstadoBotonBitacora);

async function handleCrearBitacora() {
    const fecha = bitacoraFechaInput.value;
    const resumen = bitacoraResumenInput.value.trim();
    if (!fecha || !resumen) return; // defensivo — el botón ya debería estar disabled

    bitacoraCrearBtn.disabled = true;
    try {
        await crearBitacoraSesion({
            fecha,
            resumen,
            pendientes: bitacoraPendientesInput.value.trim() || ''
        });
        // Refresca lista + banner del Dashboard sin recargar la página —
        // esta entrada puede ser la nueva "más reciente" que el banner
        // debe mostrar la próxima vez que alguien vea el Dashboard.
        await Promise.all([cargarYRenderizarBitacora(), cargarBannerBitacora()]);
        limpiarFormularioBitacora();
        mostrarToast('Entrada guardada', 'green');
    } catch (e) {
        console.error('[vista-bitacora] Error creando entrada de bitácora:', e);
        mostrarToast(e.message || 'No se pudo guardar la entrada', 'red');
    } finally {
        // No se fuerza a false: si la escritura falló, los campos siguen
        // llenos (no se limpiaron) y el botón debe re-habilitarse; si tuvo
        // éxito, limpiarFormularioBitacora() ya dejó fecha/resumen vacíos y
        // debe seguir disabled. actualizarEstadoBotonBitacora() decide
        // correctamente en ambos casos.
        actualizarEstadoBotonBitacora();
    }
}

bitacoraCrearBtn.addEventListener('click', handleCrearBitacora);
limpiarFormularioBitacora(); // fecha por defecto = hoy, botón disabled

// Banner de pendientes del Dashboard (punto 4) — visible a CUALQUIER rol.
// Reutiliza obtenerBitacoraSesiones() (ya ordenada desc por fecha, ver
// db.js) — sesiones[0] es la más reciente, sin ordenar nada aquí. Oculto si
// no hay ninguna entrada o si la más reciente no tiene `pendientes` (string
// vacío incluido) — nunca un estado vacío forzado.
export async function cargarBannerBitacora() {
    try {
        const sesiones = await obtenerBitacoraSesiones();
        const masReciente = sesiones[0];
        if (masReciente && masReciente.pendientes) {
            dashboardBannerPendientesTexto.textContent = masReciente.pendientes;
            dashboardBannerPendientes.style.display = '';
        } else {
            dashboardBannerPendientes.style.display = 'none';
        }
    } catch (e) {
        console.error('[vista-bitacora] Error cargando el banner de pendientes:', e);
        dashboardBannerPendientes.style.display = 'none';
    }
}
