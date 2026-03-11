import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { pb } from '$lib/pocketbase';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  // Con adapter-static: auth solo client-side
  if (browser && !pb.authStore.isValid) {
    throw redirect(302, '/login');
  }

  return {
    user: browser ? (pb.authStore.model ?? null) : null
  };
};
