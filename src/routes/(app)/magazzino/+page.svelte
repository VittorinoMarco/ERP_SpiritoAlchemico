<script lang="ts">
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import KpiCard from '$lib/components/layout/KpiCard.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import {
    Plus,
    AlertTriangle,
    Package,
    ArrowDownToLine,
    ArrowUpFromLine,
    RotateCcw,
    ImageOff,
    Search
  } from 'lucide-svelte';
  import MagazzinoSupplierPanel from '$lib/components/magazzino/MagazzinoSupplierPanel.svelte';
  import type { Inventory, InventoryMovement, MovementTipo } from '$lib/types/inventory';
  import { MOVIMENTO_LABELS, MOVIMENTO_COLORS } from '$lib/types/inventory';
  import type { Product } from '$lib/types/product';
  import { sottoScortaCount } from '$lib/stores/magazzino';

  type TabId = 'giacenze' | 'movimenti' | 'report';

  let activeTab: TabId = 'giacenze';
  let loading = true;
  let inventory: (Inventory & { expand?: { prodotto?: Product } })[] = [];
  let movements: (InventoryMovement & {
    expand?: { prodotto?: Product; utente?: { nome?: string; cognome?: string; email?: string } };
  })[] = [];
  let products: Product[] = [];
  let modalOpen = false;
  let movimentoTipo: MovementTipo = 'carico';
  let movimentoProdotto = '';
  let movimentoQuantita = '';
  let movimentoCausale = '';
  let movimentoNote = '';
  let movimentoSaving = false;
  let filterProdotto = '';
  let filterUbicazione = '';
  let soloSottoScorta = false;
  let filterMovTipo: MovementTipo | '' = '';
  let filterMovProdotto = '';
  let filterMovFrom = '';
  let filterMovTo = '';
  let reportPeriod = '7'; // giorni

  $: valoreTotale = inventory.reduce((s, inv) => {
    const p = inv.expand?.prodotto;
    const prezzo = p?.prezzo_listino ?? 0;
    return s + (inv.giacenza ?? 0) * prezzo;
  }, 0);

  $: sottoScortaList = inventory.filter(
    (inv) => (inv.giacenza ?? 0) < (inv.giacenza_minima ?? 0)
  );
  $: sottoScortaNum = sottoScortaList.length;

  $: today = new Date().toISOString().split('T')[0];
  $: movimentiOggi = movements.filter(
    (m) => m.data_movimento?.startsWith(today)
  ).length;

  $: ubicazioni = [...new Set(inventory.map((i) => i.ubicazione).filter(Boolean))].sort() as string[];

  $: filteredGiacenze = inventory.filter((inv) => {
    const matchProdotto =
      !filterProdotto ||
      inv.expand?.prodotto?.nome?.toLowerCase().includes(filterProdotto.toLowerCase()) ||
      inv.expand?.prodotto?.sku?.toLowerCase().includes(filterProdotto.toLowerCase());
    const matchUbicazione = !filterUbicazione || inv.ubicazione === filterUbicazione;
    const matchSottoScorta = !soloSottoScorta || (inv.giacenza ?? 0) < (inv.giacenza_minima ?? 0);
    return matchProdotto && matchUbicazione && matchSottoScorta;
  });

  $: filteredMovimenti = movements.filter((m) => {
    const matchTipo = !filterMovTipo || m.tipo === filterMovTipo;
    const matchProdotto =
      !filterMovProdotto || m.prodotto === filterMovProdotto;
    let matchPeriod = true;
    if (filterMovFrom || filterMovTo) {
      const d = m.data_movimento ? new Date(m.data_movimento).getTime() : 0;
      if (filterMovFrom && d < new Date(filterMovFrom).getTime()) matchPeriod = false;
      if (filterMovTo && d > new Date(filterMovTo + 'T23:59:59').getTime()) matchPeriod = false;
    }
    return matchTipo && matchProdotto && matchPeriod;
  });

  $: reportMovimentiData = (() => {
    const days = parseInt(reportPeriod, 10) || 7;
    const byDay: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      byDay[key] = 0;
    }
    for (const m of movements) {
      if (m.data_movimento) {
        const key = m.data_movimento.split('T')[0];
        if (key in byDay) byDay[key] = (byDay[key] ?? 0) + 1;
      }
    }
    const keys = Object.keys(byDay).sort();
    return {
      labels: keys.map((k) => {
        const d = new Date(k);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
      }),
      values: keys.map((k) => byDay[k] ?? 0)
    };
  })();

  $: reportValorePerProdotto = inventory
    .map((inv) => {
      const p = inv.expand?.prodotto;
      return {
        nome: p?.nome ?? '—',
        valore: (inv.giacenza ?? 0) * (p?.prezzo_listino ?? 0)
      };
    })
    .filter((x) => x.valore > 0)
    .sort((a, b) => b.valore - a.valore)
    .slice(0, 10);

  $: barChartConfig = {
    data: {
      labels: reportMovimentiData.labels,
      datasets: [
        {
          label: 'Movimenti',
          data: reportMovimentiData.values,
          backgroundColor: '#F5D547',
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

  $: horizontalBarConfig = {
    data: {
      labels: reportValorePerProdotto.map((x) => x.nome),
      datasets: [
        {
          label: 'Valore',
          data: reportValorePerProdotto.map((x) => x.valore),
          backgroundColor: '#F5D547',
          borderRadius: 6
        }
      ]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#E5E7EB' }, beginAtZero: true },
        y: { grid: { display: false } }
      }
    }
  };

  onMount(loadData);

  async function loadData() {
    try {
      const [invList, movList, prodList] = await Promise.all([
        pb.collection('inventory').getFullList({ expand: 'prodotto' }),
        pb.collection('inventory_movements').getFullList({
          expand: 'prodotto,utente',
          sort: '-data_movimento'
        }),
        pb.collection('products').getFullList<Product>()
      ]);
      inventory = invList;
      movements = movList;
      products = prodList;
    } catch {
      inventory = [];
      movements = [];
      products = [];
    } finally {
      loading = false;
      sottoScortaCount.set(inventory.filter((i) => (i.giacenza ?? 0) < (i.giacenza_minima ?? 0)).length);
    }
  }

  async function saveMovimento() {
    const qty = parseInt(movimentoQuantita, 10);
    if (!movimentoProdotto || isNaN(qty) || qty <= 0) return;
    movimentoSaving = true;
    try {
      const delta = movimentoTipo === 'scarico' ? -qty : qty;
      const mov = await pb.collection('inventory_movements').create({
        prodotto: movimentoProdotto,
        tipo: movimentoTipo,
        quantita: Math.abs(qty),
        causale: movimentoCausale.trim() || undefined,
        utente: (pb.authStore.model as any)?.id
      });
      let inv = inventory.find((i) => i.prodotto === movimentoProdotto);
      if (inv) {
        inv = await pb.collection('inventory').update(inv.id, {
          giacenza: Math.max(0, (inv.giacenza ?? 0) + delta)
        }) as typeof inv;
      } else {
        inv = await pb.collection('inventory').create({
          prodotto: movimentoProdotto,
          giacenza: Math.max(0, delta),
          giacenza_minima: 0
        }) as typeof inv;
      }
      const [newInv, newMov] = await Promise.all([
        pb.collection('inventory').getFullList({ expand: 'prodotto' }),
        pb.collection('inventory_movements').getFullList({
          expand: 'prodotto,utente',
          sort: '-data_movimento'
        })
      ]);
      inventory = newInv;
      movements = newMov;
      sottoScortaCount.set(inventory.filter((i) => (i.giacenza ?? 0) < (i.giacenza_minima ?? 0)).length);
      const prod = products.find((p) => p.id === movimentoProdotto);
      const prodName = prod?.nome ?? prod?.sku ?? movimentoProdotto;
      try {
        await pb.collection('activity_log').create({
          utente: (pb.authStore.model as any)?.id,
          azione: 'movimento_magazzino',
          collection_rif: 'inventory_movements',
          record_rif: mov.id,
          dettagli: JSON.stringify({
            messaggio: `${movimentoTipo === 'carico' ? 'Carico' : 'Scarico'} ${prodName}: ${Math.abs(qty)}`
          })
        });
      } catch {
        // ignore
      }
      modalOpen = false;
      movimentoTipo = 'carico';
      movimentoProdotto = '';
      movimentoQuantita = '';
      movimentoCausale = '';
      movimentoNote = '';
    } catch (e) {
      console.error(e);
    } finally {
      movimentoSaving = false;
    }
  }

  function getImageUrl(p: Product): string {
    if (p?.immagine) return pb.files.getUrl(p as any, p.immagine, { thumb: '48x48' });
    return '';
  }

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function userLabel(u: { nome?: string; cognome?: string; email?: string } | undefined): string {
    if (!u) return '—';
    if (u.nome) return [u.nome, u.cognome].filter(Boolean).join(' ');
    return u.email ?? '—';
  }

  function MovimentoIcon({ tipo }: { tipo: MovementTipo }) {
    if (tipo === 'carico') return ArrowDownToLine;
    if (tipo === 'scarico') return ArrowUpFromLine;
    return RotateCcw;
  }
</script>

<svelte:head>
  <title>Magazzino | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Magazzino</h1>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else}
    <section class="page-grid">
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Valore Totale Magazzino</p>
        <p class="mt-2 text-3xl lg:text-4xl font-bold text-[#F5D547]">{formatEuro(valoreTotale)}</p>
      </div>
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6 flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Prodotti Sotto Scorta</p>
          <p class="mt-2 text-3xl lg:text-4xl font-bold text-rose-600">{sottoScortaNum}</p>
        </div>
        <div class="h-11 w-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
          <AlertTriangle class="h-5 w-5" />
        </div>
      </div>
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Movimenti Oggi</p>
        <p class="mt-2 text-3xl lg:text-4xl font-bold text-[#1A1A1A]">{movimentiOggi}</p>
      </div>
    </section>

    <div class="flex justify-center gap-2">
      {#each ['giacenze', 'movimenti', 'report'] as tabId}
        <button
          type="button"
          class="rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 {activeTab === tabId
            ? 'bg-[#F5D547] text-[#1A1A1A]'
            : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
          onclick={() => (activeTab = tabId as TabId)}
        >
          {tabId === 'giacenze' ? 'Giacenze' : tabId === 'movimenti' ? 'Movimenti' : 'Report'}
        </button>
      {/each}
    </div>

    <!-- Tab Giacenze -->
    {#if activeTab === 'giacenze'}
      <Card>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                bind:value={filterProdotto}
                placeholder="Cerca prodotto..."
                class="rounded-2xl border border-black/5 bg-white/80 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
              />
            </div>
            <select
              bind:value={filterUbicazione}
              class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm"
            >
              <option value="">Tutte le ubicazioni</option>
              {#each ubicazioni as u}
                <option value={u}>{u}</option>
              {/each}
            </select>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={soloSottoScorta} class="rounded border-black/20 text-[#F5D547]" />
              <span class="text-sm text-[#1A1A1A]">Solo sotto scorta</span>
            </label>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-black/5">
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Prodotto</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">SKU</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Giacenza</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Minima</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Lotto</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Scadenza</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Ubicazione</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Stato</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredGiacenze as inv (inv.id)}
                {@const sottoScorta = (inv.giacenza ?? 0) < (inv.giacenza_minima ?? 0)}
                <tr class="border-b border-black/5 last:border-0 hover:bg-[#FFFDE7] {sottoScorta ? 'bg-[#FEE2E2]' : ''}">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      {#if inv.expand?.prodotto && getImageUrl(inv.expand.prodotto)}
                        <img
                          src={getImageUrl(inv.expand.prodotto)}
                          alt=""
                          class="h-12 w-12 rounded-xl object-cover"
                        />
                      {:else}
                        <div class="h-12 w-12 rounded-xl bg-[#E5E7EB] flex items-center justify-center">
                          <ImageOff class="h-5 w-5 text-[#9CA3AF]" />
                        </div>
                      {/if}
                      <span class="font-medium text-[#1A1A1A]">
                        {inv.expand?.prodotto?.nome ?? '—'}
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{inv.expand?.prodotto?.sku ?? '—'}</td>
                  <td class="px-4 py-3">
                    <span class="text-lg font-bold text-[#1A1A1A]">{inv.giacenza ?? 0}</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{inv.giacenza_minima ?? 0}</td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{inv.lotto ?? '—'}</td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{formatDate(inv.data_scadenza)}</td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{inv.ubicazione ?? '—'}</td>
                  <td class="px-4 py-3">
                    {#if sottoScorta}
                      <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-rose-100 text-rose-800">
                        Sotto Scorta
                      </span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if filteredGiacenze.length === 0}
          <p class="py-12 text-center text-sm text-[#6B7280]">Nessuna giacenza trovata</p>
        {/if}
      </Card>
    {/if}

    <!-- Tab Movimenti -->
    {#if activeTab === 'movimenti'}
      <Card>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div class="flex flex-wrap items-center gap-2">
            <select
              bind:value={filterMovTipo}
              class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm"
            >
              <option value="">Tutti i tipi</option>
              <option value="carico">Carico</option>
              <option value="scarico">Scarico</option>
              <option value="rettifica">Rettifica</option>
            </select>
            <select
              bind:value={filterMovProdotto}
              class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm"
            >
              <option value="">Tutti i prodotti</option>
              {#each products as p}
                <option value={p.id}>{p.nome} ({p.sku})</option>
              {/each}
            </select>
            <input type="date" bind:value={filterMovFrom} class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm" />
            <input type="date" bind:value={filterMovTo} class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm" />
          </div>
          <div class="flex flex-wrap items-center gap-2 justify-end">
            <MagazzinoSupplierPanel {products} onApplied={loadData} />
            <Button
              variant="primary"
              size="sm"
              className="rounded-2xl !bg-[#1A1A1A]"
              onclick={() => (modalOpen = true)}
            >
              <Plus class="h-4 w-4" />
              Nuovo Movimento
            </Button>
          </div>
        </div>
        <div class="space-y-1">
          {#each filteredMovimenti.slice(0, 50) as m (m.id)}
            <div
              class="flex items-center gap-4 p-3 rounded-2xl hover:bg-[#FFFDE7] transition-colors {MOVIMENTO_COLORS[
                m.tipo as MovementTipo
              ]} bg-opacity-30"
            >
              <div class="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 {m.tipo === 'carico'
                ? 'bg-green-100 text-green-700'
                : m.tipo === 'scarico'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700'}"
              >
                <svelte:component this={MovimentoIcon({ tipo: m.tipo as MovementTipo })} class="h-4 w-4" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-[#1A1A1A]">
                  {MOVIMENTO_LABELS[m.tipo as MovementTipo]} · {m.expand?.prodotto?.nome ?? '—'} · {m.quantita} pz
                </p>
                <p class="text-xs text-[#6B7280]">{m.causale ?? '—'} · {userLabel(m.expand?.utente)}</p>
              </div>
              <span class="text-xs text-[#6B7280] flex-shrink-0">{formatDate(m.data_movimento)}</span>
            </div>
          {/each}
        </div>
        {#if filteredMovimenti.length === 0}
          <p class="py-12 text-center text-sm text-[#6B7280]">Nessun movimento</p>
        {/if}
      </Card>
    {/if}

    <!-- Tab Report -->
    {#if activeTab === 'report'}
      <div class="page-grid">
        <Card>
          <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Prodotti in esaurimento</h2>
          <div class="space-y-2">
            {#each sottoScortaList.slice(0, 10) as inv}
              <div class="flex justify-between items-center py-2 border-b border-black/5 last:border-0">
                <span class="text-sm font-medium text-[#1A1A1A]">{inv.expand?.prodotto?.nome ?? '—'}</span>
                <span class="text-sm text-rose-600 font-bold">
                  {inv.giacenza ?? 0} / {inv.giacenza_minima ?? 0}
                </span>
              </div>
            {/each}
          </div>
          {#if sottoScortaList.length === 0}
            <p class="py-8 text-center text-sm text-[#6B7280]">Nessun prodotto sotto scorta</p>
          {/if}
        </Card>
        <Card className="lg:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-medium text-[#1A1A1A]">Movimenti del periodo</h2>
            <select
              bind:value={reportPeriod}
              class="rounded-2xl border border-black/5 bg-white/80 px-3 py-1.5 text-sm"
            >
              <option value="7">Ultimi 7 giorni</option>
              <option value="14">Ultimi 14 giorni</option>
              <option value="30">Ultimi 30 giorni</option>
            </select>
          </div>
          <div class="h-56">
            <BarChart config={barChartConfig} />
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Valore magazzino per prodotto (top 10)</h2>
          <div class="h-64">
            <BarChart config={horizontalBarConfig} />
          </div>
        </Card>
      </div>
    {/if}
  {/if}
</div>

<!-- Modal Nuovo Movimento -->
<Modal open={modalOpen} title="Nuovo Movimento" size="lg" on:close={() => (modalOpen = false)}>
  <form onsubmit={(e) => { e.preventDefault(); saveMovimento(); }} class="space-y-5">
    <div>
      <label for="tipo" class="block text-sm font-medium text-[#1A1A1A] mb-2">Tipo</label>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all {movimentoTipo === 'carico'
            ? 'bg-green-100 text-green-800'
            : 'bg-[#E5E7EB] text-[#6B7280]'}"
          onclick={() => (movimentoTipo = 'carico')}
        >
          Carico
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all {movimentoTipo === 'scarico'
            ? 'bg-rose-100 text-rose-800'
            : 'bg-[#E5E7EB] text-[#6B7280]'}"
          onclick={() => (movimentoTipo = 'scarico')}
        >
          Scarico
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all {movimentoTipo === 'rettifica'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-[#E5E7EB] text-[#6B7280]'}"
          onclick={() => (movimentoTipo = 'rettifica')}
        >
          Rettifica
        </button>
      </div>
    </div>
    <div>
      <label for="prodotto" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Prodotto</label>
      <select
        id="prodotto"
        bind:value={movimentoProdotto}
        required
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
      >
        <option value="">Seleziona prodotto</option>
        {#each products.filter((p) => p.attivo) as p}
          <option value={p.id}>{p.nome} ({p.sku})</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="quantita" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Quantità</label>
      <input
        id="quantita"
        type="number"
        min="1"
        bind:value={movimentoQuantita}
        required
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
      />
    </div>
    <div>
      <label for="causale" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Causale</label>
      <input
        id="causale"
        type="text"
        bind:value={movimentoCausale}
        placeholder="Es. Carico merce, Scarico ordine..."
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
      />
    </div>
    <div class="flex justify-end gap-3">
      <Button type="button" variant="ghost" onclick={() => (modalOpen = false)}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={movimentoSaving}>
        {movimentoSaving ? 'Salvataggio...' : 'Salva'}
      </Button>
    </div>
  </form>
</Modal>
