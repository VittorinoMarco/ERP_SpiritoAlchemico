<script lang="ts">
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import {
    Search,
    Package,
    Users,
    ShoppingCart,
    FileText,
    Boxes,
    X,
    Loader2
  } from 'lucide-svelte';
  import type { SearchResult, SearchResultType } from '$lib/utils/search';
  import { searchPocketBase, interpretWithAI } from '$lib/utils/search';
  import { settingsStore } from '$lib/stores/settings';

  export let open = false;
  export let onclose: (() => void) | undefined = undefined;

  let query = '';
  let searchInput: HTMLInputElement | null = null;
  let results: SearchResult[] = [];
  let loading = false;
  let selectedIndex = 0;
  let aiUsed = false;

  const TYPE_CONFIG: Record<
    SearchResultType,
    { label: string; icon: typeof Package; route?: string }
  > = {
    products: { label: 'Prodotti', icon: Package },
    clients: { label: 'Clienti', icon: Users },
    orders: { label: 'Ordini', icon: ShoppingCart },
    invoices: { label: 'Fatture', icon: FileText },
    inventory: { label: 'Magazzino', icon: Boxes }
  };

  $: flatResults = results;

  $: if (open && !query) {
    results = [];
    selectedIndex = 0;
    aiUsed = false;
  }
  $: if (open) {
    tick().then(() => searchInput?.focus());
  }

  async function doSearch() {
    const q = query.trim();
    if (!q) {
      results = [];
      return;
    }
    loading = true;
    results = [];
    aiUsed = false;
    try {
      let aiFilters: import('$lib/utils/search').AIFilterResponse = {};
      const apiKey = $settingsStore.openaiApiKey ?? '';
      if (apiKey) {
        const { filters, used } = await interpretWithAI(q, apiKey);
        aiFilters = filters ?? {};
        aiUsed = used && Object.values(aiFilters).some((v) => v && v.length > 0);
      }
      const searchFilters = aiUsed ? aiFilters : undefined;
      const res = await searchPocketBase(q, searchFilters, aiUsed);
      results = res;
      selectedIndex = 0;
    } catch {
      results = [];
    } finally {
      loading = false;
    }
  }

  let searchTimeout: ReturnType<typeof setTimeout>;
  function onInput() {
    clearTimeout(searchTimeout);
    if (!query.trim()) {
      results = [];
      return;
    }
    searchTimeout = setTimeout(doSearch, 300);
  }

  function close() {
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, flatResults.length - 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      return;
    }
    if (e.key === 'Enter' && flatResults[selectedIndex]) {
      e.preventDefault();
      goto(flatResults[selectedIndex].url);
      close();
    }
  }

  function handleSelect(r: SearchResult) {
    goto(r.url);
    close();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  const grouped = (() => {
    const groups: Record<SearchResultType, SearchResult[]> = {
      products: [],
      clients: [],
      orders: [],
      invoices: [],
      inventory: []
    };
    for (const r of results) {
      groups[r.type].push(r);
    }
    return Object.entries(groups).filter(([, items]) => items.length > 0) as [
      SearchResultType,
      SearchResult[]
    ][];
  })();
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/40 backdrop-blur-md"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Ricerca globale"
    tabindex="-1"
  >
    <div
      class="w-full max-w-2xl rounded-3xl bg-white shadow-xl overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div class="p-4 border-b border-black/5">
        <div class="flex items-center gap-3">
          <Search class="h-6 w-6 text-[#9CA3AF] flex-shrink-0" />
          <input
            type="text"
            bind:this={searchInput}
            bind:value={query}
            oninput={onInput}
            placeholder="Cerca ovunque..."
            class="flex-1 text-xl bg-transparent focus:outline-none placeholder:text-[#9CA3AF] text-[#1A1A1A]"
          />
          <button
            type="button"
            class="p-2 rounded-full text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A] transition-colors"
            onclick={close}
            aria-label="Chiudi"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>

      <div class="max-h-[60vh] overflow-y-auto py-2">
        {#if loading}
          <div class="flex items-center justify-center gap-2 py-12 text-[#6B7280]">
            <Loader2 class="h-5 w-5 animate-spin" />
            <span class="text-sm">Ricerca...</span>
          </div>
        {:else if grouped.length === 0 && query.trim()}
          <p class="py-12 text-center text-sm text-[#6B7280]">Nessun risultato</p>
        {:else}
          {#each grouped as [type, items]}
            {@const config = TYPE_CONFIG[type]}
            <div class="mb-4">
              <div class="flex items-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                <svelte:component this={config.icon} class="h-4 w-4" />
                {config.label}
              </div>
              {#each items as item, i}
                {@const globalIdx = grouped
                  .slice(0, grouped.findIndex(([t]) => t === type))
                  .reduce((s, [, arr]) => s + arr.length, 0) + i}
                <button
                  type="button"
                  class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors {globalIdx ===
                  selectedIndex
                    ? 'bg-[#FFFDE7]'
                    : 'hover:bg-[#FFFDE7]'}"
                  onclick={() => handleSelect(item)}
                >
                  <span
                    class="h-9 w-9 rounded-xl bg-[#FFF3CD] flex items-center justify-center flex-shrink-0"
                  >
                    <svelte:component this={config.icon} class="h-4 w-4 text-[#6B7280]" />
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-[#1A1A1A] truncate">{item.title}</p>
                    <p class="text-sm text-[#6B7280] truncate">{item.subtitle}</p>
                  </div>
                  {#if item.aiInterpreted}
                    <span
                      class="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F5D547] text-[#1A1A1A]"
                    >
                      AI
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
