// js/geometria-espiral.js
//
// Módulo puro (sin DOM, sin Firebase) — única fuente de verdad de la forma
// física del huerto en espiral. Traduce identidad geométrica ({anillo,
// indiceSegmento} o 'circular') a ángulos/radios reales usando los
// parámetros ya aprobados, y traduce la posición de cada planta dentro de
// su cama a una coordenada cartesiana final. Tanto el renderer 2D como el
// 3D consumen este módulo para no divergir nunca entre sí.
//
// ── plantas[] tiene DOS formas distintas según el `tipo` de la cama padre.
// NO es un shape único con campos opcionales — angle/r y t no son
// intercambiables ni coexisten en el mismo documento. Modelarlo como una
// interfaz genérica con todos los campos opcionales es incorrecto: nadie
// podría saber cuáles aplican sin mirar `tipo` primero, que es exactamente
// lo que esta unión discriminada evita.
//
//   tipo: 'arco' → cada planta usa POSICIÓN ANGULAR NORMALIZADA dentro del
//   segmento de esa cama, no una coordenada polar completa:
//     { instanciaId, plantaId, plantaTipo, t, fechaSiembra, fechaTrasplante, notas, finalidad }
//     - instanciaId: string único (crypto.randomUUID()) generado por quien
//       siembra la planta. Es el único campo que identifica esta entrada de
//       forma estable — plantaId se repite si hay dos plantas de la misma
//       especie en la misma cama, así que crearHistorialCultivo/
//       marcarParaSemilla (db.js) buscan por instanciaId, nunca por plantaId
//       ni comparando el objeto completo.
//     - t: number entre 0 y 1. t=0 → anguloInicio del segmento (calculado
//       a partir de {anillo, indiceSegmento} + parámetros aprobados),
//       t=1 → anguloFin del mismo segmento.
//     - El radio NO se guarda por planta — se asume fijo al punto medio
//       del ancho de la cama: (radioInterior + radioExterior) / 2. Así lo
//       calculaba el editor 2D ya validado; no hay campo de radio aquí.
//     - finalidad: 'cosecha' | 'semilla', default 'cosecha' si el campo no
//       existe (agregado en Fase 13.6b, entradas más viejas pueden no
//       tenerlo todavía).
//
//   tipo: 'circular' (la cama central) → cada planta usa una coordenada
//   POLAR COMPLETA, porque el centro no es un arco con inicio/fin:
//     { instanciaId, plantaId, plantaTipo, angle, r, fechaSiembra, fechaTrasplante, notas, finalidad }
//     - instanciaId/finalidad: mismo significado que en 'arco' (ver arriba).
//     - angle: number entre 0 y 360 (grados).
//     - r: number entre 0 y radioCentro. El editor 2D lo topaba en
//       radioCentro * 0.75 (no se permite sembrar hasta el borde exacto).
//
// ── Parámetros aprobados (ver diagnóstico de espiral) ───────────────
const PARAMS = {
    numSegmentosPorAnillo:      4,
    gapDeg:                     16,   // ancho de camino entre camas
    rotacionAnilloExterior:     45,   // offset en grados vs. anillo interior (0°)
    radioCentro:                0.30,
    separacionCentroInterior:   0.12,
    anchoCamaInterior:          0.30,
    separacionInteriorExterior: 0.14,
    anchoCamaExterior:          0.40,
    alturaPared:                0.38
};

function radiosAnillo(anillo) {
    const radioInternoInterior = PARAMS.radioCentro + PARAMS.separacionCentroInterior;
    const radioExternoInterior = radioInternoInterior + PARAMS.anchoCamaInterior;
    const radioInternoExterior = radioExternoInterior + PARAMS.separacionInteriorExterior;
    const radioExternoExterior = radioInternoExterior + PARAMS.anchoCamaExterior;

    return anillo === 'interior'
        ? { radioInterno: radioInternoInterior, radioExterno: radioExternoInterior }
        : { radioInterno: radioInternoExterior, radioExterno: radioExternoExterior };
}

// Exportada (no solo interna): los renderers necesitan las 4 esquinas
// cartesianas de un sector anular (radio interno/externo × ángulo
// inicio/fin) para dibujar el contenedor, y ninguna otra función de este
// módulo devuelve un punto arbitrario — solo posiciones de planta a un
// radio fijo. Reutilizarla aquí evita que un renderer escriba su propia
// conversión polar→cartesiana (que sería trigonometría duplicada, no
// centralizada).
export function polarACartesiano(anguloGrados, radio) {
    const rad = anguloGrados * (Math.PI / 180);
    return { x: radio * Math.cos(rad), y: radio * Math.sin(rad) };
}

// {anillo, indiceSegmento} → geometría real del arco. Cada anillo se divide
// en 4 "slots" de 90°; el segmento ocupa 90° - gapDeg (74°), centrado en su
// slot (mitad del camino a cada lado), para que los vanos entre camas
// vecinas — incluyendo el que envuelve de vuelta al primer segmento — sean
// simétricos. El anillo exterior arranca con un offset de 45° respecto al
// interior (rotaciónAnilloExterior), tal como en el diseño aprobado.
// Nota para quien construya el renderer (Paso 3): con rotacionAnilloExterior
// = 45°, el segmento 3 del anillo exterior cruza la costura 0°/360°
// (anguloInicio=323, anguloFin=397 — no normalizado). No afecta a
// posicionPlantaEnArco (Math.cos/sin son periódicas), pero si construyes
// un <path> SVG o geometría 3D con una API que espere ángulos en [0,360),
// aplica `% 360` a ese segmento específico antes de pasarlo.
export function calcularGeometriaArco(anillo, indiceSegmento) {
    if (anillo !== 'interior' && anillo !== 'exterior') {
        throw new Error(`anillo inválido: ${anillo}`);
    }
    if (!Number.isInteger(indiceSegmento) || indiceSegmento < 0 || indiceSegmento >= PARAMS.numSegmentosPorAnillo) {
        throw new Error(`indiceSegmento fuera de rango: ${indiceSegmento}`);
    }

    const slotSpan    = 360 / PARAMS.numSegmentosPorAnillo; // 90°
    const segmentSpan = slotSpan - PARAMS.gapDeg;             // 74°
    const rotacionBase = anillo === 'exterior' ? PARAMS.rotacionAnilloExterior : 0;

    const inicioSlot    = indiceSegmento * slotSpan + rotacionBase;
    const anguloInicio  = inicioSlot + PARAMS.gapDeg / 2;
    const anguloFin     = anguloInicio + segmentSpan;

    const { radioInterno, radioExterno } = radiosAnillo(anillo);

    return { anguloInicio, anguloFin, radioInterno, radioExterno, alturaPared: PARAMS.alturaPared };
}

export function calcularGeometriaCentro() {
    return { radio: PARAMS.radioCentro, alturaPared: PARAMS.alturaPared };
}

// tipo:'arco' → t normalizado [0,1] dentro del segmento de esa cama.
// Radio fijo al punto medio del ancho de cama (ver cabecera del módulo).
export function posicionPlantaEnArco(anillo, indiceSegmento, t) {
    if (t < 0 || t > 1) throw new Error(`t fuera de rango [0,1]: ${t}`);

    const { anguloInicio, anguloFin, radioInterno, radioExterno } = calcularGeometriaArco(anillo, indiceSegmento);
    const angulo = anguloInicio + t * (anguloFin - anguloInicio);
    const radio  = (radioInterno + radioExterno) / 2;

    return polarACartesiano(angulo, radio);
}

// tipo:'circular' → coordenada polar completa. El editor 2D topaba r en
// radioCentro * 0.75 (no se siembra hasta el borde exacto de la cama).
export function posicionPlantaEnCentro(angle, r) {
    const limite = PARAMS.radioCentro * 0.75;
    if (r < 0 || r > limite) throw new Error(`r fuera de rango [0, ${limite}]: ${r}`);

    return polarACartesiano(angle, r);
}
