'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp, useSesion, useCache } from '@/contexts/AppContext';
import { getConfig, saveConfig, recalcularBatch } from '@/services/admin';
import clsx from 'clsx';

function ConfiguracionContent() {
  const { dispatch } = useApp();
  const { sesion } = useSesion();
  const { limpiar } = useCache();
  const router = useRouter();

  const [umbral,       setUmbral]       = useState('10');
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState('');
  const [guardando,    setGuardando]    = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [mensaje,      setMensaje]      = useState<{ texto: string; ok: boolean } | null>(null);

  function mostrarMensaje(texto: string, ok: boolean) {
    setMensaje({ texto, ok });
    setTimeout(() => setMensaje(null), 5000);
  }

  const cargar = useCallback(async () => {
    if (!sesion) return;
    setCargando(true);
    setError('');
    try {
      const cfg = await getConfig(sesion);
      setUmbral(String(cfg.umbral));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [sesion]);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarUmbral() {
    if (!sesion || guardando) return;
    const val = parseFloat(umbral);
    if (isNaN(val) || val < 1 || val > 100) {
      mostrarMensaje('El umbral debe ser un número entre 1 y 100.', false);
      return;
    }
    setGuardando(true);
    const res = await saveConfig(sesion, 'umbral_criticos_pct', String(val));
    setGuardando(false);

    if (!res.ok) { mostrarMensaje(res.error ?? 'Error al guardar.', false); return; }

    dispatch({ type: 'SET_UMBRAL', payload: val });
    limpiar(['dashboard', 'historial']);
    mostrarMensaje('✓ Umbral guardado. Recalculá los puntajes para aplicarlo a las auditorías ya cargadas.', true);
  }

  async function handleRecalcular() {
    if (!sesion || recalculando) return;
    if (!confirm(
      '¿Recalcular el puntaje de todas las auditorías?\n\nEste proceso puede tardar varios minutos. No cierres la app.'
    )) return;

    setRecalculando(true);
    const res = await recalcularBatch(sesion);
    setRecalculando(false);

    if (!res.ok) { mostrarMensaje(res.error ?? 'Error al recalcular.', false); return; }

    limpiar(['historial', 'dashboard']);
    mostrarMensaje(
      `✓ Recálculo completado. ${res.cantidad ?? 0} auditoría${res.cantidad !== 1 ? 's' : ''} actualizada${res.cantidad !== 1 ? 's' : ''}.`,
      true,
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.push('/admin')} className="text-blue-600 text-sm mb-2">← Admin</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
            <p className="text-sm text-gray-400">Parámetros globales</p>
          </div>
          <button onClick={() => cargar()}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl text-gray-600">
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={clsx('mx-4 mt-4 p-3 rounded-xl text-sm font-medium',
          mensaje.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200')}>
          {mensaje.texto}
        </div>
      )}

      {cargando && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudo cargar la configuración</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <button onClick={() => cargar()} className="mt-2 text-xs text-red-700 underline">Reintentar</button>
        </div>
      )}

      {!cargando && !error && (
        <div className="px-4 mt-4 space-y-4">
          {/* Umbral */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900">Umbral de críticos</h2>
            <p className="text-sm text-gray-500 mt-1">
              Porcentaje de controles críticos incumplidos a partir del cual una auditoría se marca como reprobada.
            </p>

            <div className="flex items-center gap-2 mt-4">
              <input
                type="number" min={1} max={100} step={1}
                value={umbral}
                onChange={e => setUmbral(e.target.value)}
                className="w-24 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>

            {umbral && !isNaN(parseFloat(umbral)) && (
              <p className="text-xs text-gray-400 mt-2">
                Con el valor actual, una auditoría con {umbral}% o más de sus críticos en &ldquo;No Cumple&rdquo; queda reprobada.
              </p>
            )}

            <button onClick={guardarUmbral} disabled={guardando}
              className="mt-3 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar umbral'}
            </button>
          </div>

          {/* Recalcular */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900">Recalcular puntajes</h2>
            <p className="text-sm text-gray-500 mt-1">
              Reprocesa el puntaje, el nivel y el estado de reprobado de todas las auditorías del historial.
              Usalo después de cambiar el umbral.
            </p>

            <button onClick={handleRecalcular} disabled={recalculando}
              className="mt-3 w-full py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 disabled:opacity-50">
              {recalculando ? 'Recalculando... no cierres la app' : '↻ Recalcular todas las auditorías'}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

export default function ConfiguracionPage() {
  return <AuthGuard requiredRol="Admin"><ConfiguracionContent /></AuthGuard>;
}
