<script lang="ts">
  import { page } from '$app/stores';
  import { Search, Bell, FlaskConical, LogOut, Settings, ChevronDown } from 'lucide-svelte';
  import { matchNavItem } from '$lib/config/nav';
  import { searchOpen, notificationsOpen } from '$lib/stores/ui';
  import { unreadCount } from '$lib/stores/notifications';
  import { currentUser, currentRole, displayName, initialsOf, ROLE_LABELS } from '$lib/stores/auth';
  import NotificationPanel from '$lib/components/notifications/NotificationPanel.svelte';
  import { goto } from '$app/navigation';

  export let onlogout: () => void = () => {};

  let userMenuOpen = false;

  $: current = matchNavItem($page.url.pathname);
  $: isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  function openSettings() {
    userMenuOpen = false;
    goto('/impostazioni');
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (userMenuOpen = false)} />

<header
  class="sticky top-0 z-30 h-[var(--topbar-h)] flex items-center gap-3 px-4 lg:px-8 bg-[#F4F3F0]/80 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-none pt-[env(safe-area-inset-top)] box-content"
>
  <!-- Mobile: brand + sezione corrente -->
  <a href="/" class="lg:hidden flex items-center gap-2.5 min-w-0" aria-label="Dashboard">
    <span class="h-9 w-9 flex-shrink-0 rounded-xl bg-[#F5D547] text-[#1A1A1A] flex items-center justify-center">
      <FlaskConical class="h-[18px] w-[18px]" />
    </span>
    <span class="text-base font-bold tracking-tight truncate">{current?.label ?? 'SpiritoAlchemico'}</span>
  </a>

  <!-- Desktop: ricerca -->
  <button
    type="button"
    class="hidden lg:flex items-center gap-3 flex-1 max-w-md h-11 rounded-full bg-white/80 border border-white px-4 text-sm text-[#9CA3AF] shadow-sm hover:bg-white transition-colors"
    onclick={() => searchOpen.set(true)}
  >
    <Search class="h-4 w-4" />
    <span class="flex-1 text-left">Cerca clienti, ordini, prodotti…</span>
    <kbd class="rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7280]">{isMac ? '⌘' : 'Ctrl'} K</kbd>
  </button>

  <div class="flex-1 lg:hidden"></div>

  <div class="flex items-center gap-2 flex-shrink-0">
    <button
      type="button"
      class="lg:hidden h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/85 text-[#1A1A1A] shadow-sm"
      aria-label="Cerca"
      onclick={() => searchOpen.set(true)}
    >
      <Search class="h-[18px] w-[18px]" />
    </button>

    <div class="relative">
      <button
        type="button"
        class="relative h-10 w-10 lg:h-11 lg:w-11 inline-flex items-center justify-center rounded-full bg-white/85 text-[#1A1A1A] shadow-sm hover:bg-white transition-colors"
        aria-label="Notifiche"
        aria-expanded={$notificationsOpen}
        onclick={() => notificationsOpen.update((v) => !v)}
      >
        <Bell class="h-[18px] w-[18px]" />
        {#if $unreadCount > 0}
          <span
            class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-[#FF5C5C] text-[10px] font-bold text-white ring-2 ring-[#F4F3F0]"
          >
            {$unreadCount > 99 ? '99+' : $unreadCount}
          </span>
        {/if}
      </button>
      <NotificationPanel open={$notificationsOpen} onclose={() => notificationsOpen.set(false)} />
    </div>

    <!-- Profilo (solo desktop: su mobile sta nel menu) -->
    <div class="relative hidden lg:block">
      <button
        type="button"
        class="h-11 inline-flex items-center gap-2.5 rounded-full bg-white/85 pl-1.5 pr-3 shadow-sm hover:bg-white transition-colors"
        aria-expanded={userMenuOpen}
        aria-haspopup="menu"
        onclick={() => (userMenuOpen = !userMenuOpen)}
      >
        <span class="h-8 w-8 rounded-full bg-[#1A1A1A] text-[#F5D547] flex items-center justify-center text-[11px] font-bold">
          {initialsOf($currentUser)}
        </span>
        <span class="text-left leading-tight hidden xl:block">
          <span class="block text-[13px] font-semibold text-[#1A1A1A] max-w-[9rem] truncate">{displayName($currentUser)}</span>
          <span class="block text-[10px] text-[#6B7280]">{$currentRole ? ROLE_LABELS[$currentRole] : ''}</span>
        </span>
        <ChevronDown class="h-4 w-4 text-[#9CA3AF]" />
      </button>

      {#if userMenuOpen}
        <div class="fixed inset-0 z-40" role="presentation" onclick={() => (userMenuOpen = false)}></div>
        <div
          class="fade-in absolute right-0 top-full mt-2 z-50 w-64 rounded-3xl bg-white border border-black/5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] p-2"
          role="menu"
        >
          <div class="px-3 py-3">
            <p class="font-semibold text-[#1A1A1A] truncate">{displayName($currentUser)}</p>
            <p class="text-xs text-[#6B7280] truncate">{$currentUser?.email}</p>
            {#if $currentRole}
              <span class="mt-2 inline-flex rounded-full bg-[#FFF3CD] px-2.5 py-0.5 text-[11px] font-semibold text-[#1A1A1A]">
                {ROLE_LABELS[$currentRole]}
              </span>
            {/if}
          </div>
          <div class="h-px bg-black/5 my-1"></div>
          <button
            type="button"
            role="menuitem"
            class="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB] transition-colors"
            onclick={openSettings}
          >
            <Settings class="h-4 w-4 text-[#6B7280]" /> Impostazioni
          </button>
          <button
            type="button"
            role="menuitem"
            class="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
            onclick={() => {
              userMenuOpen = false;
              onlogout();
            }}
          >
            <LogOut class="h-4 w-4" /> Esci
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>
