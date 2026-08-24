'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp, useSesion } from '@/contexts/AppContext';
import { cargarBorrador, borrarBorrador, exportarBorradorTexto } from '@/lib/borrador';
import type { Borrador } from '@/lib/borrador';
import Link from 'next/link';

function WelcomeContent() {
  const { sesion, logout } = useSesion();
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  useEffect(() => {
    setBorrador(cargarBorrador());
  }, []);

  function continuarBorrador() {
    if (!borrador) return;
    dispatch({ type: 'AUDIT_RESTORE', payload: {
      local:         borrador.local,
      fecha:         borrador.fecha,
      tipo:          borrador.tipo,
      acompanante:   borrador.acompanante,
      posicionAcomp: borrador.posicionAcomp,
      auditId:       borrador.auditId,
      catIndex:      borrador.catIndex,
      qIndex:        borrador.qIndex,
      answers:       borrador.answers,
      skipped:       borrador.skipped ?? {},
    }});
    router.push('/auditoria/categorias');
  }

  function descartarBorrador() {
    if (!confirm('¿Descartar la auditoría guardada? Se perderán todas las respuestas.')) return;
    borrarBorrador();
    setBorrador(null);
  }

  function exportar() {
    if (!borrador) return;
    const texto = exportarBorradorTexto(borrador);
    if (navigator.share) {
      navigator.share({ title: 'Auditoría', text: texto }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(texto)
        .then(() => alert('Datos copiados al portapapeles'))
        .catch(() => alert(texto));
    }
  }

  // Supress unused variable warning
  void state;

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

      <div className="p-4 space-y-4">
        {/* Banner de borrador */}
        {borrador && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="font-semibold text-amber-900 text-sm">📝 Tenés una auditoría sin terminar</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {borrador.local.nombre} — {Object.values(borrador.answers).filter(a => a.respuesta).length} respuestas
              {' · '}{new Date(borrador.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
            {borrador.sinFotos && (
              <p className="text-xs text-amber-600 mt-1">⚠️ Las fotos no se pudieron guardar</p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={continuarBorrador}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">
                Continuar
              </button>
              <button onClick={exportar}
                className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm">
                Exportar
              </button>
              <button onClick={descartarBorrador}
                className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm">
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-3">
          {acciones.map(a => (
            <Link key={a.href} href={a.href}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:scale-95 transition-transform flex flex-col gap-2">
              <span className="text-3xl">{a.icon}</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{a.label}</p>
                <p className="text-gray-400 text-xs">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Acciones de cuenta */}
        <div className="flex gap-3">
          <Link href="/cambiar-password"
            className="flex-1 text-center text-sm text-gray-400 py-3 border border-gray-200 rounded-xl">
            🔑 Cambiar contraseña
          </Link>
          <button onClick={logout} className="flex-1 text-center text-sm text-gray-400 py-3 border border-gray-200 rounded-xl">
            Cerrar sesión
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

export default function WelcomePage() {
  return <AuthGuard><WelcomeContent /></AuthGuard>;
}
