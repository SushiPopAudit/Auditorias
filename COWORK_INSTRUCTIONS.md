# COWORK_INSTRUCTIONS.md — Ausitoria App · Fase 2
**Fecha:** 2026-08-21
**Generado por:** CoWork
**Para ejecutar:** Claude Code en `C:\Users\marco\audit-app\web`

---

## ⚠️ INSTRUCCIONES DE EJECUCIÓN

Ejecutar todas las tareas en orden. Cada tarea crea archivos con código completo listo para usar. Al finalizar, crear `REPORTE_FASE2.md` (Tarea 10) con los resultados reales. **Todos los archivos van dentro de `C:\Users\marco\audit-app\web\`.**

---

## Contexto: Qué se construye en esta fase

**Fase 1 completada (confirmado por reporte):**
- Next.js 16.3 + TypeScript + Tailwind instalado
- 32 locales cargados (25 SushiPop + 7 Causa)
- 188 preguntas en 8 categorías cargadas desde Google Sheets

**Fase 2 — Objetivo:** Construir el flujo completo de autenticación y auditoría:
```
Login → Bienvenida → Setup (elegir local) → Categorías → Pregunta × N → [Fase 3: Resumen + Envío]
```

**Arquitectura de estado:** Todo el estado de la sesión y la auditoría vive en un `AppContext` (React Context), igual que el `state` global del prototipo. No se usa ninguna librería de estado externa.

**Auth:** Igual al prototipo — email + SHA-256 password → GET al Apps Script → token guardado en localStorage. Sin cookies, sin NextAuth.

---

## TAREA 1 — Instalar dependencias adicionales

Ejecutar desde `C:\Users\marco\audit-app\web`:

```bash
npm install clsx
```

- [ ] 1.1 — `clsx` instalado (utilidad para clases CSS condicionales)

---

## TAREA 2 — Servicio de autenticación

### Crear `src\lib\session.ts`

```typescript
/**
 * session.ts — Manejo de sesión en localStorage
 * Replica exacta del prototipo (loadSession / saveSession / clearSession)
 */
import type { Sesion } from '@/types';

const KEY = 'user_session';
const TTL = 7 * 24 * 3600 * 1000; // 7 días en ms

export function loadSession(): Sesion | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s: Sesion = JSON.parse(raw);
    if (!s?.email || !s?.token) return null;
    if (Date.now() - (s.savedAt ?? 0) > TTL) { clearSession(); return null; }
    return s;
  } catch { return null; }
}

export function saveSession(user: Omit<Sesion, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...user, savedAt: Date.now() }));
  } catch { /* storage no disponible */ }
}

export function clearSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignorar */ }
}
```

- [ ] 2.1 — `src/lib/session.ts` creado

### Crear `src\services\auth.ts`

```typescript
/**
 * auth.ts — Login y llamadas al Apps Script
 * Replica exacta del prototipo (hashPwd + callAPI)
 */

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL!;

/** Hash SHA-256 de la contraseña (mismo algoritmo que el prototipo) */
export async function hashPwd(password: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Llamada GET al Apps Script con parámetros */
export async function callAPI(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetch(`${APPS_SCRIPT_URL}?${qs}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface LoginResult {
  ok: boolean;
  sesion?: {
    email: string;
    nombre: string;
    rol: 'Admin' | 'Auditor';
    locales: string;
    token: string;
  };
  error?: string;
}

/** Login de usuario contra el Apps Script */
export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const pwd = await hashPwd(password);
    const data = await callAPI({ action: 'login', email: email.toLowerCase().trim(), password: pwd });

    if (data.status === 'ok' || data.token) {
      return {
        ok: true,
        sesion: {
          email:   String(data.email  ?? email),
          nombre:  String(data.nombre ?? email),
          rol:     (data.rol === 'Admin' ? 'Admin' : 'Auditor') as 'Admin' | 'Auditor',
          locales: String(data.locales ?? ''),
          token:   String(data.token  ?? ''),
        },
      };
    }
    return { ok: false, error: String(data.message ?? 'Credenciales incorrectas') };
  } catch (e) {
    return { ok: false, error: `Error de conexión: ${String(e)}` };
  }
}
```

- [ ] 2.2 — `src/services/auth.ts` creado

Actualizar `src\services\index.ts` para incluir auth:
```typescript
export * from './sheets';
export * from './scoring';
export * from './auth';
```

- [ ] 2.3 — `src/services/index.ts` actualizado

---

## TAREA 3 — Contexto global de la app (AppContext)

### Crear `src\contexts\AppContext.tsx`

```typescript
'use client';
/**
 * AppContext — Estado global de la app
 * Contiene: sesión de usuario + estado de la auditoría en curso
 * Equivalente al objeto `state` del prototipo
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import type { Sesion, Local, Pregunta, Categoria, RespuestaItem } from '@/types';
import { loadSession, saveSession, clearSession } from '@/lib/session';
import { agruparPorCategoria } from '@/services/sheets';

// ── Estado ────────────────────────────────────────────────────

export interface AuditoriaState {
  local:         Local | null;
  fecha:         string;
  tipo:          string;          // 'Oficial' | 'Preliminar'
  acompanante:   string;
  posicionAcomp: string;
  auditId:       string;
  categorias:    Categoria[];
  catIndex:      number;
  qIndex:        number;
  answers:       Record<string, RespuestaItem>;
}

export interface AppState {
  // Sesión
  sesion:          Sesion | null;
  sessionLoading:  boolean;
  // Datos precargados
  locales:         Local[];
  preguntas:       Pregunta[];
  dataLoading:     boolean;
  dataError:       string;
  // Auditoría en curso
  auditoria:       AuditoriaState;
}

const HOY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const auditInicial: AuditoriaState = {
  local: null, fecha: HOY(), tipo: 'Oficial',
  acompanante: '', posicionAcomp: '',
  auditId: '', categorias: [],
  catIndex: 0, qIndex: 0, answers: {},
};

const initialState: AppState = {
  sesion: null, sessionLoading: true,
  locales: [], preguntas: [], dataLoading: false, dataError: '',
  auditoria: auditInicial,
};

// ── Acciones ──────────────────────────────────────────────────

type Action =
  | { type: 'SET_SESION';      payload: Sesion | null }
  | { type: 'SESSION_LOADED' }
  | { type: 'SET_LOCALES';     payload: Local[] }
  | { type: 'SET_PREGUNTAS';   payload: Pregunta[] }
  | { type: 'DATA_LOADING';    payload: boolean }
  | { type: 'DATA_ERROR';      payload: string }
  | { type: 'AUDIT_SET_LOCAL'; payload: Local }
  | { type: 'AUDIT_SET_CAMPO'; payload: Partial<AuditoriaState> }
  | { type: 'AUDIT_SET_CAT';   payload: number }
  | { type: 'AUDIT_NEXT_Q' }
  | { type: 'AUDIT_PREV_Q' }
  | { type: 'AUDIT_SET_ANSWER';payload: { id: string; item: RespuestaItem } }
  | { type: 'AUDIT_RESET' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SESION':
      return { ...state, sesion: action.payload, sessionLoading: false };
    case 'SESSION_LOADED':
      return { ...state, sessionLoading: false };
    case 'SET_LOCALES':
      return { ...state, locales: action.payload };
    case 'SET_PREGUNTAS':
      return { ...state, preguntas: action.payload };
    case 'DATA_LOADING':
      return { ...state, dataLoading: action.payload };
    case 'DATA_ERROR':
      return { ...state, dataError: action.payload };
    case 'AUDIT_SET_LOCAL': {
      const local = action.payload;
      const filtradas = state.preguntas.filter(p =>
        p.marca === 'Multimarca' || (local.isCausa ? p.marca === 'Causa' : false)
      );
      const categorias = agruparPorCategoria(filtradas);
      const auditId = `AUD_${local.nombre.replace(/\s+/g,'-').slice(0,20)}_${Date.now()}`;
      return { ...state, auditoria: { ...auditInicial, local, categorias, auditId, fecha: HOY() } };
    }
    case 'AUDIT_SET_CAMPO':
      return { ...state, auditoria: { ...state.auditoria, ...action.payload } };
    case 'AUDIT_SET_CAT':
      return { ...state, auditoria: { ...state.auditoria, catIndex: action.payload, qIndex: 0 } };
    case 'AUDIT_NEXT_Q':
      return { ...state, auditoria: { ...state.auditoria, qIndex: state.auditoria.qIndex + 1 } };
    case 'AUDIT_PREV_Q':
      return { ...state, auditoria: { ...state.auditoria, qIndex: Math.max(0, state.auditoria.qIndex - 1) } };
    case 'AUDIT_SET_ANSWER': {
      const answers = { ...state.auditoria.answers, [action.payload.id]: action.payload.item };
      return { ...state, auditoria: { ...state.auditoria, answers } };
    }
    case 'AUDIT_RESET':
      return { ...state, auditoria: auditInicial };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────

interface AppContextValue {
  state:    AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Cargar sesión desde localStorage al iniciar
  useEffect(() => {
    const sesion = loadSession();
    dispatch({ type: 'SET_SESION', payload: sesion });
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}

// ── Helpers de sesión ─────────────────────────────────────────

export function useSesion() {
  const { state, dispatch } = useApp();

  const setSesion = (sesion: Sesion) => {
    saveSession(sesion);
    dispatch({ type: 'SET_SESION', payload: sesion });
  };

  const logout = () => {
    clearSession();
    dispatch({ type: 'SET_SESION', payload: null });
  };

  return { sesion: state.sesion, sessionLoading: state.sessionLoading, setSesion, logout };
}
```

- [ ] 3.1 — `src/contexts/AppContext.tsx` creado

---

## TAREA 4 — Actualizar layout raíz y página de inicio

### Reemplazar `src\app\layout.tsx` con:

```typescript
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/contexts/AppContext';
import DataLoader from '@/components/DataLoader';

export const metadata: Metadata = {
  title: 'Ausitoria',
  description: 'Sistema de auditorías SushiPop',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Ausitoria' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e4001b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen">
        <AppProvider>
          <DataLoader />
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
```

- [ ] 4.1 — `src/app/layout.tsx` actualizado

### Reemplazar `src\app\page.tsx` con:

```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSesion } from '@/contexts/AppContext';

export default function HomePage() {
  const { sesion, sessionLoading } = useSesion();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!sesion) { router.replace('/login'); return; }
    if (sesion.rol === 'Admin') { router.replace('/admin'); return; }
    router.replace('/welcome');
  }, [sesion, sessionLoading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
```

- [ ] 4.2 — `src/app/page.tsx` actualizado

---

## TAREA 5 — DataLoader: carga silenciosa de datos

### Crear `src\components\DataLoader.tsx`

```typescript
'use client';
/**
 * DataLoader — Carga locales y preguntas al iniciar la sesión.
 * Es un componente invisible que corre en background.
 */
import { useEffect } from 'react';
import { useApp, useSesion } from '@/contexts/AppContext';
import { getLocales, getPreguntas } from '@/services';

export default function DataLoader() {
  const { dispatch } = useApp();
  const { sesion } = useSesion();

  useEffect(() => {
    if (!sesion) return;

    dispatch({ type: 'DATA_LOADING', payload: true });

    Promise.all([getLocales(), getPreguntas()])
      .then(([locales, preguntas]) => {
        dispatch({ type: 'SET_LOCALES',   payload: locales });
        dispatch({ type: 'SET_PREGUNTAS', payload: preguntas });
        dispatch({ type: 'DATA_LOADING',  payload: false });
      })
      .catch(e => {
        dispatch({ type: 'DATA_ERROR',   payload: String(e) });
        dispatch({ type: 'DATA_LOADING', payload: false });
      });
  }, [sesion, dispatch]);

  return null; // componente invisible
}
```

- [ ] 5.1 — `src/components/DataLoader.tsx` creado

---

## TAREA 6 — Página de Login

### Crear carpeta y archivo `src\app\login\page.tsx`

```typescript
'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/services/auth';
import { useSesion } from '@/contexts/AppContext';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const { setSesion }           = useSesion();
  const router                  = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.ok || !result.sesion) {
      setError(result.error ?? 'Error al iniciar sesión');
      return;
    }

    setSesion({ ...result.sesion, savedAt: Date.now() });
    router.replace(result.sesion.rol === 'Admin' ? '/admin' : '/welcome');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-white text-3xl font-bold">A</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Ausitoria</h1>
        <p className="text-gray-500 text-sm mt-1">Sistema de Auditorías SushiPop</p>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold text-base
                     disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] 6.1 — `src/app/login/page.tsx` creado

---

## TAREA 7 — Bottom Nav y componente AuthGuard

### Crear `src\components\BottomNav.tsx`

```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSesion } from '@/contexts/AppContext';
import clsx from 'clsx';

const NAV_AUDITOR = [
  { href: '/welcome',           icon: '🏠', label: 'Inicio' },
  { href: '/auditoria/setup',   icon: '📋', label: 'Auditoría' },
  { href: '/historial',         icon: '📜', label: 'Historial' },
  { href: '/dashboard',         icon: '📊', label: 'Reportes' },
  { href: '/calendario',        icon: '📅', label: 'Agenda' },
];

const NAV_ADMIN = [
  { href: '/admin',             icon: '⚙️', label: 'Admin' },
  { href: '/historial',         icon: '📜', label: 'Historial' },
  { href: '/dashboard',         icon: '📊', label: 'Reportes' },
];

export default function BottomNav() {
  const { sesion } = useSesion();
  const pathname   = usePathname();
  if (!sesion) return null;

  const items = sesion.rol === 'Admin' ? NAV_ADMIN : NAV_AUDITOR;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200
                    flex items-stretch safe-area-bottom z-50">
      {items.map(item => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5',
              active ? 'text-red-600' : 'text-gray-500'
            )}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className={clsx('font-medium', active && 'font-semibold')}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] 7.1 — `src/components/BottomNav.tsx` creado

### Crear `src\components\AuthGuard.tsx`

```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSesion } from '@/contexts/AppContext';

interface Props {
  children: React.ReactNode;
  requiredRol?: 'Admin' | 'Auditor';
}

export default function AuthGuard({ children, requiredRol }: Props) {
  const { sesion, sessionLoading } = useSesion();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!sesion) { router.replace('/login'); return; }
    if (requiredRol && sesion.rol !== requiredRol) router.replace('/welcome');
  }, [sesion, sessionLoading, requiredRol, router]);

  if (sessionLoading || !sesion) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] 7.2 — `src/components/AuthGuard.tsx` creado

---

## TAREA 8 — Pantalla de Bienvenida

### Crear `src\app\welcome\page.tsx`

```typescript
'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion } from '@/contexts/AppContext';
import Link from 'next/link';

function WelcomeContent() {
  const { sesion, logout } = useSesion();

  const acciones = [
    { href: '/auditoria/setup', icon: '📋', label: 'Nueva Auditoría',  desc: 'Iniciar una inspección' },
    { href: '/historial',       icon: '📜', label: 'Mis Auditorías',   desc: 'Ver historial propio' },
    { href: '/dashboard',       icon: '📊', label: 'Reportes',         desc: 'Scores y tendencias' },
    { href: '/calendario',      icon: '📅', label: 'Agenda',           desc: 'Próximas visitas' },
    { href: '/gastos',          icon: '💳', label: 'Viáticos',         desc: 'Registrar gastos' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-red-600 text-white px-5 pt-12 pb-6">
        <p className="text-red-200 text-sm mb-1">Bienvenido/a</p>
        <h1 className="text-2xl font-bold">{sesion?.nombre}</h1>
        <p className="text-red-200 text-xs mt-1 capitalize">{sesion?.rol}</p>
      </div>

      {/* Acciones */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {acciones.map(a => (
          <Link
            key={a.href}
            href={a.href}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100
                       active:scale-95 transition-transform flex flex-col gap-2"
          >
            <span className="text-3xl">{a.icon}</span>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{a.label}</p>
              <p className="text-gray-400 text-xs">{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Cerrar sesión */}
      <div className="px-4 mt-2">
        <button
          onClick={logout}
          className="w-full text-center text-sm text-gray-400 py-3"
        >
          Cerrar sesión
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function WelcomePage() {
  return <AuthGuard><WelcomeContent /></AuthGuard>;
}
```

- [ ] 8.1 — `src/app/welcome/page.tsx` creado

---

## TAREA 9 — Flujo de Auditoría: Setup, Categorías y Pregunta

### Crear carpetas:
```bash
mkdir src\app\auditoria
mkdir src\app\auditoria\setup
mkdir src\app\auditoria\categorias
mkdir src\app\auditoria\pregunta
mkdir src\components\auditoria
```

- [ ] 9.1 — Carpetas creadas

### Crear `src\app\auditoria\setup\page.tsx`

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp } from '@/contexts/AppContext';

function SetupContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');

  const localesFiltrados = state.locales.filter(l =>
    l.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const elegirLocal = (local: typeof state.locales[0]) => {
    dispatch({ type: 'AUDIT_SET_LOCAL', payload: local });
    router.push('/auditoria/categorias');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Elegir local</h1>
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar local..."
          className="w-full px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none"
        />
      </div>

      {state.dataLoading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {state.dataError && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {state.dataError}
        </div>
      )}

      <ul className="divide-y divide-gray-100 bg-white mx-4 mt-4 rounded-2xl overflow-hidden shadow-sm">
        {localesFiltrados.map(local => (
          <li key={local.nombre}>
            <button
              onClick={() => elegirLocal(local)}
              className="w-full text-left px-4 py-4 flex items-center justify-between
                         active:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-medium text-gray-900">{local.nombre}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {local.isCausa ? 'Causa' : 'SushiPop'}
                </p>
              </div>
              <span className="text-gray-300 text-xl">›</span>
            </button>
          </li>
        ))}
        {localesFiltrados.length === 0 && !state.dataLoading && (
          <li className="px-4 py-8 text-center text-gray-400 text-sm">
            No se encontraron locales
          </li>
        )}
      </ul>

      <BottomNav />
    </div>
  );
}

export default function SetupPage() {
  return <AuthGuard><SetupContent /></AuthGuard>;
}
```

- [ ] 9.2 — `src/app/auditoria/setup/page.tsx` creado

### Crear `src\app\auditoria\categorias\page.tsx`

```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp } from '@/contexts/AppContext';
import { calcularPuntaje } from '@/services/scoring';
import clsx from 'clsx';

function CategoriasContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { auditoria } = state;

  useEffect(() => {
    if (!auditoria.local) router.replace('/auditoria/setup');
  }, [auditoria.local, router]);

  if (!auditoria.local) return null;

  const elegirCategoria = (idx: number) => {
    dispatch({ type: 'AUDIT_SET_CAT', payload: idx });
    router.push('/auditoria/pregunta');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="text-red-600 text-sm mb-2">
          ← Cambiar local
        </button>
        <h1 className="text-xl font-bold text-gray-900">{auditoria.local.nombre}</h1>
        <p className="text-gray-400 text-sm">
          {auditoria.local.isCausa ? 'Causa' : 'SushiPop'} · {auditoria.fecha}
        </p>
      </div>

      <p className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Categorías
      </p>

      <ul className="divide-y divide-gray-100 bg-white mx-4 rounded-2xl overflow-hidden shadow-sm">
        {auditoria.categorias.map((cat, idx) => {
          const respondidas = cat.questions.filter(q => auditoria.answers[q.id]).length;
          const total       = cat.questions.length;
          const completa    = respondidas === total;

          return (
            <li key={cat.name}>
              <button
                onClick={() => elegirCategoria(idx)}
                className="w-full text-left px-4 py-4 flex items-center justify-between active:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{cat.name}</p>
                    {completa && <span className="text-green-500 text-sm">✓</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {respondidas}/{total} preguntas
                  </p>
                  {/* Barra de progreso */}
                  <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden w-32">
                    <div
                      className={clsx('h-full rounded-full transition-all', completa ? 'bg-green-500' : 'bg-red-500')}
                      style={{ width: `${total > 0 ? (respondidas/total)*100 : 0}%` }}
                    />
                  </div>
                </div>
                <span className="text-gray-300 text-xl ml-3">›</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Total respondidas */}
      {(() => {
        const todasPreguntas = auditoria.categorias.flatMap(c => c.questions);
        const totalResp = todasPreguntas.filter(q => auditoria.answers[q.id]).length;
        if (totalResp === 0) return null;
        const puntaje = calcularPuntaje(todasPreguntas, auditoria.answers);
        return (
          <div className="mx-4 mt-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Progreso general</p>
                <p className="text-2xl font-bold text-gray-900">{puntaje.pct}%</p>
              </div>
              <div className="text-right">
                <span className="text-2xl">{puntaje.nivelEmoji}</span>
                <p className={clsx('text-sm font-semibold mt-0.5',
                  puntaje.reprobado ? 'text-red-600' : 'text-gray-700'
                )}>{puntaje.nivel}</p>
              </div>
            </div>
          </div>
        );
      })()}

      <BottomNav />
    </div>
  );
}

export default function CategoriasPage() {
  return <AuthGuard><CategoriasContent /></AuthGuard>;
}
```

- [ ] 9.3 — `src/app/auditoria/categorias/page.tsx` creado

### Crear `src\components\auditoria\RespuestaRadio.tsx`

```typescript
'use client';
import clsx from 'clsx';

interface Props {
  opciones:  string[];
  valor:     string;
  onChange:  (v: string) => void;
}

const COLORES: Record<string, string> = {
  'cumple':                'bg-green-500 text-white border-green-500',
  'cumple parcialmente':   'bg-yellow-400 text-white border-yellow-400',
  'no cumple':             'bg-red-600   text-white border-red-600',
  'no aplica':             'bg-gray-400  text-white border-gray-400',
};

export default function RespuestaRadio({ opciones, valor, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {opciones.map(op => {
        const key    = op.toLowerCase();
        const active = valor.toLowerCase() === key;
        const color  = COLORES[key] ?? 'bg-blue-500 text-white border-blue-500';
        return (
          <button
            key={op}
            onClick={() => onChange(op)}
            className={clsx(
              'py-3 px-2 rounded-xl border-2 text-sm font-semibold text-center transition-all active:scale-95',
              active ? color : 'bg-white border-gray-200 text-gray-700'
            )}
          >
            {op}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] 9.4 — `src/components/auditoria/RespuestaRadio.tsx` creado

### Crear `src\app\auditoria\pregunta\page.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import RespuestaRadio from '@/components/auditoria/RespuestaRadio';
import { useApp } from '@/contexts/AppContext';
import type { RespuestaItem } from '@/types';
import clsx from 'clsx';

const OPCIONES_DEFAULT = ['Cumple', 'Cumple parcialmente', 'No Cumple', 'No aplica'];

function parseTipoRespuesta(tr: string, pregunta: string): { tipo: string; opciones: string[] } {
  if (!tr) {
    if (pregunta?.includes('/')) return { tipo: 'radio', opciones: pregunta.split('/').map(s => s.trim()) };
    return { tipo: 'text', opciones: [] };
  }
  if (tr === 'numero') return { tipo: 'numero', opciones: [] };
  if (tr === 'fecha')  return { tipo: 'fecha',  opciones: [] };
  if (tr.startsWith('radio')) {
    const idx = tr.indexOf(':');
    if (idx > -1) {
      const opciones = tr.slice(idx + 1).split('/').map(s => s.trim()).filter(Boolean);
      return { tipo: 'radio', opciones };
    }
    return { tipo: 'radio', opciones: OPCIONES_DEFAULT };
  }
  return { tipo: 'text', opciones: [] };
}

function PreguntaContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { auditoria } = state;

  const cat      = auditoria.categorias[auditoria.catIndex];
  const pregunta = cat?.questions[auditoria.qIndex];

  const [respuesta, setRespuesta] = useState('');
  const [observacion, setObservacion] = useState('');
  const [rawValor, setRawValor] = useState('');

  useEffect(() => {
    if (!auditoria.local) { router.replace('/auditoria/setup'); return; }
    if (!cat)             { router.replace('/auditoria/categorias'); return; }
  }, [auditoria.local, cat, router]);

  // Cargar respuesta existente si ya fue respondida
  useEffect(() => {
    if (!pregunta) return;
    const ans = auditoria.answers[pregunta.id];
    setRespuesta(ans?.respuesta ?? '');
    setObservacion(ans?.observacion ?? '');
    setRawValor(ans?.rawValor ?? '');
  }, [pregunta, auditoria.answers]);

  if (!cat || !pregunta) return null;

  const { tipo, opciones } = parseTipoRespuesta(pregunta.tipoRespuesta, pregunta.pregunta);
  const esUltima = auditoria.qIndex === cat.questions.length - 1;
  const totalCat = cat.questions.length;
  const progreso = ((auditoria.qIndex + 1) / totalCat) * 100;

  const IMP_COLOR: Record<string, string> = {
    crítico: 'bg-red-100 text-red-700',
    critico: 'bg-red-100 text-red-700',
    alta:    'bg-orange-100 text-orange-700',
    media:   'bg-yellow-100 text-yellow-700',
    baja:    'bg-gray-100 text-gray-600',
  };

  const guardarYAvanzar = () => {
    const item: RespuestaItem = {
      preguntaId: pregunta.id,
      control: pregunta.control,
      respuesta,
      observacion: observacion || undefined,
      rawValor: rawValor || undefined,
    };
    dispatch({ type: 'AUDIT_SET_ANSWER', payload: { id: pregunta.id, item } });

    if (!esUltima) {
      dispatch({ type: 'AUDIT_NEXT_Q' });
    } else {
      router.push('/auditoria/categorias');
    }
  };

  const saltar = () => {
    if (!esUltima) dispatch({ type: 'AUDIT_NEXT_Q' });
    else router.push('/auditoria/categorias');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
      {/* Header con progreso */}
      <div className="bg-white border-b border-gray-200 px-4 pt-10 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => auditoria.qIndex > 0 ? dispatch({ type: 'AUDIT_PREV_Q' }) : router.back()}
            className="text-red-600 text-sm"
          >
            ← Atrás
          </button>
          <span className="text-xs text-gray-400">
            {auditoria.qIndex + 1}/{totalCat} · {cat.name}
          </span>
        </div>
        <div className="h-1 bg-gray-100 rounded-full mt-2">
          <div
            className="h-full bg-red-500 rounded-full transition-all"
            style={{ width: `${progreso}%` }}
          />
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Importancia */}
        <span className={clsx(
          'inline-block px-2 py-0.5 rounded-full text-xs font-semibold',
          IMP_COLOR[(pregunta.importancia ?? '').toLowerCase()] ?? IMP_COLOR['media']
        )}>
          {pregunta.importancia}
        </span>

        {/* Control */}
        <div>
          <p className="text-xs text-gray-400 mb-1">{pregunta.subcategoria}</p>
          <h2 className="text-base font-bold text-gray-900 leading-snug">
            {pregunta.control}
          </h2>
          {pregunta.explicacion && (
            <p className="text-sm text-gray-500 mt-1">{pregunta.explicacion}</p>
          )}
        </div>

        {/* Respuesta según tipo */}
        {tipo === 'radio' && (
          <RespuestaRadio
            opciones={opciones.length ? opciones : OPCIONES_DEFAULT}
            valor={respuesta}
            onChange={setRespuesta}
          />
        )}

        {tipo === 'numero' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">
              {pregunta.pregunta || 'Valor medido'}
            </label>
            <input
              type="number"
              value={rawValor}
              onChange={e => setRawValor(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="0"
            />
          </div>
        )}

        {tipo === 'fecha' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Fecha</label>
            <input
              type="date"
              value={rawValor}
              onChange={e => setRawValor(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}

        {tipo === 'text' && (
          <textarea
            value={respuesta}
            onChange={e => setRespuesta(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            placeholder="Ingresá tu observación..."
          />
        )}

        {/* Observación (siempre disponible excepto si el tipo ya es text) */}
        {tipo !== 'text' && (
          <textarea
            value={observacion}
            onChange={e => setObservacion(e.target.value)}
            rows={2}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none bg-gray-50"
            placeholder="Observación (opcional)..."
          />
        )}
      </div>

      {/* Botones de acción */}
      <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100 space-y-2">
        <button
          onClick={guardarYAvanzar}
          disabled={!respuesta && tipo === 'radio'}
          className="w-full bg-red-600 text-white py-3.5 rounded-xl font-semibold
                     disabled:opacity-40 active:scale-95 transition-transform"
        >
          {esUltima ? 'Terminar categoría' : 'Siguiente →'}
        </button>
        <button
          onClick={saltar}
          className="w-full text-gray-400 py-2 text-sm"
        >
          Omitir esta pregunta
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function PreguntaPage() {
  return <AuthGuard><PreguntaContent /></AuthGuard>;
}
```

- [ ] 9.5 — `src/app/auditoria/pregunta/page.tsx` creado

---

## TAREA 10 — Verificar build y flujo

Ejecutar desde `C:\Users\marco\audit-app\web`:

```bash
npm run build
```

Si hay errores TypeScript, corregirlos antes de continuar.

```bash
npm run dev
```

Verificar manualmente el flujo completo:
1. `http://localhost:3000` → debe redirigir a `/login`
2. Login con credenciales reales → debe ir a `/welcome`
3. Click en "Nueva Auditoría" → debe ir a `/auditoria/setup` con lista de locales
4. Elegir un local → debe ir a `/auditoria/categorias` con 8 categorías
5. Elegir una categoría → primera pregunta en `/auditoria/pregunta`
6. Responder y avanzar por las preguntas

- [ ] 10.1 — `npm run build` sin errores TypeScript
- [ ] 10.2 — Flujo completo navegable en el navegador
- [ ] 10.3 — Login funciona con credenciales reales

---

## TAREA 11 — Crear REPORTE_FASE2.md

Crear `C:\Users\marco\audit-app\REPORTE_FASE2.md` con los resultados reales:

```markdown
# REPORTE_FASE2.md — Resultados de Ejecución
Fecha: [COMPLETAR]

## Estado de tareas
- [ ] Tarea 1: Instalar dependencias
- [ ] Tarea 2: Auth service
- [ ] Tarea 3: AppContext
- [ ] Tarea 4: Layout + página raíz
- [ ] Tarea 5: DataLoader
- [ ] Tarea 6: Login page
- [ ] Tarea 7: BottomNav + AuthGuard
- [ ] Tarea 8: Welcome
- [ ] Tarea 9: Flujo auditoría (setup + categorías + pregunta)
- [ ] Tarea 10: Build + prueba manual

## Build
- `npm run build`: [exitoso / errores — listar errores si los hay]

## Flujo manual probado
- Login funciona: [sí/no — usuario de prueba usado]
- Welcome muestra nombre de usuario: [sí/no]
- Setup muestra lista de locales (32): [sí/no]
- Categorías aparecen al elegir local: [sí/no — cuántas]
- Preguntas cargan al elegir categoría: [sí/no]
- Tipos de respuesta que funcionan: [radio / numero / fecha / text]

## Archivos creados
[Ejecutar `dir /s /b src\` y pegar resultado]

## Errores o problemas encontrados
[Ninguno / descripción detallada]

## Notas del agente
[Observaciones relevantes]
```

- [ ] 11.1 — `REPORTE_FASE2.md` creado con campos reales completados

---

## TAREA 12 — Commit

```bash
git add web/src/
git add REPORTE_FASE2.md
git add COWORK_INSTRUCTIONS.md
git commit -m "feat: fase 2 - auth + flujo completo de auditoria (login, setup, categorias, preguntas)"
git push origin main
```

- [ ] 12.1 — Commit y push realizados

---

## Al terminar

Decirle a Marcos: **"Claude Code ya completó las tareas de COWORK_INSTRUCTIONS.md. El reporte está en REPORTE_FASE2.md"**

CoWork leerá ese archivo y diseñará la **Fase 3: Resumen de auditoría, scoring visual y envío al Apps Script.**
