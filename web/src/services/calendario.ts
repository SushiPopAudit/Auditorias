/**
 * calendario.ts — Visitas programadas
 *
 * OJO: el campo `turno` de la API es el MOTIVO (Auditoria | Franco | Capacitacion).
 * Se reusa esa columna del Sheet para no tocar el backend.
 */
import type { Sesion } from '@/types';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export interface Visita {
  visitaId:      string;
  fecha:         string;   // 'YYYY-MM-DD'
  motivo:        string;   // viaja como `turno`
  local:         string;
  auditorEmail:  string;
  auditorNombre: string;
  estado:        string;   // 'Pendiente' | 'Realizada'
}

export interface UsuarioBasico {
  email:  string;
  nombre: string;
  rol:    string;
}

export interface FallaPrevia {
  categoria:    string;
  subcategoria: string;
  control:      string;
  importancia:  string;
  respuesta:    string;
}

export interface AuditoriaFallas {
  auditId: string;
  fecha:   string;
  fallas:  FallaPrevia[];
}

async function get(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL}?${new URLSearchParams(params)}`, { redirect: 'follow' });
  return res.json();
}

export async function getCalendario(sesion: Sesion): Promise<Visita[]> {
  const data = await get({ action: 'getCalendario', email: sesion.email, token: sesion.token });
  if (!data.success) throw new Error(String(data.error ?? 'No se pudo cargar el calendario'));

  const lista = Array.isArray(data.visitas) ? data.visitas : [];
  return (lista as Record<string, unknown>[]).map(v => ({
    visitaId:      String(v.visitaId      ?? ''),
    fecha:         String(v.fecha         ?? ''),
    motivo:        String(v.turno         ?? ''),   // turno → motivo
    local:         String(v.local         ?? ''),
    auditorEmail:  String(v.auditorEmail  ?? ''),
    auditorNombre: String(v.auditorNombre ?? ''),
    estado:        String(v.estado        ?? 'Pendiente'),
  }));
}

export async function getUsuariosBasico(sesion: Sesion): Promise<UsuarioBasico[]> {
  const data = await get({ action: 'getUsuariosBasico', email: sesion.email, token: sesion.token });
  if (!data.success) throw new Error(String(data.error ?? 'No se pudieron cargar los usuarios'));
  const lista = Array.isArray(data.usuarios) ? data.usuarios : [];
  return (lista as Record<string, unknown>[]).map(u => ({
    email:  String(u.email  ?? ''),
    nombre: String(u.nombre ?? ''),
    rol:    String(u.rol    ?? ''),
  }));
}

export interface VisitaInput {
  fecha:        string;
  motivo:       string;
  local:        string;
  auditorEmail: string;
}

export async function agregarVisita(sesion: Sesion, v: VisitaInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await get({
      action:       'agregarVisita',
      adminEmail:   sesion.email,
      adminToken:   sesion.token,
      fecha:        v.fecha,
      turno:        v.motivo,
      local:        v.local,
      auditorEmail: v.auditorEmail,
    });
    return data.success ? { ok: true } : { ok: false, error: String(data.error ?? 'No se pudo agregar') };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function editarVisita(
  sesion: Sesion, visitaId: string, v: VisitaInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await get({
      action:       'editarVisita',
      adminEmail:   sesion.email,
      adminToken:   sesion.token,
      visitaId,
      fecha:        v.fecha,
      turno:        v.motivo,
      local:        v.local,
      auditorEmail: v.auditorEmail,
    });
    return data.success ? { ok: true } : { ok: false, error: String(data.error ?? 'No se pudo guardar') };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function borrarVisita(sesion: Sesion, visitaId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await get({
      action: 'borrarVisita', adminEmail: sesion.email, adminToken: sesion.token, visitaId,
    });
    return data.success ? { ok: true } : { ok: false, error: String(data.error ?? 'No se pudo borrar') };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function marcarRealizada(sesion: Sesion, visitaId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await get({
      action: 'marcarVisitaRealizada', adminEmail: sesion.email, adminToken: sesion.token, visitaId,
    });
    return data.success ? { ok: true } : { ok: false, error: String(data.error ?? 'No se pudo marcar') };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function getLocalFallas(sesion: Sesion, local: string): Promise<AuditoriaFallas[]> {
  const data = await get({
    action: 'getLocalFallas', email: sesion.email, token: sesion.token, local,
  });
  if (!data.success) return [];
  const lista = Array.isArray(data.auditorias) ? data.auditorias : [];
  return (lista as Record<string, unknown>[]).map(a => ({
    auditId: String(a.auditId ?? ''),
    fecha:   String(a.fecha   ?? ''),
    fallas:  Array.isArray(a.fallas) ? (a.fallas as FallaPrevia[]) : [],
  }));
}
