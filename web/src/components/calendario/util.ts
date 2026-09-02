/**
 * Constantes y helpers del calendario.
 * Los colores de auditor son una paleta de 7 hues validada para daltonismo
 * y contraste. NO agregar rojo: el rojo de marca señala "hoy" y el día
 * seleccionado, y mezclarlos confundiría.
 * A partir del 8º auditor se usa gris — las iniciales siempre acompañan
 * al color, así que la identidad nunca depende solo del color.
 */

export const MOTIVOS = [
  { id: 'Auditoria',    label: 'Auditoría',    letra: 'A' },
  { id: 'Franco',       label: 'Franco',       letra: 'F' },
  { id: 'Capacitacion', label: 'Capacitación', letra: 'C' },
] as const;

export const MOTIVO_LETRA: Record<string, string> = {
  Auditoria: 'A', Franco: 'F', Capacitacion: 'C',
};

export const MOTIVO_LABEL: Record<string, string> = {
  Auditoria: 'Auditoría', Franco: 'Franco', Capacitacion: 'Capacitación',
};

/** Estilo del chip de motivo. Las visitas viejas (Día/Noche) caen al gris. */
export const MOTIVO_CHIP: Record<string, string> = {
  Auditoria:    'bg-blue-50  text-blue-700',
  Franco:       'bg-gray-100 text-gray-600',
  Capacitacion: 'bg-green-50 text-green-700',
};

export const AUDITOR_COLORS = [
  '#2563eb', '#ea580c', '#16a34a', '#9333ea', '#a16207', '#0891b2', '#db2777',
];
export const AUDITOR_GRIS = '#64748b';

/**
 * Mapa email → color, estable: se ordena por email para que el color de un
 * auditor no cambie cuando se da de alta a otro.
 */
export function construirColores(emails: string[]): Record<string, string> {
  const orden = [...new Set(emails.map(e => e.toLowerCase()))].sort();
  const mapa: Record<string, string> = {};
  orden.forEach((em, i) => {
    mapa[em] = i < AUDITOR_COLORS.length ? AUDITOR_COLORS[i] : AUDITOR_GRIS;
  });
  return mapa;
}

export function colorDe(mapa: Record<string, string>, email: string): string {
  return mapa[(email || '').toLowerCase()] ?? AUDITOR_GRIS;
}

/** "Hernán López" → "HL"; "Ana" → "AN" */
export function iniciales(nombre: string): string {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '??';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/** Cabecera de la grilla: la semana empieza en LUNES */
export const DIAS_CABECERA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

export function ymd(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function hoyISO(): string {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}

/** getDay() da 0=Domingo; lo convertimos a 0=Lunes … 6=Domingo */
export function offsetPrimerDia(anio: number, mes: number): number {
  return (new Date(anio, mes, 1).getDay() + 6) % 7;
}

export function diasEnMes(anio: number, mes: number): number {
  return new Date(anio, mes + 1, 0).getDate();
}

/** Número de semana dentro del mes, coincidiendo con las filas de la grilla */
export function semanaDe(dia: number, offset: number): number {
  return Math.floor((offset + dia - 1) / 7) + 1;
}

export function formatFechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  const fecha = new Date(a, m - 1, d);
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return `${dias[fecha.getDay()]} ${d} de ${MESES[m - 1].toLowerCase()}`;
}
