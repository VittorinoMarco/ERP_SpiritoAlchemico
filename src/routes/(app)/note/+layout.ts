import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { pb } from '$lib/pocketbase';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  if (browser) {
    const user = pb.authStore.model as { role?: string; ruolo?: string } | null;
    if ((user?.role || user?.ruolo) !== 'admin') {
      throw redirect(302, '/');
    }
  }
  return {};
};
