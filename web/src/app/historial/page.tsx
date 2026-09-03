'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion, useCache, useApp } from '@/contexts/AppContext';
import { getAuditorias, borrarAuditoria, type AuditoriaResumen } from '@/services/historial';
import ModalReenvio from '@/components/historial/ModalReenvio';
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
  const { leer, guardar, limpiar } = useCache();
  const { state } = useApp();
  const router = useRouter();

  const cacheado = leer<AuditoriaResumen[]>('historial');

  const [lista, setLista]             = useState<AuditoriaResumen[]>(cacheado.data ?? []);
  const [cargando, setCargando]       = useState(!cacheado.data);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError]             = useState('');
  const [busqueda, setBusqueda]       = useState('');
  const [filtro, setFiltro]           = useState<string>('Todos');
  const [mensaje, setMensaje]         = useState('');

  const esAdmin = sesion?.rol === 'Admin';

  const [reenvio, setReenvio] = useState<AuditoriaResumen | null>(null);

  const emailsDe = (nombreLocal: string) =>
    state.locales.find(l => l.nombre === nombreLocal)?.emails ?? '';

  const cargar = useCallback(async (forzado = false) => {
    if (!sesion) return;
    if (forzado || !lista.length) setCargando(true); else setRefrescando(true);
    setError('');
    try {
      const datos = await getAuditorias(sesion);
      setLista(datos);
      guardar('historial', datos);
    } catch (e) {
      if (!lista.length) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false); setRefrescando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion]);

  useEffect(() => {
    if (!cacheado.fresco) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion]);

  async function handleBorrar(a: AuditoriaResumen) {
    const ok = confirm(
      `¿Borrar la auditoría de ${a.local} del ${a.fecha}?\n\n` +
      `Se eliminarán todas las respuestas y las fotos de Drive. No se puede deshacer.`
    );
    if (!ok) return;
    const res = await borrarAuditoria(a.auditId);
    if (!res.ok) { alert(`No se pudo borrar: ${res.error}`); return; }
    limpiar(['historial', 'dashboard']);
    setLista(prev => prev.filter(x => x.auditId !== a.auditId));
    setMensaje(`Auditoría de ${a.local} eliminada.`);
    setTimeout(() => setMensaje(''), 3500);
  }

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
          <button onClick={() => cargar(true)} disabled={cargando || refrescando}
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

      {refrescando && (
        <p className="text-xs text-gray-400 px-4 pt-2">Actualizando...</p>
      )}

      {mensaje && (
        <div className="mx-4 mt-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm text-green-800 font-medium">{mensaje}</p>
        </div>
      )}

      {cargando && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudo cargar el historial</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <button onClick={() => cargar(true)}
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
            <div key={a.auditId} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => router.push(`/historial/${encodeURIComponent(a.auditId)}`)}
                className="w-full p-4 text-left active:bg-gray-50 flex items-center gap-3"
              >
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

              <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                <button
                  onClick={e => { e.stopPropagation(); setReenvio(a); }}
                  title="Reenviar informe por mail"
                  className="flex-1 py-2.5 text-xs font-medium text-gray-600"
                >
                  ✉️ Reenviar
                </button>
                <button
                  onClick={() => router.push(`/historial/${encodeURIComponent(a.auditId)}`)}
                  className="flex-1 py-2.5 text-xs font-medium text-gray-600"
                >
                  👁 Ver
                </button>
                <button
                  onClick={() => router.push(`/historial/${encodeURIComponent(a.auditId)}/editar`)}
                  className="flex-1 py-2.5 text-xs font-medium text-blue-600"
                >
                  ✏️ Editar
                </button>
                {esAdmin && (
                  <button
                    onClick={() => handleBorrar(a)}
                    className="flex-1 py-2.5 text-xs font-medium text-red-600"
                  >
                    🗑 Borrar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!cargando && !error && lista.length > 0 && filtradas.length === 0 && (
        <p className="text-center text-gray-400 text-sm mt-8 px-6">
          Sin resultados para los filtros aplicados.
        </p>
      )}

      {reenvio && (
        <ModalReenvio
          auditId={reenvio.auditId}
          local={reenvio.local}
          fecha={reenvio.fecha}
          emailsLocal={emailsDe(reenvio.local)}
          onCerrar={() => setReenvio(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}

export default function HistorialPage() {
  return <AuthGuard><HistorialContent /></AuthGuard>;
}
