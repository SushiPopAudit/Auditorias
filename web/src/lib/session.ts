/**
 * session.ts — Manejo de sesión en localStorage
 * Replica exacta del prototipo (loadSession / saveSession / clearSession)
 */
import type { Sesion } from '@/types';

const KEY = 'user_session';
const TTL = 7 * 24 * 3600 * 1000; // 7 días en ms

export function loadSession(): Sesion | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s: Sesion = JSON.parse(raw);
    if (!s?.email || !s?.token) return null;
    if (Date.now() - (s.savedAt ?? 0) > TTL) { clearSession(); return null; }
    return s;
  } catch { return null; }
}

export function saveSession(user: Omit<Sesion, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...user, savedAt: Date.now() }));
  } catch { /* storage no disponible */ }
}

export function clearSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignorar */ }
}
