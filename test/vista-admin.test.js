// test/vista-admin.test.js
//
// js/views/vista-admin.js contra index.html real + Firestore falso.
// Importa vista-tareas.js (getEstudiantesActuales/setEstudiantesActuales,
// caché compartido) — se ejercita transitivamente, sin mockearlo aparte.
//
// El camino de error "FAILED_PRECONDITION por índice faltante" de
// aplicarFiltrosAuditoria (link de creación de índice, ver extraerLinkIndice
// en db.js) NO se prueba acá: el mock de Firestore nunca lanza ese error
// (no simula validación de índices compuestos), y forzarlo reemplazando
// getDocs a mitad de test es fragil frente a cómo mock.module() resuelve
// bindings — mismo criterio de "límite conocido del mock, no del código"
// ya usado en test/auth.test.js para el caso 4 del contrato.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { instalarDomCompleto } from './helpers/dom.js';
import { setUsuarioActual } from '../js/services/session.js';

instalarDomCompleto();

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { irAVistaAdmin } = await import('../js/views/vista-admin.js');

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    firebaseMock.reset();
    setUsuarioActual({ uid: 'admin1', email: 'admin@test.com' });
});

describe('modal de ajuste de horas', () => {
    test('abrir el modal carga el directorio de estudiantes (no confía solo en el caché) y puebla el selector', async () => {
        firebaseMock.seed('usuarios', {
            u1: { nombre: 'Ana', rol: 'estudiante' },
            u2: { rol: 'externo' } // no debe aparecer: obtenerDirectorioEstudiantes filtra por rol
        });

        document.getElementById('abrirAjusteHorasBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const opciones = [...document.querySelectorAll('#adminStudentSelect option')];
        assert.equal(opciones.length, 2); // placeholder + Ana
        assert.equal(opciones[1].textContent, 'Ana');
        assert.ok(document.getElementById('adminModal').classList.contains('open'));
    });

    test('valida estudiante/horas/motivo antes de escribir', async () => {
        document.getElementById('abrirAjusteHorasBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        // sin estudiante seleccionado
        document.getElementById('adminHoursInput').value = '5';
        document.getElementById('adminHoursMotivo').value = 'motivo';
        document.getElementById('adminSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();
        assert.equal(firebaseMock.leerColeccion('asistencias').length, 0);
    });

    test('horas en 0 o no-numéricas se rechazan', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante', horasTotales: 0 } });
        document.getElementById('abrirAjusteHorasBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        document.getElementById('adminStudentSelect').value = 'u1';
        document.getElementById('adminHoursMotivo').value = 'motivo';
        document.getElementById('adminHoursInput').value = '0';
        document.getElementById('adminSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('asistencias').length, 0);
    });

    test('con datos válidos, ajusta horas vía ajustarHoras y cierra el modal', async () => {
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante', horasTotales: 3 } });
        document.getElementById('abrirAjusteHorasBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        document.getElementById('adminStudentSelect').value = 'u1';
        document.getElementById('adminHoursInput').value = '5';
        document.getElementById('adminHoursMotivo').value = 'compensación';
        document.getElementById('adminSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 8);
        assert.equal(document.getElementById('adminModal').classList.contains('open'), false);
    });
});

describe('irAVistaAdmin — auditoría', () => {
    test('carga registro + resumen de horas, y muestra/oculta el estado vacío', async () => {
        firebaseMock.seed('registro_actividad', {
            l1: { tipo: 'CREAR_TAREA', usuario: 'a@test.com', fecha: { __ts: true, millis: 1 } }
        });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante', horasTotales: 10 } });

        irAVistaAdmin();
        await esperar();

        assert.equal(document.querySelectorAll('#registroActividadBody tr').length, 1);
        assert.equal(document.querySelectorAll('#resumenHorasBody tr').length, 1);
        assert.equal(document.getElementById('auditoriaVacio').style.display, 'none');
    });

    test('sin ningún registro, muestra el estado vacío', async () => {
        irAVistaAdmin();
        await esperar();
        assert.notEqual(document.getElementById('auditoriaVacio').style.display, 'none');
    });

    test('los selectores de filtro se pueblan con los tipos/personas reales del registro sin filtrar', async () => {
        firebaseMock.seed('registro_actividad', {
            l1: { tipo: 'CREAR_TAREA', fecha: { __ts: true, millis: 1 } },
            l2: { tipo: 'ELIMINAR_TAREA', fecha: { __ts: true, millis: 2 } }
        });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });

        irAVistaAdmin();
        await esperar();

        const tipos = [...document.querySelectorAll('#auditoriaFiltroTipo option')].map((o) => o.value);
        assert.deepEqual(tipos.filter(Boolean).sort(), ['CREAR_TAREA', 'ELIMINAR_TAREA']);

        const personas = [...document.querySelectorAll('#auditoriaFiltroPersona option')].map((o) => o.textContent);
        assert.ok(personas.includes('Ana'));
    });
});

describe('filtros de auditoría', () => {
    test('cambiar el filtro de tipo re-consulta y re-pinta solo esa combinación', async () => {
        firebaseMock.seed('registro_actividad', {
            l1: { tipo: 'CREAR_TAREA', fecha: { __ts: true, millis: 1 } },
            l2: { tipo: 'ELIMINAR_TAREA', fecha: { __ts: true, millis: 2 } }
        });
        irAVistaAdmin();
        await esperar();

        document.getElementById('auditoriaFiltroTipo').value = 'CREAR_TAREA';
        document.getElementById('auditoriaFiltroTipo').dispatchEvent(new window.Event('change', { bubbles: true }));
        await esperar();

        assert.equal(document.querySelectorAll('#registroActividadBody tr').length, 1);
    });

    test('"Limpiar filtros" vacía los selects/fechas y vuelve a mostrar todo', async () => {
        firebaseMock.seed('registro_actividad', {
            l1: { tipo: 'CREAR_TAREA', fecha: { __ts: true, millis: 1 } },
            l2: { tipo: 'ELIMINAR_TAREA', fecha: { __ts: true, millis: 2 } }
        });
        irAVistaAdmin();
        await esperar();

        document.getElementById('auditoriaFiltroTipo').value = 'CREAR_TAREA';
        document.getElementById('auditoriaFiltroTipo').dispatchEvent(new window.Event('change', { bubbles: true }));
        await esperar();

        document.getElementById('auditoriaLimpiarFiltrosBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(document.getElementById('auditoriaFiltroTipo').value, '');
        assert.equal(document.querySelectorAll('#registroActividadBody tr').length, 2);
    });
});
