// js/geometria-espiral.js
//
// Módulo puro (sin DOM, sin Firebase) — única fuente de verdad de la forma
// física del huerto en espiral. Traduce identidad geométrica ({anillo,
// indiceSegmento} o 'circular') a ángulos/radios reales usando los
// parámetros ya aprobados, y traduce la posición de cada planta dentro de
// su cama a una coordenada cartesiana final. Tanto el renderer 2D como el
// 3D consumen este módulo para no divergir nunca entre sí.
//
// ── Shape a nivel de CAMA (no de planta) para tipo:'arco'|'circular' ────
// Campos compartidos por ambos tipos, fuera de `plantas[]`:
//   { id, tipo: 'arco'|'circular', plantas: [...], notas? }
//   (+ anillo/indiceSegmento solo si tipo:'arco' — ver calcularGeometriaArco)
// - notas: string opcional (Fase 14.5) — nota de texto libre SOBRE LA CAMA
//   completa (ej. plan de rotación, observación general), NO sobre una
//   planta individual — no confundir con plantaEntry.notas (documentado
//   abajo, dentro de plantas[]), que es un campo distinto y sigue sin
//   implementarse en ningún flujo real. Puede estar ausente — los 9
//   documentos de prueba de PASO C no lo tenían hasta esta fase, y no hubo
//   backfill retroactivo del resto; se trata como cualquier otro campo
//   opcional (mismo criterio que dias_siembra_a_cosecha en el catálogo:
//   nunca se sustituye por un default inventado, el fallback vive en la UI).
//   No existe `nombre` como campo estándar tampoco (a diferencia de las
//   camas rectangulares) — quien consuma esto usa `cama.nombre || cama.id`.
//   No se agregan aquí `suelo`/`composta`/`plagas` (existen en camas
//   rectangulares, render.js:24) — fuera de alcance de esta fase, nadie
//   los pidió para arco/circular.
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
//     { instanciaId, plantaId, plantaTipo, t, r, fechaSiembra, fechaTrasplante, notas, finalidad }
//     - instanciaId: string único (crypto.randomUUID()) generado por quien
//       siembra la planta. Es el único campo que identifica esta entrada de
//       forma estable — plantaId se repite si hay dos plantas de la misma
//       especie en la misma cama, así que crearHistorialCultivo/
//       marcarParaSemilla (db.js) buscan por instanciaId, nunca por plantaId
//       ni comparando el objeto completo.
//     - t: number entre 0 y 1. t=0 → anguloInicio del segmento (calculado
//       a partir de {anillo, indiceSegmento} + parámetros aprobados),
//       t=1 → anguloFin del mismo segmento.
//     - r: number entre radioInterno y radioExterno del segmento (mismas
//       unidades nativas que radioCentro/anchoCamaInterior — ver PARAMS),
//       calculado por radiosAnillo(anillo). OPCIONAL — agregado en Fase
//       14.6a junto con proximaPosicionDisponible, que es quien lo genera
//       para plantas nuevas. Los 9 documentos de prueba de PASO C (y
//       cualquier entrada anterior a esta fase) NO lo tienen — sin
//       backfill retroactivo, mismo criterio que `finalidad` (Fase 13.6b)
//       y `notas` de cama (Fase 14.5): posicionPlantaEnArco usa el radio
//       real si `r` existe, y cae al punto medio histórico
//       (radioInterno+radioExterno)/2 si no — nunca inventa un valor ni
//       rompe con documentos viejos.
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

// Tamaño real de "ficha" (marcador de planta) en unidades nativas de este
// módulo — Fase 14.6a. Fuente de verdad para proximaPosicionDisponible
// (colocación automática, más abajo): esa función necesita el diámetro de
// una ficha en las MISMAS unidades que radioInterno/radioExterno/t, no en
// píxeles de un viewBox SVG que este módulo ni conoce ni debe conocer.
//
// RADIO_FICHA_PX=16 es el valor ya validado del renderer 2D (sin cambio en
// esta fase, solo se centraliza). ESCALA=300 es la conversión unidad-nativa
// → píxeles que render-spiral-2d.js eligió al construir el SVG (Paso 3):
// con radioExternoExterior=1.26 (ver PARAMS arriba), el sector más externo
// llega a ~378px de radio dentro de un viewBox dimensionado para ese
// tamaño — es una decisión de layout del renderer, no algo derivable de
// PARAMS, así que se duplica aquí de forma literal y documentada en vez de
// importarla desde render-spiral-2d.js: la dirección de dependencia entre
// los dos módulos es geometria-espiral.js → render-spiral-2d.js, nunca al
// revés, así que este archivo no puede importar nada de allá. Si ESCALA
// cambia en render-spiral-2d.js, debe cambiar aquí también (ambas
// declaraciones quedan comentadas apuntando una a la otra).
const RADIO_FICHA_PX = 16;
const ESCALA = 300; // debe coincidir siempre con ESCALA en render-spiral-2d.js
export const RADIO_FICHA_UNIDADES = RADIO_FICHA_PX / ESCALA;

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

// tipo:'arco' → t normalizado [0,1] dentro del segmento de esa cama, más
// `r` opcional (Fase 14.6a — ver cabecera del módulo). Si `r` es
// undefined/null (documentos anteriores a esta fase, incluyendo los 9 de
// PASO C), cae al punto medio histórico (radioInterno+radioExterno)/2 —
// el mismo valor que esta función siempre devolvía antes de 14.6a, así que
// ningún documento viejo cambia de posición. Si `r` viene explícito, se
// valida contra el rango real del segmento (mismo criterio que
// posicionPlantaEnCentro valida su `r` contra `limite`).
export function posicionPlantaEnArco(anillo, indiceSegmento, t, r) {
    if (t < 0 || t > 1) throw new Error(`t fuera de rango [0,1]: ${t}`);

    const { anguloInicio, anguloFin, radioInterno, radioExterno } = calcularGeometriaArco(anillo, indiceSegmento);

    let radio;
    if (r === undefined || r === null) {
        radio = (radioInterno + radioExterno) / 2;
    } else {
        if (r < radioInterno || r > radioExterno) {
            throw new Error(`r fuera de rango [${radioInterno}, ${radioExterno}]: ${r}`);
        }
        radio = r;
    }

    const angulo = anguloInicio + t * (anguloFin - anguloInicio);
    return polarACartesiano(angulo, radio);
}

// tipo:'circular' → coordenada polar completa. El editor 2D topaba r en
// radioCentro * 0.75 (no se siembra hasta el borde exacto de la cama).
export function posicionPlantaEnCentro(angle, r) {
    const limite = PARAMS.radioCentro * 0.75;
    if (r < 0 || r > limite) throw new Error(`r fuera de rango [0, ${limite}]: ${r}`);

    return polarACartesiano(angle, r);
}

// ── Colocación automática (Fase 14.6a) ──────────────────────────────
//
// proximaPosicionDisponible(cama, plantasExistentes) devuelve la posición
// de la PRÓXIMA ficha — {t, r} si cama.tipo==='arco', {angle, r} si
// cama.tipo==='circular' — calculada para no traslapar ninguna de las
// plantasExistentes ya colocadas. Las posiciones existentes se recalculan
// con posicionPlantaEnArco/posicionPlantaEnCentro (mismo fallback que usa
// el renderer), así que una planta vieja sin `r` se trata como el punto
// donde YA se está dibujando hoy, no como un punto distinto — de lo
// contrario esta función podría "liberar" espacio que en pantalla sigue
// ocupado.
//
// Estrategia: candidatos organizados en niveles radiales (arco) o anillos
// concéntricos (circular), evaluados del nivel más interior hacia afuera y,
// dentro de cada nivel, centro-hacia-afuera (Fase 16, precisado en Fase
// 16.4 — ver candidatosCentrados): el candidato central EXACTO del rango
// angular disponible primero, luego offsets simétricos crecientes hacia
// ambos lados (±paso, ±2·paso, …), en vez de recorrer de un extremo al
// otro. Con 1 ficha en un nivel vacío, cae en el centro geométrico exacto
// — no una aproximación —; con 2, quedan simétricas respecto a ese centro.
// (Fase 16 tenía una versión previa, ordenCentroHaciaAfuera, que reordenaba
// un grid fijo con ambos extremos incluidos — solo centrado de verdad
// cuando el número de slots del nivel era impar; con slots pares el
// "centro" quedaba corrido medio paso del centro real, confirmado con
// t=0.4 en vez de 0.5 en esa fase. candidatosCentrados lo reemplaza por
// completo.) La separación angular dentro de un nivel se calcula para que
// la distancia en línea recta (cuerda) entre centros a ese radio sea
// exactamente diametroFicha (2 * RADIO_FICHA_UNIDADES) — el nivel nunca se
// traslapa consigo mismo.
// La separación radial entre niveles contiguos es también diametroFicha,
// así que dos fichas en niveles vecinos alineadas en ángulo quedan justo a
// un diámetro de distancia (el mínimo aceptable, nunca menos). El primer
// candidato que no traslapa con NINGUNA planta existente (de cualquier
// nivel, no solo el propio) gana.
//
// Caso extremo (cama llena, ningún candidato libre): se DENIEGA (throw) en
// vez de apilar con superposición mínima o asumir que nunca ocurre.
// Apilar rompería la garantía de no-traslape que esta función existe para
// dar, y el resto del proyecto ya usa throw ante colisión/agotamiento
// (crearCatalogo, crearHistorialCultivo, marcarParaSemilla) en vez de
// degradar en silencio — mismo criterio aquí, no uno nuevo.
const EPS = 1e-9;

function diametroFicha() {
    return RADIO_FICHA_UNIDADES * 2;
}

// Distancia angular mínima (grados) para que la cuerda entre dos puntos al
// mismo radio `r` mida exactamente `diametro`. Si `r` es tan chico que ni
// separando 180° alcanza (diametro/(2r) > 1), no hay ángulo válido en ese
// nivel — se devuelve null y el llamador lo trata como "un solo candidato".
function anguloMinimoEnNivel(r, diametro) {
    const ratio = diametro / (2 * r);
    if (ratio > 1) return null;
    return 2 * Math.asin(ratio) * (180 / Math.PI);
}

function distancia(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function libreDeTraslape(candidato, posicionesExistentes, diametro) {
    return posicionesExistentes.every((p) => distancia(candidato, p) >= diametro - EPS);
}

// Fase 16.4: candidatos generados como offsets (grados) SIMÉTRICOS
// alrededor del centro de un rango de `span` grados: 0, +paso, -paso,
// +2·paso, -2·paso, … hasta que ninguno de los dos lados quepa ya dentro
// de [-span/2, span/2]. Por construcción, el primer candidato (offset 0)
// SIEMPRE es el centro geométrico exacto del rango — a diferencia del
// grid fijo que usaba esta función antes de esta fase (ver comentario de
// cabecera del módulo), no depende de la paridad de cuántos candidatos
// quepan en total. `paso`=null (anguloMinimoEnNivel devuelve null cuando
// el radio es tan chico que ni separando 180° cabe un segundo candidato)
// -> un único candidato, el centro.
function candidatosCentrados(span, paso) {
    const offsets = [0];
    if (paso === null) return offsets;
    for (let d = 1; ; d++) {
        const mas = d * paso;
        const menos = -mas;
        const masCabe = mas <= span / 2 + EPS;
        const menosCabe = menos >= -span / 2 - EPS;
        if (!masCabe && !menosCabe) break;
        if (masCabe) offsets.push(mas);
        if (menosCabe) offsets.push(menos);
    }
    return offsets;
}

function proximaPosicionArco(anillo, indiceSegmento, posicionesExistentes, diametro) {
    const { anguloInicio, anguloFin, radioInterno, radioExterno } = calcularGeometriaArco(anillo, indiceSegmento);
    const span = anguloFin - anguloInicio;

    // Niveles radiales: primero centrado a radioInterno + diametro/2, cada
    // siguiente diametro más afuera. Si la banda es más angosta que un
    // diámetro completo, un único nivel al punto medio — mismo valor que
    // el fallback histórico de posicionPlantaEnArco, para no inventar un
    // radio que ese fallback no reconocería.
    const niveles = [];
    if (radioExterno - radioInterno < diametro) {
        niveles.push((radioInterno + radioExterno) / 2);
    } else {
        for (let r = radioInterno + diametro / 2; r <= radioExterno - diametro / 2; r += diametro) {
            niveles.push(r);
        }
    }

    for (const r of niveles) {
        const dThetaMin = anguloMinimoEnNivel(r, diametro);
        for (const offset of candidatosCentrados(span, dThetaMin)) {
            // offset=0 -> t=0.5, el centro exacto del segmento. Clamp
            // defensivo: la tolerancia EPS de candidatosCentrados podría
            // dejar pasar un offset que empuje t infinitesimalmente fuera
            // de [0,1], y posicionPlantaEnArco valida ese rango con throw.
            const t = Math.min(1, Math.max(0, 0.5 + offset / span));
            const candidato = posicionPlantaEnArco(anillo, indiceSegmento, t, r);
            if (libreDeTraslape(candidato, posicionesExistentes, diametro)) {
                return { t, r };
            }
        }
    }

    throw new Error('No hay espacio disponible en este segmento para una planta más sin traslape.');
}

function proximaPosicionCentro(posicionesExistentes, diametro) {
    const limite = PARAMS.radioCentro * 0.75;

    // Nivel 0: un único slot en el centro exacto (r=0 — el ángulo no
    // importa, polarACartesiano(cualquier ángulo, 0) siempre da (0,0)).
    const niveles = [0];
    for (let r = diametro; r <= limite; r += diametro) {
        niveles.push(r);
    }

    for (const r of niveles) {
        if (r === 0) {
            const candidato = posicionPlantaEnCentro(0, 0);
            if (libreDeTraslape(candidato, posicionesExistentes, diametro)) {
                return { angle: 0, r: 0 };
            }
            continue;
        }
        const dThetaMin = anguloMinimoEnNivel(r, diametro);
        // Un anillo circular (r>0) es una vuelta CERRADA de 360° — a
        // diferencia de un segmento de arco, no tiene extremos ni un
        // "centro" geométrico real: por simetría rotacional, cualquier
        // punto del anillo es equivalente a cualquier otro. angle=0 se usa
        // aquí como referencia de arranque ARBITRARIA (ya lo era antes de
        // esta fase, solo que implícito en el código, no explicado) — es
        // una decisión de desempate determinista para que la función sea
        // reproducible, NO una afirmación de que ese punto sea especial.
        // Documentado a propósito para que quien lea esto no asuma lo
        // contrario.
        for (const offset of candidatosCentrados(360, dThetaMin)) {
            const angle = ((offset % 360) + 360) % 360;
            const candidato = posicionPlantaEnCentro(angle, r);
            if (libreDeTraslape(candidato, posicionesExistentes, diametro)) {
                return { angle, r };
            }
        }
    }

    throw new Error('No hay espacio disponible en la cama circular para una planta más sin traslape.');
}

export function proximaPosicionDisponible(cama, plantasExistentes) {
    const diametro = diametroFicha();
    const posicionesExistentes = (plantasExistentes || []).map((p) =>
        cama.tipo === 'circular'
            ? posicionPlantaEnCentro(p.angle, p.r)
            : posicionPlantaEnArco(cama.anillo, cama.indiceSegmento, p.t, p.r)
    );

    return cama.tipo === 'circular'
        ? proximaPosicionCentro(posicionesExistentes, diametro)
        : proximaPosicionArco(cama.anillo, cama.indiceSegmento, posicionesExistentes, diametro);
}
