// js/views/vista-perfil.js
//
// Vista de Perfil (Fase 13.7) — a diferencia de Tareas/Catálogos, sí hace
// una query nueva al entrar (obtenerUsuario): no hay caché en memoria que
// reutilizar (ningún otro widget lee horasTotales), y es una sola lectura
// de documento, no una query cara. Extraído de main.js (Fase 19, división
// en módulos por vista).

import { AuthService } from '../services/auth.js';
import { obtenerUsuario, actualizarRolPropio, actualizarNombrePropio, actualizarCarrerasYClavePropia } from '../services/usuarios.js';
import { crearCheckboxesCarreras, crearBarraProgresoHoras } from '../render/render.js';
import { calcularHorasObjetivo } from '../shared/catalogos.js';
import { mostrarToast, aplicarLimiteCheckboxes } from '../shared/core-ui.js';
import { navegarA } from '../shared/router.js';

const perfilNombreInput      = document.getElementById('perfilNombreInput');
const perfilEditarNombreBtn  = document.getElementById('perfilEditarNombreBtn');
const perfilGuardarNombreBtn = document.getElementById('perfilGuardarNombreBtn');
const perfilEmail            = document.getElementById('perfilEmail');
const perfilRolTexto         = document.getElementById('perfilRolTexto');
const perfilHoras            = document.getElementById('perfilHoras');
const perfilBarraProgreso    = document.getElementById('perfilBarraProgreso');
const perfilRolSelectorGroup = document.getElementById('perfilRolSelectorGroup');
const perfilRolSelect        = document.getElementById('perfilRolSelect');
const perfilGuardarRolBtn    = document.getElementById('perfilGuardarRolBtn');
const perfilLogoutBtn        = document.getElementById('perfilLogoutBtn');

// Carrera(s) + clave única (2026-09-18) — mismo patrón editar/guardar que
// el nombre arriba, pero con UN botón para los dos campos (viven en la
// misma unidad de edición: no tiene sentido guardar solo la carrera sin la
// clave o viceversa, ambos se completan juntos en el mismo gate al crear
// la cuenta).
const perfilCarrerasTexto           = document.getElementById('perfilCarrerasTexto');
const perfilCarrerasGroup           = document.getElementById('perfilCarrerasGroup');
const perfilClaveTexto               = document.getElementById('perfilClaveTexto');
const perfilClaveInput               = document.getElementById('perfilClaveInput');
const perfilEditarCarrerasClaveBtn   = document.getElementById('perfilEditarCarrerasClaveBtn');
const perfilGuardarCarrerasClaveBtn  = document.getElementById('perfilGuardarCarrerasClaveBtn');

aplicarLimiteCheckboxes(perfilCarrerasGroup, 2);

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

        const horasTotales = perfil.horasTotales ?? 0;
        perfilHoras.textContent = `${horasTotales} horas`;
        // Un perfil que llegó a Perfil sin pasar por el gate de
        // view-completar-perfil (no debería pasar, ver main.js caso 2b) no
        // tiene `carreras` todavía — sin objetivo no hay barra que pintar,
        // mismo criterio "no inventar defaults" del resto del proyecto.
        perfilBarraProgreso.replaceChildren();
        if (perfil.carreras?.length) {
            perfilBarraProgreso.appendChild(crearBarraProgresoHoras(horasTotales, calcularHorasObjetivo(perfil.carreras)));
        }

        perfilCarrerasTexto.textContent = perfil.carreras?.length ? perfil.carreras.join(', ') : 'Sin declarar';
        perfilClaveTexto.textContent = perfil.claveUnica || 'Sin declarar';
        perfilCarrerasGroup.replaceChildren(crearCheckboxesCarreras(perfil.carreras || []));
        // aplicarLimiteCheckboxes (arriba, al cargar el módulo) solo
        // escucha 'change' sobre este contenedor — replaceChildren no
        // dispara ese evento por sí solo, así que sin este dispatch manual
        // el límite de 2 no se reflejaría en `disabled` hasta el próximo
        // clic si el perfil ya trae 2 carreras marcadas de entrada.
        perfilCarrerasGroup.dispatchEvent(new Event('change'));
        perfilClaveInput.value = perfil.claveUnica || '';
        bloquearEdicionCarrerasClave();

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

// Carrera(s) + clave única — mismo criterio de bloqueo/edición que el
// nombre arriba, un solo par Editar/Guardar para ambos campos (ver
// comentario junto a su declaración de consts).
function bloquearEdicionCarrerasClave() {
    perfilCarrerasTexto.style.display = '';
    perfilCarrerasGroup.style.display = 'none';
    perfilClaveTexto.style.display = '';
    perfilClaveInput.style.display = 'none';
    perfilEditarCarrerasClaveBtn.style.display = '';
    perfilGuardarCarrerasClaveBtn.style.display = 'none';
}

function handleEditarCarrerasClave() {
    perfilCarrerasTexto.style.display = 'none';
    perfilCarrerasGroup.style.display = '';
    perfilClaveTexto.style.display = 'none';
    perfilClaveInput.style.display = '';
    perfilEditarCarrerasClaveBtn.style.display = 'none';
    perfilGuardarCarrerasClaveBtn.style.display = '';
}

async function handleGuardarCarrerasClavePropia() {
    const carreras = [...perfilCarrerasGroup.querySelectorAll('input:checked')].map((cb) => cb.value);
    const claveUnica = perfilClaveInput.value.trim();
    const user = AuthService.getCurrentUser();
    if (!user) return;

    perfilGuardarCarrerasClaveBtn.disabled = true;
    try {
        await actualizarCarrerasYClavePropia(user.uid, carreras, claveUnica);
        mostrarToast('Carrera(s) y clave actualizadas', 'green');
        await cargarYRenderizarVistaPerfil();
    } catch (e) {
        console.error('[vista-perfil] Error actualizando carrera(s)/clave:', e);
        mostrarToast(e.message || 'No se pudo actualizar', 'red');
    } finally {
        perfilGuardarCarrerasClaveBtn.disabled = false;
    }
}

perfilEditarNombreBtn.addEventListener('click', handleEditarNombre);
perfilGuardarNombreBtn.addEventListener('click', handleGuardarNombrePropio);
perfilGuardarRolBtn.addEventListener('click', handleGuardarRolPropio);
perfilEditarCarrerasClaveBtn.addEventListener('click', handleEditarCarrerasClave);
perfilGuardarCarrerasClaveBtn.addEventListener('click', handleGuardarCarrerasClavePropia);
perfilLogoutBtn.addEventListener('click', () => AuthService.logout());
