'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/services/auth';
import { useSesion } from '@/contexts/AppContext';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const { setSesion }           = useSesion();
  const router                  = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.ok || !result.sesion) {
      setError(result.error ?? 'Error al iniciar sesión');
      return;
    }

    setSesion({ ...result.sesion, savedAt: Date.now() });
    router.replace(result.sesion.rol === 'Admin' ? '/admin' : '/welcome');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-white text-3xl font-bold">A</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Ausitoria</h1>
        <p className="text-gray-500 text-sm mt-1">Sistema de Auditorías SushiPop</p>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
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
          className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold text-base
                     disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
