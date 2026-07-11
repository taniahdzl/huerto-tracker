// js/render.js
//
// Capa de pintado. No sabe qué es Firestore, no importa nada de firebase.js
// ni de db.js — solo recibe arrays de datos ya resueltos y un contenedor
// del DOM, y escupe HTML. Toda la carga de datos vive en main.js.
//
// ── Shape de `plantas` (catalogo_semillas) ─────────────────────────
// Verificado contra scripts/upload.js (única fuente real de estos datos):
//   { id, nombre, tipo, dias_siembra_a_cosecha,
//     requerimientos: { agua_mm_semana, nitrogeno, fosforo, potasio },
//     condiciones_optimas: { fotoperiodo, temp_optima, cm_entre_plantas, profundidad_raiz_cm } }
// No existe campo `emoji` en los documentos reales — se deriva de `tipo`.
//
// ── Shape de `camas` (camas_cosecha) ────────────────────────────────
// Confirmado por el esquema oficial (Fase 5) + plantaNombre/plantaTipo
// denormalizados en main.js para que este módulo no necesite el catálogo:
//   { id, nombre, col, fila, plantaId, plantaNombre, plantaTipo,
//     fechaSiembra, fechaTrasplante, suelo:{N,P,K}, composta, notas, plagas }
//
// Desde la Fase de camas en espiral, `camas_cosecha` también contiene
// documentos con tipo:'arco'|'circular' (geometría polar, array `plantas[]`
// — ver diagnóstico de espiral). renderMapaHuerto asume grid cartesiano y
// NUNCA debe recibirlos: main.js filtra a tipo:'rectangular' (o sin `tipo`,
// documentos anteriores a este cambio) antes de llamar esta función.

// Exportados: son la fuente de verdad visual del tipo de planta para toda
// la app, incluida la vista en espiral (render-spiral-2d.js) — no debe
// existir una segunda copia de este mapa ni de su fallback en otro módulo.
export const EMOJI_POR_TIPO = {
    hoja:    '🥬',
    'raíz':  '🥕',
    fruto:   '🍅',
    flor:    '🌸',
    tallo:   '🌱',
    semilla: '🌰'
};

export function emojiDePlanta(tipo) {
    return EMOJI_POR_TIPO[tipo] || '🌿';
}

export function renderCatalogo(plantas, contenedor) {
    const fragment = document.createDocumentFragment();

    plantas.forEach((planta) => {
        const tipo = (planta.tipo || 'desconocido').trim().toLowerCase();

        const card = document.createElement('div');
        card.className = 'plant-card';
        card.dataset.plantId = planta.id;
        card.dataset.tipo = tipo;

        const icon = document.createElement('div');
        icon.className = 'plant-icon';
        icon.textContent = emojiDePlanta(tipo);

        const info = document.createElement('div');
        info.className = 'plant-info';

        const name = document.createElement('div');
        name.className = 'plant-name';
        name.textContent = planta.nombre || 'Sin nombre';

        const meta = document.createElement('div');
        meta.className = 'plant-meta';
        meta.textContent = planta.dias_siembra_a_cosecha
            ? `${planta.dias_siembra_a_cosecha} días`
            : 'Días sin definir';

        info.append(name, meta);

        const badge = document.createElement('span');
        badge.className = `type-badge type-${tipo}`;
        badge.textContent = tipo;

        card.append(icon, info, badge);
        fragment.appendChild(card);
    });

    contenedor.replaceChildren(fragment);
}

export function renderMapaHuerto(camas, contenedor) {
    const fragment = document.createDocumentFragment();
    let maxCol = 1;

    camas.forEach((cama) => {
        maxCol = Math.max(maxCol, Number(cama.col) || 1);

        const bedClasses = ['bed'];
        if (cama.plantaId) bedClasses.push('has-plant');
        if (cama.plagas) bedClasses.push('alert-plaga');

        const bed = document.createElement('div');
        bed.className = bedClasses.join(' ');
        bed.dataset.bedId = cama.id;
        bed.style.gridColumn = String(cama.col || 1);
        bed.style.gridRow = String(cama.fila || 1);

        const inner = document.createElement('div');
        inner.className = 'bed-inner';

        const label = document.createElement('div');
        label.className = 'bed-label';
        label.textContent = cama.nombre || cama.id;
        inner.appendChild(label);

        if (cama.plantaId) {
            const tipo = (cama.plantaTipo || '').trim().toLowerCase();

            const icon = document.createElement('span');
            icon.className = 'bed-plant-icon';
            icon.textContent = emojiDePlanta(tipo);
            inner.appendChild(icon);

            const name = document.createElement('div');
            name.className = 'bed-plant-name';
            name.textContent = cama.plantaNombre || 'Planta sin nombre';
            inner.appendChild(name);

            if (cama.fechaSiembra) {
                const dias = document.createElement('div');
                dias.className = 'bed-days';
                dias.textContent = `Sembrado: ${cama.fechaSiembra}`;
                inner.appendChild(dias);
            }
        } else {
            const hint = document.createElement('div');
            hint.className = 'bed-empty-hint';
            hint.textContent = 'Vacía';
            inner.appendChild(hint);
        }

        if (cama.plagas) {
            const alerts = document.createElement('div');
            alerts.className = 'bed-alerts';

            const plagaIcon = document.createElement('span');
            plagaIcon.className = 'alert-dot ad-plaga';
            plagaIcon.title = cama.plagas;
            plagaIcon.textContent = '🐛';
            alerts.appendChild(plagaIcon);

            inner.appendChild(alerts);
        }

        bed.appendChild(inner);
        fragment.appendChild(bed);
    });

    contenedor.style.gridTemplateColumns = `repeat(${maxCol}, 1fr)`;
    contenedor.replaceChildren(fragment);
}

// ── Shape de `tareas` ────────────────────────────────────────────
//   { id, titulo, estado: "pendiente"|"completada", asignados: [uid,...] }

export function renderListaTareas(tareas, contenedor, onCompletarClick) {
    const fragment = document.createDocumentFragment();

    tareas.forEach((tarea) => {
        const completada = tarea.estado === 'completada';

        const li = document.createElement('li');
        li.className = completada ? 'chore-item completada' : 'chore-item';
        li.dataset.tareaId = tarea.id;

        const titulo = document.createElement('span');
        titulo.className = 'chore-item-titulo';
        titulo.textContent = tarea.titulo || 'Sin título';
        li.appendChild(titulo);

        if (!completada) {
            const btn = document.createElement('button');
            btn.className = 'chore-complete-btn';
            btn.textContent = '✅ Completar';
            btn.addEventListener('click', () => onCompletarClick(tarea.id));
            li.appendChild(btn);
        }

        fragment.appendChild(li);
    });

    contenedor.replaceChildren(fragment);
}
