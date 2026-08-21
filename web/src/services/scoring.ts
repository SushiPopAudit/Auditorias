/**
 * scoring.ts — Réplica EXACTA de `recalcularPuntaje` del Apps Script
 * (apps-script.gs líneas 970-1008)
 *
 * Crítico que coincida: el email y el PDF los genera el backend.
 */
import type { Pregunta, RespuestaItem, Puntaje } from '@/types';
import { UMBRAL_DEFAULT } from './config';

const MAX_PTS:     Record<string, number> = { critico: 4, alta: 3, media: 2, baja: 1 };
const PARCIAL_PTS: Record<string, number> = { critico: 2, alta: 1, media: 1, baja: 0 };

function normImp(s: string): string {
  return String(s || '').toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
}

export function calcularPuntaje(
  preguntas: Pregunta[],
  respuestas: Record<string, RespuestaItem>,
  umbralCriticosPct: number = UMBRAL_DEFAULT,
): Puntaje {
  let obtenido = 0, posible = 0;
  let criticosTotal = 0, criticosFallidos = 0;

  preguntas.forEach(q => {
    const imp = normImp(q.importancia);
    const ans = respuestas[q.id];
    const res = (ans?.respuesta || '').toLowerCase().trim();

    const max = MAX_PTS[imp];
    if (!max) return;
    if (!res || res.includes('aplica')) return;
    if (!res.includes('cumple') && !res.includes('parcial')) return;

    posible += max;

    if (res === 'cumple') {
      obtenido += max;
    } else if (res.includes('parcial')) {
      obtenido += PARCIAL_PTS[imp] || 0;
    }

    if (imp === 'critico') {
      criticosTotal++;
      if (res.includes('no cumple') || res === 'nocumple') criticosFallidos++;
    }
  });

  const pct = posible > 0 ? Math.round((obtenido / posible) * 100) : 0;
  const reprobado = criticosTotal > 0
    && (criticosFallidos / criticosTotal * 100) >= umbralCriticosPct;

  let nivel: string, nivelClass: string, nivelEmoji: string;
  if (reprobado)      { nivel = 'Reprobado';     nivelClass = 'reprobado';     nivelEmoji = '⛔'; }
  else if (pct >= 90) { nivel = 'Excelente';     nivelClass = 'excelente';     nivelEmoji = '🟢'; }
  else if (pct >= 75) { nivel = 'Satisfactorio'; nivelClass = 'satisfactorio'; nivelEmoji = '🟡'; }
  else if (pct >= 60) { nivel = 'A mejorar';     nivelClass = 'mejora';        nivelEmoji = '🟠'; }
  else                { nivel = 'Deficiente';    nivelClass = 'deficiente';    nivelEmoji = '🔴'; }

  return { obtenido, posible, pct, reprobado, nivel, nivelClass, nivelEmoji, criticosTotal, criticosFallidos };
}
