'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSesion } from '@/contexts/AppContext';
import { getCalendario } from '@/services/calendario';
import clsx from 'clsx';

const NAV = [
  { href: '/welcome',         icon: '🏠', label: 'Inicio' },
  { href: '/auditoria/setup', icon: '📋', label: 'Auditoría' },
  { href: '/historial',       icon: '📜', label: 'Historial' },
  { href: '/dashboard',       icon: '📊', label: 'Reportes' },
  { href: '/calendario',      icon: '📅', label: 'Agenda' },
];

export default function BottomNav() {
  const { sesion } = useSesion();
  const pathname   = usePathname();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (!sesion) return;
    const hoy = new Date().toISOString().slice(0, 10);
    getCalendario(sesion).then(vs => {
      const n = vs.filter(v =>
        v.estado === 'Pendiente' &&
        v.fecha >= hoy &&
        v.auditorEmail.toLowerCase() === sesion.email.toLowerCase()
      ).length;
      setPendientes(n);
    }).catch(() => {});
  }, [sesion]);

  if (!sesion) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200
                    flex items-stretch safe-area-bottom z-50">
      {NAV.map(item => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const showBadge = item.href === '/calendario' && pendientes > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5',
              active ? 'text-red-600' : 'text-gray-500'
            )}
          >
            <span className="relative text-xl leading-none">
              {item.icon}
              {showBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {pendientes}
                </span>
              )}
            </span>
            <span className={clsx('font-medium', active && 'font-semibold')}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
