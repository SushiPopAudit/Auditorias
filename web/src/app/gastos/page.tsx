'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import FormGasto from '@/components/gastos/FormGasto';
import { useSesion, useCache } from '@/contexts/AppContext';
import {
  getGastos, deleteGasto, solicitarViaticos,
  fmtPesos, mesActual, moverMes, nombreMes,
  CAT_ICONO,
  type DatosMes, type Gasto, type GastoInput,
  saveGasto,
} from '@/services/gastos';
import clsx from 'clsx';

function GastosContent() {
  const { sesion } = useSesion();
  const { leer, guardar, limpiar } = useCache();
  const router = useRouter();

  const [mes,          setMes]          = useState(mesActual());
  const [datos,        setDatos]        = useState<DatosMes | null>(null);
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState('');
  const [mensaje,      setMensaje]      = useState('');
  const [formGasto,    setFormGasto]    = useState<Gasto | null | 'nuevo'>(null);
  const [modalSolicitud, setModalSolicitud] = useState(false);
  const [importeSol,   setImporteSol]   = useState('');
  const [comentarioSol, setComentarioSol] = useState('');
  const [enviando,     setEnviando]     = useState(false);

  function mostrarMensaje(texto: string) {
    setMensaje(texto);
    setTimeout(() => setMensaje(''), 4000);
  }

  const cargar = useCallback(async (forzado = false) => {
    if (!sesion) return;
    const clave = `gastos:${mes}`;
    const c = leer<DatosMes>(clave);
    if (!forzado && c.fresco && c.data) { setDatos(c.data); setCargando(false); return; }
    if (!c.data) setCargando(true);
    setError('');
    try {
      const d = await getGastos(sesion, mes);
      guardar(clave, d);
      setDatos(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [sesion, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);

  async function handleGuardar(input: GastoInput) {
    if (!sesion) return;
    const res = await saveGasto(sesion, input);
    limpiar(['gastos', 'viaticos']);
    await cargar(true);
    if (res.ok) { setFormGasto(null); return; }
    if (res.sinConfirmar) {
      mostrarMensaje('Revisá si el gasto quedó cargado en la lista. Si no aparece, intentá de nuevo.');
      setFormGasto(null);
      return;
    }
    setError(res.error ?? 'No se pudo guardar.');
  }

  async function handleBorrar(g: Gasto) {
    if (!sesion) return;
    if (!confirm(`¿Borrar el gasto de ${fmtPesos(g.importe)}?`)) return;
    const res = await deleteGasto(sesion, g.gastoId);
    limpiar(['gastos', 'viaticos']);
    await cargar(true);
    if (!res.ok) mostrarMensaje(res.error ?? 'No se pudo borrar.');
  }

  async function handleSolicitud() {
    if (!sesion || enviando || !datos) return;
    const imp = importeSol.replace(/\./g, '').replace(',', '.');
    if (!imp || isNaN(parseFloat(imp)) || parseFloat(imp) <= 0) {
      mostrarMensaje('Ingresá un importe válido.'); return;
    }
    setEnviando(true);
    const res = await solicitarViaticos(
      sesion, mes, importeSol, datos.totalGastado, datos.viaticos, comentarioSol,
    );
    setEnviando(false);
    if (res.ok) {
      setModalSolicitud(false);
      setImporteSol('');
      setComentarioSol('');
      mostrarMensaje('✓ Solicitud enviada. El admin la revisará.');
    } else {
      mostrarMensaje(res.error ?? 'No se pudo enviar.');
    }
  }

  if (!sesion?.viaticos) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center pb-24 text-center px-6">
        <span className="text-5xl mb-4">💰</span>
        <h1 className="text-xl font-bold text-gray-900">Gastos y Viáticos</h1>
        <p className="text-gray-500 text-sm mt-2">No tenés habilitada la carga de gastos.</p>
        <button onClick={() => router.push('/welcome')}
          className="mt-4 px-6 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
          ← Inicio
        </button>
        <BottomNav />
      </div>
    );
  }

  const viaticos     = datos?.viaticos     ?? 0;
  const totalGastado = datos?.totalGastado ?? 0;
  const saldo        = viaticos - totalGastado;
  const pct          = viaticos > 0 ? Math.min(100, (totalGastado / viaticos) * 100) : 0;
  const colorBarra   = pct >= 90 ? 'bg-red-600' : pct >= 70 ? 'bg-amber-500' : 'bg-green-600';

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <h1 className="text-xl font-bold text-gray-900">Mis Gastos</h1>
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => setMes(m => moverMes(m, -1))} className="text-2xl px-2">‹</button>
          <span className="text-sm font-medium text-gray-700">{nombreMes(mes)}</span>
          <button onClick={() => setMes(m => moverMes(m, +1))} className="text-2xl px-2">›</button>
        </div>
      </div>

      {mensaje && (
        <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          {mensaje}
        </div>
      )}

      {cargando && !datos && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!cargando && error && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900">No se pudieron cargar los datos</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <button onClick={() => cargar(true)} className="mt-2 text-xs text-red-700 underline">Reintentar</button>
        </div>
      )}

      {datos && (
        <div className="px-4 mt-4 space-y-4">
          {/* Tarjeta resumen */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-500">Viáticos</p>
                <p className="text-lg font-semibold text-gray-900">{fmtPesos(viaticos)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Gastado</p>
                <p className="text-lg font-semibold text-gray-900">{fmtPesos(totalGastado)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Saldo</p>
                <p className={clsx('text-lg font-semibold', saldo < 0 ? 'text-red-600' : 'text-gray-900')}>
                  {fmtPesos(saldo)}
                </p>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
              <div className={clsx('h-full rounded-r-[4px]', colorBarra)} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-right">{Math.round(pct)}% consumido</p>
          </div>

          {/* Aviso al 90% */}
          {pct >= 90 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-amber-900">
                {saldo < 0 ? 'Te pasaste del monto asignado' : 'Estás por agotar tus viáticos'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">Llevás {Math.round(pct)}% del mes consumido.</p>
              <button onClick={() => setModalSolicitud(true)}
                className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">
                Solicitar más viáticos
              </button>
            </div>
          )}

          {/* Ingresos asignados */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 font-semibold text-sm text-gray-800">
              Viáticos asignados
            </div>
            {datos.ingresos.length === 0
              ? <p className="px-4 py-3 text-sm text-gray-400">Todavía no te asignaron viáticos este mes.</p>
              : datos.ingresos.map(i => (
                <div key={i.viaticoId} className="px-4 py-3 flex justify-between items-center border-t border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{fmtPesos(i.importe)}</p>
                    <p className="text-xs text-gray-400">{i.fecha} · {i.cargadoPor}</p>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Lista de gastos */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 font-semibold text-sm text-gray-800 flex justify-between items-center">
              <span>Gastos del mes</span>
              <span className="text-xs font-normal text-gray-500">{datos.gastos.length} registros</span>
            </div>
            {datos.gastos.length === 0
              ? <p className="px-4 py-4 text-sm text-gray-400">No hay gastos cargados este mes.</p>
              : datos.gastos.map(g => (
                <div key={g.gastoId} className="border-t border-gray-50">
                  <button
                    onClick={() => setFormGasto(g)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-gray-50"
                  >
                    <span className="text-2xl flex-shrink-0">{CAT_ICONO[g.categoria] ?? '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {g.descripcion || g.categoria}
                      </p>
                      <p className="text-xs text-gray-400">{g.fecha}{g.fotoUrl && ' · 📎'}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 flex-shrink-0">{fmtPesos(g.importe)}</p>
                  </button>
                  <div className="px-4 pb-2 flex justify-end">
                    <button onClick={() => handleBorrar(g)}
                      className="text-xs text-red-500 px-2 py-1">
                      🗑 Borrar
                    </button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Botón fijo */}
      <div className="fixed bottom-20 left-0 right-0 flex justify-center pointer-events-none">
        <button
          onClick={() => setFormGasto('nuevo')}
          className="pointer-events-auto px-6 py-3 bg-gray-900 text-white rounded-full text-sm font-bold shadow-lg">
          + Registrar gasto
        </button>
      </div>

      {/* Modal solicitud */}
      {modalSolicitud && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">Solicitar más viáticos</h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Importe adicional</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input type="text" inputMode="decimal" value={importeSol}
                  onChange={e => setImporteSol(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Comentario (opcional)</label>
              <textarea value={comentarioSol} onChange={e => setComentarioSol(e.target.value)}
                placeholder="Explicá brevemente por qué necesitás más viáticos..."
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm min-h-[80px]" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalSolicitud(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600">
                Cancelar
              </button>
              <button onClick={handleSolicitud} disabled={enviando}
                className="flex-[2] py-3 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-50">
                {enviando ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulario de gasto */}
      {formGasto !== null && (
        <FormGasto
          gasto={formGasto === 'nuevo' ? null : formGasto}
          onCerrar={() => setFormGasto(null)}
          onGuardar={handleGuardar}
        />
      )}

      <BottomNav />
    </div>
  );
}

export default function GastosPage() {
  return <AuthGuard><GastosContent /></AuthGuard>;
}
