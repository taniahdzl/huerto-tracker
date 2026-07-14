// scripts/generate-config.js
//
// Genera js/config.js a partir de variables de entorno FIREBASE_* — pensado
// para correr como buildCommand en Vercel (ver vercel.json), donde
// js/config.js nunca se commitea (.gitignore) y no puede escribirse a mano.
//
// Mismo criterio "fail-loud" que ya usa js/firebase.js con config.js
// faltante/placeholder: si falta una variable de entorno, el build debe
// fallar visiblemente aquí, no generar un config.js a medias que recién
// falle en el navegador de quien visite el sitio.
//
// Campos EXACTOS que espera `firebaseConfig` en js/firebase.js (confirmado
// contra js/config.example.js, no el shape estándar de Firebase — este
// proyecto no usa messagingSenderId ni measurementId):
//   apiKey, authDomain, projectId, storageBucket, appId

const fs = require('fs');
const path = require('path');

const CAMPOS = [
    { env: 'FIREBASE_API_KEY',        campo: 'apiKey' },
    { env: 'FIREBASE_AUTH_DOMAIN',    campo: 'authDomain' },
    { env: 'FIREBASE_PROJECT_ID',     campo: 'projectId' },
    { env: 'FIREBASE_STORAGE_BUCKET', campo: 'storageBucket' },
    { env: 'FIREBASE_APP_ID',         campo: 'appId' }
];

const faltantes = CAMPOS.filter(({ env }) => !process.env[env] || !process.env[env].trim());

if (faltantes.length > 0) {
    console.error(
        '[generate-config] Faltan variables de entorno requeridas: ' +
        faltantes.map(({ env }) => env).join(', ') + '.\n' +
        '[generate-config] Configúralas en el proyecto de Vercel ' +
        '(Settings → Environment Variables) con los valores de Firebase ' +
        'Console → Configuración del proyecto → General → Tus apps.'
    );
    process.exit(1);
}

const valores = Object.fromEntries(CAMPOS.map(({ env, campo }) => [campo, process.env[env].trim()]));

const contenido = `// GENERADO AUTOMÁTICAMENTE — no editar a mano.
// Producido por scripts/generate-config.js a partir de variables de entorno
// FIREBASE_* durante el build. Este archivo no se commitea (ver .gitignore).

export const firebaseConfig = {
    apiKey:        "${valores.apiKey}",
    authDomain:    "${valores.authDomain}",
    projectId:     "${valores.projectId}",
    storageBucket: "${valores.storageBucket}",
    appId:         "${valores.appId}"
};
`;

const destino = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(destino, contenido);
console.log(`[generate-config] js/config.js generado correctamente (projectId: ${valores.projectId}).`);
