// test/render.test.js
//
// js/render/render.js con jsdom (test/helpers/dom.js) — módulo puro de
// pintado, sin Firebase. instalarDomVacio() alcanza: cada función recibe su
// `contenedor` por parámetro, ninguna consulta un id fijo de index.html.
//
// Corre con: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDomVacio } from './helpers/dom.js';

instalarDomVacio();

const {
    emojiDePlanta, colorDePlanta, crearLeyendaCategorias,
    renderListaTareas, renderListaCatalogos, renderRegistroActividad,
    renderListaBitacora, renderResumenHoras,
    renderGaleriaProyectos, calcularBadgeProyecto,
    crearBarraProgresoHoras, crearCheckboxesCarreras
} = await import('../js/render/render.js');

describe('emojiDePlanta / colorDePlanta', () => {
    test('devuelven el valor mapeado para tipos conocidos', () => {
        assert.equal(emojiDePlanta('fruto'), '🍅');
        assert.equal(colorDePlanta('fruto'), '#c62828');
    });

    test('caen a un default genérico para tipos desconocidos, nunca undefined', () => {
        assert.equal(emojiDePlanta('inventado'), '🌿');
        assert.equal(colorDePlanta('inventado'), '#757575');
    });
});

describe('crearLeyendaCategorias', () => {
    test('genera un <details> con un <li> por cada tipo de EMOJI_POR_TIPO', () => {
        const leyenda = crearLeyendaCategorias();
        assert.equal(leyenda.tagName, 'DETAILS');
        const items = leyenda.querySelectorAll('li');
        assert.equal(items.length, 6); // hoja/raíz/fruto/flor/tallo/semilla
        assert.match(items[0].textContent, /🥬 Hoja/);
    });
});

describe('renderListaTareas', () => {
    const NOOP = { onCompletar: () => {}, onEditar: () => {}, onEliminar: () => {} };

    test('pinta título, asignados y clase completada', () => {
        const contenedor = document.createElement('ul');
        renderListaTareas(
            [
                { id: 't1', titulo: 'Regar', estado: 'pendiente', asignadosNombres: ['Ana', 'Beto'] },
                { id: 't2', titulo: 'Podar', estado: 'completada' }
            ],
            contenedor,
            NOOP
        );

        const items = contenedor.querySelectorAll('li');
        assert.equal(items.length, 2);
        assert.equal(items[0].className, 'chore-item');
        assert.equal(items[1].className, 'chore-item completada');
        assert.match(items[0].querySelector('.chore-item-asignados').textContent, /Ana, Beto/);
        assert.match(items[1].querySelector('.chore-item-asignados').textContent, /Sin asignar/);
    });

    test('botón "Completar" (origen:asignada) solo aparece si esAdmin=true y la tarea no está completada', () => {
        const casos = [
            { esAdmin: true, estado: 'pendiente', esperaBoton: true },
            { esAdmin: false, estado: 'pendiente', esperaBoton: false },
            { esAdmin: true, estado: 'completada', esperaBoton: false }
        ];

        casos.forEach(({ esAdmin, estado, esperaBoton }) => {
            const contenedor = document.createElement('ul');
            renderListaTareas([{ id: 't1', titulo: 'X', origen: 'asignada', estado }], contenedor, NOOP, { esAdmin });
            const boton = contenedor.querySelector('.chore-complete-btn');
            assert.equal(!!boton, esperaBoton, `esAdmin=${esAdmin} estado=${estado}`);
        });
    });

    test('el botón Completar dispara onCompletar con el id de la tarea', () => {
        const contenedor = document.createElement('ul');
        const clicks = [];
        renderListaTareas(
            [{ id: 'tX', titulo: 'X', origen: 'asignada', estado: 'pendiente' }],
            contenedor,
            { ...NOOP, onCompletar: (id) => clicks.push(id) },
            { esAdmin: true }
        );

        contenedor.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.deepEqual(clicks, ['tX']);
    });

    test('título sin valor cae a "Sin título"', () => {
        const contenedor = document.createElement('ul');
        renderListaTareas([{ id: 't1', estado: 'pendiente' }], contenedor, NOOP);
        assert.equal(contenedor.querySelector('.chore-item-titulo').textContent, 'Sin título');
    });

    test('muestra miniatura de evidencia solo si la tarea está completada Y tiene fotoEvidenciaUrl', () => {
        const casos = [
            { estado: 'completada', fotoEvidenciaUrl: 'https://x/foto.jpg', esperaFoto: true },
            { estado: 'completada', fotoEvidenciaUrl: null, esperaFoto: false },
            { estado: 'pendiente', fotoEvidenciaUrl: 'https://x/foto.jpg', esperaFoto: false }
        ];

        casos.forEach(({ estado, fotoEvidenciaUrl, esperaFoto }) => {
            const contenedor = document.createElement('ul');
            renderListaTareas([{ id: 't1', titulo: 'X', estado, fotoEvidenciaUrl }], contenedor, NOOP);
            const img = contenedor.querySelector('.chore-item-evidencia');
            assert.equal(!!img, esperaFoto, `estado=${estado} fotoEvidenciaUrl=${fotoEvidenciaUrl}`);
            if (esperaFoto) assert.equal(img.src, 'https://x/foto.jpg');
        });
    });

    describe('autoasignadas: creador ve editar/eliminar/reenviar, "en_revision" queda congelada', () => {
        const base = { id: 't1', titulo: 'X', origen: 'autoasignada', creadorId: 'u1' };

        test('pendiente + esCreador: botones Editar y Eliminar (no Completar)', () => {
            const contenedor = document.createElement('ul');
            renderListaTareas([{ ...base, estado: 'pendiente' }], contenedor, NOOP, { esAdmin: true, uidActual: 'u1' });
            const botones = [...contenedor.querySelectorAll('.chore-complete-btn')].map((b) => b.textContent);
            assert.deepEqual(botones, ['✏️ Editar', '🗑️ Eliminar']);
        });

        test('pendiente + NO es creador (otro uid): sin botones', () => {
            const contenedor = document.createElement('ul');
            renderListaTareas([{ ...base, estado: 'pendiente' }], contenedor, NOOP, { esAdmin: true, uidActual: 'otro' });
            assert.equal(contenedor.querySelectorAll('.chore-complete-btn').length, 0);
        });

        test('rechazada + esCreador: un único botón "Editar y reenviar", muestra motivoRechazo', () => {
            const contenedor = document.createElement('ul');
            renderListaTareas(
                [{ ...base, estado: 'rechazada', motivoRechazo: 'Falta la foto' }],
                contenedor, NOOP, { uidActual: 'u1' }
            );
            const botones = [...contenedor.querySelectorAll('.chore-complete-btn')].map((b) => b.textContent);
            assert.deepEqual(botones, ['✏️ Editar y reenviar']);
            assert.match(contenedor.querySelector('.admin-auditoria-error').textContent, /Falta la foto/);
        });

        test('en_revision: congelada, cero botones incluso para admin/creador', () => {
            const contenedor = document.createElement('ul');
            renderListaTareas([{ ...base, estado: 'en_revision' }], contenedor, NOOP, { esAdmin: true, uidActual: 'u1' });
            assert.equal(contenedor.querySelectorAll('.chore-complete-btn').length, 0);
            assert.match(contenedor.querySelector('.chore-item-asignados:last-child')?.textContent || '', /En revisión/);
        });

        test('sin origen (tarea vieja, pre-rediseño) se trata como "asignada"', () => {
            const contenedor = document.createElement('ul');
            renderListaTareas([{ id: 't1', titulo: 'X', estado: 'pendiente' }], contenedor, NOOP, { esAdmin: true, uidActual: 'u1' });
            assert.equal(contenedor.querySelector('.chore-complete-btn').textContent, '✅ Completar');
        });
    });
});

describe('renderListaCatalogos', () => {
    test('tipo semillas: meta muestra tipo + días', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('semillas', [{ id: 'p1', nombre: 'Tomate', tipo: 'fruto', dias_siembra_a_cosecha: 90 }], contenedor, {});
        assert.equal(contenedor.querySelector('.catalogo-item-meta').textContent, 'fruto · 90 días');
    });

    test('tipo quimicos: meta muestra notas_uso o "Sin notas"', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('quimicos', [{ id: 'q1', nombre: 'X' }], contenedor, {});
        assert.equal(contenedor.querySelector('.catalogo-item-meta').textContent, 'Sin notas');
    });

    test('otro tipo (herramientas): meta muestra Cantidad', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('herramientas', [{ id: 'h1', nombre: 'Pala', cantidad: 3 }], contenedor, {});
        assert.equal(contenedor.querySelector('.catalogo-item-meta').textContent, 'Cantidad: 3');
    });

    test('botones editar/eliminar respetan los flags puedeEditar/puedeEliminar y disparan sus callbacks con (tipo, id)', () => {
        const contenedor = document.createElement('ul');
        const editados = [];
        const eliminados = [];
        renderListaCatalogos('semillas', [{ id: 'p1', nombre: 'X' }], contenedor, {
            puedeEditar: true,
            puedeEliminar: true,
            onEditar: (tipo, id) => editados.push([tipo, id]),
            onEliminar: (tipo, id) => eliminados.push([tipo, id])
        });

        contenedor.querySelector('.catalogo-eliminar-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
        contenedor.querySelectorAll('.chore-complete-btn')[0].dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.deepEqual(editados, [['semillas', 'p1']]);
        assert.deepEqual(eliminados, [['semillas', 'p1']]);
    });

    test('sin permisos, no se pintan botones de acción', () => {
        const contenedor = document.createElement('ul');
        renderListaCatalogos('semillas', [{ id: 'p1', nombre: 'X' }], contenedor, { puedeEditar: false, puedeEliminar: false });
        assert.equal(contenedor.querySelectorAll('button').length, 0);
    });
});

describe('renderRegistroActividad', () => {
    test('formatea fecha con .toDate(), y usuario cae a uid si no hay email', () => {
        const contenedor = document.createElement('table');
        const fechaFalsa = { toDate: () => new Date('2026-07-26T12:00:00Z') };
        renderRegistroActividad([
            { tipo: 'CREAR_TAREA', entidad: 't1', detalle: 'x', usuario: 'ana@test.com', fecha: fechaFalsa },
            { tipo: 'ELIMINAR_TAREA', uid: 'u2', fecha: null }
        ], contenedor);

        const filas = contenedor.querySelectorAll('tr');
        assert.equal(filas.length, 2);
        assert.notEqual(filas[0].children[0].textContent, '—'); // fecha formateada
        assert.equal(filas[0].children[4].textContent, 'ana@test.com');
        assert.equal(filas[1].children[0].textContent, '—'); // sin fecha
        assert.equal(filas[1].children[4].textContent, 'u2'); // sin usuario, cae a uid
    });
});

describe('renderListaBitacora', () => {
    test('pendientes solo se pinta si el campo viene con valor', () => {
        const contenedor = document.createElement('ul');
        renderListaBitacora([
            { id: 's1', fecha: '2026-07-26', resumen: 'Todo bien', pendientes: 'Regar cama 3' },
            { id: 's2', fecha: '2026-07-25', resumen: 'Ok' }
        ], contenedor, () => {});

        const items = contenedor.querySelectorAll('li');
        assert.equal(items[0].querySelectorAll('.chore-item-asignados').length, 2); // resumen + pendientes
        assert.equal(items[1].querySelectorAll('.chore-item-asignados').length, 1); // solo resumen
    });

    test('el botón de detalle llama onExpandirClick con la sesión y su contenedor de detalle', () => {
        const contenedor = document.createElement('ul');
        const llamadas = [];
        const sesion = { id: 's1', fecha: '2026-07-26', resumen: 'x' };
        renderListaBitacora([sesion], contenedor, (s, c) => llamadas.push([s, c]));

        contenedor.querySelector('.chore-complete-btn').dispatchEvent(new window.Event('click', { bubbles: true }));

        assert.equal(llamadas.length, 1);
        assert.equal(llamadas[0][0], sesion);
        assert.equal(llamadas[0][1].className, 'bitacora-detalle');
    });
});

describe('renderResumenHoras', () => {
    test('ordena descendente por horasTotales sin mutar el array original', () => {
        const contenedor = document.createElement('table');
        const estudiantes = [
            { id: 'u1', nombre: 'Ana', horasTotales: 5 },
            { id: 'u2', nombre: 'Beto', horasTotales: 20 },
            { id: 'u3', nombre: 'Cami', horasTotales: 10 }
        ];
        const copiaOriginal = [...estudiantes];

        renderResumenHoras(estudiantes, contenedor);

        const nombres = [...contenedor.querySelectorAll('tr')].map((tr) => tr.children[0].textContent);
        assert.deepEqual(nombres, ['Beto', 'Cami', 'Ana']);
        assert.deepEqual(estudiantes, copiaOriginal); // sin mutar
    });

    // Columnas (2026-09-18): Estudiante, Carrera(s), Clave Única, Horas
    // Totales, Progreso — ver thead de #view-admin en index.html.
    test('usa nombreParaMostrar (nombre -> email -> id), horasTotales default 0, y "—" para carrera(s)/clave/progreso sin declarar', () => {
        const contenedor = document.createElement('table');
        renderResumenHoras([{ id: 'u1', email: 'sin-nombre@test.com' }], contenedor);
        const fila = contenedor.querySelector('tr');
        assert.equal(fila.children[0].textContent, 'sin-nombre@test.com');
        assert.equal(fila.children[1].textContent, '—');
        assert.equal(fila.children[2].textContent, '—');
        assert.equal(fila.children[3].textContent, '0');
        assert.equal(fila.children[4].textContent, '—');
    });

    test('con carrera(s) declaradas: pinta la lista unida por coma, la clave, y la barra de progreso', () => {
        const contenedor = document.createElement('table');
        renderResumenHoras([{ id: 'u1', nombre: 'Ana', carreras: ['Economía', 'Derecho'], claveUnica: '123456', horasTotales: 96 }], contenedor);
        const fila = contenedor.querySelector('tr');
        assert.equal(fila.children[1].textContent, 'Economía, Derecho');
        assert.equal(fila.children[2].textContent, '123456');
        assert.match(fila.children[4].textContent, /96 de 960 horas \(10%\)/);
    });
});

describe('crearBarraProgresoHoras', () => {
    test('calcula el porcentaje y el ancho del relleno', () => {
        const barra = crearBarraProgresoHoras(240, 480);
        assert.equal(barra.querySelector('.horas-progress-fill').style.width, '50%');
        assert.equal(barra.querySelector('.horas-progreso-texto').textContent, '240 de 480 horas (50%)');
    });

    test('objetivo superado: el texto muestra el número real (>100%) pero el ancho se limita a 100%', () => {
        const barra = crearBarraProgresoHoras(600, 480);
        assert.equal(barra.querySelector('.horas-progress-fill').style.width, '100%');
        assert.equal(barra.querySelector('.horas-progreso-texto').textContent, '600 de 480 horas (125%)');
    });

    test('objetivo 0 (sin carreras) -> 0%, sin dividir entre cero', () => {
        const barra = crearBarraProgresoHoras(5, 0);
        assert.equal(barra.querySelector('.horas-progreso-texto').textContent, '5 de 0 horas (0%)');
    });
});

describe('crearCheckboxesCarreras', () => {
    test('pinta un checkbox por carrera del catálogo, marcado solo para las seleccionadas', () => {
        const contenedor = document.createElement('div');
        contenedor.appendChild(crearCheckboxesCarreras(['Economía']));
        const checkboxes = [...contenedor.querySelectorAll('input[type="checkbox"]')];

        assert.equal(checkboxes.length, 15);
        assert.equal(checkboxes.filter((cb) => cb.checked).length, 1);
        assert.equal(checkboxes.find((cb) => cb.value === 'Economía').checked, true);
    });

    test('sin argumento, nada viene marcado', () => {
        const contenedor = document.createElement('div');
        contenedor.appendChild(crearCheckboxesCarreras());
        assert.equal(contenedor.querySelectorAll('input:checked').length, 0);
    });
});

describe('calcularBadgeProyecto', () => {
    const AHORA = new Date(2026, 7, 29); // sábado 2026-08-29, ver constructor local en otros tests de fecha

    test('activo sin fechaObjetivo -> badge "activo"', () => {
        assert.deepEqual(
            calcularBadgeProyecto({ estado: 'activo', fechaObjetivo: null }, AHORA),
            { tipo: 'activo', texto: 'Activo' }
        );
    });

    test('activo con fechaObjetivo lejana (>7 días) -> badge "activo", no "fecha"', () => {
        assert.deepEqual(
            calcularBadgeProyecto({ estado: 'activo', fechaObjetivo: '2026-12-25' }, AHORA),
            { tipo: 'activo', texto: 'Activo' }
        );
    });

    test('activo con fechaObjetivo dentro de 7 días -> badge "fecha" con la fecha', () => {
        assert.deepEqual(
            calcularBadgeProyecto({ estado: 'activo', fechaObjetivo: '2026-09-02' }, AHORA),
            { tipo: 'fecha', texto: '2026-09-02' }
        );
    });

    test('activo con fechaObjetivo ya vencida -> sigue siendo "fecha" (más urgente aún)', () => {
        assert.deepEqual(
            calcularBadgeProyecto({ estado: 'activo', fechaObjetivo: '2026-08-01' }, AHORA),
            { tipo: 'fecha', texto: '2026-08-01' }
        );
    });

    test('pausado o completado -> sin badge, con o sin fechaObjetivo', () => {
        assert.equal(calcularBadgeProyecto({ estado: 'pausado', fechaObjetivo: '2026-09-02' }, AHORA), null);
        assert.equal(calcularBadgeProyecto({ estado: 'completado', fechaObjetivo: null }, AHORA), null);
    });

    test('default de `ahora` es "ahora" real — no lanza sin segundo argumento', () => {
        assert.doesNotThrow(() => calcularBadgeProyecto({ estado: 'activo', fechaObjetivo: null }));
    });
});

describe('renderGaleriaProyectos', () => {
    function proyectoBase(overrides = {}) {
        return {
            id: 'p1', nombre: 'Cosecha de otoño', descripcion: 'Preparar las 3 camas del ala norte',
            estado: 'activo', fechaObjetivo: null,
            pasos: [
                { tareaId: 't1', orden: 1, tarea: { titulo: 'Arar', estado: 'completada' } },
                { tareaId: 't2', orden: 2, tarea: { titulo: 'Sembrar', estado: 'pendiente' } }
            ],
            totalPasos: 2, pasosCompletados: 1,
            ...overrides
        };
    }

    test('pinta nombre, descripción, texto de progreso y ancho de la barra', () => {
        const contenedor = document.createElement('div');
        renderGaleriaProyectos([proyectoBase()], contenedor, () => {});

        assert.equal(contenedor.querySelector('.proyecto-card-nombre').textContent, 'Cosecha de otoño');
        assert.equal(contenedor.querySelector('.proyecto-card-descripcion').textContent, 'Preparar las 3 camas del ala norte');
        assert.equal(contenedor.querySelector('.proyecto-card-progreso-texto').textContent, '1 de 2 pasos completados');
        assert.equal(contenedor.querySelector('.progress-fill').style.width, '50%');
    });

    test('checklist: check verde para completado, círculo vacío para pendiente, mismo orden que pasos[]', () => {
        const contenedor = document.createElement('div');
        renderGaleriaProyectos([proyectoBase()], contenedor, () => {});

        const marcas = [...contenedor.querySelectorAll('.proyecto-checklist-marca')].map((m) => m.textContent);
        assert.deepEqual(marcas, ['✅', '⚪']);
        const titulos = [...contenedor.querySelectorAll('.proyecto-checklist-titulo')].map((t) => t.textContent);
        assert.deepEqual(titulos, ['Arar', 'Sembrar']);
    });

    test('paso con tarea:null (borrada) muestra "(tarea eliminada)" sin lanzar', () => {
        const contenedor = document.createElement('div');
        const proyecto = proyectoBase({ pasos: [{ tareaId: 'x', orden: 1, tarea: null }], totalPasos: 1, pasosCompletados: 0 });
        assert.doesNotThrow(() => renderGaleriaProyectos([proyecto], contenedor, () => {}));
        assert.equal(contenedor.querySelector('.proyecto-checklist-titulo').textContent, '(tarea eliminada)');
    });

    test('clic en un paso dispara onClickPaso con el paso completo', () => {
        const contenedor = document.createElement('div');
        const clicks = [];
        renderGaleriaProyectos([proyectoBase()], contenedor, (paso) => clicks.push(paso.tareaId));

        contenedor.querySelectorAll('.proyecto-checklist-item')[1].dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.deepEqual(clicks, ['t2']);
    });

    test('"+ Agregar paso" solo aparece si esAdmin=true, y dispara onAgregarPaso con el id del proyecto', () => {
        const contenedorAdmin = document.createElement('div');
        const llamados = [];
        renderGaleriaProyectos([proyectoBase()], contenedorAdmin, () => {}, { esAdmin: true, onAgregarPaso: (id) => llamados.push(id) });
        const boton = contenedorAdmin.querySelector('.proyecto-card button');
        assert.ok(boton);
        boton.dispatchEvent(new window.Event('click', { bubbles: true }));
        assert.deepEqual(llamados, ['p1']);

        const contenedorNoAdmin = document.createElement('div');
        renderGaleriaProyectos([proyectoBase()], contenedorNoAdmin, () => {}, { esAdmin: false });
        assert.equal(contenedorNoAdmin.querySelector('.proyecto-card button'), null);
    });

    test('proyecto sin descripción no pinta el párrafo (sin estado vacío forzado)', () => {
        const contenedor = document.createElement('div');
        renderGaleriaProyectos([proyectoBase({ descripcion: '' })], contenedor, () => {});
        assert.equal(contenedor.querySelector('.proyecto-card-descripcion'), null);
    });
});
