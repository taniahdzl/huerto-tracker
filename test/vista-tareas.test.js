// test/vista-tareas.test.js
//
// js/views/vista-tareas.js contra index.html real + Firestore falso. Sin
// dependencias de otras vistas — ver cabecera de test/vista-perfil.test.js
// para el patrón general (AuthService.init() una vez, firebaseMock.
// triggerAuthState() por test).
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
const {
    irAVistaTareas, getEstudiantesActuales, setEstudiantesActuales, calcularSugerenciaHorasEfectivas, textoPreviewHoras
} = await import('../js/views/vista-tareas.js');

AuthService.init();

function esperar() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
    firebaseMock.reset();
    setEsAdminActual(false);
    window.confirm = () => true; // jsdom no lo implementa — ver vista-catalogos.test.js
    await firebaseMock.triggerAuthState({ uid: 'u1', email: 'ana@test.com' });
});

describe('irAVistaTareas — carga y filtro', () => {
    test('filtro default "mias": solo tareas asignadas al usuario en sesión', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Mía', estado: 'pendiente', asignados: ['u1'] },
            t2: { titulo: 'De otro', estado: 'pendiente', asignados: ['u2'] }
        });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });

        irAVistaTareas();
        await esperar();

        const titulos = [...document.querySelectorAll('#tareasListaVista .chore-item-titulo')].map((el) => el.textContent);
        assert.deepEqual(titulos, ['Mía']);
    });

    test('pestaña "todas" re-filtra con lo ya cacheado, sin volver a pedir a Firestore', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Mía', estado: 'pendiente', asignados: ['u1'] },
            t2: { titulo: 'De otro', estado: 'pendiente', asignados: ['u2'] }
        });
        irAVistaTareas();
        await esperar();

        const tabTodas = [...document.querySelectorAll('#view-tareas .filter-tab')].find((t) => t.dataset.filtro === 'todas');
        tabTodas.dispatchEvent(new window.Event('click', { bubbles: true }));

        const titulos = [...document.querySelectorAll('#tareasListaVista .chore-item-titulo')].map((el) => el.textContent);
        assert.deepEqual(titulos.sort(), ['De otro', 'Mía']);
        assert.ok(tabTodas.classList.contains('active'));
    });

    test('denormaliza asignadosNombres vía nombreParaMostrar contra el directorio completo', async () => {
        firebaseMock.seed('tareas', { t1: { titulo: 'X', estado: 'pendiente', asignados: ['u1', 'u2'] } });
        firebaseMock.seed('usuarios', {
            u1: { nombre: 'Ana', rol: 'estudiante' },
            u2: { email: 'sin-nombre@test.com', rol: 'estudiante' }
        });

        irAVistaTareas();
        await esperar();

        const tabTodas = [...document.querySelectorAll('#view-tareas .filter-tab')].find((t) => t.dataset.filtro === 'todas');
        tabTodas.dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(document.querySelector('.chore-item-asignados').textContent, 'Ana, sin-nombre@test.com');
    });
});

// Multiplicadores de horas (2026-09-19): las 6 categorías reemplazaron
// tanto a 'asistencia' como a 'individual' — la evidencia es SIEMPRE
// obligatoria ahora, sin excepción por tipo. El camino de éxito (con
// archivo real) no se puede ejercitar en esta suite: exige
// comprimirImagen() -> Canvas API, que jsdom no implementa (límite
// conocido, ya documentado en AI_CONTEXT.md para otros flujos de
// evidencia) — se cubre lo que SÍ es testeable: el rechazo sin evidencia,
// universal ahora, no solo para un tipo.
describe('completar tarea — modal único, foto SIEMPRE obligatoria (2026-09-19)', () => {
    test('click en "Completar" abre el modal (no completa directo) con el título de la tarea', async () => {
        setEsAdminActual(true);
        firebaseMock.seed('tareas', { t1: { titulo: 'Regar cama 3', tipo: 'riego', estado: 'pendiente', asignados: ['u1'] } });
        irAVistaTareas();
        await esperar();

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.ok(document.getElementById('completarTareaModal').classList.contains('open'));
        assert.equal(document.getElementById('completarTareaTitulo').textContent, 'Regar cama 3');
        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'pendiente'); // no completó solo con abrir
    });

    test('la etiqueta de evidencia siempre dice "obligatoria", sin importar el tipo', async () => {
        setEsAdminActual(true);
        firebaseMock.seed('tareas', { t1: { titulo: 'X', tipo: 'hoyos_composta', estado: 'pendiente', asignados: ['u1'] } });
        irAVistaTareas();
        await esperar();

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.getElementById('completarTareaFotoLabel').textContent, 'Foto de evidencia (obligatoria)');
    });

    test('sin foto (cualquier tipo): se rechaza, la tarea NO se completa y el modal sigue abierto para reintentar', async () => {
        setEsAdminActual(true);
        firebaseMock.seed('tareas', { t1: { titulo: 'X', tipo: 'riego', estado: 'pendiente', asignados: ['u1'], horasAOtorgar: 10 } });
        firebaseMock.seed('usuarios', { u1: { horasTotales: 0 } });
        irAVistaTareas();
        await esperar();

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('completarTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'pendiente');
        assert.equal(firebaseMock.leerDoc('usuarios', 'u1').horasTotales, 0);
        assert.ok(document.getElementById('completarTareaModal').classList.contains('open'));
    });

    test('no-admin nunca ve el botón Completar', async () => {
        setEsAdminActual(false);
        firebaseMock.seed('tareas', { t1: { titulo: 'X', tipo: 'riego', estado: 'pendiente', asignados: ['u1'] } });
        irAVistaTareas();
        await esperar();
        assert.equal(document.querySelector('.chore-complete-btn'), null);
    });
});

describe('calcularSugerenciaHorasEfectivas', () => {
    test('4 (horas EFECTIVAS, no a otorgar) solo si tipo:trabajo_fisico Y la fecha es sábado', () => {
        // Constructor local (año, mes 0-indexado, día) a propósito — un
        // ISO string ('2026-08-29') se parsea como medianoche UTC y en un
        // huso horario detrás de UTC (México, EE.UU.) cae en el día
        // ANTERIOR al evaluarse en hora local, dando un falso viernes.
        const sabado = new Date(2026, 7, 29);   // sábado real, confirmado
        const domingo = new Date(2026, 7, 30);
        assert.equal(calcularSugerenciaHorasEfectivas('trabajo_fisico', sabado), 4);
        assert.equal(calcularSugerenciaHorasEfectivas('trabajo_fisico', domingo), '');
        assert.equal(calcularSugerenciaHorasEfectivas('riego', sabado), '');
        assert.equal(calcularSugerenciaHorasEfectivas('', sabado), '');
    });

    test('default de fecha es "ahora" — no lanza sin segundo argumento', () => {
        assert.doesNotThrow(() => calcularSugerenciaHorasEfectivas('trabajo_fisico'));
    });
});

describe('textoPreviewHoras', () => {
    test('vacío sin tipo o sin horas efectivas', () => {
        assert.equal(textoPreviewHoras('', 4), '');
        assert.equal(textoPreviewHoras('riego', 0), '');
        assert.equal(textoPreviewHoras('riego', null), '');
    });

    test('calcula y formatea "X horas efectivas × multiplicador = Yh a acreditar"', () => {
        assert.equal(textoPreviewHoras('riego', 5), '5 horas efectivas × multiplicador = 10h a acreditar');
        assert.equal(textoPreviewHoras('trabajo_fisico', 4), '4 horas efectivas × multiplicador = 15h a acreditar');
    });
});

describe('modal Crear Tarea', () => {
    test('abrir el modal puebla los checkboxes de estudiantesActuales', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' }, u2: { nombre: 'Beto', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();

        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        const checkboxes = document.querySelectorAll('#crearTareaAssignees input[type="checkbox"]');
        assert.equal(checkboxes.length, 2);
        assert.ok(document.getElementById('crearTareaModal').classList.contains('open'));
    });

    test('rechaza guardar sin título', async () => {
        firebaseMock.seed('tareas', {});
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = '   ';
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });

    test('rechaza guardar sin tipo seleccionado', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = 'Nueva tarea';
        document.querySelector('#crearTareaAssignees input[type="checkbox"]').checked = true;
        // crearTareaTipo se queda en '' (default) a propósito.
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });

    test('rechaza guardar sin ningún estudiante seleccionado', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        // Un no-admin siempre crea 'autoasignada' — el modal pre-marca (no
        // fuerza) su propio checkbox por conveniencia, así que hay que
        // desmarcarlo a propósito para ejercitar "ningún asignado".
        document.querySelector('#crearTareaAssignees input[type="checkbox"]').checked = false;

        document.getElementById('crearTareaTitulo').value = 'Nueva tarea';
        document.getElementById('crearTareaTipo').value = 'individual';
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });

    test('con título, tipo y al menos un asignado, crea la tarea, cierra el modal y refresca la lista', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = 'Regar cama 3';
        document.getElementById('crearTareaTipo').value = 'riego';
        document.querySelector('#crearTareaAssignees input[type="checkbox"]').checked = true;
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas').length, 1);
        assert.equal(document.getElementById('crearTareaModal').classList.contains('open'), false);
    });

    test('seleccionar tipo dispara la sugerencia de horas EFECTIVAS (riego siempre vacío, no depende del día real)', async () => {
        firebaseMock.seed('tareas', {});
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        const tipoSelect = document.getElementById('crearTareaTipo');
        tipoSelect.value = 'riego';
        tipoSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        assert.equal(document.getElementById('crearTareaHoras').value, '');
    });

    test('actualizar el preview al escribir horas efectivas (sin esperar al submit)', async () => {
        firebaseMock.seed('tareas', {});
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTipo').value = 'riego';
        document.getElementById('crearTareaHoras').value = '5';
        document.getElementById('crearTareaHoras').dispatchEvent(new window.Event('input', { bubbles: true }));

        assert.equal(document.getElementById('crearTareaHorasPreview').textContent, '5 horas efectivas × multiplicador = 10h a acreditar');
    });

    // Multiplicadores de horas (2026-09-19): horasAOtorgar YA NO viene del
    // formulario — se calcula desde horasEfectivas × multiplicador del
    // tipo (chores.js).
    test('calcula horasAOtorgar desde horasEfectivas × multiplicador del tipo al crear', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = 'Sábado';
        document.getElementById('crearTareaTipo').value = 'trabajo_fisico';
        document.getElementById('crearTareaHoras').value = '4';
        document.querySelector('#crearTareaAssignees input[type="checkbox"]').checked = true;
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [tarea] = firebaseMock.leerColeccion('tareas');
        assert.equal(tarea.tipo, 'trabajo_fisico');
        assert.equal(tarea.horasEfectivas, 4);
        assert.equal(tarea.horasAOtorgar, 15); // 4 × 3.7 = 14.8 -> redondea a 15
    });
});

describe('getEstudiantesActuales / setEstudiantesActuales', () => {
    test('roundtrip simple (caché compartido con vista-admin.js)', () => {
        setEstudiantesActuales([{ id: 'x' }]);
        assert.deepEqual(getEstudiantesActuales(), [{ id: 'x' }]);
    });
});

describe('Crear Tarea — autoasignadas (2026-09-06)', () => {
    test('no-admin no ve crearTareaOrigenGroup y crea origen:autoasignada, pre-marcada su propia asignación', async () => {
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(document.getElementById('crearTareaOrigenGroup').style.display, 'none');
        const propio = document.querySelector('#crearTareaAssignees input[value="u1"]');
        assert.equal(propio.checked, true);

        document.getElementById('crearTareaTitulo').value = 'Regar mi cama';
        document.getElementById('crearTareaTipo').value = 'riego';
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [tarea] = firebaseMock.leerColeccion('tareas');
        assert.equal(tarea.origen, 'autoasignada');
        assert.deepEqual(tarea.asignados, ['u1']);
    });

    test('admin ve crearTareaOrigenGroup y puede elegir "autoasignada" explícitamente', async () => {
        setEsAdminActual(true);
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' }, u2: { nombre: 'Beto', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.notEqual(document.getElementById('crearTareaOrigenGroup').style.display, 'none');

        const origenSelect = document.getElementById('crearTareaOrigen');
        origenSelect.value = 'autoasignada';
        origenSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = 'Proponer tarea';
        document.getElementById('crearTareaTipo').value = 'riego';
        document.querySelector('input[value="u2"]').checked = true;
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        const [tarea] = firebaseMock.leerColeccion('tareas');
        assert.equal(tarea.origen, 'autoasignada');
        assert.ok(tarea.asignados.includes('u2'));
    });

    test('admin sin cambiar el selector (default "asignada") crea origen:asignada, como siempre', async () => {
        setEsAdminActual(true);
        firebaseMock.seed('tareas', {});
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.getElementById('crearTareaBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

        document.getElementById('crearTareaTitulo').value = 'Asignar a Ana';
        document.getElementById('crearTareaTipo').value = 'riego';
        document.querySelector('input[value="u1"]').checked = true;
        document.getElementById('crearTareaSaveBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerColeccion('tareas')[0].origen, 'asignada');
    });
});

describe('Editar/Enviar/Eliminar autoasignada (creador)', () => {
    test('el creador ve Editar y Eliminar en pendiente; otro asignado del grupo no ve nada', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Grupal', origen: 'autoasignada', creadorId: 'u1', estado: 'pendiente', asignados: ['u1', 'u2'] }
        });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' }, u2: { nombre: 'Beto', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();
        document.querySelector('[data-filtro="todas"]').dispatchEvent(new window.Event('click', { bubbles: true }));

        const botones = [...document.querySelectorAll('.chore-complete-btn')].map((b) => b.textContent);
        assert.deepEqual(botones, ['✏️ Editar', '🗑️ Eliminar']);

        // Mismo dato, visto por el OTRO asignado (no creador): sin botones.
        await firebaseMock.triggerAuthState({ uid: 'u2', email: 'beto@test.com' });
        irAVistaTareas();
        await esperar();
        document.querySelector('[data-filtro="todas"]').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.equal(document.querySelectorAll('.chore-complete-btn').length, 0);
    });

    test('"Guardar cambios" edita campos sin tocar estado ni pedir evidencia', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'Vieja', tipo: 'individual', origen: 'autoasignada', creadorId: 'u1', estado: 'pendiente', asignados: ['u1'], horasAOtorgar: 0 }
        });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.ok(document.getElementById('editarTareaModal').classList.contains('open'));
        assert.equal(document.getElementById('editarTareaTitulo').value, 'Vieja');

        document.getElementById('editarTareaTitulo').value = 'Nueva';
        document.getElementById('editarTareaGuardarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('tareas', 't1').titulo, 'Nueva');
        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'pendiente');
        assert.equal(document.getElementById('editarTareaModal').classList.contains('open'), false);
    });

    test('"Guardar y enviar a revisión" sin evidencia se rechaza, la tarea sigue pendiente', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'X', tipo: 'individual', origen: 'autoasignada', creadorId: 'u1', estado: 'pendiente', asignados: ['u1'] }
        });
        firebaseMock.seed('usuarios', { u1: { nombre: 'Ana', rol: 'estudiante' } });
        irAVistaTareas();
        await esperar();

        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        document.getElementById('editarTareaEnviarBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();

        assert.equal(firebaseMock.leerDoc('tareas', 't1').estado, 'pendiente');
    });

    test('rechazada: solo el botón "Editar y reenviar", muestra motivoRechazo y oculta "Guardar cambios"', async () => {
        firebaseMock.seed('tareas', {
            t1: {
                titulo: 'X', tipo: 'individual', origen: 'autoasignada', creadorId: 'u1',
                estado: 'rechazada', motivoRechazo: 'Falta la foto', asignados: ['u1']
            }
        });
        irAVistaTareas();
        await esperar();

        assert.equal(document.querySelector('.chore-complete-btn').textContent, '✏️ Editar y reenviar');
        document.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.match(document.getElementById('editarTareaMotivoRechazo').textContent, /Falta la foto/);
        assert.equal(document.getElementById('editarTareaGuardarBtn').style.display, 'none');
        assert.equal(document.getElementById('editarTareaEnviarBtn').textContent, 'Reenviar a revisión');
    });

    test('en_revision: sin botones, ni siquiera para el creador', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'X', origen: 'autoasignada', creadorId: 'u1', estado: 'en_revision', asignados: ['u1'] }
        });
        irAVistaTareas();
        await esperar();

        assert.equal(document.querySelectorAll('.chore-complete-btn').length, 0);
    });

    test('Eliminar (pendiente): confirm() cancelado no borra; aceptado borra y refresca', async () => {
        firebaseMock.seed('tareas', {
            t1: { titulo: 'X', origen: 'autoasignada', creadorId: 'u1', estado: 'pendiente', asignados: ['u1'] }
        });
        irAVistaTareas();
        await esperar();

        window.confirm = () => false;
        document.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();
        assert.equal(firebaseMock.leerColeccion('tareas').length, 1);

        window.confirm = () => true;
        document.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        await esperar();
        assert.equal(firebaseMock.leerColeccion('tareas').length, 0);
    });
});
