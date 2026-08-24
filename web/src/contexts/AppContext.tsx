'use client';
/**
 * AppContext — Estado global de la app
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import type { Sesion, Local, Pregunta, Categoria, RespuestaItem } from '@/types';
import { loadSession, saveSession, clearSession } from '@/lib/session';
import { guardarBorrador } from '@/lib/borrador';
import { agruparPorCategoria } from '@/services/sheets';

// ── Estado ────────────────────────────────────────────────────

export interface AuditoriaState {
  local:         Local | null;
  fecha:         string;
  tipo:          string;
  acompanante:   string;
  posicionAcomp: string;
  auditId:       string;
  categorias:    Categoria[];
  catIndex:      number;
  qIndex:        number;
  answers:       Record<string, RespuestaItem>;
  skipped:       Record<string, boolean>;
}

export interface AppState {
  sesion:          Sesion | null;
  sessionLoading:  boolean;
  locales:         Local[];
  preguntas:       Pregunta[];
  dataLoading:     boolean;
  dataError:       string;
  umbralCriticos:  number;
  auditoria:       AuditoriaState;
}

const HOY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const auditInicial: AuditoriaState = {
  local: null, fecha: HOY(), tipo: 'Oficial',
  acompanante: '', posicionAcomp: '',
  auditId: '', categorias: [],
  catIndex: 0, qIndex: 0, answers: {}, skipped: {},
};

const initialState: AppState = {
  sesion: null, sessionLoading: true,
  locales: [], preguntas: [], dataLoading: false, dataError: '',
  umbralCriticos: 10,
  auditoria: auditInicial,
};

// ── Acciones ──────────────────────────────────────────────────

type Action =
  | { type: 'SET_SESION';      payload: Sesion | null }
  | { type: 'SESSION_LOADED' }
  | { type: 'SET_LOCALES';     payload: Local[] }
  | { type: 'SET_PREGUNTAS';   payload: Pregunta[] }
  | { type: 'DATA_LOADING';    payload: boolean }
  | { type: 'DATA_ERROR';      payload: string }
  | { type: 'SET_UMBRAL';      payload: number }
  | { type: 'AUDIT_SET_LOCAL'; payload: Local }
  | { type: 'AUDIT_SET_CAMPO'; payload: Partial<AuditoriaState> }
  | { type: 'AUDIT_SET_CAT';   payload: number }
  | { type: 'AUDIT_NEXT_Q' }
  | { type: 'AUDIT_PREV_Q' }
  | { type: 'AUDIT_SET_ANSWER';payload: { id: string; item: RespuestaItem } }
  | { type: 'AUDIT_SKIP';      payload: string }
  | { type: 'AUDIT_UNSKIP';    payload: string }
  | { type: 'AUDIT_RESET' }
  | { type: 'AUDIT_RESTORE';   payload: Partial<AuditoriaState> & { local: Local } };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SESION':
      return { ...state, sesion: action.payload, sessionLoading: false };
    case 'SESSION_LOADED':
      return { ...state, sessionLoading: false };
    case 'SET_LOCALES':
      return { ...state, locales: action.payload };
    case 'SET_PREGUNTAS':
      return { ...state, preguntas: action.payload };
    case 'DATA_LOADING':
      return { ...state, dataLoading: action.payload };
    case 'DATA_ERROR':
      return { ...state, dataError: action.payload };
    case 'SET_UMBRAL':
      return { ...state, umbralCriticos: action.payload };
    case 'AUDIT_SET_LOCAL': {
      const local = action.payload;
      const filtradas = state.preguntas.filter(p =>
        p.marca === 'Multimarca' || (local.isCausa ? p.marca === 'Causa' : false)
      );
      const categorias = agruparPorCategoria(filtradas);
      const auditId = `AUD_${local.nombre.replace(/\s+/g,'-').slice(0,20)}_${Date.now()}`;
      return { ...state, auditoria: { ...auditInicial, local, categorias, auditId, fecha: HOY() } };
    }
    case 'AUDIT_SET_CAMPO':
      return { ...state, auditoria: { ...state.auditoria, ...action.payload } };
    case 'AUDIT_SET_CAT':
      return { ...state, auditoria: { ...state.auditoria, catIndex: action.payload, qIndex: 0 } };
    case 'AUDIT_NEXT_Q':
      return { ...state, auditoria: { ...state.auditoria, qIndex: state.auditoria.qIndex + 1 } };
    case 'AUDIT_PREV_Q':
      return { ...state, auditoria: { ...state.auditoria, qIndex: Math.max(0, state.auditoria.qIndex - 1) } };
    case 'AUDIT_SET_ANSWER': {
      const answers = { ...state.auditoria.answers, [action.payload.id]: action.payload.item };
      return { ...state, auditoria: { ...state.auditoria, answers } };
    }
    case 'AUDIT_SKIP': {
      const skipped = { ...state.auditoria.skipped, [action.payload]: true };
      return { ...state, auditoria: { ...state.auditoria, skipped } };
    }
    case 'AUDIT_UNSKIP': {
      const skipped = { ...state.auditoria.skipped };
      delete skipped[action.payload];
      return { ...state, auditoria: { ...state.auditoria, skipped } };
    }
    case 'AUDIT_RESET':
      return { ...state, auditoria: auditInicial };
    case 'AUDIT_RESTORE': {
      const { local } = action.payload;
      const filtradas = state.preguntas.filter(p =>
        p.marca === 'Multimarca' || (local.isCausa ? p.marca === 'Causa' : false)
      );
      const categorias = agruparPorCategoria(filtradas);
      return { ...state, auditoria: { ...auditInicial, ...action.payload, categorias } };
    }
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────

interface AppContextValue {
  state:    AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const sesion = loadSession();
    dispatch({ type: 'SET_SESION', payload: sesion });
  }, []);

  // Autosave del borrador en cada cambio de la auditoría
  useEffect(() => {
    const a = state.auditoria;
    if (!a.local || !a.auditId) return;
    guardarBorrador({
      local:         a.local,
      fecha:         a.fecha,
      tipo:          a.tipo,
      acompanante:   a.acompanante,
      posicionAcomp: a.posicionAcomp,
      auditId:       a.auditId,
      catIndex:      a.catIndex,
      qIndex:        a.qIndex,
      answers:       a.answers,
      skipped:       a.skipped,
    });
  }, [state.auditoria]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}

export function useSesion() {
  const { state, dispatch } = useApp();

  const setSesion = (sesion: Sesion) => {
    saveSession(sesion);
    dispatch({ type: 'SET_SESION', payload: sesion });
  };

  const logout = () => {
    clearSession();
    dispatch({ type: 'SET_SESION', payload: null });
  };

  return { sesion: state.sesion, sessionLoading: state.sessionLoading, setSesion, logout };
}
