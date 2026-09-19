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
const { setUsuarioActual } = await import('../js/services/session.js');
const { irAVistaProyectos } = await import('../js/views/vista-proyectos.js');

AuthService.init();

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
    firebaseMock.reset();
    setEsAdminActual(false);
    await firebaseMock.triggerAuthState({ uid: 'admin1', email: 'admin@test.com' });
    // AuthService y session.js son estados independientes — main.js los
    // conecta en producción (auth:resuelto -> setUsuarioActual), pero este
    // archivo no importa main.js, así que hay que fijarlo a mano para que
    // _logActividad/creadorId (chores.js) vean un uid real.
    setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });
    window.confirm = () => true; // jsdom no lo implementa — ver vista-catalogos.test.js
    // filtroProyectosActual es estado de MÓDULO, no de test (mismo patrón/
    // misma trampa que filtroTareasActual en vista-tareas.js) — un test que
    // cambia a la pestaña "Concluidos" deja ese estado para el siguiente
    // test del archivo si no se resetea acá. Como no está exportado, se
    // resetea con un clic real sobre la pestaña "Activos".
    document.querySelector('[data-filtro-proyecto="activo"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    // completarTareaModal/editarTareaModal (vista-tareas.js) son el MISMO
    // nodo del DOM en todo este archivo — un test que los abre y no los
    // cierra (ej. solo verifica que se abrieron) deja la clase 'open'
    // filtrándose al siguiente test si no se resetea acá.
    document.getElementById('completarTareaModal').classList.remove('open');
    document.getElementById('editarTareaModal').classList.remove('open');
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

describe('modal Agregar Paso', () => {
    // Autonomía en pasos de Proyectos (2026-09-19): "+ Agregar paso" dejó
    // de ser admin-only. El selector de origen SÍ sigue siendo admin-only
    // (mismo criterio que crearTareaOrigenGroup en Tareas).
    test('no-admin SÍ ve "+ Agregar paso", pero sin el selector de origen — abre el modal directo en modo autoasignada', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        setEsAdminActual(false);
        irAVistaProyectos();
        await esperar();

        const boton = document.querySelector('.proyecto-card button');
        assert.ok(boton);
        boton.dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(document.getElementById('agregarPasoOrigenGroup').style.display, 'none');
        assert.ok(document.getElementById('agregarPasoModal').classList.contains('open'));
        // Autoasignada: el propio uid en sesión (admin1, ver beforeEach) se
        // pre-marca — aunque en este seed no exista como estudiante real,
        // el checkbox solo se marca si existe en #agregarPasoAssignees.
    });

    test('no-admin: al guardar, crea el paso con origen:autoasignada y creadorId propio, con el propio uid pre-marcado', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        firebaseMock.seed('usuarios', { admin1: { nombre: 'Yo', rol: 'estudiante' }, u2: { nombre: 'Beto', rol: 'estudiante' } });
        setEsAdminActual(false);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-card button').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.querySelector('#agregarPasoAssignees input[value="admin1"]').checked, true); // pre-marcado

        document.getElementById('agregarPasoTitulo').value = 'Mi propio riego';
        document.getElementById('agregarPasoTipo').value = 'riego';
        document.getElementById('agregarPasoSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [tarea] = firebaseMock.leerColeccion('tareas');
        assert.equal(tarea.origen, 'autoasignada');
        assert.equal(tarea.creadorId, 'admin1');
        assert.deepEqual(tarea.asignados, ['admin1']);
        assert.equal(tarea.proyectoId, 'p1');
        // Clave del rediseño post-auditoría: un no-admin NUNCA escribe en
        // /proyectos — el array `pasos` del documento debe seguir vacío.
        assert.deepEqual(firebaseMock.leerDoc('proyectos', 'p1').pasos, []);
    });

    test('admin: ve el selector de origen, default "asignada" — sin marcar el propio uid a menos que elija autoasignada', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        firebaseMock.seed('usuarios', { admin1: { nombre: 'Yo', rol: 'admin' } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-card button').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.notEqual(document.getElementById('agregarPasoOrigenGroup').style.display, 'none');
        assert.equal(document.getElementById('agregarPasoOrigen').value, 'asignada');
        assert.equal(document.querySelector('#agregarPasoAssignees input[value="admin1"]').checked, false);

        document.getElementById('agregarPasoOrigen').value = 'autoasignada';
        document.getElementById('agregarPasoOrigen').dispatchEvent(new window.Event('change', { bubbles: true }));
        assert.equal(document.querySelector('#agregarPasoAssignees input[value="admin1"]').checked, true);
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

// Gestión de proyectos (2026-09-19): toggle Activos/Concluidos +
// Concluir/Reactivar/Eliminar.
describe('Toggle Activos/Concluidos', () => {
    test('arranca en "Activos" — un proyecto completado no se ve hasta cambiar de pestaña', async () => {
        firebaseMock.seed('proyectos', {
            p1: { nombre: 'Activo', estado: 'activo', pasos: [] },
            p2: { nombre: 'Concluido', estado: 'completado', pasos: [] }
        });
        irAVistaProyectos();
        await esperar();

        assert.equal(document.querySelector('.proyecto-card-nombre').textContent, 'Activo');
        assert.equal(document.querySelectorAll('.proyecto-card').length, 1);

        document.querySelector('[data-filtro-proyecto="concluido"]').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.querySelector('.proyecto-card-nombre').textContent, 'Concluido');
    });

    test('sin proyectos en la pestaña activa, muestra el mensaje de vacío (no una galería en blanco sin explicación)', async () => {
        firebaseMock.seed('proyectos', {});
        irAVistaProyectos();
        await esperar();

        assert.equal(document.getElementById('proyectosVacio').style.display, '');
        assert.match(document.getElementById('proyectosVacio').textContent, /No hay proyectos activos/);
    });
});

describe('Concluir / Reactivar / Eliminar (admin)', () => {
    test('Concluir mueve el proyecto de "Activos" a "Concluidos"', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-card-acciones button:nth-child(2)').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('proyectos', 'p1').estado, 'completado');
        assert.equal(document.querySelectorAll('.proyecto-card').length, 0); // ya no está en "Activos"
    });

    test('Reactivar mueve el proyecto de "Concluidos" a "Activos"', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'completado', pasos: [] } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();
        document.querySelector('[data-filtro-proyecto="concluido"]').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.querySelector('.proyecto-card-acciones button').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('proyectos', 'p1').estado, 'activo');
    });

    test('Eliminar pide confirmación, borra el proyecto y NO borra sus tareas', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Regar', proyectoId: 'p1' } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        setEsAdminActual(true);
        irAVistaProyectos();
        await esperar();

        document.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('proyectos', 'p1'), null);
        assert.ok(firebaseMock.leerDoc('tareas', 't1'));
    });

    test('cancelar la confirmación de Eliminar no borra nada', async () => {
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [] } });
        setEsAdminActual(true);
        window.confirm = () => false;
        irAVistaProyectos();
        await esperar();

        document.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.ok(firebaseMock.leerDoc('proyectos', 'p1'));
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

// Autonomía en pasos de Proyectos (2026-09-19): el CREADOR de un paso
// autoasignado puede editarlo/reenviarlo a revisión — reusa
// abrirEditarTareaModal (vista-tareas.js), no completarTareaModal.
describe('clic en un paso autoasignado — reutiliza abrirEditarTareaModal de vista-tareas.js', () => {
    test('el creador, con el paso pendiente: abre editarTareaModal (no completarTareaModal)', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Mi riego', tipo: 'individual', origen: 'autoasignada', creadorId: 'admin1', estado: 'pendiente', asignados: ['admin1'] } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.ok(document.getElementById('editarTareaModal').classList.contains('open'));
        assert.equal(document.getElementById('completarTareaModal').classList.contains('open'), false);
        assert.equal(document.getElementById('editarTareaTitulo').value, 'Mi riego');
    });

    test('guardar cambios refresca la galería de Proyectos (onGuardado), sin duplicar la tarea', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Mi riego', tipo: 'individual', origen: 'autoasignada', creadorId: 'admin1', estado: 'pendiente', asignados: ['admin1'] } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        firebaseMock.seed('usuarios', { admin1: { nombre: 'Yo', rol: 'estudiante' } });
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('editarTareaTitulo').value = 'Mi riego (corregido)';
        document.getElementById('editarTareaGuardarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 1);
        assert.equal(document.querySelector('.proyecto-checklist-titulo').textContent, 'Mi riego (corregido)');
    });

    test('NO es el creador (otro asignado del grupo): el clic no abre nada', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Grupal', tipo: 'individual', origen: 'autoasignada', creadorId: 'otro-uid', estado: 'pendiente', asignados: ['admin1', 'otro-uid'] } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('editarTareaModal').classList.contains('open'), false);
    });

    test('en_revision: congelada incluso para el creador', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'Mi riego', origen: 'autoasignada', creadorId: 'admin1', estado: 'en_revision', asignados: ['admin1'] } });
        firebaseMock.seed('proyectos', { p1: { nombre: 'X', estado: 'activo', pasos: [{ tareaId: 't1', orden: 1 }] } });
        irAVistaProyectos();
        await esperar();

        document.querySelector('.proyecto-checklist-item').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('editarTareaModal').classList.contains('open'), false);
    });
});
