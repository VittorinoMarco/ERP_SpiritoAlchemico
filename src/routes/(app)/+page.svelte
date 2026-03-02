<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import KpiCard from '$lib/components/layout/KpiCard.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import { Package2, Users, Receipt } from 'lucide-svelte';
  import type { ChartConfiguration } from 'chart.js';

  const barConfig: Omit<ChartConfiguration<'bar'>, 'type'> = {
    data: {
      labels: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'],
      datasets: [
        {
          label: 'Fatturato',
          data: [12, 19, 14, 20, 16],
          backgroundColor: '#F5D547',
          borderRadius: 6
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          grid: {
            color: '#E5E7EB'
          }
        }
      }
    }
  };

  const lineConfig: Omit<ChartConfiguration<'line'>, 'type'> = {
    data: {
      labels: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu'],
      datasets: [
        {
          label: 'Clienti attivi',
          data: [120, 135, 150, 165, 180, 195],
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
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          grid: {
            color: '#E5E7EB'
          }
        }
      }
    }
  };

  const donutConfig: Omit<ChartConfiguration<'doughnut'>, 'type'> = {
    data: {
      labels: ['Nuovi', 'Ricorrenti', 'Inattivi'],
      datasets: [
        {
          data: [45, 35, 20],
          backgroundColor: ['#F5D547', '#1A1A1A', '#E5E7EB'],
          borderWidth: 0
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      cutout: '70%'
    }
  };
</script>

<PageHeader
  titolo="Dashboard ERP"
  sottotitolo="Panoramica sintetica delle performance di Spirito Alchemico."
/>

<section class="page-grid mb-6 lg:mb-8">
  <KpiCard
    label="Fatturato mensile"
    valore="€ 124.500"
    trend="up"
    trendLabel="+12% vs mese scorso"
    icon={Receipt}
  />
  <KpiCard
    label="Prodotti attivi"
    valore="382"
    trend="flat"
    trendLabel="Stabile rispetto a ieri"
    icon={Package2}
  />
  <KpiCard
    label="Clienti attivi"
    valore="1.245"
    trend="up"
    trendLabel="+8% ultimi 30 giorni"
    icon={Users}
  />
</section>

<section class="page-grid">
  <Card className="col-span-2 min-h-[260px]">
    <h2 class="text-sm font-medium text-[#1A1A1A] mb-2">
      Andamento fatturato settimanale
    </h2>
    <p class="text-xs text-[#6B7280] mb-4">
      Dettaglio giornaliero delle vendite registrate.
    </p>
    <div class="h-56">
      <BarChart config={barConfig} />
    </div>
  </Card>

  <Card className="min-h-[260px]">
    <h2 class="text-sm font-medium text-[#1A1A1A] mb-2">
      Distribuzione clienti
    </h2>
    <p class="text-xs text-[#6B7280] mb-4">
      Suddivisione tra nuovi, ricorrenti e inattivi.
    </p>
    <div class="h-56">
      <DonutChart config={donutConfig} />
    </div>
  </Card>

  <Card className="col-span-2 min-h-[260px]">
    <h2 class="text-sm font-medium text-[#1A1A1A] mb-2">
      Trend clienti attivi
    </h2>
    <p class="text-xs text-[#6B7280] mb-4">
      Evoluzione della base clienti negli ultimi mesi.
    </p>
    <div class="h-56">
      <LineChart config={lineConfig} />
    </div>
  </Card>
</section>

