'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useApp, useSesion } from '@/contexts/AppContext';
import {
  getCalendario, getUsuariosBasico, agregarVisita, editarVisita,
  borrarVisita, marcarRealizada, getLocalFallas,
  type Visita, type UsuarioBasico, type AuditoriaFallas,
} from '@/services/calendario';
import ModalDia from '@/components/calendario/ModalDia';
import { ResumenSemanal, CoberturaLocales } from '@/components/calendario/Resumenes';
import {
  MESES, DIAS_CABECERA, MOTIVO_LETRA, MOTIVO_LABEL, MOTIVO_CHIP,
  construirColores, colorDe, iniciales, ymd, hoyISO,
  offsetPrimerDia, diasEnMes, formatFechaLarga,
} from '@/components/calendario/util';

type Tab = 'calendario' | 'visitas' | 'resumen';
type FiltroVisitas = 'proximas' | 'pasadas';

function CalendarioContent() {
  const { state } = useApp();
  const { sesion } = useSesion();
  const esAdmin = sesion?.rol === 'Admin';

  const [visitas, setVisitas]     = useState<Visita[]>([]);
  const [auditores, setAuditores] = useState<UsuarioBasico[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');

  const hoy = hoyISO();
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [mes, setMes]   = useState(() => new Date().getMonth());
  const [tab, setTab]   = useState<Tab>('calendario');
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [filtroVisitas, setFiltroVisitas] = useState<FiltroVisitas>('proximas');

  // Estado para el acordeón de fallas (vista Auditor)
  const [fallasAbiertas, setFallasAbiertas]   = useState<Record<string, boolean>>({});
  const [fallasData, setFallasData]           = useState<Record<string, AuditoriaFallas[]>>({});
  const [fallasCargando, setFallasCargando]   = useState<Record<string, boolean>>({});

  const cargar = useCallback(async () => {
    if (!sesion) return;
    setCargando(true); setError('');
    try {
      const vs = await getCalendario(sesion);
      setVisitas(vs);
      if (sesion.rol === 'Admin') {
        const us = await getUsuariosBasico(sesion);
        setAuditores(us.filter(u => u.rol === 'Auditor'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [sesion]);

  useEffect(() => { cargar(); }, [cargar]);

  const colores = useMemo(
    () => construirColores([...auditores.map(a => a.email), ...visitas.map(v => v.auditorEmail)]),
    [auditores, visitas],
  );

  const mesStr = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  const delMes = useMemo(() => visitas.filter(v => v.fecha.startsWith(mesStr)), [visitas, mesStr]);

  const porDia = useMemo(() => {
    const m: Record<string, Visita[]> = {};
    delMes.forEach(v => { (m[v.fecha] ??= []).push(v); });
    return m;
  }, [delMes]);

  const offset = offsetPrimerDia(anio, mes);
  const dias   = diasEnMes(anio, mes);

  function moverMes(delta: number) {
    let m = mes + delta, a = anio;
    if (m < 0)  { m = 11; a--; }
    if (m > 11) { m = 0;  a++; }
    setMes(m); setAnio(a); setDiaSel(null);
  }

  // ── Acciones ──────────────────────────────────────────────────────────

  async function handleAgregar(v: Parameters<typeof agregarVisita>[1]) {
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    const res = await agregarVisita(sesion, v);
    if (res.ok) await cargar();
    return res;
  }

  async function handleEditar(id: string, v: Parameters<typeof editarVisita>[2]) {
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    const res = await editarVisita(sesion, id, v);
    if (res.ok) await cargar();
    return res;
  }

  async function handleBorrar(id: string) {
    if (!sesion) return { ok: false, error: 'Sin sesión' };
    const res = await borrarVisita(sesion, id);
    if (res.ok) await cargar();
    return res;
  }

  async function handleRealizada(id: string) {
    if (!sesion) return;
    const res = await marcarRealizada(sesion, id);
    if (!res.ok) { alert(res.error ?? 'No se pudo marcar.'); return; }
    await cargar();
  }

  async function toggleFallas(visitaId: string, local: string) {
    const abierto = !!fallasAbiertas[visitaId];
    setFallasAbiertas(p => ({ ...p, [visitaId]: !abierto }));
    if (abierto || fallasData[local] || !sesion) return;
    setFallasCargando(p => ({ ...p, [visitaId]: true }));
    try {
      const d = await getLocalFallas(sesion, local);
      setFallasData(p => ({ ...p, [local]: d }));
    } finally {
      setFallasCargando(p => ({ ...p, [visitaId]: false }));
    }
  }

  // ── Grilla del mes ────────────────────────────────────────────────────

  const grilla = (
    <>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => moverMes(-1)}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 text-lg">‹</button>
        <p className="font-semibold text-gray-900">{MESES[mes]} {anio}</p>
        <button onClick={() => moverMes(1)}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 text-lg">›</button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {DIAS_CABECERA.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-3">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`v${i}`} className="min-h-[56px] bg-gray-50 rounded" />
        ))}

        {Array.from({ length: dias }).map((_, i) => {
          const d = i + 1;
          const iso = ymd(anio, mes, d);
          const vs = porDia[iso] ?? [];
          const esHoy = iso === hoy;

          return (
            <button
              key={iso}
              onClick={() => esAdmin && setDiaSel(iso)}
              className={clsx(
                'min-h-[56px] p-1 rounded text-left overflow-hidden border',
                esHoy ? 'border-2 border-green-600 bg-green-50' : 'border-gray-200 bg-white',
                esAdmin && 'active:bg-gray-50',
              )}
            >
              <span className={clsx(
                'block text-xs',
                esHoy ? 'font-bold text-green-700' : 'font-medium text-gray-900',
              )}>
                {d}
              </span>

              {vs.map(v => (
                <span
                  key={v.visitaId}
                  title={`${iniciales(v.auditorNombre)} · ${v.motivo === 'Franco' ? 'Franco' : v.local} · ${MOTIVO_LABEL[v.motivo] ?? v.motivo}`}
                  className="block text-white rounded-sm px-1 mt-0.5 truncate text-[10px] sm:text-[11px] leading-tight"
                  style={{ background: colorDe(colores, v.auditorEmail) }}
                >
                  {iniciales(v.auditorNombre || v.auditorEmail)}
                  <span className="hidden sm:inline">
                    {v.motivo === 'Franco'
                      ? ' - Franco'
                      : ` - ${v.local}${MOTIVO_LETRA[v.motivo] ? ` - ${MOTIVO_LETRA[v.motivo]}` : ''}`}
                  </span>
                </span>
              ))}
            </button>
          );
        })}
      </div>

      {auditores.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-1">
          {[...auditores].sort((a, b) => a.email.localeCompare(b.email)).map(a => (
            <div key={a.email} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm"
                style={{ background: colorDe(colores, a.email) }} />
              <span className="text-xs text-gray-500">
                {iniciales(a.nombre)} · {a.nombre}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mb-4">A = Auditoría · F = Franco · C = Capacitación</p>

      <div className="space-y-4">
        <ResumenSemanal visitas={delMes} offset={offset} dias={dias} colores={colores} />
        <CoberturaLocales visitas={delMes} locales={state.locales} />
      </div>
    </>
  );

  // ── Tab Visitas (lista) ───────────────────────────────────────────────

  const visitasFiltradas = useMemo(() => {
    if (filtroVisitas === 'proximas') {
      return [...visitas]
        .filter(v => v.fecha >= hoy)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
    return [...delMes]
      .filter(v => v.fecha < hoy)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [visitas, delMes, filtroVisitas, hoy]);

  const listaVisitas = (
    <>
      <div className="flex gap-2 mb-4">
        {(['proximas', 'pasadas'] as const).map(f => (
          <button key={f} onClick={() => setFiltroVisitas(f)}
            className={clsx(
              'flex-1 py-2 rounded-xl text-xs font-semibold',
              filtroVisitas === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600',
            )}>
            {f === 'proximas' ? 'Próximas' : `Pasadas de ${MESES[mes]}`}
          </button>
        ))}
      </div>

      {visitasFiltradas.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin visitas en este filtro.</p>
      ) : (
        <div className="space-y-2">
          {visitasFiltradas.map(v => (
            <div key={v.visitaId}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs text-gray-500">{formatFechaLarga(v.fecha)}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: colorDe(colores, v.auditorEmail) }} />
                    <span className="text-sm font-semibold text-gray-900">{v.auditorNombre || v.auditorEmail}</span>
                  </div>
                  {v.motivo !== 'Franco' && (
                    <p className="text-sm text-gray-700 mt-0.5">{v.local}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                  <span className={clsx(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    MOTIVO_CHIP[v.motivo] ?? 'bg-gray-100 text-gray-500',
                  )}>
                    {MOTIVO_LABEL[v.motivo] ?? v.motivo}
                  </span>
                  <span className={clsx(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    v.estado === 'Realizada' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800',
                  )}>
                    {v.estado}
                  </span>
                </div>
              </div>
              {esAdmin && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                  {v.estado === 'Pendiente' && (
                    <button onClick={() => handleRealizada(v.visitaId)}
                      className="text-xs text-green-700 border border-green-200 rounded-lg px-3 py-1.5 font-semibold">
                      ✓ Realizada
                    </button>
                  )}
                  <button onClick={() => handleBorrar(v.visitaId)}
                    className="text-xs text-red-600 border border-gray-200 rounded-lg px-3 py-1.5">
                    Borrar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ── Tab Resumen ───────────────────────────────────────────────────────

  const totVisitas = delMes.filter(v => v.motivo !== 'Franco').length;
  const totFrancos = delMes.filter(v => v.motivo === 'Franco').length;
  const localesCubiertos = new Set(
    delMes.filter(v => v.motivo !== 'Franco').map(v => v.local)
  ).size;

  const resumenTab = (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          {MESES[mes]} {anio}
        </p>
        <div className="flex gap-4 flex-wrap">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{totVisitas}</p>
            <p className="text-xs text-gray-500">visitas</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-700 tabular-nums">{totFrancos}</p>
            <p className="text-xs text-gray-500">francos</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700 tabular-nums">{localesCubiertos}</p>
            <p className="text-xs text-gray-500">locales cubiertos</p>
          </div>
        </div>
      </div>
      <ResumenSemanal visitas={delMes} offset={offset} dias={dias} colores={colores} />
      <CoberturaLocales visitas={delMes} locales={state.locales} />
    </div>
  );

  // ── Vista Auditor ─────────────────────────────────────────────────────

  const misProximas = useMemo(() => {
    if (!sesion) return [];
    return [...visitas]
      .filter(v => v.fecha >= hoy && v.auditorEmail.toLowerCase() === sesion.email.toLowerCase())
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [visitas, hoy, sesion]);

  const misVisitas = (
    <div>
      <h2 className="text-sm font-bold text-gray-700 mb-3">Mis próximas visitas</h2>
      {misProximas.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin visitas próximas asignadas.</p>
      ) : (
        <div className="space-y-3">
          {misProximas.map(v => (
            <div key={v.visitaId}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{formatFechaLarga(v.fecha)}</p>
              {v.motivo !== 'Franco' && (
                <p className="text-base font-bold text-gray-900 mb-2">{v.local}</p>
              )}
              <div className="flex gap-2 flex-wrap mb-2">
                <span className={clsx(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  MOTIVO_CHIP[v.motivo] ?? 'bg-gray-100 text-gray-500',
                )}>
                  {MOTIVO_LABEL[v.motivo] ?? v.motivo}
                </span>
                <span className={clsx(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  v.estado === 'Realizada' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800',
                )}>
                  {v.estado}
                </span>
              </div>

              {v.motivo !== 'Franco' && (
                <div>
                  <button
                    onClick={() => toggleFallas(v.visitaId, v.local)}
                    className="text-xs text-blue-600 font-semibold flex items-center gap-1"
                  >
                    {fallasAbiertas[v.visitaId] ? '▲' : '▼'} Ver fallas anteriores
                    {fallasCargando[v.visitaId] && ' …'}
                  </button>

                  {fallasAbiertas[v.visitaId] && (
                    <div className="mt-3 space-y-3">
                      {!fallasData[v.local] ? (
                        <p className="text-xs text-gray-400">Cargando…</p>
                      ) : fallasData[v.local].length === 0 ? (
                        <p className="text-xs text-gray-400">Sin fallas registradas en las últimas auditorías.</p>
                      ) : (
                        fallasData[v.local].map(aud => (
                          <div key={aud.auditId}>
                            <p className="text-xs font-bold text-gray-600 mb-1">
                              Auditoría del {formatFechaLarga(aud.fecha)}
                            </p>
                            {aud.fallas.length === 0 ? (
                              <p className="text-xs text-gray-400">Sin fallas.</p>
                            ) : (
                              <ul className="space-y-1">
                                {aud.fallas.map((f, i) => {
                                  const esCritico = f.importancia.toLowerCase() === 'crítico' || f.importancia.toLowerCase() === 'critico';
                                  return (
                                    <li key={i} className={clsx(
                                      'text-xs rounded-lg px-3 py-2 border',
                                      esCritico
                                        ? 'bg-red-50 border-red-200 text-red-800'
                                        : 'bg-amber-50 border-amber-200 text-amber-800',
                                    )}>
                                      <span className="font-semibold">{f.control}</span>
                                      {f.subcategoria && <span className="text-opacity-70"> · {f.subcategoria}</span>}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Calendario</h1>
          <button onClick={cargar} disabled={cargando}
            className="text-sm text-red-600 font-medium disabled:text-gray-300">
            ↻ Actualizar
          </button>
        </div>

        {esAdmin && (
          <div className="flex gap-2">
            {(['calendario', 'visitas', 'resumen'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={clsx(
                  'flex-1 py-2 rounded-xl text-xs font-semibold',
                  tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600',
                )}>
                {t === 'calendario' ? '📅 Calendario' : t === 'visitas' ? '📋 Visitas' : '📊 Resumen'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Cargando calendario…</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-sm text-red-700 font-semibold mb-2">No se pudo cargar</p>
            <p className="text-xs text-red-500 mb-3">{error}</p>
            <button onClick={cargar} className="text-xs text-red-600 font-semibold">↻ Reintentar</button>
          </div>
        ) : esAdmin ? (
          tab === 'calendario' ? grilla : tab === 'visitas' ? listaVisitas : resumenTab
        ) : (
          misVisitas
        )}
      </div>

      {diaSel && esAdmin && (
        <ModalDia
          fecha={diaSel}
          visitas={porDia[diaSel] ?? []}
          locales={state.locales}
          auditores={auditores}
          colores={colores}
          onCerrar={() => setDiaSel(null)}
          onAgregar={handleAgregar}
          onEditar={handleEditar}
          onBorrar={handleBorrar}
        />
      )}

      <BottomNav />
    </div>
  );
}

export default function CalendarioPage() {
  return <AuthGuard><CalendarioContent /></AuthGuard>;
}
