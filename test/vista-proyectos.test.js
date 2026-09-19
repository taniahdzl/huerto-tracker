// test/vista-proyectos.test.js
//
// js/views/vista-proyectos.js contra index.html real + Firestore falso.
// Mismo patrón general que vista-tareas.test.js. A diferencia de otras
// vistas, vista-proyectos.js SÍ importa otra vista (vista-tareas.js, por
// abrirModalCompletarTarea/calcularSugerenciaHoras — ver cabecera de
// vista-proyectos.js) — dirección única, vista-tareas.js no importa de
// vuelta, así que esto no es un ciclo. instalarDomCompleto() ya carga el
// index.html completo, con el DOM de ambas vistas.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomCompleto } from './helpers/dom.js';

instalarDomCompleto();

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { AuthService } = await import('../js/services/auth.js');
const { setEsAdminActual } = await import('../js/shared/estado-app.js');
const { irAVistaProyectos } = await import('../js/views/vista-proyectos.js');

AuthService.init();

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
    firebaseMock.reset();
    setEsAdminActual(false);
    await firebaseMock.triggerAuthState({ uid: 'admin1', email: 'admin@test.com' });
    // completarTareaModal es el MISMO nodo del DOM en todo este archivo —
    // un test que lo abre y lo deja abierto (ej. un rechazo por falta de
    // evidencia, a propósito no lo cierra) filtra ese estado al siguiente
    // test si no se resetea acá.
    document.getElementById('completarTareaModal').classList.remove('open');
});

describe('irAVistaProyectos — carga y pinta la galería', () => {
    test('pinta nombre y progreso resolviendo el estado real de las tareas referenciadas', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Arar', tipo: 'individual', estado: 'completada', asignados: [] },
            t2: { titulo: 'Sembrar', tipo: 'individual', estado: 'pendiente', asignados: [] }
        });
        firebaseMock.seed('proyectos', {
            p1: { nombre: 'Cosecha de otoño', descripcion: '', estado: 'activo', fechaObjetivo: null, pasos: [{ tareaId: 't1', orden: 1 }, { tareaId: 't2', orden: 2 }] }
        });

        irAVistaProyectos();
        await esperar();

        assert.equal(document.querySelector('.proyecto-card-nombre').textContent, 'Cosecha de otoño');
        assert.equal(document.querySelector('.proyecto-card-progreso-texto').textContent, '1 de 2 pasos completados');
    });
});

describe('modal Nuevo Proyecto (admin-only, patrón local estilo Catálogos)', () => {
    test('admin ve "+ Nuevo proyecto"; no-admin no', async () => {
        firebaseMock.seed('proyectos', {});
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();
        assert.notEqual(document.getElementById('crearProyectoBtn').style.display, 'none');

        setEsAdminActual(false);
        irAVistaProyectos();
        await esperar();
        assert.equal(document.getElementById('crearProyectoBtn').style.display, 'none');
    });

    test('rechaza guardar sin nombre', async () => {
        firebaseMock.seed('proyectos', {});
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.getElementById('crearProyectoBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('crearProyectoSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('proyectos').length, 0);
    });

    test('crea el proyecto, cierra el modal y refresca la galería', async () => {
        firebaseMock.seed('proyectos', {});
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.getElementById('crearProyectoBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('crearProyectoNombre').value = 'Proyecto nuevo';
        document.getElementById('crearProyectoDescripcion').value = 'Una descripción';
        document.getElementById('crearProyectoFecha').value = '2026-10-01';
        document.getElementById('crearProyectoSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [proyecto] = firebaseMock.leerColeccion('proyectos');
        assert.equal(proyecto.nombre, 'Proyecto nuevo');
        assert.equal(proyecto.fechaObjetivo, '2026-10-01');
        assert.equal(document.getElementById('crearProyectoModal').classList.contains('open'), false);
        assert.equal(document.querySelector('.proyecto-card-nombre').textContent, 'Proyecto nuevo');
    });
});

describe('modal Agregar Paso (admin-only)', () => {
    test('no-admin no ve el botón "+ Agregar paso" en ninguna tarjeta', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        setEsAdminActual(false);
        irAVistaProyectos();
        await esperar();
        assert.equal(document.querySelector('.proyecto-card button'), null);
    });

    test('abrir el modal puebla checkboxes de estudiantes y sugiere el siguiente orden', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        firebaseMock.seed('tareas', { t1: { titulo: 'Ya existente', estado: 'pendiente' } });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-card button').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(document.querySelectorAll('#agregarPasoAssignees input[type="checkbox"]').length, 1);
        assert.equal(document.getElementById('agregarPasoOrden').value, '2'); // 1 paso existente + 1
        assert.ok(document.getElementById('agregarPasoModal').classList.contains('open'));
    });

    test('rechaza guardar sin tipo', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-card button').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('agregarPasoTitulo').value = 'Nuevo paso';
        document.querySelector('#agregarPasoAssignees input[type="checkbox"]').checked = true;
        document.getElementById('agregarPasoSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });

    test('agrega el paso: crea la tarea con proyectoId, la refleja en la galería, cierra el modal', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-card button').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('agregarPasoTitulo').value = 'Regar cama 3';
        document.getElementById('agregarPasoTipo').value = 'riego';
        document.querySelector('#agregarPasoAssignees input[type="checkbox"]').checked = true;
        document.getElementById('agregarPasoSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [tarea] = firebaseMock.leerColeccion('tareas');
        assert.equal(tarea.titulo, 'Regar cama 3');
        assert.equal(tarea.proyectoId, 'p1');
        assert.equal(document.getElementById('agregarPasoModal').classList.contains('open'), false);
        assert.equal(document.querySelector('.proyecto-checklist-titulo').textContent, 'Regar cama 3');
    });
});

describe('clic en un paso — reutiliza abrirModalCompletarTarea de vista-tareas.js', () => {
    test('admin + paso pendiente: abre completarTareaModal con el título correcto', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Paso pendiente', tipo: 'individual', estado: 'pendiente', asignados: [] } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.ok(document.getElementById('completarTareaModal').classList.contains('open'));
        assert.equal(document.getElementById('completarTareaTitulo').textContent, 'Paso pendiente');
    });

    // Multiplicadores de horas (2026-09-19): la evidencia es SIEMPRE
    // obligatoria ahora — el camino de éxito (con archivo real) exige
    // comprimirImagen()/Canvas API, que jsdom no implementa (límite
    // conocido, ver AI_CONTEXT.md). Se cubre lo testeable: sin evidencia,
    // el paso se rechaza y el progreso de la tarjeta no cambia.
    test('completar un paso sin evidencia se rechaza — el progreso de la tarjeta no cambia', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Paso', tipo: 'riego', estado: 'pendiente', asignados: ['u1'], horasAOtorgar: 5 } });
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        assert.equal(document.querySelector('.proyecto-card-progreso-texto').textContent, '0 de 1 pasos completados');

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('completarTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'pendiente');
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 0);
        assert.equal(document.querySelector('.proyecto-card-progreso-texto').textContent, '0 de 1 pasos completados');
        assert.ok(document.getElementById('completarTareaModal').classList.contains('open')); // sigue abierto para reintentar
    });

    test('paso ya completado: el clic no abre nada (no hay vista de detalle de solo lectura)', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Ya hecho', tipo: 'individual', estado: 'completada', asignados: [] } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('completarTareaModal').classList.contains('open'), false);
    });

    test('no-admin: el clic en un paso pendiente no abre nada', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Paso', tipo: 'individual', estado: 'pendiente', asignados: [] } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        setEsAdminActual(false);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('completarTareaModal').classList.contains('open'), false);
    });
});
