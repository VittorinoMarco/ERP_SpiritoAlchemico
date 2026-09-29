<script lang="ts">
  import { page } from '$app/stores';
  import { PanelLeftClose, PanelLeftOpen, LogOut, FlaskConical } from 'lucide-svelte';
  import { NAV_GROUPS, SETTINGS_ITEM, INVITE_ITEM, itemsForRole, matchNavItem } from '$lib/config/nav';
  import { sidebarExpanded } from '$lib/stores/ui';
  import { sottoScortaCount } from '$lib/stores/magazzino';
  import { currentUser, currentRole, displayName, initialsOf, ROLE_LABELS } from '$lib/stores/auth';

  export let onlogout: () => void = () => {};

  $: items = itemsForRole($currentRole);
  $: activeId = matchNavItem($page.url.pathname)?.id ?? 'dashboard';
  $: groups = NAV_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) })).filter(
    (g) => g.items.length > 0
  );
  $: bottomItems = [...($currentRole === 'admin' ? [INVITE_ITEM] : []), SETTINGS_ITEM];
  $: expanded = $sidebarExpanded;
</script>

<aside
  class="hidden lg:flex fixed left-4 top-4 bottom-4 z-40 flex-col rounded-[32px] bg-[#1F1F1F] text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] transition-[width] duration-300 ease-out"
  style="width: {expanded ? 'var(--sidebar-w-open)' : 'var(--sidebar-w)'}"
  aria-label="Navigazione principale"
>
  <!-- Brand -->
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
        <p class="text-[11px] text-white/45">ERP</p>
      </div>
    {/if}
  </div>

  <!-- Voci -->
  <nav class="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-3 pb-2" aria-label="Menu principale">
    {#each groups as group, gi}
      <div class="{gi > 0 ? 'mt-3' : ''}">
        {#if expanded}
          <p class="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            {group.label}
          </p>
        {:else if gi > 0}
          <div class="mx-3 mb-2 h-px bg-white/10"></div>
        {/if}
        <ul class="space-y-1">
          {#each group.items as item (item.id)}
            {@const isActive = activeId === item.id}
            <li class="relative group">
              <a
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                class="flex items-center gap-3 rounded-2xl min-h-[46px] transition-all duration-150 {expanded
                  ? 'px-3'
                  : 'justify-center'} {isActive
                  ? 'bg-white text-[#1A1A1A] shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/10'}"
              >
                <span class="relative flex-shrink-0">
                  <svelte:component this={item.icon} class="h-[19px] w-[19px]" />
                  {#if item.id === 'magazzino' && $sottoScortaCount > 0 && !expanded}
                    <span class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#FF5C5C] ring-2 ring-[#1F1F1F]"></span>
                  {/if}
                </span>
                {#if expanded}
                  <span class="text-sm font-medium truncate flex-1">{item.label}</span>
                  {#if item.id === 'magazzino' && $sottoScortaCount > 0}
                    <span
                      class="rounded-full bg-[#FF5C5C] text-white text-[10px] font-bold px-1.5 py-0.5 leading-none"
                      title="Prodotti sotto scorta"
                    >
                      {$sottoScortaCount}
                    </span>
                  {/if}
                {/if}
              </a>
              {#if !expanded}
                <span
                  class="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden group-hover:block group-focus-within:block whitespace-nowrap rounded-xl bg-[#1A1A1A] px-3 py-1.5 text-xs font-medium text-white shadow-lg z-50"
                  role="tooltip"
                >
                  {item.label}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </nav>

  <!-- Fondo: impostazioni, profilo, toggle -->
  <div class="px-3 pb-3 pt-2 border-t border-white/10 space-y-1">
    {#each bottomItems as item (item.id)}
      {@const isActive = activeId === item.id}
      <div class="relative group">
        <a
          href={item.href}
          class="flex items-center gap-3 rounded-2xl min-h-[44px] transition-all duration-150 {expanded ? 'px-3' : 'justify-center'} {isActive
            ? 'bg-white text-[#1A1A1A]'
            : 'text-white/60 hover:text-white hover:bg-white/10'}"
        >
          <svelte:component this={item.icon} class="h-[19px] w-[19px] flex-shrink-0" />
          {#if expanded}<span class="text-sm font-medium truncate">{item.label}</span>{/if}
        </a>
        {#if !expanded}
          <span
            class="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden group-hover:block whitespace-nowrap rounded-xl bg-[#1A1A1A] px-3 py-1.5 text-xs font-medium text-white shadow-lg z-50"
            role="tooltip">{item.label}</span
          >
        {/if}
      </div>
    {/each}

    <div class="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2 {expanded ? '' : 'flex-col'}">
      <span
        class="h-10 w-10 flex-shrink-0 rounded-full bg-[#F5D547] text-[#1A1A1A] flex items-center justify-center text-xs font-bold"
        title={displayName($currentUser)}
      >
        {initialsOf($currentUser)}
      </span>
      {#if expanded}
        <div class="min-w-0 flex-1 leading-tight">
          <p class="text-sm font-semibold truncate">{displayName($currentUser)}</p>
          <p class="text-[11px] text-white/45 truncate">{$currentRole ? ROLE_LABELS[$currentRole] : 'Utente'}</p>
        </div>
      {/if}
      <button
        type="button"
        class="h-10 w-10 flex-shrink-0 inline-flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-white/10 transition-colors"
        onclick={onlogout}
        aria-label="Esci"
        title="Esci"
      >
        <LogOut class="h-[18px] w-[18px]" />
      </button>
    </div>

    <button
      type="button"
      class="w-full flex items-center gap-3 rounded-2xl min-h-[40px] text-white/40 hover:text-white hover:bg-white/10 transition-colors {expanded
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
