'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import FormPregunta from '@/components/admin/FormPregunta';
import { useSesion, useCache } from '@/contexts/AppContext';
import {
  getPreguntasAdmin, addPregunta, editPregunta, deletePregunta,
  type PreguntaAdmin, type PreguntaInput,
} from '@/services/preguntas';
import { parseValidacion } from '@/services/validaciones';
import clsx from 'clsx';

const IMP_CHIP: Record<string, string> = {
  critico: 'bg-red-100 text-red-800',
  alta:    'bg-orange-100 text-orange-800',
  media:   'bg-yellow-100 text-yellow-800',
  baja:    'bg-green-100 text-green-700',
};

function tipoEval(v: string): string | null {
  const r = parseValidacion(v);
  if (!r) return null;
  if (r.tipo === 'numero')    return 'Numérico';
  if (r.tipo === 'fecha')     return 'Vencimiento';
  if (r.tipo === 'headcount') return 'Dotación';
  return null;
}

type FiltroPill = 'Todas' | 'Multimarca' | 'Causa';

function PreguntasContent() {
  const { sesion } = useSesion();
  const { leer, guardar, limpiar } = useCache();
  const router = useRouter();

  const [preguntas,    setPreguntas]    = useState<PreguntaAdmin[]>([]);
  const [cargando,     setCargando]     = useState(true);
  const [recargando,   setRecargando]   = useState(false);
  const [error,        setError]        = useState('');
  const [mensaje,      setMensaje]      = useState<{ texto: string; ok: boolean } | null>(null);
  const [formPregunta, setFormPregunta] = useState<PreguntaAdmin | null | 'nueva'>(null);

  // Filtros
  const [pill,         setPill]         = useState<FiltroPill>('Todas');
  const [catFiltro,    setCatFiltro]    = useState('');
  const [busqueda,     setBusqueda]     = useState('');

  function mostrarMensaje(texto: string, ok: boolean) {
    setMensaje({ texto, ok });
    setTimeout(() => setMensaje(null), 4000);
  }

  const cargar = useCallback(async (forzado = false) => {
    if (!sesion) return;
    const c = leer<PreguntaAdmin[]>('preguntas');
    if (!forzado && c.fresco && c.data) { setPreguntas(c.data); setCargando(false); return; }
    if (!c.data) setCargando(true); else setRecargando(true);
    setError('');
    try {
      const d = await getPreguntasAdmin(sesion);
      guardar('preguntas', d);
      setPreguntas(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
      setRecargando(false);
    }
  }, [sesion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);

  const categorias = useMemo(() => [...new Set(preguntas.map(p => p.categoria).filter(Boolean))].sort(), [preguntas]);
  const subcats    = useMemo(() => [...new Set(preguntas.map(p => p.subcategoria).filter(Boolean))].sort(), [preguntas]);

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase();
    return preguntas.filter(p => {
      if (pill !== 'Todas' && p.marca !== pill) return false;
      if (catFiltro && p.categoria !== catFiltro) return false;
      if (q && !p.control.toLowerCase().includes(q) &&
               !p.categoria.toLowerCase().includes(q) &&
               !p.subcategoria.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [preguntas, pill, catFiltro, busqueda]);

  const grupos = useMemo(() => {
    const orden: string[] = [];
    const map = new Map<string, PreguntaAdmin[]>();
    filtradas.forEach(p => {
      const cat = p.categoria || '(sin categoría)';
      if (!map.has(cat)) { map.set(cat, []); orden.push(cat); }
      map.get(cat)!.push(p);
    });
    return orden.map(cat => ({ cat, items: map.get(cat)! }));
  }, [filtradas]);

  async function handleGuardar(input: PreguntaInput) {
    if (!sesion) return;
    let res;
    if (formPregunta === 'nueva') {
      res = await addPregunta(sesion, input);
    } else if (formPregunta) {
      res = await editPregunta(sesion, formPregunta.rowIndex, input);
    } else return;

    if (!res.ok) { mostrarMensaje(res.error ?? 'Error al guardar.', false); return; }

    limpiar(['preguntas']);
    setFormPregunta(null);
    mostrarMensaje(
      formPregunta === 'nueva'
        ? 'Pregunta creada. Estará disponible en las auditorías en unos minutos.'
        : 'Pregunta actualizada.',
      true,
    );
    await cargar(true);
  }

  async function handleBorrar() {
    if (!sesion || !formPregunta || formPregunta === 'nueva') return;
    const p = formPregunta;
    const ok = confirm(
      `¿Eliminar el control "${p.control}"?\n\n` +
      `Deja de aparecer en las auditorías nuevas de las dos apps. ` +
      `Las auditorías ya realizadas conservan sus respuestas.\n\n` +
      `Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    const res = await deletePregunta(sesion, p.rowIndex);
    if (!res.ok) { mostrarMensaje(res.error ?? 'Error al borrar.', false); return; }

    limpiar(['preguntas']);
    setFormPregunta(null);
    mostrarMensaje('Pregunta eliminada. Recargando la lista...', true);
    // Los rowIndex de abajo se corrieron: recargar obligatorio
    setRecargando(true);
    await cargar(true);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.push('/admin')} className="text-blue-600 text-sm mb-2">← Admin</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Preguntas</h1>
            <p className="text-sm text-gray-400">
              {recargando ? 'Actualizando...' : `${preguntas.length} preguntas`}
            </p>
          </div>
          <button onClick={() => cargar(true)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl text-gray-600">
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* Aviso principal */}
      <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-xs text-amber-800 font-medium">
          Los cambios afectan a las dos apps y pueden tardar unos minutos en verse en las auditorías.
        </p>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={clsx('mx-4 mt-3 p-3 rounded-xl text-sm font-medium',
          mensaje.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200')}>
          {mensaje.texto}
        </div>
      )}

      {/* Filtros */}
      <div className="px-4 mt-4 space-y-2">
        {/* Pills de marca */}
        <div className="flex gap-2">
          {(['Todas', 'Multimarca', 'Causa'] as FiltroPill[]).map(p => (
            <button key={p} onClick={() => setPill(p)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-semibold border',
                pill === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200')}>
              {p}
            </button>
          ))}
        </div>

        {/* Select de categoría */}
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm">
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Buscador */}
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por control, categoría o subcategoría..."
          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm" />

        <p className="text-xs text-gray-400">
          Mostrando {filtradas.length} de {preguntas.length}
        </p>
      </div>

      {/* Lista */}
      <div className="px-4 mt-3 space-y-4">
        {cargando && !preguntas.length && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!cargando && error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-900">No se pudieron cargar las preguntas</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
            <button onClick={() => cargar(true)} className="mt-2 text-xs text-red-700 underline">Reintentar</button>
          </div>
        )}

        {grupos.map(g => (
          <div key={g.cat}>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-bold text-gray-700">{g.cat}</h2>
              <span className="text-xs text-gray-400">({g.items.length})</span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
              {g.items.map(p => {
                const impKey = p.importancia.toLowerCase().replace('í', 'i').trim();
                const eval_ = tipoEval(p.validacion);
                return (
                  <button
                    key={p.rowIndex}
                    onClick={() => !recargando && setFormPregunta(p)}
                    disabled={recargando}
                    className="w-full px-4 py-3 text-left active:bg-gray-50 disabled:opacity-50"
                  >
                    {p.subcategoria && (
                      <p className="text-xs text-gray-400 mb-0.5">{p.subcategoria}</p>
                    )}
                    <p className="text-sm font-semibold text-gray-900">{p.control}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                        IMP_CHIP[impKey] ?? 'bg-gray-100 text-gray-600')}>
                        {p.importancia}
                      </span>
                      {p.marca === 'Causa' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Causa</span>
                      )}
                      {eval_ && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{eval_}</span>
                      )}
                      {p.imagen && (
                        <span className="text-xs text-gray-400">📷</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {!cargando && !error && filtradas.length === 0 && preguntas.length > 0 && (
          <p className="text-center text-sm text-gray-400 py-8">Sin resultados para esos filtros.</p>
        )}
      </div>

      <p className="text-xs text-gray-400 px-4 pb-4 mt-4">
        Los cambios se ven en las auditorías nuevas después de unos minutos, y afectan también a la app anterior.
      </p>

      {/* Botón fijo */}
      <div className="fixed bottom-20 left-0 right-0 flex justify-center pointer-events-none">
        <button
          onClick={() => !recargando && setFormPregunta('nueva')}
          disabled={recargando}
          className="pointer-events-auto px-6 py-3 bg-gray-900 text-white rounded-full text-sm font-bold shadow-lg disabled:opacity-50">
          + Nueva pregunta
        </button>
      </div>

      {/* Formulario */}
      {formPregunta !== null && (
        <FormPregunta
          pregunta={formPregunta === 'nueva' ? null : formPregunta}
          categorias={categorias}
          subcats={subcats}
          onCerrar={() => setFormPregunta(null)}
          onGuardar={handleGuardar}
          onBorrar={formPregunta !== 'nueva' ? handleBorrar : undefined}
        />
      )}

      <BottomNav />
    </div>
  );
}

export default function PreguntasPage() {
  return <AuthGuard requiredRol="Admin"><PreguntasContent /></AuthGuard>;
}
