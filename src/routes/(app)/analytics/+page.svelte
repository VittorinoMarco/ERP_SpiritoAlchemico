<script lang="ts">
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import { Bot, Download, Plus, FileText } from 'lucide-svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { getAnalyticsInsight, buildDataSummary } from '$lib/utils/analyticsAi';
  import { TIPO_LABELS } from '$lib/types/client';

  type ChartView = 'bar' | 'line' | 'area';

  let loading = true;
  let dateFrom = '';
  let dateTo = '';
  let canaleFilter = '';
  let agenteFilter = '';
  let agents: { id: string; nome?: string; cognome?: string; email?: string }[] = [];
  let orders: any[] = [];
  let orderItems: any[] = [];
  let clients: any[] = [];
  let products: any[] = [];
  let confrontoView: ChartView = 'line';
  let aiQuery = '';
  let aiLoading = false;
  let aiResponse = '';
  let aiError = '';

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  onMount(async () => {
    if (!dateFrom) dateFrom = defaultFrom.toISOString().split('T')[0];
    if (!dateTo) dateTo = defaultTo.toISOString().split('T')[0];
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [ordersList, itemsList, clientsList, productsList, agentsList] = await Promise.all([
        pb.collection('orders').getFullList({ expand: 'cliente,agente', sort: 'data_ordine' }),
        pb.collection('order_items').getFullList({ expand: 'prodotto' }),
        pb.collection('clients').getFullList(),
        pb.collection('products').getFullList(),
        pb.collection('users').getFullList({ filter: 'ruolo = "agente"' })
      ]);
      orders = ordersList;
      orderItems = itemsList;
      clients = clientsList;
      products = productsList;
      agents = agentsList;
    } catch {
      orders = [];
      orderItems = [];
      clients = [];
      products = [];
      agents = [];
    } finally {
      loading = false;
    }
  }

  function agentName(a: { nome?: string; cognome?: string; email?: string }): string {
    if (a.nome) return [a.nome, a.cognome].filter(Boolean).join(' ');
    return a.email ?? '—';
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  $: filteredOrders = orders.filter((o) => {
    if (o.stato === 'bozza' || o.stato === 'annullato') return false;
    const d = o.data_ordine ?? '';
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo + 'T23:59:59') return false;
    if (canaleFilter && o.canale !== canaleFilter) return false;
    if (agenteFilter && o.agente !== agenteFilter) return false;
    return true;
  });

  $: totaleVendite = filteredOrders.reduce((s, o) => s + (Number(o.totale) || 0), 0);

  $: venditePerMese = (() => {
    const byMonth: Record<string, number> = {};
    for (const o of filteredOrders) {
      const d = o.data_ordine ?? '';
      if (!d) continue;
      const key = d.slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + (Number(o.totale) || 0);
    }
    const keys = Object.keys(byMonth).sort();
    return keys.map((k) => {
      const [y, m] = k.split('-');
      const label = new Date(parseInt(y, 10), parseInt(m, 10) - 1).toLocaleDateString('it-IT', {
        month: 'short',
        year: '2-digit'
      });
      return { mese: label, valore: byMonth[k] ?? 0, key: k };
    });
  })();

  $: venditePerCanale = (() => {
    const byCanale: Record<string, number> = { horeca: 0, ecommerce: 0, diretto: 0 };
    for (const o of filteredOrders) {
      const c = o.canale ?? 'diretto';
      if (c in byCanale) byCanale[c] += Number(o.totale) || 0;
    }
    return [
      { canale: 'HORECA', valore: byCanale.horeca, key: 'horeca' },
      { canale: 'E-commerce', valore: byCanale.ecommerce, key: 'ecommerce' },
      { canale: 'Diretto', valore: byCanale.diretto, key: 'diretto' }
    ].filter((x) => x.valore > 0);
  })();

  $: topProdotti = (() => {
    const byProd: Record<string, { nome: string; quantita: number; fatturato: number }> = {};
    for (const item of orderItems) {
      const ord = filteredOrders.find((o) => o.id === item.ordine);
      if (!ord) continue;
      const pid = item.prodotto;
      const p = (item as any).expand?.prodotto;
      if (!byProd[pid]) byProd[pid] = { nome: p?.nome ?? '—', quantita: 0, fatturato: 0 };
      byProd[pid].quantita += item.quantita ?? 0;
      byProd[pid].fatturato += item.totale_riga ?? 0;
    }
    return Object.values(byProd).sort((a, b) => b.fatturato - a.fatturato).slice(0, 10);
  })();

  $: topAgenti = (() => {
    const byAg: Record<string, { nome: string; fatturato: number; ordini: number }> = {};
    for (const o of filteredOrders) {
      const aid = o.agente ?? '_';
      const ag = agents.find((a) => a.id === aid);
      if (!byAg[aid]) byAg[aid] = { nome: ag ? agentName(ag) : 'Senza agente', fatturato: 0, ordini: 0 };
      byAg[aid].fatturato += Number(o.totale) || 0;
      byAg[aid].ordini += 1;
    }
    return Object.values(byAg).sort((a, b) => b.fatturato - a.fatturato).slice(0, 10);
  })();

  $: topClienti = (() => {
    const byCl: Record<string, { nome: string; fatturato: number; tipo: string }> = {};
    for (const o of filteredOrders) {
      const cid = o.cliente;
      const cl = clients.find((c) => c.id === cid);
      if (!byCl[cid]) byCl[cid] = { nome: cl?.ragione_sociale ?? '—', fatturato: 0, tipo: cl?.tipo ?? '—' };
      byCl[cid].fatturato += Number(o.totale) || 0;
    }
    return Object.values(byCl).sort((a, b) => b.fatturato - a.fatturato).slice(0, 10);
  })();

  $: validOrders = orders.filter((o) => o.stato !== 'bozza' && o.stato !== 'annullato');

  $: venditeAnnoCorrente = (() => {
    const y = now.getFullYear();
    const byMonth: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) byMonth[`${y}-${String(m).padStart(2, '0')}`] = 0;
    for (const o of validOrders) {
      const d = o.data_ordine ?? '';
      if (!d.startsWith(String(y))) continue;
      if (canaleFilter && o.canale !== canaleFilter) continue;
      if (agenteFilter && o.agente !== agenteFilter) continue;
      const key = d.slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + (Number(o.totale) || 0);
    }
    return Object.keys(byMonth).sort().map((k) => byMonth[k] ?? 0);
  })();

  $: venditeAnnoPrecedente = (() => {
    const y = now.getFullYear() - 1;
    const byMonth: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) byMonth[`${y}-${String(m).padStart(2, '0')}`] = 0;
    for (const o of validOrders) {
      const d = o.data_ordine ?? '';
      if (!d.startsWith(String(y))) continue;
      if (canaleFilter && o.canale !== canaleFilter) continue;
      if (agenteFilter && o.agente !== agenteFilter) continue;
      const key = d.slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + (Number(o.totale) || 0);
    }
    return Object.keys(byMonth).sort().map((k) => byMonth[k] ?? 0);
  })();

  $: confrontoTotaleCorrente = venditeAnnoCorrente.reduce((a, b) => a + b, 0);
  $: confrontoTotalePrecedente = venditeAnnoPrecedente.reduce((a, b) => a + b, 0);
  $: variazionePercentuale =
    confrontoTotalePrecedente > 0
      ? ((confrontoTotaleCorrente - confrontoTotalePrecedente) / confrontoTotalePrecedente) * 100
      : 0;

  $: salesTrendStats = (() => {
    const vals = venditePerMese.map((v) => v.valore).filter((x) => x > 0);
    if (vals.length === 0) return { count: 0, min: 0, max: 0, media: 0 };
    return {
      count: vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      media: vals.reduce((a, b) => a + b, 0) / vals.length
    };
  })();

  const monthLabels = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

  $: venditeTotaliBarConfig = {
    data: {
      labels: venditePerMese.length > 0 ? venditePerMese.map((v) => v.mese) : ['Nessun dato'],
      datasets: [
        {
          label: 'Vendite',
          data: venditePerMese.length > 0 ? venditePerMese.map((v) => v.valore) : [0],
          backgroundColor: venditePerMese.map((_, i) => (i % 2 === 0 ? '#F5D547' : '#E5E7EB')),
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

  $: confrontoChartConfig = {
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: now.getFullYear().toString(),
          data: venditeAnnoCorrente,
          borderColor: '#F5D547',
          backgroundColor: confrontoView === 'area' ? 'rgba(245,213,71,0.2)' : 'transparent',
          tension: 0.4,
          fill: confrontoView === 'area',
          borderWidth: 2,
          pointRadius: confrontoView === 'line' ? 3 : 0
        },
        {
          label: (now.getFullYear() - 1).toString(),
          data: venditeAnnoPrecedente,
          borderColor: '#9CA3AF',
          backgroundColor: confrontoView === 'area' ? 'rgba(156,163,175,0.1)' : 'transparent',
          tension: 0.4,
          fill: confrontoView === 'area',
          borderWidth: 2,
          pointRadius: confrontoView === 'line' ? 3 : 0
        }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#E5E7EB' }, beginAtZero: true }
      }
    }
  };

  $: confrontoBarConfig = {
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: now.getFullYear().toString(),
          data: venditeAnnoCorrente,
          backgroundColor: '#F5D547',
          borderRadius: 6
        },
        {
          label: (now.getFullYear() - 1).toString(),
          data: venditeAnnoPrecedente,
          backgroundColor: '#E5E7EB',
          borderRadius: 6
        }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#E5E7EB' }, beginAtZero: true }
      }
    }
  };

  $: canaleDonutConfig = {
    data: {
      labels: venditePerCanale.length > 0 ? venditePerCanale.map((v) => v.canale) : ['Nessun dato'],
      datasets: [
        {
          data: venditePerCanale.length > 0 ? venditePerCanale.map((v) => v.valore) : [1],
          backgroundColor: ['#F5D547', '#1A1A1A', '#9CA3AF'],
          borderWidth: 0
        }
      ]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const tot = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
              const pct = tot > 0 ? ((ctx.raw / tot) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${pct}%`;
            }
          }
        }
      },
      cutout: '65%'
    }
  };

  $: salesTrendLineConfig = {
    data: {
      labels: venditePerMese.map((v) => v.mese),
      datasets: [
        {
          label: 'Vendite',
          data: venditePerMese.map((v) => v.valore),
          borderColor: '#F5D547',
          backgroundColor: 'rgba(245,213,71,0.1)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 2
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

  async function askAi() {
    if (!aiQuery.trim()) return;
    aiLoading = true;
    aiError = '';
    aiResponse = '';
    try {
      const apiKey = $settingsStore.openaiApiKey ?? '';
      if (!apiKey) {
        aiError = 'Configura la chiave API OpenAI in Impostazioni.';
        return;
      }
      const summary = buildDataSummary({
        totaleVendite,
        venditePerMese: venditePerMese.map((v) => ({ mese: v.mese, valore: v.valore })),
        venditePerCanale: venditePerCanale.map((v) => ({ canale: v.canale, valore: v.valore })),
        topProdotti,
        topAgenti,
        topClienti,
        periodo: `${dateFrom} - ${dateTo}`
      });
      aiResponse = await getAnalyticsInsight(apiKey, aiQuery, summary);
    } catch (e) {
      aiError = e instanceof Error ? e.message : 'Errore durante l\'analisi.';
    } finally {
      aiLoading = false;
    }
  }

  function exportCsv(data: Record<string, string | number>[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(';'), ...data.map((r) => headers.map((h) => r[h]).join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportVenditeTotali() {
    exportCsv(
      venditePerMese.map((v) => ({ Mese: v.mese, Vendite: v.valore })),
      'vendite_totali.csv'
    );
  }

  function exportConfronto() {
    const rows = monthLabels.map((m, i) => ({
      Mese: m,
      [now.getFullYear()]: venditeAnnoCorrente[i] ?? 0,
      [now.getFullYear() - 1]: venditeAnnoPrecedente[i] ?? 0
    }));
    exportCsv(rows, 'confronto_fatturato.csv');
  }

  function exportCanale() {
    exportCsv(
      venditePerCanale.map((v) => ({ Canale: v.canale, Vendite: v.valore })),
      'vendite_canale.csv'
    );
  }

  function exportTopProdotti() {
    exportCsv(
      topProdotti.map((p) => ({ Prodotto: p.nome, Quantita: p.quantita, Fatturato: p.fatturato })),
      'top_prodotti.csv'
    );
  }

  function exportTopAgenti() {
    exportCsv(
      topAgenti.map((a) => ({ Agente: a.nome, Fatturato: a.fatturato, Ordini: a.ordini })),
      'top_agenti.csv'
    );
  }

  function exportSalesTrend() {
    exportCsv(
      venditePerMese.map((v) => ({ Mese: v.mese, Vendite: v.valore })),
      'sales_trend.csv'
    );
  }

  function exportTopClienti() {
    exportCsv(
      topClienti.map((c) => ({ Cliente: c.nome, Fatturato: c.fatturato, Tipo: c.tipo })),
      'top_clienti.csv'
    );
  }
</script>

<svelte:head>
  <title>Analytics | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Analytics</h1>

  <div class="flex flex-wrap items-center gap-3">
    <input type="date" bind:value={dateFrom} class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm" />
    <span class="text-[#9CA3AF]">—</span>
    <input type="date" bind:value={dateTo} class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm" />
    <select
      bind:value={canaleFilter}
      class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm"
    >
      <option value="">Tutti i canali</option>
      <option value="horeca">HORECA</option>
      <option value="ecommerce">E-commerce</option>
      <option value="diretto">Diretto</option>
    </select>
    <select
      bind:value={agenteFilter}
      class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm"
    >
      <option value="">Tutti gli agenti</option>
      {#each agents as a}
        <option value={a.id}>{agentName(a)}</option>
      {/each}
    </select>
    <div class="flex-1"></div>
    <Button variant="ghost" size="sm" className="rounded-2xl">
      <Plus class="h-4 w-4" />
      Aggiungi Widget
    </Button>
    <Button variant="secondary" size="sm" className="rounded-2xl !bg-[#F5D547] !text-[#1A1A1A]">
      <FileText class="h-4 w-4" />
      Crea Report
    </Button>
  </div>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else}
    <div class="analytics-bento">
      <!-- 1. AI Assistant -->
      <Card className="lg:col-span-2 bg-gradient-to-br from-green-50 to-white">
        <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <div class="h-9 w-9 rounded-xl bg-green-100 flex items-center justify-center">
              <Bot class="h-5 w-5 text-green-700" />
            </div>
            <h2 class="text-sm font-medium text-[#1A1A1A]">AI Assistant (dati)</h2>
          </div>
          <a
            href="/assistente"
            class="text-xs font-medium text-green-800 bg-green-100/80 hover:bg-green-100 px-3 py-1.5 rounded-full transition-colors"
          >
            Apri chat Assistente →
          </a>
        </div>
        <p class="text-xs text-[#6B7280] mb-3">
          Qui l’AI analizza i numeri caricati in questa pagina. Per domande libere con storico conversazioni usa la pagina Assistente.
        </p>
        {#if $settingsStore.openaiApiKey}
          <div class="space-y-3">
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={aiQuery}
                placeholder="Es: Analizza vendite per canale ultimo trimestre"
                class="flex-1 rounded-2xl border border-black/5 bg-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
                onkeydown={(e) => e.key === 'Enter' && askAi()}
              />
              <Button variant="primary" size="sm" onclick={askAi} disabled={aiLoading || !aiQuery.trim()}>
                {aiLoading ? '...' : 'Analizza'}
              </Button>
            </div>
            {#if aiError}
              <p class="text-sm text-rose-600">{aiError}</p>
            {/if}
            {#if aiResponse}
              <div class="rounded-2xl bg-white/80 p-4 text-sm">
                <p class="font-medium text-[#1A1A1A] mb-2">Summary</p>
                <div class="text-[#6B7280] whitespace-pre-wrap">{aiResponse}</div>
              </div>
            {/if}
          </div>
        {:else}
          <p class="text-sm text-[#6B7280] py-4">
            Configura la chiave API OpenAI in <a href="/impostazioni" class="text-[#F5D547] underline">Impostazioni</a> per
            abilitare l'AI Assistant.
          </p>
        {/if}
      </Card>

      <!-- 2. Vendite Totali -->
      <Card>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Vendite Totali</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5"
            onclick={exportVenditeTotali}
            aria-label="Esporta CSV"
          >
            <Download class="h-4 w-4" />
          </button>
        </div>
        <p class="text-4xl font-bold text-[#1A1A1A] mb-4">{formatEuro(totaleVendite)}</p>
        <div class="h-40">
          <BarChart config={venditeTotaliBarConfig} />
        </div>
      </Card>

      <!-- 3. Confronto Fatturato -->
      <Card className="lg:col-span-2">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Confronto Fatturato</h2>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="rounded-full px-2.5 py-1 text-xs font-medium {confrontoView === 'bar'
                ? 'bg-[#F5D547] text-[#1A1A1A]'
                : 'bg-[#E5E7EB] text-[#6B7280]'}"
              onclick={() => (confrontoView = 'bar')}
            >
              Barre
            </button>
            <button
              type="button"
              class="rounded-full px-2.5 py-1 text-xs font-medium {confrontoView === 'line'
                ? 'bg-[#F5D547] text-[#1A1A1A]'
                : 'bg-[#E5E7EB] text-[#6B7280]'}"
              onclick={() => (confrontoView = 'line')}
            >
              Linee
            </button>
            <button
              type="button"
              class="rounded-full px-2.5 py-1 text-xs font-medium {confrontoView === 'area'
                ? 'bg-[#F5D547] text-[#1A1A1A]'
                : 'bg-[#E5E7EB] text-[#6B7280]'}"
              onclick={() => (confrontoView = 'area')}
            >
              Area
            </button>
            <button
              type="button"
              class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5 ml-1"
              onclick={exportConfronto}
              aria-label="Esporta CSV"
            >
              <Download class="h-4 w-4" />
            </button>
          </div>
        </div>
        <p class="text-2xl font-bold {variazionePercentuale >= 0 ? 'text-green-600' : 'text-rose-600'} mb-4">
          {variazionePercentuale >= 0 ? '+' : ''}{variazionePercentuale.toFixed(1)}% vs anno precedente
        </p>
        <div class="h-48">
          {#if confrontoView === 'bar'}
            <BarChart config={confrontoBarConfig} />
          {:else}
            <LineChart config={confrontoChartConfig} />
          {/if}
        </div>
      </Card>

      <!-- 4. Vendite per Canale -->
      <Card>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Vendite per Canale</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5"
            onclick={exportCanale}
            aria-label="Esporta CSV"
          >
            <Download class="h-4 w-4" />
          </button>
        </div>
        <div class="h-48">
          <DonutChart config={canaleDonutConfig} />
        </div>
      </Card>

      <!-- 5. Top Prodotti -->
      <Card>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Top Prodotti</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5"
            onclick={exportTopProdotti}
            aria-label="Esporta CSV"
          >
            <Download class="h-4 w-4" />
          </button>
        </div>
        <div class="space-y-2">
          {#each topProdotti as p}
            {@const maxVal = topProdotti[0]?.fatturato ?? 1}
            {@const pct = maxVal > 0 ? (p.fatturato / maxVal) * 100 : 0}
            <div>
              <div class="flex justify-between text-xs mb-0.5">
                <span class="font-medium text-[#1A1A1A] truncate">{p.nome}</span>
                <span class="text-[#6B7280]">{formatEuro(p.fatturato)}</span>
              </div>
              <div class="h-2 rounded-full bg-[#E5E7EB] overflow-hidden">
                <div
                  class="h-full rounded-full bg-[#F5D547] transition-all"
                  style="width: {pct}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
        {#if topProdotti.length === 0}
          <p class="py-8 text-center text-sm text-[#6B7280]">Nessun dato</p>
        {/if}
      </Card>

      <!-- 6. Top Agenti -->
      <Card>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Top Agenti</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5"
            onclick={exportTopAgenti}
            aria-label="Esporta CSV"
          >
            <Download class="h-4 w-4" />
          </button>
        </div>
        <div class="space-y-3">
          {#each topAgenti as a, i}
            <div class="flex items-center gap-3">
              <span
                class="h-8 w-8 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-xs font-medium"
              >
                {i + 1}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-[#1A1A1A] truncate">{a.nome}</p>
                <p class="text-xs text-[#6B7280]">{formatEuro(a.fatturato)} · {a.ordini} ordini</p>
              </div>
            </div>
          {/each}
        </div>
        {#if topAgenti.length === 0}
          <p class="py-8 text-center text-sm text-[#6B7280]">Nessun dato</p>
        {/if}
      </Card>

      <!-- 7. Sales Trend -->
      <Card>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Sales Trend</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5"
            onclick={exportSalesTrend}
            aria-label="Esporta CSV"
          >
            <Download class="h-4 w-4" />
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2 mb-4 text-xs">
          <div class="rounded-xl bg-[#FFF3CD] p-2">
            <p class="text-[#6B7280]">Data points</p>
            <p class="font-bold text-[#1A1A1A]">{salesTrendStats.count}</p>
          </div>
          <div class="rounded-xl bg-[#FFF3CD] p-2">
            <p class="text-[#6B7280]">Min</p>
            <p class="font-bold text-[#1A1A1A]">{formatEuro(salesTrendStats.min)}</p>
          </div>
          <div class="rounded-xl bg-[#FFF3CD] p-2">
            <p class="text-[#6B7280]">Max</p>
            <p class="font-bold text-[#1A1A1A]">{formatEuro(salesTrendStats.max)}</p>
          </div>
          <div class="rounded-xl bg-[#FFF3CD] p-2">
            <p class="text-[#6B7280]">Media</p>
            <p class="font-bold text-[#1A1A1A]">{formatEuro(salesTrendStats.media)}</p>
          </div>
        </div>
        <div class="h-36">
          <LineChart config={salesTrendLineConfig} />
        </div>
      </Card>

      <!-- 8. Top Clienti -->
      <Card>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Top Clienti</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5"
            onclick={exportTopClienti}
            aria-label="Esporta CSV"
          >
            <Download class="h-4 w-4" />
          </button>
        </div>
        <div class="space-y-2">
          {#each topClienti as c}
            <div class="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
              <div class="min-w-0">
                <p class="text-sm font-medium text-[#1A1A1A] truncate">{c.nome}</p>
                <span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#E5E7EB] text-[#6B7280]">
                  {TIPO_LABELS[c.tipo as keyof typeof TIPO_LABELS] ?? c.tipo}
                </span>
              </div>
              <span class="text-sm font-bold text-[#1A1A1A] flex-shrink-0 ml-2">{formatEuro(c.fatturato)}</span>
            </div>
          {/each}
        </div>
        {#if topClienti.length === 0}
          <p class="py-8 text-center text-sm text-[#6B7280]">Nessun dato</p>
        {/if}
      </Card>
    </div>
  {/if}
</div>
