/**
 * validaciones.ts — Réplica literal del motor de validaciones del prototipo
 *
 * DSL de la columna `validacion` (col 10 del CSV):
 *   headcount
 *   fecha            |  fecha|NA
 *   numero|C:min:max|P:min:max|NA
 *     C: = rango que da "Cumple"      P: = rango que da "Cumple parcialmente"
 *     '*' = sin límite    NA = habilita checkbox "No aplica"
 */

export interface RangoNum { min: number | null; max: number | null }

export type Regla =
  | { tipo: 'headcount' }
  | { tipo: 'fecha';  allowNA: boolean }
  | { tipo: 'numero'; cumples: RangoNum[]; parciales: RangoNum[]; allowNA: boolean };

/** Sectores hardcodeados del headcount (idénticos al prototipo) */
export const HEADCOUNT_SECTORES = ['SUSHI', 'COCINA CALIENTE', 'ENCARGADO/LOGÍSTICA'] as const;

export function headcountKey(sector: string): string {
  return sector.replace(/\//g, '_').replace(/\s+/g, '_');
}

export function parseValidacion(v: string): Regla | null {
  if (!v) return null;
  const parts = v.split('|');
  const tipo = parts[0].toLowerCase();

  if (tipo === 'headcount') return { tipo: 'headcount' };

  if (tipo === 'fecha') return { tipo: 'fecha', allowNA: parts.includes('NA') };

  if (tipo === 'numero') {
    const allowNA = parts.includes('NA');
    const cumples: RangoNum[] = [];
    const parciales: RangoNum[] = [];
    parts.forEach(p => {
      if (p.startsWith('C:')) {
        const [, a, b] = p.split(':');
        cumples.push({
          min: a === '*' ? null : parseFloat(a),
          max: b === undefined ? null : (b === '*' ? null : parseFloat(b)),
        });
      } else if (p.startsWith('P:')) {
        const [, a, b] = p.split(':');
        parciales.push({ min: parseFloat(a), max: parseFloat(b) });
      }
    });
    return { tipo: 'numero', cumples, parciales, allowNA };
  }

  return null;
}

/** Evalúa un valor numérico. Rangos INCLUSIVOS. Fallback = 'No Cumple'. */
export function evaluarNumero(val: string, regla: Regla | null): string | null {
  if (!regla || regla.tipo !== 'numero') return null;
  const n = parseFloat(String(val).replace(',', '.'));
  if (isNaN(n)) return null;

  for (const c of regla.cumples) {
    if ((c.min === null || n >= c.min) && (c.max === null || n <= c.max)) return 'Cumple';
  }
  for (const p of regla.parciales) {
    if (n >= p.min! && n <= p.max!) return 'Cumple parcialmente';
  }
  return 'No Cumple';
}

/**
 * Evalúa una fecha de vencimiento.
 * Anterior a hoy → No Cumple. Dentro de 3 meses → Cumple + advertencia. Más allá → Cumple.
 */
export function evaluarFecha(val: string): { resultado: string; advertencia: string | null } | null {
  if (!val) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(val + 'T00:00:00');
  if (isNaN(fecha.getTime())) return null;

  if (fecha < hoy) return { resultado: 'No Cumple', advertencia: null };

  const tresMeses = new Date(hoy);
  tresMeses.setMonth(tresMeses.getMonth() + 3);
  if (fecha <= tresMeses) return { resultado: 'Cumple', advertencia: 'Próximo a vencer' };

  return { resultado: 'Cumple', advertencia: null };
}

/** Parser del tipo de respuesta (columna 8). La col 10 tiene precedencia sobre esta. */
export function parseAnswerType(pregunta: string, tipoRespuesta: string): { type: string; options: string[] } {
  const OPCIONES_DEFAULT = ['Cumple', 'Cumple parcialmente', 'No Cumple', 'No aplica'];

  if (tipoRespuesta) {
    const tr = tipoRespuesta.toLowerCase();
    if (tr === 'numero') return { type: 'number', options: [] };
    if (tr === 'fecha')  return { type: 'fecha',  options: [] };
    if (tr.startsWith('radio')) {
      const colonIdx = tr.indexOf(':');
      if (colonIdx > -1) {
        const opts = tipoRespuesta.slice(colonIdx + 1).split('/').map(o => o.trim()).filter(Boolean);
        return { type: 'radio', options: opts };
      }
      return { type: 'radio', options: OPCIONES_DEFAULT };
    }
  }
  if (!pregunta) return { type: 'text', options: [] };
  const lower = pregunta.toLowerCase();
  if (lower.includes('numerico') || lower.includes('numérico') || lower.includes('valor medido')) {
    return { type: 'number', options: [] };
  }
  if (pregunta.includes('/')) {
    return { type: 'radio', options: pregunta.split('/').map(o => o.trim()).filter(Boolean) };
  }
  return { type: 'text', options: [] };
}

/** true si la respuesta es "No Cumple" o contiene "parcial" */
export function esRespuestaNegativa(respuesta: string): boolean {
  const v = (respuesta || '').toLowerCase();
  return v === 'no cumple' || v.includes('parcial');
}

export function observacionObligatoria(respuesta: string, validacion: string): boolean {
  const regla = parseValidacion(validacion || '');
  const autoEvaluada = !!regla && (regla.tipo === 'numero' || regla.tipo === 'fecha');
  return !autoEvaluada && esRespuestaNegativa(respuesta);
}

export function fotoObligatoria(respuesta: string, imagen: string): boolean {
  const porConfig = imagen === 'si' || imagen === 'obligatorio';
  return porConfig || esRespuestaNegativa(respuesta);
}

export function fotoBloquea(respuesta: string): boolean {
  return esRespuestaNegativa(respuesta);
}

/** Extrae la unidad del texto de la pregunta: "Temperatura heladera (°C)" → "°C" */
export function extraerUnidad(pregunta: string): string {
  const m = (pregunta || '').match(/\(([^)]{1,8})\)/);
  return m ? m[1] : '';
}
