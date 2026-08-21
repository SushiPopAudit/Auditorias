'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion } from '@/contexts/AppContext';
import Link from 'next/link';

function WelcomeContent() {
  const { sesion, logout } = useSesion();

  const acciones = [
    { href: '/auditoria/setup', icon: '📋', label: 'Nueva Auditoría',  desc: 'Iniciar una inspección' },
    { href: '/historial',       icon: '📜', label: 'Mis Auditorías',   desc: 'Ver historial propio' },
    { href: '/dashboard',       icon: '📊', label: 'Reportes',         desc: 'Scores y tendencias' },
    { href: '/calendario',      icon: '📅', label: 'Agenda',           desc: 'Próximas visitas' },
    { href: '/gastos',          icon: '💳', label: 'Viáticos',         desc: 'Registrar gastos' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-red-600 text-white px-5 pt-12 pb-6">
        <img
          src="/logo.png"
          alt="SushiPop"
          className="h-10 w-auto object-contain mb-1"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <p className="text-red-200 text-sm mb-1">Bienvenido/a</p>
        <h1 className="text-2xl font-bold">{sesion?.nombre}</h1>
        <p className="text-red-200 text-xs mt-1 capitalize">{sesion?.rol}</p>
      </div>

      {/* Acciones */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {acciones.map(a => (
          <Link
            key={a.href}
            href={a.href}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100
                       active:scale-95 transition-transform flex flex-col gap-2"
          >
            <span className="text-3xl">{a.icon}</span>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{a.label}</p>
              <p className="text-gray-400 text-xs">{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Cerrar sesión */}
      <div className="px-4 mt-2">
        <button
          onClick={logout}
          className="w-full text-center text-sm text-gray-400 py-3"
        >
          Cerrar sesión
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function WelcomePage() {
  return <AuthGuard><WelcomeContent /></AuthGuard>;
}
