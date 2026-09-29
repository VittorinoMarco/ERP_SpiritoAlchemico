<script lang="ts">
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { ymdLocal } from '$lib/utils/format';
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
    Search,
    ArrowLeftRight
  } from 'lucide-svelte';
  import MagazzinoSupplierPanel from '$lib/components/magazzino/MagazzinoSupplierPanel.svelte';
  import type { Inventory, InventoryMovement, MovementTipo } from '$lib/types/inventory';
  import { MOVIMENTO_LABELS, MOVIMENTO_COLORS } from '$lib/types/inventory';
  import type { Product } from '$lib/types/product';
  import { sottoScortaCount } from '$lib/stores/magazzino';
  import { isSottoScortaGiacenza } from '$lib/constants/inventory';
  import { getQtyReservedByDraftOrders } from '$lib/utils/inventoryDraftReservations';
  import { eseguiCaricoMagazzino, eseguiScaricoMagazzino } from '$lib/utils/inventoryCarico';

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
  let movimentoLottoDogana = '';
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
  /** Qtà impegnate da ordini in bozza (per prodotto). */
  let draftReservations = new Map<string, number>();

  $: valoreTotale = inventory.reduce((s, inv) => {
    const p = inv.expand?.prodotto;
    const prezzo = p?.prezzo_listino ?? 0;
    return s + (inv.giacenza ?? 0) * prezzo;
  }, 0);

  $: sottoScortaList = inventory.filter((inv) => isSottoScortaGiacenza(inv.giacenza));
  $: sottoScortaNum = sottoScortaList.length;

  $: today = ymdLocal(new Date());
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
    const matchSottoScorta = !soloSottoScorta || isSottoScortaGiacenza(inv.giacenza);
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
      const key = ymdLocal(d);
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
      indexAxis: 'y' as const,
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
      /** Ogni fetch isolato: se fallisce ordini/bozze, i prodotti restano comunque caricati (select fattura fornitore). */
      const [invList, movList, prodList, resMap] = await Promise.all([
        pb.collection('inventory').getFullList({ expand: 'prodotto' }).catch(() => []),
        pb.collection('inventory_movements')
          .getFullList({
            expand: 'prodotto,utente',
            sort: '-data_movimento'
          })
          .catch(() => []),
        pb.collection('products').getFullList<Product>().catch(() => []),
        getQtyReservedByDraftOrders(pb).catch(() => new Map<string, number>())
      ]);
      inventory = invList as typeof inventory;
      movements = movList as typeof movements;
      products = prodList;
      draftReservations = resMap;
    } catch {
      inventory = [];
      movements = [];
      products = [];
      draftReservations = new Map();
    } finally {
      loading = false;
      sottoScortaCount.set(inventory.filter((i) => isSottoScortaGiacenza(i.giacenza)).length);
    }
  }

  async function saveMovimento() {
    const qty = parseInt(movimentoQuantita, 10);
    if (!movimentoProdotto || isNaN(qty)) return;
    if (movimentoTipo === 'rettifica' ? qty < 0 : qty <= 0) return;
    movimentoSaving = true;
    try {
      const uid = (pb.authStore.model as { id?: string } | null)?.id;
      let mov: { id: string };
      if (movimentoTipo === 'scarico') {
        const r = await eseguiScaricoMagazzino(pb, {
          prodottoId: movimentoProdotto,
          quantita: qty,
          causale: movimentoCausale.trim() || undefined,
          utenteId: uid
        });
        mov = { id: r.movementId };
      } else if (movimentoTipo === 'carico') {
        const r = await eseguiCaricoMagazzino(pb, {
          prodottoId: movimentoProdotto,
          quantita: qty,
          causale: movimentoCausale.trim() || undefined,
          utenteId: uid,
          lottoDogana: movimentoLottoDogana.trim() || undefined
        });
        mov = { id: r.movementId };
      } else {
        // RETTIFICA = inventario fisico: la quantità inserita è la GIACENZA CONTATA (non un incremento).
        // Prima la rettifica poteva solo aumentare la giacenza; ora corregge anche in diminuzione.
        const fresh = await pb.collection('inventory').getFullList({ filter: `prodotto = "${movimentoProdotto}"` });
        const inv = fresh[0] as { id: string; giacenza?: number } | undefined;
        const prima = inv?.giacenza ?? 0;
        const contata = qty;
        const diff = contata - prima;
        if (diff === 0) {
          alert('La giacenza contata coincide con quella a sistema: nessuna rettifica necessaria.');
          movimentoSaving = false;
          return;
        }
        const m = await pb.collection('inventory_movements').create({
          prodotto: movimentoProdotto,
          tipo: 'rettifica',
          quantita: Math.abs(diff),
          causale: `Rettifica inventario: da ${prima} a ${contata}${movimentoCausale.trim() ? ` · ${movimentoCausale.trim()}` : ''}`,
          utente: uid
        });
        mov = { id: (m as { id: string }).id };
        if (inv) {
          await pb.collection('inventory').update(inv.id, { giacenza: contata });
        } else {
          await pb.collection('inventory').create({
            prodotto: movimentoProdotto,
            giacenza: contata,
            giacenza_minima: 0
          });
        }
      }
      const [newInv, newMov, resMap] = await Promise.all([
        pb.collection('inventory').getFullList({ expand: 'prodotto' }),
        pb.collection('inventory_movements').getFullList({
          expand: 'prodotto,utente',
          sort: '-data_movimento'
        }),
        getQtyReservedByDraftOrders(pb)
      ]);
      inventory = newInv as typeof inventory;
      movements = newMov as typeof movements;
      draftReservations = resMap;
      sottoScortaCount.set(inventory.filter((i) => isSottoScortaGiacenza(i.giacenza)).length);
      const prod = products.find((p) => p.id === movimentoProdotto);
      const prodName = prod?.nome ?? prod?.sku ?? movimentoProdotto;
      try {
        await pb.collection('activity_log').create({
          utente: (pb.authStore.model as any)?.id,
          azione: 'movimento_magazzino',
          collection_rif: 'inventory_movements',
          record_rif: mov.id,
          dettagli: JSON.stringify({
            messaggio: `${movimentoTipo === 'carico' ? 'Carico' : movimentoTipo === 'scarico' ? 'Scarico' : 'Rettifica'} ${prodName}: ${Math.abs(qty)}`
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
      movimentoLottoDogana = '';
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

<div class="space-y-5 fade-in">
  <PageHeader
    titolo="Magazzino"
    sottotitolo="Giacenza per prodotto. I carichi da ora hanno lotto interno L001… e, se lo inserisci, lotto dogana."
  />

  {#if loading}
    <Spinner />
  {:else}
    <section class="page-grid">
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Valore Totale Magazzino</p>
        <p class="mt-2 text-3xl lg:text-4xl font-bold text-[#F5D547]">{formatEuro(valoreTotale)}</p>
      </div>
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6 flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Sotto scorta (giacenza ≤ 6)</p>
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

    <div class="chip-row">
      {#each ['giacenze', 'movimenti', 'report'] as tabId}
        <button
          type="button"
          class="chip {activeTab === tabId ? 'chip-active' : ''}"
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
          <div class="flex flex-wrap items-center gap-2 w-full">
            <div class="relative w-full sm:w-64">
              <Search class="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="search"
                bind:value={filterProdotto}
                placeholder="Cerca prodotto..."
                class="field w-full pl-11"
              />
            </div>
            <select
              bind:value={filterUbicazione}
              class="field w-full sm:w-auto"
            >
              <option value="">Tutte le ubicazioni</option>
              {#each ubicazioni as u}
                <option value={u}>{u}</option>
              {/each}
            </select>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={soloSottoScorta} class="rounded border-black/20 text-[#F5D547]" />
              <span class="text-sm text-[#1A1A1A]">Solo giacenza ≤ 6</span>
            </label>
          </div>
        </div>
        <!-- Mobile -->
        <ul class="md:hidden divide-y divide-black/5 -mx-1">
          {#each filteredGiacenze as inv (inv.id)}
            {@const riserva = draftReservations.get(inv.prodotto) ?? 0}
            {@const sottoScorta = isSottoScortaGiacenza(inv.giacenza)}
            <li class="py-3 px-1 flex items-center gap-3">
              {#if inv.expand?.prodotto && getImageUrl(inv.expand.prodotto)}
                <img src={getImageUrl(inv.expand.prodotto)} alt="" class="h-12 w-12 rounded-xl object-cover shrink-0" />
              {:else}
                <div class="h-12 w-12 rounded-xl bg-[#F3F4F6] grid place-items-center shrink-0"><ImageOff class="h-5 w-5 text-[#9CA3AF]" /></div>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="font-medium truncate">{inv.expand?.prodotto?.nome ?? '—'}</p>
                <p class="text-xs text-[#6B7280] truncate">
                  {inv.expand?.prodotto?.sku ?? '—'}{#if inv.ubicazione} · {inv.ubicazione}{/if}{#if inv.data_scadenza} · scad. {formatDate(inv.data_scadenza)}{/if}
                </p>
                {#if riserva > 0}<p class="text-xs text-amber-800">Riserva bozze: {riserva}</p>{/if}
              </div>
              <div class="text-right shrink-0">
                <p class="text-xl font-bold leading-none {sottoScorta ? 'text-rose-600' : ''}">{inv.giacenza ?? 0}</p>
                {#if sottoScorta}<span class="text-[10px] font-medium text-rose-700">Sotto scorta</span>{/if}
              </div>
            </li>
          {/each}
        </ul>
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-black/5">
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Prodotto</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">SKU</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Giacenza</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase" title="Ordini in bozza">Riserva bozze</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase" title="Giacenza − impegni bozza">Previsione</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Minima</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Lotto int.</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Lotto dogana</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Scadenza</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Ubicazione</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase">Stato</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredGiacenze as inv (inv.id)}
                {@const riserva = draftReservations.get(inv.prodotto) ?? 0}
                {@const previsione = Math.max(0, (inv.giacenza ?? 0) - riserva)}
                {@const sottoScorta = isSottoScortaGiacenza(inv.giacenza)}
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
                  <td class="px-4 py-3 text-sm text-amber-800 font-medium">
                    {riserva > 0 ? riserva : '—'}
                  </td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">
                    <span class="font-medium text-[#1A1A1A]">{previsione}</span>
                    {#if riserva > 0}
                      <span class="block text-[10px] text-[#9CA3AF]">dopo bozze</span>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{inv.giacenza_minima ?? 0}</td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{inv.lotto ?? '—'}</td>
                  <td class="px-4 py-3 text-sm text-[#6B7280]">{inv.lotto_dogana ?? '—'}</td>
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
          <EmptyState icon={Package} titolo="Nessuna giacenza" testo="Nessun prodotto corrisponde ai filtri." />
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
              class="field w-auto"
            >
              <option value="">Tutti i tipi</option>
              <option value="carico">Carico</option>
              <option value="scarico">Scarico</option>
              <option value="rettifica">Rettifica</option>
            </select>
            <select
              bind:value={filterMovProdotto}
              class="field w-auto"
            >
              <option value="">Tutti i prodotti</option>
              {#each products as p}
                <option value={p.id}>{p.nome} ({p.sku})</option>
              {/each}
            </select>
            <input type="date" bind:value={filterMovFrom} class="field w-auto" />
            <input type="date" bind:value={filterMovTo} class="field w-auto" />
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
                <p class="text-xs text-[#6B7280]">
                  {m.causale ?? '—'}
                  {#if m.lotto_interno} · {m.lotto_interno}{/if}
                  {#if m.lotto_dogana} · dogana {m.lotto_dogana}{/if}
                  · {userLabel(m.expand?.utente)}
                </p>
              </div>
              <span class="text-xs text-[#6B7280] flex-shrink-0">{formatDate(m.data_movimento)}</span>
            </div>
          {/each}
        </div>
        {#if filteredMovimenti.length === 0}
          <EmptyState icon={ArrowLeftRight} titolo="Nessun movimento" testo="Non ci sono movimenti con questi filtri." />
        {/if}
      </Card>
    {/if}

    <!-- Tab Report -->
    {#if activeTab === 'report'}
      <div class="page-grid">
        <Card>
          <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Prodotti in esaurimento (giacenza ≤ 6)</h2>
          <div class="space-y-2">
            {#each sottoScortaList.slice(0, 10) as inv}
              <div class="flex justify-between items-center py-2 border-b border-black/5 last:border-0">
                <span class="text-sm font-medium text-[#1A1A1A]">{inv.expand?.prodotto?.nome ?? '—'}</span>
                <span class="text-sm text-rose-600 font-bold">
                  {inv.giacenza ?? 0} pz
                  <span class="text-xs font-normal text-[#6B7280] ml-1">(min. anagrafica {inv.giacenza_minima ?? 0})</span>
                </span>
              </div>
            {/each}
          </div>
          {#if sottoScortaList.length === 0}
            <p class="py-8 text-center text-sm text-[#6B7280]">Nessun prodotto con giacenza ≤ 6</p>
          {/if}
        </Card>
        <Card className="lg:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-medium text-[#1A1A1A]">Movimenti del periodo</h2>
            <select
              bind:value={reportPeriod}
              class="field w-auto"
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
        class="field w-full"
      >
        <option value="">Seleziona prodotto</option>
        {#each products.filter((p) => p.attivo) as p}
          <option value={p.id}>{p.nome} ({p.sku})</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="quantita" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">
        {movimentoTipo === 'rettifica' ? 'Giacenza contata (pezzi)' : 'Quantità'}
      </label>
      <input
        id="quantita"
        type="number"
        min={movimentoTipo === 'rettifica' ? 0 : 1}
        bind:value={movimentoQuantita}
        required
        class="field w-full"
      />
      {#if movimentoTipo === 'rettifica'}
        <p class="mt-1 text-xs text-[#6B7280]">
          Inserisci quanti pezzi hai contato a scaffale: il sistema calcola la differenza e la registra.
        </p>
      {/if}
    </div>
    <div>
      <label for="causale" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Causale</label>
      <input
        id="causale"
        type="text"
        bind:value={movimentoCausale}
        placeholder="Es. Carico merce, Scarico ordine..."
        class="field w-full"
      />
    </div>
    {#if movimentoTipo === 'carico'}
      <div>
        <label for="lotto_dogana" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">
          Lotto dogana (opzionale)
        </label>
        <input
          id="lotto_dogana"
          type="text"
          bind:value={movimentoLottoDogana}
          placeholder="Numero lotto in bolla/dogana"
          class="field w-full"
        />
        <p class="mt-1 text-xs text-[#6B7280]">
          Il lotto interno (L001, L002, …) viene assegnato in automatico. La dogana serve alla tracciabilità.
        </p>
      </div>
    {/if}
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
