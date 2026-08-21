# COWORK_INSTRUCTIONS.md — Fase 6: Blindaje del flujo de auditoría
**Fecha:** 2026-08-21
**Generado por:** CoWork (auditoría completa de `app.js` vs `web/src`)
**URL producción:** https://auditorias-eta.vercel.app/

---

## ⚠️ INSTRUCCIONES DE EJECUCIÓN

Debes ejecutar completamente todas las tareas, incluyendo todos los comandos de terminal.

**Método:** varias tareas modifican archivos existentes. Para cada una: **leé el archivo completo primero**, después aplicá el cambio adaptándolo a lo que ya existe. No asumas nombres de acciones ni de campos — verificalos.

Hay **una tarea manual de Marcos** (Tarea 0) que hay que hacer antes que el resto. Está marcada con 🙋.

---

## Contexto: los 6 bugs críticos detectados

Se auditó el prototipo (`app.js`, 5755 líneas) contra la implementación actual. Estos son los bugs que hacen que la app no sea usable en producción todavía:

| # | Bug | Consecuencia real |
|---|---|---|
| 1 | No hay borrador/autosave | Si el inspector cierra la app o recarga, **pierde las 188 respuestas y todas las fotos** |
| 2 | Las respuestas solo se guardan al tocar "Siguiente" | Usar el menú inferior o el botón atrás del celular pierde la pregunta en curso |
| 3 | Las preguntas `numero`/`fecha` legacy nunca setean `respuesta` | **`allComplete` nunca es true → el botón "Ver Resumen" nunca aparece → la auditoría no se puede cerrar** |
| 4 | Input numérico usa `type="number"` | En Android con locale es-AR, tipear `36,5` **deja el campo vacío silenciosamente** |
| 5 | `scoring.ts` no filtra por tipo de respuesta | El % que ve el inspector **difiere del que sale en el email** (headcount y texto libre contaminan el cálculo) |
| 6 | No existe la pantalla de Incumplimientos | No hay vista para revisar los desvíos con el acompañante en el local |
| 7 | No hay verificación de envío | Si el POST falla no hay reintento ni forma de rescatar los datos |

---

# TAREA 0 — 🙋 MARCOS: agregar una acción al Apps Script

**Contexto:** el umbral de "% de críticos para reprobar" lo configura el Admin (hoy está en 10%). La app necesita leer ese valor, pero la acción `getConfig` existente requiere credenciales de Admin — un Auditor no puede llamarla.

La solución es agregar una acción nueva de solo lectura. **Es aditiva: no modifica nada existente, no puede romper la app vieja.**

## Pasos para Marcos:

1. Abrir el Google Sheet de **Resultados Auditorías**
2. Menú **Extensiones → Apps Script**
3. Buscar en el código la línea que dice `if (action === 'getConfig') {`
4. **Justo ANTES de esa línea**, pegar este bloque:

```javascript
  // Umbral de críticos SIN autenticación (solo lectura, valor no sensible)
  // Lo necesita la app web para que el puntaje del cliente coincida con el del backend
  if (action === 'getUmbral') {
    try {
      var ssUm = SpreadsheetApp.openById(SPREADSHEET_ID);
      var umbralPub = parseFloat(getConfigValue(ssUm, 'umbral_criticos_pct', 10)) || 10;
      return jsonResponse({ success: true, umbral_criticos_pct: umbralPub });
    } catch (umErr) {
      return jsonResponse({ success: true, umbral_criticos_pct: 10 });
    }
  }

```

5. Clic en **Guardar** (el ícono de diskette)
6. Clic en **Implementar → Administrar implementaciones**
7. Clic en el ícono de **lápiz** (editar) de la implementación activa
8. En **Versión**, elegir **Nueva versión**
9. Clic en **Implementar**

**Importante:** la URL del Apps Script **no cambia** al hacer esto. No hay que actualizar nada en Vercel.

10. Para verificar que funcionó, abrir esta URL en el navegador:

```
https://script.google.com/macros/s/AKfycbwtsRNwBylKb_Nis4hUXlhj5epPeF7VGgGWSZzzHNAQ7Py00nzPp6g_7D9DsyelOCLB/exec?action=getUmbral
```

Debe devolver: `{"success":true,"umbral_criticos_pct":10}`

- [ ] 0.1 — 🙋 Marcos agregó la acción `getUmbral` y verificó que responde

> **Claude Code:** si Marcos todavía no hizo esta tarea, **igual continuá con el resto**. El código de la Tarea 3 tiene un fallback a 10% si la llamada falla, así que no bloquea nada. Anotá en el reporte si quedó pendiente.

---

# TAREA 1 — Borrador / autosave (CRÍTICO)

Sin esto, un inspector que cierre la app en medio de una auditoría de 188 preguntas pierde todo el trabajo.

## 1.1 — Crear `web\src\lib\borrador.ts`

```typescript
/**
 * borrador.ts — Persistencia de la auditoría en curso en localStorage
 *
 * Replica el comportamiento del prototipo:
 *  - Se guarda en cada cambio
 *  - Si supera 4MB, se guarda una versión sin fotos (las fotos son lo que revienta la cuota)
 *  - Ventana de recuperación: 72 horas
 *  - Solo se borra cuando el servidor confirma la recepción
 */
import type { Local, RespuestaItem } from '@/types';

const KEY          = 'audit_draft';
const KEY_UNCONF   = 'audit_unconfirmed';
const MAX_BYTES    = 4 * 1024 * 1024;      // 4MB
const VENTANA_MS   = 72 * 60 * 60 * 1000;  // 72 horas

export interface Borrador {
  ts:            number;
  local:         Local;
  fecha:         string;
  tipo:          string;
  acompanante:   string;
  posicionAcomp: string;
  auditId:       string;
  catIndex:      number;
  qIndex:        number;
  answers:       Record<string, RespuestaItem>;
  sinFotos?:     boolean;   // true si se tuvo que descartar las fotos por tamaño
}

export function guardarBorrador(b: Omit<Borrador, 'ts'>): void {
  if (!b.local) return;
  try {
    const draft: Borrador = { ...b, ts: Date.now() };
    const json = JSON.stringify(draft);

    if (json.length <= MAX_BYTES) {
      localStorage.setItem(KEY, json);
      return;
    }

    // Demasiado grande: guardar sin fotos (el state en memoria las conserva)
    const slim: Borrador = {
      ...draft,
      sinFotos: true,
      answers: Object.fromEntries(
        Object.entries(draft.answers).map(([k, v]) => [k, { ...v, fotos: [] }])
      ),
    };
    localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    // Cuota excedida o localStorage no disponible — no romper la app
  }
}

export function cargarBorrador(): Borrador | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Borrador;
    if (!b.local || !b.auditId) return null;
    if (Date.now() - b.ts > VENTANA_MS) { localStorage.removeItem(KEY); return null; }
    return b;
  } catch {
    return null;
  }
}

export function borrarBorrador(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_UNCONF);
  } catch {}
}

/** Marca una auditoría como enviada pero sin confirmación del servidor */
export function marcarSinConfirmar(auditId: string): void {
  try { localStorage.setItem(KEY_UNCONF, auditId); } catch {}
}

export function getSinConfirmar(): string | null {
  try { return localStorage.getItem(KEY_UNCONF); } catch { return null; }
}

export function limpiarSinConfirmar(): void {
  try { localStorage.removeItem(KEY_UNCONF); } catch {}
}

/** Texto plano de rescate, para que el inspector pueda copiar los datos si todo falla */
export function exportarBorradorTexto(b: Borrador): string {
  const lineas: string[] = [
    `AUDITORÍA — ${b.local.nombre}`,
    `Fecha: ${b.fecha}   Tipo: ${b.tipo}`,
    `Acompañante: ${b.acompanante || '—'} (${b.posicionAcomp || '—'})`,
    `ID: ${b.auditId}`,
    `Guardado: ${new Date(b.ts).toLocaleString('es-AR')}`,
    '',
    '--- RESPUESTAS ---',
  ];
  Object.values(b.answers).forEach(a => {
    if (!a.respuesta) return;
    lineas.push(`${a.control}: ${a.respuesta}${a.observacion ? ` | Obs: ${a.observacion}` : ''}`);
  });
  return lineas.join('\n');
}
```

## 1.2 — Persistir automáticamente en `AppContext.tsx`

Agregar dos cosas al `AppProvider`:

**A) Una acción `AUDIT_RESTORE` al reducer.** Agregar al type `Action`:

```typescript
| { type: 'AUDIT_RESTORE'; payload: Partial<AuditoriaState> & { local: Local } }
```

Y al switch:

```typescript
case 'AUDIT_RESTORE': {
  const { local } = action.payload;
  // Reconstruir las categorías filtrando por marca (igual que AUDIT_SET_LOCAL)
  const filtradas = state.preguntas.filter(p =>
    p.marca === 'Multimarca' || (local.isCausa ? p.marca === 'Causa' : false)
  );
  const categorias = agruparPorCategoria(filtradas);
  return {
    ...state,
    auditoria: { ...auditInicial, ...action.payload, categorias },
  };
}
```

**B) Un `useEffect` que guarda en cada cambio.** Agregar dentro de `AppProvider`, después del useEffect de la sesión:

```typescript
// Autosave del borrador en cada cambio de la auditoría
useEffect(() => {
  const a = state.auditoria;
  if (!a.local || !a.auditId) return;
  guardarBorrador({
    local:         a.local,
    fecha:         a.fecha,
    tipo:          a.tipo,
    acompanante:   a.acompanante,
    posicionAcomp: a.posicionAcomp,
    auditId:       a.auditId,
    catIndex:      a.catIndex,
    qIndex:        a.qIndex,
    answers:       a.answers,
  });
}, [state.auditoria]);
```

Importar `guardarBorrador` de `@/lib/borrador`.

**Nota:** las `categorias` NO se guardan (son grandes y se reconstruyen desde `preguntas`). Por eso `AUDIT_RESTORE` las regenera.

## 1.3 — Banner de recuperación en `/welcome`

En `web\src\app\welcome\page.tsx`, agregar arriba de los cards:

```typescript
const [borrador, setBorrador] = useState<Borrador | null>(null);
const { state, dispatch } = useApp();

useEffect(() => {
  setBorrador(cargarBorrador());
}, []);

function continuarBorrador() {
  if (!borrador) return;
  dispatch({ type: 'AUDIT_RESTORE', payload: {
    local:         borrador.local,
    fecha:         borrador.fecha,
    tipo:          borrador.tipo,
    acompanante:   borrador.acompanante,
    posicionAcomp: borrador.posicionAcomp,
    auditId:       borrador.auditId,
    catIndex:      borrador.catIndex,
    qIndex:        borrador.qIndex,
    answers:       borrador.answers,
  }});
  router.push('/auditoria/categorias');
}

function descartarBorrador() {
  if (!confirm('¿Descartar la auditoría guardada? Se perderán todas las respuestas.')) return;
  borrarBorrador();
  setBorrador(null);
}

function exportar() {
  if (!borrador) return;
  const texto = exportarBorradorTexto(borrador);
  if (navigator.share) {
    navigator.share({ title: 'Auditoría', text: texto }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(texto)
      .then(() => alert('Datos copiados al portapapeles'))
      .catch(() => alert(texto));
  }
}
```

Y el banner (solo si `borrador` existe):

```typescript
{borrador && (
  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
    <p className="font-semibold text-amber-900 text-sm">
      📝 Tenés una auditoría sin terminar
    </p>
    <p className="text-xs text-amber-700 mt-0.5">
      {borrador.local.nombre} — {Object.values(borrador.answers).filter(a => a.respuesta).length} respuestas
      {' · '}{new Date(borrador.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
    </p>
    {borrador.sinFotos && (
      <p className="text-xs text-amber-600 mt-1">⚠️ Las fotos no se pudieron guardar</p>
    )}
    <div className="flex gap-2 mt-3">
      <button onClick={continuarBorrador}
        className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">
        Continuar
      </button>
      <button onClick={exportar}
        className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm">
        Exportar
      </button>
      <button onClick={descartarBorrador}
        className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm">
        Descartar
      </button>
    </div>
  </div>
)}
```

## 1.4 — Borrar el borrador solo al confirmar el envío

En `resumen/page.tsx`, después de un envío exitoso, llamar `borrarBorrador()` **antes** del `AUDIT_RESET`.

- [ ] 1.1 — `lib/borrador.ts` creado
- [ ] 1.2 — `AUDIT_RESTORE` + autosave en AppContext
- [ ] 1.3 — Banner de recuperación en welcome
- [ ] 1.4 — `borrarBorrador()` al confirmar envío

---

# TAREA 2 — Guardado inmediato de la respuesta en curso (CRÍTICO)

Hoy `guardarRespuesta()` solo se llama al navegar. Si el inspector toca el menú inferior o el botón atrás del celular, pierde lo que cargó en esa pregunta.

En `web\src\app\auditoria\pregunta\page.tsx`, agregar un `useEffect` con debounce que despacha automáticamente:

```typescript
// Guardado automático: cada cambio se persiste al context (y de ahí al borrador)
useEffect(() => {
  const t = setTimeout(() => {
    if (!pregunta) return;
    // No guardar si no hay nada cargado todavía
    const vacio = !respuesta && !observacion && !rawValor && !fechaRaw
      && !fotos.length && !Object.keys(headcount).length;
    if (vacio) return;
    dispatch({ type: 'AUDIT_SET_ANSWER', payload: { id: pregunta.id, item: buildItem() } });
  }, 400);
  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [respuesta, observacion, rawValor, fechaRaw, fotos, headcount, pregunta?.id]);
```

Adaptar los nombres de las variables de estado local a los que ya existen en el archivo.

- [ ] 2.1 — Autosave con debounce en la pantalla de pregunta

---

# TAREA 3 — Alinear el puntaje con el backend (CRÍTICO)

El puntaje que calcula la app **debe dar exactamente el mismo número** que el que recalcula el Apps Script, porque el email y el PDF los genera el backend.

## 3.1 — Servicio de configuración

Crear `web\src\services\config.ts`:

```typescript
/**
 * config.ts — Lee el umbral de críticos que configura el Admin
 * El valor vive en la hoja `Config` del Sheet de Resultados, clave `umbral_criticos_pct`
 */
const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export const UMBRAL_DEFAULT = 10;

let cache: number | null = null;

export async function getUmbralCriticos(): Promise<number> {
  if (cache !== null) return cache;
  try {
    const res = await fetch(`${URL}?action=getUmbral`, { redirect: 'follow' });
    const data = await res.json();
    const u = parseFloat(String(data.umbral_criticos_pct));
    cache = (!isNaN(u) && u > 0) ? u : UMBRAL_DEFAULT;
  } catch {
    cache = UMBRAL_DEFAULT;
  }
  return cache;
}
```

## 3.2 — Reemplazar `scoring.ts` con la lógica del backend

Esta es una **réplica literal de `recalcularPuntaje`** del Apps Script (líneas 970-1008). Los cambios respecto de la versión actual están marcados:

```typescript
/**
 * scoring.ts — Réplica EXACTA de `recalcularPuntaje` del Apps Script
 * (apps-script.gs líneas 970-1008)
 *
 * Es crítico que coincida: el email y el PDF los genera el backend con esa función.
 * Si el cliente calcula distinto, el inspector ve un número y el franquiciado otro.
 */
import type { Pregunta, RespuestaItem, Puntaje } from '@/types';
import { UMBRAL_DEFAULT } from './config';

const MAX_PTS:     Record<string, number> = { critico: 4, alta: 3, media: 2, baja: 1 };
const PARCIAL_PTS: Record<string, number> = { critico: 2, alta: 1, media: 1, baja: 0 };

/** Normaliza la importancia quitando acentos — igual que normImp() del backend */
function normImp(s: string): string {
  return String(s || '').toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
}

export function calcularPuntaje(
  preguntas: Pregunta[],
  respuestas: Record<string, RespuestaItem>,
  umbralCriticosPct: number = UMBRAL_DEFAULT,
): Puntaje {
  let obtenido = 0, posible = 0;
  let criticosTotal = 0, criticosFallidos = 0;

  preguntas.forEach(q => {
    const imp = normImp(q.importancia);
    const ans = respuestas[q.id];
    const res = (ans?.respuesta || '').toLowerCase().trim();

    const max = MAX_PTS[imp];
    if (!max) return;
    if (!res || res.includes('aplica')) return;

    // ── CAMBIO CLAVE: este filtro faltaba ──
    // Excluye headcount ('N/A'), texto libre y cualquier respuesta que no sea
    // Cumple / No Cumple / Parcial. Es lo que hace el backend.
    if (!res.includes('cumple') && !res.includes('parcial')) return;

    posible += max;

    if (res === 'cumple') {
      obtenido += max;
    } else if (res.includes('parcial')) {
      obtenido += PARCIAL_PTS[imp] || 0;
    }

    // ── CAMBIO CLAVE: reprobado por umbral, no por "cualquier crítico" ──
    if (imp === 'critico') {
      criticosTotal++;
      if (res.includes('no cumple') || res === 'nocumple') criticosFallidos++;
    }
  });

  const pct = posible > 0 ? Math.round((obtenido / posible) * 100) : 0;
  const reprobado = criticosTotal > 0
    && (criticosFallidos / criticosTotal * 100) >= umbralCriticosPct;

  let nivel: string, nivelClass: string, nivelEmoji: string;
  if (reprobado)      { nivel = 'Reprobado';     nivelClass = 'reprobado';     nivelEmoji = '⛔'; }
  else if (pct >= 90) { nivel = 'Excelente';     nivelClass = 'excelente';     nivelEmoji = '🟢'; }
  else if (pct >= 75) { nivel = 'Satisfactorio'; nivelClass = 'satisfactorio'; nivelEmoji = '🟡'; }
  else if (pct >= 60) { nivel = 'A mejorar';     nivelClass = 'mejora';        nivelEmoji = '🟠'; }
  else                { nivel = 'Deficiente';    nivelClass = 'deficiente';    nivelEmoji = '🔴'; }

  return {
    obtenido, posible, pct, reprobado,
    nivel, nivelClass, nivelEmoji,
    criticosTotal, criticosFallidos,
  };
}
```

**Ojo con dos detalles:**
- El nivel del tramo 60-74 ahora es **`'A mejorar'`** (era `'Requiere mejora'`). Es el texto que usa el backend.
- `MAX_PTS` ya no necesita la clave `crítico` con acento porque `normImp` lo normaliza.

## 3.3 — Actualizar el tipo `Puntaje`

En `types/index.ts`, agregar los dos campos nuevos y ampliar `nivel` a `string`:

```typescript
export interface Puntaje {
  obtenido:         number;
  posible:          number;
  pct:              number;
  reprobado:        boolean;
  nivel:            string;
  nivelClass:       string;
  nivelEmoji:       string;
  criticosTotal:    number;
  criticosFallidos: number;
}
```

## 3.4 — Cargar el umbral y pasarlo a `calcularPuntaje`

En **cada** lugar donde se llama `calcularPuntaje` (categorías, resumen, incumplimientos), hay que pasar el umbral. La forma más limpia: cargarlo una vez en el `DataLoader` y guardarlo en el AppContext.

En `AppContext.tsx`:
- Agregar `umbralCriticos: number` a `AppState`, inicializado en `10`
- Agregar la acción `{ type: 'SET_UMBRAL'; payload: number }`

En `components\DataLoader.tsx`, junto a la carga de locales y preguntas:

```typescript
getUmbralCriticos().then(u => dispatch({ type: 'SET_UMBRAL', payload: u }));
```

Y en las pantallas: `calcularPuntaje(preguntas, answers, state.umbralCriticos)`.

Actualizar también los mapas de color/nivel donde diga `'Requiere mejora'` → `'A mejorar'`.

- [ ] 3.1 — `services/config.ts` creado
- [ ] 3.2 — `scoring.ts` reemplazado (filtro + umbral)
- [ ] 3.3 — Tipo `Puntaje` ampliado
- [ ] 3.4 — Umbral cargado en el context y pasado a todas las llamadas

---

# TAREA 4 — Desbloquear las preguntas numero/fecha legacy (CRÍTICO)

**Este es el bug que impide cerrar una auditoría.** Los inputs de los caminos `number` y `fecha` sin validación en la columna 10 nunca setean `respuesta`, así que `allComplete` nunca se cumple.

En `web\src\app\auditoria\pregunta\page.tsx`:

## 4.1 — Camino `number` legacy: el valor ES la respuesta

```typescript
// ANTES: solo seteaba rawValor
onChange={e => setRawValor(e.target.value)}

// DESPUÉS: normalizar coma → punto y usar el valor como respuesta
onChange={e => {
  const v = e.target.value;
  setRawValor(v);
  setRespuesta(v.replace(/,/g, '.'));   // el valor crudo ES la respuesta
}}
```

## 4.2 — Camino `fecha` legacy

```typescript
onChange={e => {
  const v = e.target.value;
  setFechaRaw(v);
  setRespuesta(v);   // la fecha cruda ES la respuesta
}}
```

## 4.3 — Camino `numero_auto`: fallback cuando no se puede evaluar

```typescript
// ANTES: dejaba respuesta vacía si evaluarNumero devolvía null
setRespuesta(verd ?? '');

// DESPUÉS: si no se puede evaluar, guardar el valor crudo (igual que el prototipo)
setRespuesta(verd ?? v);
```

## 4.4 — Camino `text`: el texto ES la respuesta

Verificar que el textarea de tipo `text` también setee `respuesta` con el contenido. Si no, corregirlo.

- [ ] 4.1 — `number` legacy setea respuesta
- [ ] 4.2 — `fecha` legacy setea respuesta
- [ ] 4.3 — `numero_auto` con fallback al valor crudo
- [ ] 4.4 — `text` setea respuesta

---

# TAREA 5 — Input numérico usable en celular argentino (CRÍTICO)

`type="number"` con locale es-AR: si el inspector tipea `36,5`, el browser devuelve `''` y el dato se pierde sin ningún aviso.

## 5.1 — Cambiar ambos inputs numéricos

```typescript
<input
  type="text"                     {/* era type="number" */}
  inputMode="decimal"
  pattern="[0-9.,-]*"
  autoComplete="off"
  spellCheck={false}
  value={rawValor}
  onChange={e => { /* ver Tarea 4 */ }}
  placeholder={`Ej: ${placeholderEjemplo}`}
  className="..."
/>
```

Para el placeholder, usar un ejemplo realista: `Ej: 36,5` en el legacy y `Ej: -2,5` en el validado (son los del prototipo).

## 5.2 — Normalizar la coma antes de evaluar

En el camino `numero_auto`, antes de llamar `evaluarNumero`:

```typescript
const normalizado = v.replace(/,/g, '.');
const verd = normalizado ? evaluarNumero(normalizado, regla) : null;
```

`evaluarNumero` ya reemplaza la primera coma internamente, pero conviene normalizar antes para valores con separador de miles.

## 5.3 — Mostrar la unidad de medida

Agregar a `validaciones.ts`:

```typescript
/** Extrae la unidad del texto de la pregunta: "Temperatura heladera (°C)" → "°C" */
export function extraerUnidad(pregunta: string): string {
  const m = (pregunta || '').match(/\(([^)]{1,8})\)/);
  return m ? m[1] : '';
}
```

Y renderizarla como sufijo del input:

```typescript
<div className="relative">
  <input ... className="w-full pr-12 ..." />
  {unidad && (
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
      {unidad}
    </span>
  )}
</div>
```

Aplicar en **ambos** caminos numéricos.

- [ ] 5.1 — Inputs numéricos aceptan coma decimal
- [ ] 5.2 — Normalización de coma antes de evaluar
- [ ] 5.3 — Unidad de medida visible

---

# TAREA 6 — Pantalla de Incumplimientos (CRÍTICO)

Es la vista que el inspector usa para repasar los desvíos con el acompañante antes de irse del local. Muestra **todos** los incumplimientos (no solo los críticos) agrupados por categoría, con las fotos.

## 6.1 — Crear `web\src\app\auditoria\incumplimientos\page.tsx`

```typescript
'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useApp } from '@/contexts/AppContext';
import { esRespuestaNegativa } from '@/services/validaciones';
import clsx from 'clsx';

const IMP_STYLE: Record<string, string> = {
  critico:  'bg-red-100 text-red-800',
  crítico:  'bg-red-100 text-red-800',
  alta:     'bg-orange-100 text-orange-800',
  media:    'bg-yellow-100 text-yellow-800',
  baja:     'bg-gray-100 text-gray-600',
};

function IncumplimientosContent() {
  const { state } = useApp();
  const router = useRouter();
  const { categorias, answers } = state.auditoria;

  // Agrupar incumplimientos por categoría
  const grupos = useMemo(() => {
    return categorias
      .map(cat => ({
        nombre: cat.name,
        items: cat.questions
          .map(q => ({ q, ans: answers[q.id] }))
          .filter(({ ans }) => ans && esRespuestaNegativa(ans.respuesta)),
      }))
      .filter(g => g.items.length > 0);
  }, [categorias, answers]);

  const total = grupos.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-red-600 text-sm mb-2">
          ← Volver
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          Incumplimientos ({total})
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Revisá estos puntos con el acompañante.
        </p>
      </div>

      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <span className="text-5xl mb-3">✅</span>
          <p className="text-gray-600 font-medium">Sin incumplimientos</p>
          <p className="text-gray-400 text-sm mt-1">
            Todos los controles respondidos están en cumplimiento.
          </p>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {grupos.map(g => (
          <div key={g.nombre} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-100">
              <p className="font-semibold text-sm text-red-900">
                {g.nombre} <span className="font-normal text-red-600">({g.items.length})</span>
              </p>
            </div>
            <ul className="divide-y divide-gray-50">
              {g.items.map(({ q, ans }) => {
                const imp = (q.importancia || '').toLowerCase().trim();
                const esParcial = (ans.respuesta || '').toLowerCase().includes('parcial');
                return (
                  <li
                    key={q.id}
                    className={clsx(
                      'px-4 py-3 border-l-4',
                      esParcial ? 'border-amber-400' : 'border-red-500',
                    )}
                  >
                    {q.subcategoria && (
                      <p className="text-xs text-gray-400">{q.subcategoria}</p>
                    )}
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{q.control}</p>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={clsx(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        esParcial ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800',
                      )}>
                        {ans.respuesta}
                      </span>
                      {imp && (
                        <span className={clsx(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          IMP_STYLE[imp] ?? 'bg-gray-100 text-gray-600',
                        )}>
                          {q.importancia}
                        </span>
                      )}
                      {ans.rawValor && (
                        <span className="text-xs text-gray-400">({ans.rawValor})</span>
                      )}
                    </div>

                    {ans.observacion && (
                      <p className="text-xs text-gray-500 italic mt-1.5">
                        &ldquo;{ans.observacion}&rdquo;
                      </p>
                    )}

                    {!!ans.fotos?.length && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {ans.fotos.map((f, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={f.dataURL}
                            alt={`foto ${i + 1}`}
                            className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IncumplimientosPage() {
  return <AuthGuard><IncumplimientosContent /></AuthGuard>;
}
```

## 6.2 — Botones de entrada

En `categorias/page.tsx` y en `resumen/page.tsx`, agregar el botón cuando haya incumplimientos:

```typescript
const incumplCount = useMemo(() =>
  Object.values(answers).filter(a => esRespuestaNegativa(a.respuesta)).length,
  [answers]);

{incumplCount > 0 && (
  <button
    onClick={() => router.push('/auditoria/incumplimientos')}
    className="w-full py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold mb-2"
  >
    ⚠ Ver incumplimientos ({incumplCount})
  </button>
)}
```

En el resumen, el texto del prototipo es: `⚠ Revisar incumplimientos con acompañante (N)`.

- [ ] 6.1 — Pantalla de incumplimientos creada
- [ ] 6.2 — Botones de entrada en categorías y resumen

---

# TAREA 7 — Verificación de envío y rescate (CRÍTICO)

Si el POST falla o la respuesta no llega, hoy no hay red de seguridad.

## 7.1 — Agregar verificación a `envio.ts`

El Apps Script tiene una acción `verificarAudit&auditId=...` que devuelve `{found: true|false}`. Agregar al final de `envio.ts`:

```typescript
/** Verifica si una auditoría llegó al servidor. Reintenta hasta 4 veces cada 6s. */
export async function verificarEnvio(auditId: string, intentos = 4): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(`${URL}?action=verificarAudit&auditId=${encodeURIComponent(auditId)}`, {
        redirect: 'follow',
      });
      const data = await res.json();
      if (data.found) return true;
    } catch {
      // seguir intentando
    }
    if (i < intentos - 1) await new Promise(r => setTimeout(r, 6000));
  }
  return false;
}
```

## 7.2 — Usar la verificación en el resumen

En `resumen/page.tsx`, cambiar la lógica de envío:

```typescript
async function handleEnviar() {
  setEnviando(true);
  setError('');

  const result = await enviarAuditoria({ /* ... */ });

  if (result.ok) {
    // Éxito confirmado por el servidor
    borrarBorrador();
    sessionStorage.setItem('emailStatus', result.emailStatus ?? '');
    dispatch({ type: 'AUDIT_RESET' });
    router.replace('/auditoria/exito');
    return;
  }

  // El POST falló: verificar si llegó igual (puede ser un fallo de la respuesta, no del guardado)
  setVerificando(true);
  const llego = await verificarEnvio(auditId);
  setVerificando(false);

  if (llego) {
    borrarBorrador();
    sessionStorage.setItem('emailStatus', 'enviado (confirmado por verificación)');
    dispatch({ type: 'AUDIT_RESET' });
    router.replace('/auditoria/exito');
    return;
  }

  // No llegó: marcar como sin confirmar y NO borrar el borrador
  marcarSinConfirmar(auditId);
  setError(result.error ?? 'No se pudo confirmar el envío.');
  setEnviando(false);
}
```

Mostrar un mensaje mientras verifica: `Verificando si la auditoría llegó...`

## 7.3 — Bloque de rescate cuando el envío falla

Si `error` está seteado, mostrar debajo:

```typescript
{error && (
  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mt-3">
    <p className="text-sm font-semibold text-red-900">No se pudo confirmar el envío</p>
    <p className="text-xs text-red-700 mt-1">{error}</p>
    <p className="text-xs text-gray-600 mt-2">
      Tus respuestas están guardadas. Podés reintentar cuando tengas señal,
      o exportar los datos para no perderlos.
    </p>
    <div className="flex gap-2 mt-3">
      <button onClick={handleEnviar}
        className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">
        Reintentar
      </button>
      <button onClick={exportarDatos}
        className="px-3 py-2 border border-red-300 text-red-700 rounded-lg text-sm">
        Exportar datos
      </button>
    </div>
  </div>
)}
```

`exportarDatos` usa `exportarBorradorTexto` + `navigator.share` con fallback a clipboard (igual que en welcome).

- [ ] 7.1 — `verificarEnvio` en envio.ts
- [ ] 7.2 — Verificación integrada en el flujo de envío
- [ ] 7.3 — Bloque de rescate con Reintentar / Exportar

---

# TAREA 8 — Build, commit y push

```bash
npm run build
```

**Verificar especialmente que no queden referencias a `'Requiere mejora'`** — buscar en todo `src/`:

```bash
Get-ChildItem -Recurse -Include *.tsx,*.ts src | Select-String "Requiere mejora"
```

Todas deben pasar a `'A mejorar'`.

```bash
git add web/src/
git commit -m "fix: fase 6 - borrador, autosave, scoring alineado con backend, incumplimientos, verificacion de envio"
git push origin main
```

- [ ] 8.1 — Build exitoso
- [ ] 8.2 — Sin referencias a 'Requiere mejora'
- [ ] 8.3 — Commit y push realizados

---

# TAREA 9 — Crear REPORTE_FASE6.md

```markdown
# REPORTE_FASE6.md
Fecha: [COMPLETAR]

## Estado de tareas
- [ ] Tarea 0: 🙋 Marcos agregó `getUmbral` al Apps Script — [hecho / PENDIENTE]
- [ ] Tarea 1: Borrador / autosave + banner de recuperación
- [ ] Tarea 2: Guardado inmediato con debounce
- [ ] Tarea 3: Scoring alineado con el backend + umbral configurable
- [ ] Tarea 4: numero/fecha legacy setean respuesta (desbloquea el resumen)
- [ ] Tarea 5: Input numérico con coma decimal + unidad
- [ ] Tarea 6: Pantalla de incumplimientos
- [ ] Tarea 7: Verificación de envío + rescate
- [ ] Tarea 8: Build + commit + push

## Verificaciones
- ¿El borrador sobrevive a un recargar de página (F5)? [sí/no — probalo]
- ¿Cuánto pesa el borrador con fotos? [aprox, si lo pudiste medir]
- ¿`getUmbral` responde? [sí/no/no probado]
- ¿Quedaron referencias a 'Requiere mejora'? [sí/no]

## Build
- npm run build: [exitoso / errores]
- Rutas generadas: [número y lista]

## Decisiones que tuve que tomar
[Cualquier punto donde las instrucciones eran ambiguas]

## Errores encontrados
[Descripción o "ninguno"]

## Commit
[hash]
```

- [ ] 9.1 — `REPORTE_FASE6.md` creado

---

## Al terminar

Decirle a Marcos: **"Claude Code ya completó las tareas de COWORK_INSTRUCTIONS.md. El reporte está en REPORTE_FASE6.md"**

CoWork leerá ese archivo para diseñar la **Fase 7: mejoras de UX del flujo** (botón "?" con explicación detallada, saltear pregunta, borrar auditoría, avisos de críticos sin responder, "No aplica" que deshabilita el input) y después el **Historial y el Dashboard**.
