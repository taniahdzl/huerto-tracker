// js/ai.js
//
// Capa de "inteligencia" del asistente del huerto. No importa nada de
// Firebase ni toca el DOM — recibe texto y contexto, devuelve texto.
// main.js es responsable de pintar la conversación.
//
// TODO: la llamada real a la API de Gemini debe vivir detrás de una Cloud
// Function (o función serverless equivalente) que guarde la API key del
// lado del servidor. GitHub Pages es hosting 100% estático: no hay dónde
// esconder una API key en el cliente sin exponerla en el Network tab de
// cualquier visitante. No implementar la llamada real hasta que exista
// ese backend — ver AI_CONTEXT.md, Paso 2 (Seguridad).

export async function generarRespuestaHuerto(mensajeUsuario, contextoHuerto) {
    await new Promise((resolve) => setTimeout(resolve, 600)); // simula latencia de red

    const totalCamas    = contextoHuerto?.camas?.length ?? 0;
    const totalPlantas  = contextoHuerto?.catalogo?.length ?? 0;

    return `Analizando el huerto… (${totalCamas} mesas, ${totalPlantas} plantas en catálogo). ` +
           'El asistente real todavía no está conectado — esto es una respuesta simulada.';
}
