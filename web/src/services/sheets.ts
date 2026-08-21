/**
 * sheets.ts — Lee datos desde Google Sheets publicados como CSV
 * TODO Fase 3: reemplazar por fetch a nuestra propia API/BD
 */
import Papa from 'papaparse';
import type { Local, Pregunta } from '@/types';

async function fetchCSV(url: string): Promise<string[][]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo cargar CSV (HTTP ${res.status}): ${url}`);
  const text = await res.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return result.data;
}

/**
 * Carga locales desde el CSV publicado.
 * Schema CSV: [0]=Nombre, [1]=isCausa (TRUE), [2]=Emails
 */
export async function getLocales(): Promise<Local[]> {
  const url = process.env.NEXT_PUBLIC_CSV_LOCALES!;
  const rows = await fetchCSV(url);
  return rows.slice(1)
    .map(r => ({
      nombre:  (r[0] || '').trim(),
      isCausa: (r[1] || '').trim().toUpperCase() === 'TRUE',
      emails:  (r[2] || '').trim(),
    }))
    .filter(l => l.nombre);
}

/**
 * Carga preguntas/checklist desde el CSV publicado.
 * Schema CSV: [0]=Marca, [1]=Cat, [2]=Subcat, [3]=Control,
 *             [4]=Importancia, [5]=Explicacion, [6]=Pregunta,
 *             [7]=Imagen, [8]=TipoRespuesta, [9]=ExpDetallada, [10]=Validacion
 */
export async function getPreguntas(soloMarca?: 'Multimarca' | 'Causa'): Promise<Pregunta[]> {
  const url = process.env.NEXT_PUBLIC_CSV_PREGUNTAS!;
  const rows = await fetchCSV(url);
  const preguntas: Pregunta[] = rows.slice(1)
    .filter(r => r[0] && r[3])
    .map((r, idx) => ({
      id:                   `q_${idx}`,
      marca:                (r[0] || '').trim(),
      categoria:            (r[1] || '').trim(),
      subcategoria:         (r[2] || '').trim(),
      control:              (r[3] || '').trim(),
      importancia:          (r[4] || '').trim(),
      explicacion:          (r[5] || '').trim(),
      pregunta:             (r[6] || '').trim(),
      imagen:               (r[7] || '').trim().toLowerCase(),
      tipoRespuesta:        (r[8] || '').trim().toLowerCase(),
      explicacionDetallada: (r[9] || '').trim(),
      validacion:           (r[10] || '').trim(),
    }));

  if (!soloMarca) return preguntas;
  return preguntas.filter(p =>
    p.marca === 'Multimarca' || p.marca === soloMarca
  );
}

/**
 * Agrupa preguntas en categorías (mismo orden que el prototipo)
 */
export function agruparPorCategoria(preguntas: Pregunta[]) {
  const map = new Map<string, Pregunta[]>();
  preguntas.forEach(p => {
    if (!map.has(p.categoria)) map.set(p.categoria, []);
    map.get(p.categoria)!.push(p);
  });
  return Array.from(map.entries()).map(([name, questions]) => ({ name, questions }));
}
