'use client';
import clsx from 'clsx';

interface Props {
  opciones:  string[];
  valor:     string;
  onChange:  (v: string) => void;
}

const COLORES: Record<string, string> = {
  'cumple':                'bg-green-500 text-white border-green-500',
  'cumple parcialmente':   'bg-yellow-400 text-white border-yellow-400',
  'no cumple':             'bg-red-600   text-white border-red-600',
  'no aplica':             'bg-gray-400  text-white border-gray-400',
};

export default function RespuestaRadio({ opciones, valor, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {opciones.map(op => {
        const key    = op.toLowerCase();
        const active = valor.toLowerCase() === key;
        const color  = COLORES[key] ?? 'bg-blue-500 text-white border-blue-500';
        return (
          <button
            key={op}
            onClick={() => onChange(op)}
            className={clsx(
              'py-3 px-2 rounded-xl border-2 text-sm font-semibold text-center transition-all active:scale-95',
              active ? color : 'bg-white border-gray-200 text-gray-700'
            )}
          >
            {op}
          </button>
        );
      })}
    </div>
  );
}
