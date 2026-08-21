'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSesion } from '@/contexts/AppContext';

export default function HomePage() {
  const { sesion, sessionLoading } = useSesion();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!sesion) { router.replace('/login'); return; }
    if (sesion.rol === 'Admin') { router.replace('/admin'); return; }
    router.replace('/welcome');
  }, [sesion, sessionLoading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
