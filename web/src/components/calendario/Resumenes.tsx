'use client';
import { useMemo } from 'react';
import clsx from 'clsx';
import type { Visita } from '@/services/calendario';
import type { Local } from '@/types';
import { colorDe, semanaDe } from './util';

// ─────────────────────────────────────────────
// Resumen por auditor y semana
// ─────────────────────────────────────────────

interface ResumenProps {
  visitas:  Visita[];
  offset:   number;
  dias:     number;
  colores:  Record<string, string>;
}

export function ResumenSemanal({ visitas, offset, dias, colores }: ResumenProps) {
  const { filas, semanas } = useMemo(() => {
    const totalSemanas = semanaDe(dias, offset);
    const porAuditor: Record<string, {
      nombre: string;
      semanas: Record<number, { vis: number; fra: number }>;
      totVis: number; totFra: number;
    }> = {};

    visitas.forEach(v => {
      const dia = parseInt(v.fecha.slice(8, 10), 10);
      if (isNaN(dia)) return;
      const em = v.auditorEmail.toLowerCase();
      if (!porAuditor[em]) {
        porAuditor[em] = { nombre: v.auditorNombre || em, semanas: {}, totVis: 0, totFra: 0 };
      }
      const s = semanaDe(dia, offset);
      if (!porAuditor[em].semanas[s]) porAuditor[em].semanas[s] = { vis: 0, fra: 0 };
      if (v.motivo === 'Franco') {
        porAuditor[em].semanas[s].fra++; porAuditor[em].totFra++;
      } else {
        porAuditor[em].semanas[s].vis++; porAuditor[em].totVis++;
      }
    });

    const filas = Object.entries(porAuditor)
      .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
      .map(([email, d]) => ({ email, ...d }));

    return { filas, semanas: Array.from({ length: totalSemanas }, (_, i) => i + 1) };
  }, [visitas, offset, dias]);

  if (!filas.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
        Por auditor y semana
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[340px]">
          <thead>
            <tr>
              <th className="text-left text-xs font-bold text-gray-500 py-1.5 pr-2">Auditor</th>
              {semanas.map(s => (
                <th key={s} className="text-xs font-bold text-gray-500 py-1.5 px-1.5 whitespace-nowrap">
                  Sem {s}
                </th>
              ))}
              <th className="text-xs font-bold text-gray-500 py-1.5 px-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.email} className="border-t border-gray-50">
                <td className="py-2 pr-2 whitespace-nowrap">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle"
                    style={{ background: colorDe(colores, f.email) }} />
                  <span className="text-sm font-semibold text-gray-900 align-middle">{f.nombre}</span>
                </td>
                {semanas.map(s => {
                  const d = f.semanas[s] ?? { vis: 0, fra: 0 };
                  return (
                    <td key={s} className="py-2 px-1.5 text-center text-xs whitespace-nowrap">
                      {d.vis > 0
                        ? <><span className="font-bold text-gray-900 tabular-nums">{d.vis}</span><span className="text-gray-400"> vis</span></>
                        : <span className="text-gray-300">—</span>}
                      {d.fra > 0 && (
                        <><span className="text-gray-400"> · </span>
                          <span className="font-bold text-amber-700 tabular-nums">{d.fra}</span>
                          <span className="text-gray-400"> fr</span></>
                      )}
                    </td>
                  );
                })}
                <td className="py-2 px-2 text-center text-xs whitespace-nowrap bg-gray-50">
                  <span className="font-bold text-gray-900 tabular-nums">{f.totVis}</span>
                  <span className="text-gray-400"> vis</span>
                  {f.totFra > 0 && (
                    <><span className="text-gray-400"> · </span>
                      <span className="font-bold text-amber-700 tabular-nums">{f.totFra}</span>
                      <span className="text-gray-400"> fr</span></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        vis = auditorías + capacitaciones · fr = francos
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Cobertura de locales
// ─────────────────────────────────────────────

export function CoberturaLocales({ visitas, locales }: { visitas: Visita[]; locales: Local[] }) {
  const { chips, sinVisita, conUna, conVarias } = useMemo(() => {
    const conteo: Record<string, number> = {};
    visitas.forEach(v => {
      if (v.motivo === 'Franco') return;
      const ln = (v.local || '').trim();
      if (ln) conteo[ln] = (conteo[ln] ?? 0) + 1;
    });

    let sinVisita = 0, conUna = 0, conVarias = 0;
    const chips = [...locales]
      .map(l => l.nombre)
      .sort()
      .map(nombre => {
        const n = conteo[nombre] ?? 0;
        if (n === 0) sinVisita++; else if (n === 1) conUna++; else conVarias++;
        return { nombre, n };
      });

    return { chips, sinVisita, conUna, conVarias };
  }, [visitas, locales]);

  if (!chips.length) return null;

  const estilo = (n: number) =>
    n === 0 ? 'bg-white     border-gray-200 text-gray-400'
    : n === 1 ? 'bg-green-50  border-green-300 text-green-700'
    :           'bg-blue-50   border-blue-300  text-blue-700';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Cobertura de locales
        </p>
        <p className="text-sm text-gray-500">
          {conUna + conVarias} de {chips.length} con visita
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map(c => (
          <div key={c.nombre}
            className={clsx('rounded-lg border px-2.5 py-1 flex items-center gap-1.5', estilo(c.n))}>
            <span className="text-xs font-semibold">{c.nombre}</span>
            {c.n > 1 && (
              <span className="text-xs font-bold bg-white rounded-full px-1.5 tabular-nums">{c.n}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-4 flex-wrap mt-3">
        {[
          ['Sin visitas', sinVisita, 'bg-white border-gray-200'],
          ['1 visita',    conUna,    'bg-green-50 border-green-300'],
          ['2 o más',     conVarias, 'bg-blue-50 border-blue-300'],
        ].map(([l, n, c]) => (
          <div key={String(l)} className="flex items-center gap-1.5">
            <span className={clsx('w-2.5 h-2.5 rounded-sm border', c as string)} />
            <span className="text-xs text-gray-500">{l} ({n})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
