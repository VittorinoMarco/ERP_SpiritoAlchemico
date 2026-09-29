import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { pb } from '$lib/pocketbase';
import { roleOf } from '$lib/stores/auth';
import { canAccess } from '$lib/config/nav';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
  // SPA (adapter-static): l'autenticazione vive solo nel browser
  if (browser) {
    if (!pb.authStore.isValid) {
      const next = url.pathname + url.search;
      throw redirect(302, next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login');
    }

    const role = roleOf(pb.authStore.model as { role?: string; ruolo?: string } | null);
    if (!role) {
      // Account senza ruolo valido: niente accesso (evita anche loop di redirect verso "/")
      pb.authStore.clear();
      throw redirect(302, '/login?error=ruolo');
    }

    // Guard centralizzato per ruolo (prima si poteva aprire /magazzino, /fatture… da URL)
    if (!canAccess(role, url.pathname)) {
      throw redirect(302, '/');
    }
  }

  return {
    user: (browser ? (pb.authStore.model ?? null) : null) as any
  };
};
