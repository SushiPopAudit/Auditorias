'use client';
import { useState } from 'react';
import { compressImage } from '@/lib/imagen';
import { CATEGORIAS, CAT_ICONO, type Gasto, type GastoInput } from '@/services/gastos';
import clsx from 'clsx';

interface Props {
  gasto:     Gasto | null;
  onCerrar:  () => void;
  onGuardar: (datos: GastoInput) => Promise<void>;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FormGasto({ gasto, onCerrar, onGuardar }: Props) {
  const [categoria,    setCategoria]   = useState(gasto?.categoria   ?? 'ALIMENTOS/BEBIDAS');
  const [descripcion,  setDescripcion] = useState(gasto?.descripcion ?? '');
  const [importe,      setImporte]     = useState(gasto ? String(gasto.importe) : '');
  const [fecha,        setFecha]       = useState(gasto?.fecha ?? hoyISO());
  const [fotoBase64,   setFotoBase64]  = useState('');
  const [fotoNombre,   setFotoNombre]  = useState('');
  const [fotoActual,   setFotoActual]  = useState(gasto?.fotoUrl ?? '');
  const [eliminarFoto, setEliminarFoto] = useState(false);
  const [guardando,    setGuardando]   = useState(false);
  const [error,        setError]       = useState('');

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataURL = await compressImage(f, 900, 0.6);
    setFotoBase64(dataURL);
    setFotoNombre(f.name);
    setEliminarFoto(false);
  }

  function quitarFoto() {
    if (fotoBase64) {
      setFotoBase64('');
      setFotoNombre('');
    } else {
      setEliminarFoto(true);
      setFotoActual('');
    }
  }

  async function guardar() {
    if (guardando) return;
    if (!categoria) { setError('Seleccioná una categoría.'); return; }
    const importeNum = parseFloat(importe.replace(/\./g, '').replace(',', '.'));
    if (!importe || isNaN(importeNum) || importeNum <= 0) {
      setError('Ingresá un importe válido mayor a cero.');
      return;
    }
    if (!fecha) { setError('Ingresá la fecha del gasto.'); return; }

    setGuardando(true);
    setError('');
    await onGuardar({
      gastoId:     gasto?.gastoId,
      fecha,
      categoria,
      importe,
      descripcion: descripcion.trim(),
      fotoBase64:  fotoBase64 || undefined,
      fotoNombre:  fotoNombre || undefined,
      eliminarFoto: eliminarFoto || undefined,
    });
    setGuardando(false);
  }

  const fotoMostrar = fotoBase64 || (!eliminarFoto ? fotoActual : '');

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4 flex-shrink-0">
        <button onClick={onCerrar} className="text-blue-600 text-sm mb-2">← Volver</button>
        <h2 className="text-xl font-bold text-gray-900">
          {gasto ? 'Editar gasto' : 'Registrar gasto'}
        </h2>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Categoría */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Categoría</label>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIAS.map(c => (
              <button key={c} type="button"
                onClick={() => setCategoria(c)}
                className={clsx(
                  'px-3 py-2 rounded-xl text-sm font-medium border-2',
                  categoria === c
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700',
                )}>
                {CAT_ICONO[c]} {c}
              </button>
            ))}
          </div>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Descripción <span className="text-gray-400">(opcional)</span>
          </label>
          <input
            type="text" value={descripcion} maxLength={80}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Ej: Almuerzo con equipo"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{descripcion.length}/80</p>
        </div>

        {/* Importe */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Importe</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">$</span>
            <input
              type="text" inputMode="decimal" value={importe}
              onChange={e => setImporte(e.target.value)}
              placeholder="0"
              className="w-full pl-7 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* Fecha */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha del gasto</label>
          <input
            type="date" value={fecha} max={hoyISO()}
            onChange={e => setFecha(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
          />
        </div>

        {/* Foto */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Foto del comprobante <span className="text-gray-400">(opcional)</span>
          </label>

          {fotoMostrar ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoMostrar} alt="Comprobante" className="max-h-40 rounded-xl border border-gray-200" />
              <button onClick={quitarFoto}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 text-xs font-bold flex items-center justify-center">
                ×
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-gray-400 transition-colors">
              <span className="text-2xl">📷</span>
              <span className="text-sm text-gray-500">Tocá para agregar foto</span>
              <input type="file" accept="image/*" capture="environment"
                onChange={handleFoto} className="hidden" />
            </label>
          )}
        </div>
      </div>

      {/* Footer fijo */}
      <div className="border-t border-gray-200 px-4 py-3 flex gap-2 flex-shrink-0 bg-white">
        <button onClick={onCerrar}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 font-semibold">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando}
          className="flex-[2] py-3 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50">
          {guardando ? 'Guardando...' : gasto ? 'Guardar cambios' : 'Registrar gasto'}
        </button>
      </div>
    </div>
  );
}
