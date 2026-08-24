'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login, recuperarPassword } from '@/services/auth';
import { useSesion } from '@/contexts/AppContext';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [emailRec, setEmailRec] = useState('');
  const [msgRec, setMsgRec]     = useState('');
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

    const sesion = { ...result.sesion, savedAt: Date.now() };
    setSesion(sesion);
    if (sesion.primerLogin) {
      router.replace('/cambiar-password?primer=1');
    } else {
      router.replace(result.sesion.rol === 'Admin' ? '/admin' : '/welcome');
    }
  };

  const handleRecuperar = async (e: FormEvent) => {
    e.preventDefault();
    setMsgRec('');
    setLoading(true);
    const res = await recuperarPassword(emailRec);
    setLoading(false);
    if (res.ok) {
      setMsgRec('Te enviamos un email con tu nueva contraseña temporal.');
    } else {
      setMsgRec(res.error ?? 'Error al recuperar contraseña.');
    }
  };

  const logoHeader = (
    <div className="mb-8 text-center">
      <div className="flex justify-center mb-4">
        <img
          src="/logo.png"
          alt="SushiPop"
          className="h-20 w-auto object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <h1 className="text-2xl font-bold text-gray-900">Sistema de Auditorías</h1>
      <p className="text-gray-500 text-sm mt-1">SushiPop</p>
    </div>
  );

  if (mostrarRecuperar) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
        {logoHeader}
        <form onSubmit={handleRecuperar} className="w-full max-w-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Recuperar contraseña</h2>
          <p className="text-sm text-gray-500">
            Ingresá tu email y te enviaremos una contraseña temporal.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={emailRec}
              onChange={e => setEmailRec(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="tu@email.com"
            />
          </div>
          {msgRec && (
            <div className={`px-4 py-3 rounded-xl text-sm border ${
              msgRec.includes('enviamos')
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {msgRec}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold text-base disabled:opacity-50 active:scale-95 transition-transform"
          >
            {loading ? 'Enviando...' : 'Enviar instrucciones'}
          </button>
          <button
            type="button"
            onClick={() => { setMostrarRecuperar(false); setMsgRec(''); }}
            className="w-full text-center text-sm text-gray-400 py-2"
          >
            ← Volver al inicio de sesión
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      {logoHeader}

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

        <button
          type="button"
          onClick={() => { setMostrarRecuperar(true); setError(''); }}
          className="w-full text-center text-sm text-gray-400 py-2"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </div>
  );
}
