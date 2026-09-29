<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Plus, Search, SlidersHorizontal, ShoppingCart, X } from 'lucide-svelte';
  import { pb } from '$lib/pocketbase';
  import { currentRole } from '$lib/stores/auth';
  import { formatEuro, formatData } from '$lib/utils/format';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';
  import type { Order, OrderStato, OrderCanale } from '$lib/types/order';
  import { STATO_LABELS, STATO_BADGE_COLORS, CANALE_LABELS, CANALE_BADGE_COLORS } from '$lib/types/order';

  type OrderRow = Order & {
    expand?: {
      cliente?: { ragione_sociale?: string };
      agente?: { nome?: string; cognome?: string; email?: string };
    };
  };

  const STATO_FILTERS: { value: OrderStato | 'tutti'; label: string }[] = [
    { value: 'tutti', label: 'Tutti' },
    { value: 'bozza', label: 'Bozza' },
    { value: 'confermato', label: 'Confermato' },
    { value: 'spedito', label: 'Spedito' },
    { value: 'consegnato', label: 'Consegnato' },
    { value: 'annullato', label: 'Annullato' }
  ];

  const PER_PAGE = 15;

  let orders: OrderRow[] = [];
  let agents: { id: string; name: string }[] = [];
  let loading = true;
  let loadError = '';
  let statoFilter: OrderStato | 'tutti' = 'tutti';
  let canaleFilter: OrderCanale | '' = '';
  let agenteFilter = '';
  let dateFrom = '';
  let dateTo = '';
  let search = '';
  let page = 1;
  let showFilters = false;

  export let data: { user?: { id?: string } | null } = { user: null };

  $: isAdmin = $currentRole === 'admin';

  // "completato" e "consegnato" sono lo stesso stato per l'utente
  const normStato = (s: string): string => (s === 'completato' ? 'consegnato' : s);

  $: statoCounts = orders.reduce(
    (acc, o) => {
      const k = normStato(o.stato);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  $: q = search.trim().toLowerCase();
  $: filtered = orders.filter((o) => {
    if (statoFilter !== 'tutti' && normStato(o.stato) !== statoFilter) return false;
    if (canaleFilter && o.canale !== canaleFilter) return false;
    if (agenteFilter && o.agente !== agenteFilter) return false;
    if (q) {
      const hay = `${o.numero_ordine ?? ''} ${o.expand?.cliente?.ragione_sociale ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const day = (o.data_ordine ?? '').slice(0, 10);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  });

  $: activeExtraFilters = [canaleFilter, agenteFilter, dateFrom, dateTo].filter(Boolean).length;
  $: paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // Ogni cambio filtro riporta alla prima pagina
  $: (statoFilter, canaleFilter, agenteFilter, dateFrom, dateTo, q, (page = 1));

  onMount(async () => {
    try {
      // Agenti: le API rule già limitano ai propri ordini; il filtro esplicito evita ambiguità
      const uid = data.user?.id ?? pb.authStore.model?.id;
      const filter = $currentRole === 'agente' && uid ? `agente = "${uid}"` : '';
      orders = (await pb.collection('orders').getFullList({
        ...(filter && { filter }),
        expand: 'cliente,agente',
        sort: '-data_ordine,-created'
      })) as unknown as OrderRow[];
      if (isAdmin) {
        const list = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
        agents = list.map((u: any) => ({
          id: u.id,
          name: [u.nome, u.cognome].filter(Boolean).join(' ') || u.email
        }));
      }
    } catch (e) {
      loadError = 'Impossibile caricare gli ordini. Riprova tra qualche istante.';
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function agentName(ag?: { nome?: string; cognome?: string; email?: string }): string {
    if (!ag) return '—';
    return [ag.nome, ag.cognome].filter(Boolean).join(' ') || ag.email || '—';
  }

  function initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
  }

  function resetFilters() {
    statoFilter = 'tutti';
    canaleFilter = '';
    agenteFilter = '';
    dateFrom = '';
    dateTo = '';
    search = '';
  }
</script>

<svelte:head><title>Ordini · SpiritoAlchemico ERP</title></svelte:head>

<PageHeader titolo="Ordini" sottotitolo={isAdmin ? 'Tutti gli ordini, per canale e agente.' : 'I tuoi ordini.'}>
  <Button variant="secondary" onclick={() => goto('/ordini/nuovo')}>
    <Plus class="h-4 w-4" /> Nuovo ordine
  </Button>
</PageHeader>

<div class="space-y-3 mb-4">
  <!-- Ricerca + filtri -->
  <div class="flex gap-2">
    <div class="relative flex-1">
      <Search class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
      <input
        type="search"
        class="field !pl-11"
        placeholder="Cerca per numero ordine o cliente…"
        bind:value={search}
      />
    </div>
    <button
      type="button"
      class="chip !rounded-2xl md:hidden {activeExtraFilters ? 'chip-active' : ''}"
      onclick={() => (showFilters = !showFilters)}
      aria-expanded={showFilters}
    >
      <SlidersHorizontal class="h-4 w-4" />
      Filtri{activeExtraFilters ? ` (${activeExtraFilters})` : ''}
    </button>
  </div>

  <div class="chip-row" role="tablist" aria-label="Filtra per stato">
    {#each STATO_FILTERS as f}
      <button
        type="button"
        role="tab"
        aria-selected={statoFilter === f.value}
        class="chip {statoFilter === f.value ? 'chip-active' : ''}"
        onclick={() => (statoFilter = f.value)}
      >
        {f.label}
        {#if f.value !== 'tutti' && statoCounts[f.value]}
          <span class="chip-count">{statoCounts[f.value]}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="{showFilters ? 'grid' : 'hidden'} md:flex md:flex-wrap md:items-center gap-2 grid-cols-2">
    {#if isAdmin}
      <select bind:value={agenteFilter} class="field md:!w-auto col-span-2 md:col-span-1" aria-label="Agente">
        <option value="">Tutti gli agenti</option>
        {#each agents as a}<option value={a.id}>{a.name}</option>{/each}
      </select>
    {/if}
    <select bind:value={canaleFilter} class="field md:!w-auto col-span-2 md:col-span-1" aria-label="Canale">
      <option value="">Tutti i canali</option>
      <option value="horeca">HORECA</option>
      <option value="ecommerce">E-commerce</option>
      <option value="diretto">Diretto</option>
    </select>
    <input type="date" bind:value={dateFrom} class="field md:!w-auto" aria-label="Dal" />
    <input type="date" bind:value={dateTo} class="field md:!w-auto" aria-label="Al" />
    {#if activeExtraFilters || statoFilter !== 'tutti' || search}
      <button type="button" class="chip col-span-2 md:col-span-1 justify-center" onclick={resetFilters}>
        <X class="h-4 w-4" /> Azzera filtri
      </button>
    {/if}
  </div>
</div>

<Card className="!p-0 overflow-hidden">
  {#if loading}
    <Spinner />
  {:else if loadError}
    <EmptyState titolo="Qualcosa è andato storto" testo={loadError} />
  {:else if filtered.length === 0}
    <EmptyState
      icon={ShoppingCart}
      titolo={orders.length === 0 ? 'Ancora nessun ordine' : 'Nessun ordine corrisponde ai filtri'}
      testo={orders.length === 0 ? 'Crea il primo ordine per iniziare.' : 'Prova a modificare o azzerare i filtri.'}
    >
      {#if orders.length === 0}
        <Button variant="secondary" onclick={() => goto('/ordini/nuovo')}><Plus class="h-4 w-4" /> Nuovo ordine</Button>
      {:else}
        <Button variant="ghost" onclick={resetFilters}>Azzera filtri</Button>
      {/if}
    </EmptyState>
  {:else}
    <!-- Desktop -->
    <div class="hidden md:block overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-black/5">
            <th class="px-6 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Ordine</th>
            <th class="px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Data</th>
            <th class="px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Cliente</th>
            {#if isAdmin}<th class="px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Agente</th>{/if}
            <th class="px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Canale</th>
            <th class="px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Stato</th>
            <th class="px-6 py-3 text-right text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Totale</th>
          </tr>
        </thead>
        <tbody>
          {#each paginated as o (o.id)}
            <tr
              class="cursor-pointer hover:bg-[#FFFDE7]"
              onclick={() => goto(`/ordini/${o.id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/ordini/${o.id}`)}
              tabindex="0"
            >
              <td class="px-6 py-3.5 text-sm font-bold">{o.numero_ordine ?? '—'}</td>
              <td class="px-4 py-3.5 text-sm text-[#6B7280] whitespace-nowrap">{formatData(o.data_ordine)}</td>
              <td class="px-4 py-3.5 text-sm max-w-[16rem] truncate">{o.expand?.cliente?.ragione_sociale ?? '—'}</td>
              {#if isAdmin}
                <td class="px-4 py-3.5">
                  {#if o.expand?.agente}
                    <span class="inline-flex items-center gap-2">
                      <span class="h-7 w-7 rounded-full bg-[#1A1A1A] text-[#F5D547] flex items-center justify-center text-[10px] font-bold">
                        {initials(agentName(o.expand.agente))}
                      </span>
                      <span class="text-sm">{agentName(o.expand.agente)}</span>
                    </span>
                  {:else}<span class="text-sm text-[#9CA3AF]">—</span>{/if}
                </td>
              {/if}
              <td class="px-4 py-3.5">
                <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {CANALE_BADGE_COLORS[o.canale] ?? 'bg-gray-100 text-gray-800'}">
                  {CANALE_LABELS[o.canale] ?? o.canale}
                </span>
              </td>
              <td class="px-4 py-3.5">
                <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[o.stato] ?? 'bg-gray-100 text-gray-800'}">
                  {STATO_LABELS[o.stato] ?? o.stato}
                </span>
              </td>
              <td class="px-6 py-3.5 text-sm font-bold text-right tabular-nums">{formatEuro(o.totale)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile -->
    <ul class="md:hidden divide-y divide-black/5">
      {#each paginated as o (o.id)}
        <li>
          <a href="/ordini/{o.id}" class="block px-4 py-4 active:bg-[#FFFDE7]">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-bold truncate">{o.numero_ordine ?? 'Ordine'}</p>
                <p class="text-sm text-[#6B7280] truncate">{o.expand?.cliente?.ragione_sociale ?? '—'}</p>
              </div>
              <p class="font-bold tabular-nums">{formatEuro(o.totale)}</p>
            </div>
            <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[o.stato] ?? 'bg-gray-100 text-gray-800'}">
                {STATO_LABELS[o.stato] ?? o.stato}
              </span>
              <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {CANALE_BADGE_COLORS[o.canale] ?? 'bg-gray-100 text-gray-800'}">
                {CANALE_LABELS[o.canale] ?? o.canale}
              </span>
              <span class="text-xs text-[#9CA3AF] ml-auto">{formatData(o.data_ordine)}</span>
            </div>
          </a>
        </li>
      {/each}
    </ul>

    <Pagination bind:page total={filtered.length} perPage={PER_PAGE} label={filtered.length === 1 ? 'ordine' : 'ordini'} />
  {/if}
</Card>
