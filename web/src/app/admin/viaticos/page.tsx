'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion, useCache } from '@/contexts/AppContext';
import {
  getViaticosAdmin, saveViaticos, editViatico, deleteViatico,
  fmtPesos, mesActual, moverMes, nombreMes,
  CAT_ICONO,
  type AuditorViaticos,
} from '@/services/gastos';
import { toDriveThumb } from '@/services/historial';
import clsx from 'clsx';

function ViaticosAdminContent() {
  const { sesion } = useSesion();
  const { leer, guardar, limpiar } = useCache();
  const router = useRouter();

  const [mes,          setMes]          = useState(mesActual());
  const [auditores,    setAuditores]    = useState<AuditorViaticos[]>([]);
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState('');
  const [expandido,    setExpandido]    = useState<string | null>(null);
  const [mensaje,      setMensaje]      = useState<{ texto: string; ok: boolean } | null>(null);
  const [nuevoImporte, setNuevoImporte] = useState<Record<string, string>>({});
  const [editandoViat, setEditandoViat] = useState<{ viaticoId: string; importe: string } | null>(null);

  function mostrarMensaje(texto: string, ok: boolean) {
    setMensaje({ texto, ok });
    setTimeout(() => setMensaje(null), 4000);
  }

  const cargar = useCallback(async (forzado = false) => {
    if (!sesion) return;
    const clave = `viaticos:${mes}`;
    const c = leer<AuditorViaticos[]>(clave);
    if (!forzado && c.fresco && c.data) { setAuditores(c.data); setCargando(false); return; }
    if (!c.data) setCargando(true);
    setError('');
    try {
      const d = await getViaticosAdmin(sesion, mes);
      guardar(clave, d);
      setAuditores(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [sesion, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);

  async function asignar(email: string) {
    if (!sesion) return;
    const imp = nuevoImporte[email] ?? '';
    if (!imp || isNaN(parseFloat(imp.replace(',', '.')))) {
      mostrarMensaje('Ingresá un importe válido.', false); return;
    }
    const res = await saveViaticos(sesion, email, mes, imp);
    if (res.ok) {
      limpiar(['gastos', 'viaticos']);
      setNuevoImporte(prev => ({ ...prev, [email]: '' }));
      await cargar(true);
      mostrarMensaje('✓ Viáticos asignados.', true);
    } else {
      mostrarMensaje(res.error ?? 'Error', false);
    }
  }

  async function handleEditViat(viaticoId: string, importe: string) {
    if (!sesion) return;
    const res = await editViatico(sesion, viaticoId, importe);
    if (res.ok) {
      limpiar(['gastos', 'viaticos']);
      setEditandoViat(null);
      await cargar(true);
      mostrarMensaje('✓ Monto actualizado.', true);
    } else {
      mostrarMensaje(res.error ?? 'Error', false);
    }
  }

  async function handleDeleteViat(viaticoId: string) {
    if (!sesion) return;
    if (!confirm('¿Borrar este ingreso de viáticos?')) return;
    const res = await deleteViatico(sesion, viaticoId);
    if (res.ok) {
      limpiar(['gastos', 'viaticos']);
      await cargar(true);
    } else {
      mostrarMensaje(res.error ?? 'Error', false);
    }
  }

  const totalAsignado  = auditores.reduce((a, x) => a + x.viaticos,     0);
  const totalGastado   = auditores.reduce((a, x) => a + x.totalGastado, 0);
  const totalSaldo     = auditores.reduce((a, x) => a + x.saldo,        0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.push('/admin')} className="text-blue-600 text-sm mb-2">← Admin</button>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Viáticos</h1>
          <button onClick={() => cargar(true)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl text-gray-600">
            ↻ Actualizar
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => setMes(m => moverMes(m, -1))} className="text-2xl px-2">‹</button>
          <span className="text-sm font-medium text-gray-700">{nombreMes(mes)}</span>
          <button onClick={() => setMes(m => moverMes(m, +1))} className="text-2xl px-2">›</button>
        </div>
      </div>

      {mensaje && (
        <div className={clsx('mx-4 mt-4 p-3 rounded-xl text-sm font-medium',
          mensaje.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200')}>
          {mensaje.texto}
        </div>
      )}

      {cargando && !auditores.length && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudieron cargar los viáticos</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <button onClick={() => cargar(true)} className="mt-2 text-xs text-red-700 underline">Reintentar</button>
        </div>
      )}

      {auditores.length > 0 && (
        <div className="px-4 mt-4 space-y-3">
          {/* Totales */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-2 font-medium">Totales de la cadena</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-500">Asignado</p>
                <p className="text-base font-semibold text-gray-900">{fmtPesos(totalAsignado)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Gastado</p>
                <p className="text-base font-semibold text-gray-900">{fmtPesos(totalGastado)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Saldo</p>
                <p className={clsx('text-base font-semibold', totalSaldo < 0 ? 'text-red-600' : 'text-gray-900')}>
                  {fmtPesos(totalSaldo)}
                </p>
              </div>
            </div>
          </div>

          {/* Lista por auditor */}
          {auditores.map(a => {
            const abierto = expandido === a.email;
            return (
              <div key={a.email} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Fila resumen */}
                <button
                  onClick={() => setExpandido(abierto ? null : a.email)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{a.nombre}</p>
                    <p className="text-xs text-gray-400">{a.email}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtPesos(a.totalGastado)} / {fmtPesos(a.viaticos)} gastado
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={clsx('text-sm font-bold', a.saldo < 0 ? 'text-red-600' : 'text-green-700')}>
                      {fmtPesos(a.saldo)}
                    </p>
                    <p className="text-xs text-gray-400">saldo</p>
                  </div>
                  <span className="text-gray-300 text-lg ml-1">{abierto ? '∨' : '›'}</span>
                </button>

                {/* Detalle expandido */}
                {abierto && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    {/* Viáticos asignados */}
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-2">Viáticos asignados</p>
                      {a.ingresos.length === 0
                        ? <p className="text-xs text-gray-400">Sin ingresos este mes.</p>
                        : a.ingresos.map(i => (
                          <div key={i.viaticoId} className="flex items-center gap-2 mb-2">
                            {editandoViat?.viaticoId === i.viaticoId ? (
                              <>
                                <div className="relative flex-1">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                                  <input type="text" inputMode="decimal"
                                    value={editandoViat.importe}
                                    onChange={e => setEditandoViat({ viaticoId: i.viaticoId, importe: e.target.value })}
                                    className="w-full pl-5 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                                  />
                                </div>
                                <button onClick={() => handleEditViat(i.viaticoId, editandoViat.importe)}
                                  className="text-xs px-2 py-1.5 bg-gray-900 text-white rounded-lg">✓</button>
                                <button onClick={() => setEditandoViat(null)}
                                  className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-500">✕</button>
                              </>
                            ) : (
                              <>
                                <div className="flex-1">
                                  <span className="text-sm font-medium text-gray-900">{fmtPesos(i.importe)}</span>
                                  <span className="text-xs text-gray-400 ml-2">{i.fecha}</span>
                                </div>
                                <button onClick={() => setEditandoViat({ viaticoId: i.viaticoId, importe: String(i.importe) })}
                                  className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-600">Editar</button>
                                <button onClick={() => handleDeleteViat(i.viaticoId)}
                                  className="text-xs px-2 py-1 border border-red-200 rounded-lg text-red-500">🗑</button>
                              </>
                            )}
                          </div>
                        ))
                      }

                      {/* Asignar nuevo */}
                      <div className="flex gap-2 mt-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                          <input type="text" inputMode="decimal"
                            value={nuevoImporte[a.email] ?? ''}
                            onChange={e => setNuevoImporte(prev => ({ ...prev, [a.email]: e.target.value }))}
                            placeholder="0"
                            className="w-full pl-5 pr-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                          />
                        </div>
                        <button onClick={() => asignar(a.email)}
                          className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold">
                          Asignar
                        </button>
                      </div>
                    </div>

                    {/* Gastos del auditor */}
                    {a.gastos.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Gastos del mes</p>
                        <div className="space-y-2">
                          {a.gastos.map(g => (
                            <div key={g.gastoId} className="flex items-center gap-2">
                              <span className="text-xl flex-shrink-0">{CAT_ICONO[g.categoria] ?? '📦'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700 truncate">{g.descripcion || g.categoria}</p>
                                <p className="text-xs text-gray-400">{g.fecha}</p>
                              </div>
                              <p className="text-xs font-semibold text-gray-900 flex-shrink-0">{fmtPesos(g.importe)}</p>
                              {g.fotoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <a href={g.fotoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                  <img
                                    src={toDriveThumb(g.fotoUrl)}
                                    alt="Comprobante"
                                    className="w-8 h-8 object-cover rounded border border-gray-200 flex-shrink-0"
                                  />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!cargando && !error && auditores.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-16">No hay auditores con viáticos habilitados.</p>
      )}

      <BottomNav />
    </div>
  );
}

export default function ViaticosAdminPage() {
  return <AuthGuard requiredRol="Admin"><ViaticosAdminContent /></AuthGuard>;
}
