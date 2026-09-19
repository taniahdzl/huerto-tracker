// js/render/render.js
//
// Capa de pintado. No sabe qué es Firestore, no importa nada de firebase.js
// ni de db.js — solo recibe arrays de datos ya resueltos y un contenedor
// del DOM, y escupe HTML. Toda la carga de datos vive en main.js.
//
// session.js es la única excepción a "sin imports": es un módulo de
// identidad puro (sin firebase.js/db.js detrás), aporta nombreParaMostrar
// (Fase 14.1) para no duplicar el fallback nombre→email→id aquí.

import { nombreParaMostrar } from '../services/session.js';
import { CARRERAS, calcularHorasObjetivo } from '../shared/catalogos.js';

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

// Leyenda de categorías (Catálogos + Gemelo): un único generador a partir
// de EMOJI_POR_TIPO/COLOR_POR_TIPO, para no repetir los 6 pares a mano en
// dos vistas. <details>/<summary> nativos dan el colapsable sin JS extra.
// Los nombres en español SON las claves del mapa (hoja/raíz/fruto/flor/
// tallo/semilla) — no existe una tercera lista de nombres que mantener
// sincronizada, solo se capitaliza la clave al mostrarla.
export function crearLeyendaCategorias() {
    const detalles = document.createElement('details');
    detalles.className = 'leyenda-categorias';

    const resumen = document.createElement('summary');
    resumen.textContent = 'Leyenda';
    detalles.appendChild(resumen);

    const lista = document.createElement('ul');
    lista.className = 'leyenda-categorias-lista';

    Object.keys(EMOJI_POR_TIPO).forEach((tipo) => {
        const item = document.createElement('li');

        const swatch = document.createElement('span');
        swatch.className = 'leyenda-swatch';
        swatch.style.background = COLOR_POR_TIPO[tipo];
        item.appendChild(swatch);

        const nombre = tipo.charAt(0).toUpperCase() + tipo.slice(1);
        item.append(`${EMOJI_POR_TIPO[tipo]} ${nombre}`);

        lista.appendChild(item);
    });

    detalles.appendChild(lista);
    return detalles;
}

// renderCatalogo/renderMapaHuerto (camas tipo 'rectangular') retiradas en
// Fase 15 junto con #appRoot/bedModal, sus únicos consumidores — ver
// diagnóstico. `.plant-card`/`.plant-icon`/`.plant-info`/`.plant-name`
// (CSS) NO se tocaron: renderPanelCatalogoArrastrable (main.js, Fase
// 14.6b) las reutiliza para el panel de arrastre de view-gemelo.

// ── Shape de `tareas` ────────────────────────────────────────────
//   { id, titulo, tipo: "asistencia"|"individual",
//     origen: "asignada"|"autoasignada", creadorId: uid|null,
//     estado: "pendiente"|"en_revision"|"completada"|"rechazada",
//     motivoRechazo: string|null, asignados: [uid,...],
//     horasAOtorgar: number, fotoEvidenciaUrl: string|null,
//     fechaCreacion, asignadosNombres: [string,...] }
// `asignadosNombres` es opcional y se denormaliza en main.js (mismo patrón
// que plantaNombre/plantaTipo en camas) — este módulo no conoce el
// directorio de usuarios, solo pinta lo que ya viene resuelto.
//
// Tareas autoasignadas con aprobación de admin (2026-09-06): `origen`
// puede faltar en documentos viejos — se trata como 'asignada', mismo
// default que _datosNuevaTarea/firestore.rules (ver chores.js). Solo la
// rama 'autoasignada' conoce estados nuevos ('en_revision'/'rechazada');
// 'en_revision' está congelada a propósito — no se pinta NINGÚN botón ahí,
// ni siquiera para admin (esa resolución vive en el panel de revisión de
// Admin, no en esta lista, ver renderRevisionTareas/vista-admin.js).

export function renderListaTareas(tareas, contenedor, callbacks, { esAdmin = false, uidActual = null } = {}) {
    const { onCompletar, onEditar, onEliminar } = callbacks;
    const fragment = document.createDocumentFragment();

    tareas.forEach((tarea) => {
        const origen = tarea.origen === 'autoasignada' ? 'autoasignada' : 'asignada';
        const completada = tarea.estado === 'completada';
        const esCreador = uidActual != null && tarea.creadorId === uidActual;

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

        if (origen === 'autoasignada' && tarea.estado === 'en_revision') {
            const estadoTag = document.createElement('span');
            estadoTag.className = 'chore-item-asignados';
            estadoTag.textContent = 'En revisión — esperando aprobación del admin';
            info.appendChild(estadoTag);
        }

        if (origen === 'autoasignada' && tarea.estado === 'rechazada' && tarea.motivoRechazo) {
            const motivo = document.createElement('p');
            motivo.className = 'admin-auditoria-error';
            motivo.textContent = `Rechazada: ${tarea.motivoRechazo}`;
            info.appendChild(motivo);
        }

        li.appendChild(info);

        // Miniatura de evidencia: solo si la tarea ya tiene una (se llena
        // al completar/enviar a revisión) — si no existe, no se fuerza
        // ningún estado vacío/placeholder.
        if (completada && tarea.fotoEvidenciaUrl) {
            const foto = document.createElement('img');
            foto.className = 'chore-item-evidencia';
            foto.src = tarea.fotoEvidenciaUrl;
            foto.alt = 'Evidencia de la tarea';
            li.appendChild(foto);
        }

        // RBAC de cliente: la seguridad real está en firestore.rules —
        // esto solo evita ofrecer un botón que el backend va a rechazar.
        if (!completada && tarea.estado !== 'en_revision') {
            if (origen === 'asignada' && esAdmin) {
                const btn = document.createElement('button');
                btn.className = 'chore-complete-btn';
                btn.textContent = '✅ Completar';
                btn.addEventListener('click', () => onCompletar(tarea.id));
                li.appendChild(btn);
            }

            if (origen === 'autoasignada' && esCreador && tarea.estado === 'pendiente') {
                const editarBtn = document.createElement('button');
                editarBtn.className = 'chore-complete-btn';
                editarBtn.textContent = '✏️ Editar';
                editarBtn.addEventListener('click', () => onEditar(tarea.id));
                li.appendChild(editarBtn);

                const eliminarBtn = document.createElement('button');
                eliminarBtn.className = 'chore-complete-btn catalogo-eliminar-btn';
                eliminarBtn.textContent = '🗑️ Eliminar';
                eliminarBtn.addEventListener('click', () => onEliminar(tarea.id));
                li.appendChild(eliminarBtn);
            }

            if (origen === 'autoasignada' && esCreador && tarea.estado === 'rechazada') {
                const reenviarBtn = document.createElement('button');
                reenviarBtn.className = 'chore-complete-btn';
                reenviarBtn.textContent = '✏️ Editar y reenviar';
                reenviarBtn.addEventListener('click', () => onEditar(tarea.id));
                li.appendChild(reenviarBtn);
            }
        }

        fragment.appendChild(li);
    });

    contenedor.replaceChildren(fragment);
}

// ── Panel de revisión de Admin (tareas autoasignadas en 'en_revision') ──
// Multi-selección: solo alimenta "Aprobar seleccionadas"/"Aprobar todas"
// (acciones masivas sin pedir texto) — el rechazo se dejó deliberadamente
// FUERA de la selección múltiple: el motivo debe ser específico de cada
// tarea (es lo único que le dice al creador qué corregir), así que
// "rechazar" siempre se dispara fila por fila con su propio textarea, sin
// un botón "Rechazar seleccionadas" que ofrecería un motivo compartido o
// N modales en cadena por el mismo costo de clics que ya tiene ir fila por
// fila. Documentado así por pedido explícito de dejar registrada la
// decisión de UX (ver diagnóstico de esta fase).
export function renderRevisionTareas(tareas, contenedor, { seleccionadas, onToggleSeleccion, onAprobar, onRechazar }) {
    const fragment = document.createDocumentFragment();

    tareas.forEach((tarea) => {
        const li = document.createElement('li');
        li.className = 'chore-item';
        li.dataset.tareaId = tarea.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = seleccionadas.has(tarea.id);
        checkbox.addEventListener('change', () => onToggleSeleccion(tarea.id, checkbox.checked));
        li.appendChild(checkbox);

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

        const meta = document.createElement('span');
        meta.className = 'chore-item-asignados';
        meta.textContent = `${tarea.horasAOtorgar || 0}h a otorgar si se aprueba`;
        info.appendChild(meta);

        li.appendChild(info);

        // Más grande que en la lista normal de tareas (chore-item-evidencia
        // a secas, 40x40) — acá el admin necesita poder juzgar la foto
        // antes de aprobar/rechazar, no solo confirmar que existe. El link
        // a la imagen completa (misma URL, sin transformar) evita depender
        // de entrar a la consola de Firebase Storage para verla en tamaño
        // real.
        if (tarea.fotoEvidenciaUrl) {
            const link = document.createElement('a');
            link.className = 'chore-item-evidencia-link';
            link.href = tarea.fotoEvidenciaUrl;
            link.target = '_blank';
            link.rel = 'noopener';
            const foto = document.createElement('img');
            foto.className = 'chore-item-evidencia-grande';
            foto.src = tarea.fotoEvidenciaUrl;
            foto.alt = 'Ver evidencia completa';
            link.appendChild(foto);
            li.appendChild(link);
        }

        const aprobarBtn = document.createElement('button');
        aprobarBtn.className = 'chore-complete-btn';
        aprobarBtn.textContent = '✅ Aprobar';
        aprobarBtn.addEventListener('click', () => onAprobar(tarea.id));
        li.appendChild(aprobarBtn);

        const rechazarBtn = document.createElement('button');
        rechazarBtn.className = 'chore-complete-btn catalogo-eliminar-btn';
        rechazarBtn.textContent = '❌ Rechazar';
        rechazarBtn.addEventListener('click', () => onRechazar(tarea.id));
        li.appendChild(rechazarBtn);

        fragment.appendChild(li);
    });

    contenedor.replaceChildren(fragment);
}

// ── Shape de `proyectos` con progreso ya resuelto (obtenerProyectosConProgreso) ──
//   { id, nombre, descripcion, fechaObjetivo: 'YYYY-MM-DD'|null,
//     estado: 'activo'|'completado'|'pausado',
//     pasos: [ { tareaId, orden, tarea: {..tarea completa..}|null } ] (ordenados por orden),
//     totalPasos, pasosCompletados }
// `tarea` es null si la tarea referenciada ya se borró — este módulo no
// inventa un placeholder de datos, solo decide cómo mostrarlo (título
// "(tarea eliminada)").

// Umbral de "fecha límite cercana" para el badge rosa — no hay un umbral
// ya establecido en el proyecto para reusar (confirmado, ver diagnóstico
// de esta fase), así que se fija acá como constante ajustable.
const DIAS_FECHA_CERCANA = 7;

// Parte PURA (sin DOM) de la decisión de badge, separada de
// crearBadgeProyecto — mismo criterio que calcularSugerenciaHoras en
// vista-tareas.js: `ahora` inyectable (default new Date()) para que la
// rama de fecha sea testeable sin depender del día real del sistema.
// Solo un badge por tarjeta, prioridad: fecha cercana (más urgente) >
// activo (genérico) > nada (proyecto pausado/completado). "sin fecha = sin
// badge" del diseño aprobado se cumple naturalmente: sin fechaObjetivo, la
// rama de fecha cercana nunca aplica y cae al badge de activo (o a ninguno
// si no es activo). Exportada para poder testearla directo, sin jsdom.
export function calcularBadgeProyecto(proyecto, ahora = new Date()) {
    if (proyecto.estado === 'activo' && proyecto.fechaObjetivo) {
        const objetivo = new Date(proyecto.fechaObjetivo + 'T00:00:00');
        const diasRestantes = Math.ceil((objetivo - ahora) / 86400000);
        if (diasRestantes <= DIAS_FECHA_CERCANA) {
            return { tipo: 'fecha', texto: proyecto.fechaObjetivo };
        }
    }
    if (proyecto.estado === 'activo') {
        return { tipo: 'activo', texto: 'Activo' };
    }
    return null;
}

function crearBadgeProyecto(proyecto) {
    const info = calcularBadgeProyecto(proyecto);
    if (!info) return null;
    const badge = document.createElement('span');
    badge.className = info.tipo === 'fecha' ? 'proyecto-badge proyecto-badge-fecha' : 'proyecto-badge proyecto-badge-activo';
    badge.textContent = info.texto;
    return badge;
}

export function renderGaleriaProyectos(proyectos, contenedor, onClickPaso, { esAdmin = false, onAgregarPaso, onConcluir, onReactivar, onEliminar } = {}) {
    const fragment = document.createDocumentFragment();

    proyectos.forEach((proyecto) => {
        const card = document.createElement('div');
        card.className = 'proyecto-card';
        card.dataset.proyectoId = proyecto.id;

        const header = document.createElement('div');
        header.className = 'proyecto-card-header';

        const nombre = document.createElement('h3');
        nombre.className = 'proyecto-card-nombre';
        nombre.textContent = proyecto.nombre || 'Sin nombre';
        header.appendChild(nombre);

        const badge = crearBadgeProyecto(proyecto);
        if (badge) header.appendChild(badge);
        card.appendChild(header);

        if (proyecto.descripcion) {
            const descripcion = document.createElement('p');
            descripcion.className = 'proyecto-card-descripcion';
            descripcion.textContent = proyecto.descripcion;
            card.appendChild(descripcion);
        }

        const totalPasos = proyecto.totalPasos ?? proyecto.pasos.length;
        const pasosCompletados = proyecto.pasosCompletados ?? 0;
        const porcentaje = totalPasos > 0 ? Math.round((pasosCompletados / totalPasos) * 100) : 0;

        const barra = document.createElement('div');
        barra.className = 'progress-bar';
        const relleno = document.createElement('div');
        relleno.className = 'progress-fill proyecto-progress-fill';
        relleno.style.width = `${porcentaje}%`;
        barra.appendChild(relleno);
        card.appendChild(barra);

        const textoProgreso = document.createElement('p');
        textoProgreso.className = 'proyecto-card-progreso-texto';
        textoProgreso.textContent = `${pasosCompletados} de ${totalPasos} pasos completados`;
        card.appendChild(textoProgreso);

        const checklist = document.createElement('ul');
        checklist.className = 'proyecto-checklist';
        proyecto.pasos.forEach((paso) => {
            const li = document.createElement('li');
            li.className = 'proyecto-checklist-item';
            li.dataset.tareaId = paso.tareaId;

            const completado = paso.tarea?.estado === 'completada';
            const marca = document.createElement('span');
            marca.className = 'proyecto-checklist-marca';
            marca.textContent = completado ? '✅' : '⚪';
            li.appendChild(marca);

            const titulo = document.createElement('span');
            titulo.className = 'proyecto-checklist-titulo';
            titulo.textContent = paso.tarea?.titulo || '(tarea eliminada)';
            li.appendChild(titulo);

            li.addEventListener('click', () => onClickPaso(paso));
            checklist.appendChild(li);
        });
        card.appendChild(checklist);

        if (esAdmin) {
            const acciones = document.createElement('div');
            acciones.className = 'proyecto-card-acciones';

            // "+ Agregar paso" solo tiene sentido en un proyecto activo —
            // un proyecto concluido no debería seguir creciendo (si hace
            // falta reabrirlo, "Reactivar" existe justo para eso).
            if (proyecto.estado === 'activo') {
                const btnAgregarPaso = document.createElement('button');
                btnAgregarPaso.className = 'chore-complete-btn';
                btnAgregarPaso.textContent = '+ Agregar paso';
                btnAgregarPaso.addEventListener('click', () => onAgregarPaso(proyecto.id));
                acciones.appendChild(btnAgregarPaso);

                const btnConcluir = document.createElement('button');
                btnConcluir.className = 'chore-complete-btn';
                btnConcluir.textContent = '✔ Concluir';
                btnConcluir.addEventListener('click', () => onConcluir(proyecto.id));
                acciones.appendChild(btnConcluir);
            } else if (proyecto.estado === 'completado') {
                const btnReactivar = document.createElement('button');
                btnReactivar.className = 'chore-complete-btn';
                btnReactivar.textContent = '↩ Reactivar';
                btnReactivar.addEventListener('click', () => onReactivar(proyecto.id));
                acciones.appendChild(btnReactivar);
            }

            const btnEliminar = document.createElement('button');
            btnEliminar.className = 'chore-complete-btn catalogo-eliminar-btn';
            btnEliminar.textContent = '🗑 Eliminar';
            btnEliminar.addEventListener('click', () => onEliminar(proyecto.id));
            acciones.appendChild(btnEliminar);

            card.appendChild(acciones);
        }

        fragment.appendChild(card);
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
//
// Carrera(s)/Clave Única/barra de progreso (2026-09-18): un estudiante con
// perfil de antes de este cambio no tiene `carreras` todavía (`null`/
// `undefined` hasta que inicie sesión y pase por el gate de
// view-completar-perfil, ver main.js) — se muestra "—" en vez de inventar
// un valor, mismo criterio "no inventar defaults" del resto del proyecto.
export function renderResumenHoras(estudiantes, contenedor) {
    const fragment = document.createDocumentFragment();
    const ordenados = [...estudiantes].sort((a, b) => (b.horasTotales ?? 0) - (a.horasTotales ?? 0));

    ordenados.forEach((estudiante) => {
        const tr = document.createElement('tr');

        const nombre = document.createElement('td');
        nombre.textContent = nombreParaMostrar(estudiante);
        tr.appendChild(nombre);

        const carrerasTd = document.createElement('td');
        carrerasTd.textContent = estudiante.carreras?.length ? estudiante.carreras.join(', ') : '—';
        tr.appendChild(carrerasTd);

        const claveTd = document.createElement('td');
        claveTd.textContent = estudiante.claveUnica || '—';
        tr.appendChild(claveTd);

        const horas = document.createElement('td');
        horas.textContent = estudiante.horasTotales ?? 0;
        tr.appendChild(horas);

        const progresoTd = document.createElement('td');
        if (estudiante.carreras?.length) {
            progresoTd.appendChild(crearBarraProgresoHoras(estudiante.horasTotales ?? 0, calcularHorasObjetivo(estudiante.carreras)));
        } else {
            progresoTd.textContent = '—';
        }
        tr.appendChild(progresoTd);

        fragment.appendChild(tr);
    });

    contenedor.replaceChildren(fragment);
}

// Perfil (propio) y Resumen de Horas (Admin/reportes) — misma barra en
// ambos lugares, ver AI_CONTEXT.md. El ancho se limita a 100% aunque el
// objetivo ya se haya superado (evita que el relleno se vea "roto" o
// desbordado); el texto sí muestra el número real de horas, sin tope.
export function crearBarraProgresoHoras(horasTotales, horasObjetivo) {
    const porcentaje = horasObjetivo > 0 ? Math.round((horasTotales / horasObjetivo) * 100) : 0;

    const contenedor = document.createElement('div');
    contenedor.className = 'horas-progreso';

    const barra = document.createElement('div');
    barra.className = 'progress-bar';
    const relleno = document.createElement('div');
    relleno.className = 'progress-fill horas-progress-fill';
    relleno.style.width = `${Math.min(porcentaje, 100)}%`;
    barra.appendChild(relleno);
    contenedor.appendChild(barra);

    const texto = document.createElement('p');
    texto.className = 'horas-progreso-texto';
    texto.textContent = `${horasTotales} de ${horasObjetivo} horas (${porcentaje}%)`;
    contenedor.appendChild(texto);

    return contenedor;
}

// Checkboxes de carrera — usados en Setup, view-completar-perfil (gate de
// usuarios existentes) y Perfil (edición posterior). El límite de máx. 2
// marcadas NO se aplica acá (esto solo pinta) — lo aplica
// aplicarLimiteCheckboxes (shared/core-ui.js) sobre el contenedor real,
// después de insertar este fragment.
export function crearCheckboxesCarreras(seleccionadas = []) {
    const fragment = document.createDocumentFragment();
    CARRERAS.forEach((carrera) => {
        const label = document.createElement('label');
        label.className = 'carrera-checkbox-chip';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = carrera;
        input.checked = seleccionadas.includes(carrera);
        label.appendChild(input);
        label.append(carrera);
        fragment.appendChild(label);
    });
    return fragment;
}
