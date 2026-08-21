'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp } from '@/contexts/AppContext';

function SetupContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');

  const localesFiltrados = state.locales.filter(l =>
    l.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const elegirLocal = (local: typeof state.locales[0]) => {
    dispatch({ type: 'AUDIT_SET_LOCAL', payload: local });
    router.push('/auditoria/categorias');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Elegir local</h1>
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar local..."
          className="w-full px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none"
        />
      </div>

      {state.dataLoading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {state.dataError && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {state.dataError}
        </div>
      )}

      <ul className="divide-y divide-gray-100 bg-white mx-4 mt-4 rounded-2xl overflow-hidden shadow-sm">
        {localesFiltrados.map(local => (
          <li key={local.nombre}>
            <button
              onClick={() => elegirLocal(local)}
              className="w-full text-left px-4 py-4 flex items-center justify-between
                         active:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-medium text-gray-900">{local.nombre}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {local.isCausa ? 'Causa' : 'SushiPop'}
                </p>
              </div>
              <span className="text-gray-300 text-xl">›</span>
            </button>
          </li>
        ))}
        {localesFiltrados.length === 0 && !state.dataLoading && (
          <li className="px-4 py-8 text-center text-gray-400 text-sm">
            No se encontraron locales
          </li>
        )}
      </ul>

      <BottomNav />
    </div>
  );
}

export default function SetupPage() {
  return <AuthGuard><SetupContent /></AuthGuard>;
}
