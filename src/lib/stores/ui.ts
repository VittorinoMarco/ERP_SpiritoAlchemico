import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const SIDEBAR_KEY = 'erp_sidebar_expanded';

function createSidebarStore() {
  let initial = true;
  if (browser) {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    // Aperta appena il menu laterale c'è: sotto i 1280 restava una colonna di sole icone.
    initial = saved !== null ? saved === '1' : window.innerWidth >= 1024;
  }
  const { subscribe, set, update } = writable<boolean>(initial);
  return {
    subscribe,
    set: (v: boolean) => {
      if (browser) localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0');
      set(v);
    },
    toggle: () =>
      update((v) => {
        const next = !v;
        if (browser) localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
        return next;
      })
  };
}

export const sidebarExpanded = createSidebarStore();
export const searchOpen = writable(false);
export const mobileMenuOpen = writable(false);
export const notificationsOpen = writable(false);
