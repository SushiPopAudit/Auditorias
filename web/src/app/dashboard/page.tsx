'use client';
import { useState, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion } from '@/contexts/AppContext';
import { getDashboard, type DashboardData } from '@/services/dashboard';
import {
  Tile, Barra, Vacio, tramoScore, textoTendencia, IMP_CHIP, normImp,
} from '@/components/dashboard/viz';
import clsx from 'clsx';

type Vista = 'general' | 'local' | 'ranking';
const TIPOS = [
  { v: '',         l: 'Todas'    },
  { v: 'Oficial',  l: 'Oficial'  },
  { v: 'Informal', l: 'Informal' },
];
const PERIODOS = [
  { k: 'mesActual'   as const, l: 'Mes actual'   },
  { k: 'mesAnterior' as const, l: 'Mes anterior' },
  { k: 'ult3Meses'   as const, l: 'Últ. 3 meses' },
];

function DashboardContent() {
  const { sesion } = useSesion();

  const [data,        setData]        = useState<DashboardData | null>(null);
  const [cargando,    setCargando]    = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error,       setError]       = useState('');

  const [tipo,    setTipo]    = useState('');
  const [vista,   setVista]   = useState<Vista>('general');
  const [local,   setLocal]   = useState('');
  const [periodo, setPeriodo] = useState<'mesActual' | 'mesAnterior' | 'ult3Meses'>('mesActual');

  async function cargar(esRefresh = false) {
    if (!sesion) return;
    if (esRefresh) setRefrescando(true); else setCargando(true);
    setError('');
    try {
      setData(await getDashboard(sesion, tipo));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false); setRefrescando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [sesion, tipo]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header con filtros */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
          <button
            onClick={() => cargar(true)}
            disabled={refrescando}
            className="text-sm text-red-600 font-medium disabled:text-gray-300"
          >
            {refrescando ? 'Actualizando...' : '↻ Actualizar'}
          </button>
        </div>

        {/* Vista */}
        <div className="flex gap-2 mb-2">
          {([['general','General'],['local','Por local'],['ranking','Ranking']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={clsx(
                'flex-1 py-2 rounded-xl text-xs font-semibold',
                vista === v ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600',
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Tipo de auditoría */}
        <div className="flex gap-2">
          {TIPOS.map(t => (
            <button
              key={t.v}
              onClick={() => setTipo(t.v)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium',
                tipo === t.v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200',
              )}
            >
              {t.l}
            </button>
          ))}
        </div>

        {/* Selector de local — solo en la vista por local */}
        {vista === 'local' && data && (
          <select
            value={local}
            onChange={e => setLocal(e.target.value)}
            className="w-full mt-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
          >
            <option value="">Elegí un local...</option>
            {data.locales.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>

      {/* Aviso del caché */}
      <p className="px-4 pt-3 text-xs text-gray-400">
        Los datos se actualizan cada 3 minutos. Si acabás de enviar una auditoría, tocá Actualizar.
      </p>

      {/* Spinner inicial */}
      {cargando && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudieron cargar los reportes</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <button onClick={() => cargar()}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">
            Reintentar
          </button>
        </div>
      )}

      {/* Contenido — al refrescar se mantiene con opacidad reducida */}
      {data && !error && (
        <div className={clsx('px-4 py-4 space-y-4 transition-opacity', refrescando && 'opacity-50')}>

          {/* ════════════════════════════════════
              VISTA GENERAL
          ════════════════════════════════════ */}
          {vista === 'general' && (
            <>
              {/* Número protagonista */}
              <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <p className="text-sm text-gray-500">Promedio general</p>
                <p className="text-5xl font-semibold text-gray-900 mt-1 leading-none">
                  {data.global.promedio != null ? `${Math.round(data.global.promedio)}%` : '—'}
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  {data.global.totalLocales} local{data.global.totalLocales !== 1 ? 'es' : ''} evaluado{data.global.totalLocales !== 1 ? 's' : ''}
                </p>
                {data.global.promedio != null && (
                  <span className={clsx(
                    'inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold',
                    tramoScore(data.global.promedio).chip,
                  )}>
                    {tramoScore(data.global.promedio).nivel}
                  </span>
                )}
              </div>

              {/* Controles que más fallan — todas las barras del mismo color:
                  el número es un conteo de locales, no un puntaje */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h2 className="font-semibold text-sm text-gray-900">Puntos que más fallan</h2>
                <p className="text-xs text-gray-400 mt-0.5 mb-1">
                  Cantidad de locales donde el control viene fallando
                </p>

                {data.global.rankingControles.length === 0
                  ? <Vacio texto="Sin datos todavía." />
                  : (
                    <div className="divide-y divide-gray-50">
                      {data.global.rankingControles.slice(0, 10).map((c, i) => {
                        const n = c.localCount ?? 0;
                        const imp = normImp(c.importancia);
                        return (
                          <Barra
                            key={i}
                            titulo={c.control}
                            subtitulo={c.categoria}
                            valor={`${n} local${n !== 1 ? 'es' : ''}`}
                            pct={data.global.totalLocales > 0 ? (n / data.global.totalLocales) * 100 : 0}
                            color="bg-red-500"
                            chip={imp ? { texto: c.importancia, clase: IMP_CHIP[imp] ?? 'bg-gray-100 text-gray-600' } : undefined}
                          />
                        );
                      })}
                    </div>
                  )}
              </div>

              {/* Categorías con más dificultad — acá el número SÍ es un puntaje */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h2 className="font-semibold text-sm text-gray-900">Categorías con más dificultad</h2>
                <p className="text-xs text-gray-400 mt-0.5 mb-1">
                  % de cumplimiento promedio, peor primero
                </p>

                {data.global.rankingCategorias.length === 0
                  ? <Vacio texto="Sin datos todavía." />
                  : (
                    <div className="divide-y divide-gray-50">
                      {data.global.rankingCategorias.slice(0, 10).map((c, i) => (
                        <Barra
                          key={i}
                          titulo={c.categoria}
                          subtitulo={
                            c.localsBelowTarget
                              ? `${c.localsBelowTarget} local${c.localsBelowTarget !== 1 ? 'es' : ''} por debajo del objetivo`
                              : undefined
                          }
                          valor={`${Math.round(c.pct)}%`}
                          pct={c.pct}
                          color={tramoScore(c.pct).barra}
                        />
                      ))}
                    </div>
                  )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════
              VISTA POR LOCAL
          ════════════════════════════════════ */}
          {vista === 'local' && (
            !local ? (
              <Vacio texto="Elegí un local arriba para ver su detalle." />
            ) : !data.porLocal[local] ? (
              <Vacio texto="Este local todavía no tiene auditorías." />
            ) : (() => {
              const d = data.porLocal[local];
              const tend = textoTendencia(d.tendencia, d.tendenciaDiff);

              const tonoDias =
                d.diasSinAuditoria == null ? 'neutro' :
                d.diasSinAuditoria <= 25   ? 'bien'   :
                d.diasSinAuditoria <= 45   ? 'atencion' : 'mal';

              const tonoReinc =
                d.reincidencia == null ? 'neutro' :
                d.reincidencia <= 25   ? 'bien'   :
                d.reincidencia <= 50   ? 'atencion' : 'mal';

              return (
                <>
                  {/* Promedio del local */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                    <p className="text-sm text-gray-500">Promedio últimas {d.auditsCount}</p>
                    <p className="text-5xl font-semibold text-gray-900 mt-1 leading-none">
                      {d.promedio3 != null ? `${Math.round(d.promedio3)}%` : '—'}
                    </p>
                    {d.promedio3 != null && data.global.promedio != null && (
                      <p className="text-sm text-gray-400 mt-2">
                        {d.promedio3 >= data.global.promedio ? '+' : ''}
                        {Math.round(d.promedio3 - data.global.promedio)} pts vs. promedio general
                      </p>
                    )}
                  </div>

                  {/* Tres indicadores */}
                  <div className="grid grid-cols-3 gap-2">
                    <Tile
                      label="Tendencia"
                      valor={d.tendencia === 'sube' ? '▲' : d.tendencia === 'baja' ? '▼' : '→'}
                      detalle={tend.texto}
                      tono={tend.tono}
                    />
                    <Tile
                      label="Días sin auditar"
                      valor={d.diasSinAuditoria != null ? String(d.diasSinAuditoria) : '—'}
                      tono={tonoDias}
                    />
                    <Tile
                      label="Reincidencia"
                      valor={d.reincidencia != null ? `${Math.round(d.reincidencia)}%` : '—'}
                      detalle={d.reincidencia != null ? 'de los desvíos repiten' : undefined}
                      tono={tonoReinc}
                    />
                  </div>

                  {/* Últimas auditorías */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <h2 className="font-semibold text-sm text-gray-900 mb-2">Últimas auditorías</h2>
                    {d.ultimasAuditorias.length === 0
                      ? <Vacio texto="Sin auditorías." />
                      : (
                        <ul className="divide-y divide-gray-50">
                          {d.ultimasAuditorias.map(a => {
                            const t = tramoScore(a.pct, a.reprobado);
                            return (
                              <li key={a.auditId} className="py-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm text-gray-900 font-medium">{a.fecha}</p>
                                  <p className="text-xs text-gray-400 truncate">{a.auditor}</p>
                                </div>
                                <span className={clsx('px-2.5 py-1 rounded-full text-sm font-bold flex-shrink-0', t.chip)}>
                                  {a.reprobado ? '⛔' : `${a.pct}%`}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                  </div>

                  {/* Controles con más incumplimientos */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <h2 className="font-semibold text-sm text-gray-900">Puntos con más incumplimientos</h2>
                    <p className="text-xs text-gray-400 mt-0.5 mb-1">
                      En cuántas de las últimas {d.auditsCount} auditorías falló
                    </p>
                    {d.rankingControles.length === 0
                      ? <Vacio texto="Sin incumplimientos recurrentes." />
                      : (
                        <div className="divide-y divide-gray-50">
                          {d.rankingControles.slice(0, 10).map((c, i) => {
                            const n = c.failedAudits ?? 0;
                            const imp = normImp(c.importancia);
                            return (
                              <Barra
                                key={i}
                                titulo={c.control}
                                subtitulo={c.subcategoria || c.categoria}
                                valor={`${n} de ${d.auditsCount}`}
                                pct={d.auditsCount > 0 ? (n / d.auditsCount) * 100 : 0}
                                color="bg-red-500"
                                chip={imp ? { texto: c.importancia, clase: IMP_CHIP[imp] ?? 'bg-gray-100 text-gray-600' } : undefined}
                              />
                            );
                          })}
                        </div>
                      )}
                  </div>

                  {/* Categorías del local */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <h2 className="font-semibold text-sm text-gray-900 mb-1">Categorías</h2>
                    {d.rankingCategorias.length === 0
                      ? <Vacio texto="Sin datos." />
                      : (
                        <div className="divide-y divide-gray-50">
                          {d.rankingCategorias.map((c, i) => (
                            <Barra
                              key={i}
                              titulo={c.categoria}
                              valor={`${Math.round(c.pct)}%`}
                              pct={c.pct}
                              color={tramoScore(c.pct).barra}
                            />
                          ))}
                        </div>
                      )}
                  </div>
                </>
              );
            })()
          )}

          {/* ════════════════════════════════════
              VISTA RANKING
          ════════════════════════════════════ */}
          {vista === 'ranking' && (
            <>
              {/* Selector de período */}
              <div className="flex gap-2">
                {PERIODOS.map(p => (
                  <button
                    key={p.k}
                    onClick={() => setPeriodo(p.k)}
                    className={clsx(
                      'flex-1 py-2 rounded-xl text-xs font-semibold',
                      periodo === p.k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200',
                    )}
                  >
                    {p.l}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                {data.ranking[periodo].length === 0
                  ? <Vacio texto="Sin auditorías en este período." />
                  : (
                    <ol className="divide-y divide-gray-50">
                      {data.ranking[periodo].map((r, i) => {
                        const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                        const t = tramoScore(r.promedio);
                        return (
                          <li key={r.local} className="py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="text-sm font-medium text-gray-900">
                                <span className="text-gray-400 tabular-nums mr-1.5">{i + 1}.</span>
                                {medalla && <span className="mr-1">{medalla}</span>}
                                {r.local}
                              </p>
                              <span className="text-sm font-semibold text-gray-900 flex-shrink-0 tabular-nums">
                                {Math.round(r.promedio)}%
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {r.auditCount} auditoría{r.auditCount !== 1 ? 's' : ''}
                            </p>
                            <div className="h-2 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                              <div
                                className={clsx('h-full rounded-r-[4px]', t.barra)}
                                style={{ width: `${Math.max(0, Math.min(100, r.promedio))}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
              </div>
            </>
          )}

        </div>
      )}

      <BottomNav />
    </div>
  );
}

export default function DashboardPage() {
  return <AuthGuard><DashboardContent /></AuthGuard>;
}
