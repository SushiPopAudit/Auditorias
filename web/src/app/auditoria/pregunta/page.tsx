'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import RespuestaRadio from '@/components/auditoria/RespuestaRadio';
import { useApp } from '@/contexts/AppContext';
import type { RespuestaItem } from '@/types';
import clsx from 'clsx';

const OPCIONES_DEFAULT = ['Cumple', 'Cumple parcialmente', 'No Cumple', 'No aplica'];

function parseTipoRespuesta(tr: string, pregunta: string): { tipo: string; opciones: string[] } {
  if (!tr) {
    if (pregunta?.includes('/')) return { tipo: 'radio', opciones: pregunta.split('/').map(s => s.trim()) };
    return { tipo: 'text', opciones: [] };
  }
  if (tr === 'numero') return { tipo: 'numero', opciones: [] };
  if (tr === 'fecha')  return { tipo: 'fecha',  opciones: [] };
  if (tr.startsWith('radio')) {
    const idx = tr.indexOf(':');
    if (idx > -1) {
      const opciones = tr.slice(idx + 1).split('/').map(s => s.trim()).filter(Boolean);
      return { tipo: 'radio', opciones };
    }
    return { tipo: 'radio', opciones: OPCIONES_DEFAULT };
  }
  return { tipo: 'text', opciones: [] };
}

function PreguntaContent() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const { auditoria } = state;

  const cat      = auditoria.categorias[auditoria.catIndex];
  const pregunta = cat?.questions[auditoria.qIndex];

  const [respuesta, setRespuesta] = useState('');
  const [observacion, setObservacion] = useState('');
  const [rawValor, setRawValor] = useState('');

  useEffect(() => {
    if (!auditoria.local) { router.replace('/auditoria/setup'); return; }
    if (!cat)             { router.replace('/auditoria/categorias'); return; }
  }, [auditoria.local, cat, router]);

  // Cargar respuesta existente si ya fue respondida
  useEffect(() => {
    if (!pregunta) return;
    const ans = auditoria.answers[pregunta.id];
    setRespuesta(ans?.respuesta ?? '');
    setObservacion(ans?.observacion ?? '');
    setRawValor(ans?.rawValor ?? '');
  }, [pregunta, auditoria.answers]);

  if (!cat || !pregunta) return null;

  const { tipo, opciones } = parseTipoRespuesta(pregunta.tipoRespuesta, pregunta.pregunta);
  const esUltima = auditoria.qIndex === cat.questions.length - 1;
  const totalCat = cat.questions.length;
  const progreso = ((auditoria.qIndex + 1) / totalCat) * 100;

  const IMP_COLOR: Record<string, string> = {
    crítico: 'bg-red-100 text-red-700',
    critico: 'bg-red-100 text-red-700',
    alta:    'bg-orange-100 text-orange-700',
    media:   'bg-yellow-100 text-yellow-700',
    baja:    'bg-gray-100 text-gray-600',
  };

  const guardarYAvanzar = () => {
    const item: RespuestaItem = {
      preguntaId: pregunta.id,
      control: pregunta.control,
      respuesta,
      observacion: observacion || undefined,
      rawValor: rawValor || undefined,
    };
    dispatch({ type: 'AUDIT_SET_ANSWER', payload: { id: pregunta.id, item } });

    if (!esUltima) {
      dispatch({ type: 'AUDIT_NEXT_Q' });
    } else {
      router.push('/auditoria/categorias');
    }
  };

  const saltar = () => {
    if (!esUltima) dispatch({ type: 'AUDIT_NEXT_Q' });
    else router.push('/auditoria/categorias');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
      {/* Header con progreso */}
      <div className="bg-white border-b border-gray-200 px-4 pt-10 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => auditoria.qIndex > 0 ? dispatch({ type: 'AUDIT_PREV_Q' }) : router.back()}
            className="text-red-600 text-sm"
          >
            ← Atrás
          </button>
          <span className="text-xs text-gray-400">
            {auditoria.qIndex + 1}/{totalCat} · {cat.name}
          </span>
        </div>
        <div className="h-1 bg-gray-100 rounded-full mt-2">
          <div
            className="h-full bg-red-500 rounded-full transition-all"
            style={{ width: `${progreso}%` }}
          />
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Importancia */}
        <span className={clsx(
          'inline-block px-2 py-0.5 rounded-full text-xs font-semibold',
          IMP_COLOR[(pregunta.importancia ?? '').toLowerCase()] ?? IMP_COLOR['media']
        )}>
          {pregunta.importancia}
        </span>

        {/* Control */}
        <div>
          <p className="text-xs text-gray-400 mb-1">{pregunta.subcategoria}</p>
          <h2 className="text-base font-bold text-gray-900 leading-snug">
            {pregunta.control}
          </h2>
          {pregunta.explicacion && (
            <p className="text-sm text-gray-500 mt-1">{pregunta.explicacion}</p>
          )}
        </div>

        {/* Respuesta según tipo */}
        {tipo === 'radio' && (
          <RespuestaRadio
            opciones={opciones.length ? opciones : OPCIONES_DEFAULT}
            valor={respuesta}
            onChange={setRespuesta}
          />
        )}

        {tipo === 'numero' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">
              {pregunta.pregunta || 'Valor medido'}
            </label>
            <input
              type="number"
              value={rawValor}
              onChange={e => setRawValor(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="0"
            />
          </div>
        )}

        {tipo === 'fecha' && (
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Fecha</label>
            <input
              type="date"
              value={rawValor}
              onChange={e => setRawValor(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}

        {tipo === 'text' && (
          <textarea
            value={respuesta}
            onChange={e => setRespuesta(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            placeholder="Ingresá tu observación..."
          />
        )}

        {/* Observación (siempre disponible excepto si el tipo ya es text) */}
        {tipo !== 'text' && (
          <textarea
            value={observacion}
            onChange={e => setObservacion(e.target.value)}
            rows={2}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none bg-gray-50"
            placeholder="Observación (opcional)..."
          />
        )}
      </div>

      {/* Botones de acción */}
      <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100 space-y-2">
        <button
          onClick={guardarYAvanzar}
          disabled={!respuesta && tipo === 'radio'}
          className="w-full bg-red-600 text-white py-3.5 rounded-xl font-semibold
                     disabled:opacity-40 active:scale-95 transition-transform"
        >
          {esUltima ? 'Terminar categoría' : 'Siguiente →'}
        </button>
        <button
          onClick={saltar}
          className="w-full text-gray-400 py-2 text-sm"
        >
          Omitir esta pregunta
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

export default function PreguntaPage() {
  return <AuthGuard><PreguntaContent /></AuthGuard>;
}
