<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let aperto = false;
  export let titolo: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ chiudi: void }>();

  const handleClose = () => {
    dispatch('chiudi');
  };
</script>

{#if aperto}
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-md px-4 py-8"
    role="dialog"
    aria-modal="true"
  >
    <div class="relative w-full max-w-lg rounded-3xl bg-white shadow-xl p-6 lg:p-7">
      <button
        type="button"
        class="absolute right-4 top-4 text-sm text-[#6B7280] hover:text-[#1A1A1A] transition-all duration-200"
        on:click={handleClose}
        aria-label="Chiudi"
      >
        ✕
      </button>

      {#if titolo}
        <h2 class="mb-3 text-lg font-semibold text-[#1A1A1A]">
          {titolo}
        </h2>
      {/if}

      <div class="mt-2">
        <slot />
      </div>
    </div>
  </div>
{/if}

