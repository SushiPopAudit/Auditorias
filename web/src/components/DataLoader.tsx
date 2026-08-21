'use client';
/**
 * DataLoader — Carga locales y preguntas al iniciar la sesión.
 * Es un componente invisible que corre en background.
 */
import { useEffect } from 'react';
import { useApp, useSesion } from '@/contexts/AppContext';
import { getLocales, getPreguntas } from '@/services';

export default function DataLoader() {
  const { dispatch } = useApp();
  const { sesion } = useSesion();

  useEffect(() => {
    if (!sesion) return;

    dispatch({ type: 'DATA_LOADING', payload: true });

    Promise.all([getLocales(), getPreguntas()])
      .then(([locales, preguntas]) => {
        dispatch({ type: 'SET_LOCALES',   payload: locales });
        dispatch({ type: 'SET_PREGUNTAS', payload: preguntas });
        dispatch({ type: 'DATA_LOADING',  payload: false });
      })
      .catch(e => {
        dispatch({ type: 'DATA_ERROR',   payload: String(e) });
        dispatch({ type: 'DATA_LOADING', payload: false });
      });
  }, [sesion, dispatch]);

  return null; // componente invisible
}
