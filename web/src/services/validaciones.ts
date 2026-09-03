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

// ─────────────────────────────────────────────────────────
// Editor de validación: pasar del texto a la interfaz y viceversa
// ─────────────────────────────────────────────────────────

export type TipoValidacion = 'ninguna' | 'numero' | 'fecha' | 'headcount';

export interface RangoEditor { min: string; max: string }

export interface ValidacionEditor {
  tipo:      TipoValidacion;
  cumples:   RangoEditor[];   // vacío o '*' = sin límite
  parciales: RangoEditor[];   // los dos extremos son obligatorios
  allowNA:   boolean;
}

export const VALIDACION_VACIA: ValidacionEditor = {
  tipo: 'ninguna', cumples: [], parciales: [], allowNA: false,
};

/** Del texto guardado en la planilla al estado del editor */
export function aEditor(validacion: string): ValidacionEditor {
  const regla = parseValidacion(validacion || '');
  if (!regla) return { ...VALIDACION_VACIA };

  if (regla.tipo === 'headcount') {
    return { tipo: 'headcount', cumples: [], parciales: [], allowNA: false };
  }
  if (regla.tipo === 'fecha') {
    return { tipo: 'fecha', cumples: [], parciales: [], allowNA: regla.allowNA };
  }

  const txt = (n: number | null) => (n === null ? '' : String(n));
  return {
    tipo:      'numero',
    cumples:   regla.cumples.map(c => ({ min: txt(c.min), max: txt(c.max) })),
    parciales: regla.parciales.map(p => ({ min: txt(p.min), max: txt(p.max) })),
    allowNA:   regla.allowNA,
  };
}

/** Del estado del editor al texto que se guarda en la planilla */
export function aTexto(v: ValidacionEditor): string {
  if (v.tipo === 'ninguna')   return '';
  if (v.tipo === 'headcount') return 'headcount';
  if (v.tipo === 'fecha')     return v.allowNA ? 'fecha|NA' : 'fecha';

  const partes = ['numero'];
  // Un extremo vacío se guarda como '*' (sin límite)
  v.cumples.forEach(c => {
    const min = c.min.trim() || '*';
    const max = c.max.trim() || '*';
    if (min !== '*' || max !== '*') partes.push(`C:${min}:${max}`);
  });
  v.parciales.forEach(p => {
    const min = p.min.trim(), max = p.max.trim();
    if (min && max) partes.push(`P:${min}:${max}`);
  });
  if (v.allowNA) partes.push('NA');
  return partes.join('|');
}

/** Errores que impiden guardar. Devuelve [] si está todo bien. */
export function validarEditor(v: ValidacionEditor): string[] {
  if (v.tipo !== 'numero') return [];
  const errores: string[] = [];

  if (!v.cumples.length) {
    errores.push('Definí al menos un rango de "Cumple".');
  }

  const numOk = (s: string) => s.trim() === '' || !isNaN(parseFloat(s.replace(',', '.')));

  v.cumples.forEach((c, i) => {
    if (!numOk(c.min) || !numOk(c.max)) errores.push(`El rango de Cumple ${i + 1} tiene un valor que no es un número.`);
    const a = parseFloat(c.min.replace(',', '.')), b = parseFloat(c.max.replace(',', '.'));
    if (!isNaN(a) && !isNaN(b) && a > b) errores.push(`En el rango de Cumple ${i + 1}, el mínimo es mayor que el máximo.`);
  });

  v.parciales.forEach((p, i) => {
    if (!p.min.trim() || !p.max.trim()) {
      errores.push(`El rango parcial ${i + 1} necesita mínimo y máximo — los parciales no admiten "sin límite".`);
      return;
    }
    if (!numOk(p.min) || !numOk(p.max)) errores.push(`El rango parcial ${i + 1} tiene un valor que no es un número.`);
    const a = parseFloat(p.min.replace(',', '.')), b = parseFloat(p.max.replace(',', '.'));
    if (!isNaN(a) && !isNaN(b) && a > b) errores.push(`En el rango parcial ${i + 1}, el mínimo es mayor que el máximo.`);
  });

  return errores;
}
