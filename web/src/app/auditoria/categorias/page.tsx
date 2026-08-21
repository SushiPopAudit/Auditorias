'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp } from '@/contexts/AppContext';
import { calcularPuntaje } from '@/services/scoring';
import clsx from 'clsx';

function CategoriasContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { auditoria } = state;

  useEffect(() => {
    if (!auditoria.local) router.replace('/auditoria/setup');
  }, [auditoria.local, router]);

  if (!auditoria.local) return null;

  const elegirCategoria = (ci: number) => {
    const cat = auditoria.categorias[ci];
    const firstPending = cat.questions.findIndex(q => !auditoria.answers[q.id]?.respuesta);
    const startQ = firstPending !== -1 ? firstPending : 0;
    dispatch({ type: 'AUDIT_SET_CAMPO', payload: { catIndex: ci, qIndex: startQ } });
    router.push('/auditoria/pregunta');
  };

  const todasPreguntas  = auditoria.categorias.flatMap(c => c.questions);
  const totalPreguntas  = todasPreguntas.length;
  const respondidas     = todasPreguntas.filter(q => auditoria.answers[q.id]?.respuesta).length;
  const pendientes      = totalPreguntas - respondidas;
  const allComplete     = pendientes === 0 && totalPreguntas > 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="text-red-600 text-sm mb-2">
          ← Cambiar local
        </button>
        <h1 className="text-xl font-bold text-gray-900">{auditoria.local.nombre}</h1>
        <p className="text-gray-400 text-sm">
          {auditoria.local.isCausa ? 'Causa' : 'SushiPop'} · {auditoria.fecha}
        </p>
      </div>

      {/* Contador de pendientes */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Categorías</p>
        <p className={clsx('text-xs font-medium', allComplete ? 'text-green-600' : 'text-gray-400')}>
          {respondidas}/{totalPreguntas} preguntas
          {pendientes > 0 && ` · ${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`}
        </p>
      </div>

      <ul className="divide-y divide-gray-100 bg-white mx-4 rounded-2xl overflow-hidden shadow-sm">
        {auditoria.categorias.map((cat, idx) => {
          const resp    = cat.questions.filter(q => auditoria.answers[q.id]?.respuesta).length;
          const total   = cat.questions.length;
          const completa = resp === total;

          return (
            <li key={cat.name}>
              <button
                onClick={() => elegirCategoria(idx)}
                className="w-full text-left px-4 py-4 flex items-center justify-between active:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{cat.name}</p>
                    {completa && <span className="text-green-500 text-sm">✓</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{resp}/{total} preguntas</p>
                  <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden w-32">
                    <div
                      className={clsx('h-full rounded-full transition-all', completa ? 'bg-green-500' : 'bg-red-500')}
                      style={{ width: `${total > 0 ? (resp / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <span className="text-gray-300 text-xl ml-3">›</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Score parcial + gate de acceso al resumen */}
      {(() => {
        if (respondidas === 0) return null;
        const puntaje = calcularPuntaje(todasPreguntas, auditoria.answers);
        return (
          <div className="mx-4 mt-4 space-y-3">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Progreso general</p>
                  <p className="text-2xl font-bold text-gray-900">{puntaje.pct}%</p>
                  <p className="text-xs text-gray-400">{respondidas}/{totalPreguntas} preguntas</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl">{puntaje.nivelEmoji}</span>
                  <p className={clsx('text-sm font-semibold mt-0.5',
                    puntaje.reprobado ? 'text-red-600' : 'text-gray-700'
                  )}>{puntaje.nivel}</p>
                </div>
              </div>
            </div>

            {allComplete ? (
              <button
                onClick={() => router.push('/auditoria/resumen')}
                className="w-full py-3.5 bg-green-600 text-white rounded-xl font-semibold"
              >
                Ver Resumen →
              </button>
            ) : (
              <div className="w-full py-3.5 bg-gray-100 text-gray-400 rounded-xl text-center text-sm font-medium">
                Completá todas las categorías para continuar
              </div>
            )}
          </div>
        );
      })()}

      <BottomNav />
    </div>
  );
}

export default function CategoriasPage() {
  return <AuthGuard><CategoriasContent /></AuthGuard>;
}
