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
