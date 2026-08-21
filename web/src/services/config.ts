/**
 * config.ts — Lee el umbral de críticos que configura el Admin
 */
const URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export const UMBRAL_DEFAULT = 10;

let cache: number | null = null;

export async function getUmbralCriticos(): Promise<number> {
  if (cache !== null) return cache;
  try {
    const res = await fetch(`${URL}?action=getUmbral`, { redirect: 'follow' });
    const data = await res.json();
    const u = parseFloat(String(data.umbral_criticos_pct));
    cache = (!isNaN(u) && u > 0) ? u : UMBRAL_DEFAULT;
  } catch {
    cache = UMBRAL_DEFAULT;
  }
  return cache;
}
