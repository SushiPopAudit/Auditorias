'use client';
import { useEffect, useRef } from 'react';

interface Props {
  titulo:     string;
  explicacion: string;
  onClose:    () => void;
}

export default function AyudaSheet({ titulo, explicacion, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
      <div ref={ref}
        className="w-full bg-white rounded-t-3xl p-6 max-h-[70vh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between mb-3">
          <p className="font-semibold text-gray-900 text-base pr-4">{titulo}</p>
          <button onClick={onClose}
            className="text-gray-400 text-2xl leading-none flex-shrink-0 -mt-1">×</button>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{explicacion}</p>
      </div>
    </div>
  );
}
