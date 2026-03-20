<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    Bell,
    Settings,
    AlertTriangle,
    Search,
    LayoutGrid,
    LayoutDashboard,
    Package,
    Users,
    ShoppingCart,
    UserCircle,
    Boxes,
    FileText,
    BarChart2,
    Activity,
    X,
    Wallet,
    Sparkles
  } from 'lucide-svelte';
  import { pb } from '$lib/pocketbase';
  import { sottoScortaCount } from '$lib/stores/magazzino';
  import { notificationsStore, unreadCount } from '$lib/stores/notifications';
  import SearchModal from '$lib/components/search/SearchModal.svelte';
  import NotificationPanel from '$lib/components/notifications/NotificationPanel.svelte';

  let searchOpen = false;
  let notificationsOpen = false;
  let moreMenuOpen = false;

  const PRIMARY_COUNT = 4;
  const ADMIN_PRIMARY_IDS: NavItemId[] = [
    'dashboard',
    'clienti',
    'ordini',
    'fatture'
  ];

  onMount(async () => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchOpen = true;
      }
      if (e.key === 'Escape' && moreMenuOpen) {
        moreMenuOpen = false;
      }
    };
    window.addEventListener('keydown', handler);
    await notificationsStore.fetch();
    const cleanup = notificationsStore.subscribeRealtime();
    return () => {
      window.removeEventListener('keydown', handler);
      cleanup();
    };
  });

  type Role = 'admin' | 'agente' | 'magazziniere';

  type NavItemId =
    | 'dashboard'
    | 'prodotti'
    | 'clienti'
    | 'ordini'
    | 'agenti'
    | 'magazzino'
    | 'fatture'
    | 'analytics'
    | 'attivita'
    | 'impostazioni'
    | 'uscite'
    | 'assistente';

  type NavItem = {
    id: NavItemId;
    label: string;
  };

  const ITEM_ICONS: Record<NavItemId, typeof LayoutDashboard> = {
    dashboard: LayoutDashboard,
    prodotti: Package,
    clienti: Users,
    ordini: ShoppingCart,
    agenti: UserCircle,
    magazzino: Boxes,
    fatture: FileText,
    analytics: BarChart2,
    attivita: Activity,
    impostazioni: Settings,
    uscite: Wallet,
    assistente: Sparkles
  };

  export let user:
    | (import('pocketbase').RecordModel & {
        role?: Role;
        name?: string;
      })
    | null = null;

  const allItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'prodotti', label: 'Prodotti' },
    { id: 'clienti', label: 'Clienti' },
    { id: 'ordini', label: 'Ordini' },
    { id: 'agenti', label: 'Agenti' },
    { id: 'magazzino', label: 'Magazzino' },
    { id: 'fatture', label: 'Fatture' },
    { id: 'uscite', label: 'Uscite' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'assistente', label: 'Assistente AI' },
    { id: 'attivita', label: 'Attività' }
  ];

  const getVisibleItems = (role?: Role | null): NavItem[] => {
    if (!role || role === 'admin') {
      return allItems;
    }

    if (role === 'agente') {
      return allItems.filter((item) =>
        ['dashboard', 'clienti', 'ordini', 'attivita', 'assistente'].includes(item.id)
      );
    }

    if (role === 'magazziniere') {
      return allItems.filter((item) =>
        ['dashboard', 'magazzino', 'attivita', 'assistente'].includes(item.id)
      );
    }

    return allItems;
  };

  const roleLabel = (role?: Role | null): string => {
    if (role === 'admin') return 'Amministratore';
    if (role === 'agente') return 'Agente';
    if (role === 'magazziniere') return 'Magazziniere';
    return 'Utente';
  };

  const initials = (name?: string | null, email?: string | null): string => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }

    if (email) {
      return email.slice(0, 2).toUpperCase();
    }

    return 'SA';
  };

  let openMenu = false;

  $: role = (user?.role || (user as any)?.ruolo) as Role | null;
  $: visibleItems = getVisibleItems(role);
  $: primaryItems =
    role === 'admin'
      ? ADMIN_PRIMARY_IDS.map((id) => visibleItems.find((i) => i.id === id)).filter(Boolean) as NavItem[]
      : visibleItems.slice(0, PRIMARY_COUNT);
  $: moreItems =
    role === 'admin'
      ? visibleItems.filter((i) => !ADMIN_PRIMARY_IDS.includes(i.id))
      : visibleItems.slice(PRIMARY_COUNT);
  $: showMoreMenu = moreItems.length > 0;
  $: path = $page.url.pathname;
  $: active = path.startsWith('/prodotti')
    ? 'prodotti'
    : path.startsWith('/clienti')
      ? 'clienti'
      : path.startsWith('/ordini')
        ? 'ordini'
        : path.startsWith('/agenti')
          ? 'agenti'
          : path.startsWith('/magazzino')
          ? 'magazzino'
          : path.startsWith('/fatture')
            ? 'fatture'
            : path.startsWith('/uscite')
              ? 'uscite'
              : path.startsWith('/analytics')
                ? 'analytics'
                : path.startsWith('/assistente')
                  ? 'assistente'
                  : path.startsWith('/attivita')
                    ? 'attivita'
                    : path.startsWith('/impostazioni')
                      ? 'impostazioni'
                      : 'dashboard';

  const handleSelect = (id: NavItemId) => {
    moreMenuOpen = false;
    const routes: Record<NavItemId, string> = {
      dashboard: '/',
      prodotti: '/prodotti',
      clienti: '/clienti',
      ordini: '/ordini',
      agenti: '/agenti',
      magazzino: '/magazzino',
      fatture: '/fatture',
      uscite: '/uscite',
      analytics: '/analytics',
      assistente: '/assistente',
      attivita: '/attivita',
      impostazioni: '/impostazioni'
    };
    goto(routes[id] ?? '/');
  };

  const toggleMenu = () => {
    openMenu = !openMenu;
  };

  const handleLogout = () => {
    pb.authStore.clear();
    goto('/login');
  };
</script>

<nav
  class="w-full max-w-6xl mx-auto bg-white/70 backdrop-blur-xl rounded-full px-2 sm:px-3 py-1.5 sm:py-2 shadow-sm flex items-center justify-between gap-2 min-w-0"
>
  <div
    class="flex-1 min-w-0 flex items-center justify-evenly gap-1 sm:gap-2 md:gap-3 lg:gap-4"
    role="navigation"
    aria-label="Menu principale"
  >
    {#each primaryItems as item}
      {@const Icon = ITEM_ICONS[item.id]}
      <button
        type="button"
        class="flex-1 min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-2 px-1 sm:px-3 rounded-full text-xs sm:text-sm font-medium transition-all duration-200"
        class:bg-[#1A1A1A]={active === item.id}
        class:text-white={active === item.id}
        class:text-[#6B7280]={active !== item.id}
        class:hover:text-[#1A1A1A]={active !== item.id}
        onclick={() => handleSelect(item.id)}
        title={item.label}
      >
        <Icon class="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
        <span class="hidden sm:inline truncate max-w-full">{item.label}</span>
        {#if item.id === 'magazzino' && $sottoScortaCount > 0}
          <span
            class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 flex-shrink-0"
            title="Prodotti sotto scorta"
          >
            {$sottoScortaCount}
          </span>
        {/if}
      </button>
    {/each}
    {#if showMoreMenu}
      <button
        type="button"
        class="flex-1 min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-2 px-1 sm:px-3 rounded-full text-xs sm:text-sm font-medium transition-all duration-200"
        class:bg-[#1A1A1A]={moreItems.some((i) => active === i.id)}
        class:text-white={moreItems.some((i) => active === i.id)}
        class:text-[#6B7280]={!moreItems.some((i) => active === i.id)}
        class:hover:text-[#1A1A1A]={!moreItems.some((i) => active === i.id)}
        onclick={() => (moreMenuOpen = true)}
        aria-label="Altri menu"
        title="Altro"
      >
        <LayoutGrid class="h-4 w-4 flex-shrink-0" />
        <span class="hidden sm:inline">Altro</span>
      </button>
    {/if}
  </div>

  <div class="flex items-center gap-1 sm:gap-2 pl-1 flex-shrink-0">
    <button
      type="button"
      class="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/80 text-[#6B7280] hover:text-[#1A1A1A] shadow-sm transition-all duration-200"
      aria-label="Cerca (⌘K)"
      onclick={() => (searchOpen = true)}
    >
      <Search class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </button>
    <div class="relative">
      <button
        type="button"
        class="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/80 text-[#6B7280] hover:text-[#1A1A1A] shadow-sm transition-all duration-200"
        aria-label="Notifiche"
        onclick={() => (notificationsOpen = !notificationsOpen)}
      >
        <Bell class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        {#if $unreadCount > 0}
          <span
            class="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
          >
            {$unreadCount > 99 ? '99+' : $unreadCount}
          </span>
        {/if}
      </button>
      <NotificationPanel
        open={notificationsOpen}
        onclose={() => (notificationsOpen = false)}
      />
    </div>
    <button
      type="button"
      class="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/80 text-[#6B7280] hover:text-[#1A1A1A] shadow-sm transition-all duration-200"
      aria-label="Impostazioni"
      onclick={() => goto('/impostazioni')}
    >
      <Settings class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </button>
    <div class="relative">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-gradient-to-br from-[#F5D547] to-[#FFF8E7] border border-white shadow-sm pl-1 pr-1.5 sm:pr-2 py-1 text-xs font-semibold text-[#1A1A1A] transition-all duration-200"
        onclick={toggleMenu}
        aria-label="Profilo utente"
      >
        <span
          class="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-[10px] flex-shrink-0"
        >
          {initials(user?.name as string | undefined, user?.email as string | undefined)}
        </span>
        <span class="hidden sm:flex flex-col items-start leading-tight">
          <span class="text-[11px] font-medium">
            {(user?.name as string | undefined) ?? ((user?.email as string | undefined) ?? 'Utente')}
          </span>
          <span class="text-[10px] text-[#6B7280]">
            {roleLabel((user?.role || (user as any)?.ruolo) as Role | null)}
          </span>
        </span>
      </button>

      {#if openMenu}
        <div
          class="absolute right-0 mt-2 w-48 rounded-2xl bg-white shadow-lg border border-black/5 py-2 text-sm"
        >
          <div class="px-3 pb-2">
            <p class="font-medium text-[#1A1A1A] truncate">
              {(user?.name as string | undefined) ??
                ((user?.email as string | undefined) ?? 'Utente')}
            </p>
            <p class="text-xs text-[#6B7280]">
              {roleLabel((user?.role || (user as any)?.ruolo) as Role | null)}
            </p>
          </div>
          <div class="border-t border-black/5 my-1"></div>
          <button
            type="button"
            class="w-full text-left px-3 py-2 text-[#1A1A1A] hover:bg-[#F9FAFB] text-xs"
            onclick={handleLogout}
          >
            Esci
          </button>
        </div>
      {/if}
    </div>
  </div>
</nav>

<SearchModal open={searchOpen} onclose={() => (searchOpen = false)} />

{#if moreMenuOpen}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center p-0 sm:p-4 bg-black/20 backdrop-blur-sm"
    onclick={() => (moreMenuOpen = false)}
    onkeydown={(e) => e.key === 'Escape' && (moreMenuOpen = false)}
    role="dialog"
    aria-modal="true"
    aria-label="Menu di navigazione"
    tabindex="-1"
  >
    <div
      class="w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl bg-white shadow-xl overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-black/5">
        <h2 class="text-sm font-semibold text-[#1A1A1A]">Altri menu</h2>
        <button
          type="button"
          class="p-2 rounded-full text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A] transition-colors"
          onclick={() => (moreMenuOpen = false)}
          aria-label="Chiudi"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
      <div class="p-4 grid grid-cols-2 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
        {#each moreItems as item}
          {@const Icon = ITEM_ICONS[item.id]}
          <button
            type="button"
            class="flex items-center gap-3 rounded-2xl p-4 text-left transition-all duration-200 hover:bg-[#FFFDE7] focus:outline-none focus:ring-2 focus:ring-[#F5D547] focus:ring-offset-2"
            class:bg-[#FFF3CD]={active === item.id}
            onclick={() => handleSelect(item.id)}
          >
            <span
              class="flex h-10 w-10 rounded-xl items-center justify-center flex-shrink-0 {active === item.id
                ? 'bg-[#F5D547] text-[#1A1A1A]'
                : 'bg-[#E5E7EB] text-[#6B7280]'}"
            >
              <Icon class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-[#1A1A1A] truncate">{item.label}</span>
              {#if item.id === 'magazzino' && $sottoScortaCount > 0}
                <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 mt-0.5">
                  <AlertTriangle class="h-3 w-3" />
                  {$sottoScortaCount} sotto scorta
                </span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

