<script lang="ts">
  import type { SvelteComponent } from 'svelte';

  export let titolo: string;
  export let testo: string | undefined = undefined;
  export let icon: typeof SvelteComponent<any> | null = null;
</script>

<div class="flex flex-col items-center justify-center text-center px-6 py-14">
  {#if icon}
    <div class="h-14 w-14 rounded-3xl bg-[#FFF3CD] text-[#1A1A1A] flex items-center justify-center mb-4">
      <svelte:component this={icon} class="h-6 w-6" />
    </div>
  {/if}
  <p class="text-base font-semibold text-[#1A1A1A]">{titolo}</p>
  {#if testo}
    <p class="mt-1.5 text-sm text-[#6B7280] max-w-sm">{testo}</p>
  {/if}
  <div class="mt-5 empty:hidden">
    <slot />
  </div>
</div>
