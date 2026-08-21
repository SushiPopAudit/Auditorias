'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp, useSesion } from '@/contexts/AppContext';
import { calcularPuntaje } from '@/services/scoring';
import { enviarAuditoria } from '@/services/envio';
import type { Auditoria, Pregunta } from '@/types';
import clsx from 'clsx';

const NIVEL_BG: Record<string, string> = {
  'Excelente':       'bg-green-500',
  'Satisfactorio':   'bg-yellow-400',
  'Requiere mejora': 'bg-orange-400',
  'Deficiente':      'bg-red-500',
  'Reprobado':       'bg-red-900',
};

function ResumenContent() {
  const { state, dispatch } = useApp();
  const { sesion } = useSesion();
  const router = useRouter();
  const { auditoria } = state;

  const [enviando, setEnviando]   = useState(false);
  const [enviado,  setEnviado]    = useState(false);
  const [error,    setError]      = useState('');

  const todasPreguntas = useMemo(
    () => auditoria.categorias.flatMap(c => c.questions),
    [auditoria.categorias]
  );

  const preguntasMap = useMemo(
    () => Object.fromEntries(todasPreguntas.map(p => [p.id, p])) as Record<string, Pregunta>,
    [todasPreguntas]
  );

  const puntaje = useMemo(
    () => calcularPuntaje(todasPreguntas, auditoria.answers),
    [todasPreguntas, auditoria.answers]
  );

  const puntajesPorCat = useMemo(() =>
    auditoria.categorias.map(cat => ({
      name:    cat.name,
      puntaje: calcularPuntaje(cat.questions, auditoria.answers),
      respondidas: cat.questions.filter(q => auditoria.answers[q.id]).length,
      total: cat.questions.length,
    })),
    [auditoria.categorias, auditoria.answers]
  );

  const criticos = useMemo(() =>
    todasPreguntas.filter(p => {
      const imp = (p.importancia ?? '').toLowerCase();
      const ans = auditoria.answers[p.id];
      return (imp === 'crítico' || imp === 'critico') &&
             ans?.respuesta?.toLowerCase().includes('no cumple');
    }),
    [todasPreguntas, auditoria.answers]
  );

  const totalRespondidas = todasPreguntas.filter(q => auditoria.answers[q.id]).length;

  const handleEnviar = async () => {
    if (!auditoria.local || !sesion) return;
    setEnviando(true);
    setError('');

    const payload: Auditoria = {
      id:           auditoria.auditId,
      fecha:        auditoria.fecha,
      auditor:      sesion.nombre,
      auditorEmail: sesion.email,
      localNombre:  auditoria.local.nombre,
      marca:        auditoria.local.isCausa ? 'Causa' : 'Multimarca',
      tipo:         auditoria.tipo,
      acompanante:  auditoria.acompanante || undefined,
      respuestas:   Object.values(auditoria.answers),
    };

    const result = await enviarAuditoria(payload, preguntasMap);
    setEnviando(false);

    if (!result.ok) {
      setError(result.error ?? 'Error al enviar');
      return;
    }

    setEnviado(true);
    setTimeout(() => {
      dispatch({ type: 'AUDIT_RESET' });
      router.replace('/auditoria/exito');
    }, 800);
  };

  if (!auditoria.local) {
    router.replace('/auditoria/setup');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="text-red-600 text-sm mb-2">
          ← Volver a categorías
        </button>
        <h1 className="text-xl font-bold text-gray-900">Resumen de Auditoría</h1>
        <p className="text-sm text-gray-400">
          {auditoria.local.nombre} · {auditoria.fecha}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Score principal */}
        <div className={clsx(
          'rounded-2xl p-6 text-white text-center',
          NIVEL_BG[puntaje.nivel] ?? 'bg-gray-500'
        )}>
          <p className="text-5xl font-bold mb-1">{puntaje.pct}%</p>
          <p className="text-xl font-semibold mb-1">{puntaje.nivelEmoji} {puntaje.nivel}</p>
          <p className="text-sm opacity-80">
            {puntaje.obtenido} / {puntaje.posible} puntos · {totalRespondidas}/{todasPreguntas.length} preguntas
          </p>
        </div>

        {/* Advertencia reprobado */}
        {puntaje.reprobado && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="font-semibold text-red-700 mb-1">⛔ Auditoría Reprobada</p>
            <p className="text-sm text-red-600">
              {criticos.length} punto{criticos.length !== 1 ? 's' : ''} crítico{criticos.length !== 1 ? 's' : ''} con &quot;No Cumple&quot;.
            </p>
          </div>
        )}

        {/* Incumplimientos críticos */}
        {criticos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">Incumplimientos Críticos</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {criticos.map(p => (
                <li key={p.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-red-700">{p.control}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.categoria} · {p.subcategoria}</p>
                  {auditoria.answers[p.id]?.observacion && (
                    <p className="text-xs text-gray-500 mt-1 italic">
                      &quot;{auditoria.answers[p.id].observacion}&quot;
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Desglose por categoría */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Por Categoría</p>
          </div>
          <ul className="divide-y divide-gray-50">
            {puntajesPorCat.map(cat => (
              <li key={cat.name} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                  <span className={clsx('text-sm font-bold',
                    cat.puntaje.reprobado ? 'text-red-600' :
                    cat.puntaje.pct >= 75 ? 'text-green-600' : 'text-orange-500'
                  )}>
                    {cat.respondidas === 0 ? '—' : `${cat.puntaje.pct}%`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full',
                        cat.puntaje.reprobado ? 'bg-red-500' :
                        cat.puntaje.pct >= 75 ? 'bg-green-400' : 'bg-orange-400'
                      )}
                      style={{ width: `${cat.respondidas === 0 ? 0 : cat.puntaje.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {cat.respondidas}/{cat.total}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Info de auditoría */}
        <div className="bg-white rounded-2xl shadow-sm p-4 text-sm text-gray-600 space-y-1">
          <p><span className="text-gray-400">Auditor:</span> {sesion?.nombre}</p>
          <p><span className="text-gray-400">Fecha:</span> {auditoria.fecha}</p>
          <p><span className="text-gray-400">Tipo:</span> {auditoria.tipo}</p>
          <p><span className="text-gray-400">ID:</span> <span className="font-mono text-xs">{auditoria.auditId}</span></p>
        </div>

        {/* Error de envío */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Botón de envío — fijo en el fondo */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 pt-4">
        <button
          onClick={handleEnviar}
          disabled={enviando || enviado || totalRespondidas === 0}
          className={clsx(
            'w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-95',
            enviado                  ? 'bg-green-500' :
            enviando                 ? 'bg-gray-400' :
            totalRespondidas === 0   ? 'bg-gray-300' :
                                       'bg-red-600'
          )}
        >
          {enviado   ? '✓ Enviado correctamente' :
           enviando  ? 'Enviando...' :
                       `Enviar Auditoría (${totalRespondidas} respuestas)`}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function ResumenPage() {
  return <AuthGuard><ResumenContent /></AuthGuard>;
}
