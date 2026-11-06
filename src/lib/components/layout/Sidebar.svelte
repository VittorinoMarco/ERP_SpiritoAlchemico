<script lang="ts">
  import { page } from '$app/stores';
  import { PanelLeftClose, PanelLeftOpen, LogOut, FlaskConical, MoreHorizontal } from 'lucide-svelte';
  import { PRIMARY_IDS, SETTINGS_ITEM, INVITE_ITEM, itemsForRole, matchNavItem, type NavItem } from '$lib/config/nav';
  import { sidebarExpanded } from '$lib/stores/ui';
  import { sottoScortaCount } from '$lib/stores/magazzino';
  import { currentUser, currentRole, displayName, initialsOf, ROLE_LABELS } from '$lib/stores/auth';

  export let onlogout: () => void = () => {};

  let altroOpen = false;

  $: items = itemsForRole($currentRole);
  $: activeId = matchNavItem($page.url.pathname)?.id ?? 'dashboard';
  $: primaryIds = $currentRole ? PRIMARY_IDS[$currentRole] : [];
  $: primary = primaryIds.map((id) => items.find((i) => i.id === id)).filter((i): i is NavItem => !!i);
  $: secondary = [
    ...items.filter((i) => !primaryIds.includes(i.id)),
    ...($currentRole === 'admin' ? [INVITE_ITEM] : []),
    SETTINGS_ITEM
  ];
  $: if (secondary.some((i) => i.id === activeId)) altroOpen = true;
  $: expanded = $sidebarExpanded;

  function linkClass(isActive: boolean) {
    const layout = expanded ? 'px-3' : 'justify-center';
    const tone = isActive
      ? 'bg-[#F5D547] text-[#1A1A1A] shadow-[0_8px_20px_-12px_rgba(245,213,71,0.95)]'
      : 'text-[#1A1A1A]/80 hover:text-[#1A1A1A] hover:bg-white/70';
    return `flex items-center gap-3 rounded-2xl min-h-[46px] transition-all duration-150 ${layout} ${tone}`;
  }
</script>

<aside
  class="glass-panel hidden lg:flex fixed left-4 top-4 bottom-4 z-40 flex-col !rounded-[32px] text-[#1A1A1A] transition-[width] duration-300 ease-out"
  style="width: {expanded ? 'var(--sidebar-w-open)' : 'var(--sidebar-w)'}"
  aria-label="Navigazione principale"
>
  <div class="flex items-center gap-3 px-4 pt-5 pb-4 {expanded ? '' : 'justify-center'}">
    <a
      href="/"
      class="h-11 w-11 flex-shrink-0 rounded-2xl bg-[#F5D547] text-[#1A1A1A] flex items-center justify-center shadow-[0_8px_20px_-8px_rgba(245,213,71,0.9)]"
      aria-label="SpiritoAlchemico — Dashboard"
    >
      <FlaskConical class="h-5 w-5" />
    </a>
    {#if expanded}
      <div class="min-w-0 leading-tight">
        <p class="text-sm font-bold tracking-tight truncate">SpiritoAlchemico</p>
        <p class="text-[11px] text-[#1A1A1A]/55">ERP</p>
      </div>
    {/if}
  </div>

  <nav class="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-3 pb-2" aria-label="Menu principale">
    <ul class="space-y-1">
      {#each primary as item (item.id)}
        {@const isActive = activeId === item.id}
        <li class="relative group">
          <a href={item.href} aria-current={isActive ? 'page' : undefined} class={linkClass(isActive)}>
            <span class="relative flex-shrink-0">
              <svelte:component this={item.icon} class="h-[19px] w-[19px]" />
              {#if item.id === 'magazzino' && $sottoScortaCount > 0 && !expanded}
                <span class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#FF5C5C] ring-2 ring-white"></span>
              {/if}
            </span>
            {#if expanded}
              <span class="text-sm font-medium truncate flex-1">{item.label}</span>
              {#if item.id === 'magazzino' && $sottoScortaCount > 0}
                <span class="rounded-full bg-[#FF5C5C] text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {$sottoScortaCount}
                </span>
              {/if}
            {/if}
          </a>
          {#if !expanded}
            <span
              class="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden group-hover:block group-focus-within:block whitespace-nowrap rounded-xl bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-medium text-[#1A1A1A] shadow-lg z-50"
              role="tooltip">{item.label}</span
            >
          {/if}
        </li>
      {/each}
    </ul>

    {#if secondary.length > 0}
      <div class="mt-2">
        <button
          type="button"
          class="{linkClass(false)} w-full"
          aria-expanded={altroOpen}
          onclick={() => {
            if (secondary.some((i) => i.id === activeId)) return;
            altroOpen = !altroOpen;
          }}
        >
          <MoreHorizontal class="h-[19px] w-[19px] flex-shrink-0" />
          {#if expanded}<span class="text-sm font-medium">Altro</span>{/if}
        </button>
        {#if altroOpen}
          <ul class="mt-1 space-y-1">
            {#each secondary as item (item.id)}
              {@const isActive = activeId === item.id}
              <li class="relative group">
                <a href={item.href} aria-current={isActive ? 'page' : undefined} class={linkClass(isActive)}>
                  <svelte:component this={item.icon} class="h-[19px] w-[19px] flex-shrink-0" />
                  {#if expanded}<span class="text-sm font-medium truncate">{item.label}</span>{/if}
                </a>
                {#if !expanded}
                  <span
                    class="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden group-hover:block group-focus-within:block whitespace-nowrap rounded-xl bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-medium text-[#1A1A1A] shadow-lg z-50"
                    role="tooltip">{item.label}</span
                  >
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </nav>

  <div class="px-3 pb-3 pt-2 border-t border-black/5 space-y-1">
    <div class="flex items-center gap-3 rounded-2xl bg-white/55 p-2 {expanded ? '' : 'flex-col'}">
      <span
        class="h-10 w-10 flex-shrink-0 rounded-full bg-[#F5D547] text-[#1A1A1A] flex items-center justify-center text-xs font-bold"
        title={displayName($currentUser)}
      >
        {initialsOf($currentUser)}
      </span>
      {#if expanded}
        <div class="min-w-0 flex-1 leading-tight">
          <p class="text-sm font-semibold truncate">{displayName($currentUser)}</p>
          <p class="text-[11px] text-[#1A1A1A]/55 truncate">{$currentRole ? ROLE_LABELS[$currentRole] : 'Utente'}</p>
        </div>
      {/if}
      <button
        type="button"
        class="h-10 w-10 flex-shrink-0 inline-flex items-center justify-center rounded-xl text-[#1A1A1A]/55 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
        onclick={onlogout}
        aria-label="Esci"
        title="Esci"
      >
        <LogOut class="h-[18px] w-[18px]" />
      </button>
    </div>

    <button
      type="button"
      class="w-full flex items-center gap-3 rounded-2xl min-h-[40px] text-[#1A1A1A]/45 hover:text-[#1A1A1A] hover:bg-white/70 transition-colors {expanded
        ? 'px-3'
        : 'justify-center'}"
      onclick={() => sidebarExpanded.toggle()}
      aria-label={expanded ? 'Comprimi menu' : 'Espandi menu'}
    >
      {#if expanded}
        <PanelLeftClose class="h-[18px] w-[18px]" />
        <span class="text-xs font-medium">Comprimi menu</span>
      {:else}
        <PanelLeftOpen class="h-[18px] w-[18px]" />
      {/if}
    </button>
  </div>
</aside>
