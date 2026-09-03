'use client';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import clsx from 'clsx';

const SECCIONES = [
  { href: '/admin/usuarios',      icon: '👥', titulo: 'Usuarios',      desc: 'Altas, bajas, roles y locales asignados' },
  { href: '/admin/locales',       icon: '🏪', titulo: 'Locales',       desc: 'Nombres, marca y emails de destino' },
  { href: '/admin/viaticos',      icon: '💰', titulo: 'Viáticos',      desc: 'Asignar montos y revisar gastos' },
  { href: '/admin/preguntas',     icon: '📝', titulo: 'Preguntas',     desc: 'Próximamente' },
  { href: '/admin/configuracion', icon: '⚙️', titulo: 'Configuración', desc: 'Umbral de críticos y recálculo' },
];

function AdminContent() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.push('/welcome')} className="text-blue-600 text-sm mb-2">
          ← Inicio
        </button>
        <h1 className="text-xl font-bold text-gray-900">Administración</h1>
        <p className="text-sm text-gray-400">Gestión de la aplicación</p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {SECCIONES.map(s => {
          const disabled = s.href === '/admin/preguntas';
          return (
            <button
              key={s.href}
              onClick={() => !disabled && router.push(s.href)}
              disabled={disabled}
              className={clsx(
                'w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border text-left',
                disabled
                  ? 'border-gray-100 opacity-40 cursor-not-allowed'
                  : 'border-gray-100 active:bg-gray-50',
              )}
            >
              <span className="text-3xl">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{s.titulo}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
              </div>
              {!disabled && <span className="text-gray-300 text-lg">›</span>}
            </button>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}

export default function AdminPage() {
  return <AuthGuard requiredRol="Admin"><AdminContent /></AuthGuard>;
}
