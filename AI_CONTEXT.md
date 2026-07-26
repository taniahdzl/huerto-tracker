# Contexto del Proyecto: Huerto Universitario (Gemelo Digital)

_Última actualización: 2026-07-25. Reemplaza la versión anterior, que describía
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
  2026-07-26).** `test/*.test.js`, 223 tests en 20 archivos, corren con
  `npm test` (= `node --experimental-test-module-mocks --test`). La Fase 21
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
    `zoomHacia` interna). La rama de sábado de `completarTarea()`
    (`new Date().getDay() === 6`) tampoco se probó — depende del día real
    del sistema, sin fecha inyectable en el código.
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

## 4. Arquitectura de módulos (Fase 19, 2026-07-24 — reorganizado en
   carpetas y `vista-gemelo.js` partido en Fase 22, 2026-07-25)

`js/` tiene 24 módulos en 4 subcarpetas por capa + `main.js` suelto en la
raíz (única excepción, como raíz de composición). De más pura a más
orquestadora:

- **`js/services/`** (no conocen el DOM): `firebase.js` (único punto de
  `initializeApp()`, lee `config.js`/`config.example.js` — mismo folder),
  `db.js`, `chores.js`, `usuarios.js`, `auth.js`, `session.js`, `ai.js`
  (stub sin usar, ver sección 1).
- **`js/render/`** (UI pura, sin Firebase): `render.js`,
  `render-spiral-2d.js`, `geometria-espiral.js`.
- **`js/shared/`** (hojas compartidas entre vistas, sin imports salientes
  entre sí — Fase 19): `core-ui.js`
  (`mostrarToast`/`openModal`/`closeModal`/`marcarStatus*`), `estado-app.js`
  (`esAdminActual` vía `getEsAdminActual`/`setEsAdminActual`), `router.js`
  (`navegarA`/`ocultarTodasLasVistas` — A PROPÓSITO no importa ningún
  `vista-*.js`; si lo hiciera, cada vista tendría que importarlo de
  vuelta, un ciclo entre 6+ archivos).
- **`js/views/`** (cada una con sus propios `document.getElementById` —
  sin registro central de refs DOM, cada módulo consulta directo lo que
  usa): `vista-perfil.js`, `vista-bitacora.js`, `vista-catalogos.js`,
  `vista-tareas.js`, `vista-admin.js`, `vista-dashboard.js`,
  `vista-login.js`, más los 3 módulos de Gemelo — `vista-gemelo.js` (carga
  de datos + modales de detalle), `gemelo-pan-zoom.js` (pan/zoom, Fase 22)
  y `gemelo-drag-drop.js` (drag&drop de plantas, Fase 22; ver sección 1
  para el porqué de la división y sección 2 para el detalle técnico).
- **`js/main.js`** (raíz de composición, en `js/` directo): bootstrap de
  `auth:resuelto` + listener delegado de `headerNav` — el único módulo al
  que le toca importar las 5 rutas con carga de datos propia
  (`irAVistaTareas` etc.).

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
(`mostrarDashboard`). `vista-gemelo.js` → `gemelo-pan-zoom.js` →
`gemelo-drag-drop.js` (por `estaArrastrandoPlanta`) — `gemelo-drag-drop.js`
NO importa de vuelta a `vista-gemelo.js`; `iniciarHuerto` se le inyecta como
parámetro (`onSoltar`) desde el único caller, mismo criterio anti-ciclo que
`router.js`.

`vista-admin.js` fusiona dos secciones que en el `main.js` original tenían
nombres parecidos pero eran distintas: el modal de ajuste de horas ("Panel
de Admin") y el log de auditoría con filtros ("Vista de Admin") — se
fusionaron porque ya estaban conectadas por un botón real
(`abrirAjusteHorasBtn` abre el modal del otro "sub-módulo").

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
