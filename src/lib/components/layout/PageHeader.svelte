<script lang="ts">
  export let titolo: string;
  export let sottotitolo: string | undefined = undefined;
</script>

<section class="mb-5 lg:mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    <h1 class="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1A1A1A] tracking-tight">
      {titolo}
    </h1>
    {#if sottotitolo}
      <p class="mt-1.5 text-sm text-[#6B7280] max-w-2xl">
        {sottotitolo}
      </p>
    {/if}
  </div>
  <!-- Azioni della pagina (bottoni, filtri rapidi…) -->
  <div class="flex flex-wrap items-center gap-2 empty:hidden">
    <slot />
  </div>
</section>
