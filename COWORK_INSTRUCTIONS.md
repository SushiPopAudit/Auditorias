# COWORK_INSTRUCTIONS.md — Ausitoria App · Fase 1
**Fecha de generación:** 2026-08-21
**Generado por:** CoWork (sesión Ausitoria APP)
**Para ejecutar:** Claude Code en `C:\Users\marco\audit-app`

---

## ⚠️ INSTRUCCIONES DE EJECUCIÓN PARA CLAUDE CODE

Este archivo contiene tareas que **debes ejecutar completamente**, incluyendo todos los comandos de terminal. Al finalizar cada tarea, marca el checkbox. Al terminar TODAS las tareas, crea el archivo `REPORTE_FASE1.md` con los resultados reales (Tarea 6). **No leas este archivo sin ejecutar los comandos.**

---

## Contexto: Qué es este proyecto

Es una app de auditorías para una cadena de franquicias de sushi (31 locales). El prototipo actual (`app.js`, `apps-script.gs`) ya funciona. La misión es construir la versión profesional en Next.js sin romper el prototipo.

### Datos clave ya identificados por CoWork

**Fuentes de datos:**
| Recurso | Detalle |
|---|---|
| Sheet Sistema (config + preguntas + usuarios) | ID: `1TeeKe1eYsKIZ6-8uEPOY0UT-wrtrwl0FW4hAgBoIkzY` |
| Sheet Resultados (respuestas) | ID: `1zc1HGCNbS40D8c4cbaBcEtXiatg2-5r7JZiv8j5AMnI` |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbwtsRNwBylKb_Nis4hUXlhj5epPeF7VGgGWSZzzHNAQ7Py00nzPp6g_7D9DsyelOCLB/exec` |
| CSV Preguntas | `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8b_XMJhcD7LeVKvzOFSXm8pbWfsHCz26YCrH_AZFMVGsP5TYS8va8ianw_PM2qMLEolKonT771_XU/pub?output=csv` |
| CSV Locales | `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8b_XMJhcD7LeVKvzOFSXm8pbWfsHCz26YCrH_AZFMVGsP5TYS8va8ianw_PM2qMLEolKonT771_XU/pub?gid=233622265&single=true&output=csv` |
| Drive Folder ID | `1SJe5kNlEXBpRlFPylSTbS4XedI0ZIC7P` |

**Arquitectura del prototipo (ya analizada por CoWork):**
- **20 pantallas detectadas:** loading, login, change-password, welcome, setup, cat-select, audit, incumplimientos, summary, success, admin, historial, historial-detalle, historial-editar, dashboard, ranking, calendario, gastos, admin-gastos, admin-gastos-detalle, error
- **Auth:** email + password hasheada SHA-256, token en localStorage, sesión 7 días, roles Admin/Auditor
- **Schema CSV Preguntas (por índice de columna):** [0]=Marca, [1]=Categoría, [2]=Subcategoría, [3]=Control, [4]=Importancia, [5]=Explicación, [6]=Pregunta, [7]=Imagen, [8]=TipoRespuesta, [9]=ExplicaciónDetallada, [10]=Validación
- **Schema CSV Locales:** [0]=Nombre, [1]=isCausa (TRUE/FALSE), [2]=Emails
- **Tipos de respuesta:** radio (Cumple/Cumple parcialmente/No Cumple/No aplica), numero (con rangos), fecha, radio:opcion1/opcion2 (personalizadas), text, headcount
- **Scoring:** Crítico=4pts, Alta=3, Media=2, Baja=1. Parcial=mitad. Un "No Cumple" en Crítico → REPROBADO. Niveles: Excelente≥90%, Satisfactorio≥75%, Requiere mejora≥60%, Deficiente<60%
- **Columnas Sheet Resultados (21 cols):** AuditID, Fecha, Hora, Auditor, Local, Marca, Categoría, Subcategoría, Control, Importancia, Explicación, Respuesta, Observación, URL Foto, Email Auditor, Puntaje%, Nivel, Reprobado, Acompañante, Tipo, RawValor
- **Marcas:** Multimarca y Causa (cada local es una u otra)

---

## TAREA 1 — Verificar entorno

**Ejecutar estos comandos uno por uno y anotar los resultados:**

```bash
node --version
```
```bash
npm --version
```
```bash
git --version
```

- [ ] 1.1 — Si `node --version` no funciona: instalar desde https://nodejs.org/en/download (versión LTS). Luego repetir.
- [ ] 1.2 — Si `npm` no funciona pero Node sí: ejecutar `npm install -g npm@latest`
- [ ] 1.3 — Anotar las versiones obtenidas (las vas a necesitar para el REPORTE)

---

## TAREA 2 — Crear proyecto Next.js en subcarpeta `web/`

> ⚠️ Trabajar siempre desde `C:\Users\marco\audit-app`. NO tocar `app.js`, `apps-script.gs`, `index.html`, `config.js`, `style.css`.

**Paso 2.1 — Ejecutar en terminal desde `C:\Users\marco\audit-app`:**
```bash
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
```
Cuando pregunte por opciones interactivas que no estén en el comando, responder con el default (presionar Enter).

- [ ] 2.1 — Ejecutado `create-next-app`. Si falló, anotar el error exacto en el REPORTE.

**Paso 2.2 — Verificar que arranca:**
```bash
cd web && npm run dev
```
Esperar hasta ver la línea: `Local: http://localhost:3000`
Luego detener con `Ctrl+C`.

- [ ] 2.2 — El servidor arrancó correctamente en localhost:3000

**Paso 2.3 — Crear `.env.local`:**

Crear el archivo `C:\Users\marco\audit-app\web\.env.local` con este contenido exacto:
```env
NEXT_PUBLIC_SHEET_SISTEMA_ID=1TeeKe1eYsKIZ6-8uEPOY0UT-wrtrwl0FW4hAgBoIkzY
NEXT_PUBLIC_SHEET_RESULTADOS_ID=1zc1HGCNbS40D8c4cbaBcEtXiatg2-5r7JZiv8j5AMnI
NEXT_PUBLIC_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbwtsRNwBylKb_Nis4hUXlhj5epPeF7VGgGWSZzzHNAQ7Py00nzPp6g_7D9DsyelOCLB/exec
NEXT_PUBLIC_DRIVE_FOLDER_ID=1SJe5kNlEXBpRlFPylSTbS4XedI0ZIC7P
NEXT_PUBLIC_CSV_PREGUNTAS=https://docs.google.com/spreadsheets/d/e/2PACX-1vS8b_XMJhcD7LeVKvzOFSXm8pbWfsHCz26YCrH_AZFMVGsP5TYS8va8ianw_PM2qMLEolKonT771_XU/pub?output=csv
NEXT_PUBLIC_CSV_LOCALES=https://docs.google.com/spreadsheets/d/e/2PACX-1vS8b_XMJhcD7LeVKvzOFSXm8pbWfsHCz26YCrH_AZFMVGsP5TYS8va8ianw_PM2qMLEolKonT771_XU/pub?gid=233622265&single=true&output=csv
```

- [ ] 2.3 — Archivo `.env.local` creado

**Paso 2.4 — Verificar que `.env.local` ya está en `.gitignore` del proyecto web:**
```bash
type web\.gitignore | findstr env
```
Debe mostrar una línea con `.env*.local`. Si no aparece, agregar `.env.local` al archivo `web\.gitignore`.

- [ ] 2.4 — `.env.local` está excluido de git

---

## TAREA 3 — Crear estructura de carpetas y tipos TypeScript

**Paso 3.1 — Crear carpetas:**
```bash
mkdir web\src\types
mkdir web\src\services
mkdir web\src\lib
mkdir web\src\hooks
mkdir web\src\components\ui
```

- [ ] 3.1 — Carpetas creadas

**Paso 3.2 — Crear `web\src\types\index.ts`** con el siguiente contenido:

```typescript
// ============================================================
// TIPOS BASE — Ausitoria App
// Refleja el esquema real del prototipo analizado por CoWork
// ============================================================

export type Importancia = 'Crítico' | 'crítico' | 'Alta' | 'Media' | 'Baja';
export type TipoRespuesta = 'radio' | 'numero' | 'fecha' | 'text' | 'headcount';
export type Nivel = 'Excelente' | 'Satisfactorio' | 'Requiere mejora' | 'Deficiente' | 'Reprobado';
export type RolUsuario = 'Admin' | 'Auditor';

/** Local de la red de franquicias */
export interface Local {
  nombre: string;
  isCausa: boolean;   // true = marca Causa, false = SushiPop
  emails: string;     // emails de notificación separados por coma
}

/** Pregunta del checklist (basada en CSV cols [0..10]) */
export interface Pregunta {
  id: string;                    // generado: q_{index}
  marca: string;                 // 'Multimarca' | 'Causa'
  categoria: string;
  subcategoria: string;
  control: string;
  importancia: string;
  explicacion: string;
  pregunta: string;
  imagen: string;
  tipoRespuesta: string;         // raw del CSV, parsear con parseTipoRespuesta()
  explicacionDetallada: string;
  validacion: string;            // reglas: 'numero|C:0:100' | 'fecha|NA' | 'headcount'
}

/** Categoría de preguntas agrupadas */
export interface Categoria {
  name: string;
  questions: Pregunta[];
}

/** Respuesta del auditor a una pregunta */
export interface RespuestaItem {
  preguntaId: string;
  control: string;
  respuesta: string;             // 'Cumple' | 'Cumple parcialmente' | 'No Cumple' | 'No aplica'
  observacion?: string;
  fotoBase64?: string;           // imagen capturada en campo
  fotoNombre?: string;
  rawValor?: string;             // valor numérico o fecha raw antes de evaluar
  headcount?: Record<string, string>;
}

/** Sesión de usuario autenticado */
export interface Sesion {
  email: string;
  nombre: string;
  rol: RolUsuario;
  locales: string;               // locales asignados (separados por coma)
  token: string;
  savedAt: number;               // timestamp ms
}

/** Una auditoría completa lista para enviar */
export interface Auditoria {
  auditId: string;               // AUD_{Local}_{timestamp}
  fecha: string;                 // YYYY-MM-DD
  hora: string;
  auditor: string;
  auditorEmail: string;
  local: string;
  marca: string;                 // 'Multimarca' | 'Causa'
  tipo: string;                  // 'Oficial' | 'Preliminar' | etc
  acompanante?: string;
  posicionAcompanante?: string;
  respuestas: RespuestaItem[];
}

/** Resultado de scoring */
export interface Puntaje {
  obtenido: number;
  posible: number;
  pct: number;
  reprobado: boolean;
  nivel: Nivel;
  nivelClass: string;
  nivelEmoji: string;
}

/** Fila tal como se escribe en el Sheet Resultados */
export interface FilaResultado {
  AuditID: string;
  Fecha: string;
  Hora: string;
  Auditor: string;
  Local: string;
  Marca: string;
  Categoria: string;
  Subcategoria: string;
  Control: string;
  Importancia: string;
  Explicacion: string;
  Respuesta: string;
  Observacion: string;
  URLFoto: string;
  EmailAuditor: string;
  PuntajePct: number;
  Nivel: string;
  Reprobado: string;
  Acompanante: string;
  Tipo: string;
  RawValor: string;
}
```

- [ ] 3.2 — `src/types/index.ts` creado

---

## TAREA 4 — Capa de servicios (conexión a Google Sheets)

**Paso 4.1 — Instalar dependencia:**
```bash
cd web && npm install papaparse && npm install --save-dev @types/papaparse
```

- [ ] 4.1 — papaparse instalado

**Paso 4.2 — Crear `web\src\services\sheets.ts`:**

```typescript
/**
 * sheets.ts — Lee datos desde Google Sheets publicados como CSV
 * TODO Fase 3: reemplazar por fetch a nuestra propia API/BD
 */
import Papa from 'papaparse';
import type { Local, Pregunta } from '@/types';

async function fetchCSV(url: string): Promise<string[][]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo cargar CSV (HTTP ${res.status}): ${url}`);
  const text = await res.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return result.data;
}

/**
 * Carga locales desde el CSV publicado.
 * Schema CSV: [0]=Nombre, [1]=isCausa (TRUE), [2]=Emails
 */
export async function getLocales(): Promise<Local[]> {
  const url = process.env.NEXT_PUBLIC_CSV_LOCALES!;
  const rows = await fetchCSV(url);
  // Saltear header (fila 0) y filtrar filas vacías
  return rows.slice(1)
    .map(r => ({
      nombre:  (r[0] || '').trim(),
      isCausa: (r[1] || '').trim().toUpperCase() === 'TRUE',
      emails:  (r[2] || '').trim(),
    }))
    .filter(l => l.nombre);
}

/**
 * Carga preguntas/checklist desde el CSV publicado.
 * Schema CSV: [0]=Marca, [1]=Cat, [2]=Subcat, [3]=Control,
 *             [4]=Importancia, [5]=Explicacion, [6]=Pregunta,
 *             [7]=Imagen, [8]=TipoRespuesta, [9]=ExpDetallada, [10]=Validacion
 */
export async function getPreguntas(soloMarca?: 'Multimarca' | 'Causa'): Promise<Pregunta[]> {
  const url = process.env.NEXT_PUBLIC_CSV_PREGUNTAS!;
  const rows = await fetchCSV(url);
  const preguntas: Pregunta[] = rows.slice(1)
    .filter(r => r[0] && r[3]) // debe tener marca y control
    .map((r, idx) => ({
      id:                   `q_${idx}`,
      marca:                (r[0] || '').trim(),
      categoria:            (r[1] || '').trim(),
      subcategoria:         (r[2] || '').trim(),
      control:              (r[3] || '').trim(),
      importancia:          (r[4] || '').trim(),
      explicacion:          (r[5] || '').trim(),
      pregunta:             (r[6] || '').trim(),
      imagen:               (r[7] || '').trim().toLowerCase(),
      tipoRespuesta:        (r[8] || '').trim().toLowerCase(),
      explicacionDetallada: (r[9] || '').trim(),
      validacion:           (r[10] || '').trim(),
    }));

  if (!soloMarca) return preguntas;
  return preguntas.filter(p =>
    p.marca === 'Multimarca' || p.marca === soloMarca
  );
}

/**
 * Agrupa preguntas en categorías (mismo orden que el prototipo)
 */
export function agruparPorCategoria(preguntas: Pregunta[]) {
  const map = new Map<string, Pregunta[]>();
  preguntas.forEach(p => {
    if (!map.has(p.categoria)) map.set(p.categoria, []);
    map.get(p.categoria)!.push(p);
  });
  return Array.from(map.entries()).map(([name, questions]) => ({ name, questions }));
}
```

- [ ] 4.2 — `src/services/sheets.ts` creado

**Paso 4.3 — Crear `web\src\services\scoring.ts`:**

```typescript
/**
 * scoring.ts — Sistema de puntuación (migrado exactamente del prototipo)
 */
import type { Pregunta, RespuestaItem, Puntaje } from '@/types';

const MAX_PTS:     Record<string, number> = { critico: 4, crítico: 4, alta: 3, media: 2, baja: 1 };
const PARCIAL_PTS: Record<string, number> = { critico: 2, crítico: 2, alta: 1, media: 1, baja: 0 };

export function calcularPuntaje(preguntas: Pregunta[], respuestas: Record<string, RespuestaItem>): Puntaje {
  let obtenido = 0, posible = 0, reprobado = false;

  preguntas.forEach(q => {
    const imp = (q.importancia || '').toLowerCase().trim();
    const ans = respuestas[q.id];
    if (!ans) return;
    const val = (ans.respuesta || '').toLowerCase().trim();
    if (!val || val.includes('aplica')) return;

    const max = MAX_PTS[imp];
    if (!max) return;
    posible += max;

    if (val === 'cumple') {
      obtenido += max;
    } else if (val.includes('parcial')) {
      obtenido += PARCIAL_PTS[imp] || 0;
    } else if (val.includes('no cumple')) {
      if (imp === 'critico' || imp === 'crítico') reprobado = true;
    }
  });

  const pct = posible > 0 ? Math.round((obtenido / posible) * 100) : 0;

  let nivel: Puntaje['nivel'], nivelClass: string, nivelEmoji: string;
  if (reprobado)      { nivel = 'Reprobado';        nivelClass = 'reprobado';     nivelEmoji = '⛔'; }
  else if (pct >= 90) { nivel = 'Excelente';        nivelClass = 'excelente';     nivelEmoji = '🟢'; }
  else if (pct >= 75) { nivel = 'Satisfactorio';    nivelClass = 'satisfactorio'; nivelEmoji = '🟡'; }
  else if (pct >= 60) { nivel = 'Requiere mejora';  nivelClass = 'mejora';        nivelEmoji = '🟠'; }
  else                { nivel = 'Deficiente';        nivelClass = 'deficiente';    nivelEmoji = '🔴'; }

  return { obtenido, posible, pct, reprobado, nivel, nivelClass, nivelEmoji };
}
```

- [ ] 4.3 — `src/services/scoring.ts` creado

**Paso 4.4 — Crear `web\src\services\index.ts`:**
```typescript
export * from './sheets';
export * from './scoring';
```

- [ ] 4.4 — `src/services/index.ts` creado

---

## TAREA 5 — Página de diagnóstico

**Objetivo:** Verificar que la conexión a Google Sheets funciona correctamente.

**Crear `web\src\app\diagnostico\page.tsx`:**

```tsx
import { getLocales, getPreguntas, agruparPorCategoria } from '@/services';

export const dynamic = 'force-dynamic';

export default async function DiagnosticoPage() {
  let locales: Awaited<ReturnType<typeof getLocales>> = [];
  let preguntas: Awaited<ReturnType<typeof getPreguntas>> = [];
  let errorLocales: string | null = null;
  let errorPreguntas: string | null = null;

  try { locales = await getLocales(); }
  catch (e) { errorLocales = String(e); }

  try { preguntas = await getPreguntas(); }
  catch (e) { errorPreguntas = String(e); }

  const categorias = agruparPorCategoria(preguntas);
  const multimarca = preguntas.filter(p => p.marca === 'Multimarca').length;
  const causa      = preguntas.filter(p => p.marca === 'Causa').length;
  const localesCausa = locales.filter(l => l.isCausa).length;
  const localesMulti = locales.filter(l => !l.isCausa).length;

  return (
    <main style={{ padding: 24, fontFamily: 'monospace', fontSize: 14, maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>🔍 Diagnóstico — Ausitoria App</h1>

      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <h2>Locales {errorLocales ? '❌' : `✅ ${locales.length} cargados`}</h2>
        {errorLocales && <p style={{ color: 'red' }}>{errorLocales}</p>}
        {!errorLocales && (
          <>
            <p>SushiPop: {localesMulti} | Causa: {localesCausa}</p>
            <ul style={{ columns: 2, marginTop: 8 }}>
              {locales.map(l => (
                <li key={l.nombre}>{l.nombre} {l.isCausa ? '(Causa)' : ''}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <h2>Preguntas {errorPreguntas ? '❌' : `✅ ${preguntas.length} totales`}</h2>
        {errorPreguntas && <p style={{ color: 'red' }}>{errorPreguntas}</p>}
        {!errorPreguntas && (
          <>
            <p>Multimarca: {multimarca} | Causa: {causa}</p>
            <table style={{ marginTop: 8, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', paddingRight: 16 }}>Categoría</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Preguntas</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map(c => (
                  <tr key={c.name}>
                    <td style={{ paddingRight: 16, paddingTop: 4 }}>{c.name}</td>
                    <td style={{ textAlign: 'right', paddingTop: 4 }}>{c.questions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <p style={{ color: '#888', fontSize: 12 }}>
        Generado: {new Date().toLocaleString('es-AR')}
      </p>
    </main>
  );
}
```

- [ ] 5.1 — `src/app/diagnostico/page.tsx` creado

**Iniciar servidor y verificar:**
```bash
cd web && npm run dev
```
Abrir `http://localhost:3000/diagnostico` en el navegador.

- [ ] 5.2 — Página abre sin errores y muestra datos de locales y preguntas

---

## TAREA 6 — Escribir REPORTE_FASE1.md con resultados reales

**Esta es la tarea más importante.** Crear el archivo `C:\Users\marco\audit-app\REPORTE_FASE1.md` con los datos REALES obtenidos durante la ejecución. No dejar campos en blanco ni poner datos de ejemplo.

```markdown
# REPORTE_FASE1.md — Resultados de Ejecución
Fecha de ejecución: [COMPLETAR con la fecha real]

## Estado general
- [ ] Tarea 1: Verificar entorno
- [ ] Tarea 2: Crear proyecto Next.js
- [ ] Tarea 3: Crear tipos TypeScript
- [ ] Tarea 4: Crear servicios
- [ ] Tarea 5: Página de diagnóstico

## Versiones del entorno
- Node.js: [COMPLETAR]
- npm: [COMPLETAR]
- Git: [COMPLETAR]

## Resultado del diagnóstico (http://localhost:3000/diagnostico)

### Locales
- Total cargados: [COMPLETAR]
- SushiPop: [COMPLETAR]
- Causa: [COMPLETAR]
- Lista completa: [COMPLETAR - pegar nombres]

### Preguntas
- Total: [COMPLETAR]
- Multimarca: [COMPLETAR]
- Causa: [COMPLETAR]
- Categorías detectadas:
  | Categoría | Cantidad |
  |---|---|
  | [COMPLETAR] | [COMPLETAR] |

## Errores o problemas encontrados
[Si todo fue bien: "Ninguno". Si hubo errores, describirlos aquí con el mensaje exacto.]

## Estructura de archivos creados
[Ejecutar `dir /s /b web\src` y pegar el resultado aquí]

## Notas del agente
[Cualquier observación relevante sobre el proceso]
```

- [ ] 6.1 — `REPORTE_FASE1.md` creado con todos los campos completados con datos reales

---

## TAREA 7 — Commit

```bash
git add web/
git add REPORTE_FASE1.md
git add COWORK_INSTRUCTIONS.md
git commit -m "feat: fase 1 - next.js setup + capa de servicios google sheets"
git push origin main
```

- [ ] 7.1 — Commit y push realizados

---

## Al terminar

Cuando todas las tareas tengan `[x]` y `REPORTE_FASE1.md` esté completo, decirle a Marcos:

> **"Claude Code ya completó las tareas de COWORK_INSTRUCTIONS.md. El reporte está en REPORTE_FASE1.md"**

CoWork leerá ese archivo para diseñar la Fase 2.
