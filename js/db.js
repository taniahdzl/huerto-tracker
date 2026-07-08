// js/db.js
import { getFirestore, collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const db = getFirestore();

export async function obtenerCatalogo() {
    const snapshot = await getDocs(collection(db, "catalogo_semillas"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function obtenerCamas() {
    const snapshot = await getDocs(collection(db, "camas_cosecha"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function actualizarCama(camaId, datos, emailUsuario) {
    const camaRef = doc(db, "camas_cosecha", camaId);
    await updateDoc(camaRef, datos);
    // Log automático
    await addDoc(collection(db, "registro_actividad"), {
        usuario: emailUsuario,
        accion: "ACTUALIZAR_CAMA",
        entidad: camaId,
        fecha: serverTimestamp()
    });
}