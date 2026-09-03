'use client';
import { useState, useEffect } from 'react';
import { useSesion, useCache } from '@/contexts/AppContext';
import { getUsuariosBasico, type UsuarioBasico } from '@/services/calendario';
import { getAdmins, enviarConsulta, type ConsultaInput } from '@/services/consultas';
import type { Pregunta } from '@/types';

interface Props {
  pregunta: Pregunta;
  local:    string;
  onCerrar: () => void;
}

export default function ModalConsulta({ pregunta, local, onCerrar }: Props) {
  const { sesion } = useSesion();
  const { leer, guardar } = useCache();

  const [admins,      setAdmins]      = useState<UsuarioBasico[]>([]);
  const [cargando,    setCargando]    = useState(true);
  const [destinatario, setDestinatario] = useState('');
  const [comentario,  setComentario]  = useState('');
  const [enviando,    setEnviando]    = useState(false);
  const [mensaje,     setMensaje]     = useState('');

  useEffect(() => {
    if (!sesion) return;
    const cacheado = leer<UsuarioBasico[]>('usuarios');
    if (cacheado.data) {
      const filtrados = cacheado.data.filter(
        u => u.rol === 'Admin' && u.email.toLowerCase() !== sesion.email.toLowerCase(),
      );
      setAdmins(filtrados);
      if (filtrados.length) setDestinatario(filtrados[0].email);
      setCargando(false);
      return;
    }
    getUsuariosBasico(sesion)
      .then(todos => {
        guardar('usuarios', todos);
        const filtrados = todos.filter(
          u => u.rol === 'Admin' && u.email.toLowerCase() !== sesion.email.toLowerCase(),
        );
        setAdmins(filtrados);
        if (filtrados.length) setDestinatario(filtrados[0].email);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion]);

  useEffect(() => {
    if (!mensaje.startsWith('✓')) return;
    const t = setTimeout(onCerrar, 2000);
    return () => clearTimeout(t);
  }, [mensaje, onCerrar]);

  async function enviar() {
    if (!sesion) return;
    if (!destinatario) { setMensaje('✕ Seleccioná un destinatario.'); return; }
    if (!comentario.trim()) { setMensaje('✕ Escribí un comentario.'); return; }

    setEnviando(true);
    setMensaje('');
    const input: ConsultaInput = {
      destinatario,
      control:      pregunta.control,
      categoria:    pregunta.categoria,
      subcategoria: pregunta.subcategoria,
      importancia:  pregunta.importancia,
      pregunta:     pregunta.pregunta,
      explicacion:  pregunta.explicacion,
      local,
      comentario:   comentario.trim(),
    };
    const res = await enviarConsulta(sesion, input);
    setEnviando(false);
    if (res.ok) {
      const admin = admins.find(a => a.email === destinatario);
      setMensaje(`✓ Consulta enviada a ${admin?.nombre ?? destinatario}`);
    } else {
      setMensaje(`✕ ${res.error}`);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto p-5 pb-10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-bold text-gray-900">Consultar sobre control</h3>
          <button onClick={onCerrar} aria-label="Cerrar"
            className="text-2xl leading-none text-gray-400 flex-shrink-0">×</button>
        </div>

        {/* Control consultado */}
        <div className="bg-gray-50 border-l-4 border-red-400 rounded-r-xl px-3 py-2.5 mb-4">
          <p className="text-sm font-semibold text-gray-900">{pregunta.control}</p>
          {(pregunta.categoria || pregunta.subcategoria) && (
            <p className="text-xs text-gray-500 mt-0.5">
              {[pregunta.categoria, pregunta.subcategoria].filter(Boolean).join(' › ')}
            </p>
          )}
        </div>

        {cargando && (
          <p className="text-sm text-gray-400 mb-4">Cargando destinatarios...</p>
        )}

        {!cargando && admins.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-amber-800">No hay administradores disponibles para recibir la consulta.</p>
          </div>
        )}

        {!cargando && admins.length > 0 && (
          <>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Destinatario</label>
              <select
                value={destinatario}
                onChange={e => setDestinatario(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              >
                {admins.map(a => (
                  <option key={a.email} value={a.email}>{a.nombre} ({a.email})</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Comentario</label>
              <textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                rows={4}
                placeholder="Describí tu duda o la situación que querés consultar..."
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none"
              />
            </div>

            <button
              onClick={enviar}
              disabled={enviando}
              className="w-full py-3 bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {enviando ? 'Enviando...' : 'Enviar consulta'}
            </button>
          </>
        )}

        {mensaje && (
          <p className={`text-sm mt-4 p-3 rounded-xl ${
            mensaje.startsWith('✓')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
