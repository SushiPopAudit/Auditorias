'use client';
import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSesion } from '@/contexts/AppContext';
import { cambiarPassword } from '@/services/auth';

function CambiarPasswordContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const esPrimer     = searchParams.get('primer') === '1';
  const { sesion, setSesion } = useSesion();

  const [actual,   setActual]   = useState('');
  const [nueva,    setNueva]    = useState('');
  const [repite,   setRepite]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [exitoso,  setExitoso]  = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (nueva !== repite) { setError('Las contraseñas nuevas no coinciden.'); return; }
    if (nueva.length < 6)  { setError('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
    if (!sesion)           { setError('Sesión no encontrada. Volvé a iniciar sesión.'); return; }
    setLoading(true);
    const res = await cambiarPassword(sesion.email, actual, nueva);
    setLoading(false);
    if (!res.ok) { setError(res.error ?? 'Error al cambiar contraseña.'); return; }
    if (res.nuevoToken) {
      setSesion({ ...sesion, token: res.nuevoToken, primerLogin: false });
    }
    setExitoso(true);
  };

  if (exitoso) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <span className="text-4xl">✅</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Contraseña actualizada</h1>
        <p className="text-gray-500 text-sm mb-8">Tu contraseña fue cambiada correctamente.</p>
        <button
          onClick={() => router.replace('/welcome')}
          className="w-full max-w-xs bg-red-600 text-white py-3.5 rounded-xl font-semibold active:scale-95 transition-transform"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        {!esPrimer && (
          <button onClick={() => router.back()} className="text-red-600 text-sm mb-4 block">
            ← Volver
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {esPrimer ? 'Creá tu contraseña' : 'Cambiar contraseña'}
        </h1>
        {esPrimer && (
          <p className="text-sm text-gray-500 mb-2">
            Es tu primer ingreso. Definí una contraseña personal.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {esPrimer ? 'Contraseña temporal (te la enviamos por email)' : 'Contraseña actual'}
            </label>
            <input
              type="password"
              value={actual}
              onChange={e => setActual(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={nueva}
              onChange={e => setNueva(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Repetir nueva contraseña
            </label>
            <input
              type="password"
              value={repite}
              onChange={e => setRepite(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold text-base disabled:opacity-50 active:scale-95 transition-transform"
          >
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CambiarPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CambiarPasswordContent />
    </Suspense>
  );
}
