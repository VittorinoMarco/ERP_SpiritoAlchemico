<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    Chart,
    type ChartConfiguration,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
  } from 'chart.js';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

  export let config: Omit<ChartConfiguration<'bar'>, 'type'>;

  let canvas: HTMLCanvasElement;
  let chart: Chart<'bar'> | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'bar',
      ...config
    });
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<canvas bind:this={canvas} class="w-full h-full"></canvas>

