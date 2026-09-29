<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  export let page = 1;
  export let total = 0;
  export let perPage = 15;
  export let label = 'risultati';

  $: totalPages = Math.max(1, Math.ceil(total / perPage));
  $: if (page > totalPages) page = totalPages;
  $: from = total === 0 ? 0 : (page - 1) * perPage + 1;
  $: to = Math.min(total, page * perPage);
</script>

{#if total > 0}
  <div class="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-black/5">
    <p class="text-xs sm:text-sm text-[#6B7280]">
      <span class="hidden sm:inline">{from}–{to} di </span><strong class="text-[#1A1A1A]">{total}</strong> {label}
    </p>
    {#if totalPages > 1}
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white border border-black/[0.07] text-[#1A1A1A] disabled:opacity-40 hover:bg-[#FFFDE7] transition-colors"
          disabled={page <= 1}
          onclick={() => (page = Math.max(1, page - 1))}
          aria-label="Pagina precedente"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <span class="text-sm tabular-nums px-2 text-[#1A1A1A]">{page} / {totalPages}</span>
        <button
          type="button"
          class="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white border border-black/[0.07] text-[#1A1A1A] disabled:opacity-40 hover:bg-[#FFFDE7] transition-colors"
          disabled={page >= totalPages}
          onclick={() => (page = Math.min(totalPages, page + 1))}
          aria-label="Pagina successiva"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
    {/if}
  </div>
{/if}
