<script lang="ts">
  import { page } from '$app/stores';
  import { LayoutGrid } from 'lucide-svelte';
  import { MOBILE_PRIMARY, itemsForRole, matchNavItem } from '$lib/config/nav';
  import { mobileMenuOpen } from '$lib/stores/ui';
  import { sottoScortaCount } from '$lib/stores/magazzino';
  import { currentRole } from '$lib/stores/auth';

  $: all = itemsForRole($currentRole);
  $: primary = $currentRole
    ? MOBILE_PRIMARY[$currentRole].map((id) => all.find((i) => i.id === id)).filter((i) => !!i)
    : [];
  $: activeId = matchNavItem($page.url.pathname)?.id ?? 'dashboard';
  // "Menu" risulta attivo quando la pagina corrente non è tra le voci primarie
  $: menuActive = !primary.some((i) => i && i.id === activeId);
</script>

<nav
  class="lg:hidden fixed inset-x-3 z-40 bottom-[max(0.75rem,env(safe-area-inset-bottom))] h-[var(--bottomnav-h)] rounded-[30px] bg-[#1F1F1F]/95 backdrop-blur-xl text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)] px-2 flex items-stretch justify-between gap-1"
  aria-label="Navigazione principale"
>
  {#each primary as item (item?.id)}
    {#if item}
      {@const isActive = activeId === item.id}
      <a
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        class="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-3xl my-1.5 transition-colors {isActive
          ? 'bg-[#F5D547] text-[#1A1A1A]'
          : 'text-white/60 active:bg-white/10'}"
      >
        <span class="relative">
          <svelte:component this={item.icon} class="h-[21px] w-[21px]" />
          {#if item.id === 'magazzino' && $sottoScortaCount > 0}
            <span class="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#FF5C5C] ring-2 ring-[#1F1F1F]"></span>
          {/if}
        </span>
        <span class="text-[10px] font-semibold leading-none truncate max-w-full px-1">{item.short ?? item.label}</span>
      </a>
    {/if}
  {/each}

  <button
    type="button"
    class="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-3xl my-1.5 transition-colors {menuActive
      ? 'bg-[#F5D547] text-[#1A1A1A]'
      : 'text-white/60 active:bg-white/10'}"
    onclick={() => mobileMenuOpen.set(true)}
    aria-label="Apri menu completo"
  >
    <LayoutGrid class="h-[21px] w-[21px]" />
    <span class="text-[10px] font-semibold leading-none">Menu</span>
  </button>
</nav>
