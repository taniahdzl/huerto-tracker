// js/render.js
//
// Capa de pintado. No sabe qué es Firestore, no importa nada de firebase.js
// ni de db.js — solo recibe arrays de datos ya resueltos y un contenedor
// del DOM, y escupe HTML. Toda la carga de datos vive en main.js.
//
// session.js es la única excepción a "sin imports": es un módulo de
// identidad puro (sin firebase.js/db.js detrás), aporta nombreParaMostrar
// (Fase 14.1) para no duplicar el fallback nombre→email→id aquí.

import { nombreParaMostrar } from './session.js';

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

// Mismo criterio que EMOJI_POR_TIPO — única fuente de verdad, reutilizada
// por render-spiral-2d.js para el anillo de progreso de cada ficha en
// estado normal. Los valores son EXACTAMENTE el `color` (no el `background`)
// de las clases .type-* declaradas en el <style> de index.html:144-149 —
// no existe una variable CSS compartida entre ambos, así que si esas reglas
// cambian, este mapa se actualiza a mano.
export const COLOR_POR_TIPO = {
    hoja:    '#2e7d32',
    'raíz':  '#e65100',
    fruto:   '#c62828',
    flor:    '#6a1b9a',
    tallo:   '#283593',
    semilla: '#558b2f'
};

export function colorDePlanta(tipo) {
    return COLOR_POR_TIPO[tipo] || '#757575';
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
//   { id, titulo, estado: "pendiente"|"completada", asignados: [uid,...],
//     fechaCreacion, asignadosNombres: [string,...] }
// `asignadosNombres` es opcional y se denormaliza en main.js (mismo patrón
// que plantaNombre/plantaTipo en camas) — este módulo no conoce el
// directorio de usuarios, solo pinta lo que ya viene resuelto.

export function renderListaTareas(tareas, contenedor, onCompletarClick, { esAdmin = false } = {}) {
    const fragment = document.createDocumentFragment();

    tareas.forEach((tarea) => {
        const completada = tarea.estado === 'completada';

        const li = document.createElement('li');
        li.className = completada ? 'chore-item completada' : 'chore-item';
        li.dataset.tareaId = tarea.id;

        const info = document.createElement('div');
        info.className = 'chore-item-info';

        const titulo = document.createElement('span');
        titulo.className = 'chore-item-titulo';
        titulo.textContent = tarea.titulo || 'Sin título';
        info.appendChild(titulo);

        const asignados = document.createElement('span');
        asignados.className = 'chore-item-asignados';
        asignados.textContent = (tarea.asignadosNombres && tarea.asignadosNombres.length)
            ? tarea.asignadosNombres.join(', ')
            : 'Sin asignar';
        info.appendChild(asignados);

        li.appendChild(info);

        // RBAC de cliente: la seguridad real está en firestore.rules
        // (create/update/delete de `tareas` es admin-only) — esto solo
        // evita ofrecer un botón que el backend va a rechazar.
        if (!completada && esAdmin) {
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

// ── Shape de cada tipo en la vista de Catálogos (Fase 13.6b) ────────
//   semillas:     { id, nombre, tipo, dias_siembra_a_cosecha, ... } (real, ver upload.js)
//   quimicos:     { id, nombre, notas_uso }
//   herramientas: { id, nombre, cantidad, categoria } (sin precedente, propuesto en 13.6b)
//
// No sabe de dónde vienen los items (Firestore, filtro por categoria,
// búsqueda) — main.js ya le entrega la lista filtrada/buscada exacta a
// pintar. `puedeEditar`/`puedeEliminar` son booleanos ya resueltos por
// main.js según tipo + rol — este módulo no conoce RBAC, solo obedece.
export function renderListaCatalogos(tipo, items, contenedor, { puedeEditar, puedeEliminar, onEditar, onEliminar }) {
    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'catalogo-item';
        li.dataset.itemId = item.id;

        const info = document.createElement('div');
        info.className = 'catalogo-item-info';

        const nombre = document.createElement('span');
        nombre.className = 'catalogo-item-nombre';
        nombre.textContent = item.nombre || 'Sin nombre';
        info.appendChild(nombre);

        const meta = document.createElement('span');
        meta.className = 'catalogo-item-meta';
        if (tipo === 'semillas') {
            meta.textContent = `${item.tipo || '—'} · ${item.dias_siembra_a_cosecha ?? '—'} días`;
        } else if (tipo === 'quimicos') {
            meta.textContent = item.notas_uso || 'Sin notas';
        } else {
            meta.textContent = `Cantidad: ${item.cantidad ?? '—'}`;
        }
        info.appendChild(meta);

        li.appendChild(info);

        if (puedeEditar) {
            const editarBtn = document.createElement('button');
            editarBtn.className = 'chore-complete-btn';
            editarBtn.textContent = '✏ Editar';
            editarBtn.addEventListener('click', () => onEditar(tipo, item.id));
            li.appendChild(editarBtn);
        }

        if (puedeEliminar) {
            const eliminarBtn = document.createElement('button');
            eliminarBtn.className = 'chore-complete-btn catalogo-eliminar-btn';
            eliminarBtn.textContent = '🗑 Eliminar';
            eliminarBtn.addEventListener('click', () => onEliminar(tipo, item.id));
            li.appendChild(eliminarBtn);
        }

        fragment.appendChild(li);
    });

    contenedor.replaceChildren(fragment);
}

// ── Vista de Admin (Fase 13.8) ───────────────────────────────────────
// registro_actividad ya guarda `usuario: usuario.email` en cada entrada
// (ver _logActividad en db.js/chores.js/usuarios.js) — es un identificador
// estable, no un display name (Fase 14.1: a propósito no se usa nombre
// aquí, el nombre es editable por el propio usuario). Si algún día se
// quiere mostrar el nombre en esta tabla, se resuelve en tiempo de
// lectura (join contra el directorio por email/uid), igual que ya hace
// obtenerSesionConDetalle con `asistentes` — nunca se congela dentro del
// documento de log.
export function renderRegistroActividad(entradas, contenedor) {
    const fragment = document.createDocumentFragment();

    entradas.forEach((entrada) => {
        const tr = document.createElement('tr');

        const fecha = document.createElement('td');
        fecha.textContent = entrada.fecha?.toDate
            ? entrada.fecha.toDate().toLocaleString('es-MX')
            : '—';
        tr.appendChild(fecha);

        const tipo = document.createElement('td');
        tipo.textContent = entrada.tipo || '—';
        tr.appendChild(tipo);

        const entidad = document.createElement('td');
        entidad.textContent = entrada.entidad || '—';
        tr.appendChild(entidad);

        const detalle = document.createElement('td');
        detalle.textContent = entrada.detalle || '—';
        tr.appendChild(detalle);

        const quien = document.createElement('td');
        quien.textContent = entrada.usuario || entrada.uid || '—';
        tr.appendChild(quien);

        fragment.appendChild(tr);
    });

    contenedor.replaceChildren(fragment);
}

// `estudiantes` viene de obtenerDirectorioEstudiantes() — ya trae
// horasTotales, ver diagnóstico de Fase 13.8. Orden descendente aplicado
// aquí, sin mutar el array recibido.
export function renderResumenHoras(estudiantes, contenedor) {
    const fragment = document.createDocumentFragment();
    const ordenados = [...estudiantes].sort((a, b) => (b.horasTotales ?? 0) - (a.horasTotales ?? 0));

    ordenados.forEach((estudiante) => {
        const tr = document.createElement('tr');

        const nombre = document.createElement('td');
        nombre.textContent = nombreParaMostrar(estudiante);
        tr.appendChild(nombre);

        const horas = document.createElement('td');
        horas.textContent = estudiante.horasTotales ?? 0;
        tr.appendChild(horas);

        fragment.appendChild(tr);
    });

    contenedor.replaceChildren(fragment);
}
