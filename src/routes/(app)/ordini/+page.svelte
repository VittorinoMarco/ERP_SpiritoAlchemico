<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    Plus,
    ChevronLeft,
    ChevronRight,
    Calendar
  } from 'lucide-svelte';
  import type { Order, OrderStato, OrderCanale } from '$lib/types/order';
  import { STATO_LABELS, STATO_BADGE_COLORS, CANALE_LABELS, CANALE_BADGE_COLORS } from '$lib/types/order';

  const STATO_FILTERS: { value: OrderStato | 'tutti'; label: string }[] = [
    { value: 'tutti', label: 'Tutti' },
    { value: 'bozza', label: 'Bozza' },
    { value: 'confermato', label: 'Confermato' },
    { value: 'spedito', label: 'Spedito' },
    { value: 'consegnato', label: 'Consegnato' },
    { value: 'annullato', label: 'Annullato' }
  ];

  const ITEMS_PER_PAGE = 15;

  let orders: (Order & {
    expand?: {
      cliente?: { ragione_sociale?: string };
      agente?: { nome?: string; cognome?: string; email?: string };
    };
  })[] = [];
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let statoFilter: OrderStato | 'tutti' = 'tutti';
  let canaleFilter: OrderCanale | '' = '';
  let agenteFilter = '';
  let dateFrom = '';
  let dateTo = '';
  let page = 1;

  export let data: { user?: { id?: string; role?: string } | null } = { user: null };
  $: user = data.user ?? (pb.authStore.model as { id?: string; role?: string } | null);
  $: isAdmin = (user?.role || (user as any)?.ruolo) === 'admin';
  $: isAgente = (user?.role || (user as any)?.ruolo) === 'agente';

  $: statoCounts = orders.reduce(
    (acc, o) => {
      acc[o.stato] = (acc[o.stato] ?? 0) + 1;
      return acc;
    },
    {} as Record<OrderStato, number>
  );

  $: filteredOrders = orders.filter((o) => {
    const matchStato = statoFilter === 'tutti' || o.stato === statoFilter;
    const matchCanale = !canaleFilter || o.canale === canaleFilter;
    const matchAgente = !agenteFilter || o.agente === agenteFilter;
    let matchDate = true;
    if (dateFrom || dateTo) {
      const d = o.data_ordine ? new Date(o.data_ordine).getTime() : 0;
      if (dateFrom && d < new Date(dateFrom).getTime()) matchDate = false;
      if (dateTo && d > new Date(dateTo + 'T23:59:59').getTime()) matchDate = false;
    }
    return matchStato && matchCanale && matchAgente && matchDate;
  });

  $: totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  $: paginatedOrders = filteredOrders.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  onMount(async () => {
    try {
      const filter = isAgente && user?.id ? `agente = "${user.id}"` : '';
      orders = await pb.collection('orders').getFullList({
        ...(filter && { filter }),
        expand: 'cliente,agente',
        sort: '-data_ordine'
      });
      if (isAdmin) {
        const usersList = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
        agents = usersList.map((u: any) => ({
          id: u.id,
          name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email,
          email: u.email
        }));
      }
    } catch {
      orders = [];
    } finally {
      loading = false;
    }
  });

  $: if (page > totalPages && totalPages > 0) page = totalPages;

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function agentName(ag: { nome?: string; cognome?: string; email?: string } | undefined): string {
    if (!ag) return '—';
    if (ag.nome) return [ag.nome, ag.cognome].filter(Boolean).join(' ');
    return ag.email ?? '—';
  }

  function initials(name?: string | null, email?: string | null): string {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return '?';
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Ordini</h1>
  </div>

  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      {#each STATO_FILTERS as f}
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 inline-flex items-center gap-2 {f.value ===
          statoFilter
            ? 'bg-[#F5D547] text-[#1A1A1A]'
            : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
          onclick={() => {
            statoFilter = f.value as OrderStato | 'tutti';
            page = 1;
          }}
        >
          {f.label}
          {#if f.value !== 'tutti' && statoCounts[f.value as OrderStato]}
            <span
              class="rounded-full px-4 py-0.5 text-xs font-medium {f.value === statoFilter
                ? 'bg-[#1A1A1A] text-white'
                : 'bg-black/10 text-[#6B7280]'}"
            >
              {statoCounts[f.value as OrderStato]}
            </span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if isAdmin}
        <select
          bind:value={agenteFilter}
          class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547]"
        >
          <option value="">Tutti gli agenti</option>
          {#each agents as a}
            <option value={a.id}>{a.name || a.email || a.id}</option>
          {/each}
        </select>
      {/if}
      <select
        bind:value={canaleFilter}
        class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547]"
      >
        <option value="">Tutti i canali</option>
        <option value="horeca">HORECA</option>
        <option value="ecommerce">E-commerce</option>
        <option value="diretto">Diretto</option>
      </select>
      <div class="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm">
        <Calendar class="h-4 w-4 text-[#9CA3AF]" />
        <input
          type="date"
          bind:value={dateFrom}
          class="bg-transparent focus:outline-none"
        />
        <span class="text-[#9CA3AF]">—</span>
        <input
          type="date"
          bind:value={dateTo}
          class="bg-transparent focus:outline-none"
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        className="rounded-2xl !bg-[#1A1A1A]"
        onclick={() => goto('/ordini/nuovo')}
      >
        <Plus class="h-4 w-4" />
        Nuovo Ordine
      </Button>
    </div>
  </div>

  <Card className="overflow-hidden p-0">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-black/5">
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">N. Ordine</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">Data</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">Cliente</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">Agente</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">Canale</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">Stato</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280] uppercase tracking-wider">Totale</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedOrders as o (o.id)}
              <tr
                class="transition-colors cursor-pointer hover:bg-[#FFFDE7]"
                onclick={() => goto(`/ordini/${o.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/ordini/${o.id}`)}
                role="button"
                tabindex="0"
              >
                <td class="px-4 py-3 text-sm font-bold text-[#1A1A1A]">
                  {o.numero_ordine ?? '—'}
                </td>
                <td class="px-4 py-3 text-sm text-[#6B7280]">{formatDate(o.data_ordine)}</td>
                <td class="px-4 py-3 text-sm text-[#1A1A1A]">
                  {o.expand?.cliente?.ragione_sociale ?? '—'}
                </td>
                <td class="px-4 py-3">
                  {#if o.expand?.agente}
                    <span class="inline-flex items-center gap-2">
                      <span
                        class="h-7 w-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-[10px] font-medium"
                      >
                        {initials(agentName(o.expand.agente), o.expand.agente.email)}
                      </span>
                      <span class="text-sm text-[#1A1A1A]">{agentName(o.expand.agente)}</span>
                    </span>
                  {:else}
                    <span class="text-sm text-[#9CA3AF]">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {CANALE_BADGE_COLORS[
                      o.canale as OrderCanale
                    ] ?? 'bg-gray-100 text-gray-800'}"
                  >
                    {CANALE_LABELS[o.canale as OrderCanale] ?? o.canale}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[
                      o.stato as OrderStato
                    ] ?? 'bg-gray-100 text-gray-800'}"
                  >
                    {STATO_LABELS[o.stato as OrderStato] ?? o.stato}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm font-bold text-[#1A1A1A] text-right">
                  {formatEuro(Number(o.totale) || 0)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="md:hidden divide-y divide-black/5">
        {#each paginatedOrders as o (o.id)}
          <div
            role="button"
            tabindex="0"
            class="p-4 hover:bg-[#FFFDE7] cursor-pointer"
            onclick={() => goto(`/ordini/${o.id}`)}
            onkeydown={(e) => e.key === 'Enter' && goto(`/ordini/${o.id}`)}
          >
            <p class="font-bold text-[#1A1A1A]">{o.numero_ordine ?? '—'}</p>
            <p class="text-sm text-[#6B7280] mt-0.5">{o.expand?.cliente?.ragione_sociale ?? '—'}</p>
            <div class="flex flex-wrap gap-2 mt-2">
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[
                  o.stato as OrderStato
                ] ?? 'bg-gray-100 text-gray-800'}"
              >
                {STATO_LABELS[o.stato as OrderStato] ?? o.stato}
              </span>
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {CANALE_BADGE_COLORS[
                  o.canale as OrderCanale
                ] ?? 'bg-gray-100 text-gray-800'}"
              >
                {CANALE_LABELS[o.canale as OrderCanale] ?? o.canale}
              </span>
            </div>
            <p class="text-sm font-bold text-[#1A1A1A] mt-1">
              {formatEuro(Number(o.totale) || 0)}
            </p>
          </div>
        {/each}
      </div>

      {#if filteredOrders.length === 0}
        <div class="py-16 text-center">
          <p class="text-sm text-[#6B7280]">Nessun ordine trovato</p>
        </div>
      {:else}
        <div class="flex items-center justify-between px-4 py-3 border-t border-black/5">
          <p class="text-sm text-[#6B7280]">{filteredOrders.length} ordini</p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-2xl p-2 text-[#6B7280] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={page <= 1}
              onclick={() => (page = Math.max(1, page - 1))}
            >
              <ChevronLeft class="h-5 w-5" />
            </button>
            <span class="text-sm text-[#1A1A1A]">Pagina {page} di {totalPages}</span>
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
