/**
 * historial.ts — Consulta el historial de auditorías
 *
 * Actions verificadas en apps-script.gs:
 *   getAuditorias  (línea 1717) → params: email, token
 *   getAuditoria   (línea 1773) → params: email, token, auditId
 *
 * IMPORTANTE: `token` es el hash SHA-256 de la contraseña (columna E de Usuarios).
 * Si el login no lo guarda bien, estas llamadas devuelven "Sin autorización".
 *
 * El backend ya filtra por rol: un Auditor solo ve las suyas, un Admin ve todas.
 */
import type { Sesion } from '@/types';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export interface AuditoriaResumen {
  auditId:   string;
  fecha:     string;
  fechaISO:  string;
  hora:      string;
  auditor:   string;
  local:     string;
  pct:       number;
  nivel:     string;
  reprobado: boolean;
  tipo:      string;
}

export interface RespuestaHistorial {
  categoria:    string;
  subcategoria: string;
  control:      string;
  importancia:  string;
  explicacion:  string;
  respuesta:    string;
  observacion:  string;
  fotoUrls:     string[];
  rawValor:     string;
}

export interface AuditoriaDetalle {
  auditId:             string;
  fecha:               string;
  hora:                string;
  auditor:             string;
  auditorEmail:        string;
  local:               string;
  marca:               string;
  acompanante:         string;
  posicionAcompanante: string;
  tipo:                string;
  puntaje: {
    pct: number; nivel: string; obtenido: number;
    posible: number; reprobado: boolean; nivelEmoji: string;
  };
  respuestas: RespuestaHistorial[];
}

async function get(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${URL}?${qs}`, { redirect: 'follow' });
  return res.json();
}

export async function getAuditorias(sesion: Sesion): Promise<AuditoriaResumen[]> {
  const data = await get({ action: 'getAuditorias', email: sesion.email, token: sesion.token });
  if (!data.success) throw new Error(String(data.error ?? 'No se pudo cargar el historial'));

  const lista = Array.isArray(data.auditorias) ? data.auditorias : [];
  return (lista as Record<string, unknown>[]).map(r => ({
    auditId:   String(r.auditId   ?? ''),
    fecha:     String(r.fecha     ?? ''),
    fechaISO:  String(r.fechaISO  ?? ''),
    hora:      String(r.hora      ?? ''),
    auditor:   String(r.auditor   ?? ''),
    local:     String(r.local     ?? ''),
    pct:       Number(r.pct       ?? 0),
    nivel:     String(r.nivel     ?? ''),
    reprobado: r.reprobado === true || r.reprobado === 'Sí',
    tipo:      String(r.tipo      ?? 'Oficial'),
  }));
}

export async function getAuditoria(sesion: Sesion, auditId: string): Promise<AuditoriaDetalle> {
  const data = await get({
    action: 'getAuditoria', email: sesion.email, token: sesion.token, auditId,
  });
  if (!data.success) throw new Error(String(data.error ?? 'No se pudo cargar la auditoría'));

  const p = (data.puntaje ?? {}) as Record<string, unknown>;
  const rs = Array.isArray(data.respuestas) ? data.respuestas : [];

  return {
    auditId:             String(data.auditId             ?? auditId),
    fecha:               String(data.fecha               ?? ''),
    hora:                String(data.hora                ?? ''),
    auditor:             String(data.auditor             ?? ''),
    auditorEmail:        String(data.auditorEmail        ?? ''),
    local:               String(data.local               ?? ''),
    marca:               String(data.marca               ?? ''),
    acompanante:         String(data.acompanante         ?? ''),
    posicionAcompanante: String(data.posicionAcompanante ?? ''),
    tipo:                String(data.tipo                ?? 'Oficial'),
    puntaje: {
      pct:        Number(p.pct        ?? 0),
      nivel:      String(p.nivel      ?? ''),
      obtenido:   Number(p.obtenido   ?? 0),
      posible:    Number(p.posible    ?? 0),
      reprobado:  p.reprobado === true,
      nivelEmoji: String(p.nivelEmoji ?? ''),
    },
    respuestas: (rs as Record<string, unknown>[]).map(r => ({
      categoria:    String(r.categoria    ?? ''),
      subcategoria: String(r.subcategoria ?? ''),
      control:      String(r.control      ?? ''),
      importancia:  String(r.importancia  ?? ''),
      explicacion:  String(r.explicacion  ?? ''),
      respuesta:    String(r.respuesta    ?? ''),
      observacion:  String(r.observacion  ?? ''),
      rawValor:     String(r.rawValor     ?? ''),
      fotoUrls:     Array.isArray(r.fotoUrls) ? (r.fotoUrls as unknown[]).map(String) : [],
    })),
  };
}

/**
 * Convierte una URL de Drive en una miniatura visualizable.
 * Copiado literal del prototipo (app.js línea 2336).
 */
export function toDriveThumb(url: string): string {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
}

export interface RespuestaEdicion {
  control:     string;
  respuesta:   string;
  observacion: string;
  rawValor:    string;
  fechaRaw:    string;
}

export interface EdicionResult {
  ok:         boolean;
  pct?:       number;
  nivel?:     string;
  reprobado?: boolean;
  error?:     string;
}

/**
 * Guarda cambios sobre una auditoría existente.
 * El backend hace match por `control` y recalcula el puntaje.
 * Hay que enviar TODAS las respuestas, no solo las modificadas.
 */
export async function editarAuditoria(
  sesion: Sesion,
  auditId: string,
  respuestas: RespuestaEdicion[],
): Promise<EdicionResult> {
  try {
    const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    const payload = {
      action:          'editarAuditoria',
      originalAuditId: auditId,
      hora,
      auditorEmail:    sesion.email,
      token:           sesion.token,
      respuestas,
    };

    const res = await fetch(URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(payload),
      redirect: 'follow',
    });

    const data = await res.json();
    if (!data.success) return { ok: false, error: String(data.error ?? 'Error al guardar') };

    return {
      ok:        true,
      pct:       Number(data.pct ?? 0),
      nivel:     String(data.nivel ?? ''),
      reprobado: data.reprobado === true,
    };
  } catch (e) {
    return { ok: false, error: `Error de conexión: ${String(e)}` };
  }
}

/**
 * Borra una auditoría: elimina las filas del Sheet y la carpeta de fotos de Drive.
 * OJO: el backend no valida credenciales — restringir a Admin en la UI.
 */
/**
 * Reenvía el informe de una auditoría por mail.
 * `destinatarios` admite varios separados por coma.
 * El backend regenera el PDF y lo adjunta.
 */
export async function reenviarInforme(
  sesion: Sesion, auditId: string, destinatarios: string,
): Promise<{ ok: boolean; mensaje?: string; error?: string }> {
  try {
    const qs = new URLSearchParams({
      action:    'reenviar',
      auditId,
      email:     destinatarios,
      userEmail: sesion.email,
      token:     sesion.token,
    });
    const res = await fetch(`${URL}?${qs}`, { redirect: 'follow' });
    const d = await res.json();
    return d.success
      ? { ok: true, mensaje: String(d.message ?? 'Informe enviado.') }
      : { ok: false, error: String(d.error ?? 'No se pudo enviar') };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function borrarAuditoria(
  sesion: Sesion, auditId: string,
): Promise<{ ok: boolean; filas?: number; error?: string }> {
  try {
    const qs = new URLSearchParams({
      action:     'borrarAuditoria',
      auditId,
      adminEmail: sesion.email,
      adminToken: sesion.token,
    });
    const res = await fetch(`${URL}?${qs}`, { redirect: 'follow' });
    const d = await res.json();
    if (!d.success) return { ok: false, error: String(d.error ?? 'No se pudo borrar') };
    return { ok: true, filas: Number(d.filasEliminadas ?? 0) };
  } catch (e) {
    return { ok: false, error: `Error de conexión: ${String(e)}` };
  }
}
