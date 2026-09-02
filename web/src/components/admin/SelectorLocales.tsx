'use client';
import clsx from 'clsx';

interface Props {
  /** 'todos' o nombres separados por coma */
  valor:    string;
  locales:  string[];
  onChange: (v: string) => void;
}

export default function SelectorLocales({ valor, locales, onChange }: Props) {
  const todos = valor.trim().toLowerCase() === 'todos';
  const seleccionados = todos
    ? []
    : valor.split(',').map(s => s.trim()).filter(Boolean);

  function toggle(nombre: string) {
    const set = new Set(seleccionados);
    if (set.has(nombre)) set.delete(nombre); else set.add(nombre);
    onChange(set.size === 0 ? 'todos' : [...set].join(','));
  }

  return (
    <div>
      <label className="flex items-center gap-2 mb-2 cursor-pointer">
        <input
          type="checkbox"
          checked={todos}
          onChange={e => onChange(e.target.checked ? 'todos' : (locales[0] ?? 'todos'))}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium text-gray-900">Todos los locales</span>
      </label>

      {!todos && (
        <div className="border border-gray-200 rounded-xl p-2 max-h-52 overflow-y-auto space-y-0.5">
          {locales.map(n => (
            <label key={n} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={seleccionados.includes(n)}
                onChange={() => toggle(n)}
                className="w-4 h-4 flex-shrink-0"
              />
              <span className="text-sm text-gray-700">{n}</span>
            </label>
          ))}
        </div>
      )}

      <p className={clsx('text-xs mt-1.5', todos ? 'text-gray-400' : 'text-gray-500')}>
        {todos
          ? 'Ve todos los locales de la cadena.'
          : `${seleccionados.length} local${seleccionados.length !== 1 ? 'es' : ''} seleccionado${seleccionados.length !== 1 ? 's' : ''}.`}
      </p>
    </div>
  );
}
