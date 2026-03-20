<script lang="ts">
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import KpiCard from '$lib/components/layout/KpiCard.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import { Package2, Users, Receipt } from 'lucide-svelte';
  import type { ChartConfiguration } from 'chart.js';

  let loading = true;
  /** Incrementato dopo il fetch per rimontare i grafici con dati reali. */
  let chartMountKey = 0;
  let fatturatoMese = 0;
  let fatturatoMesePrec = 0;
  let prodottiAttivi = 0;
  let clientiTotali = 0;

  function monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function parseDay(s: string | undefined | null): string | null {
    if (!s) return null;
    return s.split('T')[0] ?? null;
  }

  function localYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isInMonth(day: string | null, y: number, m0: number): boolean {
    if (!day) return false;
    const [yy, mm] = day.split('-').map(Number);
    return yy === y && mm === m0 + 1;
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }

  let barConfig: Omit<ChartConfiguration<'bar'>, 'type'> = {
    data: { labels: [], datasets: [{ label: 'Fatturato', data: [], backgroundColor: '#F5D547', borderRadius: 6 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#E5E7EB' }, beginAtZero: true }
      }
    }
  };

  let lineConfig: Omit<ChartConfiguration<'line'>, 'type'> = {
    data: {
      labels: [],
      datasets: [
        {
          label: 'Fatturato',
          data: [],
          borderColor: '#1A1A1A',
          backgroundColor: 'rgba(26,26,26,0.05)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 0
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

  let donutConfig: Omit<ChartConfiguration<'doughnut'>, 'type'> = {
    data: {
      labels: [],
      datasets: [{ data: [], backgroundColor: ['#F5D547', '#1A1A1A', '#E5E7EB'], borderWidth: 0 }]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      cutout: '70%'
    }
  };

  $: revenueTrendPct =
    fatturatoMesePrec > 0
      ? Math.round(((fatturatoMese - fatturatoMesePrec) / fatturatoMesePrec) * 1000) / 10
      : null;
  $: revenueTrend =
    revenueTrendPct === null
      ? { trend: 'flat' as const, label: 'Nessun dato mese precedente' }
      : revenueTrendPct > 0
        ? { trend: 'up' as const, label: `${revenueTrendPct > 0 ? '+' : ''}${revenueTrendPct}% vs mese scorso` }
        : revenueTrendPct < 0
          ? { trend: 'down' as const, label: `${revenueTrendPct}% vs mese scorso` }
          : { trend: 'flat' as const, label: 'In linea col mese scorso' };

  onMount(async () => {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m0 = now.getMonth();
      const prev = new Date(y, m0 - 1, 1);
      const py = prev.getFullYear();
      const pm0 = prev.getMonth();

      const [invList, prodList, clientList, ordList] = await Promise.all([
        pb.collection('invoices').getFullList().catch(() => []),
        pb.collection('products').getFullList({ filter: 'attivo = true' }).catch(() => []),
        pb.collection('clients').getFullList().catch(() => []),
        pb.collection('orders').getFullList().catch(() => [])
      ]);

      prodottiAttivi = prodList.length;
      clientiTotali = clientList.length;

      const invoices = invList as { totale?: number; data_emissione?: string }[];
      fatturatoMese = invoices.reduce((s, i) => {
        const d = parseDay(i.data_emissione);
        return s + (isInMonth(d, y, m0) ? Number(i.totale) || 0 : 0);
      }, 0);
      fatturatoMesePrec = invoices.reduce((s, i) => {
        const d = parseDay(i.data_emissione);
        return s + (isInMonth(d, py, pm0) ? Number(i.totale) || 0 : 0);
      }, 0);

      const dayLabels: string[] = [];
      const dayTotals: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = localYmd(d);
        dayLabels.push(
          d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })
        );
        let sum = 0;
        for (const inv of invoices) {
          if (parseDay(inv.data_emissione) === key) sum += Number(inv.totale) || 0;
        }
        dayTotals.push(Math.round(sum * 100) / 100);
      }

      barConfig = {
        ...barConfig,
        data: {
          labels: dayLabels,
          datasets: [
            {
              label: 'Fatturato',
              data: dayTotals,
              backgroundColor: '#F5D547',
              borderRadius: 6
            }
          ]
        }
      };

      const lineLabels: string[] = [];
      const lineVals: number[] = [];
      for (let back = 5; back >= 0; back--) {
        const d = new Date(y, m0 - back, 1);
        lineLabels.push(d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }));
        const mk = monthKey(d);
        let sum = 0;
        for (const inv of invoices) {
          const day = parseDay(inv.data_emissione);
          if (!day) continue;
          const [iy, im] = day.split('-').map(Number);
          if (`${iy}-${String(im).padStart(2, '0')}` === mk) sum += Number(inv.totale) || 0;
        }
        lineVals.push(Math.round(sum * 100) / 100);
      }

      lineConfig = {
        ...lineConfig,
        data: {
          labels: lineLabels,
          datasets: [
            {
              label: 'Fatturato',
              data: lineVals,
              borderColor: '#1A1A1A',
              backgroundColor: 'rgba(26,26,26,0.05)',
              tension: 0.4,
              fill: true,
              borderWidth: 2,
              pointRadius: 0
            }
          ]
        }
      };

      const orders = ordList as { canale?: string; data_ordine?: string; stato?: string }[];
      const canaleCount: Record<string, number> = { horeca: 0, ecommerce: 0, diretto: 0 };
      for (const o of orders) {
        const day = parseDay(o.data_ordine);
        if (!isInMonth(day, y, m0)) continue;
        if (o.stato === 'annullato') continue;
        const c = (o.canale || 'horeca') as keyof typeof canaleCount;
        if (c in canaleCount) canaleCount[c] += 1;
        else canaleCount.horeca += 1;
      }
      const donutLabels = ['HORECA', 'E-commerce', 'Diretto'];
      const donutData = [canaleCount.horeca, canaleCount.ecommerce, canaleCount.diretto];
      const sumOrd = donutData.reduce((a, b) => a + b, 0);
      if (sumOrd === 0) {
        donutConfig = {
          ...donutConfig,
          data: {
            labels: ['Nessun ordine nel mese'],
            datasets: [{ data: [1], backgroundColor: ['#E5E7EB'], borderWidth: 0 }]
          }
        };
      } else {
        donutConfig = {
          ...donutConfig,
          data: {
            labels: donutLabels,
            datasets: [
              {
                data: donutData,
                backgroundColor: ['#F5D547', '#1A1A1A', '#E5E7EB'],
                borderWidth: 0
              }
            ]
          }
        };
      }
    } catch {
      // keep zeros
    } finally {
      chartMountKey += 1;
      loading = false;
    }
  });
</script>

<PageHeader
  titolo="Dashboard ERP"
  sottotitolo="Panoramica da fatture, ordini e anagrafica (dati reali)."
/>

{#if loading}
  <p class="text-sm text-[#6B7280] py-8">Caricamento indicatori…</p>
{:else}
  <section class="page-grid mb-6 lg:mb-8">
    <KpiCard
      label="Fatturato mese (fatture emesse)"
      valore={formatEuro(fatturatoMese)}
      trend={revenueTrend.trend}
      trendLabel={revenueTrend.label}
      icon={Receipt}
    />
    <KpiCard
      label="Prodotti attivi"
      valore={String(prodottiAttivi)}
      trend="flat"
      trendLabel="In anagrafica"
      icon={Package2}
    />
    <KpiCard
      label="Clienti in anagrafica"
      valore={String(clientiTotali)}
      trend="flat"
      trendLabel="Totale rubrica"
      icon={Users}
    />
  </section>

  <section class="page-grid">
    <Card className="col-span-2 min-h-[260px]">
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-2">
        Fatturato ultimi 7 giorni
      </h2>
      <p class="text-xs text-[#6B7280] mb-4">
        Somma <code class="text-[11px]">totale</code> delle fatture per data emissione.
      </p>
      <div class="h-56">
        {#key chartMountKey}
          <BarChart config={barConfig} />
        {/key}
      </div>
    </Card>

    <Card className="min-h-[260px]">
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-2">
        Ordini per canale (mese corrente)
      </h2>
      <p class="text-xs text-[#6B7280] mb-4">
        Conteggio ordini non annullati con data ordine nel mese.
      </p>
      <div class="h-56">
        {#key chartMountKey}
          <DonutChart config={donutConfig} />
        {/key}
      </div>
    </Card>

    <Card className="col-span-2 min-h-[260px]">
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-2">
        Fatturato mensile (ultimi 6 mesi)
      </h2>
      <p class="text-xs text-[#6B7280] mb-4">
        Evoluzione da collection <code class="text-[11px]">invoices</code>.
      </p>
      <div class="h-56">
        {#key chartMountKey}
          <LineChart config={lineConfig} />
        {/key}
      </div>
    </Card>
  </section>
{/if}
