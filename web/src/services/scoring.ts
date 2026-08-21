/**
 * scoring.ts — Sistema de puntuación (migrado exactamente del prototipo)
 */
import type { Pregunta, RespuestaItem, Puntaje } from '@/types';

const MAX_PTS:     Record<string, number> = { critico: 4, crítico: 4, alta: 3, media: 2, baja: 1 };
const PARCIAL_PTS: Record<string, number> = { critico: 2, crítico: 2, alta: 1, media: 1, baja: 0 };

export function calcularPuntaje(preguntas: Pregunta[], respuestas: Record<string, RespuestaItem>): Puntaje {
  let obtenido = 0, posible = 0, reprobado = false;

  preguntas.forEach(q => {
    const imp = (q.importancia || '').toLowerCase().trim();
    const ans = respuestas[q.id];
    if (!ans) return;
    const val = (ans.respuesta || '').toLowerCase().trim();
    if (!val || val.includes('aplica')) return;

    const max = MAX_PTS[imp];
    if (!max) return;
    posible += max;

    if (val === 'cumple') {
      obtenido += max;
    } else if (val.includes('parcial')) {
      obtenido += PARCIAL_PTS[imp] || 0;
    } else if (val.includes('no cumple')) {
      if (imp === 'critico' || imp === 'crítico') reprobado = true;
    }
  });

  const pct = posible > 0 ? Math.round((obtenido / posible) * 100) : 0;

  let nivel: Puntaje['nivel'], nivelClass: string, nivelEmoji: string;
  if (reprobado)      { nivel = 'Reprobado';        nivelClass = 'reprobado';     nivelEmoji = '⛔'; }
  else if (pct >= 90) { nivel = 'Excelente';        nivelClass = 'excelente';     nivelEmoji = '🟢'; }
  else if (pct >= 75) { nivel = 'Satisfactorio';    nivelClass = 'satisfactorio'; nivelEmoji = '🟡'; }
  else if (pct >= 60) { nivel = 'Requiere mejora';  nivelClass = 'mejora';        nivelEmoji = '🟠'; }
  else                { nivel = 'Deficiente';        nivelClass = 'deficiente';    nivelEmoji = '🔴'; }

  return { obtenido, posible, pct, reprobado, nivel, nivelClass, nivelEmoji };
}
