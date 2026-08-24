'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSesion } from '@/contexts/AppContext';

interface Props {
  children: React.ReactNode;
  requiredRol?: 'Admin' | 'Auditor';
}

export default function AuthGuard({ children, requiredRol }: Props) {
  const { sesion, sessionLoading } = useSesion();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (sessionLoading) return;
    if (!sesion) { router.replace('/login'); return; }
    if (sesion.primerLogin && pathname !== '/cambiar-password') {
      router.replace('/cambiar-password?primer=1');
      return;
    }
    if (requiredRol && sesion.rol !== requiredRol) router.replace('/welcome');
  }, [sesion, sessionLoading, requiredRol, router, pathname]);

  if (sessionLoading || !sesion) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
