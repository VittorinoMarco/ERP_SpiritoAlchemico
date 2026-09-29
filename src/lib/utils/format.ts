export const formatNumero = (valore: number, decimali = 0): string =>
  new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali
  }).format(valore);


export const formatEuro = (n: number | null | undefined, maxDecimals = 2): string =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: maxDecimals === 0 ? 0 : 2,
    maximumFractionDigits: maxDecimals
  }).format(Number(n) || 0);

export const formatData = (s: string | null | undefined): string => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** YYYY-MM-DD nel fuso locale (toISOString userebbe UTC). */
export const ymdLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Prende solo la parte data ("2026-09-28 00:00:00.000Z" → "2026-09-28"). */
export const dayOf = (s: string | null | undefined): string | null =>
  s ? (s.split(/[T ]/)[0] ?? null) : null;
