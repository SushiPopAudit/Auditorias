'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSesion } from '@/contexts/AppContext';
import clsx from 'clsx';

const NAV_AUDITOR = [
  { href: '/welcome',           icon: '🏠', label: 'Inicio' },
  { href: '/auditoria/setup',   icon: '📋', label: 'Auditoría' },
  { href: '/historial',         icon: '📜', label: 'Historial' },
  { href: '/dashboard',         icon: '📊', label: 'Reportes' },
  { href: '/calendario',        icon: '📅', label: 'Agenda' },
];

const NAV_ADMIN = [
  { href: '/admin',             icon: '⚙️', label: 'Admin' },
  { href: '/historial',         icon: '📜', label: 'Historial' },
  { href: '/dashboard',         icon: '📊', label: 'Reportes' },
];

export default function BottomNav() {
  const { sesion } = useSesion();
  const pathname   = usePathname();
  if (!sesion) return null;

  const items = sesion.rol === 'Admin' ? NAV_ADMIN : NAV_AUDITOR;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200
                    flex items-stretch safe-area-bottom z-50">
      {items.map(item => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5',
              active ? 'text-red-600' : 'text-gray-500'
            )}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className={clsx('font-medium', active && 'font-semibold')}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
