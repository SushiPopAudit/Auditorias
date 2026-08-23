'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion } from '@/contexts/AppContext';
import { getAuditorias, type AuditoriaResumen } from '@/services/historial';
import clsx from 'clsx';

function scoreStyle(pct: number, reprobado: boolean): string {
  if (reprobado)  return 'bg-red-100 text-red-800';
  if (pct >= 90)  return 'bg-green-100 text-green-800';
  if (pct >= 75)  return 'bg-yellow-100 text-yellow-800';
  if (pct >= 60)  return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-700';
}

const FILTROS = ['Todos', 'Oficial', 'Informal'] as const;

function HistorialContent() {
  const { sesion } = useSesion();
  const router = useRouter();

  const [lista, setLista]       = useState<AuditoriaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro]     = useState<string>('Todos');

  async function cargar() {
    if (!sesion) return;
    setCargando(true); setError('');
    try {
      setLista(await getAuditorias(sesion));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [sesion]);

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return lista.filter(a => {
      if (filtro !== 'Todos' && a.tipo !== filtro) return false;
      if (!q) return true;
      return a.local.toLowerCase().includes(q)
          || a.auditor.toLowerCase().includes(q)
          || a.fecha.toLowerCase().includes(q);
    });
  }, [lista, busqueda, filtro]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Historial</h1>
          <button onClick={cargar} disabled={cargando}
            className="text-sm text-red-600 font-medium disabled:text-gray-300">
            ↻ Actualizar
          </button>
        </div>

        <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por local, auditor o fecha..."
          className="w-full px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none" />

        <div className="flex gap-2 mt-3">
          {FILTROS.map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-semibold',
                filtro === f ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {cargando && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudo cargar el historial</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <button onClick={cargar}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !error && lista.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <span className="text-4xl mb-3">📋</span>
          <p className="text-gray-500 text-sm">Todavía no hay auditorías registradas.</p>
        </div>
      )}

      {!cargando && !error && filtradas.length > 0 && (
        <div className="px-4 py-4 space-y-2">
          {filtradas.map(a => (
            <button key={a.auditId}
              onClick={() => router.push(`/historial/${encodeURIComponent(a.auditId)}`)}
              className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:bg-gray-50 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 truncate">{a.local}</p>
                  {a.tipo === 'Informal' && (
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded flex-shrink-0">
                      Informal
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {a.fecha}{a.hora ? ` · ${a.hora}` : ''} · {a.auditor}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={clsx('inline-block px-2.5 py-1 rounded-full text-sm font-bold',
                  scoreStyle(a.pct, a.reprobado))}>
                  {a.reprobado ? '⛔' : `${a.pct}%`}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">{a.nivel}</p>
              </div>
              <span className="text-gray-300 text-xl flex-shrink-0">›</span>
            </button>
          ))}
        </div>
      )}

      {!cargando && !error && lista.length > 0 && filtradas.length === 0 && (
        <p className="text-center text-gray-400 text-sm mt-8 px-6">
          Sin resultados para los filtros aplicados.
        </p>
      )}

      <BottomNav />
    </div>
  );
}

export default function HistorialPage() {
  return <AuthGuard><HistorialContent /></AuthGuard>;
}
