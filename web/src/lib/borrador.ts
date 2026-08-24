/**
 * borrador.ts — Persistencia de la auditoría en curso en localStorage
 *
 * Si supera 4MB, guarda sin fotos (las conserva el state en memoria).
 * Ventana de recuperación: 72 horas.
 * Solo se borra cuando el servidor confirma la recepción.
 */
import type { Local, RespuestaItem } from '@/types';

const KEY        = 'audit_draft';
const KEY_UNCONF = 'audit_unconfirmed';
const MAX_BYTES  = 4 * 1024 * 1024;
const VENTANA_MS = 72 * 60 * 60 * 1000;

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
  skipped?:      Record<string, boolean>;
  sinFotos?:     boolean;
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
    const slim: Borrador = {
      ...draft,
      sinFotos: true,
      answers: Object.fromEntries(
        Object.entries(draft.answers).map(([k, v]) => [k, { ...v, fotos: [] }])
      ),
    };
    localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    // cuota excedida — no romper la app
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

export function marcarSinConfirmar(auditId: string): void {
  try { localStorage.setItem(KEY_UNCONF, auditId); } catch {}
}

export function getSinConfirmar(): string | null {
  try { return localStorage.getItem(KEY_UNCONF); } catch { return null; }
}

export function limpiarSinConfirmar(): void {
  try { localStorage.removeItem(KEY_UNCONF); } catch {}
}

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
