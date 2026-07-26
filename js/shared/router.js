// js/router.js
//
// Router SPA (Fase 13) — puro toggle de visibilidad de .view, nunca carga
// datos: cada vista que necesita datos tiene su propio irAVistaX() en su
// propio módulo, que llama a navegarA() y a su propio
// cargarYRenderizarVistaX(). No importa ningún vista-*.js a propósito: si
// lo hiciera, cada vista tendría que importar de vuelta navegarA() desde
// acá, un ciclo entre 6+ archivos. El listener delegado de headerNav que sí
// conoce las 5 rutas por nombre vive en main.js, el único módulo al que le
// toca conocer a todas las vistas (ver su comentario de cabecera). Extraído
// de main.js (Fase 19, división en módulos por vista).

import { getEsAdminActual } from './estado-app.js';

const headerLogo      = document.getElementById('headerLogo');
const headerNav       = document.getElementById('headerNav');
const headerNavToggle = document.getElementById('headerNavToggle');

export const VISTAS_ADMIN = ['view-admin']; // view-config NO va aquí, sigue siendo modal

export function navegarA(vistaId, params = null) {
    // Guard de UX — la seguridad real está en firestore.rules, esto solo
    // evita mostrar una pantalla cuyas queries van a fallar en silencio.
    if (VISTAS_ADMIN.includes(vistaId) && !getEsAdminActual()) {
        vistaId = 'view-dashboard';
    }
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById(vistaId).classList.remove('hidden');
    // Fase 16: resalta en headerNav el botón cuyo data-vista coincide con la
    // vista activa. Ningún botón coincide con 'view-dashboard' (no es uno de
    // los 6 destinos de la barra) — eso es correcto, no un bug: volver al
    // Dashboard es rol del logo clicable (ver headerLogo más abajo), no de
    // un ítem de esta barra.
    headerNav.querySelectorAll('[data-vista]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.vista === vistaId);
    });
    // Fase 16.3: cualquier navegación cierra el menú hamburguesa si estaba
    // abierto — sin esto, tras tocar un destino en móvil el panel se queda
    // desplegado tapando la vista nueva hasta que el usuario lo cierre a
    // mano. No-op en desktop (headerNav nunca tiene .open ahí, ver CSS).
    headerNav.classList.remove('open');
    headerNavToggle.setAttribute('aria-expanded', 'false');
    if (params) {
        document.dispatchEvent(new CustomEvent('vista:params', { detail: { vistaId, params } }));
    }
}

// Fase 16: el logo del header hace de "home" — única forma de volver al
// Dashboard ahora que headerNav (abajo) no incluye ese destino y el botón
// "Volver al Dashboard" por vista se retiró junto con .dashboard-quicklinks.
headerLogo.addEventListener('click', () => navegarA('view-dashboard'));

// Fase 16.3: toggle del menú hamburguesa (solo visible bajo 720px, ver
// CSS) — abre/cierra headerNav y mantiene aria-expanded sincronizado.
headerNavToggle.addEventListener('click', () => {
    const abierto = headerNav.classList.toggle('open');
    headerNavToggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
});

// Para los casos en que lo que debe mostrarse es #login-overlay, no una
// vista — oculta TODAS las .view (incluida Splash) sin navegar "a" nada,
// para que Splash (z-index 3000) no tape el overlay (z-index 2000).
export function ocultarTodasLasVistas() {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
}
