// js/auth.js
//
// ── Contrato del evento 'auth:resuelto' ─────────────────────────────
//
// AuthService.init() ya NO acepta callback. Arranca onAuthStateChanged
// internamente y despacha un CustomEvent('auth:resuelto') en `document`
// cada vez que el estado de sesión termina de resolverse. Quien quiera
// reaccionar (main.js: Splash, el guard de VISTAS_ADMIN, etc.) escucha
// con document.addEventListener('auth:resuelto', handler) — nunca pasa
// un callback a init().
//
// Nota de alcance: la única superficie de DOM que toca este archivo es
// `document.dispatchEvent()` — un bus de eventos, no manipulación de UI.
// auth.js no hace querySelector, no lee/escribe .style ni .classList, no
// conoce ningún id de HTML. Si esto no es lo que se quiso decir con
// "sin DOM", avisar antes de que se construya nada sobre este contrato.
//
// event.detail shape:
//   { user: FirebaseUser | null, rol: string | null, error: Error | null }
//
// El evento SOLO se dispara cuando el estado ya está resuelto —no existe
// un estado "cargando" representado en el evento. "Cargando" es la
// AUSENCIA de evento: se representa mostrando Splash por defecto en el
// HTML (visible sin esperar nada) hasta que llegue el primer
// 'auth:resuelto', que decide a dónde ir desde ahí.
//
// Los 4 casos posibles del payload:
//
//   1. Sin sesión:
//        { user: null, rol: null, error: null }
//      auth.currentUser es null. `rol` es null aquí, pero NO significa
//      "falta Setup" — significa "no hay nadie logueado". Quien consuma
//      el evento DEBE chequear `user` antes que `rol` para no confundir
//      este caso con el 2.
//
//   2. Con sesión, sin perfil (falta Setup):
//        { user: {...}, rol: null, error: null }
//      Login válido, pero usuarios/{uid} no existe todavía — primer
//      login de esa persona. Es el ÚNICO caso real de "falta Setup", y
//      se distingue del caso 1 solo por `user` no ser null.
//
//   3. Con sesión, con perfil:
//        { user: {...}, rol: 'estudiante'|'externo'|'admin', error: null }
//      Login válido y usuarios/{uid} existe. `rol` nunca es cadena
//      vacía ni undefined en este caso.
//
//   4. Con sesión, error consultando el perfil:
//        { user: {...}, rol: null, error: Error }
//      Login válido, pero obtenerUsuario(uid) falló (red, permisos,
//      etc.). Se ve IGUAL que el caso 2 en user/rol — la única
//      diferencia es `error`. Quien consuma el evento debe chequear
//      `error` ANTES que `rol`: si no, alguien con perfil real que no
//      se pudo leer por una falla transitoria terminaría en el flujo de
//      registro, e intentar registrarUsuario() de nuevo sobre un uid
//      que ya tiene documento se evalúa como `update` (no `create`) en
//      las reglas — no truena, pero sobreescribe silenciosamente el
//      perfil existente con los valores del formulario de Setup.

import {
    auth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from './firebase.js'; // Todo pasa por la instancia única, nunca por el CDN directo
import { obtenerUsuario } from './usuarios.js';

// Estado interno (privado al módulo)
let _currentUser = null;

export const AuthService = {
    // Arranca el listener de sesión. No recibe callback — ver contrato arriba.
    init() {
        onAuthStateChanged(auth, async (user) => {
            _currentUser = user;

            if (!user) {
                document.dispatchEvent(new CustomEvent('auth:resuelto', {
                    detail: { user: null, rol: null, error: null }
                }));
                return;
            }

            let rol = null;
            let error = null;
            try {
                const perfil = await obtenerUsuario(user.uid);
                rol = perfil ? perfil.rol : null;
            } catch (e) {
                error = e;
            }

            document.dispatchEvent(new CustomEvent('auth:resuelto', {
                detail: { user, rol, error }
            }));
        });
    },

    // Métodos de acceso
    async loginConGoogle() {
        return await signInWithPopup(auth, new GoogleAuthProvider());
    },

    async logout() {
        return await signOut(auth);
    },

    getCurrentUser() {
        return _currentUser;
    },

    isAuthenticated() {
        return _currentUser !== null;
    }
};
