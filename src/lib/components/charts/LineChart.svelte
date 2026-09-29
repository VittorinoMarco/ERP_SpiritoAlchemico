<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    Chart,
    type ChartConfiguration,
    LineController,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
  } from 'chart.js';

  Chart.register(
    LineController,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
  );

  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = '#6B7280';

  export let config: Omit<ChartConfiguration<'line'>, 'type'>;

  let canvas: HTMLCanvasElement;
  let chart: Chart<'line'> | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'line',
      ...config,
      options: { responsive: true, maintainAspectRatio: false, ...(config.options as object) }
    } as never);
  });

  // Aggiorna il grafico quando cambiano i dati senza doverlo ricreare
  $: if (chart && config) {
    chart.data = config.data as never;
    chart.update();
  }

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<div class="relative w-full h-full"><canvas bind:this={canvas}></canvas></div>

