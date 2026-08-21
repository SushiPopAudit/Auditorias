/**
 * envio.ts — POST de la auditoría al Apps Script
 *
 * PAYLOAD EXACTO que espera el backend (apps-script.gs doPost, sin `action`):
 *   auditId, fecha, hora, auditor, local, marca, auditorEmail,
 *   puntaje: { pct, nivel, reprobado },
 *   acompanante, posicionAcompanante, tipoAuditoria,
 *   emailsLocal  <-- SIN ESTE CAMPO NO SE ENVÍA EL EMAIL
 *   respuestas: [{ marca, categoria, subcategoria, control, importancia,
 *                  explicacion, respuesta, observacion, rawValor, fechaRaw,
 *                  headcount?, fotosBase64? }]
 */
import type { Pregunta, Puntaje, RespuestaItem } from '@/types';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export interface EnvioResult {
  ok:           boolean;
  auditId?:     string;
  emailStatus?: string;
  error?:       string;
}

export interface EnvioParams {
  auditId:             string;
  fecha:               string;
  auditor:             string;
  auditorEmail:        string;
  local:               string;
  emailsLocal:         string;
  marca:               string;
  tipoAuditoria:       string;
  acompanante:         string;
  posicionAcompanante: string;
  puntaje:             Puntaje;
  respuestas:          RespuestaItem[];
  preguntasMap:        Record<string, Pregunta>;
}

/** Verifica si una auditoría llegó al servidor. Reintenta hasta 4 veces cada 6s. */
export async function verificarEnvio(auditId: string, intentos = 4): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(`${URL}?action=verificarAudit&auditId=${encodeURIComponent(auditId)}`, { redirect: 'follow' });
      const data = await res.json();
      if (data.found) return true;
    } catch {
      // seguir intentando
    }
    if (i < intentos - 1) await new Promise(r => setTimeout(r, 6000));
  }
  return false;
}

export async function enviarAuditoria(p: EnvioParams): Promise<EnvioResult> {
  try {
    const ahora = new Date();
    const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    const respuestas = p.respuestas.map(r => {
      const q = p.preguntasMap[r.preguntaId];
      const item: Record<string, unknown> = {
        marca:        q?.marca        ?? p.marca,
        categoria:    q?.categoria    ?? '',
        subcategoria: q?.subcategoria ?? '',
        control:      q?.control      ?? r.control ?? '',
        importancia:  q?.importancia  ?? '',
        explicacion:  q?.explicacion  ?? '',
        respuesta:    r.respuesta     ?? '',
        observacion:  r.observacion   ?? '',
        rawValor:     r.rawValor      ?? '',
        fechaRaw:     r.fechaRaw      ?? '',
      };
      if (r.headcount && Object.keys(r.headcount).length) {
        item.headcount = r.headcount;
      }
      if (r.fotos && r.fotos.length) {
        item.fotosBase64 = r.fotos.map(f => ({ base64: f.dataURL, nombre: f.nombre }));
      }
      return item;
    });

    const payload = {
      auditId:             p.auditId,
      fecha:               p.fecha,
      hora,
      auditor:             p.auditor,
      auditorEmail:        p.auditorEmail,
      local:               p.local,
      emailsLocal:         p.emailsLocal,
      marca:               p.marca,
      tipoAuditoria:       p.tipoAuditoria || 'Oficial',
      acompanante:         p.acompanante || '',
      posicionAcompanante: p.posicionAcompanante || '',
      puntaje: {
        pct:       p.puntaje.pct,
        nivel:     p.puntaje.nivel,
        reprobado: p.puntaje.reprobado,
      },
      respuestas,
    };

    const res = await fetch(URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(payload),
      redirect: 'follow',
    });

    const data = await res.json();

    if (!data.success) {
      return { ok: false, error: String(data.error ?? 'Error al guardar') };
    }

    return {
      ok:          true,
      auditId:     String(data.auditId ?? p.auditId),
      emailStatus: String(data.email ?? 'no configurado'),
    };
  } catch (e) {
    return { ok: false, error: `Error de conexión: ${String(e)}` };
  }
}
