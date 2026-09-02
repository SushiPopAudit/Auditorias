'use client';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import type { Visita, UsuarioBasico, VisitaInput } from '@/services/calendario';
import type { Local } from '@/types';
import {
  MOTIVOS, MOTIVO_LABEL, MOTIVO_CHIP, iniciales, colorDe, formatFechaLarga,
} from './util';

interface Props {
  fecha:     string;
  visitas:   Visita[];
  locales:   Local[];
  auditores: UsuarioBasico[];
  colores:   Record<string, string>;
  onCerrar:  () => void;
  onAgregar: (v: VisitaInput) => Promise<{ ok: boolean; error?: string }>;
  onEditar:  (id: string, v: VisitaInput) => Promise<{ ok: boolean; error?: string }>;
  onBorrar:  (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export default function ModalDia({
  fecha, visitas, locales, auditores, colores,
  onCerrar, onAgregar, onEditar, onBorrar,
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [motivo, setMotivo]     = useState('Auditoria');
  const [local, setLocal]       = useState('');
  const [auditor, setAuditor]   = useState('');
  const [fechaSel, setFechaSel] = useState(fecha);
  const [error, setError]       = useState('');
  const [guardando, setGuardando] = useState(false);

  const esFranco = motivo === 'Franco';

  useEffect(() => {
    if (!editando) {
      setMotivo('Auditoria'); setLocal(''); setAuditor(''); setFechaSel(fecha); setError('');
      return;
    }
    const v = visitas.find(x => x.visitaId === editando);
    if (v) {
      setMotivo(v.motivo || 'Auditoria');
      setLocal(v.motivo === 'Franco' ? '' : v.local);
      setAuditor(v.auditorEmail);
      setFechaSel(v.fecha);
      setError('');
    }
  }, [editando, fecha, visitas]);

  async function guardar() {
    setError('');
    if (!esFranco && !local) { setError('Elegí un local.');   return; }
    if (!auditor)            { setError('Elegí un auditor.'); return; }
    if (!fechaSel)           { setError('Elegí una fecha.');  return; }

    const payload: VisitaInput = {
      fecha: fechaSel, motivo, auditorEmail: auditor,
      local: esFranco ? 'Franco' : local,
    };

    const delDia = visitas.filter(v =>
      v.auditorEmail.toLowerCase() === auditor.toLowerCase() && v.visitaId !== editando
    );
    if (esFranco && delDia.length) {
      setError('Ese auditor ya tiene algo asignado ese día.'); return;
    }
    if (!esFranco && delDia.some(v => v.motivo === 'Franco')) {
      setError('Ese auditor tiene franco ese día.'); return;
    }
    if (delDia.some(v => v.motivo === motivo && v.local === payload.local)) {
      setError('Esa visita ya está cargada.'); return;
    }

    setGuardando(true);
    const res = editando ? await onEditar(editando, payload) : await onAgregar(payload);
    setGuardando(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo guardar.'); return; }
    setEditando(null);
  }

  async function borrar(v: Visita) {
    if (!confirm(`¿Borrar la visita de ${v.auditorNombre}${v.motivo === 'Franco' ? '' : ` a ${v.local}`}?`)) return;
    const res = await onBorrar(v.visitaId);
    if (!res.ok) alert(res.error ?? 'No se pudo borrar.');
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto p-5 pb-10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-bold text-gray-900">📅 {formatFechaLarga(fecha)}</h3>
          <button onClick={onCerrar} aria-label="Cerrar"
            className="text-2xl leading-none text-gray-400 flex-shrink-0">×</button>
        </div>

        {visitas.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">Sin visitas asignadas.</p>
        ) : (
          <ul className="divide-y divide-gray-100 mb-4">
            {visitas.map(v => (
              <li key={v.visitaId} className="py-2.5 flex items-center gap-2 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ background: colorDe(colores, v.auditorEmail) }} />
                <span className="text-sm font-semibold text-gray-900">
                  {iniciales(v.auditorNombre || v.auditorEmail)}
                </span>
                {v.motivo !== 'Franco' && (
                  <span className="text-sm text-gray-700">{v.local}</span>
                )}
                <span className={clsx(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  MOTIVO_CHIP[v.motivo] ?? 'bg-gray-100 text-gray-500',
                )}>
                  {MOTIVO_LABEL[v.motivo] ?? v.motivo}
                </span>
                <span className={clsx(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  v.estado === 'Realizada' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800',
                )}>
                  {v.estado}
                </span>
                <span className="ml-auto flex gap-1.5 flex-shrink-0">
                  <button onClick={() => setEditando(v.visitaId)}
                    className="text-xs text-blue-600 border border-gray-200 rounded px-2 py-0.5">
                    ✏️ Editar
                  </button>
                  <button onClick={() => borrar(v)}
                    className="text-xs text-red-600 border border-gray-200 rounded px-2 py-0.5">
                    Borrar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-gray-200 pt-4">
          <p className="font-semibold text-sm text-gray-700 mb-3">
            {editando ? 'Editar visita' : 'Agregar visita'}
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo</label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                {MOTIVOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            {!esFranco && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Local</label>
                <select value={local} onChange={e => setLocal(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                  <option value="">— Elegí un local —</option>
                  {locales.map(l => <option key={l.nombre} value={l.nombre}>{l.nombre}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Auditor</label>
              <select value={auditor} onChange={e => setAuditor(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                <option value="">— Elegí un auditor —</option>
                {auditores.map(a => <option key={a.email} value={a.email}>{a.nombre}</option>)}
              </select>
            </div>

            {editando && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha</label>
                <input type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {editando ? (
              <div className="flex gap-2">
                <button onClick={() => setEditando(null)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={guardando}
                  className="flex-[2] py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            ) : (
              <button onClick={guardar} disabled={guardando}
                className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Agregar visita'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
