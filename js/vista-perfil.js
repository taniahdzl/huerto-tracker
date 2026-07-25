// js/vista-perfil.js
//
// Vista de Perfil (Fase 13.7) — a diferencia de Tareas/Catálogos, sí hace
// una query nueva al entrar (obtenerUsuario): no hay caché en memoria que
// reutilizar (ningún otro widget lee horasTotales), y es una sola lectura
// de documento, no una query cara. Extraído de main.js (Fase 19, división
// en módulos por vista).

import { AuthService } from './auth.js';
import { obtenerUsuario, actualizarRolPropio, actualizarNombrePropio } from './usuarios.js';
import { mostrarToast } from './core-ui.js';
import { navegarA } from './router.js';

const perfilNombreInput      = document.getElementById('perfilNombreInput');
const perfilEditarNombreBtn  = document.getElementById('perfilEditarNombreBtn');
const perfilGuardarNombreBtn = document.getElementById('perfilGuardarNombreBtn');
const perfilEmail            = document.getElementById('perfilEmail');
const perfilRolTexto         = document.getElementById('perfilRolTexto');
const perfilHoras            = document.getElementById('perfilHoras');
const perfilRolSelectorGroup = document.getElementById('perfilRolSelectorGroup');
const perfilRolSelect        = document.getElementById('perfilRolSelect');
const perfilGuardarRolBtn    = document.getElementById('perfilGuardarRolBtn');
const perfilLogoutBtn        = document.getElementById('perfilLogoutBtn');

export function irAVistaPerfil() {
    navegarA('view-perfil');
    cargarYRenderizarVistaPerfil();
}

async function cargarYRenderizarVistaPerfil() {
    const user = AuthService.getCurrentUser();
    if (!user) return;

    perfilEmail.textContent = user.email;

    try {
        const perfil = await obtenerUsuario(user.uid);
        if (!perfil) return; // no debería pasar — si estás en Dashboard, ya tienes perfil.

        perfilNombreInput.value = perfil.nombre || '';
        bloquearEdicionNombre();
        perfilRolTexto.textContent = perfil.rol;
        perfilHoras.textContent = `${perfil.horasTotales ?? 0} horas`;

        // Un admin nunca se auto-degrada desde aquí — ese cambio, si algún
        // día hace falta, lo hace OTRO admin, no autoservicio.
        if (perfil.rol === 'admin') {
            perfilRolSelectorGroup.style.display = 'none';
        } else {
            perfilRolSelectorGroup.style.display = '';
            perfilRolSelect.value = perfil.rol;
        }
    } catch (e) {
        console.error('[vista-perfil] Error cargando el perfil:', e);
        mostrarToast('No se pudo cargar tu perfil', 'red');
    }
}

async function handleGuardarRolPropio() {
    const nuevoRol = perfilRolSelect.value;
    const user = AuthService.getCurrentUser();
    if (!user) return;

    perfilGuardarRolBtn.disabled = true;
    try {
        await actualizarRolPropio(user.uid, nuevoRol);
        mostrarToast('Rol actualizado', 'green');
        await cargarYRenderizarVistaPerfil();
    } catch (e) {
        console.error('[vista-perfil] Error actualizando rol:', e);
        mostrarToast(e.message || 'No se pudo actualizar el rol', 'red');
    } finally {
        perfilGuardarRolBtn.disabled = false;
    }
}

// Nombre bloqueado (readonly) por defecto — "Editar" lo habilita y muestra
// "Guardar"; "Guardar" (si tiene éxito) vuelve a bloquear vía
// cargarYRenderizarVistaPerfil(), que ya llama a esta misma función. Si el
// guardado falla, NO se vuelve a bloquear (el catch de
// handleGuardarNombrePropio no llama a cargarYRenderizarVistaPerfil) — el
// usuario puede corregir y reintentar sin tener que volver a pulsar Editar.
function bloquearEdicionNombre() {
    perfilNombreInput.readOnly = true;
    perfilEditarNombreBtn.style.display = '';
    perfilGuardarNombreBtn.style.display = 'none';
}

function handleEditarNombre() {
    perfilNombreInput.readOnly = false;
    perfilNombreInput.focus();
    perfilEditarNombreBtn.style.display = 'none';
    perfilGuardarNombreBtn.style.display = '';
}

async function handleGuardarNombrePropio() {
    const nombre = perfilNombreInput.value.trim();
    const user = AuthService.getCurrentUser();
    if (!user) return;

    if (!nombre) {
        mostrarToast('El nombre no puede estar vacío', 'red');
        return;
    }

    perfilGuardarNombreBtn.disabled = true;
    try {
        await actualizarNombrePropio(user.uid, nombre);
        mostrarToast('Nombre actualizado', 'green');
        await cargarYRenderizarVistaPerfil();
    } catch (e) {
        console.error('[vista-perfil] Error actualizando nombre:', e);
        mostrarToast(e.message || 'No se pudo actualizar el nombre', 'red');
    } finally {
        perfilGuardarNombreBtn.disabled = false;
    }
}

perfilEditarNombreBtn.addEventListener('click', handleEditarNombre);
perfilGuardarNombreBtn.addEventListener('click', handleGuardarNombrePropio);
perfilGuardarRolBtn.addEventListener('click', handleGuardarRolPropio);
perfilLogoutBtn.addEventListener('click', () => AuthService.logout());
