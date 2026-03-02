<script lang="ts">
  import type { SvelteComponent } from 'svelte';

  export let label: string;
  export let valore: string;
  export let trend: 'up' | 'down' | 'flat' | null = null;
  export let trendLabel: string | null = null;
  // Tipizzato in modo ampio per supportare icone come lucide-svelte
  export let icon: typeof SvelteComponent<any> | null = null;
</script>

<div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6 flex items-start justify-between gap-4">
  <div>
    <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
      {label}
    </p>
    <p class="mt-2 text-3xl lg:text-4xl font-bold text-[#1A1A1A]">
      {valore}
    </p>

    {#if trend !== null && trendLabel}
      <div class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-medium text-[#374151]">
        {#if trend === 'up'}
          <span class="text-emerald-600">▲</span>
        {:else if trend === 'down'}
          <span class="text-rose-600">▼</span>
        {:else}
          <span class="text-[#6B7280]">■</span>
        {/if}
        <span>{trendLabel}</span>
      </div>
    {/if}
  </div>

  {#if icon}
    <div class="h-11 w-11 rounded-2xl bg-[#1A1A1A] text-white flex items-center justify-center shadow-sm">
      <svelte:component this={icon} class="h-5 w-5" />
    </div>
  {/if}
</div>

