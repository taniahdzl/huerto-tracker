# Contexto del Proyecto: Huerto Universitario (Gemelo Digital)

_Última actualización: 2026-09-19. Reemplaza la versión anterior, que describía
un estado del proyecto (monolito en `index.html`, JS vacío, API key en
`localStorage`) que ya no existe._

## 1. Estado Actual (SINCERO)

- **Ya no es un monolito de `index.html`.** La lógica vive en `js/` (24
  módulos, organizados en subcarpetas por capa — ver "Arquitectura de
  módulos" más abajo). `index.html` bajó a ~555 líneas — solo HTML de
  vistas y los `<link>` a `css/variables.css`/`css/main.css`/
  `css/components.css` (ver bullet de CSS más abajo, ya no hay `<style>`
  inline).
- **`js/main.js` ya NO es el monolito nuevo — se dividió en módulos por
  vista (Fase 19, 2026-07-24).** Bajó de 2152 a ~140 líneas: solo bootstrap
  de sesión (`auth:resuelto`) + el listener delegado de `headerNav`. Toda
  la lógica de cada vista vive en su propio `js/views/vista-*.js`
  (`vista-dashboard`, `vista-gemelo`, `vista-tareas`, `vista-catalogos`,
  `vista-perfil`, `vista-admin`, `vista-bitacora`, `vista-login`), con
  `js/shared/router.js` (routing puro), `js/shared/core-ui.js`
  (toast/modal/status — módulo hoja) y `js/shared/estado-app.js`
  (`esAdminActual`) como los módulos compartidos. Ver sección "Arquitectura
  de módulos" más abajo para el detalle completo — no re-derivarlo leyendo
  cada archivo, ya está mapeado ahí. El código muerto del Asistente IA
  (desconectado desde Fase 15) se borró en esa misma fase — `js/services/
  ai.js` sigue en disco sin usarse, ver Paso 2b.
- **`js/` reorganizado en subcarpetas por capa (Fase 22, 2026-07-25).** Las
  capas ya existían conceptualmente desde Fase 19 (servicio/UI pura/vistas)
  pero vivían todas sueltas en `js/`. Ahora son carpetas reales:
  `js/services/` (Firestore/Auth/estado de dominio), `js/render/` (pintado
  puro, sin Firebase), `js/shared/` (hojas compartidas entre vistas),
  `js/views/` (una vista por archivo, más los dos módulos nuevos de Gemelo
  — ver bullet siguiente). `js/main.js` es el único archivo que se queda
  suelto en la raíz de `js/`, como raíz de composición. Cero cambios de
  lógica — solo `git mv` + reescritura de rutas de `import`, verificado con
  `node --check` en los 24 archivos, un cruce automatizado de cada `import`
  contra el `export` real de su archivo destino (sin mismatches) y
  `node --test` (33/33 verdes). `js/services/config.js` (gitignored) se
  regenera ahora en esa ruta nueva — `scripts/generate-config.js` y
  `.gitignore` se actualizaron para apuntar ahí.
- **`vista-gemelo.js` (871 líneas, la más grande del proyecto) se partió en
  3 (misma Fase 22).** El comentario de cabecera original explicaba por qué
  el archivo NO se fragmentaba: "ninguna de estas piezas fue nunca
  independientemente reusable entre sí" — cierto para los modales de
  detalle (cama/planta), que siguen intactos y juntos en `vista-gemelo.js`
  porque sus handlers de mutación existen específicamente para refrescar lo
  que `iniciarHuerto()` ya pintó. Pero el pan/zoom del mapa (Fase 18.1) y el
  drag&drop de plantas (Fase 14.6b) SÍ eran autocontenidos — cada uno solo
  necesitaba el `<svg>`/elemento que recibía por parámetro, con una única
  dependencia cruzada entre ambos (`arrastrandoPlanta`, la bandera que el
  pan consulta para quedarse quieto mientras dura un arrastre de planta).
  Se extrajeron a `js/views/gemelo-pan-zoom.js` (253 líneas,
  `aplicarVistaEspiral`/`configurarPanZoomEspiral`) y
  `js/views/gemelo-drag-drop.js` (195 líneas,
  `iniciarPosibleArrastrePlanta`/`estaArrastrandoPlanta`) — `vista-gemelo.js`
  quedó en 468 líneas. Dirección única de imports, sin ciclo:
  `vista-gemelo.js` → `gemelo-pan-zoom.js` → `gemelo-drag-drop.js` (por
  `estaArrastrandoPlanta`). `gemelo-drag-drop.js` NO importa `iniciarHuerto`
  de vuelta desde `vista-gemelo.js` (eso sí sería un ciclo) — en cambio
  `iniciarPosibleArrastrePlanta` recibe `iniciarHuerto` como parámetro
  `onSoltar`, inyectado por el único caller (`renderPanelCatalogoArrastrable`
  en `vista-gemelo.js`).
- **CSS consolidado (Fase 20, 2026-07-24).** `css/variables.css` (117
  líneas, design tokens, sin cambios) + `css/main.css` (~227 líneas:
  esqueleto de página — reset, body, header, login overlay, splash,
  mecánica de la SPA `.view`/`.hidden`) + `css/components.css` (~574
  líneas: widgets reutilizables — botones, tarjetas, modales, chips,
  badges, todo lo de Gemelo/Dashboard/Tareas/Catálogos/Admin). El viejo
  `<style>` inline de `index.html` (774 líneas) se retiró por completo.
  Verificado por comparación de tokens (sin comentarios/espacios) que el
  contenido migrado es 100% idéntico al original, sin selectores
  perdidos ni duplicados — el único empate de especificidad documentado
  en el CSS (`.header-nav .btn` / `.btn-danger` / `.btn.active`) se
  mantuvo intacto dentro de `main.css`, mismo orden relativo que antes.
  `index.html` enlaza `variables.css` → `main.css` → `components.css`, en
  ese orden.
- **Seguridad de Firebase resuelta, distinto de lo planeado originalmente.**
  Ya no hay API key en `localStorage`. `js/services/firebase.js` es el único
  punto de `initializeApp()`; lee `js/services/config.js` (gitignored, con
  `js/services/config.example.js` como plantilla) y falla rápido (`throw`) si
  falta o si el `apiKey` sigue siendo el placeholder `REEMPLAZAR_...`.
- **Gemini/IA sigue sin resolverse.** `js/services/ai.js`
  (`generarRespuestaHuerto`) es un stub: simula latencia y devuelve texto
  fijo, no llama a ninguna API real. El propio archivo documenta por qué:
  GitHub Pages es hosting 100% estático, no hay dónde esconder la key sin una
  Cloud Function — no implementar la llamada real hasta que exista ese
  backend.
- **Fuente de verdad: Firestore, confirmado.** `js/services/firebase.js`
  expone `PATHS` con 10 colecciones (`catalogo_semillas`, `camas_cosecha`,
  `registro_actividad`, `tareas`, `asistencias`, `usuarios`,
  `catalogo_quimicos`, `inventario_general`, `historial_cultivo`,
  `bitacora_sesiones`). No queda ninguna referencia a Realtime Database en
  el código (sí sigue en `README.md`, no revisado en esta pasada).
- **`firestore.rules` versionado y real** (116 líneas) — reconfirmado
  2026-07-26 pegando el contenido actual de la consola de Firebase; el único
  diff fue un salto de línea final faltante (artefacto de copiar/pegar desde
  la consola), el contenido de las reglas ya estaba 100% al día.
- **`firestore.indexes.json` exportado y commiteado (2026-07-26).** Se
  confirmó con la consola de Firebase (pestaña Índices → "Alcance de la
  colección") que en producción existe UN SOLO índice compuesto manual:
  `tareas` — `asignados` (array-contains) + `estado` (==) + `fechaCreacion`
  (asc), la query real de `obtenerTareasAsignadas()`
  (`js/services/chores.js`). La pestaña "Alcance del grupo de colecciones"
  (single-field, Ascendente/Descendente/Matrices todos "Habilitado" — la
  config default, sin exenciones) confirma que `fieldOverrides` debe seguir
  vacío. Esto también confirma que los 3 índices compuestos de
  `registro_actividad` que anticipa el comentario en `db.js`
  (`obtenerRegistroActividad`) NUNCA se llegaron a crear en producción —
  eran una propuesta documentada a partir de links de error, no un hecho
  consumado; el comentario de `db.js` se corrigió para no dar a entender lo
  contrario.
- **Cobertura de tests completa — TODOS los módulos de `js/` (Fase 23,
  2026-07-26).** `test/*.test.js`, 275 tests en 23 archivos (venía de 223
  en 20 al cerrar la Fase 23; +16/+1 con `test/storage.test.js` y +36/+2
  con `test/proyectos.test.js`/`test/vista-proyectos.test.js`, ambos
  cambios del 2026-08-29 — ver bullets de Storage/Proyectos arriba),
  corren con `npm test` (= `node --experimental-test-module-mocks --test`). La Fase 21
  (33 tests, solo los 3 módulos sin DOM ni Firebase) dejó pendiente la
  decisión de cómo cubrir el resto — se resolvió así:
  - **jsdom** (única dependencia real del proyecto — primer `package.json`,
    ver abajo) para `document`/`window` en los módulos con DOM. Dos setups
    en `test/helpers/dom.js`: `instalarDomVacio()` (fragmento mínimo, para
    módulos que reciben su `contenedor` por parámetro — `render.js`,
    `gemelo-drag-drop.js`) e `instalarDomCompleto()` (carga el `index.html`
    real — necesario para toda `vista-*.js`, que hace
    `document.getElementById('idDeIndexHtml')` a nivel de módulo).
  - **Mock de Firestore/Auth en memoria** (`test/helpers/firebase-mock.js`,
    ~300 líneas) — implementa el subconjunto real de la API que
    `firebase.js` re-exporta (`collection`/`doc`/`query`/`where`/`orderBy`/
    `limit`/`getDoc(s)`/`addDoc`/`setDoc`/`updateDoc`/`deleteDoc`/
    `writeBatch`/`increment`/`serverTimestamp`/`Timestamp`/
    `getCountFromServer`/Auth), verificado contra los 4 módulos de
    `js/services/` que realmente la usan (no una réplica genérica del SDK).
    Se sustituye vía `node:test`'s `mock.module()` (experimental desde Node
    22.3, flag `--experimental-test-module-mocks` en el script `test` de
    `package.json`) — SIEMPRE llamado antes del `import()` dinámico del
    módulo real, nunca después (los bindings de ES modules se resuelven al
    evaluar, mockear tarde no tiene efecto).
  - **`package.json` nuevo** — primera vez que el proyecto tiene uno.
    Deliberadamente SIN `"type":"module"` (los test files se siguen
    resolviendo como ESM por detección automática de sintaxis, con el
    warning cosmético de siempre) para no romper el `require()` de
    `scripts/generate-config.js`/`scripts/upload.js`, mismo criterio ya
    documentado en Fase 21. `devDependencies: { jsdom }` es la única entrada
    — no afecta el build de producción de Vercel (`vercel.json` sigue
    corriendo solo `node scripts/generate-config.js`, sin `npm install`).
  - **Límites conocidos de la suite** (documentados en cada test file, no
    generan falsos "no cubierto"): el mock de Firestore nunca falla por sí
    solo (no simula `FAILED_PRECONDITION` por índice faltante ni fallas de
    red) — el caso 4 del contrato `auth:resuelto` (error consultando
    perfil) y el camino de "índice faltante" en `aplicarFiltrosAuditoria`
    (`vista-admin.js`) quedan sin probar por esto. jsdom no implementa
    `PointerEvent` ni `SVGSVGElement.viewBox.baseVal`/layout real
    (`getBoundingClientRect` siempre `{0,0,0,0}`) — `gemelo-pan-zoom.test.js`
    instala un polyfill mínimo de `viewBox`/rect fijo por test;
    `gemelo-drag-drop.test.js` simula Pointer Events con un `Event`
    genérico + propiedades asignadas a mano (el código solo lee
    `clientX`/`clientY`/`pointerId`/`pointerType`, nunca llama métodos
    específicos de la interfaz real). El gesto de pellizco (2 punteros
    simultáneos) no se probó — más infraestructura por una ganancia
    marginal sobre lo que ya cubre el zoom de rueda (misma función
    `zoomHacia` interna). `comprimirImagen()` (`js/views/vista-tareas.js`,
    Canvas API para la evidencia de tareas) tampoco se probó — jsdom no
    implementa un `canvas.getContext('2d')`/`toBlob` reales sin el paquete
    `canvas`, que no es dependencia de este proyecto; mismo criterio que
    las exclusiones de arriba. La vieja rama de sábado de `completarTarea()`
    que documentaba esta misma limitación (sin fecha inyectable) ya no
    existe — reemplazada por `horasAOtorgar` explícito, ver bullet de
    rediseño de tareas en la sección 1.
  - **Trampa de aislamiento encontrada 3 veces, misma causa raíz**: estado
    de MÓDULO (no de test) sobrevive entre tests dentro de un mismo archivo
    porque `node --test` corre cada ARCHIVO en un proceso propio, pero
    dentro de un archivo todos los `test()` comparten la misma instancia
    importada de cada módulo — `vistaEspiral` (`gemelo-pan-zoom.js`),
    `tabCatalogosActual` (`vista-catalogos.js`), y el registro de
    `onAuthStateChanged` del mock de `auth.js` (el `reset()` del mock NO
    debe des-registrar ese callback — `AuthService.init()` se llama UNA vez
    por archivo, no por test). Mismo criterio para el DOM: el `document` de
    `instalarDomCompleto()` también es UNO SOLO por archivo — un
    `<input>` con valor dejado por un test anterior (ej. la búsqueda de
    Catálogos) sigue filtrando el siguiente test si no se limpia en
    `beforeEach`.
- **La app es una SPA multi-vista real**, mucho más grande que lo que el
  roadmap original de 3 pasos preveía: dashboard, gemelo (mapa espiral con
  pan/zoom + drag&drop), tareas, catálogos, perfil, admin — con RBAC por rol
  (`usuarios.js`/`auth.js`) y log de auditoría (`_logActividad` →
  `registro_actividad`, filtrable por tipo/persona/fecha en Admin).
- **Rediseño de tareas: reemplaza la Regla del Sábado fija (2026-08-29).**
  `completarTarea()` (`js/services/chores.js`) ya no consulta
  `new Date().getDay() === 6` para otorgar 15h automáticas — ahora aplica
  `horasAOtorgar`, campo explícito por tarea que el admin declara al
  CREARLA (`crearTarea`). El formulario de creación sugiere 15h como
  default editable cuando el día de creación es sábado y
  `tipo:'asistencia'` (`calcularSugerenciaHoras`, `js/views/vista-tareas.js`
  — fecha inyectable a propósito, testeable sin el truco frágil de
  reemplazar `Date` global que la vieja regla necesitaba).
  Nuevo campo `tipo: 'asistencia'|'individual'` en `tareas`, sin default
  (`crearTarea` lanza si falta, mismo criterio "no inventar" del resto del
  proyecto) — `asistencia` exige foto de evidencia obligatoria al
  completar, `individual` la deja opcional. Completar ya no es un clic
  directo: pasa por `completarTareaModal` (modal único para ambos tipos).
  `registrarAsistencia` (hardcodeaba 15h) se eliminó por quedar muerta tras
  el rediseño.
- **Firebase Storage: primera integración del proyecto (2026-08-29).**
  Antes no existía ninguna (confirmado por grep: solo `storageBucket` sin
  usar en `config.example.js`). `js/services/storage.js` (nuevo) expone
  `subirEvidenciaTarea(tareaId, blob)` → sube a
  `evidencia_tareas/{tareaId}.jpg` (un archivo por tarea, sobrescribe, no
  versiona) y devuelve la URL de descarga; `js/services/firebase.js` ganó
  el import del SDK de Storage (mismo patrón de punto único de import,
  nunca CDN directo desde otro módulo). Reglas en archivo NUEVO y
  separado, `storage.rules` — NO vive dentro de `firestore.rules`
  (servicios distintos, lenguajes de reglas distintos) — usa cross-service
  rules (`firestore.get()`) para verificar `usuarios/{uid}.rol == 'admin'`,
  mismo campo/valor que `isAdmin()` en Firestore pero sin forma de
  compartir la función entre los dos archivos: si el campo de rol cambia,
  hay que actualizar AMBOS. Orden de operaciones en `completarTarea`: la
  subida a Storage se espera (`await`) ANTES de tocar Firestore — si
  falla, la función lanza antes del `updateDoc` y la tarea nunca sale de
  `'pendiente'`, nunca se marca completada sin la evidencia que se
  suponía que llevaba.
  **Plan Blaze activado y desplegado a producción (2026-09-18).** El
  proyecto (`huerto-57477`) subió a Blaze, bucket regional `us-east1`
  (dentro de la huella de `nam7`, la multi-región donde vive Firestore —
  ver decisión de ubicación documentada ese mismo día). `firebase deploy
  --only storage,firestore` corrió limpio, incluyendo el paso de IAM que
  pide Cloud Storage para las cross-service rules (`firestore.get()` desde
  `storage.rules`) — se aceptó el rol nuevo. El código de subida está
  completo y probado con Storage mockeada (`test/storage.test.js`,
  `test/chores.test.js`), pero NO verificado end-to-end todavía: ni la
  compresión Canvas (jsdom no la soporta, ver "Límites conocidos de la
  suite" más abajo) ni la subida real ni `storage.rules` contra una sesión
  no-admin real se probaron fuera del mock — pendiente de una pasada en
  navegador real, ver sección 3.
- **Proyectos: galería de tarjetas que ORGANIZA tareas existentes, nunca
  las duplica (2026-08-29).** Colección nueva, `proyectos/{id}` (`nombre`,
  `descripcion`, `fechaObjetivo`, `estado: 'activo'|'completado'|'pausado'`,
  `pasos: [{tareaId, orden}]`) — la relación con `tareas` es un campo
  opcional, `tareas.proyectoId` (`null` por default, no rompe tareas
  sueltas), NO una copia de datos. `tareas.fechaLimite` (opcional,
  cualquier tarea, no exclusivo de Proyectos) se agregó en el mismo
  cambio. Las horas de un paso siguen sin camino alterno: completar un
  paso desde Proyectos reusa `abrirModalCompletarTarea()` (exportada de
  `vista-tareas.js` para esto) → mismo `completarTarea()`/`_registrarHoras()`
  de siempre, cero lógica de horas nueva en `proyectos.js`. El progreso de
  cada tarjeta (`pasosCompletados`/`totalPasos`) se RECALCULA siempre
  leyendo el estado real de cada tarea referenciada en `pasos`
  (`obtenerProyectosConProgreso`) — nunca un contador guardado aparte;
  verificado con un test que mete un `pasosCompletados` corrupto en el doc
  y confirma que se ignora. `agregarPasoAProyecto` crea la tarea Y agrega
  la referencia al array `pasos` del proyecto en un solo `writeBatch`
  atómico (mismo patrón que `_registrarHoras`) — no pudo llamar
  literalmente a `crearTarea()` (hace su propio `addDoc` fuera de
  cualquier batch), así que la validación/shape de una tarea nueva se
  extrajo a `_datosNuevaTarea()` (`chores.js`, exportada) para reusarse sin
  duplicar el criterio en dos archivos. `arrayUnion` se agregó a
  `firebase.js` (y a `firebase-mock.js`, con dedupe por valor) por esto —
  primer uso en el proyecto.
  **Vista completa en código, NO validada manualmente en navegador —
  mismo estado que Storage.** `view-proyectos` es una vista propia (no una
  pestaña de Tareas — la galería de tarjetas es un layout distinto al de
  lista plana). Badge activo=verde/fecha-cercana=rosa (reusa
  `--bg-cosecha`, mismo tono que `.admin-auditoria-error`) con la lógica
  de "días restantes" extraída a `calcularBadgeProyecto()` (fecha
  inyectable, mismo criterio que `calcularSugerenciaHoras` — ver bullet de
  arriba, para no repetir el problema de fecha-no-testeable). Barra de
  progreso: reusa `.progress-bar`/`.progress-fill`, que ya existían en el
  CSS sin ningún consumidor. Cobertura completa vía tests con Firestore
  mockeado (`test/proyectos.test.js`, `test/vista-proyectos.test.js`), pero
  nadie confirmó todavía que se vea/sienta bien en un navegador real —
  igual que Storage, esto queda pendiente de una pasada de confirmación
  visual antes de darlo por cerrado en producción.
- **Gestión de Proyectos: Concluir/Reactivar/Eliminar + toggle
  Activos/Concluidos (2026-09-19).** `actualizarEstadoProyecto`/
  `eliminarProyecto` nuevos en `proyectos.js` — el esquema ya tenía
  `estado:'activo'|'completado'|'pausado'` desde el diseño original, solo
  faltaba UI para moverlo. **Eliminar un proyecto NO borra sus tareas**
  (decisión explícita, confirmada con la usuaria) — quedan sueltas con
  `proyectoId` apuntando a un doc que ya no existe, mismo criterio que
  `tareas.proyectoId` opcional/tolerante a esto desde el diseño original;
  cascada destructiva se consideró y se descartó a propósito. El toggle
  (`filtroProyectosActual`, mismo patrón de estado de módulo que
  `filtroTareasActual` en Tareas — no se resetea al reentrar a la vista,
  recuerda la última pestaña elegida en la sesión) solo distingue
  'activo'/'completado' — 'pausado' sigue sin ningún flujo real que lo
  produzca, fuera de alcance de esta fase. Cobertura vía tests con
  Firestore mockeado; mismo pendiente de confirmación visual que el resto
  de Proyectos.
- **Autonomía en pasos de Proyectos (2026-09-19).** "+ Agregar paso" dejó
  de ser admin-only — cualquier autenticado puede agregar su propio paso
  (autoasignada), editarlo/enviarlo a revisión, con la misma autonomía que
  ya tenían las tareas sueltas (2026-09-06). Editar/enviar a revisión
  reusa `abrirEditarTareaModal()` de `vista-tareas.js` (ahora exportada,
  recibe la tarea ya resuelta en vez de un id — mismo criterio que
  `abrirModalCompletarTarea`), con un `onGuardado` opcional para que
  Proyectos refresque su propia galería. Al reusarla se encontró un bug
  real (no solo de test): esa función puebla sus checkboxes de asignados
  desde el `estudiantesActuales` de `vista-tareas.js` — si la persona
  nunca visitó Tareas antes de entrar a Proyectos, ese caché seguía vacío
  y el guardado quedaba bloqueado ("Selecciona al menos un estudiante");
  se resuelve sincronizándolo con `setEstudiantesActuales()` (ya exportada
  de antes para `vista-admin.js`) justo antes de abrir el modal.
  **Diseño de datos, revisado tras auditoría de seguridad:** el primer
  borrador dejaba que un no-admin hiciera un `update` parcial sobre
  `proyectos/{id}.pasos` (append de 1 elemento, `hasOnly(['pasos'])` +
  `size+1`) — la skill `firebase-security-rules-auditor` lo marcó como
  hallazgo "major": esa regla no verificaba que el elemento agregado
  correspondiera a una tarea real y propia, así que cualquier autenticado
  podía inyectar referencias falsas en `pasos` de CUALQUIER proyecto sin
  crear ninguna tarea. Se descartó en vez de parchear (la alternativa,
  `getAfter()` + indexado de listas, tenía sintaxis no confirmable sin el
  simulador real de Firebase) — el diseño final es más simple: un paso
  autoasignado NUNCA escribe en `/proyectos` (que sigue admin-only sin
  excepciones, sin cambios en `firestore.rules`). Se crea como una tarea
  normal vía `crearTarea()` (ya permitido, reglas ya auditadas) con
  `proyectoId` seteado; `agregarPasoPropio()` (`proyectos.js`) es ese
  atajo. `obtenerProyectosConProgreso()` ahora hace una query adicional
  por `proyectoId` para recogerlos y los anexa al final de `pasos`
  (`orden: null` — no participan del orden manual de los pasos asignados
  por admin, se ordenan por `fechaCreacion`). Cobertura vía tests con
  Firestore mockeado; mismo pendiente de confirmación visual que el resto
  de Proyectos.
- **Tareas autoasignadas con aprobación de admin (2026-09-06).** Extiende
  `tareas` (NO colección nueva): `origen: 'asignada'|'autoasignada'`
  (default `'asignada'` — un doc viejo sin este campo se sigue leyendo como
  `'asignada'`, vía `.get('origen','asignada')` tanto en `firestore.rules`
  como en `render.js`/`vista-tareas.js`, así que ninguna tarea preexistente
  cambia de comportamiento), `creadorId` (nuevo para AMBOS orígenes —
  antes no existía; en `'asignada'` es metadata sin uso), `motivoRechazo`
  (nace `null`), y dos estados nuevos, `'en_revision'`/`'rechazada'`, junto
  a los ya existentes `'pendiente'`/`'completada'`. El flujo `'asignada'`
  (admin crea → admin completa vía `completarTarea()`) sigue exactamente
  igual, cero cambios de comportamiento — confirmado con el resto de la
  suite de tests en verde sin tocar sus aserciones (solo 3 tests
  preexistentes necesitaron actualizarse por la firma nueva de
  `renderListaTareas()` y por que `crearTareaBtn` dejó de ser admin-only,
  ver abajo).
  - **Flujo nuevo (autoasignada):** cualquier autenticado crea una con
    `origen:'autoasignada'`, pudiendo incluir a otros en `asignados[]`
    (grupal) — nace `'pendiente'`, editable/borrable libremente por su
    creador (`editarTareaAutoasignada`/`eliminarTarea`, `chores.js`).
    Subir evidencia (SIEMPRE obligatoria, a diferencia de
    `completarTarea()` donde solo aplica a `tipo:'asistencia'`) mueve
    `'pendiente'|'rechazada'` → `'en_revision'` vía `enviarARevision()` —
    desde ahí queda CONGELADA para cualquiera que no sea admin resolviendo
    la revisión. Admin aprueba (`aprobarTareaAutoasignada` → `'completada'`
    + `_registrarHoras()` por el monto COMPLETO de `horasAOtorgar` a cada
    uid de `asignados[]`, sin repartir — mismo `_registrarHoras()` de
    siempre, cero camino de horas alterno) o rechaza
    (`rechazarTareaAutoasignada` → `'rechazada'`, `motivoRechazo`
    obligatorio sin excepción). Una tarea rechazada puede reenviarse desde
    el mismo modal de edición (`editarTareaModal`, `vista-tareas.js`), que
    muestra el motivo para que el creador sepa qué corregir.
  - **UI:** `crearTareaModal` ganó `crearTareaOrigenGroup` (solo visible a
    admin — un no-admin siempre crea `'autoasignada'` sin ver el
    selector); pre-marca (no fuerza) el checkbox del propio creador en
    modo autoasignada. `"+ Crear tarea"` (`crearTareaBtn`) dejó de ser
    admin-only — el viejo toggle centralizado en
    `mostrarDashboard()`/`vista-dashboard.js` (el patrón legado que la
    skill `add-feature` ya marcaba como "no replicar" desde la fase de
    Proyectos) se retiró para este botón, ahora siempre visible tras
    login. Panel de revisión nuevo dentro de `view-admin`
    (`vista-admin.js`, sección "Tareas en Revisión") — reusa la MISMA
    lectura de `obtenerTareas()` que ya traía esa vista para el registro
    de auditoría/resumen de horas, filtrando en cliente
    (`origen:'autoasignada' && estado:'en_revision'`), sin query ni índice
    nuevo. Aprobar admite individual, multi-selección
    ("Aprobar seleccionadas") y "Aprobar todas" (con `window.confirm`);
    **rechazar se dejó deliberadamente FUERA de la selección múltiple** —
    el motivo debe ser específico de cada tarea (es lo único que le dice
    al creador qué corregir), así que siempre es fila por fila con su
    propio modal/textarea, documentado así en el código
    (`renderRevisionTareas`, `render.js`) porque la instrucción original
    pedía registrar esta decisión de UX explícitamente.
  - **`firestore.rules`: reescrito el `match /tareas/{tareaId}`**, ya no
    un `allow write: if isAdmin()` único — separado en
    `create`/`update`/`delete` con ramas por origen/estado. Auditado con
    la skill `firebase-security-rules-auditor` antes de cerrarlo: el
    primer borrador dejaba que el creador cambiara `horasAOtorgar` en la
    MISMA escritura que enviaba a revisión, sin que quedara señalado como
    cambio posterior a la creación — se corrigió separando "editar campos"
    de "enviar a revisión" en 2 ramas de `update`, cada una restringida
    con `request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly([...])` a EXACTAMENTE los campos que su función real en
    `chores.js` toca. `storage.rules` también cambió (fuera del pedido
    original, que solo mencionaba `firestore.rules` — encontrado al
    auditar el flujo completo): el creador de la tarea ahora puede subir
    su propia evidencia (antes `evidencia_tareas/{id}` era admin-only en
    Storage), resuelto vía `firestore.get()` cross-service contra
    `tareas/{id}.creadorId`. Tuvo su propio bug encontrado en revisión:
    el wildcard `{tareaId}` de Storage Rules captura el NOMBRE DE ARCHIVO
    completo (`<id>.jpg`, un solo segmento de path), no el id solo —
    `.split('.')[0]` antes de usarlo en el `firestore.get()`, si no ese
    lookup nunca encuentra el doc y la rama del creador siempre falla.
  - **Desplegado a producción (2026-09-18).** El 403 original
    (`firebase deploy --only firestore:rules --dry-run`, caller sin
    permiso para `firebaserules.googleapis.com:test`) se resolvió en la
    consola de Firebase — `firebase deploy --only firestore:rules,storage:rules`
    corrió limpio, ambas reglas compiladas y liberadas.
  - **Evidencia de autoasignadas depende de Cloud Storage — ya activo**
    (ver bullet de Storage arriba: plan Blaze activado el mismo día) —
    mismo estado que el resto del proyecto que usa Storage: código
    completo, testeado con Storage mockeada
    (`test/chores.test.js`), pero la subida real (`enviarARevision`)
    todavía no se ha probado en navegador real — pendiente de esa
    verificación, ver sección 3, no de infraestructura.
  - **Cobertura de tests:** 307 tests en 23 archivos (subió de 275/23 —
    mismo número de archivos, todos los tests nuevos se agregaron a
    archivos ya existentes: `chores.test.js`, `render.test.js`,
    `vista-tareas.test.js`, `vista-admin.test.js`, más 1 test ajustado en
    `vista-dashboard.test.js` por el cambio de visibilidad de
    `crearTareaBtn`). No se probó en navegador real — mismo pendiente que
    Storage/Proyectos.
- **Carrera(s) + Clave Única + barra de progreso de horas (2026-09-18).**
  Para automatizar reportes: `usuarios/{uid}` gana `carreras` (array, 1-2
  valores de un catálogo fijo de 15 carreras) y `claveUnica` (string, 6
  dígitos — la matrícula real trae 3 ceros de prefijo que NO se guardan,
  no hacen falta para el reporte). El catálogo vive en
  `js/shared/catalogos.js` — módulo hoja nuevo, sin imports, para que
  tanto `usuarios.js` (validación) como `render.js`/las vistas (checkboxes,
  cálculo de horas objetivo) lo consuman sin crear un ciclo services→render.
  `horasObjetivo` NUNCA se guarda — se recalcula siempre como
  `carreras.length * 480` (`calcularHorasObjetivo`, mismo criterio que
  `pasosCompletados`/`totalPasos` en Proyectos: un valor derivado guardado
  aparte se puede desincronizar, este no). Dos carreras exigen 960h, NO un
  promedio de 480 — cada carrera suma su propio objetivo completo.
  **Deliberadamente sin cambios en `firestore.rules`** — mismo criterio ya
  aplicado a `nombre` (tampoco tiene regla de formato): estos campos son
  autodeclarados sin implicación de seguridad/horas/permisos, así que la
  validación de formato/catálogo vive solo en la capa de servicio
  (`_validarCarreras`/`_validarClaveUnica`, `usuarios.js`), no duplicada en
  las reglas.
  - **Dos flujos de captura, una sola función de validación/escritura para
    el segundo:** usuarios NUEVOS lo completan en `view-setup` junto con
    nombre/rol (`registrarUsuario()` extendido, un solo `setDoc`). Usuarios
    EXISTENTES (con perfil de antes de este cambio, sin estos 2 campos) se
    interceptan al iniciar sesión con una vista nueva y mínima,
    `view-completar-perfil` (`js/views/vista-completar-perfil.js`) —
    gate ANTES del Dashboard, "Caso 2b" nuevo en el listener de
    `auth:resuelto` de `main.js` (entre el "Caso 2" de auth.js, que es
    perfil INEXISTENTE, y el "Caso 3", perfil completo) — `auth.js` expone
    `carreras`/`claveUnica` en el mismo payload del evento (misma lectura
    de `obtenerUsuario`, sin query extra), normalizados a `null` explícito
    si el documento no los tiene todavía. Editar estos datos más tarde
    desde Perfil reusa la MISMA función que resuelve el gate,
    `actualizarCarrerasYClavePropia()` — a diferencia de `registrarUsuario`
    (crea el documento), esta es siempre un `update` sobre un perfil que ya
    existe, así que sirve para ambos casos sin duplicar validación.
  - **Checkboxes de carrera, máx. 2:** `crearCheckboxesCarreras()`
    (`render.js`) pinta el catálogo completo cada vez que se necesita
    (Setup, view-completar-perfil, Perfil); `aplicarLimiteCheckboxes()`
    (`shared/core-ui.js`, nuevo helper genérico) escucha `change` sobre el
    contenedor y deshabilita (no oculta) el resto una vez marcadas 2. Un
    `replaceChildren()` (ej. al recargar Perfil con datos ya guardados) NO
    dispara `change` por sí solo — se despacha un `new Event('change')`
    manual justo después para forzar el recálculo de `disabled`; esto
    obligó a agregar `Event` (antes solo `CustomEvent`) a los globals que
    `test/helpers/dom.js` copia del `window` de jsdom.
  - **Barra de progreso:** `crearBarraProgresoHoras()` (`render.js`) — un
    solo helper para DOS lugares: Perfil (propio) y Admin → "Resumen de
    Horas por Estudiante" (ahí también se agregaron columnas de Carrera(s)
    y Clave Única — es la tabla que ya se usaba para reportes, tiene
    sentido que la barra viva ahí también). Reusa `.progress-bar`/
    `.progress-fill` genéricos (los mismos de Proyectos), con su propio
    modificador de color `.horas-progress-fill` (mismo verde primario,
    clase separada por ser de otra feature). El ancho se limita a 100%
    aunque el objetivo ya se haya superado; el texto sí muestra el número
    real de horas, sin tope. Un estudiante sin `carreras` todavía (no pasó
    por el gate) muestra "—" en vez de una barra inventada.
  - **Cobertura de tests:** `test/catalogos.test.js` nuevo (módulo puro) +
    `test/vista-completar-perfil.test.js` nuevo, más tests agregados a
    `usuarios.test.js`, `auth.test.js`, `main.test.js` (caso 2b),
    `vista-login.test.js`, `vista-perfil.test.js`, `render.test.js`. No se
    probó en navegador real — mismo pendiente que Storage/Proyectos/
    autoasignadas.
- **Tareas: toggle Abiertas/Cerradas, `fechaRealizada`, evidencia visible
  en revisión, indicador "✅ Aprobada" (2026-09-19).**
  - **Toggle Abiertas/Cerradas:** segunda pestaña de filtro en Tareas,
    independiente de mías/todas y combinada con AND
    (`filtroEstadoActual`, mismo patrón de estado de módulo que
    `filtroTareasActual` — no se resetea al reentrar). "Cerradas" es
    únicamente `estado:'completada'` — `en_revision`/`rechazada` siguen
    siendo trabajo pendiente de algo, no historial, así que quedan en
    "Abiertas".
  - **`fechaRealizada`** ('YYYY-MM-DD', nuevo campo en `tareas`): el día en
    que el trabajo REALMENTE pasó — distinta de `fechaCreacion` (server
    timestamp, inmutable, cuándo se creó el doc) y de `fechaLimite`
    (vencimiento futuro, solo pasos de Proyectos). Existe para poder
    registrar trabajo pasado ("el riego de ayer") sin que quede fechado al
    momento de escribirlo. Se llena SOLO al crear (default hoy, editable a
    una fecha pasada, `max` bloquea el futuro) — no es editable después
    (si se equivocaron, borran y crean de nuevo, mismo criterio ya
    aplicado a horasAOtorgar/asignados de autoasignadas). `_datosNuevaTarea`
    no le inventa un default — el default "hoy" vive en la UI
    (`fechaHoyLocal()`, `vista-tareas.js`, exportada — vista-proyectos.js
    la reusa para el mismo campo en `agregarPasoModal`, sin duplicar el
    formateo de fecha local). Tareas viejas (sin este campo) ordenan por
    `fechaCreacion` como fallback (`renderizarVistaTareas` ordena la lista
    ANTES de pasarla a `renderListaTareas`, que sigue sin saber de fechas
    — mismo criterio de mantener `render.js` puro).
  - **Evidencia visible durante `en_revision`:** antes solo se mostraba en
    `completada` — mientras una autoasignada esperaba aprobación, ni su
    propio creador podía ver qué había mandado. Ahora el thumbnail (más
    grande que antes, `chore-item-evidencia-grande`, envuelto en un link a
    la imagen completa en pestaña nueva — mismo tratamiento ya usado en el
    panel de revisión de Admin) aparece en ambos estados.
  - **"✅ Aprobada":** sin campo nuevo — se deriva de
    `origen==='autoasignada' && estado==='completada'`, la única forma de
    llegar ahí es vía `aprobarTareaAutoasignada()`. Una 'asignada'
    completada no la lleva (su ciclo nunca pasó por revisión).
  - Cobertura vía tests con Firestore mockeado; mismo pendiente de
    confirmación visual que el resto de Tareas/Proyectos.
- **Multiplicadores de horas por tipo de actividad — reemplaza
  `tipo:'asistencia'|'individual'` (2026-09-19).** `js/shared/
  tipos-tarea.js` (nuevo, módulo hoja sin imports — mismo criterio que
  `catalogos.js`) define 6 categorías con multiplicador:
  Riego ×2, Trabajo físico/sábados ×3.7, Redes ×1.5, Comunidad ×2,
  Investigación ×2.5, Hoyos/composta ×7. Decisiones confirmadas con la
  usuaria: evidencia SIEMPRE obligatoria (las 6 categorías reemplazan
  tanto a 'asistencia' como a 'individual' — ya no existe un tipo sin
  necesidad de evidencia); redondeo al entero más cercano (4h efectivas ×
  3.7 = 14.8 -> 15, no se deja el decimal); tareas viejas con tipo
  'asistencia'/'individual' se dejan tal cual, sin migración — ya no son
  válidas para escrituras NUEVAS (`_datosNuevaTarea` las rechaza), pero
  las existentes se leen igual.
  - **`horasEfectivas` (nuevo campo, lo que la persona declara) vs.
    `horasAOtorgar` (calculado, congelado):** la persona SIEMPRE ingresa
    horas efectivas — `chores.js` (`_datosNuevaTarea`) calcula
    `horasAOtorgar = horasEfectivas × multiplicador` UNA VEZ al crear y
    lo congela en el documento, mismo criterio ya aplicado a
    horasAOtorgar/asignados de autoasignadas (2026-09-06): si el
    multiplicador de un tipo cambia en el futuro, no debe alterar
    retroactivamente horas ya otorgadas. `crearTarea()`/
    `agregarPasoAProyecto()` ya NO aceptan `horasAOtorgar` directo del
    caller — solo `horasEfectivas`.
  - **Preview en vivo:** `textoPreviewHoras(tipo, horasEfectivas)`
    (`vista-tareas.js`, exportada — `vista-proyectos.js` la reusa para el
    mismo preview en `agregarPasoModal`) — "X horas efectivas ×
    multiplicador = Yh a acreditar", recalculado en cada cambio de tipo u
    horas.
  - **Sugerencia de horas EFECTIVAS en sábado:** reemplaza a la vieja
    sugerencia de 15h a otorgar — ahora sugiere 4h EFECTIVAS solo si
    tipo:'trabajo_fisico' y es sábado
    (`calcularSugerenciaHorasEfectivas`, renombrada de
    `calcularSugerenciaHoras` — 4×3.7=14.8 -> redonde a 15, el número
    histórico).
  - **editarTareaModal (autoasignadas pendientes/rechazadas) NO se tocó
    en su semántica de horas** — sigue pidiendo "Horas a otorgar"
    directo, sin preview ni multiplicador. No es un descuido: esa edición
    ya estaba restringida por `firestore.rules` a NO poder cambiar
    horasAOtorgar/asignados realmente (hasOnly(['titulo','tipo']) desde
    2026-09-06) — intentar sumarle el cálculo de multiplicador ahí
    hubiera sido trabajo sin efecto real. El `<select>` de tipo SÍ se
    actualizó a las 6 categorías nuevas; sin default cuando el tipo no
    está en el catálogo (tareas legacy) — se deja como elección explícita,
    no se inventa un default silencioso.
  - **Límite de test conocido (ampliado):** el camino de "completar con
    evidencia real" ya no se puede ejercitar de punta a punta en ningún
    test de UI (antes existía un atajo — tipo:'individual' no pedía foto,
    así que el camino de ÉXITO sí se probaba sin tocar `comprimirImagen`).
    Con evidencia siempre obligatoria, todo camino de éxito pasa por
    Canvas API, que jsdom no implementa — mismo límite ya documentado para
    Storage. Los tests de completar/enviar a revisión ahora solo cubren
    el rechazo (sin evidencia), no el éxito — ver
    `test/vista-tareas.test.js`/`test/vista-proyectos.test.js`.
  - Cobertura vía tests con Firestore mockeado (`test/tipos-tarea.test.js`
    nuevo, módulo puro); mismo pendiente de confirmación visual que el
    resto de Tareas/Proyectos.
- **Dos fixes chicos (2026-09-18):** `_logActividad` recibía un objeto en
  `actualizarCarrerasYClavePropia` (`usuarios.js`) — el registro de
  actividad se veía como "[object Object]" en el log de Admin, porque
  `renderRegistroActividad` hace `.textContent = entrada.detalle` directo,
  sin serializar. Se corrigió a un string formateado
  (`"Economía, Derecho (clave 123456)"`), con test de regresión. Y el
  panel de revisión de Admin ("Tareas en Revisión") ganó un thumbnail más
  grande (`chore-item-evidencia-grande`) envuelto en un link a la foto
  completa en pestaña nueva — antes solo tenía un thumbnail de 40x40
  (`chore-item-evidencia`), insuficiente para juzgar la evidencia antes de
  aprobar/rechazar sin entrar a la consola de Firebase Storage. Mismo
  tratamiento que después se reusó para la evidencia visible en
  `en_revision` dentro de Tareas (ver bullet de arriba).
- **Botón "⚙ Configurar" y copy "(otorga horas)" retirados (2026-09-19).**
  El modal `configModal`/`openConfig()`/`saveConfig()` era HTML muerto
  desde antes de esta fase — esas funciones nunca existieron en JS (el
  botón tiraba un `ReferenceError` en consola) y su contenido describía un
  estado del proyecto ya retirado hace varias fases (Realtime Database,
  Gemini API key en un input de la UI, grid de camas `'rectangular'`). Sin
  reemplazo — Perfil ya es alcanzable desde `headerNav`. El copy
  "(otorga horas)" en el dropdown de tipo (`asistencia`) se quitó por
  redundante; quedó completamente obsoleto al día siguiente con el
  rediseño de multiplicadores (ver bullet arriba), que reemplazó ese
  `<select>` entero.
- **Admin incluida temporalmente en el Resumen de Horas + fix de overlap
  en Proyectos (2026-09-19).** `cargarYRenderizarVistaAdmin()`
  (`vista-admin.js`) agrega a mano, por email
  (`monicalira9377@gmail.com`), a la admin actual a la lista que se le
  pasa a `renderResumenHoras()` — sin tocar `obtenerDirectorioEstudiantes()`
  (que sigue filtrando `rol==='estudiante'` a propósito para sus otros dos
  usos, ver comentario junto a `directorioParaFiltroPersona`). Marcado
  explícitamente como `TEMPORAL` en el código — quitar cuando ya no haga
  falta que la admin aparezca ahí. Aparte, `.view-proyectos-toolbar`
  (el contenedor de "+ Nuevo proyecto" + el toggle Activos/Concluidos)
  nunca tuvo su propia regla CSS (a diferencia de `.view-catalogos-toolbar`)
  — sin `display:flex`/`margin-bottom`, el botón caía en flujo normal
  pegado a la galería, encimándose visualmente con la primera tarjeta. Fix
  en `css/components.css`, mismo patrón que Catálogos.
- **Generar Reporte de Horas por periodo (2026-09-19, primer reporte a la
  universidad).** Nuevo dentro de `view-admin`: dos selectores de fecha
  libres (sin default de "mes") + botón que pinta dos tablas — "Mesa
  Directiva" (`rol==='admin'`) y "Prestadores de Servicio" (el resto) —
  con Nombre/Clave Única/Carrera(s)/Horas previas al periodo/Horas del
  periodo/Horas totales.
  - **`obtenerHorasPorPeriodo(estudianteId, fechaInicio, fechaFin)`**
    (`chores.js`, nuevo): suma `horasTrabajadas` de `asistencias` en rango
    `[fechaInicio, fechaFin]` inclusive, comparando los strings
    `'YYYY-MM-DD'` directo (mismo padding = mismo orden que fechas reales,
    sin convertir a `Date`). `asistencias.fecha` es SIEMPRE la fecha en
    que `_registrarHoras()` escribió el documento — cuándo el admin
    aprobó/completó la tarea o hizo un ajuste manual — NUNCA
    `tareas.fechaRealizada` (que es cuándo la persona dice que trabajó);
    para un reporte de periodo esto es lo correcto, es el corte real de
    cuándo esas horas quedaron oficialmente otorgadas. Requiere un índice
    compuesto (`estudianteId` + `fecha`) que probablemente no existe
    todavía — mismo criterio del proyecto de no adivinar índices, se
    agrega desde el link de error real la primera vez que truene en
    producción.
  - **"Horas previas al periodo"** = `horasTotales - horasPeriodo`
    (`renderReporteHoras`, `render.js`) — sin query aparte. Existe para
    ajustes históricos/de migración de semestres anteriores: backdatear la
    `fecha` de esos ajustes a antes del `fechaInicio` del reporte hace que
    SÍ sumen a `horasTotales` (el `increment()` no depende de la fecha)
    pero queden fuera de "Horas del periodo" — la resta los recupera
    automáticamente como "previas". Asume que no hay asistencias con
    fecha posterior al `fechaFin` del reporte (razonable si se genera
    hasta "hoy" o cerca) — si las hubiera, se mezclarían en "previas"
    también, aceptado para este primer reporte.
  - **`ajustarHoras(estudianteId, horas, motivo, fecha = null)`**
    (`usuarios.js`) y `_registrarHoras(...)` (`chores.js`) ganaron un
    parámetro `fecha` opcional (default hoy, comportamiento sin cambios si
    no se pasa) — es lo que permite backdatear un ajuste histórico. El
    modal "Ajustar Horas" (Admin) ganó un campo de fecha (default hoy,
    editable) con nota explicando el caso de uso.
  - **Aviso de pendientes:** cuenta TODAS las autoasignadas en
    `estado:'en_revision'` ahorita mismo (sin filtrar por fecha —
    cualquiera pendiente contamina el reporte sin importar cuándo se
    reportó), reusando `tareasEnRevisionActuales` (ya calculado por el
    panel de revisión, mismo filtro, para no tener dos criterios de "qué
    es una pendiente" que puedan desalinearse) — con link que hace scroll
    a "Tareas en Revisión". No bloquea generar el reporte, solo advierte.
  - Compilación de evidencia y exportación a Word/PDF quedan
    explícitamente FUERA de alcance para este primer reporte — se arma a
    mano por fuera de la app; el reporte solo pinta tablas en pantalla,
    listas para copiar. No se probó contra datos reales de producción —
    no hay credenciales de Firebase Admin ni script local para eso en el
    repo; pendiente de una pasada en el panel de Admin real con el rango
    real (fin de mayo a 27 de septiembre).

## 2. Mapa en espiral (Gemelo) — estado técnico

- **Geometría**: `js/render/geometria-espiral.js` es módulo puro (sin DOM,
  sin Firebase) y única fuente de verdad de ángulos/radios/colocación
  automática. El render 2D (y cualquier futuro 3D) debe consumirlo, nunca
  recalcular trigonometría por su cuenta.
- **Render**: `js/render/render-spiral-2d.js` construye el SVG a mano
  (`createElementNS`/`setAttribute`, nunca `innerHTML`, ni siquiera en el
  namespace SVG).
- **Interacción**, repartida en 3 módulos desde Fase 22 (ver bullet de
  `vista-gemelo.js` en la sección 1 para el porqué de la división): pan
  (arrastre de 1 dedo), zoom (rueda / pellizco de 2 dedos / botones ±) vive
  en `js/views/gemelo-pan-zoom.js`; drag&drop de plantas vive en
  `js/views/gemelo-drag-drop.js`; carga de datos y modales de detalle
  siguen en `js/views/vista-gemelo.js`. Todo con Pointer Events, nunca la
  API de drag&drop nativa (no dispara en touch; el proyecto es mobile-first
  desde Fase 13).
- **Bug de mobile detectado y corregido (auditoría 2026-07-24, fix mismo
  día, Fase 18.3).** `.gemelo-mapa-wrapper` usaba `width/height:
  min(90vh,900px)`, sin ningún `max-width:100%` que lo frenara. En
  cualquier teléfono en vertical (`vh > vw`), esto forzaba un ancho MAYOR
  que la pantalla real → overflow horizontal de toda la vista Gemelo. Fix
  aplicado: se agregó `calc(100vw - 2 * var(--space-6))` como tercer
  término del `min()` en AMBOS ejes (ancho y alto — solo acotar el ancho
  habría estirado el `<svg>` cuadrado de adentro a una proporción no
  cuadrada). Ver comentario en `index.html` junto al wrapper.
  Fichas de planta (`RADIO_FICHA_PX=16` en `js/render/geometria-espiral.js`,
  ~13-15px de diámetro por defecto en mobile — bajo el mínimo táctil de 44px):
  probado en teléfono real 2026-07-24, el usuario lo dio por aceptable tal
  cual (el zoom hasta 4x compensa en la práctica) — cerrado sin cambio de
  código.
- **Drag&drop de plantas: bug de scroll táctil detectado y corregido
  (misma auditoría, fix mismo día, Fase 18.4).** `.plant-card` tenía
  `touch-action:none` incondicional + arranque de arrastre en el propio
  `pointerdown`, sin umbral — con ~33 plantas en el catálogo, la tira
  horizontal de `.gemelo-panel-lista` no se podía scrollear con el dedo en
  mobile (el navegador decide si permite scroll nativo en el touchstart,
  antes de que corriera cualquier JS). Fix: `touch-action:pan-x` en mobile
  / `pan-y` desde 720px (mismo breakpoint que el layout), más
  `iniciarPosibleArrastrePlanta` (`js/views/gemelo-drag-drop.js` desde Fase
  22; vivía en `vista-gemelo.js`/Fase 19, y en `main.js` cuando se escribió
  este fix) — espera
  `UMBRAL_ARRASTRE_PLANTA_PX` (9px) y decide por la dirección dominante del
  gesto si es scroll de la lista (no hace nada, deja el pan nativo) o
  arrastre hacia el mapa (recién ahí arranca `iniciarArrastrePlanta`). Mouse
  (`pointerType === 'mouse'`) se excluye de esta espera — conserva el
  arranque instantáneo original, no tenía el problema de scroll bloqueado.
- **Ghost del drag tapado por el dedo: corregido (misma auditoría, Fase
  18.5).** `.gemelo-drag-ghost` se centraba exactamente en `clientX/clientY`
  — en touch, el propio dedo tapaba el ghost y el resaltado de la cama de
  destino mientras se arrastraba. Fix: `iniciarArrastrePlanta`
  (`js/views/gemelo-drag-drop.js` desde Fase 22; antes en `vista-gemelo.js`
  desde Fase 19) desplaza el ghost 70px hacia arriba del punto de contacto
  SOLO para
  `pointerType !== 'mouse'` — puramente visual, `elementFromPoint` sigue
  usando `clientX/clientY` reales (sin el desplazamiento) para detectar la
  cama bajo el dedo, así el drop se siente anclado a donde está el dedo, no
  a donde se ve el ghost.

**Confirmado en dispositivo real 2026-07-24**: los 3 fixes de esta sección
(wrapper del mapa, scroll de la lista de plantas, ghost del drag) se
probaron en teléfono real — se ven bien, incluido el gesto de "deslizar
para ver más plantas vs. arrastrar hacia el mapa" (Fase 18.4).

**Limpieza chica post-revisión manual (2026-09-19):**
- Se quitó "(otorga horas)" del `<option value="asistencia">` en los 3
  modales que lo repetían (Crear Tarea, Editar Tarea, Agregar Paso) — solo
  copy, sin cambio de comportamiento.
- Se retiró el botón "⚙ Configurar" del header y todo `#configModal` —
  era HTML 100% muerto desde antes de esta fase: `openConfig()`/
  `saveConfig()` nunca existieron como funciones JS (clic tiraba
  ReferenceError en consola), y su contenido documentaba un estado del
  proyecto ya retirado hace varias fases (Realtime Database, Gemini key en
  un input de UI, grid de columnas/filas de camas 'rectangular'). Sin
  reemplazo — Perfil ya es alcanzable desde `headerNav`.

## 3. Roadmap de Saneamiento (revisado)

- [x] ~~Paso 1: Consolidación~~ — completo: JS en `js/`, CSS en `css/`.
- [x] Paso 1b: mover el `<style>` de `index.html` a
      `css/main.css`/`css/components.css` (Fase 20, 2026-07-24).
- [x] Paso 1c: confirmar visualmente en navegador que la consolidación de
      CSS no cambió nada — confirmado 2026-07-24, se ve igual.
- [x] Paso 2 (Firebase): resuelto vía `js/services/config.js` gitignored +
      fail-fast.
- [ ] Paso 2b (Gemini): sigue pendiente, **no es prioridad** (confirmado
      con el usuario 2026-07-24) — implementaría detrás de una Cloud
      Function antes de conectar `js/services/ai.js` a la API real, pero no
      hay urgencia de atacarlo. No proponer trabajo acá salvo que se pida
      explícitamente.
- [x] Paso 3a: `firestore.rules` versionado (reconfirmado al día 2026-07-26).
- [x] Paso 3b: `firestore.indexes.json` exportado y commiteado (2026-07-26)
      — ver sección 1.
- [x] Nuevo: dividir `js/main.js` en módulos por vista (Fase 19,
      2026-07-24) — ver "Arquitectura de módulos" más abajo.
- [x] Nuevo: fix de mobile en `.gemelo-mapa-wrapper` (ver sección 2, Fase 18.3).
- [x] Nuevo: fix de scroll táctil en panel de plantas (ver sección 2, Fase 18.4).
- [x] Nuevo: fix de ghost tapado por el dedo (ver sección 2, Fase 18.5).
- [x] Nuevo: fichas de planta con touch target chico en mobile (ver sección
      2) — probado en teléfono real 2026-07-24, aceptado tal cual, sin
      cambio de código.
- [x] Nuevo: confirmar en teléfono real los 3 fixes de Fase 18.3/18.4/18.5 (ver sección 2) — confirmado 2026-07-24, se ven bien.
- [x] Nuevo: confirmar en navegador real la división de Fase 19 —
      confirmado 2026-07-24 en teléfono real, las 8 vistas (Dashboard,
      Gemelo, Tareas, Catálogos, Perfil, Admin, Bitácora) funcionan igual
      que antes de la división.
- [x] Nuevo: suite de tests automatizados con `node:test` (Fase 21,
      2026-07-24) — arrancó cubriendo solo los 3 módulos puros.
- [x] Nuevo: cobertura de tests ampliada a TODOS los módulos con DOM/Firebase
      (Fase 23, 2026-07-26) — decisión tomada (jsdom + mock de Firestore en
      memoria), 223 tests en 20 archivos, ver sección 1.
- [x] Nuevo: gender-neutral en la bienvenida (Fase 21, 2026-07-24) —
      "Bienvenido" → "Te damos la bienvenida" en Dashboard (`#view-dashboard
      .dashboard-saludo`) y Setup (label de `#newUserNombre`), las únicas 2
      ocurrencias en todo `index.html`. Revisado el resto de la copy visible
      (grep de adjetivos terminados en -o/-a) — "Conectado"/"Conectando…"
      en el status dot del header son estado del sistema, no un adjetivo
      que concuerde con el género de quien lee, se dejaron sin tocar.
- [x] Nuevo: `js/` reorganizado en subcarpetas por capa —
      `services/render/shared/views` (Fase 22, 2026-07-25) — ver sección 1
      y "Arquitectura de módulos" más abajo.
- [x] Nuevo: `vista-gemelo.js` partido en 3 (`vista-gemelo.js` +
      `gemelo-pan-zoom.js` + `gemelo-drag-drop.js`, Fase 22, 2026-07-25) —
      ver sección 1 y sección 2.
- [x] Nuevo: confirmar en navegador real que la reorganización de Fase 22 no
      cambió nada — confirmado por el usuario 2026-07-26.
- [x] Nuevo: rediseño de tareas (2026-08-29) — `tipo`/`horasAOtorgar`
      explícitos reemplazan la Regla del Sábado fija, foto de evidencia
      obligatoria para `tipo:'asistencia'` vía Firebase Storage (primera
      integración del proyecto) — ver sección 1.
- [x] Nuevo: activar Cloud Storage — plan Blaze activado y `storage.rules`
      desplegadas (2026-09-18) — ver sección 1, bullet de Storage.
- [ ] Nuevo: verificar end-to-end lo que el mock de Storage no cubre:
      compresión Canvas real, subida real desde el navegador, y
      `storage.rules` contra una sesión no-admin real.
- [x] Nuevo: vista de Proyectos — galería de tarjetas que organiza tareas
      existentes vía `proyectoId`, sin duplicarlas (2026-08-29) — ver
      sección 1, bullet de Proyectos.
- [ ] Nuevo: confirmar en navegador real la vista de Proyectos — completa
      en código y con tests (Firestore mockeado), pero nadie la vio
      renderizada de verdad todavía. Mismo pendiente que Storage.
- [x] Nuevo: tareas autoasignadas con aprobación de admin (2026-09-06) —
      `origen`/`creadorId`/`motivoRechazo` + estados `en_revision`/
      `rechazada` sobre `tareas` existente, panel de revisión en Admin,
      `firestore.rules`/`storage.rules` reescritos y auditados — ver
      sección 1, bullet de Tareas autoasignadas.
- [x] Nuevo: desplegar `firestore.rules`/`storage.rules` a producción
      (2026-09-18) — el 403 original se resolvió en permisos de la consola
      de Firebase, `firebase deploy --only firestore:rules,storage:rules`
      corrió limpio.
- [ ] Nuevo: confirmar en navegador real el flujo de autoasignadas
      (creación, edición, envío a revisión, panel de aprobación/rechazo de
      Admin) — mismo pendiente que Storage/Proyectos, agravado acá porque
      la evidencia obligatoria sigue bloqueada por el plan Spark (ver
      bullet de Storage).
- [x] Nuevo: Carrera(s) + Clave Única + barra de progreso de horas
      (2026-09-18) — catálogo fijo en `js/shared/catalogos.js`, gate de
      usuarios existentes (`view-completar-perfil`), edición desde Perfil,
      barra de progreso en Perfil y en Resumen de Horas de Admin — ver
      sección 1, bullet de Carrera(s)/Clave Única.
- [ ] Nuevo: confirmar en navegador real Carrera(s)/Clave Única/barra de
      progreso — completo en código y con tests, pero nadie confirmó
      todavía que el gate de `view-completar-perfil` y las 3 barras (Perfil,
      Setup con checkboxes, Resumen de Horas) se vean/sientan bien en un
      navegador real. Mismo pendiente que Storage/Proyectos/autoasignadas.
- [x] Nuevo: Tareas — toggle Abiertas/Cerradas, `fechaRealizada`,
      evidencia visible en revisión, indicador "✅ Aprobada" (2026-09-19) —
      ver sección 1, bullet correspondiente.
- [ ] Nuevo: confirmar en navegador real el toggle Abiertas/Cerradas, el
      campo de fecha (Crear Tarea y Agregar Paso), la evidencia visible en
      revisión, y el indicador "✅ Aprobada". Mismo pendiente que el resto
      de Tareas/Proyectos.
- [x] Nuevo: Multiplicadores de horas por tipo de actividad — reemplaza
      tipo:'asistencia'|'individual' por 6 categorías con multiplicador
      (2026-09-19) — ver sección 1, bullet correspondiente.
- [ ] Nuevo: confirmar en navegador real los multiplicadores de horas —
      el preview en vivo (Crear Tarea/Agregar Paso), la sugerencia de 4h
      efectivas en sábado para trabajo_fisico, y sobre todo el camino de
      evidencia real (comprimirImagen/Canvas), que ningún test de esta
      suite puede ejercitar. Mismo pendiente que el resto de Tareas/
      Storage/Proyectos.
- [x] Nuevo: Gestión de Proyectos — Concluir/Reactivar/Eliminar + toggle
      Activos/Concluidos (2026-09-19) — ver sección 1, bullet de Gestión de
      Proyectos.
- [ ] Nuevo: confirmar en navegador real la Gestión de Proyectos. Mismo
      pendiente que el resto de Proyectos/Storage/autoasignadas/Carrera(s).
- [x] Nuevo: Autonomía en pasos de Proyectos (2026-09-19) — "+ Agregar
      paso" dejó de ser admin-only; diseño revisado tras auditoría de
      seguridad (un paso propio nunca escribe en `/proyectos`) — ver
      sección 1, bullet de Autonomía en pasos de Proyectos.
- [ ] Nuevo: confirmar en navegador real la autonomía en pasos de
      Proyectos (crear/editar/enviar a revisión un paso propio, que el
      panel de revisión de Admin lo apruebe igual que una autoasignada
      suelta). Mismo pendiente que el resto de Proyectos.
- [x] Nuevo: fix de `_logActividad` recibiendo un objeto ("[object
      Object]" en el log de Admin) y preview de evidencia más grande/
      clicable en el panel de revisión (2026-09-18) — ver sección 1.
- [x] Nuevo: retirar el botón "⚙ Configurar"/`configModal` (HTML muerto) y
      el copy redundante "(otorga horas)" (2026-09-19) — ver sección 1.
- [x] Nuevo: Generar Reporte de Horas por periodo — Mesa Directiva/
      Prestadores de Servicio, horas previas/del periodo/totales,
      backdatear ajustes históricos (2026-09-19) — ver sección 1, bullet
      correspondiente.
- [ ] Nuevo: validar el Reporte de Horas contra datos reales de
      producción (rango real, fin de mayo a 27 de septiembre) — nadie lo
      generó todavía fuera de los tests con Firestore mockeado. Confirmar
      también que la primera consulta de `obtenerHorasPorPeriodo` no
      truena por falta de índice compuesto (si truena, agregar el índice
      desde el link de error real). Mismo pendiente que el resto de
      Tareas/Proyectos.

## 4. Arquitectura de módulos (Fase 19, 2026-07-24 — reorganizado en
   carpetas y `vista-gemelo.js` partido en Fase 22, 2026-07-25)

`js/` tiene 27 módulos en 4 subcarpetas por capa + `main.js` suelto en la
raíz (única excepción, como raíz de composición) — 24 desde Fase 22, +1
por `storage.js` y +2 por `proyectos.js`/`vista-proyectos.js` (rediseño de
tareas/proyectos, 2026-08-29). De más pura a más orquestadora:

- **`js/services/`** (no conocen el DOM): `firebase.js` (único punto de
  `initializeApp()`, lee `config.js`/`config.example.js` — mismo folder),
  `db.js`, `chores.js`, `usuarios.js`, `auth.js`, `session.js`, `ai.js`
  (stub sin usar, ver sección 1), `storage.js` (`subirEvidenciaTarea`, ver
  sección 1; único import de `firebase-storage.js`, mismo criterio que el
  resto de este folder), `proyectos.js` (nuevo — `crearProyecto`/
  `agregarPasoAProyecto`/`obtenerProyectosConProgreso`, ver sección 1;
  importa `_datosNuevaTarea` de `chores.js`, único import services→services
  además de `_registrarHoras` desde `usuarios.js`).
- **`js/render/`** (UI pura, sin Firebase): `render.js`,
  `render-spiral-2d.js`, `geometria-espiral.js`.
- **`js/shared/`** (hojas compartidas entre vistas, sin imports salientes
  entre sí — Fase 19): `core-ui.js`
  (`mostrarToast`/`openModal`/`closeModal`/`marcarStatus*`/
  `aplicarLimiteCheckboxes` — el último, nuevo 2026-09-18), `estado-app.js`
  (`esAdminActual` vía `getEsAdminActual`/`setEsAdminActual`), `router.js`
  (`navegarA`/`ocultarTodasLasVistas` — A PROPÓSITO no importa ningún
  `vista-*.js`; si lo hiciera, cada vista tendría que importarlo de
  vuelta, un ciclo entre 6+ archivos), `catalogos.js` (nuevo, 2026-09-18 —
  `CARRERAS`/`calcularHorasObjetivo`, sin imports, para que
  `usuarios.js` (services) y `render.js` lo consuman ambos sin crear un
  ciclo services→render).
- **`js/views/`** (cada una con sus propios `document.getElementById` —
  sin registro central de refs DOM, cada módulo consulta directo lo que
  usa): `vista-perfil.js`, `vista-completar-perfil.js` (nuevo, 2026-09-18),
  `vista-bitacora.js`, `vista-catalogos.js`,
  `vista-tareas.js`, `vista-proyectos.js` (nuevo, 2026-08-29), `vista-admin.js`,
  `vista-dashboard.js`, `vista-login.js`, más los 3 módulos de Gemelo —
  `vista-gemelo.js` (carga de datos + modales de detalle),
  `gemelo-pan-zoom.js` (pan/zoom, Fase 22) y `gemelo-drag-drop.js`
  (drag&drop de plantas, Fase 22; ver sección 1 para el porqué de la
  división y sección 2 para el detalle técnico).
- **`js/main.js`** (raíz de composición, en `js/` directo): bootstrap de
  `auth:resuelto` + listener delegado de `headerNav` — el único módulo al
  que le toca importar las 6 rutas con carga de datos propia
  (`irAVistaTareas` etc. — Proyectos sumada 2026-08-29).

Dependencias entre vistas (todas de una sola dirección, sin ciclos):
`vista-catalogos.js` → `vista-gemelo.js` (comparte el caché de
`catalogoActual` vía `getCatalogoActual`/`setCatalogoActual` — AMBAS vistas
piden `catalogo_semillas` de forma independiente y escriben al mismo
caché, tal como ya pasaba en el `main.js` original, no es una
simplificación nueva). `vista-admin.js` → `vista-tareas.js` (comparte
`estudiantesActuales`, aunque en la práctica `abrirAdminModal` siempre
re-fetch en vez de confiar en el caché). `vista-dashboard.js` →
`vista-gemelo.js` (`iniciarHuerto`) y → `vista-bitacora.js`
(`cargarBannerBitacora`). `vista-login.js` → `vista-dashboard.js`
(`mostrarDashboard`). `vista-proyectos.js` → `vista-tareas.js` (nuevo,
2026-08-29 — reusa `abrirModalCompletarTarea`/`calcularSugerenciaHoras`
para no duplicar el flujo de completar tarea/sugerencia de horas al
agregar un paso). `vista-gemelo.js` → `gemelo-pan-zoom.js` →
`gemelo-drag-drop.js` (por `estaArrastrandoPlanta`) — `gemelo-drag-drop.js`
NO importa de vuelta a `vista-gemelo.js`; `iniciarHuerto` se le inyecta como
parámetro (`onSoltar`) desde el único caller, mismo criterio anti-ciclo que
`router.js`.

`vista-admin.js` fusiona secciones que en el `main.js` original tenían
nombres parecidos pero eran distintas: el modal de ajuste de horas ("Panel
de Admin") y el log de auditoría con filtros ("Vista de Admin") — se
fusionaron porque ya estaban conectadas por un botón real
(`abrirAjusteHorasBtn` abre el modal del otro "sub-módulo"). El panel de
revisión de tareas autoasignadas ("Tareas en Revisión", 2026-09-06) se
sumó como tercera sección al mismo archivo, mismo gate de rol
(`VISTAS_ADMIN`) — ver sección 1, bullet de Tareas autoasignadas.

Sin cambios en `index.html` — sigue con un solo
`<script type="module" src="js/main.js">`; el navegador resuelve todo el
árbol de imports nuevo transitivamente.

**Verificación de la Fase 19 original**: `node --check` en los 22 archivos
de `js/` (sintaxis), cruce manual de cada `import` contra el `export` real
de su archivo destino (sin mismatches), cero declaraciones duplicadas de
estado compartido, y un intento de
`node --input-type=module -e "import('./js/main.js')"` que confirmó el
linking estático de ES modules recorriendo
`main.js → vista-login → vista-dashboard → vista-gemelo → db.js → firebase.js`
sin error de export faltante, antes de toparse (esperado) con el import a
CDN de Firebase que Node no puede resolver sin red/loader especial.

**Verificación de la Fase 22 (reorganización en carpetas + split de
vista-gemelo.js)**: mismo criterio — `node --check` en los 24 archivos,
cruce AUTOMATIZADO (script Python de una pasada, no manual esta vez) de
cada `import` contra el `export` real de su destino (sin mismatches),
`node --test` (33/33 verdes, con las 3 rutas de test reapuntadas a su
nueva ubicación), y el mismo intento de
`node --input-type=module -e "import('./js/main.js')"` repetido, con el
mismo resultado esperado (falla recién en el import a CDN de Firebase).
NO se probó en un navegador real — ver pendiente en la sección 3.

## 5. Reglas de trabajo (vigentes, confirmadas en el código)

- Mobile-first desde Fase 13 — confirmado explícitamente en comentarios de
  `main.js`/`index.html` (ej. elección de Pointer Events sobre drag&drop
  nativo justo por esto).
- Nunca usar `innerHTML` — tampoco en SVG (`createElementNS`/`setAttribute`
  siempre).
- Toda función de escritura a Firestore pasa por un wrapper de log
  (`_logActividad`).
- Geometría del espiral: cero trigonometría nueva fuera de
  `js/render/geometria-espiral.js` — los renderers solo consumen, nunca
  recalculan ángulos/radios por su cuenta.
- No inventar defaults ante datos faltantes (`dias_siembra_a_cosecha`, `r`
  de planta, `notas` de cama) — se documenta el fallback explícito o se
  lanza error, nunca se asume un valor.
- Tests: `npm install` una vez (jsdom, única dependencia — Fase 23) y luego
  `npm test` desde la raíz corre todo `test/*.test.js` con
  `--experimental-test-module-mocks` (necesario para `mock.module()`, ver
  sección 1). `node --test` a secas también corre la suite pero sin ese
  flag los tests que mockean Firestore truenan — usar `npm test`. NUNCA
  agregar `"type":"module"` al `package.json` para silenciar el warning de
  detección de sintaxis — `scripts/generate-config.js` (el `buildCommand`
  real de `vercel.json`) y `scripts/upload.js` usan `require()` de
  CommonJS, y ese cambio rompería el build de producción (ver Fase 21).
- Copy dirigida al usuario: gender-neutral (Fase 21) — evitar adjetivos que
  concuerden en género con quien lee ("Bienvenido" → "Te damos la
  bienvenida"); palabras de estado del sistema invariantes ("Conectado",
  gerundios) no cuentan, no hace falta tocarlas.
- **Commits pusheados a una branch DESPUÉS de que su PR ya se mergeó
  quedan huérfanos — no se re-mergean solos (lección real, 2026-09-19).**
  `feat/autonomia-pasos-proyecto` (PR #8) y
  `fix/log-actividad-y-preview-evidencia` (PR #7) tuvieron cada una un
  commit adicional pusheado horas después de que su PR ya estaba
  mergeado — esos commits nunca llegaron a `main` hasta que se detectó
  (`git merge-base --is-ancestor <tip-de-la-branch> main` daba `false`
  pese a que el PR aparecía como mergeado en el log) y se mergearon a
  mano. Si una branch ya mergeada recibe un commit nuevo, hace falta un
  PR/merge NUEVO — el PR original no "adopta" retroactivamente lo que se
  pushea después. Antes de asumir que una feature está en producción
  porque su PR se ve mergeado, vale la pena confirmar con
  `git merge-base --is-ancestor <branch> main`.
