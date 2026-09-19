// js/main.js
// Orquestador de arranque + router de la barra de navegación + bootstrap de
// sesión (Fase 13, dividido en módulos por vista en Fase 19 — ver
// AI_CONTEXT.md). Escucha 'auth:resuelto' (emitido por auth.js — ver
// contrato documentado ahí) en vez de recibir un callback; decide desde
// acá si muestra #login-overlay o navega a una vista.
//
// Este archivo es intencionalmente delgado: solo el bootstrap de sesión y
// el listener delegado de headerNav (que dispatcha a las 6 rutas con carga
// de datos propia — Proyectos sumada en el rediseño de tareas/proyectos,
// 2026-08-29) viven acá. Cada vista real vive en su propio
// js/vista-*.js; router.js/core-ui.js/estado-app.js son los módulos hoja
// que todas las vistas comparten. El único motivo por el que ESTE archivo
// conoce a las 6 vistas (import directo de cada irAVistaX) es que
// router.js, a propósito, NO las conoce — si lo hiciera, cada vista
// tendría que importar de vuelta navegarA() desde router.js, un ciclo
// entre 6+ archivos. main.js es el único módulo al que le toca ser la raíz
// de ese árbol de imports.
//
// auth.js, db.js, usuarios.js, render.js y ai.js se mantienen puros (sin
// conocerse entre sí ni conocer el DOM) — auth.js SÍ importa usuarios.js
// (Fase 13) porque el contrato del evento exige `rol` resuelto en el
// payload; sigue sin tocar el DOM salvo dispatchEvent.
//
// TODO (fuera de alcance): cálculo de alertas de cosecha/riego. El botón
// "⚙ Configurar" + configModal (HTML muerto, openConfig()/saveConfig()
// nunca existieron) se retiró por completo el 2026-09-19 — ver index.html.
// El Asistente IA (botón +
// panel + toggleAI/agregarMensajeAI/handleSendAI/handleAiOverview) se
// borró por completo en Fase 19 — estaba desconectado desde Fase 15 (DOM
// retirado, listeners comentados) y la división en módulos era un punto
// natural para no arrastrarlo. generarRespuestaHuerto() (ai.js) sigue
// existiendo en disco como mock a propósito hasta que exista la Cloud
// Function que documenta su propio TODO — ya no se importa desde acá;
// reconectar cuando ese backend exista es tan simple como volver a
// importarlo.

import { AuthService } from './services/auth.js';
import { setUsuarioActual } from './services/session.js';
import { marcarStatusSinSesion } from './shared/core-ui.js';
import { navegarA, ocultarTodasLasVistas } from './shared/router.js';
import { setEsAdminActual } from './shared/estado-app.js';
import { mostrarErrorLogin, mostrarErrorSetup, actualizarGatingSetup } from './views/vista-login.js';
import { mostrarCompletarPerfil } from './views/vista-completar-perfil.js';
import { mostrarDashboard } from './views/vista-dashboard.js';
import { irAVistaTareas } from './views/vista-tareas.js';
import { irAVistaProyectos } from './views/vista-proyectos.js';
import { irAVistaCatalogos } from './views/vista-catalogos.js';
import { irAVistaPerfil } from './views/vista-perfil.js';
import { irAVistaAdmin } from './views/vista-admin.js';
import { irAVistaBitacora } from './views/vista-bitacora.js';

const headerNav = document.getElementById('headerNav');
const adminBtn      = document.getElementById('adminBtn');
const crearTareaBtn  = document.getElementById('crearTareaBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const loginOverlay   = document.getElementById('login-overlay');
const newUserNombreInput = document.getElementById('newUserNombre');
const newUserCarrerasGroup = document.getElementById('newUserCarrerasGroup');
const newUserClaveInput = document.getElementById('newUserClaveInput');

// ── Barra de navegación persistente del header (Fase 16) ────────────

headerNav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vista]');
    if (!btn) return;
    if (btn.dataset.vista === 'view-tareas') {
        irAVistaTareas();
        return;
    }
    if (btn.dataset.vista === 'view-proyectos') {
        irAVistaProyectos();
        return;
    }
    if (btn.dataset.vista === 'view-catalogos') {
        irAVistaCatalogos();
        return;
    }
    if (btn.dataset.vista === 'view-perfil') {
        irAVistaPerfil();
        return;
    }
    if (btn.dataset.vista === 'view-admin') {
        irAVistaAdmin();
        return;
    }
    if (btn.dataset.vista === 'view-bitacora') {
        irAVistaBitacora();
        return;
    }
    navegarA(btn.dataset.vista);
});

// ── Estado de sesión — escucha 'auth:resuelto' (ver contrato en auth.js) ──
//
// Ya no hay callback pasado a AuthService.init(): el evento trae el
// payload completo (user, rol, error) y este listener decide a dónde ir.
// Los 4 casos del contrato, en el mismo orden que están documentados en
// auth.js: sin sesión / con sesión sin perfil / con sesión con perfil /
// error consultando el perfil. Un 5º caso propio de ESTE archivo (no del
// contrato de auth.js — ver comentario junto al "Caso 2b" abajo): con
// sesión y perfil resuelto, pero sin carrera(s)/clave única todavía
// (2026-09-18) — manda a view-completar-perfil en vez del Dashboard.

document.addEventListener('auth:resuelto', (e) => {
    const { user, rol, nombre, carreras, claveUnica, error } = e.detail;

    // Caso 1: sin sesión. `rol` viene null pero NO significa "falta
    // Setup" — se distingue del caso 2 únicamente por `user` ser null.
    if (!user) {
        setUsuarioActual(null);
        setEsAdminActual(false);
        adminBtn.style.display = 'none';
        crearTareaBtn.style.display = 'none';
        googleLoginBtn.style.display = '';
        mostrarErrorLogin('');
        ocultarTodasLasVistas();
        loginOverlay.classList.remove('hidden');

        marcarStatusSinSesion();
        return;
    }

    setUsuarioActual({ uid: user.uid, email: user.email });

    // Caso 4: error consultando el perfil. Se ve igual que el caso 2 en
    // user/rol — por eso `error` se revisa ANTES que `rol`, para no
    // mandar al flujo de Setup a alguien que sí tiene perfil pero no se
    // pudo leer por una falla transitoria (eso reescribiría su perfil).
    if (error) {
        console.error('[main] Error consultando el perfil:', error);
        mostrarErrorLogin('No se pudo verificar tu perfil. Intenta de nuevo.');
        ocultarTodasLasVistas();
        loginOverlay.classList.remove('hidden');
        return;
    }

    // Caso 2: con sesión, sin perfil — falta Setup. Migrado a view-setup
    // (Fase 13.4) — ya no reutiliza #login-overlay/#roleSelection.
    if (rol === null) {
        mostrarErrorSetup('');
        newUserNombreInput.value = '';
        newUserClaveInput.value = '';
        newUserCarrerasGroup.querySelectorAll('input:checked').forEach((cb) => { cb.checked = false; });
        actualizarGatingSetup();
        loginOverlay.classList.add('hidden');
        navegarA('view-setup');
        return;
    }

    // Caso 2b (2026-09-18): con sesión, con perfil, pero falta completar
    // carrera(s)/clave única — cualquier perfil creado ANTES de este cambio
    // cae acá (auth.js normaliza esos campos a null si el documento no los
    // tiene). Se resuelve con la MISMA lectura de perfil que ya trae el
    // evento, sin una consulta extra. Debe ir DESPUÉS del caso 2 (rol===
    // null) — un perfil que ni siquiera existe no tiene este problema, tiene
    // el otro.
    if (!carreras || carreras.length === 0 || !claveUnica) {
        loginOverlay.classList.add('hidden');
        mostrarCompletarPerfil(user, rol, nombre);
        return;
    }

    // Caso 3: con sesión, con perfil resuelto.
    mostrarDashboard(user, rol === 'admin', nombre);
});

AuthService.init();
