'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp, useSesion, useCache } from '@/contexts/AppContext';
import { calcularPuntaje } from '@/services/scoring';
import { enviarAuditoria, verificarEnvio } from '@/services/envio';
import { borrarBorrador, marcarSinConfirmar, exportarBorradorTexto } from '@/lib/borrador';
import { esRespuestaNegativa } from '@/services/validaciones';
import type { Pregunta } from '@/types';
import clsx from 'clsx';

const NIVEL_BG: Record<string, string> = {
  'Excelente':     'bg-green-500',
  'Satisfactorio': 'bg-yellow-400',
  'A mejorar':     'bg-orange-400',
  'Deficiente':    'bg-red-500',
  'Reprobado':     'bg-red-900',
};

function ResumenContent() {
  const { state, dispatch } = useApp();
  const { sesion } = useSesion();
  const { limpiar } = useCache();
  const router = useRouter();
  const { auditoria } = state;

  const [enviando,    setEnviando]    = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [error,       setError]       = useState('');

  const todasPreguntas = useMemo(() => auditoria.categorias.flatMap(c => c.questions), [auditoria.categorias]);
  const preguntasMap   = useMemo(
    () => Object.fromEntries(todasPreguntas.map(p => [p.id, p])) as Record<string, Pregunta>,
    [todasPreguntas]
  );
  const puntaje = useMemo(
    () => calcularPuntaje(todasPreguntas, auditoria.answers, state.umbralCriticos),
    [todasPreguntas, auditoria.answers, state.umbralCriticos]
  );
  const puntajesPorCat = useMemo(() =>
    auditoria.categorias.map(cat => ({
      name:       cat.name,
      puntaje:    calcularPuntaje(cat.questions, auditoria.answers, state.umbralCriticos),
      respondidas: cat.questions.filter(q => auditoria.answers[q.id]).length,
      total:       cat.questions.length,
    })),
    [auditoria.categorias, auditoria.answers, state.umbralCriticos]
  );

  // Críticos con "No Cumple" o sin responder
  const criticos = useMemo(() =>
    todasPreguntas.filter(p => {
      const imp = (p.importancia ?? '').toLowerCase();
      const ans = auditoria.answers[p.id];
      return (imp === 'crítico' || imp === 'critico') && ans?.respuesta?.toLowerCase().includes('no cumple');
    }), [todasPreguntas, auditoria.answers]);

  const criticosSinResponder = useMemo(() =>
    todasPreguntas.filter(p => {
      const imp = (p.importancia ?? '').toLowerCase();
      return (imp === 'crítico' || imp === 'critico') && !auditoria.answers[p.id]?.respuesta;
    }), [todasPreguntas, auditoria.answers]);

  const incumplCount = useMemo(() =>
    Object.values(auditoria.answers).filter(a => esRespuestaNegativa(a.respuesta)).length,
    [auditoria.answers]);

  const totalRespondidas = todasPreguntas.filter(q => auditoria.answers[q.id]?.respuesta).length;
  const sinResponder     = todasPreguntas.length - totalRespondidas;

  // Distribución de respuestas
  const dist = useMemo(() => {
    let cumple = 0, parcial = 0, nc = 0, na = 0;
    Object.values(auditoria.answers).forEach(a => {
      const v = (a.respuesta || '').toLowerCase();
      if (v === 'cumple')                            cumple++;
      else if (v.includes('parcial'))                parcial++;
      else if (v.includes('no cumple') || v === 'nocumple') nc++;
      else if (v.includes('aplica'))                 na++;
    });
    return { cumple, parcial, nc, na };
  }, [auditoria.answers]);

  function exportarDatos() {
    if (!auditoria.local) return;
    const borrador = {
      ts: Date.now(), local: auditoria.local, fecha: auditoria.fecha,
      tipo: auditoria.tipo, acompanante: auditoria.acompanante,
      posicionAcomp: auditoria.posicionAcomp, auditId: auditoria.auditId,
      catIndex: auditoria.catIndex, qIndex: auditoria.qIndex, answers: auditoria.answers,
    };
    const texto = exportarBorradorTexto(borrador);
    if (navigator.share) {
      navigator.share({ title: 'Auditoría', text: texto }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(texto)
        .then(() => alert('Datos copiados al portapapeles'))
        .catch(() => alert(texto));
    }
  }

  const handleEnviar = async () => {
    if (!auditoria.local || !sesion) return;
    setEnviando(true);
    setError('');

    const result = await enviarAuditoria({
      auditId:             auditoria.auditId,
      fecha:               auditoria.fecha,
      auditor:             sesion.nombre,
      auditorEmail:        sesion.email,
      token:               sesion.token,
      local:               auditoria.local.nombre,
      emailsLocal:         auditoria.local.emails ?? '',
      marca:               auditoria.local.isCausa ? 'Causa' : 'Multimarca',
      tipoAuditoria:       auditoria.tipo || 'Oficial',
      acompanante:         auditoria.acompanante || '',
      posicionAcompanante: auditoria.posicionAcomp || '',
      puntaje,
      respuestas:          Object.values(auditoria.answers),
      preguntasMap,
    });

    if (result.ok) {
      borrarBorrador();
      if (result.emailStatus) sessionStorage.setItem('audit_emailStatus', result.emailStatus);
      if (result.desviosRepetidos?.length) {
        sessionStorage.setItem('audit_desvios', JSON.stringify(result.desviosRepetidos));
      }
      limpiar(['historial', 'dashboard']);
      dispatch({ type: 'AUDIT_RESET' });
      router.replace('/auditoria/exito');
      return;
    }

    setVerificando(true);
    const llego = await verificarEnvio(auditoria.auditId);
    setVerificando(false);
    setEnviando(false);

    if (llego) {
      borrarBorrador();
      sessionStorage.setItem('audit_emailStatus', 'enviado (confirmado por verificación)');
      limpiar(['historial', 'dashboard']);
      dispatch({ type: 'AUDIT_RESET' });
      router.replace('/auditoria/exito');
      return;
    }

    marcarSinConfirmar(auditoria.auditId);
    setError(result.error ?? 'No se pudo confirmar el envío.');
  };

  if (!auditoria.local) { router.replace('/auditoria/setup'); return null; }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="text-red-600 text-sm mb-2">← Volver a categorías</button>
        <h1 className="text-xl font-bold text-gray-900">Resumen de Auditoría</h1>
        <p className="text-sm text-gray-400">{auditoria.local.nombre} · {auditoria.fecha}</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Score principal */}
        <div className={clsx('rounded-2xl p-6 text-white text-center', NIVEL_BG[puntaje.nivel] ?? 'bg-gray-500')}>
          <p className="text-5xl font-bold mb-1">{puntaje.pct}%</p>
          <p className="text-xl font-semibold mb-1">{puntaje.nivelEmoji} {puntaje.nivel}</p>
          <p className="text-sm opacity-80">{puntaje.obtenido} / {puntaje.posible} puntos · {totalRespondidas}/{todasPreguntas.length} preguntas</p>
        </div>

        {/* Distribución */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { l: 'Cumple',    v: dist.cumple,  c: 'text-green-700 bg-green-50' },
            { l: 'Parcial',   v: dist.parcial, c: 'text-amber-700 bg-amber-50' },
            { l: 'No cumple', v: dist.nc,      c: 'text-red-700   bg-red-50'   },
            { l: 'No aplica', v: dist.na,      c: 'text-gray-600  bg-gray-100' },
          ].map(s => (
            <div key={s.l} className={clsx('rounded-xl py-3 text-center', s.c)}>
              <p className="text-xl font-bold">{s.v}</p>
              <p className="text-xs mt-0.5 leading-tight">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Aviso preguntas sin responder */}
        {sinResponder > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-amber-800">
              ⚠ {sinResponder} pregunta{sinResponder !== 1 ? 's' : ''} sin responder
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Las preguntas sin respuesta no suman puntos. Volvé a categorías para completarlas.
            </p>
          </div>
        )}

        {puntaje.reprobado && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="font-semibold text-red-700 mb-1">⛔ Auditoría Reprobada</p>
            <p className="text-sm text-red-600">{criticos.length} punto{criticos.length !== 1 ? 's' : ''} crítico{criticos.length !== 1 ? 's' : ''} con &quot;No Cumple&quot;.</p>
          </div>
        )}

        {/* Botón incumplimientos */}
        {incumplCount > 0 && (
          <button onClick={() => router.push('/auditoria/incumplimientos')}
            className="w-full py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold">
            ⚠ Revisar incumplimientos con acompañante ({incumplCount})
          </button>
        )}

        {/* Críticos con No Cumple o sin responder */}
        {(criticos.length > 0 || criticosSinResponder.length > 0) && (
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
                    <p className="text-xs text-gray-500 mt-1 italic">&quot;{auditoria.answers[p.id].observacion}&quot;</p>
                  )}
                </li>
              ))}
              {criticosSinResponder.map(p => (
                <li key={p.id} className="px-4 py-3 bg-gray-50">
                  <p className="text-sm font-medium text-gray-500">{p.control}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Sin responder · {p.categoria}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Por categoría */}
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
                    cat.puntaje.reprobado ? 'text-red-600' : cat.puntaje.pct >= 75 ? 'text-green-600' : 'text-orange-500')}>
                    {cat.respondidas === 0 ? '—' : `${cat.puntaje.pct}%`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={clsx('h-full rounded-full',
                      cat.puntaje.reprobado ? 'bg-red-500' : cat.puntaje.pct >= 75 ? 'bg-green-400' : 'bg-orange-400')}
                      style={{ width: `${cat.respondidas === 0 ? 0 : cat.puntaje.pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400">{cat.respondidas}/{cat.total}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Info */}
        <div className="bg-white rounded-2xl shadow-sm p-4 text-sm text-gray-600 space-y-1">
          <p><span className="text-gray-400">Auditor:</span> {sesion?.nombre}</p>
          <p><span className="text-gray-400">Fecha:</span> {auditoria.fecha}</p>
          <p><span className="text-gray-400">Tipo:</span> {auditoria.tipo}</p>
          {auditoria.local.emails && (
            <p><span className="text-gray-400">Notificación:</span> <span className="text-xs break-all">{auditoria.local.emails}</span></p>
          )}
          <p><span className="text-gray-400">ID:</span> <span className="font-mono text-xs">{auditoria.auditId}</span></p>
        </div>

        {/* Error + rescate */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mt-3">
            <p className="text-sm font-semibold text-red-900">No se pudo confirmar el envío</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
            <p className="text-xs text-gray-600 mt-2">
              Tus respuestas están guardadas. Podés reintentar cuando tengas señal, o exportar los datos.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={handleEnviar} disabled={enviando}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                Reintentar
              </button>
              <button onClick={exportarDatos}
                className="px-3 py-2 border border-red-300 text-red-700 rounded-lg text-sm">
                Exportar datos
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botón de envío fijo */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 pt-4">
        <button
          onClick={handleEnviar}
          disabled={enviando || verificando || totalRespondidas === 0}
          className={clsx(
            'w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-95',
            verificando          ? 'bg-amber-500' :
            enviando             ? 'bg-gray-400' :
            totalRespondidas === 0 ? 'bg-gray-300' : 'bg-red-600'
          )}
        >
          {verificando ? 'Verificando si la auditoría llegó...' :
           enviando    ? 'Enviando...' :
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
