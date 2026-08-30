// js/services/firebase.js
//
// Punto único de inicialización de Firebase. Ningún otro módulo debe
// importar directamente del CDN de Firebase ni llamar initializeApp():
// todos los servicios importan sus instancias (db, auth) y helpers desde aquí.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore,
    collection, doc,
    onSnapshot,
    addDoc, updateDoc, deleteDoc, setDoc, getDoc, getDocs,
    query, where, orderBy, limit, serverTimestamp, Timestamp,
    writeBatch, increment, arrayUnion,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

let firebaseConfig;
try {
    ({ firebaseConfig } = await import('./config.js'));
} catch (e) {
    throw new Error(
        '[firebase] Falta js/services/config.js. Copia js/services/config.example.js a js/services/config.js ' +
        'y agrega tus credenciales reales de Firebase (ver README).',
        { cause: e }
    );
}

if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.startsWith('REEMPLAZAR_')) {
    throw new Error(
        '[firebase] js/services/config.js existe pero firebaseConfig.apiKey sigue siendo un ' +
        'placeholder. Reemplaza los valores con tus credenciales reales de Firebase ' +
        'Console (Configuración del proyecto → General → Tus apps).'
    );
}

const app = initializeApp(firebaseConfig);

// ── Instancias principales ───────────────────────────────────────
export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);

// ── Colecciones (fuente de verdad: Firestore, no Realtime Database) ──
export const PATHS = {
    catalogo:    'catalogo_semillas',
    camas:       'camas_cosecha',
    actividad:   'registro_actividad',
    tareas:      'tareas',
    asistencias: 'asistencias',
    usuarios:    'usuarios',
    quimicos:    'catalogo_quimicos',
    inventario:  'inventario_general',
    historial:   'historial_cultivo',
    bitacora:    'bitacora_sesiones',
    proyectos:   'proyectos'
};

// ── Re-exports de Firestore/Auth ─────────────────────────────────
// Los módulos de servicios (db.js, futuros *.service.js) solo importan
// de aquí, nunca del CDN directo.
export {
    collection, doc,
    onSnapshot,
    addDoc, updateDoc, deleteDoc, setDoc, getDoc, getDocs,
    query, where, orderBy, limit, serverTimestamp, Timestamp,
    writeBatch, increment, arrayUnion,
    getCountFromServer,
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
    storageRef, uploadBytes, getDownloadURL
};
