# Contexto del Proyecto: Huerto Universitario (Gemelo Digital)

_Última actualización: 2026-07-24. Reemplaza la versión anterior, que describía
un estado del proyecto (monolito en `index.html`, JS vacío, API key en
`localStorage`) que ya no existe._

## 1. Estado Actual (SINCERO)

- **Ya no es un monolito de `index.html`.** La lógica vive en `js/` (22
  módulos). `index.html` bajó a ~1300 líneas, casi todo HTML de vistas + un
  `<style>` inline grande.
- **`js/main.js` ya NO es el monolito nuevo — se dividió en módulos por
  vista (Fase 19, 2026-07-24).** Bajó de 2152 a ~140 líneas: solo bootstrap
  de sesión (`auth:resuelto`) + el listener delegado de `headerNav`. Toda
  la lógica de cada vista vive en su propio `js/vista-*.js`
  (`vista-dashboard`, `vista-gemelo`, `vista-tareas`, `vista-catalogos`,
  `vista-perfil`, `vista-admin`, `vista-bitacora`, `vista-login`), con
  `js/router.js` (routing puro), `js/core-ui.js` (toast/modal/status —
  módulo hoja) y `js/estado-app.js` (`esAdminActual`) como los módulos
  compartidos. Ver sección "Arquitectura de módulos" más abajo para el
  detalle completo — no re-derivarlo leyendo cada archivo, ya está mapeado
  ahí. El código muerto del Asistente IA (desconectado desde Fase 15) se
  borró en esta misma fase — `js/ai.js` sigue en disco sin usarse, ver
  Paso 2b.
- **CSS sigue sin consolidar.** `css/variables.css` (117 líneas) sí tiene
  contenido real y se usa (design tokens). `css/main.css` y
  `css/components.css` existen pero están **vacíos** — el resto del CSS
  (~900 líneas) sigue dentro del `<style>` de `index.html`.
- **Seguridad de Firebase resuelta, distinto de lo planeado originalmente.**
  Ya no hay API key en `localStorage`. `js/firebase.js` es el único punto de
  `initializeApp()`; lee `js/config.js` (gitignored, con
  `js/config.example.js` como plantilla) y falla rápido (`throw`) si falta o
  si el `apiKey` sigue siendo el placeholder `REEMPLAZAR_...`.
- **Gemini/IA sigue sin resolverse.** `js/ai.js` (`generarRespuestaHuerto`)
  es un stub: simula latencia y devuelve texto fijo, no llama a ninguna API
  real. El propio archivo documenta por qué: GitHub Pages es hosting 100%
  estático, no hay dónde esconder la key sin una Cloud Function — no
  implementar la llamada real hasta que exista ese backend.
- **Fuente de verdad: Firestore, confirmado.** `js/firebase.js` expone
  `PATHS` con 10 colecciones (`catalogo_semillas`, `camas_cosecha`,
  `registro_actividad`, `tareas`, `asistencias`, `usuarios`,
  `catalogo_quimicos`, `inventario_general`, `historial_cultivo`,
  `bitacora_sesiones`). No queda ninguna referencia a Realtime Database en
  el código (sí sigue en `README.md`, no revisado en esta pasada).
- **`firestore.rules` versionado y real** (116 líneas).
- **`firestore.indexes.json` sigue vacío** (`{"indexes": [], "fieldOverrides": []}`)
  mientras que en producción existen índices compuestos reales (usados por
  queries `where` + `orderBy` en `db.js`/`chores.js`). Pendiente exportar con
  `firebase firestore:indexes` y commitear.
- **Sin suite de tests.** No hay ningún archivo de test en el repo. La
  validación mencionada en comentarios (ej. "Playwright + arnés mock" en
  `render-spiral-2d.js`/`geometria-espiral.js`) fue manual/ad-hoc por fase,
  no quedó como test automatizado reproducible.
- **La app es una SPA multi-vista real**, mucho más grande que lo que el
  roadmap original de 3 pasos preveía: dashboard, gemelo (mapa espiral con
  pan/zoom + drag&drop), tareas, catálogos, perfil, admin — con RBAC por rol
  (`usuarios.js`/`auth.js`) y log de auditoría (`_logActividad` →
  `registro_actividad`, filtrable por tipo/persona/fecha en Admin).

## 2. Mapa en espiral (Gemelo) — estado técnico

- **Geometría**: `js/geometria-espiral.js` es módulo puro (sin DOM, sin
  Firebase) y única fuente de verdad de ángulos/radios/colocación
  automática. El render 2D (y cualquier futuro 3D) debe consumirlo, nunca
  recalcular trigonometría por su cuenta.
- **Render**: `js/render-spiral-2d.js` construye el SVG a mano
  (`createElementNS`/`setAttribute`, nunca `innerHTML`, ni siquiera en el
  namespace SVG).
- **Interacción**: `js/vista-gemelo.js` (antes vivía en `main.js`, movido en
  la división de Fase 19) agrega pan (arrastre de 1 dedo), zoom (rueda /
  pellizco de 2 dedos / botones ±) y drag&drop de plantas — todo con
  Pointer Events, nunca la API de drag&drop nativa (no dispara en touch; el
  proyecto es mobile-first desde Fase 13).
- **Bug de mobile detectado y corregido (auditoría 2026-07-24, fix mismo
  día, Fase 18.3).** `.gemelo-mapa-wrapper` usaba `width/height:
  min(90vh,900px)`, sin ningún `max-width:100%` que lo frenara. En
  cualquier teléfono en vertical (`vh > vw`), esto forzaba un ancho MAYOR
  que la pantalla real → overflow horizontal de toda la vista Gemelo. Fix
  aplicado: se agregó `calc(100vw - 2 * var(--space-6))` como tercer
  término del `min()` en AMBOS ejes (ancho y alto — solo acotar el ancho
  habría estirado el `<svg>` cuadrado de adentro a una proporción no
  cuadrada). Ver comentario en `index.html` junto al wrapper.
  Pendiente aparte, NO corregido en este fix: las fichas de planta
  (`RADIO_FICHA_PX=16` en `geometria-espiral.js`) rendean muy chicas en la
  vista por defecto en mobile (~13-15px de diámetro, bajo el mínimo táctil
  de 44px) — el zoom (hasta 4x) compensa parcialmente pero no lo resuelve
  de raíz.
- **Drag&drop de plantas: bug de scroll táctil detectado y corregido
  (misma auditoría, fix mismo día, Fase 18.4).** `.plant-card` tenía
  `touch-action:none` incondicional + arranque de arrastre en el propio
  `pointerdown`, sin umbral — con ~33 plantas en el catálogo, la tira
  horizontal de `.gemelo-panel-lista` no se podía scrollear con el dedo en
  mobile (el navegador decide si permite scroll nativo en el touchstart,
  antes de que corriera cualquier JS). Fix: `touch-action:pan-x` en mobile
  / `pan-y` desde 720px (mismo breakpoint que el layout), más
  `iniciarPosibleArrastrePlanta` (`js/vista-gemelo.js` desde Fase 19, vivía
  en `main.js` cuando se escribió este fix) — espera
  `UMBRAL_ARRASTRE_PLANTA_PX` (9px) y decide por la dirección dominante del
  gesto si es scroll de la lista (no hace nada, deja el pan nativo) o
  arrastre hacia el mapa (recién ahí arranca `iniciarArrastrePlanta`). Mouse
  (`pointerType === 'mouse'`) se excluye de esta espera — conserva el
  arranque instantáneo original, no tenía el problema de scroll bloqueado.
- **Ghost del drag tapado por el dedo: corregido (misma auditoría, Fase
  18.5).** `.gemelo-drag-ghost` se centraba exactamente en `clientX/clientY`
  — en touch, el propio dedo tapaba el ghost y el resaltado de la cama de
  destino mientras se arrastraba. Fix: `iniciarArrastrePlanta`
  (`js/vista-gemelo.js` desde Fase 19) desplaza el ghost 70px hacia arriba
  del punto de contacto SOLO para
  `pointerType !== 'mouse'` — puramente visual, `elementFromPoint` sigue
  usando `clientX/clientY` reales (sin el desplazamiento) para detectar la
  cama bajo el dedo, así el drop se siente anclado a donde está el dedo, no
  a donde se ve el ghost.

**Pendiente de confirmación manual**: los 3 fixes de esta sección (wrapper
del mapa, scroll de la lista de plantas, ghost del drag) se verificaron por
inspección de código, NO en un teléfono real — no había `js/config.js` con
credenciales de Firebase en este entorno ni acceso a la extensión de
Chrome. Falta confirmar en dispositivo real, sobre todo el gesto de
"deslizar para ver más plantas vs. arrastrar hacia el mapa" (Fase 18.4),
que es el tipo de cosa que se siente distinto en la mano de lo que se ve en
el código.

## 3. Roadmap de Saneamiento (revisado)

- [x] ~~Paso 1: Consolidación~~ — parcial: JS sí se movió a `js/`, CSS no.
- [ ] Paso 1b: terminar de mover el `<style>` de `index.html` a
      `css/main.css`/`css/components.css` (hoy vacíos).
- [x] Paso 2 (Firebase): resuelto vía `js/config.js` gitignored + fail-fast.
- [ ] Paso 2b (Gemini): sigue pendiente — implementar detrás de una Cloud
      Function antes de conectar `js/ai.js` a la API real.
- [x] Paso 3a: `firestore.rules` versionado.
- [ ] Paso 3b: `firestore.indexes.json` sigue vacío — exportar el índice
      real de producción y commitear.
- [x] Nuevo: dividir `js/main.js` en módulos por vista (Fase 19,
      2026-07-24) — ver "Arquitectura de módulos" más abajo.
- [x] Nuevo: fix de mobile en `.gemelo-mapa-wrapper` (ver sección 2, Fase 18.3).
- [x] Nuevo: fix de scroll táctil en panel de plantas (ver sección 2, Fase 18.4).
- [x] Nuevo: fix de ghost tapado por el dedo (ver sección 2, Fase 18.5).
- [ ] Nuevo: fichas de planta con touch target chico en mobile (ver sección 2).
- [x] Nuevo: confirmar en teléfono real los 3 fixes de Fase 18.3/18.4/18.5 (ver sección 2) — confirmado 2026-07-24, se ven bien.
- [ ] Nuevo: confirmar en navegador real la división de Fase 19 — verificada
      por inspección de código + linking estático de ES modules con Node
      (sin poder ejecutar el runtime completo por falta de `js/config.js`
      real en este entorno), NO en un navegador real todavía. Pase de
      regresión sugerido: login → las 8 vistas → drag&drop de una planta →
      logout (ver detalle por módulo en "Arquitectura de módulos").

## 4. Arquitectura de módulos (Fase 19, 2026-07-24)

`js/main.js` se dividió en 12 módulos. Capas, de más pura a más orquestadora:

- **Servicio (sin cambios en esta fase)**: `db.js`, `chores.js`,
  `usuarios.js`, `auth.js`, `firebase.js`, `session.js` — no conocen el DOM.
- **UI pura (sin cambios)**: `render.js`, `render-spiral-2d.js`,
  `geometria-espiral.js`.
- **Hojas nuevas (Fase 19, sin imports salientes entre sí)**: `core-ui.js`
  (`mostrarToast`/`openModal`/`closeModal`/`marcarStatus*`), `estado-app.js`
  (`esAdminActual` vía `getEsAdminActual`/`setEsAdminActual`).
- **`router.js`**: `navegarA`/`ocultarTodasLasVistas`. A propósito NO
  importa ningún `vista-*.js` — si lo hiciera, cada vista tendría que
  importarlo de vuelta, un ciclo entre 6+ archivos.
- **Vistas** (cada una con sus propios `document.getElementById` — sin
  registro central de refs DOM, cada módulo consulta directo lo que usa):
  `vista-perfil.js`, `vista-bitacora.js`, `vista-catalogos.js`,
  `vista-tareas.js`, `vista-admin.js`, `vista-gemelo.js`,
  `vista-dashboard.js`, `vista-login.js`.
- **`main.js` (raíz de composición)**: bootstrap de `auth:resuelto` +
  listener delegado de `headerNav` — el único módulo al que le toca
  importar las 5 rutas con carga de datos propia (`irAVistaTareas` etc.).

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
(`mostrarDashboard`).

`vista-admin.js` fusiona dos secciones que en el `main.js` original tenían
nombres parecidos pero eran distintas: el modal de ajuste de horas ("Panel
de Admin") y el log de auditoría con filtros ("Vista de Admin") — se
fusionaron porque ya estaban conectadas por un botón real
(`abrirAjusteHorasBtn` abre el modal del otro "sub-módulo").

Sin cambios en `index.html` — sigue con un solo
`<script type="module" src="js/main.js">`; el navegador resuelve todo el
árbol de imports nuevo transitivamente.

**Verificación de esta fase**: `node --check` en los 22 archivos de `js/`
(sintaxis), cruce manual de cada `import` contra el `export` real de su
archivo destino (sin mismatches), cero declaraciones duplicadas de estado
compartido, y un intento de `node --input-type=module -e "import('./js/main.js')"`
que confirmó el linking estático de ES modules recorriendo
`main.js → vista-login → vista-dashboard → vista-gemelo → db.js → firebase.js`
sin error de export faltante, antes de toparse (esperado) con el import a
CDN de Firebase que Node no puede resolver sin red/loader especial. NO se
probó en un navegador real — ver pendiente en la sección 3.

## 5. Reglas de trabajo (vigentes, confirmadas en el código)

- Mobile-first desde Fase 13 — confirmado explícitamente en comentarios de
  `main.js`/`index.html` (ej. elección de Pointer Events sobre drag&drop
  nativo justo por esto).
- Nunca usar `innerHTML` — tampoco en SVG (`createElementNS`/`setAttribute`
  siempre).
- Toda función de escritura a Firestore pasa por un wrapper de log
  (`_logActividad`).
- Geometría del espiral: cero trigonometría nueva fuera de
  `geometria-espiral.js` — los renderers solo consumen, nunca recalculan
  ángulos/radios por su cuenta.
- No inventar defaults ante datos faltantes (`dias_siembra_a_cosecha`, `r`
  de planta, `notas` de cama) — se documenta el fallback explícito o se
  lanza error, nunca se asume un valor.
