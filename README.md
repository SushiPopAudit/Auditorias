# Sistema de Auditorías — Guía de configuración

## Pasos para dejar todo funcionando

---

### PASO 1 — Publicar la hoja de Locales como CSV

1. Abrí el Google Sheets con las preguntas
2. Hacé clic en la pestaña **"Locales"**
3. Menú **Archivo → Compartir → Publicar en la web**
4. En el primer dropdown elegí **"Locales"** (la hoja)
5. En el segundo dropdown elegí **"Valores separados por comas (.csv)"**
6. Clic en **Publicar** → copiá la URL que aparece
7. Pegala en `config.js` en el campo `localesURL`

---

### PASO 2 — Crear el Google Sheets de Resultados

1. Creá un nuevo Google Sheets (va a ser donde se guardan las auditorías)
2. Copiá el ID del spreadsheet desde la URL:
   `https://docs.google.com/spreadsheets/d/**ID_ACA**/edit`
3. Guardalo, lo vas a necesitar en el Paso 3

---

### PASO 3 — Crear la carpeta de Drive para fotos

1. En Google Drive, creá una carpeta llamada **"Fotos Auditorías"**
2. Abrila y copiá el ID desde la URL:
   `https://drive.google.com/drive/folders/**ID_ACA**`

---

### PASO 4 — Configurar el Google Apps Script

1. Andá a [script.google.com](https://script.google.com) → **Nuevo proyecto**
2. Borrá el código que viene por defecto
3. Copiá todo el contenido de `apps-script.gs` y pegalo
4. Reemplazá `REEMPLAZAR_CON_ID_SPREADSHEET_RESULTADOS` con el ID del Paso 2
5. Reemplazá `REEMPLAZAR_CON_ID_CARPETA_DRIVE` con el ID del Paso 3
6. Guardá el proyecto (Ctrl+S)

**Desplegar el script:**
1. Clic en **Desplegar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo (tu cuenta)**
4. Quién tiene acceso: **Cualquier persona**
5. Clic en **Desplegar**
6. Copiá la URL que aparece (empieza con `https://script.google.com/macros/s/...`)

---

### PASO 5 — Actualizar config.js

Abrí `config.js` y completá los tres valores:

```js
localesURL:     'URL del CSV de locales (Paso 1)',
appsScriptURL:  'URL del Apps Script desplegado (Paso 4)',
driveFolderID:  'ID de la carpeta de Drive (Paso 3)',
```

---

### PASO 6 — Publicar en GitHub Pages

1. Creá un repositorio en GitHub (podés llamarlo `auditoria-app`)
2. Subí todos los archivos de esta carpeta
3. En el repositorio → **Settings → Pages**
4. Source: **Deploy from a branch** → branch: **main** → folder: **/ (root)**
5. Guardá — en unos minutos vas a tener la URL de la app

---

## Estructura de datos guardados (hoja Resultados)

Cada fila es un punto de control de una auditoría:

| Campo | Descripción |
|---|---|
| AuditID | ID único de la auditoría (ej: AUD_Palermo_1234567) |
| Fecha | Fecha de la visita |
| Hora | Hora de inicio del envío |
| Auditor | Nombre del auditor |
| Local | Local auditado |
| Marca | Multimarca / Causa |
| Categoría | BPM / Elaborados / Local |
| Subcategoría | Almacenamiento / Limpieza / etc. |
| Control | Punto específico evaluado |
| Importancia | Crítico / Alta / Media / Baja |
| Explicación | Descripción del control |
| Respuesta | Cumple / Cumple parcialmente / No Cumple / No Aplica |
| Observación | Comentarios del auditor |
| URL Foto | Link a la foto en Drive (si se tomó) |

---

## Para el dashboard (próximo paso)

Con los datos en Google Sheets podés usar:
- **Google Looker Studio** (gratis) — conecta directo al spreadsheet y hacés gráficos sin código
- **Dashboard dentro de la misma web** — una segunda página con filtros por local y fecha

Avisame cuál preferís y lo armamos.
