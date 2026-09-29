import { readable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { RecordModel } from 'pocketbase';
import { pb } from '$lib/pocketbase';

export type Role = 'admin' | 'agente' | 'magazziniere';

export type AppUser = RecordModel & {
  role?: string;
  ruolo?: string;
  nome?: string;
  cognome?: string;
  email?: string;
};

/** Utente corrente, sempre allineato a `pb.authStore` (login, logout, refresh). */
export const currentUser = readable<AppUser | null>(
  browser ? (pb.authStore.model as AppUser | null) : null,
  (set) => {
    if (!browser) return;
    set(pb.authStore.model as AppUser | null);
    return pb.authStore.onChange(() => set(pb.authStore.model as AppUser | null));
  }
);

export function roleOf(user: { role?: string; ruolo?: string } | null | undefined): Role | null {
  const r = user?.ruolo || user?.role;
  return r === 'admin' || r === 'agente' || r === 'magazziniere' ? r : null;
}

export const currentRole = derived(currentUser, ($u) => roleOf($u));

export function displayName(user: AppUser | null | undefined): string {
  if (!user) return 'Utente';
  const full = [user.nome, user.cognome].filter(Boolean).join(' ').trim();
  return full || (user.name as string | undefined) || user.email || 'Utente';
}

export function initialsOf(user: AppUser | null | undefined): string {
  if (!user) return 'SA';
  const nome = (user.nome as string | undefined)?.trim();
  const cognome = (user.cognome as string | undefined)?.trim();
  if (nome && cognome) return (nome[0] + cognome[0]).toUpperCase();
  const single = nome || (user.name as string | undefined)?.trim();
  if (single) {
    const parts = single.split(/\s+/);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : single.slice(0, 2)).toUpperCase();
  }
  return (user.email ?? 'SA').slice(0, 2).toUpperCase();
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Amministratore',
  agente: 'Agente',
  magazziniere: 'Magazziniere'
};
