<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    Chart,
    type ChartConfiguration,
    ArcElement,
    DoughnutController,
    Tooltip,
    Legend
  } from 'chart.js';

  Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

  export let config: Omit<ChartConfiguration<'doughnut'>, 'type'>;

  let canvas: HTMLCanvasElement;
  let chart: Chart<'doughnut'> | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'doughnut',
      ...config
    });
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<canvas bind:this={canvas} class="w-full h-full"></canvas>

