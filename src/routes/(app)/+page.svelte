<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { ChartConfiguration } from 'chart.js';
  import { Receipt, ShoppingCart, PackageCheck, AlertTriangle, Users, Wallet, Boxes, Plus, ArrowRight, FileWarning, ClipboardList } from 'lucide-svelte';
  import { pb } from '$lib/pocketbase';
  import { currentRole, currentUser } from '$lib/stores/auth';
  import { formatEuro, dayOf, ymdLocal } from '$lib/utils/format';
  import { isSottoScortaGiacenza } from '$lib/constants/inventory';
  import { STATO_LABELS, STATO_BADGE_COLORS, type OrderStato } from '$lib/types/order';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import KpiCard from '$lib/components/layout/KpiCard.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';

  type Row = Record<string, any>;

  let loading = true;
  let loadError = '';

  // dati grezzi
  let orders: Row[] = [];
  let invoices: Row[] = [];
  let inventory: Row[] = [];
  let movements: Row[] = [];
  let commissions: Row[] = [];
  let prodottiAttivi = 0;
  let clientiTotali = 0;

  const now = new Date();
  const Y = now.getFullYear();
  const M0 = now.getMonth();
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const inMonth = (day: string | null, d: Date) => !!day && day.startsWith(monthKey(d));
  const thisMonth = new Date(Y, M0, 1);
  const prevMonth = new Date(Y, M0 - 1, 1);
  const sinceIso = ymdLocal(new Date(Y, M0 - 5, 1)); // 6 mesi di storico

  $: nome = ($currentUser?.nome as string | undefined) || '';
  $: isAdmin = $currentRole === 'admin';
  $: isAgente = $currentRole === 'agente';
  $: isMagazziniere = $currentRole === 'magazziniere';

  // Le bozze sono proposte degli agenti non ancora confermate: non sono "ordinato".
  $: activeOrders = orders.filter((o) => o.stato !== 'annullato' && o.stato !== 'bozza');
  $: ordersThisMonth = activeOrders.filter((o) => inMonth(dayOf(o.data_ordine), thisMonth));
  $: ordersThisMonthTotal = ordersThisMonth.reduce((s, o) => s + (Number(o.totale) || 0), 0);
  $: daEvadere = orders.filter((o) => o.stato === 'confermato');
  $: bozze = orders.filter((o) => o.stato === 'bozza');

  $: fatturatoMese = invoices
    .filter((i) => inMonth(dayOf(i.data_emissione), thisMonth))
    .reduce((s, i) => s + (Number(i.totale) || 0), 0);
  $: fatturatoPrec = invoices
    .filter((i) => inMonth(dayOf(i.data_emissione), prevMonth))
    .reduce((s, i) => s + (Number(i.totale) || 0), 0);
  $: trendPct = fatturatoPrec > 0 ? Math.round(((fatturatoMese - fatturatoPrec) / fatturatoPrec) * 1000) / 10 : null;
  $: trend =
    trendPct === null
      ? { t: 'flat' as const, label: 'Nessun dato mese scorso' }
      : trendPct > 0
        ? { t: 'up' as const, label: `+${trendPct}% vs mese scorso` }
        : trendPct < 0
          ? { t: 'down' as const, label: `${trendPct}% vs mese scorso` }
          : { t: 'flat' as const, label: 'In linea col mese scorso' };

  $: fattureScadute = invoices.filter((i) => i.stato !== 'pagata' && dayOf(i.data_scadenza) && dayOf(i.data_scadenza)! < ymdLocal(now));
  $: daIncassare = invoices.filter((i) => i.stato !== 'pagata').reduce((s, i) => s + (Number(i.totale) || 0), 0);

  $: sottoScorta = inventory.filter((i) => isSottoScortaGiacenza(i.giacenza));
  $: unitaTotali = inventory.reduce((s, i) => s + (Number(i.giacenza) || 0), 0);
  $: movimentiOggi = movements.filter((m) => dayOf(m.data_movimento) === ymdLocal(now)).length;
  $: provvigioniMaturate = commissions
    .filter((c) => c.stato === 'maturata')
    .reduce((s, c) => s + (Number(c.importo) || 0), 0);

  $: ultimiOrdini = [...orders]
    .sort((a, b) => (dayOf(b.data_ordine) ?? '').localeCompare(dayOf(a.data_ordine) ?? '') || String(b.created).localeCompare(String(a.created)))
    .slice(0, 6);

  // ---- grafici ----
  const baseScales = {
    x: { grid: { display: false }, border: { display: false } },
    y: { grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false }, beginAtZero: true, suggestedMax: 10 }
  };

  $: dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  $: barConfig = {
    data: {
      labels: dayLabels.map((d) => d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })),
      datasets: [
        {
          label: isAdmin ? 'Fatturato' : 'Ordini',
          data: dayLabels.map((d) => {
            const key = ymdLocal(d);
            const src = isAdmin ? invoices : activeOrders;
            return round2(
              src
                .filter((r) => dayOf(isAdmin ? r.data_emissione : r.data_ordine) === key)
                .reduce((s, r) => s + (Number(r.totale) || 0), 0)
            );
          }),
          backgroundColor: '#F5D547',
          hoverBackgroundColor: '#1A1A1A',
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 36
        }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: baseScales }
  } as Omit<ChartConfiguration<'bar'>, 'type'>;

  $: months6 = Array.from({ length: 6 }, (_, i) => new Date(Y, M0 - (5 - i), 1));
  $: lineConfig = {
    data: {
      labels: months6.map((d) => d.toLocaleDateString('it-IT', { month: 'short' })),
      datasets: [
        {
          label: isAdmin ? 'Fatturato' : 'Ordini',
          data: months6.map((m) => {
            const src = isAdmin ? invoices : activeOrders;
            return round2(
              src
                .filter((r) => inMonth(dayOf(isAdmin ? r.data_emissione : r.data_ordine), m))
                .reduce((s, r) => s + (Number(r.totale) || 0), 0)
            );
          }),
          borderColor: '#1A1A1A',
          backgroundColor: 'rgba(245,213,71,0.25)',
          tension: 0.4,
          fill: true,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#F5D547',
          pointBorderColor: '#1A1A1A',
          pointBorderWidth: 2
        }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: baseScales }
  } as Omit<ChartConfiguration<'line'>, 'type'>;

  $: canaleCount = (() => {
    const c = { horeca: 0, ecommerce: 0, diretto: 0 };
    for (const o of ordersThisMonth) {
      const k = (o.canale in c ? o.canale : 'horeca') as keyof typeof c;
      c[k] += 1;
    }
    return c;
  })();
  $: statoCount = (() => {
    const c: Record<string, number> = {};
    for (const o of orders) c[o.stato] = (c[o.stato] ?? 0) + 1;
    return c;
  })();

  $: donutValues = isAgente
    ? (['bozza', 'confermato', 'spedito', 'consegnato', 'completato'] as const).map((s) => statoCount[s] ?? 0)
    : [canaleCount.horeca, canaleCount.ecommerce, canaleCount.diretto];
  $: donutLabels = isAgente ? ['Bozza', 'Confermato', 'Spedito', 'Consegnato', 'Completato'] : ['HORECA', 'E-commerce', 'Diretto'];
  $: donutEmpty = donutValues.reduce((a, b) => a + b, 0) === 0;
  $: donutConfig = {
    data: {
      labels: donutEmpty ? ['Nessun dato'] : donutLabels,
      datasets: [
        {
          data: donutEmpty ? [1] : donutValues,
          backgroundColor: donutEmpty ? ['#E5E7EB'] : ['#F5D547', '#1A1A1A', '#FF9F43', '#3B6CFF', '#7BE0B3'],
          borderWidth: 0,
          hoverOffset: 6
        }
      ]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } } }, cutout: '72%' }
  } as Omit<ChartConfiguration<'doughnut'>, 'type'>;

  $: barEmpty = (barConfig.data.datasets[0].data as number[]).every((v) => !v);
  $: lineEmpty = (lineConfig.data.datasets[0].data as number[]).every((v) => !v);

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((e) => {
      loadError = 'Alcuni dati non sono stati caricati. Riprova più tardi.';
      console.warn('[dashboard]', e);
      return fallback;
    });

  onMount(async () => {
    const uid = pb.authStore.model?.id;
    try {
      if (isAdmin) {
        const [ord, inv, prod, cli, invt, com] = await Promise.all([
          safe(pb.collection('orders').getFullList({ filter: `data_ordine >= "${sinceIso}"`, expand: 'cliente', sort: '-data_ordine' }), []),
          safe(pb.collection('invoices').getFullList({ filter: `data_emissione >= "${sinceIso}" || stato != "pagata"` }), []),
          safe(pb.collection('products').getList(1, 1, { filter: 'attivo = true' }), { totalItems: 0 } as any),
          safe(pb.collection('clients').getList(1, 1), { totalItems: 0 } as any),
          safe(pb.collection('inventory').getFullList({ expand: 'prodotto' }), []),
          safe(pb.collection('agent_commissions').getFullList({ filter: 'stato = "maturata"' }), [])
        ]);
        orders = ord;
        invoices = inv;
        prodottiAttivi = prod.totalItems;
        clientiTotali = cli.totalItems;
        inventory = invt;
        commissions = com;
      } else if (isAgente) {
        const [ord, cli, com] = await Promise.all([
          safe(pb.collection('orders').getFullList({ filter: `agente = "${uid}" && data_ordine >= "${sinceIso}"`, expand: 'cliente', sort: '-data_ordine' }), []),
          safe(pb.collection('clients').getList(1, 1), { totalItems: 0 } as any),
          safe(pb.collection('agent_commissions').getFullList({ filter: `agente = "${uid}"` }), [])
        ]);
        orders = ord;
        clientiTotali = cli.totalItems;
        commissions = com;
      } else if (isMagazziniere) {
        const [invt, mov] = await Promise.all([
          safe(pb.collection('inventory').getFullList({ expand: 'prodotto' }), []),
          safe(pb.collection('inventory_movements').getList(1, 40, { sort: '-data_movimento', expand: 'prodotto' }), { items: [] } as any)
        ]);
        inventory = invt;
        movements = mov.items;
      }
    } finally {
      loading = false;
    }
  });

  const dateLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const greeting = now.getHours() < 12 ? 'Buongiorno' : now.getHours() < 18 ? 'Buon pomeriggio' : 'Buonasera';
</script>

<svelte:head><title>Dashboard · SpiritoAlchemico ERP</title></svelte:head>

<PageHeader titolo="{greeting}{nome ? `, ${nome}` : ''}" sottotitolo={dateLong.charAt(0).toUpperCase() + dateLong.slice(1)}>
  {#if isAdmin || isAgente}
    <Button variant="secondary" onclick={() => goto('/ordini/nuovo')}>
      <Plus class="h-4 w-4" /> Nuovo ordine
    </Button>
  {/if}
</PageHeader>

{#if loading}
  <Spinner label="Carico gli indicatori…" />
{:else}
  {#if loadError}
    <p class="mb-4 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">{loadError}</p>
  {/if}

  <div class="space-y-4 lg:space-y-5 fade-in">
    <!-- KPI -->
    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
      {#if isAdmin}
        <KpiCard tone="yellow" label="Fatturato del mese" valore={formatEuro(fatturatoMese, 0)} trend={trend.t} trendLabel={trend.label} icon={Receipt} />
        <KpiCard label="Ordini del mese" valore={String(ordersThisMonth.length)} trend="flat" trendLabel={formatEuro(ordersThisMonthTotal, 0) + ' di ordinato'} icon={ShoppingCart} />
        <KpiCard tone="orange" label="Ordini da evadere" valore={String(daEvadere.length)} trend="flat" trendLabel={daEvadere.length ? 'Confermati, non spediti' : 'Nessuno in coda'} icon={PackageCheck} />
        <KpiCard tone="dark" label="Prodotti sotto scorta" valore={String(sottoScorta.length)} trend="flat" trendLabel={sottoScorta.length ? 'Giacenza ≤ 6' : 'Magazzino ok'} icon={AlertTriangle} />
      {:else if isAgente}
        <KpiCard tone="yellow" label="Ordinato del mese" valore={formatEuro(ordersThisMonthTotal, 0)} trend="flat" trendLabel={`${ordersThisMonth.length} ordini · IVA incl.`} icon={ShoppingCart} />
        <KpiCard label="Ordini in bozza" valore={String(bozze.length)} trend="flat" trendLabel={bozze.length ? 'Da completare' : 'Tutto confermato'} icon={ClipboardList} />
        <KpiCard tone="orange" label="Provvigioni maturate" valore={formatEuro(provvigioniMaturate, 0)} trend="flat" trendLabel="Da liquidare" icon={Wallet} />
        <KpiCard tone="dark" label="I miei clienti" valore={String(clientiTotali)} trend="flat" trendLabel="In portafoglio" icon={Users} />
      {:else}
        <KpiCard tone="yellow" label="Prodotti a magazzino" valore={String(inventory.length)} trend="flat" trendLabel={`${unitaTotali} unità totali`} icon={Boxes} />
        <KpiCard tone="dark" label="Sotto scorta" valore={String(sottoScorta.length)} trend="flat" trendLabel={sottoScorta.length ? 'Giacenza ≤ 6' : 'Tutto ok'} icon={AlertTriangle} />
        <KpiCard label="Movimenti di oggi" valore={String(movimentiOggi)} trend="flat" trendLabel="Carichi e scarichi" icon={PackageCheck} />
      {/if}
    </section>

    {#if isAdmin || isAgente}
      <section class="grid gap-4 lg:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2 min-w-0">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 class="text-base font-semibold">{isAdmin ? 'Fatturato' : 'Ordinato'} ultimi 7 giorni</h2>
              <p class="text-xs text-[#6B7280] mt-0.5">{isAdmin ? 'Fatture per data emissione' : 'Ordini non annullati per data'}</p>
            </div>
          </div>
          <div class="relative h-56 sm:h-64">
            <BarChart config={barConfig} />
            {#if barEmpty}
              <p class="absolute inset-0 flex items-center justify-center text-sm text-[#9CA3AF] pointer-events-none">Nessun dato negli ultimi 7 giorni</p>
            {/if}
          </div>
        </Card>

        <Card className="min-w-0">
          <h2 class="text-base font-semibold">{isAgente ? 'I miei ordini per stato' : 'Ordini per canale'}</h2>
          <p class="text-xs text-[#6B7280] mt-0.5 mb-4">{isAgente ? 'Ultimi 6 mesi' : 'Mese corrente, esclusi annullati'}</p>
          <div class="relative h-56 sm:h-64"><DonutChart config={donutConfig} /></div>
        </Card>
      </section>

      <section class="grid gap-4 lg:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2 min-w-0">
          <h2 class="text-base font-semibold">{isAdmin ? 'Fatturato' : 'Ordinato'} mensile</h2>
          <p class="text-xs text-[#6B7280] mt-0.5 mb-4">Ultimi 6 mesi</p>
          <div class="relative h-52 sm:h-60">
            <LineChart config={lineConfig} />
            {#if lineEmpty}
              <p class="absolute inset-0 flex items-center justify-center text-sm text-[#9CA3AF] pointer-events-none">Nessun dato negli ultimi 6 mesi</p>
            {/if}
          </div>
        </Card>

        <Card className="min-w-0">
          <h2 class="text-base font-semibold mb-3">{isAdmin ? 'Da tenere d\'occhio' : 'Promemoria'}</h2>
          <ul class="space-y-2">
            {#if isAdmin}
              <li>
                <a href="/fatture" class="flex items-center gap-3 rounded-2xl bg-[#F7F6F3] hover:bg-[#FFF3CD] transition-colors p-3">
                  <span class="h-9 w-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center"><FileWarning class="h-4 w-4" /></span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold">{fattureScadute.length} fatture scadute</span>
                    <span class="block text-xs text-[#6B7280]">{formatEuro(daIncassare, 0)} ancora da incassare</span>
                  </span>
                  <ArrowRight class="h-4 w-4 text-[#9CA3AF]" />
                </a>
              </li>
              <li>
                <a href="/magazzino" class="flex items-center gap-3 rounded-2xl bg-[#F7F6F3] hover:bg-[#FFF3CD] transition-colors p-3">
                  <span class="h-9 w-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center"><AlertTriangle class="h-4 w-4" /></span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold">{sottoScorta.length} prodotti sotto scorta</span>
                    <span class="block text-xs text-[#6B7280]">{prodottiAttivi} prodotti attivi in catalogo</span>
                  </span>
                  <ArrowRight class="h-4 w-4 text-[#9CA3AF]" />
                </a>
              </li>
              <li>
                <a href="/agenti" class="flex items-center gap-3 rounded-2xl bg-[#F7F6F3] hover:bg-[#FFF3CD] transition-colors p-3">
                  <span class="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><Wallet class="h-4 w-4" /></span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold">{formatEuro(provvigioniMaturate, 0)} provvigioni da liquidare</span>
                    <span class="block text-xs text-[#6B7280]">Maturano all’incasso della fattura</span>
                  </span>
                  <ArrowRight class="h-4 w-4 text-[#9CA3AF]" />
                </a>
              </li>
              <li>
                <a href="/clienti" class="flex items-center gap-3 rounded-2xl bg-[#F7F6F3] hover:bg-[#FFF3CD] transition-colors p-3">
                  <span class="h-9 w-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center"><Users class="h-4 w-4" /></span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold">{clientiTotali} clienti in anagrafica</span>
                    <span class="block text-xs text-[#6B7280]">Apri la rubrica</span>
                  </span>
                  <ArrowRight class="h-4 w-4 text-[#9CA3AF]" />
                </a>
              </li>
            {:else}
              <li class="rounded-2xl bg-[#F7F6F3] p-3 text-sm">
                <strong>{bozze.length}</strong> {bozze.length === 1 ? 'ordine' : 'ordini'} in bozza da completare
              </li>
              <li class="rounded-2xl bg-[#F7F6F3] p-3 text-sm">
                <strong>{daEvadere.length}</strong> {daEvadere.length === 1 ? 'ordine confermato' : 'ordini confermati'} in attesa di spedizione
              </li>
            {/if}
          </ul>
        </Card>
      </section>

      <Card className="!p-0 overflow-hidden">
        <div class="flex items-center justify-between px-5 lg:px-6 pt-5 pb-3">
          <h2 class="text-base font-semibold">Ultimi ordini</h2>
          <a href="/ordini" class="text-sm font-medium text-[#6B7280] hover:text-[#1A1A1A] inline-flex items-center gap-1">Vedi tutti <ArrowRight class="h-4 w-4" /></a>
        </div>
        {#if ultimiOrdini.length === 0}
          <p class="px-6 pb-8 pt-2 text-sm text-[#6B7280]">Non ci sono ancora ordini. Crea il primo con “Nuovo ordine”.</p>
        {:else}
          <ul class="divide-y divide-black/5">
            {#each ultimiOrdini as o (o.id)}
              <li>
                <a href="/ordini/{o.id}" class="flex items-center gap-3 px-5 lg:px-6 py-3.5 hover:bg-[#FFFDE7] transition-colors">
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold truncate">{o.numero_ordine ?? 'Ordine'} · {o.expand?.cliente?.ragione_sociale ?? '—'}</span>
                    <span class="block text-xs text-[#6B7280]">{new Date(o.data_ordine).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </span>
                  <span class="hidden sm:inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[o.stato as OrderStato] ?? 'bg-gray-100 text-gray-700'}">
                    {STATO_LABELS[o.stato as OrderStato] ?? o.stato}
                  </span>
                  <span class="text-sm font-bold tabular-nums w-24 text-right">{formatEuro(o.totale)}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>
    {:else}
      <!-- Magazziniere -->
      <section class="grid gap-4 lg:gap-5 lg:grid-cols-2">
        <Card className="!p-0 overflow-hidden min-w-0">
          <div class="flex items-center justify-between px-5 lg:px-6 pt-5 pb-3">
            <h2 class="text-base font-semibold">Prodotti sotto scorta</h2>
            <a href="/magazzino" class="text-sm font-medium text-[#6B7280] hover:text-[#1A1A1A] inline-flex items-center gap-1">Magazzino <ArrowRight class="h-4 w-4" /></a>
          </div>
          {#if sottoScorta.length === 0}
            <p class="px-6 pb-8 pt-2 text-sm text-[#6B7280]">Nessun prodotto sotto scorta. 🎉</p>
          {:else}
            <ul class="divide-y divide-black/5">
              {#each sottoScorta.slice(0, 8) as i (i.id)}
                <li class="flex items-center gap-3 px-5 lg:px-6 py-3">
                  <span class="min-w-0 flex-1 text-sm font-medium truncate">{i.expand?.prodotto?.nome ?? '—'}</span>
                  <span class="rounded-full bg-rose-100 text-rose-700 px-2.5 py-0.5 text-xs font-bold">{i.giacenza ?? 0} pz</span>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>

        <Card className="!p-0 overflow-hidden min-w-0">
          <div class="px-5 lg:px-6 pt-5 pb-3"><h2 class="text-base font-semibold">Ultimi movimenti</h2></div>
          {#if movements.length === 0}
            <p class="px-6 pb-8 pt-2 text-sm text-[#6B7280]">Nessun movimento registrato.</p>
          {:else}
            <ul class="divide-y divide-black/5">
              {#each movements.slice(0, 8) as m (m.id)}
                <li class="flex items-center gap-3 px-5 lg:px-6 py-3">
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium truncate">{m.expand?.prodotto?.nome ?? '—'}</span>
                    <span class="block text-xs text-[#6B7280] capitalize">{m.tipo}{m.causale ? ` · ${m.causale}` : ''}</span>
                  </span>
                  <span class="text-sm font-bold tabular-nums {m.tipo === 'scarico' ? 'text-rose-600' : 'text-emerald-600'}">
                    {m.tipo === 'scarico' ? '−' : '+'}{Math.abs(m.quantita)}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      </section>
    {/if}
  </div>
{/if}
