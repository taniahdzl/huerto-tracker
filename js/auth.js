// js/auth.js
import {
    auth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from './firebase.js'; // Todo pasa por la instancia única, nunca por el CDN directo

// Estado interno (privado al módulo)
let _currentUser = null;

export const AuthService = {
    // Inicialización del servicio
    init(onAuthChangeCallback) {
        onAuthStateChanged(auth, (user) => {
            _currentUser = user;
            onAuthChangeCallback(user);
        });
    },

    // Métodos de acceso
    async login(email, password) {
        return await signInWithEmailAndPassword(auth, email, password);
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