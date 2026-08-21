'use client';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import AuthGuard from '@/components/AuthGuard';

function ExitoContent() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center pb-24">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <span className="text-5xl">✅</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        ¡Auditoría enviada!
      </h1>
      <p className="text-gray-500 mb-8 max-w-xs">
        Los resultados fueron guardados correctamente en el sistema.
      </p>

      <div className="w-full max-w-xs space-y-3">
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
