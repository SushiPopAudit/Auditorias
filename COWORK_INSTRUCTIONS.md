# COWORK_INSTRUCTIONS.md — Ausitoria App · Fase 3
**Fecha:** 2026-08-21
**Generado por:** CoWork
**Para ejecutar:** Claude Code en `C:\Users\marco\audit-app\web`

---

## ⚠️ INSTRUCCIONES DE EJECUCIÓN

Ejecutar todas las tareas en orden. Al finalizar, crear `REPORTE_FASE3.md` (Tarea 6). Esta fase cierra el ciclo completo de una auditoría y hace que toda la navegación funcione sin crashes.

---

## Contexto: Qué se construye en Fase 3

**Fases anteriores completadas:**
- Fase 1: Next.js + capa de datos (32 locales, 188 preguntas)
- Fase 2: Auth, AppContext, Login, Welcome, Setup, Categorías, Preguntas (build limpio)

**Fase 3 — Objetivo:**
```
...Pregunta × N → Resumen (score + desglose) → Envío al Apps Script → Éxito
```
Además: páginas placeholder para Historial, Dashboard, Calendario, Gastos y Admin (evitar crashes en navegación).

**Dato del reporte Fase 2:**
- SushiPop: 5 categorías (solo Multimarca)
- Causa: 8 categorías (Multimarca + Causa)
- Tipos de respuesta: radio, numero, fecha, text — todos implementados

---

## TAREA 1 — Servicio de envío al Apps Script

El Apps Script `doPost` recibe un JSON con estas propiedades en el body:
```json
{
  "auditId": "AUD_Palermo_1234567",
  "local": "PALERMO",
  "fecha": "2026-08-21",
  "hora": "14:30",
  "auditor": "Juan Pérez",
  "auditorEmail": "juan@sushi.com",
  "marca": "Multimarca",
  "tipo": "Oficial",
  "acompanante": "",
  "respuestas": [
    {
      "control": "...",
      "categoria": "...",
      "subcategoria": "...",
      "importancia": "Crítico",
      "explicacion": "...",
      "respuesta": "Cumple",
      "observacion": "",
      "fotoBase64": "",
      "fotoNombre": "",
      "rawValor": ""
    }
  ]
}
```

### Crear `src\services\envio.ts`

```typescript
/**
 * envio.ts — Envío de auditoría completa al Apps Script
 * Replica el doPost del prototipo. Sin fotos en esta fase (Fase 4).
 */
import type { Auditoria, Pregunta } from '@/types';

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL!;

export interface EnvioResult {
  ok:     boolean;
  error?: string;
  pct?:   number;
  nivel?: string;
}

function horaActual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/**
 * Envía la auditoría al Apps Script y retorna el resultado.
 * El Apps Script escribe una fila por respuesta en el Sheet Resultados.
 */
export async function enviarAuditoria(
  auditoria: Auditoria,
  preguntasMap: Record<string, Pregunta>,
): Promise<EnvioResult> {
  const hora = horaActual();

  const respuestas = auditoria.respuestas.map(r => {
    const p = preguntasMap[r.preguntaId] ?? {} as Pregunta;
    return {
      control:      p.control      ?? r.control ?? '',
      categoria:    p.categoria    ?? '',
      subcategoria: p.subcategoria ?? '',
      importancia:  p.importancia  ?? '',
      explicacion:  p.explicacion  ?? '',
      respuesta:    r.respuesta    ?? '',
      observacion:  r.observacion  ?? '',
      fotoBase64:   '',            // Fase 4
      fotoNombre:   '',
      rawValor:     r.rawValor     ?? '',
    };
  });

  const payload = {
    auditId:      auditoria.id,
    local:        auditoria.localNombre,
    fecha:        auditoria.fecha,
    hora,
    auditor:      auditoria.auditor,
    auditorEmail: auditoria.auditorEmail,
    marca:        auditoria.marca,
    tipo:         auditoria.tipo,
    acompanante:  auditoria.acompanante ?? '',
    respuestas,
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method:  'POST',
      // Apps Script requiere text/plain para evitar preflight CORS
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
      redirect: 'follow',
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${txt}` };
    }

    const json = await res.json().catch(() => ({ status: 'ok' }));
    if (json.status === 'error') return { ok: false, error: json.message ?? 'Error del servidor' };

    return { ok: true, pct: json.pct, nivel: json.nivel };
  } catch (e) {
    return { ok: false, error: `Sin conexión: ${String(e)}` };
  }
}
```

Actualizar `src\services\index.ts`:
```typescript
export * from './sheets';
export * from './scoring';
export * from './auth';
export * from './envio';
```

- [ ] 1.1 — `src/services/envio.ts` creado
- [ ] 1.2 — `src/services/index.ts` actualizado

---

## TAREA 2 — Actualizar tipos para el envío

Agregar al final de `src\types\index.ts` (sin borrar lo existente, solo agregar):

```typescript
// ── Tipo para envío (forma aplanada que espera envio.ts) ──────

/** Auditoría lista para enviar al Apps Script */
export interface Auditoria {
  id:           string;     // auditId generado
  fecha:        string;
  auditor:      string;
  auditorEmail: string;
  localNombre:  string;
  marca:        string;
  tipo:         string;
  acompanante?: string;
  respuestas:   RespuestaItem[];
}
```

- [ ] 2.1 — Tipo `Auditoria` agregado a `src/types/index.ts`

---

## TAREA 3 — Pantalla de Resumen + Envío

### Crear carpeta:
```bash
mkdir src\app\auditoria\resumen
```

### Crear `src\app\auditoria\resumen\page.tsx`

```typescript
'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp, useSesion } from '@/contexts/AppContext';
import { calcularPuntaje } from '@/services/scoring';
import { enviarAuditoria } from '@/services/envio';
import type { Auditoria, Pregunta } from '@/types';
import clsx from 'clsx';

const NIVEL_BG: Record<string, string> = {
  'Excelente':       'bg-green-500',
  'Satisfactorio':   'bg-yellow-400',
  'Requiere mejora': 'bg-orange-400',
  'Deficiente':      'bg-red-500',
  'Reprobado':       'bg-red-900',
};

function ResumenContent() {
  const { state, dispatch } = useApp();
  const { sesion } = useSesion();
  const router = useRouter();
  const { auditoria } = state;

  const [enviando, setEnviando]   = useState(false);
  const [enviado,  setEnviado]    = useState(false);
  const [error,    setError]      = useState('');

  // Todas las preguntas de la auditoría
  const todasPreguntas = useMemo(
    () => auditoria.categorias.flatMap(c => c.questions),
    [auditoria.categorias]
  );

  // Mapa id → pregunta para acceso rápido
  const preguntasMap = useMemo(
    () => Object.fromEntries(todasPreguntas.map(p => [p.id, p])) as Record<string, Pregunta>,
    [todasPreguntas]
  );

  // Puntaje global
  const puntaje = useMemo(
    () => calcularPuntaje(todasPreguntas, auditoria.answers),
    [todasPreguntas, auditoria.answers]
  );

  // Puntaje por categoría
  const puntajesPorCat = useMemo(() =>
    auditoria.categorias.map(cat => ({
      name:    cat.name,
      puntaje: calcularPuntaje(cat.questions, auditoria.answers),
      respondidas: cat.questions.filter(q => auditoria.answers[q.id]).length,
      total: cat.questions.length,
    })),
    [auditoria.categorias, auditoria.answers]
  );

  // Incumplimientos críticos
  const criticos = useMemo(() =>
    todasPreguntas.filter(p => {
      const imp = (p.importancia ?? '').toLowerCase();
      const ans = auditoria.answers[p.id];
      return (imp === 'crítico' || imp === 'critico') &&
             ans?.respuesta?.toLowerCase().includes('no cumple');
    }),
    [todasPreguntas, auditoria.answers]
  );

  const totalRespondidas = todasPreguntas.filter(q => auditoria.answers[q.id]).length;

  const handleEnviar = async () => {
    if (!auditoria.local || !sesion) return;
    setEnviando(true);
    setError('');

    const payload: Auditoria = {
      id:           auditoria.auditId,
      fecha:        auditoria.fecha,
      auditor:      sesion.nombre,
      auditorEmail: sesion.email,
      localNombre:  auditoria.local.nombre,
      marca:        auditoria.local.isCausa ? 'Causa' : 'Multimarca',
      tipo:         auditoria.tipo,
      acompanante:  auditoria.acompanante || undefined,
      respuestas:   Object.values(auditoria.answers),
    };

    const result = await enviarAuditoria(payload, preguntasMap);
    setEnviando(false);

    if (!result.ok) {
      setError(result.error ?? 'Error al enviar');
      return;
    }

    setEnviado(true);
    // Navegar a éxito tras 1 segundo
    setTimeout(() => {
      dispatch({ type: 'AUDIT_RESET' });
      router.replace('/auditoria/exito');
    }, 800);
  };

  if (!auditoria.local) {
    router.replace('/auditoria/setup');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="text-red-600 text-sm mb-2">
          ← Volver a categorías
        </button>
        <h1 className="text-xl font-bold text-gray-900">Resumen de Auditoría</h1>
        <p className="text-sm text-gray-400">
          {auditoria.local.nombre} · {auditoria.fecha}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Score principal */}
        <div className={clsx(
          'rounded-2xl p-6 text-white text-center',
          NIVEL_BG[puntaje.nivel] ?? 'bg-gray-500'
        )}>
          <p className="text-5xl font-bold mb-1">{puntaje.pct}%</p>
          <p className="text-xl font-semibold mb-1">{puntaje.nivelEmoji} {puntaje.nivel}</p>
          <p className="text-sm opacity-80">
            {puntaje.obtenido} / {puntaje.posible} puntos · {totalRespondidas}/{todasPreguntas.length} preguntas
          </p>
        </div>

        {/* Advertencia reprobado */}
        {puntaje.reprobado && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="font-semibold text-red-700 mb-1">⛔ Auditoría Reprobada</p>
            <p className="text-sm text-red-600">
              {criticos.length} punto{criticos.length !== 1 ? 's' : ''} crítico{criticos.length !== 1 ? 's' : ''} con "No Cumple".
            </p>
          </div>
        )}

        {/* Incumplimientos críticos */}
        {criticos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">Incumplimientos Críticos</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {criticos.map(p => (
                <li key={p.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-red-700">{p.control}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.categoria} · {p.subcategoria}</p>
                  {auditoria.answers[p.id]?.observacion && (
                    <p className="text-xs text-gray-500 mt-1 italic">
                      "{auditoria.answers[p.id].observacion}"
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Desglose por categoría */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Por Categoría</p>
          </div>
          <ul className="divide-y divide-gray-50">
            {puntajesPorCat.map(cat => (
              <li key={cat.name} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                  <span className={clsx('text-sm font-bold',
                    cat.puntaje.reprobado ? 'text-red-600' :
                    cat.puntaje.pct >= 75 ? 'text-green-600' : 'text-orange-500'
                  )}>
                    {cat.respondidas === 0 ? '—' : `${cat.puntaje.pct}%`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full',
                        cat.puntaje.reprobado ? 'bg-red-500' :
                        cat.puntaje.pct >= 75 ? 'bg-green-400' : 'bg-orange-400'
                      )}
                      style={{ width: `${cat.respondidas === 0 ? 0 : cat.puntaje.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {cat.respondidas}/{cat.total}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Info de auditoría */}
        <div className="bg-white rounded-2xl shadow-sm p-4 text-sm text-gray-600 space-y-1">
          <p><span className="text-gray-400">Auditor:</span> {sesion?.nombre}</p>
          <p><span className="text-gray-400">Fecha:</span> {auditoria.fecha}</p>
          <p><span className="text-gray-400">Tipo:</span> {auditoria.tipo}</p>
          <p><span className="text-gray-400">ID:</span> <span className="font-mono text-xs">{auditoria.auditId}</span></p>
        </div>

        {/* Error de envío */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Botón de envío — fijo en el fondo */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 pt-4">
        <button
          onClick={handleEnviar}
          disabled={enviando || enviado || totalRespondidas === 0}
          className={clsx(
            'w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-95',
            enviado                  ? 'bg-green-500' :
            enviando                 ? 'bg-gray-400' :
            totalRespondidas === 0   ? 'bg-gray-300' :
                                       'bg-red-600'
          )}
        >
          {enviado   ? '✓ Enviado correctamente' :
           enviando  ? 'Enviando...' :
                       `Enviar Auditoría (${totalRespondidas} respuestas)`}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function ResumenPage() {
  return <AuthGuard><ResumenContent /></AuthGuard>;
}
```

- [ ] 3.1 — `src/app/auditoria/resumen/page.tsx` creado

---

## TAREA 4 — Pantalla de Éxito

### Crear carpeta y archivo:
```bash
mkdir src\app\auditoria\exito
```

### Crear `src\app\auditoria\exito\page.tsx`

```typescript
'use client';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import AuthGuard from '@/components/AuthGuard';

function ExitoContent() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center pb-24">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <span className="text-5xl">✅</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        ¡Auditoría enviada!
      </h1>
      <p className="text-gray-500 mb-8 max-w-xs">
        Los resultados fueron guardados correctamente en el sistema.
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => router.replace('/welcome')}
          className="w-full bg-red-600 text-white py-3.5 rounded-xl font-semibold active:scale-95 transition-transform"
        >
          Volver al inicio
        </button>
        <button
          onClick={() => router.replace('/auditoria/setup')}
          className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-semibold active:scale-95 transition-transform"
        >
          Nueva Auditoría
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function ExitoPage() {
  return <AuthGuard><ExitoContent /></AuthGuard>;
}
```

- [ ] 4.1 — `src/app/auditoria/exito/page.tsx` creado

---

## TAREA 5 — Agregar botón "Resumen" en página de Categorías

Editar `src\app\auditoria\categorias\page.tsx`. Buscar el cierre del `<div className="mx-4 mt-4 ...">` que muestra el score parcial. Reemplazar ESE bloque completo (el `{(() => { ... })()}`) con esta versión que también incluye el botón de resumen:

```typescript
        {/* Score parcial + acceso a resumen */}
        {(() => {
          const todasPreguntas = auditoria.categorias.flatMap(c => c.questions);
          const totalResp = todasPreguntas.filter(q => auditoria.answers[q.id]).length;
          if (totalResp === 0) return null;
          const puntaje = calcularPuntaje(todasPreguntas, auditoria.answers);
          return (
            <div className="mx-4 mt-4 space-y-3">
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Progreso general</p>
                    <p className="text-2xl font-bold text-gray-900">{puntaje.pct}%</p>
                    <p className="text-xs text-gray-400">{totalResp}/{todasPreguntas.length} preguntas</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl">{puntaje.nivelEmoji}</span>
                    <p className={clsx('text-sm font-semibold mt-0.5',
                      puntaje.reprobado ? 'text-red-600' : 'text-gray-700'
                    )}>{puntaje.nivel}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.push('/auditoria/resumen')}
                className="w-full bg-red-600 text-white py-3.5 rounded-xl font-bold active:scale-95 transition-transform"
              >
                Ver Resumen y Enviar
              </button>
            </div>
          );
        })()}
```

- [ ] 5.1 — Botón "Ver Resumen y Enviar" agregado en `categorias/page.tsx`

---

## TAREA 6 — Páginas placeholder (evitar crashes de navegación)

Crear estos archivos para que el BottomNav no rompa al navegar. Cada uno es una página simple que dice "Próximamente".

### Crear `src\app\historial\page.tsx`
```typescript
'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';

export default function HistorialPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pb-24 text-center px-6">
        <span className="text-5xl mb-4">📜</span>
        <h1 className="text-xl font-bold text-gray-900">Historial</h1>
        <p className="text-gray-400 text-sm mt-2">Próximamente — Fase 4</p>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
```

### Crear `src\app\dashboard\page.tsx`
```typescript
'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pb-24 text-center px-6">
        <span className="text-5xl mb-4">📊</span>
        <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-400 text-sm mt-2">Próximamente — Fase 4</p>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
```

### Crear `src\app\calendario\page.tsx`
```typescript
'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';

export default function CalendarioPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pb-24 text-center px-6">
        <span className="text-5xl mb-4">📅</span>
        <h1 className="text-xl font-bold text-gray-900">Agenda</h1>
        <p className="text-gray-400 text-sm mt-2">Próximamente — Fase 4</p>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
```

### Crear `src\app\gastos\page.tsx`
```typescript
'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';

export default function GastosPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pb-24 text-center px-6">
        <span className="text-5xl mb-4">💳</span>
        <h1 className="text-xl font-bold text-gray-900">Viáticos</h1>
        <p className="text-gray-400 text-sm mt-2">Próximamente — Fase 4</p>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
```

### Crear `src\app\admin\page.tsx`
```typescript
'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';

export default function AdminPage() {
  return (
    <AuthGuard requiredRol="Admin">
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pb-24 text-center px-6">
        <span className="text-5xl mb-4">⚙️</span>
        <h1 className="text-xl font-bold text-gray-900">Administración</h1>
        <p className="text-gray-400 text-sm mt-2">Próximamente — Fase 5</p>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
```

- [ ] 6.1 — `src/app/historial/page.tsx` creado
- [ ] 6.2 — `src/app/dashboard/page.tsx` creado
- [ ] 6.3 — `src/app/calendario/page.tsx` creado
- [ ] 6.4 — `src/app/gastos/page.tsx` creado
- [ ] 6.5 — `src/app/admin/page.tsx` creado

---

## TAREA 7 — Build y prueba del flujo completo

### Build:
```bash
npm run build
```

Si hay errores TypeScript, corregirlos. Los más probables son:
- Importación circular de tipos → verificar que `Auditoria` en `types/index.ts` no choque con el que ya existía en una versión anterior (si hay duplicado, borrar el que NO tiene `id`, `localNombre`, `auditorEmail`)
- `clsx` no importado en `categorias/page.tsx` → agregar `import clsx from 'clsx';` si falta

### Servidor de desarrollo:
```bash
npm run dev
```

Verificar el flujo completo:
1. Login → Welcome → Auditoría → Setup → elegir local → Categorías
2. Responder algunas preguntas en 1-2 categorías
3. Click en "Ver Resumen y Enviar" → debe mostrar score, desglose y botón de envío
4. Click en "Enviar Auditoría" → debe hacer POST al Apps Script
5. Si el envío fue exitoso → pantalla de éxito
6. Verificar navegación del BottomNav (Historial, Reportes, Agenda → "Próximamente" sin crash)

- [ ] 7.1 — `npm run build` sin errores
- [ ] 7.2 — Resumen muestra score correcto
- [ ] 7.3 — Botón de envío hace la llamada al Apps Script (verificar en DevTools → Network)
- [ ] 7.4 — Navegación completa sin crashes

---

## TAREA 8 — Commit

```bash
git add web/src/
git add COWORK_INSTRUCTIONS.md
git commit -m "feat: fase 3 - resumen de auditoria, envio al apps script, placeholders navegacion"
git push origin main
```

- [ ] 8.1 — Commit y push realizados

---

## TAREA 9 — Crear REPORTE_FASE3.md

Crear `C:\Users\marco\audit-app\REPORTE_FASE3.md`:

```markdown
# REPORTE_FASE3.md — Resultados de Ejecución
Fecha: [COMPLETAR]

## Estado de tareas
- [ ] Tarea 1: Servicio de envío (envio.ts)
- [ ] Tarea 2: Tipo Auditoria en types/index.ts
- [ ] Tarea 3: Pantalla de Resumen
- [ ] Tarea 4: Pantalla de Éxito
- [ ] Tarea 5: Botón Resumen en Categorías
- [ ] Tarea 6: Páginas placeholder (5 páginas)
- [ ] Tarea 7: Build + prueba
- [ ] Tarea 8: Commit

## Build
- `npm run build`: [exitoso / errores — listar si los hay]
- Rutas generadas: [listar todas las rutas que aparecen en el output]

## Prueba del flujo completo
- Resumen muestra score: [sí/no]
- Puntaje calculado en la prueba: [XX% / Nivel]
- Botón de envío: [funciona / error — describir]
- Respuesta del Apps Script: [pegar JSON de respuesta si fue exitoso]
- Pantalla de éxito: [aparece / no]
- BottomNav sin crashes: [sí/no]

## Errores encontrados
[Ninguno / descripción]

## Archivos creados en esta fase
[Listar los nuevos archivos]

## Notas del agente
[Observaciones relevantes]
```

- [ ] 9.1 — `REPORTE_FASE3.md` creado con todos los campos

---

## Al terminar

Decirle a Marcos: **"Claude Code ya completó las tareas de COWORK_INSTRUCTIONS.md. El reporte está en REPORTE_FASE3.md"**

CoWork leerá ese archivo para diseñar la **Fase 4: Historial de auditorías y Dashboard de scores.**
