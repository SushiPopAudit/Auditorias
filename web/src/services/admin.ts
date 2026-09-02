/**
 * admin.ts — Gestión de usuarios, locales y configuración
 *
 * Todo requiere credenciales de Admin. El backend valida rol='Admin',
 * hash coincidente y estado='Activo'.
 */
import type { Sesion } from '@/types';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export interface Usuario {
  email:       string;
  nombre:      string;
  rol:         string;     // 'Admin' | 'Auditor' | 'Franquiciado'
  locales:     string;     // 'todos' o nombres separados por coma
  primerLogin: boolean;
  estado:      string;     // 'Activo' | 'Inactivo'
  fechaAlta:   string;
  ultimoLogin: string;
  viaticos:    boolean;
}

export interface LocalAdmin {
  idx:     number;   // fila real en la hoja — necesaria para editar y borrar
  nombre:  string;
  isCausa: boolean;
  emails:  string;   // separados por coma
}

export type Resultado = { ok: boolean; mensaje?: string; error?: string };

async function get(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL}?${new URLSearchParams(params)}`, { redirect: 'follow' });
  return res.json();
}

function creds(s: Sesion) {
  return { adminEmail: s.email, adminToken: s.token };
}

function aBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'TRUE' || v === 'Sí' || v === 'si';
}

async function accion(params: Record<string, string>): Promise<Resultado> {
  try {
    const d = await get(params);
    return d.success
      ? { ok: true, mensaje: d.message ? String(d.message) : undefined }
      : { ok: false, error: String(d.error ?? 'No se pudo completar la acción') };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

// ── Usuarios ─────────────────────────────────────────────

export async function getUsuarios(s: Sesion): Promise<Usuario[]> {
  const d = await get({ action: 'getUsuarios', ...creds(s) });
  if (!d.success) throw new Error(String(d.error ?? 'No se pudieron cargar los usuarios'));
  const lista = Array.isArray(d.usuarios) ? d.usuarios : [];
  return (lista as Record<string, unknown>[]).map(u => ({
    email:       String(u.email       ?? ''),
    nombre:      String(u.nombre      ?? ''),
    rol:         String(u.rol         ?? 'Auditor'),
    locales:     String(u.locales     ?? 'todos'),
    primerLogin: aBool(u.primerLogin),
    estado:      String(u.estado      ?? 'Activo'),
    fechaAlta:   String(u.fechaAlta   ?? ''),
    ultimoLogin: String(u.ultimoLogin ?? ''),
    viaticos:    aBool(u.viaticos),
  }));
}

export interface UsuarioInput {
  nombre:   string;
  email:    string;
  rol:      string;
  locales:  string;
  viaticos: boolean;
}

export function crearUsuario(s: Sesion, u: UsuarioInput): Promise<Resultado> {
  return accion({
    action: 'crearUsuario', ...creds(s),
    nombre: u.nombre, email: u.email, rol: u.rol,
    locales: u.locales, viaticos: String(u.viaticos),
  });
}

export function editarUsuario(
  s: Sesion, targetEmail: string,
  u: { nombre: string; rol: string; locales: string; estado: string; viaticos: boolean },
): Promise<Resultado> {
  return accion({
    action: 'editarUsuario', ...creds(s), targetEmail,
    nombre: u.nombre, rol: u.rol, locales: u.locales,
    estado: u.estado, viaticos: String(u.viaticos),
  });
}

export function resetPassword(s: Sesion, targetEmail: string): Promise<Resultado> {
  return accion({ action: 'resetPassword', ...creds(s), targetEmail });
}

export function darDeBaja(s: Sesion, targetEmail: string): Promise<Resultado> {
  return accion({ action: 'darDeBaja', ...creds(s), targetEmail });
}

export function reactivarUsuario(s: Sesion, targetEmail: string): Promise<Resultado> {
  return accion({ action: 'reactivarUsuario', ...creds(s), targetEmail });
}

// ── Locales ──────────────────────────────────────────────

export async function getLocalesAdmin(s: Sesion): Promise<LocalAdmin[]> {
  const d = await get({ action: 'getLocales', ...creds(s) });
  if (!d.success) throw new Error(String(d.error ?? 'No se pudieron cargar los locales'));
  const lista = Array.isArray(d.locales) ? d.locales : [];
  return (lista as Record<string, unknown>[]).map(l => ({
    idx:     Number(l.idx ?? 0),
    nombre:  String(l.nombre ?? ''),
    isCausa: aBool(l.isCausa),
    emails:  String(l.emails ?? ''),
  }));
}

export interface LocalInput {
  nombre:  string;
  isCausa: boolean;
  emails:  string;
}

export function crearLocal(s: Sesion, l: LocalInput): Promise<Resultado> {
  return accion({
    action: 'crearLocal', ...creds(s),
    nombre: l.nombre, isCausa: String(l.isCausa), emails: l.emails,
  });
}

export function updateLocal(s: Sesion, idx: number, l: LocalInput): Promise<Resultado> {
  return accion({
    action: 'updateLocal', ...creds(s), idx: String(idx),
    nombre: l.nombre, isCausa: String(l.isCausa), emails: l.emails,
  });
}

export function eliminarLocal(s: Sesion, idx: number): Promise<Resultado> {
  return accion({ action: 'eliminarLocal', ...creds(s), idx: String(idx) });
}

// ── Configuración ────────────────────────────────────────

export async function getConfig(s: Sesion): Promise<{ umbral: number }> {
  const d = await get({ action: 'getConfig', ...creds(s) });
  if (!d.success) throw new Error(String(d.error ?? 'No se pudo cargar la configuración'));
  const u = parseFloat(String(d.umbral_criticos_pct));
  return { umbral: isNaN(u) ? 10 : u };
}

export function saveConfig(s: Sesion, clave: string, valor: string): Promise<Resultado> {
  return accion({ action: 'saveConfig', ...creds(s), clave, valor });
}

export async function recalcularBatch(s: Sesion): Promise<{ ok: boolean; cantidad?: number; error?: string }> {
  try {
    const d = await get({ action: 'recalcularBatch', ...creds(s) });
    return d.success
      ? { ok: true, cantidad: Number(d.auditoriasActualizadas ?? 0) }
      : { ok: false, error: String(d.error ?? 'No se pudo recalcular') };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
