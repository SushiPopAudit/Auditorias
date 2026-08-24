/**
 * dashboard.ts — Consulta las métricas del dashboard
 *
 * Action verificada: getDashboard (apps-script.gs línea 1843)
 * Params: email, token, tipo (opcional: 'Oficial' | 'Informal'; vacío = todos)
 *
 * El backend cachea 180s con clave db_<email>_<tipo>.
 */
import type { Sesion } from '@/types';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export interface AuditoriaMini {
  auditId:   string;
  fecha:     string;
  fechaISO:  string;
  auditor:   string;
  pct:       number;
  nivel:     string;
  reprobado: boolean;
}

export interface ControlFalla {
  control:      string;
  categoria:    string;
  subcategoria: string;
  importancia:  string;
  /** En cuántas de las últimas auditorías del local falló (vista local) */
  failedAudits?: number;
  /** En cuántos locales falla (vista global) */
  localCount?:   number;
}

export interface CategoriaDificultad {
  categoria:          string;
  pct:                number;
  ncCount?:           number;
  localCount?:        number;
  localsBelowTarget?: number;
}

export interface DatosLocal {
  ultimasAuditorias: AuditoriaMini[];
  auditsCount:       number;
  promedio3:         number | null;
  tendencia:         'sube' | 'baja' | 'estable' | 'sin-datos';
  tendenciaDiff:     number | null;
  diasSinAuditoria:  number | null;
  reincidencia:      number | null;
  rankingControles:  ControlFalla[];
  rankingCategorias: CategoriaDificultad[];
}

export interface RankingItem {
  local:      string;
  promedio:   number;
  auditCount: number;
}

export interface DashboardData {
  locales: string[];
  porLocal: Record<string, DatosLocal>;
  global: {
    promedio:          number | null;
    totalLocales:      number;
    rankingControles:  ControlFalla[];
    rankingCategorias: CategoriaDificultad[];
  };
  ranking: {
    mesActual:   RankingItem[];
    mesAnterior: RankingItem[];
    ult3Meses:   RankingItem[];
  };
}

export async function getDashboard(
  sesion: Sesion,
  tipo: string = '',
): Promise<DashboardData> {
  const params: Record<string, string> = {
    action: 'getDashboard',
    email:  sesion.email,
    token:  sesion.token,
  };
  if (tipo) params.tipo = tipo;

  const res  = await fetch(`${URL}?${new URLSearchParams(params)}`, { redirect: 'follow' });
  const data = await res.json();

  if (!data.success) throw new Error(String(data.error ?? 'No se pudo cargar el dashboard'));

  return {
    locales:  Array.isArray(data.locales) ? data.locales.map(String) : [],
    porLocal: (data.porLocal ?? {}) as Record<string, DatosLocal>,
    global: {
      promedio:          data.global?.promedio ?? null,
      totalLocales:      Number(data.global?.totalLocales ?? 0),
      rankingControles:  data.global?.rankingControles  ?? [],
      rankingCategorias: data.global?.rankingCategorias ?? [],
    },
    ranking: {
      mesActual:   data.ranking?.mesActual   ?? [],
      mesAnterior: data.ranking?.mesAnterior ?? [],
      ult3Meses:   data.ranking?.ult3Meses   ?? [],
    },
  };
}
