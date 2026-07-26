// test/db.test.js
//
// js/services/db.js contra el Firestore falso — el módulo de servicios más
// grande del proyecto. geometria-espiral.js (proximaPosicionDisponible,
// usada por agregarPlantaACama) NO se mockea — es un módulo puro sin DOM ni
// Firebase, ya cubierto por test/geometria-espiral.test.js; acá solo se
// verifica que agregarPlantaACama arme el objeto de planta nuevo con los
// campos esperados, no la geometría en sí (eso duplicaría esa suite).
//
// Ver cabecera de test/chores.test.js para el orden mock.module() -> import
// dinámico. db.js importa chores.js/usuarios.js internamente
// (obtenerSesionConDetalle) — mismo mock de firebase.js cubre la cadena
// completa.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';
import { setUsuarioActual } from '../js/services/session.js';

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const {
    obtenerRegistroActividad, extraerLinkIndice,
    obtenerBitacoraSesiones, crearBitacoraSesion, obtenerSesionConDetalle,
    obtenerCatalogo, crearCatalogo, actualizarCatalogo, eliminarCatalogo,
    obtenerCamas,
    obtenerQuimicos, crearQuimico, actualizarQuimico, eliminarQuimico,
    obtenerInventario, crearInventario, actualizarInventario, eliminarInventario,
    crearHistorialCultivo, marcarParaSemilla, agregarPlantaACama,
    actualizarDetalleCama
} = await import('../js/services/db.js');

beforeEach(() => {
    firebaseMock.reset();
    setUsuarioActual(null);
});

describe('extraerLinkIndice', () => {
    test('extrae el link de consola de Firebase de un mensaje de error FAILED_PRECONDITION', () => {
        const error = new Error('9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc123');
        assert.equal(extraerLinkIndice(error), 'https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc123');
    });

    test('devuelve null si el error no trae un link de índice', () => {
        assert.equal(extraerLinkIndice(new Error('otro error cualquiera')), null);
        assert.equal(extraerLinkIndice(null), null);
        assert.equal(extraerLinkIndice(undefined), null);
    });
});

describe('obtenerRegistroActividad', () => {
    test('sin filtros: ordena por fecha desc y respeta `cantidad`', async () => {
        firebaseMock.seed('registro_actividad', {
            l1: { tipo: 'X', fecha: { __ts: true, millis: 1 } },
            l2: { tipo: 'X', fecha: { __ts: true, millis: 3 } },
            l3: { tipo: 'X', fecha: { __ts: true, millis: 2 } }
        });

        const resultado = await obtenerRegistroActividad({ cantidad: 2 });
        assert.deepEqual(resultado.map((r) => r.id), ['l2', 'l3']);
    });

    test('combina filtros de tipo + uid + rango de fecha', async () => {
        firebaseMock.seed('registro_actividad', {
            match:    { tipo: 'CREAR_TAREA', uid: 'u1', fecha: { __ts: true, millis: 50 } },
            otroTipo: { tipo: 'ELIMINAR_TAREA', uid: 'u1', fecha: { __ts: true, millis: 50 } },
            otroUid:  { tipo: 'CREAR_TAREA', uid: 'u2', fecha: { __ts: true, millis: 50 } },
            fueraDeRango: { tipo: 'CREAR_TAREA', uid: 'u1', fecha: { __ts: true, millis: 999 } }
        });

        const resultado = await obtenerRegistroActividad({
            tipo: 'CREAR_TAREA',
            uid: 'u1',
            desde: new Date(0),
            hasta: new Date(100)
        });

        assert.deepEqual(resultado.map((r) => r.id), ['match']);
    });
});

describe('obtenerBitacoraSesiones', () => {
    test('ordena por fecha desc (string YYYY-MM-DD ordena bien lexicográficamente)', async () => {
        firebaseMock.seed('bitacora_sesiones', {
            s1: { fecha: '2026-07-20' },
            s2: { fecha: '2026-07-25' },
            s3: { fecha: '2026-07-22' }
        });
        const resultado = await obtenerBitacoraSesiones();
        assert.deepEqual(resultado.map((s) => s.id), ['s2', 's3', 's1']);
    });
});

describe('crearBitacoraSesion', () => {
    test('default de pendientes a cadena vacía si no viene, y registra actividad', async () => {
        setUsuarioActual({ uid: 'admin1', email: 'a@test.com' });
        const id = await crearBitacoraSesion({ fecha: '2026-07-26', resumen: 'Todo bien' });

        const guardada = firebaseMock.leerDoc('bitacora_sesiones', id);
        assert.equal(guardada.pendientes, '');
        assert.equal(firebaseMock.leerColeccion('registro_actividad')[0].tipo, 'CREAR_BITACORA');
    });
});

describe('obtenerSesionConDetalle', () => {
    test('deriva asistentes (por nombre) y tareas completadas (por título) de las asistencias del día', async () => {
        firebaseMock.seed('bitacora_sesiones', { s1: { fecha: '2026-07-26', resumen: 'x' } });
        firebaseMock.seed('asistencias', {
            a1: { estudianteId: 'u1', fecha: '2026-07-26', tareaId: 't1' },
            a2: { estudianteId: 'u1', fecha: '2026-07-26', tareaId: 't1' }, // mismo estudiante+tarea, no debe duplicar
            a3: { estudianteId: 'u2', fecha: '2026-07-26', tareaId: null }, // ajuste manual, sin tarea
            a4: { estudianteId: 'u3', fecha: 'otro-dia', tareaId: 't2' }    // otro día, excluida
        });
        firebaseMock.seed('tareas', { t1: { titulo: 'Regar' } });
        firebaseMock.seed('usuarios', {
            u1: { nombre: 'Ana', rol: 'estudiante' },
            u2: { rol: 'estudiante' } // sin nombre -> nombreParaMostrar cae a email/id
        });

        const { sesiones, asistentes, tareasCompletadas } = await obtenerSesionConDetalle('2026-07-26');

        assert.equal(sesiones.length, 1);
        assert.deepEqual(asistentes.sort(), ['Ana', 'u2']); // u2 sin nombre/email -> cae al id
        assert.deepEqual(tareasCompletadas, ['Regar']);
    });
});

describe('Catálogo (catalogo_semillas)', () => {
    test('crearCatalogo deriva el id del nombre (slug) y rechaza si ya existe', async () => {
        const id = await crearCatalogo({ nombre: 'Tomate Cherry', tipo: 'fruto' });
        assert.equal(id, 'tomate_cherry');
        assert.equal(firebaseMock.leerDoc('catalogo_semillas', id).tipo, 'fruto');

        await assert.rejects(
            () => crearCatalogo({ nombre: 'Tomate Cherry' }),
            /Ya existe una planta/
        );
    });

    test('obtenerCatalogo lista todo, actualizarCatalogo hace merge parcial, eliminarCatalogo borra', async () => {
        firebaseMock.seed('catalogo_semillas', { p1: { nombre: 'Lechuga', tipo: 'hoja' } });

        assert.equal((await obtenerCatalogo()).length, 1);

        await actualizarCatalogo('p1', { tipo: 'hoja-modificada' });
        assert.equal(firebaseMock.leerDoc('catalogo_semillas', 'p1').nombre, 'Lechuga'); // intacto

        await eliminarCatalogo('p1');
        assert.equal(firebaseMock.leerDoc('catalogo_semillas', 'p1'), null);
    });
});

describe('obtenerCamas', () => {
    test('lista todas las camas tal cual, sin filtrar por tipo', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'arco' }, c2: { tipo: 'rectangular' } });
        assert.equal((await obtenerCamas()).length, 2);
    });
});

describe('Químicos (catalogo_quimicos)', () => {
    test('crearQuimico usa addDoc con notas_uso default vacío', async () => {
        const id = await crearQuimico({ nombre: 'Fungicida X' });
        const guardado = firebaseMock.leerDoc('catalogo_quimicos', id);
        assert.equal(guardado.notas_uso, '');
    });

    test('actualizar y eliminar', async () => {
        firebaseMock.seed('catalogo_quimicos', { q1: { nombre: 'X', notas_uso: '' } });
        await actualizarQuimico('q1', { notas_uso: 'usar con guantes' });
        assert.equal(firebaseMock.leerDoc('catalogo_quimicos', 'q1').notas_uso, 'usar con guantes');
        await eliminarQuimico('q1');
        assert.equal(firebaseMock.leerDoc('catalogo_quimicos', 'q1'), null);
    });
});

describe('Inventario (inventario_general)', () => {
    test('crearInventario usa categoria default "herramienta"', async () => {
        const id = await crearInventario({ nombre: 'Pala' });
        assert.equal(firebaseMock.leerDoc('inventario_general', id).categoria, 'herramienta');
    });

    test('crearInventario respeta categoria explícita', async () => {
        const id = await crearInventario({ nombre: 'Semillas extra', categoria: 'insumo' });
        assert.equal(firebaseMock.leerDoc('inventario_general', id).categoria, 'insumo');
    });

    test('actualizarInventario NO reaplica el default si `categoria` no viene en el update', async () => {
        firebaseMock.seed('inventario_general', { i1: { nombre: 'Pala', categoria: 'herramienta' } });
        await actualizarInventario('i1', { nombre: 'Pala nueva' });
        assert.equal(firebaseMock.leerDoc('inventario_general', 'i1').categoria, 'herramienta');
    });

    test('eliminarInventario borra el documento', async () => {
        firebaseMock.seed('inventario_general', { i1: { nombre: 'Pala' } });
        await eliminarInventario('i1');
        assert.equal(firebaseMock.leerDoc('inventario_general', 'i1'), null);
    });
});

describe('crearHistorialCultivo', () => {
    test('exige sesión activa', async () => {
        await assert.rejects(
            () => crearHistorialCultivo({ camaId: 'c1', plantaEntry: {} }),
            /Debes iniciar sesión/
        );
    });

    test('cama arco/circular: escribe el historial y filtra la planta de plantas[] por instanciaId, atómico', async () => {
        setUsuarioActual({ uid: 'admin1', email: 'a@test.com' });
        firebaseMock.seed('camas_cosecha', {
            c1: {
                tipo: 'arco',
                plantas: [
                    { instanciaId: 'inst-1', plantaId: 'tomate', plantaTipo: 'fruto', fechaSiembra: '2026-01-01', finalidad: 'cosecha' },
                    { instanciaId: 'inst-2', plantaId: 'lechuga', plantaTipo: 'hoja', fechaSiembra: '2026-01-02', finalidad: 'cosecha' }
                ]
            }
        });
        firebaseMock.seed('catalogo_semillas', { tomate: { nombre: 'Tomate Cherry' } });

        const historialId = await crearHistorialCultivo({
            camaId: 'c1',
            plantaEntry: { instanciaId: 'inst-1', plantaId: 'tomate', plantaTipo: 'fruto', fechaSiembra: '2026-01-01', finalidad: 'cosecha' },
            rendimiento: 'alto',
            cantidadObtenida: '3kg',
            notaCierre: null
        });

        const historial = firebaseMock.leerDoc('historial_cultivo', historialId);
        assert.equal(historial.plantaNombre, 'Tomate Cherry');
        assert.equal(historial.rendimiento, 'alto');
        assert.equal(historial.registradoPor, 'admin1');

        const camaActualizada = firebaseMock.leerDoc('camas_cosecha', 'c1');
        assert.equal(camaActualizada.plantas.length, 1);
        assert.equal(camaActualizada.plantas[0].instanciaId, 'inst-2');
    });

    test('cama rectangular: limpia los campos planos en vez de tocar plantas[]', async () => {
        setUsuarioActual({ uid: 'admin1', email: 'a@test.com' });
        firebaseMock.seed('camas_cosecha', {
            c1: { tipo: 'rectangular', plantaId: 'tomate', plantaNombre: 'Tomate', plantaTipo: 'fruto', fechaSiembra: '2026-01-01' }
        });

        await crearHistorialCultivo({
            camaId: 'c1',
            plantaEntry: { plantaId: 'tomate', plantaTipo: 'fruto', fechaSiembra: '2026-01-01' },
            rendimiento: 'medio'
        });

        const camaActualizada = firebaseMock.leerDoc('camas_cosecha', 'c1');
        assert.equal(camaActualizada.plantaId, null);
        assert.equal(camaActualizada.plantaNombre, null);
    });

    test('rechaza si la cama no existe', async () => {
        setUsuarioActual({ uid: 'admin1', email: 'a@test.com' });
        await assert.rejects(
            () => crearHistorialCultivo({ camaId: 'no-existe', plantaEntry: { plantaId: 'x' } }),
            /La mesa no existe/
        );
    });

    test('rechaza si otra persona ya cerró esa instancia (no está en plantas[])', async () => {
        setUsuarioActual({ uid: 'admin1', email: 'a@test.com' });
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'arco', plantas: [] } });

        await assert.rejects(
            () => crearHistorialCultivo({ camaId: 'c1', plantaEntry: { instanciaId: 'ya-no-esta', plantaId: 'x' } }),
            /ya no está en la cama/
        );
    });
});

describe('marcarParaSemilla', () => {
    test('alterna cosecha <-> semilla por instanciaId, sin tocar otras plantas', async () => {
        firebaseMock.seed('camas_cosecha', {
            c1: {
                tipo: 'arco',
                plantas: [
                    { instanciaId: 'i1', plantaId: 'tomate', finalidad: 'cosecha' },
                    { instanciaId: 'i2', plantaId: 'lechuga', finalidad: 'cosecha' }
                ]
            }
        });

        await marcarParaSemilla('c1', 'i1');
        let cama = firebaseMock.leerDoc('camas_cosecha', 'c1');
        assert.equal(cama.plantas.find((p) => p.instanciaId === 'i1').finalidad, 'semilla');
        assert.equal(cama.plantas.find((p) => p.instanciaId === 'i2').finalidad, 'cosecha');

        await marcarParaSemilla('c1', 'i1'); // toggle de vuelta
        cama = firebaseMock.leerDoc('camas_cosecha', 'c1');
        assert.equal(cama.plantas.find((p) => p.instanciaId === 'i1').finalidad, 'cosecha');
    });

    test('rechaza en camas rectangulares', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'rectangular' } });
        await assert.rejects(() => marcarParaSemilla('c1', 'i1'), /solo aplica a camas arco\/circular/);
    });

    test('rechaza si el instanciaId no está en la cama', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'arco', plantas: [] } });
        await assert.rejects(() => marcarParaSemilla('c1', 'no-existe'), /ya no está en la cama/);
    });
});

describe('agregarPlantaACama', () => {
    test('agrega una entrada nueva con instanciaId, plantaTipo denormalizado, finalidad cosecha y posición calculada', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'arco', anillo: 'interior', indiceSegmento: 0, plantas: [] } });
        firebaseMock.seed('catalogo_semillas', { tomate: { nombre: 'Tomate', tipo: 'fruto' } });

        const nuevaPlanta = await agregarPlantaACama('c1', 'tomate');

        assert.ok(nuevaPlanta.instanciaId);
        assert.equal(nuevaPlanta.plantaId, 'tomate');
        assert.equal(nuevaPlanta.plantaTipo, 'fruto');
        assert.equal(nuevaPlanta.finalidad, 'cosecha');
        assert.equal(typeof nuevaPlanta.t, 'number'); // cama arco -> coordenadas {t, r}
        assert.equal(typeof nuevaPlanta.r, 'number');

        const camaActualizada = firebaseMock.leerDoc('camas_cosecha', 'c1');
        assert.equal(camaActualizada.plantas.length, 1);
    });

    test('rechaza si la cama no existe o no es arco/circular', async () => {
        await assert.rejects(() => agregarPlantaACama('no-existe', 'tomate'), /La mesa no existe/);

        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'rectangular' } });
        await assert.rejects(() => agregarPlantaACama('c1', 'tomate'), /solo aplica a camas arco\/circular/);
    });

    test('plantaTipo queda null si la planta no está en el catálogo (sin inventar datos)', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'circular', plantas: [] } });
        const nuevaPlanta = await agregarPlantaACama('c1', 'planta-fantasma');
        assert.equal(nuevaPlanta.plantaTipo, null);
    });
});

describe('actualizarDetalleCama', () => {
    test('merge parcial: solo toca los campos enviados', async () => {
        firebaseMock.seed('camas_cosecha', { c1: { tipo: 'arco', notas: 'vieja', plantas: [{ instanciaId: 'i1' }] } });
        await actualizarDetalleCama('c1', { notas: 'nueva', plagas: 'pulgón' });

        const cama = firebaseMock.leerDoc('camas_cosecha', 'c1');
        assert.equal(cama.notas, 'nueva');
        assert.equal(cama.plagas, 'pulgón');
        assert.equal(cama.plantas.length, 1); // intacto
    });
});
