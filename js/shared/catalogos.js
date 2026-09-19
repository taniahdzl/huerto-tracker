// js/shared/catalogos.js
//
// Catálogo de carreras + regla de horas objetivo (2026-09-18). Módulo hoja,
// sin imports — mismo criterio que router.js: lo consumen tanto
// js/services/usuarios.js (validación al escribir) como js/render/render.js
// (checkboxes + barra de progreso) y varias vistas, sin crear un ciclo
// services->render ni duplicar la lista en dos archivos.
//
// Lista confirmada con la usuaria 2026-09-18 (incluye la corrección de
// "Ingeniería en Computación", con typo en la lista original, y el alta
// posterior de "Matemáticas Aplicadas") — orden alfabético para que el
// checklist de carreras se lea fácil, no el orden en que se dictaron.
export const CARRERAS = [
    'Actuaría',
    'Administración',
    'Ciencia de Datos',
    'Ciencia Política',
    'Contaduría',
    'Derecho',
    'Dirección Financiera',
    'Dirección de Mercadotecnia',
    'Economía',
    'Ingeniería en Computación',
    'Ingeniería en Mecatrónica',
    'Ingeniería Industrial',
    'Inteligencia Artificial',
    'Matemáticas Aplicadas',
    'Relaciones Internacionales'
];

// Cada carrera exige 480h aprobadas; dos carreras simultáneas no promedian
// ni comparten el objetivo — cada una suma sus propias 480h (960h totales
// para dos). Confirmado con la usuaria 2026-09-18.
export const HORAS_OBJETIVO_POR_CARRERA = 480;

// Nunca se guarda en Firestore — se recalcula siempre desde `carreras`
// (mismo criterio que pasosCompletados/totalPasos en Proyectos: un valor
// derivado guardado aparte se puede desincronizar, este no).
export function calcularHorasObjetivo(carreras) {
    return (carreras?.length ?? 0) * HORAS_OBJETIVO_POR_CARRERA;
}
