# REPORTE_LOGIN_FIX.md
Fecha: 2026-08-21

## Cambios realizados
- Función `login` en auth.ts adaptada a respuesta real del Apps Script
- Condición cambiada: `data.status !== 'ok'` → `!data.success`
- Extracción de usuario: `data.email` → `data.user.email` (etc.)
- Parámetro de hash ya corregido en hotfix anterior: `hash: pwd`
- Imports agregados: `Sesion` desde `@/types`, `saveSession` desde `@/lib/session`
- Cast de `rol` tipado correctamente: `(u.rol === 'Admin' ? 'Admin' : 'Auditor') as 'Admin' | 'Auditor'`

## Build
- npm run build: exitoso — 0 errores TypeScript, 15 rutas generadas

## Commit
68a2fe4 — pusheado a main

## Notas
- La respuesta real del Apps Script es `{ success: true, user: { email, nombre, rol, locales, primerLogin, viaticos } }`
- La función acepta fallback `data.user ?? data` por si la estructura cambia
- Vercel redeploya automáticamente desde main
