// test/storage.test.js
//
// js/services/storage.js contra un Storage falso (test/helpers/
// firebase-mock.js) — mismo criterio que chores.test.js: mock.module()
// antes del import dinámico de storage.js.
//
// Corre con: npm test

import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseMock } from './helpers/firebase-mock.js';

const firebaseUrl = new URL('../js/services/firebase.js', import.meta.url).href;
const firebaseMock = createFirebaseMock();
mock.module(firebaseUrl, { namedExports: firebaseMock.exports });

const { subirEvidenciaTarea } = await import('../js/services/storage.js');

beforeEach(() => firebaseMock.reset());

describe('subirEvidenciaTarea', () => {
    test('sube a evidencia_tareas/{tareaId}.jpg y devuelve la URL de descarga', async () => {
        const blobFalso = { size: 123, type: 'image/jpeg' };
        const url = await subirEvidenciaTarea('t1', blobFalso);
        assert.equal(url, 'mock://storage/evidencia_tareas/t1.jpg');
    });

    test('un tareaId distinto sube a un path distinto', async () => {
        await subirEvidenciaTarea('a', {});
        const url = await subirEvidenciaTarea('b', {});
        assert.equal(url, 'mock://storage/evidencia_tareas/b.jpg');
    });
});
