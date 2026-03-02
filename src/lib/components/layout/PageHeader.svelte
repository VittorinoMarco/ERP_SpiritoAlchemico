<script lang="ts">
  export let titolo: string;
  export let sottotitolo: string | undefined = undefined;
</script>

<section class="mb-6 lg:mb-8">
  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">
    {titolo}
  </h1>
  {#if sottotitolo}
    <p class="mt-2 text-sm text-[#6B7280]">
      {sottotitolo}
    </p>
  {/if}
</section>

