/**
 * consultas.ts — Consultas del auditor sobre un control puntual
 *
 * Se manda por POST porque el comentario puede ser largo.
 * Usa `no-cors` con timeout: Apps Script responde con un redirect a otro
 * dominio que el navegador no puede leer, y un fetch normal queda colgado.
 * Es el mismo criterio que se usó en la app vieja después de que el botón
 * se quedara en "Enviando..." para siempre.
 */
import type { Sesion } from '@/types';
import { getUsuariosBasico, type UsuarioBasico } from '@/services/calendario';

const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export interface ConsultaInput {
  destinatario: string;
  control:      string;
  categoria:    string;
  subcategoria: string;
  importancia:  string;
  pregunta:     string;
  explicacion:  string;
  local:        string;
  comentario:   string;
}

/** Los Admins, que son quienes reciben las consultas. Excluye al propio usuario. */
export async function getAdmins(s: Sesion): Promise<UsuarioBasico[]> {
  const todos = await getUsuariosBasico(s);
  return todos.filter(u => u.rol === 'Admin' && u.email.toLowerCase() !== s.email.toLowerCase());
}

export async function enviarConsulta(
  s: Sesion, c: ConsultaInput,
): Promise<{ ok: boolean; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    await fetch(URL, {
      method: 'POST',
      mode:   'no-cors',
      body: JSON.stringify({
        action: 'revisarPregunta',
        email:  s.email,
        token:  s.token,
        ...c,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return { ok: true };
  } catch (e) {
    clearTimeout(t);
    const abortado = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false,
      error: abortado
        ? 'La consulta tardó demasiado. Revisá tu conexión y probá de nuevo.'
        : 'No se pudo enviar. Revisá tu conexión.',
    };
  }
}
