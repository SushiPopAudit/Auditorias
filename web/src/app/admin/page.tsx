'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion } from '@/contexts/AppContext';
import { useRouter } from 'next/navigation';

function AdminContent() {
  const { sesion } = useSesion();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <h1 className="text-xl font-bold text-gray-900">Panel Admin</h1>
        <p className="text-sm text-gray-400 mt-0.5">{sesion?.nombre}</p>
      </div>

      <div className="px-4 py-6 space-y-3">
        <button
          onClick={() => router.push('/auditoria/setup')}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100 text-left active:bg-gray-50"
        >
          <span className="text-3xl">📋</span>
          <div>
            <p className="font-semibold text-gray-900">Nueva Auditoría</p>
            <p className="text-xs text-gray-400">Iniciar una auditoría a un local</p>
          </div>
        </button>

        <button
          onClick={() => router.push('/historial')}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100 text-left active:bg-gray-50"
        >
          <span className="text-3xl">📜</span>
          <div>
            <p className="font-semibold text-gray-900">Historial</p>
            <p className="text-xs text-gray-400">Ver todas las auditorías realizadas</p>
          </div>
        </button>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100 text-left active:bg-gray-50"
        >
          <span className="text-3xl">📊</span>
          <div>
            <p className="font-semibold text-gray-900">Reportes</p>
            <p className="text-xs text-gray-400">Dashboard de scores — Próximamente</p>
          </div>
        </button>

        <div className="pt-2">
          <p className="text-xs text-gray-400 font-medium px-1 mb-2">PRÓXIMAMENTE — FASE 5</p>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-dashed border-gray-200 opacity-60">
            <p className="text-sm text-gray-500">👥 Gestión de usuarios</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-dashed border-gray-200 opacity-60 mt-2">
            <p className="text-sm text-gray-500">🏪 Gestión de locales</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-dashed border-gray-200 opacity-60 mt-2">
            <p className="text-sm text-gray-500">📅 Calendario de visitas</p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

export default function AdminPage() {
  return <AuthGuard requiredRol="Admin"><AdminContent /></AuthGuard>;
}
