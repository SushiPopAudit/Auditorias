/**
 * auth.ts — Login y llamadas al Apps Script
 */
import type { Sesion } from '@/types';
import { saveSession } from '@/lib/session';

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
  sesion?: Omit<Sesion, 'savedAt'>;
  error?: string;
}

/** Login de usuario contra el Apps Script */
export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const pwd = await hashPwd(password);
    const data = await callAPI({ action: 'login', email, hash: pwd });

    // El Apps Script devuelve { success: true, user: { email, nombre, rol, locales, ... } }
    if (!data.success) {
      return { ok: false, error: String(data.message ?? 'Credenciales incorrectas') };
    }

    const u = (data.user ?? data) as Record<string, unknown>;

    const sesion: Omit<Sesion, 'savedAt'> = {
      email:   String(u.email   ?? email),
      nombre:  String(u.nombre  ?? ''),
      rol:     (u.rol === 'Admin' ? 'Admin' : 'Auditor') as 'Admin' | 'Auditor',
      locales: String(u.locales ?? ''),
      token:   pwd,          // El token es el hash SHA-256 de la contraseña
    };

    saveSession(sesion);
    return { ok: true, sesion };
  } catch (e) {
    return { ok: false, error: 'Error de conexión. Verificá tu internet.' };
  }
}
