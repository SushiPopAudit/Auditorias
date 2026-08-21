'use client';
import { useRef, useState } from 'react';
import { compressImage } from '@/lib/imagen';
import type { FotoItem } from '@/types';
import clsx from 'clsx';

interface Props {
  fotos:       FotoItem[];
  obligatoria: boolean;
  onChange:    (fotos: FotoItem[]) => void;
}

export default function FotoCapture({ fotos, obligatoria, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcesando(true);
    try {
      const dataURL = await compressImage(file, 600, 0.55);
      onChange([...fotos, { dataURL, nombre: file.name }]);
    } catch {
      alert('No se pudo procesar la foto. Intentá de nuevo.');
    } finally {
      setProcesando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function quitar(idx: number) {
    onChange(fotos.filter((_, i) => i !== idx));
  }

  const falta = obligatoria && fotos.length === 0;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={procesando}
        className={clsx(
          'w-full py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-colors',
          procesando       ? 'bg-gray-100 text-gray-400 border-gray-200' :
          fotos.length > 0 ? 'bg-green-50 text-green-700 border-green-300' :
          falta            ? 'bg-red-50 text-red-700 border-red-400' :
                             'bg-white text-gray-600 border-gray-200',
        )}
      >
        {procesando
          ? '⏳ Procesando...'
          : fotos.length > 0
            ? `📷 ${fotos.length} foto${fotos.length !== 1 ? 's' : ''} ✓ — Agregar otra`
            : falta ? '📷 Foto requerida *' : '📷 Agregar foto'}
      </button>

      {falta && (
        <p className="text-xs text-red-600 font-bold mt-1">* Foto requerida</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {fotos.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.dataURL}
                alt={`foto ${i + 1}`}
                className="w-full h-20 object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => quitar(i)}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-600 text-white rounded-full text-xs font-bold shadow"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
