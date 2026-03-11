import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { pb } from '$lib/pocketbase';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  if (browser) {
    if (!pb.authStore.isValid) {
      throw redirect(302, '/login');
    }
    const user = pb.authStore.model as { role?: string } | null;
    if ((user?.role || user?.ruolo) !== 'admin') {
      throw redirect(302, '/');
    }
  }
  return {};
};
