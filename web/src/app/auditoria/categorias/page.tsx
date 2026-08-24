'use client';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp } from '@/contexts/AppContext';
import { calcularPuntaje } from '@/services/scoring';
import { esRespuestaNegativa } from '@/services/validaciones';
import { borrarBorrador } from '@/lib/borrador';
import clsx from 'clsx';

function CategoriasContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { auditoria } = state;

  useEffect(() => {
    if (!auditoria.local) router.replace('/auditoria/setup');
  }, [auditoria.local, router]);

  if (!auditoria.local) return null;

  const elegirCategoria = (ci: number, soloSaltadas = false) => {
    const cat = auditoria.categorias[ci];
    let startQ = 0;
    if (soloSaltadas) {
      startQ = cat.questions.findIndex(q => auditoria.skipped[q.id]);
    } else {
      const firstPending = cat.questions.findIndex(
        q => !auditoria.answers[q.id]?.respuesta && !auditoria.skipped[q.id]
      );
      startQ = firstPending !== -1 ? firstPending : 0;
    }
    dispatch({ type: 'AUDIT_SET_CAMPO', payload: { catIndex: ci, qIndex: Math.max(0, startQ) } });
    router.push('/auditoria/pregunta');
  };

  const todasPreguntas = auditoria.categorias.flatMap(c => c.questions);
  const totalPreguntas = todasPreguntas.length;
  const respondidas    = todasPreguntas.filter(q => auditoria.answers[q.id]?.respuesta).length;
  const saltadas       = todasPreguntas.filter(q => auditoria.skipped[q.id]).length;
  const pendientes     = todasPreguntas.filter(q =>
    !auditoria.answers[q.id]?.respuesta && !auditoria.skipped[q.id]
  ).length;
  const allComplete    = pendientes === 0 && totalPreguntas > 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const incumplCount = useMemo(() =>
    Object.values(auditoria.answers).filter(a => esRespuestaNegativa(a.respuesta)).length,
    [auditoria.answers]);

  // Índice de la primera categoría con preguntas saltadas
  const primerCatConSaltadas = auditoria.categorias.findIndex(
    cat => cat.questions.some(q => auditoria.skipped[q.id])
  );

  function handleBorrar() {
    if (!confirm('¿Borrar la auditoría en curso? Se perderán todas las respuestas.')) return;
    borrarBorrador();
    dispatch({ type: 'AUDIT_RESET' });
    router.replace('/welcome');
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-1">
          <button onClick={() => router.back()} className="text-red-600 text-sm">← Cambiar local</button>
          <button onClick={handleBorrar}
            className="text-xs text-red-400 border border-red-200 rounded-lg px-2.5 py-1.5">
            🗑 Borrar auditoría
          </button>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{auditoria.local.nombre}</h1>
        <p className="text-gray-400 text-sm">{auditoria.local.isCausa ? 'Causa' : 'SushiPop'} · {auditoria.fecha}</p>
      </div>

      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Categorías</p>
        <p className={clsx('text-xs font-medium', allComplete ? 'text-green-600' : 'text-gray-400')}>
          {respondidas}/{totalPreguntas}
          {saltadas > 0 && ` · ${saltadas} omitida${saltadas !== 1 ? 's' : ''}`}
          {pendientes > 0 && ` · ${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`}
        </p>
      </div>

      <ul className="divide-y divide-gray-100 bg-white mx-4 rounded-2xl overflow-hidden shadow-sm">
        {auditoria.categorias.map((cat, idx) => {
          const resp    = cat.questions.filter(q => auditoria.answers[q.id]?.respuesta).length;
          const skip    = cat.questions.filter(q => auditoria.skipped[q.id]).length;
          const total   = cat.questions.length;
          const completa = resp + skip === total;
          return (
            <li key={cat.name}>
              <button onClick={() => elegirCategoria(idx)}
                className="w-full text-left px-4 py-4 flex items-center justify-between active:bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{cat.name}</p>
                    {completa && <span className="text-green-500 text-sm">✓</span>}
                    {skip > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                        {skip} omitida{skip !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{resp}/{total} preguntas</p>
                  <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden w-32">
                    <div className={clsx('h-full rounded-full transition-all', completa ? 'bg-green-500' : 'bg-red-500')}
                      style={{ width: `${total > 0 ? ((resp + skip) / total) * 100 : 0}%` }} />
                  </div>
                </div>
                <span className="text-gray-300 text-xl ml-3">›</span>
              </button>
            </li>
          );
        })}
      </ul>

      {respondidas > 0 && (() => {
        const puntaje = calcularPuntaje(todasPreguntas, auditoria.answers, state.umbralCriticos);
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
                  <p className={clsx('text-sm font-semibold mt-0.5', puntaje.reprobado ? 'text-red-600' : 'text-gray-700')}>
                    {puntaje.nivel}
                  </p>
                </div>
              </div>
            </div>

            {incumplCount > 0 && (
              <button onClick={() => router.push('/auditoria/incumplimientos')}
                className="w-full py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold">
                ⚠ Ver incumplimientos ({incumplCount})
              </button>
            )}

            {saltadas > 0 && primerCatConSaltadas >= 0 && (
              <button onClick={() => elegirCategoria(primerCatConSaltadas, true)}
                className="w-full py-3 rounded-xl border border-amber-300 text-amber-700 bg-amber-50 text-sm font-semibold">
                ↩ Ir a las preguntas omitidas ({saltadas})
              </button>
            )}

            {allComplete ? (
              <button onClick={() => router.push('/auditoria/resumen')}
                className="w-full py-3.5 bg-green-600 text-white rounded-xl font-semibold">
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
