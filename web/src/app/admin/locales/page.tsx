'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import { useSesion } from '@/contexts/AppContext';
import {
  getLocalesAdmin, crearLocal, updateLocal, eliminarLocal,
  type LocalAdmin, type LocalInput,
} from '@/services/admin';
import clsx from 'clsx';

interface FormState {
  nombre:  string;
  isCausa: boolean;
  emails:  string[];
}

const FORM_VACIO: FormState = { nombre: '', isCausa: false, emails: [] };

function LocalesContent() {
  const { sesion } = useSesion();
  const router = useRouter();

  const [locales,    setLocales]    = useState<LocalAdmin[]>([]);
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando,   setEditando]   = useState<LocalAdmin | null>(null);
  const [form,       setForm]       = useState<FormState>(FORM_VACIO);
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [guardando,  setGuardando]  = useState(false);
  const [mensaje,    setMensaje]    = useState<{ texto: string; ok: boolean } | null>(null);

  const cargar = useCallback(async () => {
    if (!sesion) return;
    setCargando(true);
    setError('');
    try {
      setLocales(await getLocalesAdmin(sesion));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [sesion]);

  useEffect(() => { cargar(); }, [cargar]);

  function mostrarMensaje(texto: string, ok: boolean) {
    setMensaje({ texto, ok });
    setTimeout(() => setMensaje(null), 4000);
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setNuevoEmail('');
    setEmailError('');
    setMostrarForm(true);
  }

  function abrirEditar(l: LocalAdmin) {
    setEditando(l);
    setForm({
      nombre:  l.nombre,
      isCausa: l.isCausa,
      emails:  l.emails ? l.emails.split(',').map(s => s.trim()).filter(Boolean) : [],
    });
    setNuevoEmail('');
    setEmailError('');
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditando(null);
    setForm(FORM_VACIO);
    setNuevoEmail('');
    setEmailError('');
  }

  function agregarEmail() {
    const e = nuevoEmail.trim().toLowerCase();
    if (!e) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setEmailError('Email inválido.'); return; }
    if (form.emails.includes(e)) { setNuevoEmail(''); return; }
    setForm(f => ({ ...f, emails: [...f.emails, e] }));
    setNuevoEmail('');
    setEmailError('');
  }

  function quitarEmail(email: string) {
    setForm(f => ({ ...f, emails: f.emails.filter(e => e !== email) }));
  }

  async function guardar() {
    if (!sesion || guardando) return;
    if (!form.nombre.trim()) { mostrarMensaje('El nombre es requerido.', false); return; }

    setGuardando(true);
    const input: LocalInput = {
      nombre:  form.nombre.trim(),
      isCausa: form.isCausa,
      emails:  form.emails.join(','),
    };
    const res = editando
      ? await updateLocal(sesion, editando.idx, input)
      : await crearLocal(sesion, input);
    setGuardando(false);

    if (!res.ok) { mostrarMensaje(res.error ?? 'Error al guardar.', false); return; }

    mostrarMensaje(
      (editando ? 'Local actualizado.' : 'Local creado.') +
      ' El resto de la app puede tardar unos minutos en verlo.',
      true,
    );
    cerrarForm();
    await cargar();
  }

  async function handleEliminar(l: LocalAdmin) {
    if (!sesion) return;
    if (!confirm(
      `¿Eliminar el local "${l.nombre}"?\n\nLas auditorías ya realizadas se conservan, pero el local deja de aparecer para nuevas auditorías.`
    )) return;
    const res = await eliminarLocal(sesion, l.idx);
    if (res.ok) { await cargar(); }
    mostrarMensaje(res.ok ? 'Local eliminado.' : (res.error ?? 'Error'), res.ok);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.push('/admin')} className="text-blue-600 text-sm mb-2">← Admin</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Locales</h1>
            <p className="text-sm text-gray-400">{locales.length} local{locales.length !== 1 ? 'es' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => cargar()}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl text-gray-600">
              ↻ Actualizar
            </button>
            <button onClick={abrirNuevo}
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-xl font-semibold">
              + Nuevo
            </button>
          </div>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={clsx('mx-4 mt-4 p-3 rounded-xl text-sm font-medium',
          mensaje.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200')}>
          {mensaje.texto}
        </div>
      )}

      {/* Formulario */}
      {mostrarForm && (
        <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900 mb-4">{editando ? 'Editar local' : 'Nuevo local'}</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text" value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                placeholder="Nombre del local"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={form.isCausa}
                onChange={e => setForm(f => ({ ...f, isCausa: e.target.checked }))}
                className="w-4 h-4"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Marca Causa</span>
                <p className="text-xs text-gray-500">Los locales Causa reciben además las preguntas específicas de esa marca.</p>
              </div>
            </label>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Emails de destino</label>
              <div className="flex gap-2">
                <input
                  type="email" value={nuevoEmail}
                  onChange={e => setNuevoEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), agregarEmail())}
                  placeholder="email@ejemplo.com"
                  className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                />
                <button onClick={agregarEmail}
                  className="px-3 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold whitespace-nowrap">
                  + Agregar
                </button>
              </div>
              {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}

              {form.emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.emails.map(e => (
                    <span key={e}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                      {e}
                      <button onClick={() => quitarEmail(e)}
                        className="text-gray-400 hover:text-red-500 ml-0.5 leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={cerrarForm}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              className="flex-[2] py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
              {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear local'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="px-4 mt-4 space-y-2">
        {cargando && !locales.length && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!cargando && error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-900">No se pudieron cargar los locales</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
            <button onClick={() => cargar()} className="mt-2 text-xs text-red-700 underline">Reintentar</button>
          </div>
        )}

        {locales.map(l => (
          <div key={l.idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-start gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 flex-1 min-w-0">{l.nombre}</p>
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                l.isCausa ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600')}>
                {l.isCausa ? 'Causa' : 'Multimarca'}
              </span>
            </div>

            {l.emails
              ? <p className="text-xs text-gray-500 mt-1">{l.emails}</p>
              : <p className="text-xs text-amber-700 mt-1">⚠ Sin emails: no se enviará el informe de sus auditorías</p>
            }

            <div className="flex gap-2 mt-3">
              <button onClick={() => abrirEditar(l)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700">
                Editar
              </button>
              <button onClick={() => handleEliminar(l)}
                className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600">
                Eliminar
              </button>
            </div>
          </div>
        ))}

        {!cargando && !error && locales.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">No hay locales.</p>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

export default function LocalesPage() {
  return <AuthGuard requiredRol="Admin"><LocalesContent /></AuthGuard>;
}
