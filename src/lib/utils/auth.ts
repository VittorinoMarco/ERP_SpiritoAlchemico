/**
 * PocketBase può usare "role" o "ruolo" nel modello utente.
 * Questa utility gestisce entrambi i casi.
 */
export function isAdmin(user: { role?: string; ruolo?: string } | null | undefined): boolean {
  if (!user) return false;
  return (user.role || user.ruolo) === 'admin';
}

export function isAgente(user: { role?: string; ruolo?: string } | null | undefined): boolean {
  if (!user) return false;
  return (user.role || user.ruolo) === 'agente';
}

export function isMagazziniere(user: { role?: string; ruolo?: string } | null | undefined): boolean {
  if (!user) return false;
  return (user.role || user.ruolo) === 'magazziniere';
}
