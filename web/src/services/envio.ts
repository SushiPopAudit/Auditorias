/**
 * envio.ts — Envío de auditoría completa al Apps Script
 * Replica el doPost del prototipo. Sin fotos en esta fase (Fase 4).
 */
import type { Auditoria, Pregunta } from '@/types';

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL!;

export interface EnvioResult {
  ok:     boolean;
  error?: string;
  pct?:   number;
  nivel?: string;
}

function horaActual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/**
 * Envía la auditoría al Apps Script y retorna el resultado.
 * El Apps Script escribe una fila por respuesta en el Sheet Resultados.
 */
export async function enviarAuditoria(
  auditoria: Auditoria,
  preguntasMap: Record<string, Pregunta>,
): Promise<EnvioResult> {
  const hora = horaActual();

  const respuestas = auditoria.respuestas.map(r => {
    const p = preguntasMap[r.preguntaId] ?? {} as Pregunta;
    return {
      control:      p.control      ?? r.control ?? '',
      categoria:    p.categoria    ?? '',
      subcategoria: p.subcategoria ?? '',
      importancia:  p.importancia  ?? '',
      explicacion:  p.explicacion  ?? '',
      respuesta:    r.respuesta    ?? '',
      observacion:  r.observacion  ?? '',
      fotoBase64:   '',            // Fase 4
      fotoNombre:   '',
      rawValor:     r.rawValor     ?? '',
    };
  });

  const payload = {
    auditId:      auditoria.id,
    local:        auditoria.localNombre,
    fecha:        auditoria.fecha,
    hora,
    auditor:      auditoria.auditor,
    auditorEmail: auditoria.auditorEmail,
    marca:        auditoria.marca,
    tipo:         auditoria.tipo,
    acompanante:  auditoria.acompanante ?? '',
    respuestas,
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method:  'POST',
      // Apps Script requiere text/plain para evitar preflight CORS
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
      redirect: 'follow',
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${txt}` };
    }

    const json = await res.json().catch(() => ({ status: 'ok' }));
    if (json.status === 'error') return { ok: false, error: json.message ?? 'Error del servidor' };

    return { ok: true, pct: json.pct, nivel: json.nivel };
  } catch (e) {
    return { ok: false, error: `Sin conexión: ${String(e)}` };
  }
}
