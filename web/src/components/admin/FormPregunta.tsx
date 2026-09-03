'use client';
import { useState, useMemo } from 'react';
import clsx from 'clsx';
import EditorValidacion from './EditorValidacion';
import {
  aEditor, aTexto, validarEditor, VALIDACION_VACIA,
  type ValidacionEditor,
} from '@/services/validaciones';
import {
  MARCAS, IMPORTANCIAS, IMAGEN_OPCIONES,
  type PreguntaAdmin, type PreguntaInput,
} from '@/services/preguntas';

const IMP_STYLE: Record<string, string> = {
  critico: 'border-red-500 bg-red-50 text-red-700',
  alta:    'border-orange-400 bg-orange-50 text-orange-700',
  media:   'border-yellow-400 bg-yellow-50 text-yellow-700',
  baja:    'border-green-400 bg-green-50 text-green-700',
};

type TipoRespForm = 'libre' | 'radio' | 'radio_custom' | 'numero' | 'fecha';

function tipoRespFromString(s: string): TipoRespForm {
  if (!s) return 'libre';
  const l = s.toLowerCase();
  if (l === 'numero') return 'numero';
  if (l === 'fecha')  return 'fecha';
  if (l.startsWith('radio:')) return 'radio_custom';
  if (l === 'radio') return 'radio';
  return 'libre';
}

function buildTipoResp(tipo: TipoRespForm, custom: string): string {
  if (tipo === 'libre') return '';
  if (tipo === 'radio') return 'radio';
  if (tipo === 'numero') return 'numero';
  if (tipo === 'fecha') return 'fecha';
  // radio_custom
  const opts = custom.split('/').map(s => s.trim()).filter(Boolean);
  return opts.length ? `radio:${opts.join('/')}` : 'radio';
}

interface Props {
  pregunta:    PreguntaAdmin | null;
  categorias:  string[];
  subcats:     string[];
  onCerrar:    () => void;
  onGuardar:   (input: PreguntaInput) => Promise<void>;
  onBorrar?:   () => Promise<void>;
}

export default function FormPregunta({ pregunta, categorias, subcats, onCerrar, onGuardar, onBorrar }: Props) {
  const [marca,        setMarca]        = useState(pregunta?.marca        ?? 'Multimarca');
  const [categoria,    setCategoria]    = useState(pregunta?.categoria    ?? '');
  const [subcategoria, setSubcategoria] = useState(pregunta?.subcategoria ?? '');
  const [control,      setControl]      = useState(pregunta?.control      ?? '');
  const [importancia,  setImportancia]  = useState(pregunta?.importancia  ?? 'Alta');
  const [explicacion,  setExplicacion]  = useState(pregunta?.explicacion  ?? '');
  const [preguntaTxt,  setPreguntaTxt]  = useState(pregunta?.pregunta     ?? '');
  const [explDet,      setExplDet]      = useState(pregunta?.explicacionDetallada ?? '');
  const [imagen,       setImagen]       = useState(pregunta?.imagen       ?? '');
  const [tipoResp,     setTipoResp]     = useState<TipoRespForm>(() => tipoRespFromString(pregunta?.tipoRespuesta ?? ''));
  const [customOpts,   setCustomOpts]   = useState(() => {
    const tr = pregunta?.tipoRespuesta ?? '';
    return tr.toLowerCase().startsWith('radio:') ? tr.slice(6) : '';
  });
  const [validacion,   setValidacion]   = useState<ValidacionEditor>(() => aEditor(pregunta?.validacion ?? ''));
  const [guardando,    setGuardando]    = useState(false);
  const [error,        setError]        = useState('');

  const erroresVal = useMemo(() => validarEditor(validacion), [validacion]);

  const tieneValidacion = validacion.tipo !== 'ninguna';

  const TIPOS_RESP: { v: TipoRespForm; l: string }[] = [
    { v: 'libre',       l: 'Texto libre' },
    { v: 'radio',       l: 'Opciones estándar' },
    { v: 'radio_custom', l: 'Opciones a medida' },
    { v: 'numero',      l: 'Numérico' },
    { v: 'fecha',       l: 'Fecha' },
  ];

  const customPreview = useMemo(() =>
    customOpts.split('/').map(s => s.trim()).filter(Boolean),
    [customOpts],
  );

  async function guardar() {
    if (guardando) return;
    if (!control.trim()) { setError('El control es requerido.'); return; }
    if (erroresVal.length) { setError('Corregí los errores en la evaluación automática.'); return; }

    setGuardando(true);
    setError('');
    const input: PreguntaInput = {
      marca, categoria, subcategoria, control: control.trim(),
      importancia, explicacion, pregunta: preguntaTxt,
      imagen, tipoRespuesta: buildTipoResp(tipoResp, customOpts),
      explicacionDetallada: explDet,
      validacion: aTexto(validacion),
    };
    await onGuardar(input);
    setGuardando(false);
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 flex-shrink-0">
        <button onClick={onCerrar} className="text-blue-600 text-sm mb-2">← Volver</button>
        <h2 className="text-xl font-bold text-gray-900">
          {pregunta ? 'Editar pregunta' : 'Nueva pregunta'}
        </h2>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">{error}</div>
        )}

        {/* ── Identificación ── */}
        <section className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identificación</p>

          {/* Marca */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Marca</label>
            <div className="flex gap-2">
              {MARCAS.map(m => (
                <button key={m} type="button" onClick={() => setMarca(m)}
                  className={clsx('flex-1 py-2 rounded-xl border-2 text-sm font-medium',
                    marca === m ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700')}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
            <input list="cats" value={categoria} onChange={e => setCategoria(e.target.value)}
              placeholder="Ej: Higiene y Sanidad"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <datalist id="cats">{categorias.map(c => <option key={c} value={c} />)}</datalist>
          </div>

          {/* Subcategoría */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subcategoría</label>
            <input list="subcats" value={subcategoria} onChange={e => setSubcategoria(e.target.value)}
              placeholder="Ej: Temperaturas"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <datalist id="subcats">{subcats.map(s => <option key={s} value={s} />)}</datalist>
          </div>

          {/* Control */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Control <span className="text-red-500">*</span>
            </label>
            <input value={control} onChange={e => setControl(e.target.value)}
              placeholder="Ej: Temperatura heladera sushi"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          {/* Importancia */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Importancia</label>
            <div className="flex flex-wrap gap-2">
              {IMPORTANCIAS.map(imp => {
                const key = imp.toLowerCase().replace('í', 'i');
                return (
                  <button key={imp} type="button" onClick={() => setImportancia(imp)}
                    className={clsx('px-3 py-1.5 rounded-full text-xs font-bold border-2',
                      importancia.toLowerCase().replace('í', 'i') === key
                        ? (IMP_STYLE[key] ?? 'border-gray-400 bg-gray-100')
                        : 'border-gray-200 bg-white text-gray-500')}>
                    {imp}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Textos ── */}
        <section className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Textos</p>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Explicación</label>
            <input value={explicacion} onChange={e => setExplicacion(e.target.value)}
              placeholder="Ej: Verificar temperatura de heladera sushi"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pregunta</label>
            <input value={preguntaTxt} onChange={e => setPreguntaTxt(e.target.value)}
              placeholder="Ej: Temperatura (°C)"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              El texto entre paréntesis se muestra como unidad dentro del campo numérico.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Explicación detallada</label>
            <textarea value={explDet} onChange={e => setExplDet(e.target.value)}
              placeholder="Aparece al tocar el botón «?»"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm min-h-[80px]" />
          </div>
        </section>

        {/* ── Respuesta ── */}
        <section className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Respuesta</p>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de respuesta</label>
            <select value={tipoResp} onChange={e => setTipoResp(e.target.value as TipoRespForm)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm">
              {TIPOS_RESP.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            {tieneValidacion && (
              <p className="text-xs text-amber-700 mt-1.5">
                ⚠ Con evaluación automática configurada, se ignora el tipo de respuesta elegido arriba.
              </p>
            )}
          </div>

          {tipoResp === 'radio_custom' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Opciones a medida <span className="text-gray-400">(separadas por /)</span>
              </label>
              <input value={customOpts} onChange={e => setCustomOpts(e.target.value)}
                placeholder="Ej: Cumple/No Cumple"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              {customPreview.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customPreview.map(o => (
                    <span key={o} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700">{o}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Foto del comprobante</label>
            <select value={imagen} onChange={e => setImagen(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm">
              {IMAGEN_OPCIONES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">
              La foto se vuelve obligatoria automáticamente cuando la respuesta es &ldquo;No Cumple&rdquo; o parcial, sin importar esta configuración.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Evaluación automática</label>
            <EditorValidacion valor={validacion} onChange={setValidacion} />
          </div>
        </section>

        {/* ── Borrar ── */}
        {pregunta && onBorrar && (
          <section className="pt-4 border-t border-gray-200">
            <button type="button" onClick={onBorrar}
              className="w-full py-3 border-2 border-red-200 rounded-xl text-red-600 text-sm font-semibold">
              🗑 Eliminar esta pregunta
            </button>
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              Esta acción no se puede deshacer y afecta a las dos apps.
            </p>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3 flex gap-2 flex-shrink-0 bg-white">
        <button onClick={onCerrar}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 font-semibold">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando || erroresVal.length > 0}
          className="flex-[2] py-3 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50">
          {guardando ? 'Guardando...' : pregunta ? 'Guardar cambios' : 'Crear pregunta'}
        </button>
      </div>
    </div>
  );
}
