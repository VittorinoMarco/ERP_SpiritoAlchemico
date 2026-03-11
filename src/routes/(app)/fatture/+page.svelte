<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import {
    ChevronLeft,
    ChevronRight,
    Calendar,
    AlertCircle
  } from 'lucide-svelte';
  import type { Invoice, InvoiceStato } from '$lib/types/invoice';
  import { STATO_LABELS, STATO_BADGE_COLORS } from '$lib/types/invoice';

  const STATO_FILTERS: { value: InvoiceStato | 'scaduta' | 'tutti'; label: string }[] = [
    { value: 'tutti', label: 'Tutte' },
    { value: 'emessa', label: 'Emesse' },
    { value: 'pagata', label: 'Pagate' },
    { value: 'scaduta', label: 'Scadute' }
  ];

  const ITEMS_PER_PAGE = 15;

  let invoices: (Invoice & {
    expand?: {
      cliente?: { ragione_sociale?: string; partita_iva?: string; indirizzo?: string; citta?: string; cap?: string; provincia?: string };
      ordine?: { numero_ordine?: string; data_ordine?: string; totale?: number };
    };
  })[] = [];
  let clients: { id: string; ragione_sociale?: string }[] = [];
  let loading = true;
  let statoFilter: InvoiceStato | 'scaduta' | 'tutti' = 'tutti';
  let clienteFilter = '';
  let dateFrom = '';
  let dateTo = '';
  let page = 1;

  const today = new Date().toISOString().split('T')[0];

  $: isScaduta = (inv: Invoice) =>
    inv.data_scadenza < today && inv.stato !== 'pagata';

  $: filteredInvoices = invoices.filter((inv) => {
    const scaduta = isScaduta(inv);
    const matchStato =
      statoFilter === 'tutti' ||
      (statoFilter === 'scaduta' ? scaduta : inv.stato === statoFilter);
    const matchCliente = !clienteFilter || inv.cliente === clienteFilter;
    let matchDate = true;
    if (dateFrom || dateTo) {
      const d = inv.data_emissione ? new Date(inv.data_emissione).getTime() : 0;
      if (dateFrom && d < new Date(dateFrom).getTime()) matchDate = false;
      if (dateTo && d > new Date(dateTo + 'T23:59:59').getTime()) matchDate = false;
    }
    return matchStato && matchCliente && matchDate;
  });

  $: totaleEmesso = invoices.reduce((s, i) => s + (i.totale ?? 0), 0);
  $: totaleIncassato = invoices
    .filter((i) => i.stato === 'pagata')
    .reduce((s, i) => s + (i.totale ?? 0), 0);
  $: totaleScaduto = invoices
    .filter((i) => isScaduta(i))
    .reduce((s, i) => s + (i.totale ?? 0), 0);

  $: agingData = (() => {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const now = new Date();
    for (const inv of invoices.filter((i) => i.stato !== 'pagata' && i.data_scadenza)) {
      const scad = new Date(inv.data_scadenza);
      const days = Math.floor((now.getTime() - scad.getTime()) / (24 * 60 * 60 * 1000));
      if (days > 0) {
        if (days <= 30) buckets['0-30'] += inv.totale ?? 0;
        else if (days <= 60) buckets['31-60'] += inv.totale ?? 0;
        else if (days <= 90) buckets['61-90'] += inv.totale ?? 0;
        else buckets['90+'] += inv.totale ?? 0;
      }
    }
    return {
      labels: ['0-30 gg', '31-60 gg', '61-90 gg', '90+ gg'],
      values: [buckets['0-30'], buckets['31-60'], buckets['61-90'], buckets['90+']]
    };
  })();

  $: agingChartConfig = {
    data: {
      labels: agingData.labels,
      datasets: [
        {
          label: 'Importo scaduto (€)',
          data: agingData.values,
          backgroundColor: ['#F5D547', '#F59E0B', '#EF4444', '#DC2626'],
          borderRadius: 6
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#E5E7EB' }, beginAtZero: true }
      }
    }
  };

  $: totalPages = Math.max(1, Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE));
  $: paginatedInvoices = filteredInvoices.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  onMount(async () => {
    try {
      const [invList, clientList] = await Promise.all([
        pb.collection('invoices').getFullList({
          expand: 'cliente,ordine',
          sort: '-data_emissione'
        }),
        pb.collection('clients').getFullList({ fields: 'id,ragione_sociale' })
      ]);
      invoices = invList;
      clients = clientList;
    } catch {
      invoices = [];
      clients = [];
    } finally {
      loading = false;
    }
  });

  $: if (page > totalPages && totalPages > 0) page = totalPages;

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function displayStato(inv: Invoice): string {
    if (isScaduta(inv)) return 'Scaduta';
    return STATO_LABELS[inv.stato as InvoiceStato] ?? inv.stato;
  }

  function displayStatoBadge(inv: Invoice): string {
    if (isScaduta(inv)) return 'bg-rose-100 text-rose-800';
    return STATO_BADGE_COLORS[inv.stato as InvoiceStato] ?? 'bg-gray-100 text-gray-800';
  }
</script>

<svelte:head>
  <title>Fatture | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Fatture</h1>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else}
    <!-- Dashboard KPI -->
    <section class="page-grid">
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Totale Emesso</p>
        <p class="mt-2 text-3xl lg:text-4xl font-bold text-[#F5D547]">{formatEuro(totaleEmesso)}</p>
      </div>
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Totale Incassato</p>
        <p class="mt-2 text-3xl lg:text-4xl font-bold text-green-600">{formatEuro(totaleIncassato)}</p>
      </div>
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6 flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Totale Scaduto</p>
          <p class="mt-2 text-3xl lg:text-4xl font-bold text-rose-600">{formatEuro(totaleScaduto)}</p>
        </div>
        <div class="h-11 w-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
          <AlertCircle class="h-5 w-5" />
        </div>
      </div>
    </section>

    <!-- Aging Report -->
    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Aging Report (fatture non pagate)</h2>
      <div class="h-48">
        <BarChart config={agingChartConfig} />
      </div>
    </Card>

    <!-- Filtri -->
    <div class="flex flex-wrap items-center gap-2">
      {#each STATO_FILTERS as f}
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 {statoFilter === f.value
            ? 'bg-[#F5D547] text-[#1A1A1A]'
            : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
          onclick={() => {
            statoFilter = f.value;
            page = 1;
          }}
        >
          {f.label}
        </button>
      {/each}
      <select
        bind:value={clienteFilter}
        class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm"
      >
        <option value="">Tutti i clienti</option>
        {#each clients as c}
          <option value={c.id}>{c.ragione_sociale ?? '—'}</option>
        {/each}
      </select>
      <div class="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm">
        <Calendar class="h-4 w-4 text-[#9CA3AF]" />
        <input type="date" bind:value={dateFrom} class="bg-transparent focus:outline-none" />
        <span class="text-[#9CA3AF]">—</span>
        <input type="date" bind:value={dateTo} class="bg-transparent focus:outline-none" />
      </div>
    </div>

    <!-- Tabella -->
    <Card className="overflow-hidden p-0">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-black/5">
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">N. Fattura</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Data</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Cliente</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Stato</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280] uppercase">Totale</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedInvoices as inv (inv.id)}
              {@const scaduta = isScaduta(inv)}
              <tr
                class="transition-colors cursor-pointer hover:bg-[#FFFDE7] {scaduta ? 'bg-[#FEE2E2]' : ''}"
                onclick={() => goto(`/fatture/${inv.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/fatture/${inv.id}`)}
                role="button"
                tabindex="0"
              >
                <td class="px-4 py-3 text-sm font-bold text-[#1A1A1A]">
                  {inv.numero_fattura ?? '—'}
                </td>
                <td class="px-4 py-3 text-sm text-[#6B7280]">{formatDate(inv.data_emissione)}</td>
                <td class="px-4 py-3 text-sm text-[#1A1A1A]">
                  {inv.expand?.cliente?.ragione_sociale ?? '—'}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {displayStatoBadge(inv)}"
                  >
                    {displayStato(inv)}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm font-bold text-[#1A1A1A] text-right">
                  {formatEuro(inv.totale ?? 0)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if filteredInvoices.length === 0}
        <div class="py-16 text-center">
          <p class="text-sm text-[#6B7280]">Nessuna fattura trovata</p>
        </div>
      {:else}
        <div class="flex items-center justify-between px-4 py-3 border-t border-black/5">
          <p class="text-sm text-[#6B7280]">{filteredInvoices.length} fatture</p>
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
    </Card>
  {/if}
</div>
