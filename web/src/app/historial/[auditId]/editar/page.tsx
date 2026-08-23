'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useApp, useSesion } from '@/contexts/AppContext';
import {
  getAuditoria, editarAuditoria,
  type AuditoriaDetalle, type RespuestaEdicion,
} from '@/services/historial';
import { parseValidacion, parseAnswerType, evaluarNumero, evaluarFecha } from '@/services/validaciones';
import InputNumerico from '@/components/auditoria/InputNumerico';
import clsx from 'clsx';

interface Cambio {
  respuesta?:   string;
  observacion?: string;
  rawValor?:    string;
  fechaRaw?:    string;
}

const IMP_STYLE: Record<string, string> = {
  critico: 'bg-red-100 text-red-800',
  alta:    'bg-orange-100 text-orange-800',
  media:   'bg-yellow-100 text-yellow-800',
  baja:    'bg-green-100 text-green-700',
};

const VEREDICTO_STYLE: Record<string, string> = {
  'Cumple':              'bg-green-50 text-green-700',
  'Cumple parcialmente': 'bg-amber-50 text-amber-700',
  'No Cumple':           'bg-red-50   text-red-700',
};

function normImp(s: string): string {
  return (s || '').toLowerCase().trim().replace(/í/g, 'i');
}

function EditarContent() {
  const { state } = useApp();
  const { sesion } = useSesion();
  const router = useRouter();
  const params = useParams();
  const auditId = decodeURIComponent(String(params.auditId ?? ''));

  const [det, setDet]             = useState<AuditoriaDetalle | null>(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [cambios, setCambios]     = useState<Record<string, Cambio>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!sesion || !auditId) return;
    getAuditoria(sesion, auditId)
      .then(setDet)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [sesion, auditId]);

  const preguntasPorControl = useMemo(() => {
    const m = new Map<string, typeof state.preguntas[number]>();
    state.preguntas.forEach(q => m.set((q.control || '').toLowerCase().trim(), q));
    return m;
  }, [state.preguntas]);

  const grupos = useMemo(() => {
    if (!det) return [];
    const orden: string[] = [];
    const map = new Map<string, typeof det.respuestas>();
    det.respuestas.forEach(r => {
      const cat = r.categoria || 'Sin categoría';
      if (!map.has(cat)) { map.set(cat, []); orden.push(cat); }
      map.get(cat)!.push(r);
    });
    return orden.map(cat => ({ cat, items: map.get(cat)! }));
  }, [det]);

  const cantidadCambios = Object.keys(cambios).length;

  function setCambio(control: string, patch: Cambio) {
    setCambios(prev => ({ ...prev, [control]: { ...prev[control], ...patch } }));
  }

  function deshacer(control: string) {
    setCambios(prev => {
      const next = { ...prev };
      delete next[control];
      return next;
    });
  }

  async function guardar() {
    if (!det || !sesion || guardando) return;
    setGuardando(true);

    const respuestas: RespuestaEdicion[] = det.respuestas.map(r => {
      const c = cambios[r.control] ?? {};
      return {
        control:     r.control,
        respuesta:   c.respuesta   ?? r.respuesta   ?? '',
        observacion: c.observacion ?? r.observacion ?? '',
        rawValor:    c.rawValor    ?? r.rawValor    ?? '',
        fechaRaw:    c.fechaRaw    ?? '',
      };
    });

    const res = await editarAuditoria(sesion, det.auditId, respuestas);
    setGuardando(false);

    if (!res.ok) { alert(`No se pudo guardar: ${res.error}`); return; }

    alert(`Cambios guardados.\nNuevo puntaje: ${res.pct}% — ${res.nivel}`);
    router.replace(`/historial/${encodeURIComponent(det.auditId)}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="text-blue-600 text-sm mb-2">
          ← Volver
        </button>
        {det && (
          <>
            <h1 className="text-lg font-bold text-gray-900">{det.local}</h1>
            <p className="text-sm text-gray-400">Modificar auditoría · {det.fecha}</p>
          </>
        )}
      </div>

      {cargando && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudo cargar la auditoría</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      )}

      {det && (
        <div className="px-4 py-4 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-800">
              Los campos que modifiques se marcan en azul. El puntaje se recalcula al guardar.
            </p>
          </div>

          {grupos.map(g => (
            <div key={g.cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 font-semibold text-sm text-gray-800">
                {g.cat}
              </div>

              <div className="divide-y divide-gray-50">
                {g.items.map((r, i) => {
                  const q     = preguntasPorControl.get((r.control || '').toLowerCase().trim());
                  const regla = parseValidacion(q?.validacion ?? '');
                  const { type, options } = parseAnswerType(q?.pregunta ?? '', q?.tipoRespuesta ?? '');

                  const c        = cambios[r.control];
                  const cambiado = !!c;

                  const curResp = c?.respuesta   ?? r.respuesta   ?? '';
                  const curObs  = c?.observacion ?? r.observacion ?? '';
                  const curRaw  = c?.rawValor    ?? r.rawValor    ?? '';

                  const imp = normImp(r.importancia);

                  const origLabel = (regla?.tipo === 'numero' || regla?.tipo === 'fecha') && r.rawValor
                    ? `${r.rawValor} → ${r.respuesta || '—'}`
                    : (r.respuesta || '—');

                  return (
                    <div key={i} className={clsx('px-4 py-3',
                      cambiado && 'border-l-4 border-blue-500 bg-blue-50/30')}>
                      {r.subcategoria && (
                        <p className="text-xs text-gray-400">{r.subcategoria}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-sm font-semibold text-gray-900">{r.control}</span>
                        {imp && (
                          <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                            IMP_STYLE[imp] ?? 'bg-gray-100 text-gray-600')}>
                            {r.importancia}
                          </span>
                        )}
                      </div>

                      {cambiado && (
                        <div className="flex items-center gap-2 mt-2 px-2.5 py-1.5 bg-blue-100 rounded-lg">
                          <span className="text-xs text-blue-900">
                            Anterior: <strong>{origLabel}</strong>
                          </span>
                          <button onClick={() => deshacer(r.control)}
                            className="ml-auto text-xs text-red-600 border border-red-300 rounded px-2 py-0.5 whitespace-nowrap">
                            ↩ Deshacer
                          </button>
                        </div>
                      )}

                      {/* Headcount: solo lectura */}
                      {regla?.tipo === 'headcount' && (
                        <p className="text-xs text-gray-500 italic mt-2">
                          {curObs || curResp || '—'} (no editable)
                        </p>
                      )}

                      {/* Numérico con auto-evaluación */}
                      {regla?.tipo === 'numero' && (
                        <div className="mt-2">
                          <InputNumerico
                            value={curRaw}
                            placeholder="Ej: -18,5"
                            onChange={v => {
                              const norm = v.replace(/,/g, '.');
                              const verd = norm && norm !== '-' ? evaluarNumero(norm, regla) : null;
                              setCambio(r.control, { rawValor: v, respuesta: verd ?? norm });
                            }}
                          />
                          {curRaw && (() => {
                            const verd = evaluarNumero(curRaw.replace(/,/g, '.'), regla);
                            return verd ? (
                              <span className={clsx('inline-block mt-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full',
                                VEREDICTO_STYLE[verd] ?? 'bg-gray-100 text-gray-600')}>
                                {verd}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {/* Fecha con auto-evaluación */}
                      {regla?.tipo === 'fecha' && (
                        <div className="mt-2">
                          <input type="date" value={curRaw}
                            onChange={e => {
                              const v = e.target.value;
                              const ev = v ? evaluarFecha(v) : null;
                              setCambio(r.control, {
                                rawValor: v, fechaRaw: v,
                                respuesta: ev ? ev.resultado : v,
                              });
                            }}
                            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                          />
                          {curRaw && (() => {
                            const ev = evaluarFecha(curRaw);
                            if (!ev) return null;
                            return (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={clsx('text-xs font-bold px-2.5 py-0.5 rounded-full',
                                  VEREDICTO_STYLE[ev.resultado] ?? 'bg-gray-100 text-gray-600')}>
                                  {ev.resultado}
                                </span>
                                {ev.advertencia && (
                                  <span className="text-xs text-amber-600 font-semibold">
                                    ⚠ {ev.advertencia}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Radio */}
                      {!regla && type === 'radio' && options.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {options.map(opt => {
                            const sel = curResp === opt || curResp.toLowerCase() === opt.toLowerCase();
                            const o = opt.toLowerCase();
                            const activo =
                              o.includes('no cumple') ? 'border-red-500   bg-red-50   text-red-700'   :
                              o.includes('parcial')   ? 'border-amber-500 bg-amber-50 text-amber-700' :
                              o === 'cumple'          ? 'border-green-500 bg-green-50 text-green-700' :
                                                        'border-gray-400  bg-gray-100 text-gray-600';
                            return (
                              <button key={opt} type="button"
                                onClick={() => setCambio(r.control, { respuesta: opt })}
                                className={clsx('px-3 py-1.5 rounded-full text-xs font-bold border-2',
                                  sel ? activo : 'border-gray-200 bg-white text-gray-500')}>
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Texto libre (fallback) */}
                      {!regla && type !== 'radio' && (
                        <textarea value={curResp}
                          onChange={e => setCambio(r.control, { respuesta: e.target.value })}
                          className="w-full mt-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm min-h-[44px]"
                        />
                      )}

                      {/* Observación — todos los tipos salvo headcount */}
                      {regla?.tipo !== 'headcount' && (
                        <textarea value={curObs}
                          onChange={e => setCambio(r.control, { observacion: e.target.value })}
                          placeholder="Observación (opcional)..."
                          className="w-full mt-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 min-h-[36px]"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {det && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
          <button onClick={() => router.back()}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || cantidadCambios === 0}
            className="flex-[2] py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-40">
            {guardando
              ? 'Guardando...'
              : cantidadCambios === 0
                ? 'Sin cambios'
                : `💾 Guardar ${cantidadCambios} cambio${cantidadCambios !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function EditarPage() {
  return <AuthGuard><EditarContent /></AuthGuard>;
}
