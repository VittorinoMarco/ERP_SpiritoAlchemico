import { browser } from '$app/environment';
import { pb } from '$lib/pocketbase';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  // Con adapter-static: user solo client-side da PocketBase
  return {
    user: browser ? (pb.authStore.model ?? null) : null
  };
};
