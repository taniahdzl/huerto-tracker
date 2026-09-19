// js/shared/tipos-tarea.js
//
// Catálogo de tipos de actividad + multiplicador de horas (2026-09-19) —
// reemplaza tipo:'asistencia'|'individual'. Módulo hoja, sin imports,
// mismo criterio que shared/catalogos.js: lo consumen tanto
// js/services/chores.js (validación + cálculo al escribir) como
// js/render/render.js y las vistas (checkboxes/selects, preview en vivo),
// sin crear un ciclo services->render ni duplicar la tabla en dos archivos.
//
// Confirmado con la usuaria 2026-09-19: las horas que la persona ingresa
// son SIEMPRE horas efectivas (trabajo real) — `horasAOtorgar` es
// horasEfectivas × multiplicador, redondeado al entero más cercano (ej.
// Trabajo físico en sábado: 4h efectivas × 3.7 = 14.8 -> 15h, no 14.8).
export const TIPOS_TAREA = {
    riego:          { label: 'Riego',                    multiplicador: 2 },
    trabajo_fisico: { label: 'Trabajo físico (sábados)',  multiplicador: 3.7 },
    redes:          { label: 'Redes',                     multiplicador: 1.5 },
    comunidad:      { label: 'Comunidad',                 multiplicador: 2 },
    investigacion:  { label: 'Investigación',             multiplicador: 2.5 },
    hoyos_composta: { label: 'Hoyos/composta',             multiplicador: 7 }
};

export function esTipoValido(tipo) {
    return Object.prototype.hasOwnProperty.call(TIPOS_TAREA, tipo);
}

// horasEfectivas es lo que la persona reporta haber trabajado — nunca lo
// que se le otorga directamente. Redondeado al entero más cercano
// (confirmado con la usuaria: 14.8 -> 15, no se deja el decimal).
export function calcularHorasAOtorgar(tipo, horasEfectivas) {
    const config = TIPOS_TAREA[tipo];
    if (!config) {
        throw new Error(`[tipos-tarea] tipo inválido: ${tipo}`);
    }
    return Math.round((Number(horasEfectivas) || 0) * config.multiplicador);
}
