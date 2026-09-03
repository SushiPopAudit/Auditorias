'use client';
import { useState } from 'react';
import clsx from 'clsx';
import { reenviarInforme } from '@/services/historial';

interface Props {
  auditId:      string;
  local:        string;
  fecha:        string;
  /** Emails configurados del local, separados por coma. Vacío si no tiene */
  emailsLocal:  string;
  onCerrar:     () => void;
}

export default function ModalReenvio({ auditId, local, fecha, emailsLocal, onCerrar }: Props) {
  const [otro, setOtro]         = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje]   = useState('');

  async function enviar(destino: string) {
    if (!destino.trim()) { setMensaje('✕ Ingresá al menos un mail.'); return; }
    setEnviando(true); setMensaje('');
    const res = await reenviarInforme(auditId, destino.trim());
    setEnviando(false);
    setMensaje(res.ok ? `✓ ${res.mensaje}` : `✕ ${res.error}`);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto p-5 pb-10">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="font-bold text-gray-900">✉️ Reenviar informe</h3>
          <button onClick={onCerrar} aria-label="Cerrar"
            className="text-2xl leading-none text-gray-400 flex-shrink-0">×</button>
        </div>
        <p className="text-sm text-gray-400 mb-4">{local} · {fecha}</p>

        {emailsLocal ? (
          <>
            <button
              onClick={() => enviar(emailsLocal)}
              disabled={enviando}
              className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              Enviar al local
            </button>
            <p className="text-xs text-gray-400 mt-1.5 mb-4 break-all">{emailsLocal}</p>
          </>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-amber-800">
              Este local no tiene emails configurados. Podés enviarlo a otra dirección.
            </p>
          </div>
        )}

        <div className="border-t border-gray-200 pt-4">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Enviar a otro mail</label>
          <input
            type="email"
            value={otro}
            onChange={e => setOtro(e.target.value)}
            placeholder="nombre@empresa.com"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
          />
          <p className="text-xs text-gray-400 mt-1 mb-3">Podés poner varios separados por coma.</p>
          <button
            onClick={() => enviar(otro)}
            disabled={enviando}
            className="w-full py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 disabled:opacity-50"
          >
            {enviando ? 'Enviando...' : 'Enviar a ese mail'}
          </button>
        </div>

        {mensaje && (
          <p className={clsx(
            'text-sm mt-4 p-3 rounded-xl',
            mensaje.startsWith('✓')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50   text-red-700   border border-red-200',
          )}>
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
