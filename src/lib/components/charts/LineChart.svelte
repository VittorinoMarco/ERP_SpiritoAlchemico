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

  export let config: Omit<ChartConfiguration<'line'>, 'type'>;

  let canvas: HTMLCanvasElement;
  let chart: Chart<'line'> | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'line',
      ...config
    });
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<canvas bind:this={canvas} class="w-full h-full"></canvas>

