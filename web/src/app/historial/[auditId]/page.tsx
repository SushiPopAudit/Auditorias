'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useSesion, useCache, useApp } from '@/contexts/AppContext';
import { getAuditoria, borrarAuditoria, toDriveThumb, type AuditoriaDetalle } from '@/services/historial';
import ModalReenvio from '@/components/historial/ModalReenvio';
import clsx from 'clsx';

const IMP_STYLE: Record<string, string> = {
  critico: 'bg-red-100 text-red-800',
  alta:    'bg-orange-100 text-orange-800',
  media:   'bg-yellow-100 text-yellow-800',
  baja:    'bg-green-100 text-green-700',
};

function normImp(s: string): string {
  return (s || '').toLowerCase().trim().replace(/í/g, 'i');
}

function respStyle(r: string): string {
  const v = (r || '').toLowerCase();
  if (v.includes('no cumple') || v === 'nocumple') return 'bg-red-50  text-red-700';
  if (v.includes('parcial'))                       return 'bg-amber-50 text-amber-700';
  if (v === 'cumple' || v === 'n/a')               return 'bg-green-50 text-green-700';
  return 'bg-gray-100 text-gray-600';
}

function DetalleContent() {
  const { sesion } = useSesion();
  const { limpiar } = useCache();
  const { state } = useApp();
  const router = useRouter();
  const params = useParams();
  const auditId = decodeURIComponent(String(params.auditId ?? ''));

  const [det, setDet]           = useState<AuditoriaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [borrando, setBorrando] = useState(false);
  const [reenvio, setReenvio]   = useState(false);

  const esAdmin = sesion?.rol === 'Admin';

  const emailsDet = det
    ? (state.locales.find(l => l.nombre === det.local)?.emails ?? '')
    : '';

  useEffect(() => {
    if (!sesion || !auditId) return;
    setCargando(true);
    getAuditoria(sesion, auditId)
      .then(d => {
        setDet(d);
        const init: Record<string, boolean> = {};
        d.respuestas.forEach(r => {
          const v = (r.respuesta || '').toLowerCase();
          if (v.includes('no cumple') || v === 'nocumple') init[r.categoria] = true;
        });
        setAbiertas(init);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [sesion, auditId]);

  async function handleBorrar() {
    if (!det) return;
    const ok = confirm(
      `¿Borrar la auditoría de ${det.local} del ${det.fecha}?\n\n` +
      `Se eliminarán todas las respuestas y las fotos de Drive. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setBorrando(true);
    const res = await borrarAuditoria(det.auditId);
    setBorrando(false);
    if (!res.ok) { alert(`No se pudo borrar: ${res.error}`); return; }
    limpiar(['historial', 'dashboard']);
    router.replace('/historial');
  }

  const grupos = useMemo(() => {
    if (!det) return [];
    const orden: string[] = [];
    const map = new Map<string, typeof det.respuestas>();
    det.respuestas.forEach(r => {
      const cat = r.categoria || 'Sin categoría';
      if (!map.has(cat)) { map.set(cat, []); orden.push(cat); }
      map.get(cat)!.push(r);
    });
    return orden.map(cat => {
      const items = map.get(cat)!;
      const nc  = items.filter(r => {
        const v = (r.respuesta || '').toLowerCase();
        return v.includes('no cumple') || v === 'nocumple';
      }).length;
      const par = items.filter(r => (r.respuesta || '').toLowerCase().includes('parcial')).length;
      return { cat, items, nc, par };
    });
  }, [det]);

  const dist = useMemo(() => {
    if (!det) return { cumple: 0, nc: 0, parcial: 0, na: 0 };
    let cumple = 0, nc = 0, parcial = 0, na = 0;
    det.respuestas.forEach(r => {
      const v = (r.respuesta || '').toLowerCase();
      if (v.includes('aplica'))                           na++;
      else if (v.includes('parcial'))                     parcial++;
      else if (v.includes('no cumple') || v==='nocumple') nc++;
      else if (v === 'cumple')                            cumple++;
    });
    return { cumple, nc, parcial, na };
  }, [det]);

  const scoreBg = det
    ? det.puntaje.reprobado ? 'bg-red-800'
      : det.puntaje.pct >= 90 ? 'bg-green-600'
      : det.puntaje.pct >= 75 ? 'bg-yellow-500'
      : det.puntaje.pct >= 60 ? 'bg-orange-500' : 'bg-red-600'
    : 'bg-gray-400';

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.push('/historial')} className="text-red-600 text-sm mb-2">
          ← Historial
        </button>
        {det && (
          <>
            <h1 className="text-xl font-bold text-gray-900">{det.local}</h1>
            <p className="text-sm text-gray-400">
              {det.fecha}{det.hora ? ` · ${det.hora}` : ''} · {det.auditor}
            </p>
          </>
        )}
      </div>

      {cargando && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudo cargar la auditoría</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      )}

      {det && (
        <div className="px-4 py-4 space-y-4">
          <div className={clsx('rounded-2xl p-5 text-white text-center', scoreBg)}>
            <p className="text-4xl font-bold">
              {det.puntaje.reprobado ? '⛔' : `${det.puntaje.pct}%`}
            </p>
            <p className="text-lg font-semibold mt-1">{det.puntaje.nivel}</p>
            <p className="text-sm opacity-80 mt-0.5">
              {det.puntaje.obtenido} / {det.puntaje.posible} pts
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/historial/${encodeURIComponent(det.auditId)}/editar`)}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold"
            >
              ✏️ Editar
            </button>
            <button
              onClick={() => setReenvio(true)}
              className="px-4 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold"
            >
              ✉️ Reenviar
            </button>
            {esAdmin && (
              <button
                onClick={handleBorrar}
                disabled={borrando}
                className="px-4 py-3 rounded-xl border border-red-300 text-red-600 text-sm font-semibold disabled:opacity-50"
              >
                {borrando ? 'Borrando...' : '🗑 Borrar'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              { l: 'Cumple',    v: dist.cumple,  c: 'text-green-700  bg-green-50'  },
              { l: 'Parcial',   v: dist.parcial, c: 'text-amber-700  bg-amber-50'  },
              { l: 'No cumple', v: dist.nc,      c: 'text-red-700    bg-red-50'    },
              { l: 'No aplica', v: dist.na,      c: 'text-gray-600   bg-gray-100'  },
            ].map(s => (
              <div key={s.l} className={clsx('rounded-xl py-3 text-center', s.c)}>
                <p className="text-xl font-bold">{s.v}</p>
                <p className="text-xs mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            {[
              ['Local',       det.local],
              ['Marca',       det.marca],
              ['Auditor',     det.auditor],
              ['Acompañante', det.acompanante
                ? `${det.acompanante}${det.posicionAcompanante ? ` (${det.posicionAcompanante})` : ''}`
                : '—'],
              ['Tipo',        det.tipo],
              ['ID',          det.auditId],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-sm">
                <span className="text-gray-400 flex-shrink-0">{k}</span>
                <span className="text-gray-900 font-medium text-right break-all">{v}</span>
              </div>
            ))}
          </div>

          {grupos.map(g => {
            const open = !!abiertas[g.cat];
            return (
              <div key={g.cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setAbiertas(p => ({ ...p, [g.cat]: !p[g.cat] }))}
                  className={clsx('w-full px-4 py-3 flex items-center justify-between gap-2 text-left',
                    g.nc > 0 ? 'bg-red-50' : 'bg-gray-50')}>
                  <span className={clsx('font-semibold text-sm', g.nc > 0 ? 'text-red-900' : 'text-gray-800')}>
                    {g.cat}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      {g.nc > 0    ? `${g.nc} incumpl.`
                       : g.par > 0 ? `${g.par} parcial`
                       : '✓ OK'}
                    </span>
                    <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
                  </span>
                </button>

                {open && (
                  <ul className="divide-y divide-gray-50">
                    {g.items.map((r, i) => {
                      const imp = normImp(r.importancia);
                      return (
                        <li key={i} className="px-4 py-3">
                          {r.subcategoria && (
                            <p className="text-xs text-gray-400">{r.subcategoria}</p>
                          )}
                          <p className="text-sm font-medium text-gray-900 mt-0.5">{r.control}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full',
                              respStyle(r.respuesta))}>
                              {r.respuesta || '—'}
                              {r.rawValor && ` (${r.rawValor})`}
                            </span>
                            {imp && (
                              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                                IMP_STYLE[imp] ?? 'bg-gray-100 text-gray-600')}>
                                {r.importancia}
                              </span>
                            )}
                          </div>
                          {r.observacion && (
                            <p className="text-xs text-gray-500 italic mt-1.5">
                              &ldquo;{r.observacion}&rdquo;
                            </p>
                          )}
                          {r.fotoUrls.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {r.fotoUrls.map((u, j) => (
                                <a key={j} href={u} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={toDriveThumb(u)} alt={`foto ${j + 1}`} loading="lazy"
                                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 bg-gray-50" />
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reenvio && det && (
        <ModalReenvio
          auditId={det.auditId}
          local={det.local}
          fecha={det.fecha}
          emailsLocal={emailsDet}
          onCerrar={() => setReenvio(false)}
        />
      )}
    </div>
  );
}

export default function DetallePage() {
  return <AuthGuard><DetalleContent /></AuthGuard>;
}
