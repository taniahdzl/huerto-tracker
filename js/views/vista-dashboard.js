// js/views/vista-dashboard.js
//
// mostrarDashboard() es la entrada única al sistema de vistas tras login —
// la usan tanto el listener de 'auth:resuelto' (login normal, en main.js)
// como vista-login.js's handleCompletarRegistro (justo después de crear el
// perfil, donde no hay re-disparo del evento porque registrar un documento
// en Firestore no cambia el estado de Firebase Auth). Los 3 clicks de
// tarjeta usan navegarA() directo, no los irAVistaX() de cada vista — así
// era en main.js antes de esta división (Fase 19), no un comportamiento
// nuevo: la vista destino recarga sus propios datos recién cuando el
// usuario navega OTRA vez a través de headerNav.

import { nombreParaMostrar } from '../services/session.js';
import { obtenerUsuario } from '../services/usuarios.js';
import { obtenerTareasAsignadas } from '../services/chores.js';
import { marcarStatusConectado } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';
import { setEsAdminActual } from '../shared/estado-app.js';
import { iniciarHuerto } from './vista-gemelo.js';
import { cargarBannerBitacora } from './vista-bitacora.js';

const loginOverlay = document.getElementById('login-overlay');
const adminBtn      = document.getElementById('adminBtn');
const crearTareaBtn  = document.getElementById('crearTareaBtn');

const dashboardUserEmail  = document.getElementById('dashboardUserEmail');
const dashboardHorasTexto = document.getElementById('dashboardHorasTexto');
const dashboardTareasLista = document.getElementById('dashboardTareasLista');

const dashboardResumenCamasCard = document.getElementById('dashboardResumenCamasCard');
const dashboardTareasCard       = document.getElementById('dashboardTareasCard');
const dashboardCatalogosCard    = document.getElementById('dashboardCatalogosCard');

export function mostrarDashboard(user, esAdmin, nombre) {
    loginOverlay.classList.add('hidden');
    setEsAdminActual(esAdmin);
    adminBtn.style.display = esAdmin ? '' : 'none';
    crearTareaBtn.style.display = esAdmin ? '' : 'none';
    const nombreMostrado = nombreParaMostrar({ email: user.email, nombre });
    dashboardUserEmail.textContent = ` — ${nombreMostrado}`;

    marcarStatusConectado(nombreMostrado);

    navegarA('view-dashboard');

    // catalogoActual/camasActuales (vista-gemelo.js) alimentan el mapa
    // dentro de #appRoot, que sigue oculto. También alimentan la Tarjeta 1
    // del Dashboard (renderResumenCamasDashboard, llamada al final de
    // iniciarHuerto() con los mismos datos ya cargados). Fire-and-forget:
    // obtenerCatalogo()/obtenerCamas() son fetches puntuales (getDocs, no
    // onSnapshot — confirmado), así que no hay riesgo de acumular
    // listeners si mostrarDashboard() se llama más de una vez en la misma
    // sesión.
    iniciarHuerto();

    cargarTareasDashboard(user.uid);
    cargarHorasDashboard(user.uid);

    // PASO F: banner de pendientes — fire-and-forget igual que
    // cargarTareasDashboard, con su propio try/catch.
    cargarBannerBitacora();
}

// Fire-and-forget, con su propio manejo de error — mismo criterio que
// cargarTareasDashboard/cargarBannerBitacora: no debe tumbar el resto del
// Dashboard si obtenerUsuario() falla. Lectura propia (no extiende el
// contrato de 'auth:resuelto' en auth.js): ese evento ya lee este mismo
// documento para resolver rol/nombre, pero descarta horasTotales, y
// mostrarDashboard() se llama desde dos sitios (el listener de
// 'auth:resuelto' en main.js y handleCompletarRegistro en vista-login.js,
// que NO redispara el evento) — extender el contrato ahí habría dejado una
// asimetría entre esos dos call-sites. Una lectura propia aquí, mismo
// patrón que vista-perfil.js, evita tocar auth.js.
async function cargarHorasDashboard(uid) {
    try {
        const perfil = await obtenerUsuario(uid);
        // 0 es un valor real (así nace todo usuario nuevo — usuarios.js) y
        // se muestra tal cual, no como estado de carga o error.
        const horas = perfil ? (perfil.horasTotales ?? 0) : 0;
        dashboardHorasTexto.textContent = `Llevas ${horas} horas acumuladas.`;
    } catch (e) {
        console.error('[vista-dashboard] Error cargando horas acumuladas del Dashboard:', e);
        dashboardHorasTexto.textContent = 'No se pudieron cargar tus horas acumuladas.';
    }
}

// Fire-and-forget, con su propio manejo de error — no debe tumbar
// mostrarDashboard() si obtenerTareasAsignadas() falla (ej. falta el
// índice compuesto en Firestore, ver nota en chores.js). Alimenta la
// Tarjeta 2 (reemplaza a la vieja "Tu próxima tarea" — Fase 14.3).
async function cargarTareasDashboard(uid) {
    dashboardTareasLista.replaceChildren();
    try {
        const { tareas, total } = await obtenerTareasAsignadas(uid, 3);

        if (tareas.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Sin tareas pendientes';
            dashboardTareasLista.appendChild(li);
            return;
        }

        tareas.forEach((tarea) => {
            const li = document.createElement('li');
            li.textContent = tarea.titulo;
            dashboardTareasLista.appendChild(li);
        });

        // `total` es el conteo real (getCountFromServer), no una
        // estimación — si hay más de las `cantidad` traídas, el resto
        // exacto se anuncia aquí.
        if (total > tareas.length) {
            const li = document.createElement('li');
            li.className = 'dashboard-tareas-mas';
            li.textContent = `+${total - tareas.length} más`;
            dashboardTareasLista.appendChild(li);
        }
    } catch (e) {
        console.error('[vista-dashboard] Error cargando tareas del Dashboard:', e);
        const li = document.createElement('li');
        li.textContent = 'No se pudieron cargar';
        dashboardTareasLista.appendChild(li);
    }
}

dashboardResumenCamasCard.addEventListener('click', () => navegarA('view-gemelo'));
dashboardTareasCard.addEventListener('click', () => navegarA('view-tareas'));
dashboardCatalogosCard.addEventListener('click', () => navegarA('view-catalogos'));
