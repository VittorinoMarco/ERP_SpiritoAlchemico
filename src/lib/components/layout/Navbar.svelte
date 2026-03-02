<script lang="ts">
  import { Bell, Settings } from 'lucide-svelte';

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
    | 'impostazioni';

  type NavItem = {
    id: NavItemId;
    label: string;
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
    { id: 'analytics', label: 'Analytics' },
    { id: 'impostazioni', label: 'Impostazioni' }
  ];

  const getVisibleItems = (role?: Role | null): NavItem[] => {
    if (!role || role === 'admin') {
      return allItems;
    }

    if (role === 'agente') {
      return allItems.filter((item) =>
        ['dashboard', 'clienti', 'ordini'].includes(item.id)
      );
    }

    if (role === 'magazziniere') {
      return allItems.filter((item) => ['dashboard', 'magazzino'].includes(item.id));
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

  let active: NavItemId = 'dashboard';
  let openMenu = false;

  $: visibleItems = getVisibleItems(user?.role as Role | null);

  const handleSelect = (id: NavItemId) => {
    active = id;
  };

  const toggleMenu = () => {
    openMenu = !openMenu;
  };
</script>

<nav
  class="w-full max-w-6xl mx-auto bg-white/70 backdrop-blur-xl rounded-full px-2 py-1.5 shadow-sm flex items-center justify-between gap-4"
>
  <div class="flex items-center gap-1 overflow-x-auto">
    {#each visibleItems as item}
      <button
        type="button"
        class="whitespace-nowrap text-sm font-medium transition-all duration-200 px-5 py-2 rounded-full"
        class:bg-[#1A1A1A]={active === item.id}
        class:text-white={active === item.id}
        class:text-[#6B7280]={active !== item.id}
        class:hover:text-[#1A1A1A]={active !== item.id}
        on:click={() => handleSelect(item.id)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  <div class="flex items-center gap-2 pr-1.5">
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#6B7280] hover:text-[#1A1A1A] shadow-sm transition-all duration-200"
      aria-label="Notifiche"
    >
      <Bell class="h-4 w-4" />
    </button>
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#6B7280] hover:text-[#1A1A1A] shadow-sm transition-all duration-200"
      aria-label="Impostazioni"
    >
      <Settings class="h-4 w-4" />
    </button>
    <div class="relative">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#F5D547] to-[#FFF8E7] border border-white shadow-sm pl-1 pr-2 py-1 text-xs font-semibold text-[#1A1A1A] transition-all duration-200"
        on:click={toggleMenu}
        aria-label="Profilo utente"
      >
        <span
          class="h-7 w-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-[10px]"
        >
          {initials(user?.name as string | undefined, user?.email as string | undefined)}
        </span>
        <span class="hidden sm:flex flex-col items-start leading-tight">
          <span class="text-[11px] font-medium">
            {(user?.name as string | undefined) ?? ((user?.email as string | undefined) ?? 'Utente')}
          </span>
          <span class="text-[10px] text-[#6B7280]">
            {roleLabel(user?.role as Role | null)}
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
              {roleLabel(user?.role as Role | null)}
            </p>
          </div>
          <div class="border-t border-black/5 my-1"></div>
          <form method="POST" action="/logout">
            <button
              type="submit"
              class="w-full text-left px-3 py-2 text-[#1A1A1A] hover:bg-[#F9FAFB] text-xs"
            >
              Esci
            </button>
          </form>
        </div>
      {/if}
    </div>
  </div>
</nav>

