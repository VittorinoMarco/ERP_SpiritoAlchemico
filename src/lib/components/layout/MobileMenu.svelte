<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { X, LogOut } from 'lucide-svelte';
  import { NAV_GROUPS, SETTINGS_ITEM, INVITE_ITEM, itemsForRole, matchNavItem } from '$lib/config/nav';
  import { mobileMenuOpen } from '$lib/stores/ui';
  import { sottoScortaCount } from '$lib/stores/magazzino';
  import { currentUser, currentRole, displayName, initialsOf, ROLE_LABELS } from '$lib/stores/auth';

  export let onlogout: () => void = () => {};

  let locked = false;

  $: items = itemsForRole($currentRole);
  $: groups = NAV_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) })).filter(
    (g) => g.items.length > 0
  );
  $: extra = [...($currentRole === 'admin' ? [INVITE_ITEM] : []), SETTINGS_ITEM];
  $: activeId = matchNavItem($page.url.pathname)?.id ?? 'dashboard';

  // Chiude il menu quando si cambia pagina
  $: if ($page.url.pathname) mobileMenuOpen.set(false);

  $: if (browser) {
    if ($mobileMenuOpen && !locked) {
      document.body.style.overflow = 'hidden';
      locked = true;
    } else if (!$mobileMenuOpen && locked) {
      document.body.style.overflow = '';
      locked = false;
    }
  }
  onDestroy(() => {
    if (browser && locked) document.body.style.overflow = '';
  });

  function close() {
    mobileMenuOpen.set(false);
  }
</script>

<svelte:window onkeydown={(e) => $mobileMenuOpen && e.key === 'Escape' && close()} />

{#if $mobileMenuOpen}
  <div
    class="lg:hidden fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm fade-in flex items-end"
    onclick={(e) => e.target === e.currentTarget && close()}
    role="presentation"
  >
    <div
      class="sheet-up w-full max-h-[88dvh] flex flex-col rounded-t-[32px] bg-[#F7F6F3] shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div class="flex justify-center pt-2.5"><span class="h-1 w-10 rounded-full bg-black/15"></span></div>

      <!-- Profilo -->
      <div class="flex items-center gap-3 px-5 pt-3 pb-4">
        <span class="h-12 w-12 rounded-full bg-[#1A1A1A] text-[#F5D547] flex items-center justify-center text-sm font-bold flex-shrink-0">
          {initialsOf($currentUser)}
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-[#1A1A1A] truncate">{displayName($currentUser)}</p>
          <p class="text-xs text-[#6B7280]">{$currentRole ? ROLE_LABELS[$currentRole] : 'Utente'}</p>
        </div>
        <button
          type="button"
          class="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white text-[#6B7280]"
          onclick={close}
          aria-label="Chiudi menu"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
        {#each groups as group}
          <p class="px-1 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">{group.label}</p>
          <div class="grid grid-cols-3 gap-2">
            {#each group.items as item (item.id)}
              {@const isActive = activeId === item.id}
              <a
                href={item.href}
                class="relative flex flex-col items-center justify-center gap-2 rounded-3xl px-2 py-4 text-center transition-colors {isActive
                  ? 'bg-[#F5D547] text-[#1A1A1A]'
                  : 'bg-white text-[#1A1A1A] active:bg-[#FFF3CD]'}"
              >
                <svelte:component this={item.icon} class="h-6 w-6" />
                <span class="text-xs font-semibold leading-tight">{item.label}</span>
                {#if item.id === 'magazzino' && $sottoScortaCount > 0}
                  <span class="absolute top-2 right-2 rounded-full bg-[#FF5C5C] text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                    {$sottoScortaCount}
                  </span>
                {/if}
              </a>
            {/each}
          </div>
        {/each}

        <p class="px-1 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Account</p>
        <div class="grid grid-cols-3 gap-2">
          {#each extra as item (item.id)}
            <a
              href={item.href}
              class="flex flex-col items-center justify-center gap-2 rounded-3xl px-2 py-4 text-center bg-white text-[#1A1A1A] active:bg-[#FFF3CD]"
            >
              <svelte:component this={item.icon} class="h-6 w-6" />
              <span class="text-xs font-semibold leading-tight">{item.label}</span>
            </a>
          {/each}
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-2 rounded-3xl px-2 py-4 text-center bg-white text-rose-600 active:bg-rose-50"
            onclick={() => {
              close();
              onlogout();
            }}
          >
            <LogOut class="h-6 w-6" />
            <span class="text-xs font-semibold leading-tight">Esci</span>
          </button>
        </div>
      </div>
      <div class="h-[max(1rem,env(safe-area-inset-bottom))]"></div>
    </div>
  </div>
{/if}
