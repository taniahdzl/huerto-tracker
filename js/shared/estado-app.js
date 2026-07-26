// js/estado-app.js
//
// esAdminActual: flag de RBAC/UI puro (perfil.rol de Firestore, no el
// usuario de Firebase Auth que guarda session.js) — deliberadamente
// separado de session.js, que es identidad de capa servicio consumida por
// db.js/chores.js para _logActividad. Mezclar este flag ahí difuminaría la
// separación servicio/UI que AI_CONTEXT.md marca como pendiente. Extraído
// de main.js (Fase 19, división en módulos por vista).

let _esAdminActual = false;

export function getEsAdminActual() {
    return _esAdminActual;
}

export function setEsAdminActual(valor) {
    _esAdminActual = valor;
}
