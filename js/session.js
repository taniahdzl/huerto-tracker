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

// Fase 14.1: fallback único nombre → email — vive aquí (no en usuarios.js)
// para que db.js/chores.js/usuarios.js puedan usarlo sin crear un import
// circular (usuarios.js ya importa de chores.js). Acepta tanto el objeto
// de sesión ({uid,email,nombre}) como un documento usuarios/{uid} crudo
// ({id,email,nombre,...}) — por eso el último fallback es id O uid.
export function nombreParaMostrar(usuario) {
    if (!usuario) return '';
    if (usuario.nombre && usuario.nombre.trim()) return usuario.nombre;
    return usuario.email || usuario.id || usuario.uid || '';
}
