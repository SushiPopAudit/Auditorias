'use client';
import clsx from 'clsx';

// ─────────────────────────────────────────────────────────
// Escala de estado — SOLO para números que son un puntaje
// ─────────────────────────────────────────────────────────

export interface EstiloTramo { chip: string; barra: string; nivel: string }

export function tramoScore(pct: number, reprobado = false): EstiloTramo {
  if (reprobado) return { chip: 'bg-red-100 text-red-800',       barra: 'bg-red-800',    nivel: 'Reprobado' };
  if (pct >= 90) return { chip: 'bg-green-100 text-green-800',   barra: 'bg-green-600',  nivel: 'Excelente' };
  if (pct >= 75) return { chip: 'bg-yellow-100 text-yellow-800', barra: 'bg-yellow-500', nivel: 'Satisfactorio' };
  if (pct >= 60) return { chip: 'bg-orange-100 text-orange-800', barra: 'bg-orange-500', nivel: 'A mejorar' };
  return           { chip: 'bg-red-100 text-red-700',            barra: 'bg-red-600',    nivel: 'Deficiente' };
}

// ─────────────────────────────────────────────────────────
// Tile de métrica
// ─────────────────────────────────────────────────────────

interface TileProps {
  label:    string;
  valor:    string;
  /** Texto secundario: siempre con símbolo + palabra, nunca solo color */
  detalle?: string;
  /** Color del tile completo — usar solo cuando el valor tenga semántica de estado */
  tono?:    'neutro' | 'bien' | 'atencion' | 'mal';
}

const TONO: Record<string, string> = {
  neutro:   'bg-white      border-gray-100',
  bien:     'bg-green-50   border-green-100',
  atencion: 'bg-amber-50   border-amber-100',
  mal:      'bg-red-50     border-red-100',
};

export function Tile({ label, valor, detalle, tono = 'neutro' }: TileProps) {
  return (
    <div className={clsx('rounded-2xl border p-3.5 shadow-sm', TONO[tono])}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1 leading-none">{valor}</p>
      {detalle && <p className="text-xs text-gray-500 mt-1.5">{detalle}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Barra horizontal etiquetada
// ─────────────────────────────────────────────────────────

interface BarraProps {
  titulo:     string;
  subtitulo?: string;
  /** Texto del valor, a la derecha del título */
  valor:      string;
  /** 0-100 — el ancho de la barra */
  pct:        number;
  /** Clase de color de la barra. Para conteos, usar SIEMPRE el mismo color */
  color?:     string;
  /** Chip opcional a la derecha (importancia, etc.) */
  chip?:      { texto: string; clase: string };
}

export function Barra({ titulo, subtitulo, valor, pct, color = 'bg-red-500', chip }: BarraProps) {
  const ancho = Math.max(0, Math.min(100, pct));
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-gray-900 font-medium leading-snug">{titulo}</p>
        <span className="text-sm font-semibold text-gray-900 flex-shrink-0 tabular-nums">
          {valor}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1">
        {subtitulo && <p className="text-xs text-gray-400 truncate">{subtitulo}</p>}
        {chip && (
          <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0', chip.clase)}>
            {chip.texto}
          </span>
        )}
      </div>

      {/* Barra fina, redondeada solo en el extremo del dato */}
      <div className="h-2 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
        <div
          className={clsx('h-full rounded-r-[4px]', color)}
          style={{ width: `${ancho}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Estado vacío
// ─────────────────────────────────────────────────────────

export function Vacio({ texto }: { texto: string }) {
  return <p className="text-sm text-gray-400 text-center py-6">{texto}</p>;
}

/** Chips de importancia — mismos colores que en el resto de la app */
export const IMP_CHIP: Record<string, string> = {
  critico: 'bg-red-100    text-red-800',
  alta:    'bg-orange-100 text-orange-800',
  media:   'bg-yellow-100 text-yellow-800',
  baja:    'bg-green-100  text-green-700',
};

export function normImp(s: string): string {
  return (s || '').toLowerCase().trim().replace(/í/g, 'i');
}

/** Texto de tendencia — símbolo + palabra, nunca solo color */
export function textoTendencia(
  tendencia: string, diff: number | null,
): { texto: string; tono: 'bien' | 'atencion' | 'mal' | 'neutro' } {
  const d = diff != null ? Math.abs(Math.round(diff)) : null;
  if (tendencia === 'sube')    return { texto: `▲ ${d ?? ''} pts vs. anterior`.trim(), tono: 'bien' };
  if (tendencia === 'baja')    return { texto: `▼ ${d ?? ''} pts vs. anterior`.trim(), tono: 'mal' };
  if (tendencia === 'estable') return { texto: '→ Estable', tono: 'neutro' };
  return { texto: 'Sin datos suficientes', tono: 'neutro' };
}
