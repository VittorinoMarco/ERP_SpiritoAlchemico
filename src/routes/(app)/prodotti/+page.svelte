<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ProductModal from '$lib/components/products/ProductModal.svelte';
  import {
    Search,
    Plus,
    Download,
    ChevronLeft,
    ChevronRight,
    ImageOff
  } from 'lucide-svelte';
  import type { Product, ProductCategory } from '$lib/types/product';
  import { CATEGORY_LABELS, CATEGORY_BADGE_COLORS } from '$lib/types/product';

  const CATEGORY_FILTERS: { value: ProductCategory | 'tutti'; label: string }[] = [
    { value: 'tutti', label: 'Tutti' },
    { value: 'liquore', label: 'Liquore' },
    { value: 'amaro', label: 'Amaro' },
    { value: 'gin', label: 'Gin' }
  ];

  const ITEMS_PER_PAGE = 10;

  let products: Product[] = [];
  let loading = true;
  let search = '';
  let categoryFilter: ProductCategory | 'tutti' = 'tutti';
  let selectedIds = new Set<string>();
  let modalOpen = false;
  let editingProduct: Product | null = null;
  let page = 1;

  $: filteredProducts = products.filter((p) => {
    const matchSearch =
      !search ||
      p.nome?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      categoryFilter === 'tutti' || p.categoria === categoryFilter;
    return matchSearch && matchCategory;
  });

  $: totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  $: paginatedProducts = filteredProducts.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  onMount(async () => {
    try {
      const list = await pb.collection('products').getFullList<Product>();
      products = list;
    } catch {
      products = [];
    } finally {
      loading = false;
    }
  });

  $: if (page > totalPages && totalPages > 0) {
    page = totalPages;
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    if (selectedIds.size === paginatedProducts.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(paginatedProducts.map((p) => p.id));
    }
  }

  function openNewModal() {
    editingProduct = null;
    modalOpen = true;
  }

  function openEditModal(p: Product) {
    editingProduct = p;
    modalOpen = true;
  }

  function handleSaved() {
    pb.collection('products')
      .getFullList<Product>()
      .then((list) => {
        products = list;
      });
  }

  function getImageUrl(p: Product): string {
    if (p.immagine) {
      return pb.files.getUrl(p as any, p.immagine, { thumb: '48x48' });
    }
    return '';
  }

  function exportCsv() {
    const headers = [
      'Nome',
      'SKU',
      'Categoria',
      'Prezzo Listino',
      'Prezzo HORECA',
      'Prezzo E-commerce',
      'Volume (ml)',
      'Gradazione',
      'Stato'
    ];
    const rows = filteredProducts.map((p) => [
      p.nome,
      p.sku,
      CATEGORY_LABELS[p.categoria as ProductCategory] ?? p.categoria,
      p.prezzo_listino,
      p.prezzo_horeca,
      p.prezzo_ecommerce,
      p.volume_ml ?? '',
      p.gradazione ?? '',
      p.attivo ? 'Attivo' : 'Disattivo'
    ]);
    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prodotti_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Prodotti</h1>
  </div>

  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex flex-wrap items-center gap-2">
      {#each CATEGORY_FILTERS as f}
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 {f.value ===
          categoryFilter
            ? 'bg-[#F5D547] text-[#1A1A1A]'
            : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
          onclick={() => {
            categoryFilter = f.value as ProductCategory | 'tutti';
            page = 1;
          }}
        >
          {f.label}
        </button>
      {/each}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative flex-1 min-w-[200px] sm:min-w-0 sm:flex-initial">
        <Search
          class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
        />
        <input
          type="text"
          bind:value={search}
          placeholder="Cerca per nome o SKU..."
          class="w-full rounded-2xl border border-black/5 bg-white/80 pl-10 pr-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2"
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-2xl"
        onclick={exportCsv}
      >
        <Download class="h-4 w-4" />
        Export CSV
      </Button>
      <Button
        variant="primary"
        size="sm"
        className="rounded-2xl !bg-[#1A1A1A]"
        onclick={openNewModal}
      >
        <Plus class="h-4 w-4" />
        Nuovo
      </Button>
    </div>
  </div>

  <Card className="overflow-hidden p-0">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    {:else}
      <!-- Desktop table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-black/5">
              <th class="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === paginatedProducts.length && paginatedProducts.length > 0}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < paginatedProducts.length}
                  onchange={toggleSelectAll}
                  class="rounded border-black/20 text-[#F5D547] focus:ring-[#F5D547]"
                />
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Immagine
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Nome
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                SKU
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Categoria
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Prezzo Listino
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Prezzo HORECA
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Prezzo E-commerce
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Stato
              </th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedProducts as p (p.id)}
              <tr
                class="transition-colors cursor-pointer {selectedIds.has(p.id)
                  ? 'bg-[#FFF3CD]'
                  : 'hover:bg-[#FFFDE7]'}"
                onclick={() => goto(`/prodotti/${p.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/prodotti/${p.id}`)}
                role="button"
                tabindex="0"
              >
                <td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onchange={() => toggleSelect(p.id)}
                    onclick={(e) => e.stopPropagation()}
                    class="rounded border-black/20 text-[#F5D547] focus:ring-[#F5D547]"
                  />
                </td>
                <td class="px-4 py-3">
                  {#if getImageUrl(p)}
                    <img
                      src={getImageUrl(p)}
                      alt=""
                      class="h-12 w-12 rounded-xl object-cover"
                    />
                  {:else}
                    <div
                      class="h-12 w-12 rounded-xl bg-[#E5E7EB] flex items-center justify-center"
                    >
                      <ImageOff class="h-5 w-5 text-[#9CA3AF]" />
                    </div>
                  {/if}
                </td>
                <td class="px-4 py-3 text-sm font-medium text-[#1A1A1A]">
                  {p.nome}
                </td>
                <td class="px-4 py-3 text-sm text-[#6B7280]">{p.sku}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {CATEGORY_BADGE_COLORS[
                      p.categoria as ProductCategory
                    ] ?? 'bg-gray-100 text-gray-800'}"
                  >
                    {CATEGORY_LABELS[p.categoria as ProductCategory] ?? p.categoria}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-[#1A1A1A]">
                  € {Number(p.prezzo_listino).toFixed(2)}
                </td>
                <td class="px-4 py-3 text-sm text-[#1A1A1A]">
                  € {Number(p.prezzo_horeca).toFixed(2)}
                </td>
                <td class="px-4 py-3 text-sm text-[#1A1A1A]">
                  € {Number(p.prezzo_ecommerce).toFixed(2)}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {p.attivo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'}"
                  >
                    {p.attivo ? 'Attivo' : 'Disattivo'}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile card list -->
      <div class="md:hidden divide-y divide-black/5">
        {#each paginatedProducts as p (p.id)}
          <div
            role="button"
            tabindex="0"
            class="p-4 hover:bg-[#FFFDE7] {selectedIds.has(p.id)
              ? 'bg-[#FFF3CD]'
              : ''} cursor-pointer"
            onclick={() => goto(`/prodotti/${p.id}`)}
            onkeydown={(e) => e.key === 'Enter' && goto(`/prodotti/${p.id}`)}
          >
            <div class="flex gap-3">
              {#if getImageUrl(p)}
                <img
                  src={getImageUrl(p)}
                  alt=""
                  class="h-12 w-12 rounded-xl object-cover flex-shrink-0"
                />
              {:else}
                <div
                  class="h-12 w-12 rounded-xl bg-[#E5E7EB] flex items-center justify-center flex-shrink-0"
                >
                  <ImageOff class="h-5 w-5 text-[#9CA3AF]" />
                </div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="font-medium text-[#1A1A1A] truncate">{p.nome}</p>
                <p class="text-xs text-[#6B7280]">{p.sku}</p>
                <div class="flex flex-wrap gap-2 mt-1">
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {CATEGORY_BADGE_COLORS[
                      p.categoria as ProductCategory
                    ] ?? 'bg-gray-100 text-gray-800'}"
                  >
                    {CATEGORY_LABELS[p.categoria as ProductCategory] ?? p.categoria}
                  </span>
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {p.attivo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'}"
                  >
                    {p.attivo ? 'Attivo' : 'Disattivo'}
                  </span>
                </div>
                <p class="text-sm text-[#1A1A1A] mt-1">
                  € {Number(p.prezzo_listino).toFixed(2)} listino
                </p>
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if filteredProducts.length === 0}
        <div class="py-16 text-center">
          <p class="text-sm text-[#6B7280]">Nessun prodotto trovato</p>
        </div>
      {:else}
        <div
          class="flex items-center justify-between px-4 py-3 border-t border-black/5"
        >
          <p class="text-sm text-[#6B7280]">
            {filteredProducts.length} prodotti
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-2xl p-2 text-[#6B7280] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={page <= 1}
              onclick={() => (page = Math.max(1, page - 1))}
            >
              <ChevronLeft class="h-5 w-5" />
            </button>
            <span class="text-sm text-[#1A1A1A]">
              Pagina {page} di {totalPages}
            </span>
            <button
              type="button"
              class="rounded-2xl p-2 text-[#6B7280] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={page >= totalPages}
              onclick={() => (page = Math.min(totalPages, page + 1))}
            >
              <ChevronRight class="h-5 w-5" />
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </Card>
</div>

<ProductModal
  open={modalOpen}
  product={editingProduct}
  on:close={() => (modalOpen = false)}
  on:saved={handleSaved}
/>
