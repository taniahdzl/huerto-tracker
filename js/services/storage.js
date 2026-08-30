// js/services/storage.js
//
// Sube evidencia de tareas a Cloud Storage. Un archivo por tarea
// (evidencia_tareas/{tareaId}.jpg) — una subida nueva reemplaza a la
// anterior, no se versiona. No conoce el DOM: recibe un Blob ya
// comprimido (ver comprimirImagen en vista-tareas.js) y devuelve la URL
// de descarga pública, mismo patrón de servicio plano que chores.js/db.js.

import { storage, storageRef, uploadBytes, getDownloadURL } from './firebase.js';

export async function subirEvidenciaTarea(tareaId, blob) {
    const ref = storageRef(storage, `evidencia_tareas/${tareaId}.jpg`);
    await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
    return getDownloadURL(ref);
}
