# Reporte Fase 6 — Blindaje del flujo de auditoría

## Resumen
Fase 6 implementa todas las capas de resiliencia y corrección de bugs críticos detectados en Fase 5.

## Cambios implementados

### 1. Borrador con autosave (`lib/borrador.ts`)
- Autosave al context cada 400ms de inactividad en `pregunta/page.tsx`
- `AppContext` sincroniza borrador a localStorage en cada cambio de `answers`
- TTL 72h, cap 4MB (strips fotos si excede)
- Exportación como texto plano para compartir sin conexión

### 2. Banner de borrador en Welcome (`app/welcome/page.tsx`)
- Detecta borrador al montar, muestra local + cantidad de respuestas + timestamp
- Botones: Continuar (AUDIT_RESTORE) / Exportar (share/clipboard) / Descartar (confirm)
- Avisa si las fotos no se pudieron guardar

### 3. Scoring alineado con backend (`services/scoring.ts`)
- `normImp()` normaliza acentos ('crítico' → 'critico')
- Solo cuenta respuestas que contienen 'cumple' o 'parcial'
- Reprobado basado en `(criticosFallidos / criticosTotal * 100) >= umbralCriticosPct`
- Puntaje `Puntaje` actualizado: `criticosTotal`, `criticosFallidos`, `nivel: string` (no enum), `'A mejorar'` reemplaza `'Requiere mejora'`

### 4. Umbral configurable (`services/config.ts`)
- `getUmbralCriticos()` consulta Apps Script `?action=getUmbral`, fallback a 10%
- `DataLoader.tsx` despacha `SET_UMBRAL` al arrancar
- `AppContext` persiste `umbralCriticos` en estado global

### 5. Corrección de inputs numéricos y de fecha (`app/auditoria/pregunta/page.tsx`)
- `type="text"` + `inputMode="decimal"` en todos los inputs numéricos (fix Android coma)
- `number` legacy: `setRawValor(v); setRespuesta(v.replace(/,/g, '.'))`
- `fecha` legacy: `setFechaRaw(v); setRespuesta(v)`
- `numero_auto`: normaliza coma antes de `evaluarNumero`, `setRespuesta(verd ?? norm)`
- Sufijo de unidad extraído con `extraerUnidad()` visible en el input

### 6. Página de incumplimientos (`app/auditoria/incumplimientos/page.tsx`)
- Agrupa respuestas negativas por categoría
- Color amber (parcial) / rojo (no cumple)
- Muestra observación, rawValor, fotos por ítem
- Botón accesible desde Categorías y Resumen

### 7. Verificación de envío + rescate (`services/envio.ts`, `app/auditoria/resumen/page.tsx`)
- `verificarEnvio()`: consulta `?action=verificarAudit&auditId=...`, hasta 4 reintentos cada 6s
- Si POST falla → auto-verifica → si confirma: limpia borrador, va a Éxito
- Si no confirma: `marcarSinConfirmar(auditId)`, muestra bloque rescate (Reintentar / Exportar)
- `borrarBorrador()` llamado antes de `AUDIT_RESET` en éxito

### 8. Categorías mejoradas (`app/auditoria/categorias/page.tsx`)
- Pasa `state.umbralCriticos` a `calcularPuntaje`
- Botón incumplimientos visible cuando hay respuestas negativas
- Score en tiempo real mientras se completa la auditoría

## Pendiente (acción manual — Marcos)
- Agregar `case 'getUmbral':` en Apps Script (fallback funciona con 10% hasta entonces)
- Agregar `case 'verificarAudit':` en Apps Script (fallback: verificación retorna false, muestra rescate)

## Commit
`fix: fase 6 - borrador, autosave, scoring alineado con backend, incumplimientos, verificacion de envio`
Hash: `7daafe1`
