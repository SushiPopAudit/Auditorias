/**
 * preguntas.ts — ABM del cuestionario (solo Admin)
 *
 * OJO: `rowIndex` es el número de fila en la planilla. Al borrar una pregunta,
 * las de abajo cambian de número — hay que recargar la lista después de borrar.
 */
import type { Sesion } from '@/types';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export interface PreguntaAdmin {
  rowIndex:             number;
  marca:                string;
  categoria:            string;
  subcategoria:         string;
  control:              string;
  importancia:          string;
  explicacion:          string;
  pregunta:             string;
  imagen:               string;
  tipoRespuesta:        string;
  explicacionDetallada: string;
  validacion:           string;
}

export type PreguntaInput = Omit<PreguntaAdmin, 'rowIndex'>;

export const MARCAS       = ['Multimarca', 'Causa'];
export const IMPORTANCIAS = ['Critico', 'Alta', 'Media', 'Baja'];

export const IMAGEN_OPCIONES = [
  { v: '',            l: 'No requerida' },
  { v: 'si',          l: 'Recomendada'  },
  { v: 'obligatorio', l: 'Obligatoria'  },
];

async function get(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL}?${new URLSearchParams(params)}`, { redirect: 'follow' });
  return res.json();
}

export async function getPreguntasAdmin(s: Sesion): Promise<PreguntaAdmin[]> {
  const d = await get({ action: 'getPreguntas', email: s.email, token: s.token });
  if (!d.success) throw new Error(String(d.error ?? 'No se pudieron cargar las preguntas'));
  const lista = Array.isArray(d.preguntas) ? d.preguntas : [];
  return (lista as Record<string, unknown>[]).map(p => ({
    rowIndex:             Number(p.rowIndex ?? 0),
    marca:                String(p.marca                ?? ''),
    categoria:            String(p.categoria            ?? ''),
    subcategoria:         String(p.subcategoria         ?? ''),
    control:              String(p.control              ?? ''),
    importancia:          String(p.importancia          ?? ''),
    explicacion:          String(p.explicacion          ?? ''),
    pregunta:             String(p.pregunta             ?? ''),
    imagen:               String(p.imagen               ?? ''),
    tipoRespuesta:        String(p.tipoRespuesta        ?? ''),
    explicacionDetallada: String(p.explicacionDetallada ?? ''),
    validacion:           String(p.validacion           ?? ''),
  }));
}

function campos(p: PreguntaInput): Record<string, string> {
  return {
    marca: p.marca, categoria: p.categoria, subcategoria: p.subcategoria,
    control: p.control, importancia: p.importancia, explicacion: p.explicacion,
    pregunta: p.pregunta, imagen: p.imagen, tipoRespuesta: p.tipoRespuesta,
    explicacionDetallada: p.explicacionDetallada, validacion: p.validacion,
  };
}

type R = { ok: boolean; error?: string };

async function accion(params: Record<string, string>): Promise<R> {
  try {
    const d = await get(params);
    return d.success ? { ok: true } : { ok: false, error: String(d.error ?? 'No se pudo completar') };
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

export function addPregunta(s: Sesion, p: PreguntaInput): Promise<R> {
  return accion({ action: 'addPregunta', email: s.email, token: s.token, ...campos(p) });
}

export function editPregunta(s: Sesion, rowIndex: number, p: PreguntaInput): Promise<R> {
  return accion({
    action: 'editPregunta', email: s.email, token: s.token,
    rowIndex: String(rowIndex), ...campos(p),
  });
}

export function deletePregunta(s: Sesion, rowIndex: number): Promise<R> {
  return accion({ action: 'deletePregunta', email: s.email, token: s.token, rowIndex: String(rowIndex) });
}
