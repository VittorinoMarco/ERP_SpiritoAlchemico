<script lang="ts">
  import { goto } from '$app/navigation';
  import { tick, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { Search, Package, Users, ShoppingCart, FileText, Boxes, X, Loader2, CornerDownLeft, Sparkles } from 'lucide-svelte';
  import type { SearchResult, SearchResultType, AIFilterResponse } from '$lib/utils/search';
  import { searchPocketBase, interpretWithAI } from '$lib/utils/search';
  import { settingsStore } from '$lib/stores/settings';
  import { currentRole } from '$lib/stores/auth';

  export let open = false;
  export let onclose: (() => void) | undefined = undefined;

  let query = '';
  let searchInput: HTMLInputElement | null = null;
  let results: SearchResult[] = [];
  let loading = false;
  let selectedIndex = 0;
  let aiUsed = false;
  let searchSeq = 0;
  let lockedScroll = false;

  const TYPE_CONFIG: Record<SearchResultType, { label: string; icon: typeof Package }> = {
    clients: { label: 'Clienti', icon: Users },
    orders: { label: 'Ordini', icon: ShoppingCart },
    products: { label: 'Prodotti', icon: Package },
    invoices: { label: 'Fatture', icon: FileText },
    inventory: { label: 'Magazzino', icon: Boxes }
  };
  const TYPE_ORDER: SearchResultType[] = ['clients', 'orders', 'products', 'invoices', 'inventory'];

  /** Ogni ruolo cerca solo dove ha accesso (le pagine di destinazione sono protette per ruolo). */
  $: allowedTypes = ((): SearchResultType[] => {
    if ($currentRole === 'admin') return ['products', 'clients', 'orders', 'invoices', 'inventory'];
    if ($currentRole === 'agente') return ['clients', 'orders'];
    if ($currentRole === 'magazziniere') return ['inventory'];
    return [];
  })();

  // Risultati raggruppati: DEVE essere reattivo (prima era calcolato una sola volta → nessun risultato visibile)
  $: grouped = TYPE_ORDER.map((type) => ({
    type,
    items: results.filter((r) => r.type === type)
  })).filter((g) => g.items.length > 0);
  $: flat = grouped.flatMap((g) => g.items);

  $: if (open) {
    tick().then(() => searchInput?.focus());
  } else {
    query = '';
    results = [];
    selectedIndex = 0;
    aiUsed = false;
    loading = false;
  }

  $: if (browser) {
    if (open && !lockedScroll) {
      document.body.style.overflow = 'hidden';
      lockedScroll = true;
    } else if (!open && lockedScroll) {
      document.body.style.overflow = '';
      lockedScroll = false;
    }
  }
  onDestroy(() => {
    if (browser && lockedScroll) document.body.style.overflow = '';
  });

  function wantsAi(q: string): boolean {
    // L'AI serve per frasi in linguaggio naturale, non per nomi brevi ("Bar Roma")
    return q.split(/\s+/).length >= 3 || q.length >= 18;
  }

  async function doSearch() {
    const q = query.trim();
    const seq = ++searchSeq;
    if (!q) {
      results = [];
      loading = false;
      return;
    }
    loading = true;
    try {
      const apiKey = $settingsStore.openaiApiKey ?? '';
      let filters: AIFilterResponse | undefined;
      let used = false;
      if (apiKey && wantsAi(q)) {
        const r = await interpretWithAI(q, apiKey);
        used = r.used && Object.values(r.filters ?? {}).some((v) => v && v.length > 0);
        filters = used ? r.filters : undefined;
      }
      let res = await searchPocketBase(q, filters, used, allowedTypes);
      // Se il filtro AI non trova nulla, ripiega sulla ricerca testuale semplice
      if (used && res.length === 0) {
        res = await searchPocketBase(q, undefined, false, allowedTypes);
        used = false;
      }
      if (seq !== searchSeq) return; // è partita una ricerca più recente
      results = res;
      aiUsed = used;
      selectedIndex = 0;
    } catch {
      if (seq === searchSeq) results = [];
    } finally {
      if (seq === searchSeq) loading = false;
    }
  }

  let timer: ReturnType<typeof setTimeout>;
  function onInput() {
    clearTimeout(timer);
    if (!query.trim()) {
      searchSeq++;
      results = [];
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(doSearch, 280);
  }

  function close() {
    onclose?.();
  }

  function go(r: SearchResult) {
    close();
    goto(r.url);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, flat.length - 1);
      scrollActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollActive();
    } else if (e.key === 'Enter' && flat[selectedIndex]) {
      e.preventDefault();
      go(flat[selectedIndex]);
    }
  }

  function scrollActive() {
    tick().then(() => document.querySelector('[data-search-active="true"]')?.scrollIntoView({ block: 'nearest' }));
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[80] flex items-start justify-center pt-[max(1rem,env(safe-area-inset-top))] sm:pt-[12vh] px-3 sm:px-4 bg-black/40 backdrop-blur-md fade-in"
    onclick={(e) => e.target === e.currentTarget && close()}
    role="presentation"
  >
    <div
      class="sheet-up w-full max-w-2xl rounded-[28px] bg-white shadow-2xl overflow-hidden mt-2 sm:mt-0"
      role="dialog"
      aria-modal="true"
      aria-label="Ricerca globale"
    >
      <div class="px-5 py-4 border-b border-black/5 flex items-center gap-3">
        <Search class="h-5 w-5 text-[#9CA3AF] flex-shrink-0" />
        <input
          type="text"
          bind:this={searchInput}
          bind:value={query}
          oninput={onInput}
          placeholder="Cerca clienti, ordini, prodotti…"
          autocomplete="off"
          class="flex-1 min-w-0 text-base sm:text-lg bg-transparent focus:outline-none placeholder:text-[#9CA3AF] text-[#1A1A1A]"
        />
        {#if loading}
          <Loader2 class="h-4 w-4 animate-spin text-[#9CA3AF]" />
        {/if}
        <button
          type="button"
          class="h-10 w-10 inline-flex items-center justify-center rounded-full text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A] transition-colors flex-shrink-0"
          onclick={close}
          aria-label="Chiudi"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="max-h-[60dvh] overflow-y-auto overscroll-contain py-2">
        {#if !query.trim()}
          <p class="px-6 py-10 text-center text-sm text-[#9CA3AF]">
            Digita per cercare. Con la chiave OpenAI attiva puoi anche scrivere frasi come
            <span class="text-[#6B7280]">"ordini non spediti di marzo"</span>.
          </p>
        {:else if !loading && flat.length === 0}
          <p class="px-6 py-12 text-center text-sm text-[#6B7280]">Nessun risultato per "{query.trim()}"</p>
        {:else}
          {#each grouped as group}
            {@const config = TYPE_CONFIG[group.type]}
            <div class="mb-2">
              <div class="flex items-center gap-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <svelte:component this={config.icon} class="h-3.5 w-3.5" />
                {config.label}
              </div>
              {#each group.items as item (item.type + item.id)}
                {@const active = flat[selectedIndex] === item}
                <button
                  type="button"
                  data-search-active={active}
                  class="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors {active ? 'bg-[#FFFDE7]' : 'hover:bg-[#FFFDE7]'}"
                  onclick={() => go(item)}
                  onmousemove={() => (selectedIndex = flat.indexOf(item))}
                >
                  <span class="h-10 w-10 rounded-xl bg-[#FFF3CD] flex items-center justify-center flex-shrink-0">
                    <svelte:component this={config.icon} class="h-4 w-4 text-[#1A1A1A]" />
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-[#1A1A1A] truncate">{item.title}</p>
                    {#if item.subtitle}
                      <p class="text-sm text-[#6B7280] truncate">{item.subtitle}</p>
                    {/if}
                  </div>
                  {#if item.aiInterpreted}
                    <span class="inline-flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F5D547] text-[#1A1A1A]">
                      <Sparkles class="h-3 w-3" /> AI
                    </span>
                  {/if}
                  {#if active}
                    <CornerDownLeft class="hidden sm:block h-4 w-4 text-[#9CA3AF] flex-shrink-0" />
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <div class="hidden sm:flex items-center justify-between px-5 py-2.5 border-t border-black/5 text-[11px] text-[#9CA3AF]">
        <span>↑↓ per navigare · Invio per aprire · Esc per chiudere</span>
        {#if aiUsed}<span>Filtri interpretati con AI</span>{/if}
      </div>
    </div>
  </div>
{/if}
