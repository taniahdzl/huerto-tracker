// js/session.js
//
// Única fuente de verdad para "quién está logueado ahora mismo", consumida
// por los módulos de datos (db.js, chores.js) para sus propios _logActividad
// privados. auth.js sigue siendo la autoridad real de sesión (onAuthStateChanged);
// main.js es quien copia el usuario aquí tras cada cambio, para que los
// servicios de datos no necesiten importar auth.js directamente.

let _usuario = null;

export function setUsuarioActual(usuario) {
    _usuario = usuario;
}

export function getUsuarioActual() {
    return _usuario;
}
