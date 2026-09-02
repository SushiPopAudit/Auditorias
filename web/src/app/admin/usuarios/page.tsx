'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import BottomNav from '@/components/BottomNav';
import SelectorLocales from '@/components/admin/SelectorLocales';
import { useApp, useSesion, useCache } from '@/contexts/AppContext';
import {
  getUsuarios, crearUsuario, editarUsuario, resetPassword,
  darDeBaja, reactivarUsuario,
  type Usuario, type UsuarioInput,
} from '@/services/admin';
import clsx from 'clsx';

const ROL_CHIP: Record<string, string> = {
  Admin:        'bg-purple-100 text-purple-800',
  Auditor:      'bg-blue-100   text-blue-800',
  Franquiciado: 'bg-amber-100  text-amber-800',
};

const ROLES = ['Auditor', 'Franquiciado', 'Admin'];

interface FormState {
  nombre:   string;
  email:    string;
  rol:      string;
  locales:  string;
  viaticos: boolean;
  estado:   string;
}

const FORM_VACIO: FormState = {
  nombre: '', email: '', rol: 'Auditor', locales: 'todos', viaticos: true, estado: 'Activo',
};

function UsuariosContent() {
  const { state } = useApp();
  const { sesion } = useSesion();
  const { limpiar } = useCache();
  const router = useRouter();

  const [usuarios,   setUsuarios]   = useState<Usuario[]>([]);
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState('');
  const [busqueda,   setBusqueda]   = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando,   setEditando]   = useState<Usuario | null>(null);
  const [form,       setForm]       = useState<FormState>(FORM_VACIO);
  const [guardando,  setGuardando]  = useState(false);
  const [mensaje,    setMensaje]    = useState<{ texto: string; ok: boolean } | null>(null);

  const localesNombres = useMemo(
    () => state.locales.map(l => l.nombre),
    [state.locales],
  );

  const cargar = useCallback(async () => {
    if (!sesion) return;
    setCargando(true);
    setError('');
    try {
      setUsuarios(await getUsuarios(sesion));
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
    setMostrarForm(true);
  }

  function abrirEditar(u: Usuario) {
    setEditando(u);
    setForm({
      nombre:   u.nombre,
      email:    u.email,
      rol:      u.rol,
      locales:  u.locales,
      viaticos: u.viaticos,
      estado:   u.estado,
    });
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditando(null);
    setForm(FORM_VACIO);
  }

  async function guardar() {
    if (!sesion || guardando) return;
    if (!form.nombre.trim()) { mostrarMensaje('El nombre es requerido.', false); return; }
    if (!editando && !form.email.trim()) { mostrarMensaje('El email es requerido.', false); return; }

    setGuardando(true);
    let res;
    if (editando) {
      res = await editarUsuario(sesion, editando.email, {
        nombre: form.nombre, rol: form.rol, locales: form.locales,
        estado: form.estado, viaticos: form.viaticos,
      });
    } else {
      const input: UsuarioInput = {
        nombre: form.nombre, email: form.email, rol: form.rol,
        locales: form.locales, viaticos: form.viaticos,
      };
      res = await crearUsuario(sesion, input);
    }
    setGuardando(false);

    if (!res.ok) { mostrarMensaje(res.error ?? 'Error al guardar.', false); return; }

    mostrarMensaje(
      editando
        ? 'Usuario actualizado. Los cambios pueden tardar unos minutos en verse en toda la app.'
        : `Usuario creado. Se le envió un email con su contraseña temporal.`,
      true,
    );
    limpiar(['usuarios']);
    cerrarForm();
    await cargar();
  }

  async function handleReset(u: Usuario) {
    if (!sesion) return;
    if (!confirm(`¿Resetear la contraseña de ${u.nombre}?\nSe le enviará un email con una contraseña temporal.`)) return;
    const res = await resetPassword(sesion, u.email);
    mostrarMensaje(res.ok ? 'Contraseña reseteada. Se le envió un email.' : (res.error ?? 'Error'), res.ok);
  }

  async function handleBaja(u: Usuario) {
    if (!sesion) return;
    if (!confirm(`¿Dar de baja a ${u.nombre}?\nNo podrá ingresar a la app.`)) return;
    const res = await darDeBaja(sesion, u.email);
    if (res.ok) { limpiar(['usuarios']); await cargar(); }
    mostrarMensaje(res.ok ? 'Usuario dado de baja.' : (res.error ?? 'Error'), res.ok);
  }

  async function handleReactivar(u: Usuario) {
    if (!sesion) return;
    if (!confirm(`¿Reactivar a ${u.nombre}?`)) return;
    const res = await reactivarUsuario(sesion, u.email);
    if (res.ok) { limpiar(['usuarios']); await cargar(); }
    mostrarMensaje(res.ok ? 'Usuario reactivado.' : (res.error ?? 'Error'), res.ok);
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(u =>
      u.nombre.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.locales.toLowerCase().includes(q),
    );
  }, [usuarios, busqueda]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button onClick={() => router.push('/admin')} className="text-blue-600 text-sm mb-2">← Admin</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Usuarios</h1>
            <p className="text-sm text-gray-400">{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''}</p>
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
          <h2 className="font-semibold text-gray-900 mb-4">{editando ? 'Editar usuario' : 'Nuevo usuario'}</h2>

          {!editando && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-xs text-blue-800">Se le enviará un email con una contraseña temporal que deberá cambiar al ingresar.</p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text" value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                placeholder="Nombre completo"
              />
            </div>

            {!editando && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  placeholder="usuario@ejemplo.com"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rol</label>
              <select
                value={form.rol}
                onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Locales asignados</label>
              <SelectorLocales
                valor={form.locales}
                locales={localesNombres}
                onChange={v => setForm(f => ({ ...f, locales: v }))}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={form.viaticos}
                onChange={e => setForm(f => ({ ...f, viaticos: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">Puede cargar gastos y viáticos</span>
            </label>

            {editando && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={form.estado}
                  onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={cerrarForm}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              className="flex-[2] py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
              {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </div>
      )}

      {/* Buscador */}
      <div className="px-4 pt-4">
        <input
          type="text" value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, email o local..."
          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm"
        />
      </div>

      {/* Lista */}
      <div className="px-4 mt-3 space-y-2">
        {cargando && !usuarios.length && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!cargando && error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-900">No se pudieron cargar los usuarios</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
            <button onClick={() => cargar()} className="mt-2 text-xs text-red-700 underline">Reintentar</button>
          </div>
        )}

        {filtrados.map(u => (
          <div key={u.email} className={clsx('bg-white rounded-2xl shadow-sm border border-gray-100 p-4',
            u.estado === 'Inactivo' && 'opacity-50')}>
            <div className="flex items-start gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 flex-1 min-w-0 truncate">{u.nombre}</p>
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', ROL_CHIP[u.rol] ?? 'bg-gray-100 text-gray-600')}>
                {u.rol}
              </span>
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                u.estado === 'Activo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>
                {u.estado}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
            <p className="text-xs text-gray-500 mt-1">
              Locales: {u.locales === 'todos' ? 'Todos' : `${u.locales.split(',').length} locales`}
            </p>

            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => abrirEditar(u)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700">
                Editar
              </button>
              <button onClick={() => handleReset(u)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700">
                Reset contraseña
              </button>
              {u.estado === 'Activo'
                ? <button onClick={() => handleBaja(u)}
                    className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600">
                    Dar de baja
                  </button>
                : <button onClick={() => handleReactivar(u)}
                    className="text-xs px-3 py-1.5 border border-green-200 rounded-lg text-green-700">
                    Reactivar
                  </button>
              }
            </div>
          </div>
        ))}

        {!cargando && !error && filtrados.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            {busqueda ? 'Sin resultados para esa búsqueda.' : 'No hay usuarios.'}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 mt-4 px-4">
        Los cambios pueden tardar unos minutos en verse reflejados en toda la app.
      </p>

      <BottomNav />
    </div>
  );
}

export default function UsuariosPage() {
  return <AuthGuard requiredRol="Admin"><UsuariosContent /></AuthGuard>;
}
