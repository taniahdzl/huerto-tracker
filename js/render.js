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
// ── Shape de `camas` (camas_cosecha), tipo:'arco'|'circular' ────────
// Ver diagnóstico de espiral (geometria-espiral.js) para el shape completo
// — este módulo ya no pinta camas, solo aporta emojiDePlanta/colorDePlanta
// como fuente de verdad visual compartida (ver abajo).
//
// tipo:'rectangular' (col/fila/plantaId planos, sin `plantas[]`) fue el
// esquema original de camas_cosecha — su renderer (renderMapaHuerto) y todo
// el flujo de creación/edición (#appRoot, bedModal) se retiraron en Fase 15
// por no tener ya ningún documento real de ese tipo (confirmado en fases
// previas) ni punto de entrada en la SPA. La colección y el esquema en
// Firestore NO cambiaron — si algún día existiera un documento tipo:
// 'rectangular' real, obtenerCamas() lo sigue trayendo igual, simplemente
// ya no hay UI que lo pinte.

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
// estado normal. Históricamente estos valores eran una copia manual del
// `color` de las clases .type-* que pintaba el viejo renderCatalogo (index.
// html) — esas reglas CSS se retiraron en Fase 15 junto con renderCatalogo
// (su único consumidor), pero este mapa es independiente en tiempo de
// ejecución (nunca leyó la CSS, solo se sincronizaba a mano) y sigue siendo
// válido tal cual sin ellas.
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

// renderCatalogo/renderMapaHuerto (camas tipo 'rectangular') retiradas en
// Fase 15 junto con #appRoot/bedModal, sus únicos consumidores — ver
// diagnóstico. `.plant-card`/`.plant-icon`/`.plant-info`/`.plant-name`
// (CSS) NO se tocaron: renderPanelCatalogoArrastrable (main.js, Fase
// 14.6b) las reutiliza para el panel de arrastre de view-gemelo.

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

// ── Bitácora de sesiones (PASO F) ────────────────────────────────────
// `sesiones` viene de obtenerBitacoraSesiones() (db.js), ya ordenada
// descendente por fecha — este módulo no reordena. Asistentes/tareas
// completadas de cada sesión NO se resuelven acá (este módulo no importa
// db.js) — onExpandirClick(sesion, contenedorDetalle) es responsabilidad
// de main.js, que sí puede llamar obtenerSesionConDetalle(fecha) al
// expandir, sin duplicar esa lógica aquí ni pedir un shape distinto.
export function renderListaBitacora(sesiones, contenedor, onExpandirClick) {
    const fragment = document.createDocumentFragment();

    sesiones.forEach((sesion) => {
        const li = document.createElement('li');
        li.className = 'chore-item';
        li.dataset.sesionId = sesion.id;

        const info = document.createElement('div');
        info.className = 'chore-item-info';

        const fecha = document.createElement('span');
        fecha.className = 'chore-item-titulo';
        fecha.textContent = sesion.fecha;
        info.appendChild(fecha);

        const resumen = document.createElement('span');
        resumen.className = 'chore-item-asignados';
        resumen.textContent = sesion.resumen || 'Sin resumen';
        info.appendChild(resumen);

        if (sesion.pendientes) {
            const pendientes = document.createElement('span');
            pendientes.className = 'chore-item-asignados';
            pendientes.textContent = `📌 ${sesion.pendientes}`;
            info.appendChild(pendientes);
        }

        li.appendChild(info);

        const detalleContenedor = document.createElement('div');
        detalleContenedor.className = 'bitacora-detalle';
        detalleContenedor.style.display = 'none';

        const detalleBtn = document.createElement('button');
        detalleBtn.className = 'chore-complete-btn';
        detalleBtn.textContent = '👥 Ver asistentes/tareas';
        detalleBtn.addEventListener('click', () => onExpandirClick(sesion, detalleContenedor));
        li.appendChild(detalleBtn);

        li.appendChild(detalleContenedor);

        fragment.appendChild(li);
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
