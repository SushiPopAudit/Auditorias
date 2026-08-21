'use client';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pb-24 text-center px-6">
        <span className="text-5xl mb-4">📊</span>
        <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-400 text-sm mt-2">Próximamente — Fase 4</p>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
