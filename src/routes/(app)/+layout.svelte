<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { navigating, page } from '$app/stores';
  import { pb } from '$lib/pocketbase';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import TopBar from '$lib/components/layout/TopBar.svelte';
  import BottomNav from '$lib/components/layout/BottomNav.svelte';
  import MobileMenu from '$lib/components/layout/MobileMenu.svelte';
  import SearchModal from '$lib/components/search/SearchModal.svelte';
  import { sidebarExpanded, searchOpen, notificationsOpen } from '$lib/stores/ui';
  import { notificationsStore } from '$lib/stores/notifications';
  import { currentRole, roleOf } from '$lib/stores/auth';
  import { canAccess } from '$lib/config/nav';

  // I dati utente arrivano dal load di (app)/+layout.ts; la shell usa lo store `currentUser`.
  export let data: { user?: unknown } = {};
  void data;

  async function logout() {
    notificationsStore.reset();
    pb.authStore.clear();
    await goto('/login');
  }

  // Ricarica le notifiche quando il ruolo diventa noto/cambia
  $: if ($currentRole) notificationsStore.fetch($currentRole);

  // Chiude i pannelli flottanti al cambio pagina
  $: if ($page.url.pathname) notificationsOpen.set(false);

  onMount(() => {
    // 1) Verifica la sessione con il server: un token scaduto o un utente rimosso/cambiato
    //    non deve lasciare l'app "aperta ma vuota" (le API risponderebbero con liste vuote).
    (async () => {
      try {
        await pb.collection('users').authRefresh();
        const role = roleOf(pb.authStore.model as { role?: string; ruolo?: string } | null);
        if (!role || !canAccess(role, window.location.pathname)) await goto('/');
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) await logout();
        // altri errori (rete assente…): restiamo dentro, i dati verranno ritentati dalle pagine
      }
    })();

    // 2) Aggiornamenti in tempo reale per badge e notifiche
    const stopRealtime = notificationsStore.subscribeRealtime();

    // 3) Scorciatoia globale ⌘K / Ctrl+K
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchOpen.update((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      stopRealtime();
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<!-- Barra di avanzamento durante la navigazione tra pagine -->
{#if $navigating}
  <div class="fixed inset-x-0 top-0 z-[90] h-0.5 overflow-hidden">
    <div class="h-full w-1/3 bg-[#F5D547] animate-[nav-progress_0.9s_ease-in-out_infinite]"></div>
  </div>
{/if}

<div class="min-h-dvh" style="--side: {$sidebarExpanded ? 'var(--sidebar-w-open)' : 'var(--sidebar-w)'}">
  <a
    href="#contenuto"
    class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-[#1A1A1A] focus:px-4 focus:py-2 focus:text-white"
  >
    Vai al contenuto
  </a>

  <Sidebar onlogout={logout} />

  <div class="min-h-dvh lg:pl-[calc(var(--side)+2rem)] transition-[padding] duration-300 ease-out">
    <TopBar onlogout={logout} />
    <main id="contenuto" class="px-4 lg:px-8 pt-2 lg:pt-3 pb-nav max-w-[1600px] mx-auto">
      <slot />
    </main>
  </div>

  <BottomNav />
  <MobileMenu onlogout={logout} />
  <SearchModal open={$searchOpen} onclose={() => searchOpen.set(false)} />
</div>
