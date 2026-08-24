'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import AuthGuard from '@/components/AuthGuard';
import type { DesvioRepetido } from '@/services/envio';

function ExitoContent() {
  const router = useRouter();
  const [emailStatus,       setEmailStatus]       = useState<string | null>(null);
  const [desviosRepetidos,  setDesviosRepetidos]  = useState<DesvioRepetido[]>([]);

  useEffect(() => {
    const status = sessionStorage.getItem('audit_emailStatus');
    if (status) {
      setEmailStatus(status);
      sessionStorage.removeItem('audit_emailStatus');
    }
    const desviosRaw = sessionStorage.getItem('audit_desvios');
    if (desviosRaw) {
      try { setDesviosRepetidos(JSON.parse(desviosRaw)); } catch {}
      sessionStorage.removeItem('audit_desvios');
    }
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center pb-24">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <span className="text-5xl">✅</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        ¡Auditoría enviada!
      </h1>
      <p className="text-gray-500 mb-2 max-w-xs">
        Los resultados fueron guardados correctamente en el sistema.
      </p>

      {emailStatus && (
        <p className="text-xs text-gray-400 mt-2">
          {emailStatus.startsWith('enviado')
            ? `✉️ Email ${emailStatus}`
            : emailStatus === 'no configurado'
              ? '⚠️ El local no tiene emails configurados'
              : `⚠️ ${emailStatus}`}
        </p>
      )}

      {desviosRepetidos.length > 0 && (
        <div className="w-full max-w-xs mt-6 text-left bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="font-semibold text-orange-900 text-sm mb-2">
            🔁 Desvíos reiterados ({desviosRepetidos.length})
          </p>
          <p className="text-xs text-orange-700 mb-3">
            Estos controles registraron incumplimiento en auditorías recientes:
          </p>
          <ul className="space-y-2">
            {desviosRepetidos.map((d, i) => (
              <li key={i} className="text-xs">
                <span className="font-semibold text-orange-900">{d.control}</span>
                {d.categoria && <span className="text-orange-600"> · {d.categoria}</span>}
                <span className="ml-1 text-orange-500">({d.veces} veces)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="w-full max-w-xs space-y-3 mt-8">
        <button
          onClick={() => router.replace('/welcome')}
          className="w-full bg-red-600 text-white py-3.5 rounded-xl font-semibold active:scale-95 transition-transform"
        >
          Volver al inicio
        </button>
        <button
          onClick={() => router.replace('/auditoria/setup')}
          className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-semibold active:scale-95 transition-transform"
        >
          Nueva Auditoría
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function ExitoPage() {
  return <AuthGuard><ExitoContent /></AuthGuard>;
}
