# 🌿 Huerto Universitario — Tracker Interactivo

Una aplicación web para el seguimiento colaborativo del huerto urbano universitario. Permite al equipo visualizar el layout del huerto, rastrear fechas de siembra y trasplante, monitorear niveles de nutrientes del suelo, y recibir alertas de cosecha — todo sincronizado en tiempo real vía Firebase.

**[Ver demo en vivo →](https://tu-usuario.github.io/huerto-tracker)**

---

## ¿Qué hace?

- **Mapa visual del huerto** — cada mesa de cultivo (cama) se muestra en un grid interactivo con indicadores de estado
- **Alertas automáticas** — calcula cuándo cosechar, transplantar, o añadir nutrientes basándose en la base de datos de plantas
- **Niveles de suelo** — seguimiento de Nitrógeno (N), Fósforo (P) y Potasio (K) por mesa
- **Sincronización en tiempo real** — todo el equipo ve los mismos datos vía Firebase Realtime Database
- **Asistente IA** — integración con Gemini API para consultas en lenguaje natural ("¿cuándo cosechamos las zanahorias?")
- **Base de datos de 35 plantas** — con datos de fotoperiodo, consumo hídrico, temperaturas, espaciado y requerimientos de nutrientes

---

## Estructura del proyecto

```
huerto-tracker/
├── index.html        # Aplicación completa (single-file)
├── README.md         # Este archivo
└── data/
    └── plantas.csv   # Base de datos de plantas (fuente original)
```

La app es intencionalmente un solo archivo HTML sin dependencias de build. Esto facilita el mantenimiento por futuros estudiantes de servicio social sin conocimientos avanzados de desarrollo.

---

## Configuración inicial

### 1. Firebase Realtime Database

1. Ve a [Firebase Console](https://console.firebase.google.com/) e inicia sesión con la cuenta del huerto
2. Crea un nuevo proyecto (o usa uno existente)
3. En el menú lateral ve a **Build → Realtime Database → Create Database**
4. Elige la región más cercana (us-central suele funcionar bien desde México)
5. Inicia en **modo de prueba** por ahora
6. Copia la URL de la base de datos — tiene este formato:
   ```
   https://tu-proyecto-default-rtdb.firebaseio.com
   ```

#### Reglas de seguridad recomendadas

Una vez que el equipo esté listo, reemplaza las reglas en Firebase Console → Realtime Database → Rules con esto:

```json
{
  "rules": {
    "beds": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

Esto permite que cualquiera *lea* el mapa (útil para consulta rápida desde el celular) pero solo usuarios autenticados puedan *escribir*. Si quieren restringir también la lectura, cambien `.read` a `"auth != null"`.

### 2. Gemini API Key

1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Haz click en **Create API Key**
3. Copia la key — empieza con `AIza...`

> ⚠️ **Importante:** No subas tu API key directamente al repositorio si este es público. Guárdala localmente en la app vía el panel de configuración (se guarda en `localStorage` del navegador de cada usuario, nunca en el repo).

### 3. Configurar la app

1. Abre la app en el navegador
2. Haz click en **⚙ Configurar** (esquina superior derecha)
3. Ingresa:
   - Firebase Database URL
   - Gemini API Key
   - Número de columnas y filas del huerto real
   - Nombre del huerto
4. Guarda — los datos se sincronizan automáticamente

---

## Cómo usar

### Agregar una mesa de cultivo
- Haz click en **+ Mesa** para crear una nueva cama con posición en el grid
- O arrastra una planta del catálogo izquierdo directamente sobre una mesa vacía

### Registrar siembra o trasplante
- Haz click sobre cualquier mesa → **✏ Editar**
- Selecciona la planta, ingresa la fecha de siembra y/o trasplante
- Ajusta los niveles de nutrientes del suelo con los sliders

### Entender las alertas visuales
| Color / efecto | Significado |
|---|---|
| 🔴 Rojo pulsante | Cosechar ya / nutriente crítico |
| 🟡 Naranja pulsante | Cosechar en menos de 14 días |
| 🟣 Morado | Necesita trasplante pronto |
| Puntos de colores en la mesa | Alertas específicas (hover para ver detalle) |

### Consultar el asistente IA
- Abre el panel **🤖 Asistente IA** en la esquina inferior derecha
- Ejemplos de preguntas útiles:
  - *"¿Qué mesas necesitan atención esta semana?"*
  - *"El potasio está bajo en la mesa A2, ¿qué hago?"*
  - *"¿Podemos plantar cilantro junto a la tomatera?"*
  - *"¿Cuándo es el mejor momento para cosechar la zanahoria de la mesa B1?"*

---

## Actualizar la base de datos de plantas

Las plantas están definidas en el array `PLANTS` dentro de `index.html` (línea ~18). Cada planta tiene esta estructura:

```javascript
{
  id: 'NOMBRE_ID',
  name: 'Nombre visible',
  type: 'hoja|raíz|fruto|flor|tallo|semilla',
  emoji: '🌿',
  daysSeed: [min, max],        // días desde siembra hasta cosecha
  daysTransplant: [min, max],  // días desde trasplante hasta cosecha (null si no aplica)
  rootDepth: [min, max],       // profundidad de raíz en cm
  N: 1.5,                      // requerimiento de nitrógeno (relativo)
  P: 1.0,                      // requerimiento de fósforo
  K: 1.2,                      // requerimiento de potasio
  waterMm: [min, max],         // consumo hídrico mm/semana
  minTemp: 5,                  // temperatura mínima °C
  optTemp: '15-22',            // temperatura óptima
  maxTemp: 30,
  photoperiod: '6-8',          // horas de luz requeridas
  spacing: [min, max],         // cm entre plantas
  rowSpacing: 40               // cm entre hileras
}
```

Para agregar una planta nueva, copia un objeto existente, modifica los valores según el CSV fuente, y agrégalo al array.

---

## Despliegue en GitHub Pages

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/huerto-tracker.git
cd huerto-tracker

# Hacer cambios...

# Subir cambios
git add .
git commit -m "descripción del cambio"
git push origin main
```

GitHub Pages se actualiza automáticamente en 1-2 minutos tras cada push. La URL del sitio es:
```
https://tu-usuario.github.io/huerto-tracker
```

---

## Para futuros estudiantes de servicio social

Si estás tomando el relevo de este proyecto, esto es lo mínimo que necesitas saber:

1. **Para cambios de contenido** (agregar plantas, ajustar días de cosecha) — solo edita `index.html` y haz push
2. **Para ver los datos actuales** — abre la app, los datos vienen de Firebase automáticamente
3. **Si la app deja de sincronizar** — probablemente expiró el plan gratuito de Firebase o cambiaron las reglas; revisa la consola del navegador (F12) para ver el error
4. **Si el asistente IA no responde** — la API key de Gemini puede haber expirado o alcanzado el límite gratuito; genera una nueva en Google AI Studio
5. **Contacto de quien construyó esto** — ver sección de créditos abajo

---

## Tecnologías usadas

- **HTML/CSS/JS** vanilla — sin frameworks, sin build tools, fácil de mantener
- **Firebase Realtime Database** — sincronización en tiempo real entre dispositivos
- **Google Gemini API** — asistente de IA para consultas agronómicas
- **GitHub Pages** — hosting gratuito y despliegue automático

---

## Créditos

Desarrollado como proyecto de **Servicio Social Universitario** por **[Tania Hdz Lira]** · [therna24@itam.mx]

Datos agronómicos basados en el catálogo de plantas del huerto universitario.

---

*Huerto Universitario — porque la comida que sembramos juntos sabe mejor.*
