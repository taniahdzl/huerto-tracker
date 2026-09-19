# 🌿 Huerto Universitario — Gemelo Digital

Aplicación web (SPA) para el seguimiento colaborativo del huerto urbano universitario. El equipo visualiza el huerto como un mapa en espiral interactivo (pan/zoom + drag&drop), registra siembras/trasplantes/cosechas, administra tareas asignadas por rol, y lleva bitácora y auditoría de actividad — todo sincronizado en tiempo real vía Cloud Firestore.

**Repo:** https://github.com/taniahdzl/huerto-tracker

---

## ¿Qué hace?

- **Dashboard** — resumen del estado general del huerto y banner de bitácora reciente
- **Gemelo digital** — mapa del huerto en espiral (SVG dibujado a mano, sin `innerHTML`), con pan/zoom (rueda, pellizco, botones) y drag&drop de plantas desde el catálogo, mobile-first con Pointer Events
- **Tareas** — asignación y seguimiento de tareas por estudiante. Cada tarea es `tipo:'asistencia'` (otorga horas, foto de evidencia obligatoria al completar) o `tipo:'individual'` (foto opcional, horas opcionales). Las horas a otorgar se declaran explícitas al crear la tarea — el formulario sugiere 15h si se crea en sábado, editable — ya no dependen del día en que se completa
- **Proyectos** — galería de tarjetas que *organiza* tareas existentes en pasos ordenados, sin duplicarlas (`tareas.proyectoId`, opcional). El progreso de cada tarjeta (barra + "N de M pasos") se recalcula siempre desde el estado real de las tareas referenciadas — nunca un contador aparte. Completar un paso reusa el mismo flujo/modal de Tareas, así que otorga horas exactamente igual (sin camino alterno)
- **Catálogos** — catálogo de semillas/plantas y camas de cosecha
- **Bitácora** — registro de sesiones de trabajo
- **Perfil** — cada usuario gestiona su propio rol (`estudiante`/`externo`) y ve sus horas
- **Admin** — panel de ajuste de horas + log de auditoría de actividad con filtros (solo rol `admin`)
- **RBAC real** vía Firebase Auth + Firestore: reglas de seguridad distinguen `admin` de `estudiante`/`externo`, y ningún usuario puede autoasignarse `admin`

> El asistente de IA (`js/services/ai.js`) es un **stub sin conectar** — GitHub Pages/Vercel es hosting estático, así que no hay dónde esconder una API key de Gemini sin una Cloud Function intermedia. No implementar la llamada real hasta que exista ese backend.

> **Proyectos está completo en código y con tests (Firestore mockeado), pero sin confirmar en un navegador real** — mismo estado pendiente que la foto de evidencia de Storage (ver más abajo). Antes de darlo por cerrado, alguien necesita entrar y confirmar que la galería, los badges y el checklist se ven/sienten bien de verdad.

---

## Estructura del proyecto

```
huerto-tracker/
├── index.html              # Shell de la SPA (~555 líneas) — solo HTML de vistas
├── css/
│   ├── variables.css        # Design tokens
│   ├── main.css              # Esqueleto de página (reset, header, mecánica de vistas)
│   └── components.css        # Widgets reutilizables (botones, modales, tarjetas, badges)
├── js/
│   ├── main.js               # Raíz de composición: bootstrap de sesión + nav
│   ├── services/              # Sin DOM: firebase.js, db.js, auth.js, usuarios.js, chores.js, session.js, storage.js, proyectos.js
│   ├── render/                 # UI pura, sin Firebase: geometría y render del espiral
│   ├── shared/                  # Hojas compartidas entre vistas: router, core-ui, estado-app
│   └── views/                    # Una vista por archivo (vista-dashboard, vista-gemelo, vista-tareas, vista-proyectos, ...)
├── test/                    # node --test + jsdom + mock de Firestore/Auth en memoria
├── scripts/
│   ├── generate-config.js   # Genera js/services/config.js desde variables de entorno FIREBASE_* (buildCommand de Vercel)
│   └── upload.js             # Script puntual de carga inicial de plantas.csv a Firestore (requiere serviceAccountKey.json local, no forma parte del flujo normal)
├── firestore.rules          # Reglas de seguridad de Firestore (RBAC por rol)
├── firestore.indexes.json   # Índices compuestos
├── storage.rules            # Reglas de seguridad de Cloud Storage (evidencia de tareas) — archivo aparte, no vive en firestore.rules
└── vercel.json               # Hosting + build (genera config.js en cada deploy)
```

Ver `AI_CONTEXT.md` para el detalle completo y actualizado de arquitectura, dependencias entre módulos y decisiones de diseño — es la fuente de verdad técnica de este proyecto, más granular que este README.

---

## Configuración inicial

### 1. Cloud Firestore

1. Ve a [Firebase Console](https://console.firebase.google.com/) e inicia sesión con la cuenta del huerto
2. Crea (o usa) el proyecto y habilita **Firestore** (no Realtime Database)
3. Despliega `firestore.rules` y `firestore.indexes.json` con la Firebase CLI:
   ```bash
   npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes
   ```
   Las reglas ya están versionadas en este repo y reflejan lo que corre en producción — no las reescribas desde la consola sin actualizar también el archivo.

### 2. Configuración de Firebase para el cliente

`js/services/config.js` **no se commitea** (está en `.gitignore`) y `js/services/firebase.js` falla rápido si falta o si sigue con el placeholder.

- **Local:** copia `js/services/config.example.js` a `js/services/config.js` y reemplaza los valores reales (Firebase Console → Configuración del proyecto → General).
- **Producción (Vercel):** no se edita `config.js` a mano — `vercel.json` corre `node scripts/generate-config.js` como `buildCommand`, que genera ese archivo a partir de las variables de entorno `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_APP_ID` (configúralas en Vercel → Settings → Environment Variables). El build falla explícitamente si falta alguna.

### 3. Cloud Storage (foto de evidencia de tareas)

Usado para la foto obligatoria de tareas `tipo:'asistencia'` (opcional en `tipo:'individual'`). Es la primera vez que el proyecto usa Storage — no hay nada que migrar.

> ⚠️ **Requiere el plan Blaze de Firebase** (pago por uso) desde feb-2026 — no funciona en el plan Spark gratuito. Activa Storage por primera vez desde Firebase Console → Build → Storage → Get Started (esto crea el bucket) y luego despliega las reglas:
> ```bash
> npx -y firebase-tools@latest deploy --only storage
> ```
> Mientras el proyecto siga en Spark, la funcionalidad de foto de evidencia está completa en código pero no se puede probar de verdad — la subida fallará.

### 4. Usuarios y roles

No hay registro público de administradores: un usuario nuevo solo puede crearse con rol `estudiante` o `externo`; la promoción a `admin` se hace manualmente desde Firestore por quien ya sea admin.

---

## Desarrollo y pruebas

```bash
npm install     # única dependencia real: jsdom
npm test        # corre test/*.test.js (node --test + jsdom + mock de Firestore/Auth)
```

- Usa siempre `npm test`, no `node --test` a secas — el script pasa `--experimental-test-module-mocks`, necesario para el mock de Firestore.
- CI corre la misma suite en cada push/PR a `main` vía `.github/workflows/test.yml`.
- Para servir la app localmente, cualquier servidor estático simple funciona (ej. `npx serve .`) una vez que `js/services/config.js` existe.

---

## Reglas de trabajo vigentes

- **Mobile-first** — Pointer Events en vez de la API nativa de drag&drop (no dispara en touch).
- **Nunca `innerHTML`**, ni siquiera en SVG (`createElementNS`/`setAttribute` siempre).
- Toda escritura a Firestore pasa por un wrapper de log de auditoría (`_logActividad`).
- La geometría del mapa en espiral vive únicamente en `js/render/geometria-espiral.js` — ningún otro módulo recalcula trigonometría por su cuenta.
- No inventar valores por defecto ante datos faltantes — se documenta el fallback explícito o se lanza error.
- No agregar `"type": "module"` a `package.json` — `scripts/generate-config.js` y `scripts/upload.js` usan `require()` de CommonJS y eso rompería el build de producción.

Detalle completo, historial de fases y decisiones de diseño: ver `AI_CONTEXT.md`.

---

## Despliegue

El sitio se despliega en **Vercel**, no en GitHub Pages. Cada push a `main` dispara un deploy; el `buildCommand` regenera `js/services/config.js` desde las variables de entorno del proyecto en Vercel antes de publicar.

---

## Créditos

Desarrollado como proyecto de **Servicio Social Universitario** por **Tania Hdz Lira**.

Datos agronómicos basados en el catálogo de plantas del huerto universitario.

---

*Huerto Universitario — porque la comida que sembramos juntos sabe mejor.*
