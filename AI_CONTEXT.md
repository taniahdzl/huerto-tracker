# Contexto del Proyecto: Huerto Universitario (Gemelo Digital)

## 1. Estado Actual (SINCERO)
- **Monolito Detectado:** El código reside actualmente en un archivo `index.html` de +600 líneas (CSS inline + JS inline). 
- **Desconexión:** Los archivos `/js/auth.js`, `/js/main.js` y `/js/render.js` están vacíos. No existen como módulos.
- **Seguridad:** Crítica. La API Key de Gemini se guarda en `localStorage` (esto debe eliminarse en la próxima fase).
- **Fuente de Verdad:** Firestore. Se debe ignorar cualquier referencia antigua a Realtime Database.

## 2. Roadmap de Saneamiento
- [ ] **Paso 1: Consolidación:** Mover lógica de `index.html` a `js/` siguiendo el patrón de capas (service/logic/ui).
- [ ] **Paso 2: Seguridad:** Eliminar `localStorage` para la API Key. Implementar el patrón de proxy/servidor (Cloud Functions) o, por ahora, inyección de variables de entorno segura.
- [ ] **Paso 3: Auditoría:** Implementar `firestore.rules` y `firestore.indexes.json` como archivos versionados en el repo.

## 3. Reglas de trabajo
- No añadir nuevas funcionalidades hasta que el monolito `index.html` se reduzca a <100 líneas.
- Toda función de escritura a Firestore debe pasar por un wrapper de log (_logActividad).