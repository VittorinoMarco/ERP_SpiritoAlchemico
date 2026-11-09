<script lang="ts">
  import { page } from '$app/stores';
  import { PanelLeftClose, PanelLeftOpen, LogOut, FlaskConical, MoreHorizontal } from 'lucide-svelte';
  import { PRIMARY_IDS, MORE_IDS, SETTINGS_ITEM, INVITE_ITEM, itemsForRole, matchNavItem, type NavItem } from '$lib/config/nav';
  import { sidebarExpanded } from '$lib/stores/ui';
  import { sottoScortaCount } from '$lib/stores/magazzino';
  import { currentUser, currentRole, displayName, initialsOf, ROLE_LABELS } from '$lib/stores/auth';

  export let onlogout: () => void = () => {};

  let altroOpen = false;

  $: items = itemsForRole($currentRole);
  $: activeId = matchNavItem($page.url.pathname)?.id ?? 'dashboard';
  $: primaryIds = $currentRole ? PRIMARY_IDS[$currentRole] : [];
  $: moreIds = $currentRole ? MORE_IDS[$currentRole] : [];
  $: primary = primaryIds.map((id) => items.find((i) => i.id === id)).filter((i): i is NavItem => !!i);
  $: piu = moreIds.map((id) => items.find((i) => i.id === id)).filter((i): i is NavItem => !!i);
  $: shown = new Set([...primaryIds, ...moreIds]);
  $: altro = [
    ...items.filter((i) => !shown.has(i.id)),
    ...($currentRole === 'admin' ? [INVITE_ITEM] : []),
    SETTINGS_ITEM
  ];
  $: if (altro.some((i) => i.id === activeId)) altroOpen = true;
  $: expanded = $sidebarExpanded;

  function linkClass(isActive: boolean) {
    const layout = expanded ? 'px-3' : 'justify-center px-0';
    const tone = isActive
      ? 'bg-[#F5D547] text-[#1A1A1A] shadow-[0_8px_18px_-12px_rgba(180,140,0,0.9)]'
      : 'text-[#1A1A1A]/75 hover:text-[#1A1A1A] hover:bg-white/80';
    return `flex items-center gap-3 rounded-xl min-h-11 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${layout} ${tone}`;
  }
</script>

{#snippet entry(item: NavItem)}
  {@const isActive = activeId === item.id}
  <li class="relative group">
    <a href={item.href} aria-current={isActive ? 'page' : undefined} class={linkClass(isActive)}>
      <span class="relative flex-shrink-0">
        <svelte:component this={item.icon} class="h-[18px] w-[18px]" />
        {#if item.id === 'magazzino' && $sottoScortaCount > 0 && !expanded}
          <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#FF5C5C] ring-2 ring-white"></span>
        {/if}
      </span>
      {#if expanded}
        <span class="text-sm font-medium truncate flex-1 text-left">{item.label}</span>
        {#if item.id === 'magazzino' && $sottoScortaCount > 0}
          <span class="rounded-full bg-[#FF5C5C] text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
            {$sottoScortaCount}
          </span>
        {/if}
      {/if}
    </a>
    {#if !expanded}
      <span
        class="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#1A1A1A] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-within:block"
        role="tooltip">{item.label}</span
      >
    {/if}
  </li>
{/snippet}

<aside
  class="glass-panel hidden lg:flex fixed left-3 top-3 bottom-3 z-40 flex-col !rounded-[28px] text-[#1A1A1A] transition-[width] duration-300 ease-out"
  style="width: {expanded ? 'var(--sidebar-w-open)' : 'var(--sidebar-w)'}"
  aria-label="Navigazione principale"
>
  <div class="flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 px-3.5">
    <a
      href="/"
      class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F5D547] text-[#1A1A1A]"
      aria-label="Spirito Alchemico — Dashboard"
    >
      <FlaskConical class="h-[18px] w-[18px]" />
    </a>
    {#if expanded}
      <span class="min-w-0 font-[family-name:var(--font-display)] text-[17px] font-medium leading-none tracking-[-0.03em]">
        Spirito Alchemico
      </span>
    {/if}
  </div>

  <nav class="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-2.5 pb-2" aria-label="Menu principale">
    <ul class="space-y-0.5">
      {#each primary as item (item.id)}
        {@render entry(item)}
      {/each}
    </ul>

    {#if piu.length > 0}
      {#if expanded}
        <p class="px-3 pb-1.5 pt-6 text-xs font-semibold tracking-normal text-[#3e4654]">In più</p>
      {:else}
        <div class="mx-auto my-3 h-px w-6 bg-black/10"></div>
      {/if}
      <ul class="space-y-0.5">
        {#each piu as item (item.id)}
          {@render entry(item)}
        {/each}
      </ul>
    {/if}

    {#if altro.length > 0}
      <div class={piu.length > 0 ? 'mt-2' : 'mt-3'}>
        <button
          type="button"
          class="{linkClass(altro.some((i) => i.id === activeId) && !altroOpen)} w-full"
          aria-expanded={altroOpen}
          onclick={() => {
            if (altro.some((i) => i.id === activeId)) return;
            altroOpen = !altroOpen;
          }}
        >
          <MoreHorizontal class="h-[18px] w-[18px] shrink-0" />
          {#if expanded}<span class="text-sm font-medium">Altro</span>{/if}
        </button>
        {#if altroOpen}
          <ul class="mt-0.5 space-y-0.5">
            {#each altro as item (item.id)}
              {@render entry(item)}
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </nav>

  <div class="shrink-0 space-y-1 border-t border-black/5 px-2.5 pb-2.5 pt-2.5">
    <div class="flex items-center gap-2.5 rounded-2xl bg-white/50 p-1.5 {expanded ? '' : 'flex-col'}">
      <span
        class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1A1A1A] text-[11px] font-semibold text-[#F5D547]"
        title={displayName($currentUser)}
      >
        {initialsOf($currentUser)}
      </span>
      {#if expanded}
        <div class="min-w-0 flex-1 leading-tight">
          <p class="truncate text-[13px] font-semibold">{displayName($currentUser)}</p>
          <p class="truncate text-[11px] text-[#1A1A1A]/50">{$currentRole ? ROLE_LABELS[$currentRole] : 'Utente'}</p>
        </div>
      {/if}
      <button
        type="button"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#1A1A1A]/50 transition-colors hover:bg-white/80 hover:text-[#1A1A1A]"
        onclick={onlogout}
        aria-label="Esci"
        title="Esci"
      >
        <LogOut class="h-4 w-4" />
      </button>
    </div>

    <button
      type="button"
      class="flex min-h-9 w-full items-center gap-3 rounded-xl text-[#1A1A1A]/45 transition-colors hover:bg-white/70 hover:text-[#1A1A1A] {expanded
        ? 'px-3'
        : 'justify-center'}"
      onclick={() => sidebarExpanded.toggle()}
      aria-label={expanded ? 'Comprimi menu' : 'Espandi menu'}
    >
      {#if expanded}
        <PanelLeftClose class="h-4 w-4" />
        <span class="text-xs font-medium">Comprimi</span>
      {:else}
        <PanelLeftOpen class="h-4 w-4" />
      {/if}
    </button>
  </div>
</aside>
