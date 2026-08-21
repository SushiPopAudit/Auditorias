'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useApp } from '@/contexts/AppContext';
import { esRespuestaNegativa } from '@/services/validaciones';
import clsx from 'clsx';

const IMP_STYLE: Record<string, string> = {
  critico: 'bg-red-100 text-red-800',
  crítico: 'bg-red-100 text-red-800',
  alta:    'bg-orange-100 text-orange-800',
  media:   'bg-yellow-100 text-yellow-800',
  baja:    'bg-gray-100 text-gray-600',
};

function IncumplimientosContent() {
  const { state } = useApp();
  const router = useRouter();
  const { categorias, answers } = state.auditoria;

  const grupos = useMemo(() => {
    return categorias
      .map(cat => ({
        nombre: cat.name,
        items: cat.questions
          .map(q => ({ q, ans: answers[q.id] }))
          .filter(({ ans }) => ans && esRespuestaNegativa(ans.respuesta)),
      }))
      .filter(g => g.items.length > 0);
  }, [categorias, answers]);

  const total = grupos.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-red-600 text-sm mb-2">
          ← Volver
        </button>
        <h1 className="text-xl font-bold text-gray-900">Incumplimientos ({total})</h1>
        <p className="text-sm text-gray-400 mt-0.5">Revisá estos puntos con el acompañante.</p>
      </div>

      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <span className="text-5xl mb-3">✅</span>
          <p className="text-gray-600 font-medium">Sin incumplimientos</p>
          <p className="text-gray-400 text-sm mt-1">Todos los controles respondidos están en cumplimiento.</p>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {grupos.map(g => (
          <div key={g.nombre} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-100">
              <p className="font-semibold text-sm text-red-900">
                {g.nombre} <span className="font-normal text-red-600">({g.items.length})</span>
              </p>
            </div>
            <ul className="divide-y divide-gray-50">
              {g.items.map(({ q, ans }) => {
                const imp = (q.importancia || '').toLowerCase().trim();
                const esParcial = (ans.respuesta || '').toLowerCase().includes('parcial');
                return (
                  <li key={q.id} className={clsx('px-4 py-3 border-l-4', esParcial ? 'border-amber-400' : 'border-red-500')}>
                    {q.subcategoria && <p className="text-xs text-gray-400">{q.subcategoria}</p>}
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{q.control}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full',
                        esParcial ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')}>
                        {ans.respuesta}
                      </span>
                      {imp && (
                        <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', IMP_STYLE[imp] ?? 'bg-gray-100 text-gray-600')}>
                          {q.importancia}
                        </span>
                      )}
                      {ans.rawValor && <span className="text-xs text-gray-400">({ans.rawValor})</span>}
                    </div>
                    {ans.observacion && (
                      <p className="text-xs text-gray-500 italic mt-1.5">&ldquo;{ans.observacion}&rdquo;</p>
                    )}
                    {!!ans.fotos?.length && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {ans.fotos.map((f, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={f.dataURL} alt={`foto ${i + 1}`}
                            className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IncumplimientosPage() {
  return <AuthGuard><IncumplimientosContent /></AuthGuard>;
}
