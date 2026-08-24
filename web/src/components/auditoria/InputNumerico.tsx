'use client';
import clsx from 'clsx';

interface Props {
  value:            string;
  onChange:         (v: string) => void;
  unidad?:          string;
  placeholder?:     string;
  disabled?:        boolean;
  /** Muestra el botón +/− (para temperaturas de freezer, etc.) */
  permiteNegativo?: boolean;
}

export default function InputNumerico({
  value, onChange, unidad = '', placeholder = 'Ej: 36,5', disabled = false, permiteNegativo = true,
}: Props) {
  const esNegativo = value.trim().startsWith('-');

  function toggleSigno() {
    const v = value.trim();
    if (!v) { onChange('-'); return; }
    onChange(v.startsWith('-') ? v.slice(1) : `-${v}`);
  }

  return (
    <div className="flex gap-2 items-stretch">
      {permiteNegativo && (
        <button
          type="button"
          onClick={toggleSigno}
          disabled={disabled}
          aria-label={esNegativo ? 'Cambiar a positivo' : 'Cambiar a negativo'}
          className={clsx(
            'w-14 rounded-xl border-2 font-bold text-lg flex-shrink-0 transition-colors',
            esNegativo
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-500 border-gray-200',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
        >
          {esNegativo ? '−' : '±'}
        </button>
      )}

      <div className="relative flex-1">
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9.,-]*"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={e => {
            const limpio = e.target.value
              .replace(/[^0-9.,-]/g, '')
              .replace(/(?!^)-/g, '');
            onChange(limpio);
          }}
          placeholder={placeholder}
          className={clsx(
            'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl',
            'text-lg font-medium focus:outline-none focus:border-red-500',
            unidad && 'pr-14',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
        />
        {unidad && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium pointer-events-none">
            {unidad}
          </span>
        )}
      </div>
    </div>
  );
}
