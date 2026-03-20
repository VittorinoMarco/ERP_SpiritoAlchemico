/** Soglia fissa per alert "sotto scorta" (notifiche + filtri magazzino). */
export const SOGLIA_SOTTO_SCORTA = 6;

export function isSottoScortaGiacenza(giacenza: number | null | undefined): boolean {
  return (giacenza ?? 0) <= SOGLIA_SOTTO_SCORTA;
}
