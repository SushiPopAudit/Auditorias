'use client';
import { useState } from 'react';
import clsx from 'clsx';
import {
  aTexto, validarEditor, evaluarNumero, parseValidacion,
  type ValidacionEditor, type RangoEditor,
} from '@/services/validaciones';

interface Props {
  valor:    ValidacionEditor;
  onChange: (v: ValidacionEditor) => void;
}

const TIPOS = [
  { v: 'ninguna',   l: 'Sin validación', d: 'La respuesta la elige el auditor' },
  { v: 'numero',    l: 'Numérico',       d: 'Se evalúa solo según los rangos' },
  { v: 'fecha',     l: 'Vencimiento',    d: 'Vencida = No Cumple; a menos de 3 meses avisa' },
  { v: 'headcount', l: 'Dotación',       d: 'Cantidad de personas por sector. No puntúa' },
] as const;

export default function EditorValidacion({ valor, onChange }: Props) {
  const [prueba, setPrueba] = useState('');
  const errores = validarEditor(valor);

  const set = (patch: Partial<ValidacionEditor>) => onChange({ ...valor, ...patch });

  function setRango(lista: 'cumples' | 'parciales', i: number, patch: Partial<RangoEditor>) {
    const arr = [...valor[lista]];
    arr[i] = { ...arr[i], ...patch };
    set({ [lista]: arr } as Partial<ValidacionEditor>);
  }

  function agregar(lista: 'cumples' | 'parciales') {
    set({ [lista]: [...valor[lista], { min: '', max: '' }] } as Partial<ValidacionEditor>);
  }

  function quitar(lista: 'cumples' | 'parciales', i: number) {
    set({ [lista]: valor[lista].filter((_, j) => j !== i) } as Partial<ValidacionEditor>);
  }

  const veredicto = (() => {
    if (valor.tipo !== 'numero' || !prueba.trim() || errores.length) return null;
    const regla = parseValidacion(aTexto(valor));
    return evaluarNumero(prueba.replace(',', '.'), regla);
  })();

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de evaluación</label>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS.map(t => (
            <button
              key={t.v}
              type="button"
              onClick={() => set({ tipo: t.v })}
              className={clsx(
                'text-left px-3 py-2 rounded-xl border-2 transition-colors',
                valor.tipo === t.v ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white',
              )}
            >
              <p className="text-sm font-semibold text-gray-900">{t.l}</p>
              <p className="text-xs text-gray-400 leading-snug mt-0.5">{t.d}</p>
            </button>
          ))}
        </div>
      </div>

      {valor.tipo === 'numero' && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-green-800">Rangos que dan &ldquo;Cumple&rdquo;</label>
              <button type="button" onClick={() => agregar('cumples')}
                className="text-xs text-green-700 font-semibold">+ Agregar</button>
            </div>
            {valor.cumples.length === 0 && (
              <p className="text-xs text-gray-400 mb-1.5">Ninguno. Agregá al menos uno.</p>
            )}
            {valor.cumples.map((c, i) => (
              <FilaRango key={i} rango={c} color="green"
                onChange={p => setRango('cumples', i, p)}
                onQuitar={() => quitar('cumples', i)} />
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-amber-800">Rangos que dan &ldquo;Cumple parcialmente&rdquo;</label>
              <button type="button" onClick={() => agregar('parciales')}
                className="text-xs text-amber-700 font-semibold">+ Agregar</button>
            </div>
            {valor.parciales.map((p, i) => (
              <FilaRango key={i} rango={p} color="amber" exigeAmbos
                onChange={patch => setRango('parciales', i, patch)}
                onQuitar={() => quitar('parciales', i)} />
            ))}
          </div>

          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Lo que no entra en ningún rango se marca como <strong>No Cumple</strong>.
            Dejá un extremo vacío para decir &ldquo;sin límite&rdquo; (solo en los de Cumple).
          </p>
        </>
      )}

      {(valor.tipo === 'numero' || valor.tipo === 'fecha') && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={valor.allowNA}
            onChange={e => set({ allowNA: e.target.checked })} className="w-4 h-4" />
          <span className="text-sm text-gray-700">Permitir marcar &ldquo;No aplica&rdquo;</span>
        </label>
      )}

      {valor.tipo === 'numero' && (
        <div className="border-t border-gray-100 pt-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Probá un valor</label>
          <div className="flex items-center gap-2">
            <input type="text" inputMode="decimal" value={prueba}
              onChange={e => setPrueba(e.target.value)} placeholder="Ej: -18,5"
              className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            {veredicto && (
              <span className={clsx(
                'text-xs font-bold px-2.5 py-1 rounded-full',
                veredicto === 'Cumple'              ? 'bg-green-50 text-green-700' :
                veredicto === 'Cumple parcialmente' ? 'bg-amber-50 text-amber-700' :
                                                     'bg-red-50   text-red-700',
              )}>
                {veredicto}
              </span>
            )}
          </div>
        </div>
      )}

      {errores.length > 0 && (
        <ul className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5">
          {errores.map((e, i) => <li key={i} className="text-xs text-red-700">{e}</li>)}
        </ul>
      )}

      {valor.tipo !== 'ninguna' && (
        <p className="text-xs text-gray-400 font-mono break-all">{aTexto(valor) || '(vacío)'}</p>
      )}
    </div>
  );
}

function FilaRango({
  rango, color, exigeAmbos, onChange, onQuitar,
}: {
  rango: RangoEditor; color: 'green' | 'amber'; exigeAmbos?: boolean;
  onChange: (p: Partial<RangoEditor>) => void; onQuitar: () => void;
}) {
  const borde = color === 'green' ? 'border-green-200' : 'border-amber-200';
  return (
    <div className={clsx('flex items-center gap-2 mb-1.5 border rounded-xl px-2 py-1.5', borde)}>
      <span className="text-xs text-gray-500">de</span>
      <input type="text" inputMode="decimal" value={rango.min}
        onChange={e => onChange({ min: e.target.value })}
        placeholder={exigeAmbos ? '0' : 'sin límite'}
        className="w-20 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
      <span className="text-xs text-gray-500">a</span>
      <input type="text" inputMode="decimal" value={rango.max}
        onChange={e => onChange({ max: e.target.value })}
        placeholder={exigeAmbos ? '10' : 'sin límite'}
        className="w-20 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
      <button type="button" onClick={onQuitar}
        className="ml-auto text-gray-400 text-lg leading-none px-1">×</button>
    </div>
  );
}
