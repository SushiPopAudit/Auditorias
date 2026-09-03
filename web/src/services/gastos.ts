/**
 * gastos.ts — Gastos de los auditores y viáticos asignados
 */
import type { Sesion } from '@/types';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export const CATEGORIAS = ['ALIMENTOS/BEBIDAS', 'TRANSPORTE', 'OTROS'] as const;

export const CAT_ICONO: Record<string, string> = {
  'ALIMENTOS/BEBIDAS': '🍽️',
  'TRANSPORTE':        '🚗',
  'OTROS':             '📦',
};

export interface Gasto {
  gastoId:     string;
  fecha:       string;   // 'YYYY-MM-DD'
  hora:        string;
  categoria:   string;
  importe:     number;
  fotoUrl:     string;
  descripcion: string;
}

export interface Ingreso {
  viaticoId:  string;
  importe:    number;
  fecha:      string;
  cargadoPor: string;
}

export interface DatosMes {
  gastos:       Gasto[];
  viaticos:     number;   // total asignado
  ingresos:     Ingreso[];
  totalGastado: number;
}

export interface AuditorViaticos {
  email:        string;
  nombre:       string;
  viaticos:     number;
  ingresos:     Ingreso[];
  totalGastado: number;
  saldo:        number;
  gastos:       Gasto[];
}

export type ResultadoGasto = { ok: boolean; error?: string };

async function get(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL}?${new URLSearchParams(params)}`, { redirect: 'follow' });
  return res.json();
}

function num(v: unknown): number { const n = Number(v); return isNaN(n) ? 0 : n; }

function mapGasto(g: Record<string, unknown>): Gasto {
  return {
    gastoId:     String(g.gastoId     ?? ''),
    fecha:       String(g.fecha       ?? ''),
    hora:        String(g.hora        ?? ''),
    categoria:   String(g.categoria   ?? 'OTROS'),
    importe:     num(g.importe),
    fotoUrl:     String(g.fotoUrl     ?? ''),
    descripcion: String(g.descripcion ?? ''),
  };
}

function mapIngreso(i: Record<string, unknown>): Ingreso {
  return {
    viaticoId:  String(i.viaticoId  ?? ''),
    importe:    num(i.importe),
    fecha:      String(i.fecha      ?? ''),
    cargadoPor: String(i.cargadoPor ?? ''),
  };
}

export async function getGastos(s: Sesion, mes: string): Promise<DatosMes> {
  const d = await get({ action: 'getGastos', email: s.email, token: s.token, mes });
  if (!d.success) throw new Error(String(d.error ?? 'No se pudieron cargar los gastos'));
  return {
    gastos:       (Array.isArray(d.gastos)   ? d.gastos   : []).map(mapGasto as never),
    ingresos:     (Array.isArray(d.ingresos) ? d.ingresos : []).map(mapIngreso as never),
    viaticos:     num(d.viaticos),
    totalGastado: num(d.totalGastado),
  };
}

export interface GastoInput {
  gastoId?:     string;     // vacío = alta
  fecha:        string;
  categoria:    string;
  importe:      string;     // como lo escribió el usuario, con coma o punto
  descripcion:  string;
  fotoBase64?:  string;
  fotoNombre?:  string;
  eliminarFoto?: boolean;
}

/**
 * Guarda un gasto. Va por POST porque la foto en base64 no entra en una URL.
 *
 * Apps Script a veces no devuelve la respuesta de un POST (redirige a otro
 * dominio que el navegador no puede leer). Por eso hay un timeout: si vence,
 * no damos el guardado por fallido — la pantalla recarga el mes y verifica.
 */
export async function saveGasto(
  s: Sesion, g: GastoInput,
): Promise<{ ok: boolean; sinConfirmar?: boolean; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      body: JSON.stringify({
        action:       'saveGasto',
        email:        s.email,
        token:        s.token,
        gastoId:      g.gastoId ?? '',
        fecha:        g.fecha,
        hora:         new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        categoria:    g.categoria,
        importe:      g.importe.replace(/\./g, '').replace(',', '.'),
        descripcion:  g.descripcion,
        fotoBase64:   g.fotoBase64 ?? '',
        fotoNombre:   g.fotoNombre ?? '',
        eliminarFoto: g.eliminarFoto ? 'true' : '',
      }),
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    const d = await res.json();
    return d.success ? { ok: true } : { ok: false, error: String(d.error ?? 'No se pudo guardar') };
  } catch {
    clearTimeout(t);
    return { ok: false, sinConfirmar: true, error: 'No se pudo confirmar el guardado.' };
  }
}

export async function deleteGasto(s: Sesion, gastoId: string): Promise<ResultadoGasto> {
  try {
    const d = await get({ action: 'deleteGasto', email: s.email, token: s.token, gastoId });
    return d.success ? { ok: true } : { ok: false, error: String(d.error ?? 'No se pudo borrar') };
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

export async function solicitarViaticos(
  s: Sesion, mes: string, importe: string, totalGastado: number, viaticos: number, comentario: string,
): Promise<ResultadoGasto> {
  try {
    const d = await get({
      action: 'solicitarViaticos', email: s.email, token: s.token, mes,
      importe: importe.replace(/\./g, '').replace(',', '.'),
      totalGastado: String(totalGastado), viaticos: String(viaticos), comentario,
    });
    return d.success ? { ok: true } : { ok: false, error: String(d.error ?? 'No se pudo enviar') };
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

// ── Admin ────────────────────────────────────────────────

export async function getViaticosAdmin(s: Sesion, mes: string): Promise<AuditorViaticos[]> {
  const d = await get({ action: 'getViaticosAdmin', adminEmail: s.email, adminToken: s.token, mes });
  if (!d.success) throw new Error(String(d.error ?? 'No se pudieron cargar los viáticos'));
  const lista = Array.isArray(d.auditores) ? d.auditores : [];
  return (lista as Record<string, unknown>[]).map(a => ({
    email:        String(a.email  ?? ''),
    nombre:       String(a.nombre ?? ''),
    viaticos:     num(a.viaticos),
    totalGastado: num(a.totalGastado),
    saldo:        num(a.saldo),
    ingresos:     (Array.isArray(a.ingresos) ? a.ingresos : []).map(mapIngreso as never),
    gastos:       (Array.isArray(a.gastos)   ? a.gastos   : []).map(mapGasto as never),
  }));
}

export async function saveViaticos(
  s: Sesion, auditorEmail: string, mes: string, importe: string,
): Promise<ResultadoGasto> {
  try {
    const d = await get({
      action: 'saveViaticos', adminEmail: s.email, adminToken: s.token,
      auditorEmail, mes, importe: importe.replace(/\./g, '').replace(',', '.'),
    });
    return d.success ? { ok: true } : { ok: false, error: String(d.error ?? 'No se pudo guardar') };
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

export async function editViatico(s: Sesion, viaticoId: string, importe: string): Promise<ResultadoGasto> {
  try {
    const d = await get({
      action: 'editViatico', adminEmail: s.email, adminToken: s.token,
      viaticoId, importe: importe.replace(/\./g, '').replace(',', '.'),
    });
    return d.success ? { ok: true } : { ok: false, error: String(d.error ?? 'No se pudo editar') };
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

export async function deleteViatico(s: Sesion, viaticoId: string): Promise<ResultadoGasto> {
  try {
    const d = await get({ action: 'deleteViatico', adminEmail: s.email, adminToken: s.token, viaticoId });
    return d.success ? { ok: true } : { ok: false, error: String(d.error ?? 'No se pudo borrar') };
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

// ── Helpers ──────────────────────────────────────────────

export function fmtPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n || 0);
}

export function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nombreMes(mes: string): string {
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1] ?? ''} ${a}`;
}
