# REPORTE_HOTFIX.md
Fecha: 2026-08-21

## Diagnóstico del login

### Parámetro de contraseña en app.js
`hash` — el Apps Script lee `e.parameter.hash`

### Línea exacta del Apps Script donde lee la contraseña
```javascript
var hashLog  = e.parameter.hash || '';
```
(apps-script.gs, línea 1153)

### ¿Coincide con lo que envía auth.ts?
No coincidía. El `auth.ts` original enviaba `password: pwd`.
**Cambio aplicado:** `password: pwd` → `hash: pwd` en `callAPI({ action: 'login', email, hash: pwd })`

## Logos encontrados en la raíz del proyecto
- `logo.png`
- `icon-192.png`
- `icon-512.png`
- `apple-touch-icon.png`

## Logo copiado a web/public/
- `logo.png` (principal — usado en login y welcome)
- `icon-192.png`
- `icon-512.png`
- `apple-touch-icon.png`

## Nombre de la app corregido en
- layout.tsx: sí — title y appleWebApp.title: "Sistema de Auditorías"
- login/page.tsx: sí — h1 visible en pantalla
- manifest.json: sí — creado desde cero con name correcto (no existía)

## Build
- npm run build: exitoso — 0 errores TypeScript, 15 rutas generadas

## Commit
8b7b768 — pusheado a main

## Notas
- El manifest.json fue creado en esta fase (no existía en Fase 1-3)
- El logo se muestra con `onError` para fallar silenciosamente si el archivo no carga
- Vercel redeploya automáticamente desde main — el fix de `hash` debería resolver el login en producción
