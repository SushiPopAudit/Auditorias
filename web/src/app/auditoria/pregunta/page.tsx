'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import RespuestaRadio from '@/components/auditoria/RespuestaRadio';
import FotoCapture from '@/components/auditoria/FotoCapture';
import InputNumerico from '@/components/auditoria/InputNumerico';
import AyudaSheet from '@/components/auditoria/AyudaSheet';
import { useApp } from '@/contexts/AppContext';
import type { RespuestaItem, FotoItem } from '@/types';
import {
  parseValidacion, evaluarNumero, evaluarFecha,
  observacionObligatoria, fotoObligatoria, fotoBloquea,
  HEADCOUNT_SECTORES, headcountKey, parseAnswerType, extraerUnidad,
} from '@/services/validaciones';
import clsx from 'clsx';

const OPCIONES_DEFAULT = ['Cumple', 'Cumple parcialmente', 'No Cumple', 'No aplica'];

function PreguntaContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { auditoria } = state;

  const cat      = auditoria.categorias[auditoria.catIndex];
  const pregunta = cat?.questions[auditoria.qIndex];

  const [respuesta,   setRespuesta]   = useState('');
  const [observacion, setObservacion] = useState('');
  const [rawValor,    setRawValor]    = useState('');
  const [fechaRaw,    setFechaRaw]    = useState('');
  const [headcount,   setHeadcount]   = useState<Record<string, string>>({});
  const [fotos,       setFotos]       = useState<FotoItem[]>([]);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  useEffect(() => {
    if (!auditoria.local) { router.replace('/auditoria/setup'); return; }
    if (!cat)             { router.replace('/auditoria/categorias'); return; }
  }, [auditoria.local, cat, router]);

  // Cargar respuesta existente al cambiar de pregunta
  useEffect(() => {
    if (!pregunta) return;
    const ans = auditoria.answers[pregunta.id];
    setRespuesta(ans?.respuesta ?? '');
    setObservacion(ans?.observacion ?? '');
    setRawValor(ans?.rawValor ?? '');
    setFechaRaw(ans?.fechaRaw ?? '');
    setHeadcount(ans?.headcount ?? {});
    setFotos(ans?.fotos ?? []);
    const regla = parseValidacion(pregunta.validacion ?? '');
    if (regla?.tipo === 'headcount' && !ans?.respuesta) setRespuesta('N/A');
  }, [pregunta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cat || !pregunta) return null;

  const regla    = parseValidacion(pregunta.validacion ?? '');
  const esUltima = auditoria.qIndex === cat.questions.length - 1;

  // Progreso global (todas las categorías)
  const todasPreguntas = auditoria.categorias.flatMap(c => c.questions);
  const totalGlobal    = todasPreguntas.length;
  const respondidas    = todasPreguntas.filter(q =>
    auditoria.answers[q.id]?.respuesta || auditoria.skipped[q.id]
  ).length;
  const progresoGlobal = totalGlobal > 0 ? (respondidas / totalGlobal) * 100 : 0;

  let inputTipo: string;
  let inputOpciones: string[] = [];
  if (regla?.tipo === 'headcount')     inputTipo = 'headcount';
  else if (regla?.tipo === 'fecha')    inputTipo = 'fecha_auto';
  else if (regla?.tipo === 'numero')   inputTipo = 'numero_auto';
  else {
    const parsed  = parseAnswerType(pregunta.pregunta, pregunta.tipoRespuesta);
    inputTipo     = parsed.type;
    inputOpciones = parsed.options;
  }

  const numRegla    = regla?.tipo === 'numero' ? regla : null;
  const fechaRegla  = regla?.tipo === 'fecha'  ? regla : null;
  const noAplicaNum = respuesta === 'No aplica';

  const normalizeNum = (v: string) => v.replace(/,/g, '.');
  const veredictoNum   = numRegla && rawValor && !noAplicaNum
    ? evaluarNumero(normalizeNum(rawValor), numRegla) : null;
  const veredictoFecha = fechaRegla && fechaRaw ? evaluarFecha(fechaRaw) : null;

  const unidad        = extraerUnidad(pregunta.pregunta);
  const obsObligatoria = observacionObligatoria(respuesta, pregunta.validacion ?? '');
  const fotoObl        = fotoObligatoria(respuesta, pregunta.imagen ?? '');

  const esSaltada = !!auditoria.skipped[pregunta.id];

  const IMP_COLOR: Record<string, string> = {
    crítico: 'bg-red-100 text-red-700', critico: 'bg-red-100 text-red-700',
    alta:    'bg-orange-100 text-orange-700', media: 'bg-yellow-100 text-yellow-700',
    baja:    'bg-gray-100 text-gray-600',
  };
  const VEREDICTO_STYLE: Record<string, string> = {
    'Cumple':              'text-green-700 bg-green-50',
    'Cumple parcialmente': 'text-amber-700 bg-amber-50',
    'No Cumple':           'text-red-700 bg-red-50',
  };

  const buildItem = (): RespuestaItem => ({
    preguntaId:  pregunta.id,
    control:     pregunta.control,
    respuesta,
    observacion: observacion || undefined,
    rawValor:    rawValor    || undefined,
    fechaRaw:    fechaRaw    || undefined,
    headcount:   Object.keys(headcount).length ? headcount : undefined,
    fotos:       fotos.length ? fotos : undefined,
  });

  const guardarRespuesta = () => {
    dispatch({ type: 'AUDIT_SET_ANSWER', payload: { id: pregunta.id, item: buildItem() } });
  };

  // Autosave con debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (!pregunta) return;
      const vacio = !respuesta && !observacion && !rawValor && !fechaRaw
        && !fotos.length && !Object.keys(headcount).length;
      if (vacio) return;
      dispatch({ type: 'AUDIT_SET_ANSWER', payload: { id: pregunta.id, item: buildItem() } });
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respuesta, observacion, rawValor, fechaRaw, fotos, headcount, pregunta?.id]);

  const handleAnterior = () => { guardarRespuesta(); dispatch({ type: 'AUDIT_PREV_Q' }); };
  const handleVolverCategorias = () => { guardarRespuesta(); router.push('/auditoria/categorias'); };

  const handleSiguiente = () => {
    if (observacionObligatoria(respuesta, pregunta.validacion ?? '')) {
      if (!(observacion || '').trim()) {
        alert('La observación es obligatoria cuando la respuesta es "No cumple" o parcial.');
        return;
      }
    }
    if (fotoBloquea(respuesta)) {
      if (!fotos.length) {
        alert('La foto es obligatoria cuando la respuesta es "No cumple" o parcial.');
        return;
      }
    }
    guardarRespuesta();
    if (!esUltima) dispatch({ type: 'AUDIT_NEXT_Q' });
    else           router.push('/auditoria/categorias');
  };

  const handleOmitir = () => {
    if (esSaltada) {
      dispatch({ type: 'AUDIT_UNSKIP', payload: pregunta.id });
    } else {
      dispatch({ type: 'AUDIT_SKIP', payload: pregunta.id });
      if (!esUltima) dispatch({ type: 'AUDIT_NEXT_Q' });
      else           router.push('/auditoria/categorias');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-40">
      {/* Header con barra de progreso global */}
      <div className="bg-white border-b border-gray-200 px-4 pt-10 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{auditoria.qIndex + 1}/{cat.questions.length} · {cat.name}</span>
          <span className="text-xs text-gray-400">{respondidas}/{totalGlobal} total</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full mt-2">
          <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${progresoGlobal}%` }} />
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className={clsx('inline-block px-2 py-0.5 rounded-full text-xs font-semibold',
            IMP_COLOR[(pregunta.importancia ?? '').toLowerCase()] ?? IMP_COLOR['media'])}>
            {pregunta.importancia}
          </span>
          {pregunta.explicacionDetallada && (
            <button
              onClick={() => setMostrarAyuda(true)}
              className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center"
              aria-label="Ver criterios de evaluación"
            >
              ?
            </button>
          )}
          {esSaltada && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              Omitida
            </span>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">{pregunta.subcategoria}</p>
          <h2 className="text-base font-bold text-gray-900 leading-snug">{pregunta.control}</h2>
          {pregunta.explicacion && <p className="text-sm text-gray-500 mt-1">{pregunta.explicacion}</p>}
        </div>

        {/* Radio */}
        {inputTipo === 'radio' && (
          <RespuestaRadio
            opciones={inputOpciones.length ? inputOpciones : OPCIONES_DEFAULT}
            valor={respuesta} onChange={setRespuesta} />
        )}

        {/* Número con auto-evaluación */}
        {inputTipo === 'numero_auto' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">{pregunta.pregunta || 'Valor medido'}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <InputNumerico
                  value={rawValor}
                  unidad={unidad}
                  placeholder="Ej: -18,5"
                  disabled={noAplicaNum}
                  onChange={v => {
                    setRawValor(v);
                    const norm = normalizeNum(v);
                    const verd = norm && norm !== '-' ? evaluarNumero(norm, numRegla) : null;
                    setRespuesta(verd ?? norm);
                  }}
                />
              </div>
              {veredictoNum && (
                <span className={clsx('px-3 py-2 rounded-xl text-xs font-bold', VEREDICTO_STYLE[veredictoNum] ?? '')}>
                  {veredictoNum}
                </span>
              )}
            </div>
            {numRegla?.allowNA && (
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                <input type="checkbox" checked={noAplicaNum}
                  onChange={e => {
                    if (e.target.checked) { setRespuesta('No aplica'); setRawValor(''); }
                    else setRespuesta('');
                  }} />
                No aplica
              </label>
            )}
          </div>
        )}

        {/* Fecha con auto-evaluación */}
        {inputTipo === 'fecha_auto' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Fecha de vencimiento</label>
            <input type="date" value={fechaRaw}
              disabled={respuesta === 'No aplica'}
              onChange={e => {
                const v = e.target.value;
                setFechaRaw(v);
                const verd = evaluarFecha(v);
                setRespuesta(verd ? verd.resultado : '');
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-400" />
            {veredictoFecha && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className={clsx('text-xs font-bold px-2.5 py-0.5 rounded-full',
                  VEREDICTO_STYLE[veredictoFecha.resultado] ?? 'bg-gray-100 text-gray-600')}>
                  {veredictoFecha.resultado}
                </span>
                {veredictoFecha.advertencia && (
                  <span className="text-xs text-amber-600 font-semibold">⚠️ {veredictoFecha.advertencia}</span>
                )}
              </div>
            )}
            {fechaRegla?.allowNA && (
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                <input type="checkbox" checked={respuesta === 'No aplica'}
                  onChange={e => {
                    if (e.target.checked) { setRespuesta('No aplica'); setFechaRaw(''); }
                    else setRespuesta('');
                  }} />
                No aplica
              </label>
            )}
          </div>
        )}

        {/* Headcount */}
        {inputTipo === 'headcount' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Headcount por sector</p>
            {HEADCOUNT_SECTORES.map(sector => (
              <div key={sector}>
                <label className="text-xs text-gray-500 mb-1 block">{sector}</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*"
                  value={headcount[headcountKey(sector)] ?? ''}
                  onChange={e => { setHeadcount(prev => ({ ...prev, [headcountKey(sector)]: e.target.value })); setRespuesta('N/A'); }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-base font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="0" />
              </div>
            ))}
          </div>
        )}

        {/* Número legacy */}
        {inputTipo === 'number' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">{pregunta.pregunta || 'Valor medido'}</label>
            <InputNumerico
              value={rawValor}
              unidad={unidad}
              placeholder="Ej: 36,5"
              onChange={v => { setRawValor(v); setRespuesta(v.replace(/,/g, '.')); }}
            />
          </div>
        )}

        {/* Fecha legacy */}
        {inputTipo === 'fecha' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Fecha</label>
            <input type="date" value={fechaRaw}
              onChange={e => { const v = e.target.value; setFechaRaw(v); setRespuesta(v); }}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>
        )}

        {/* Texto libre */}
        {inputTipo === 'text' && (
          <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            placeholder="Ingresá tu observación..." />
        )}

        {/* Observación (solo para radio) */}
        {inputTipo === 'radio' && (
          <div>
            <label className="block text-sm mb-1.5">
              Observaciones {obsObligatoria && <span className="text-red-600 font-bold ml-1">* Requerida</span>}
            </label>
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={2}
              className={clsx('w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none resize-none bg-gray-50',
                obsObligatoria ? 'border-2 border-red-600 focus:ring-2 focus:ring-red-500' : 'border border-gray-200 focus:ring-2 focus:ring-red-500')}
              placeholder={obsObligatoria ? '* Observación requerida...' : 'Observación (opcional)...'} />
          </div>
        )}

        <FotoCapture fotos={fotos} obligatoria={fotoObl} onChange={setFotos} />
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 space-y-2">
        <div className="flex gap-2">
          {auditoria.qIndex > 0 ? (
            <button onClick={handleAnterior}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">
              ← Anterior
            </button>
          ) : <div className="flex-1" />}
          <button onClick={handleSiguiente}
            className={clsx('flex-[2] py-3 rounded-xl text-white text-sm font-semibold', esUltima ? 'bg-green-600' : 'bg-red-600')}>
            {esUltima ? 'Completar →' : 'Siguiente →'}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleVolverCategorias}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm">
            ‹ Categorías
          </button>
          <button onClick={handleOmitir}
            className={clsx('flex-1 py-2.5 rounded-xl text-sm border',
              esSaltada
                ? 'border-amber-300 text-amber-700 bg-amber-50'
                : 'border-gray-200 text-gray-500')}>
            {esSaltada ? '↩ Quitar omisión' : 'Omitir pregunta'}
          </button>
        </div>
      </div>

      {mostrarAyuda && pregunta.explicacionDetallada && (
        <AyudaSheet
          titulo={pregunta.control}
          explicacion={pregunta.explicacionDetallada}
          onClose={() => setMostrarAyuda(false)}
        />
      )}
    </div>
  );
}

export default function PreguntaPage() {
  return <AuthGuard><PreguntaContent /></AuthGuard>;
}
