<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X } from 'lucide-svelte';

  export let open = false;
  export let title = '';
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'lg';

  const dispatch = createEventDispatcher<{ close: void }>();

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      dispatch('close');
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && dispatch('close')}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div
      class="w-full {sizeClasses[size]} rounded-3xl bg-white shadow-xl overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div class="flex items-center justify-between px-6 py-4 border-b border-black/5">
        <h2 id="modal-title" class="text-lg font-semibold text-[#1A1A1A]">
          {title}
        </h2>
        <button
          type="button"
          class="p-2 rounded-full text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A] transition-colors"
          onclick={() => dispatch('close')}
          aria-label="Chiudi"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
      <div class="p-6 max-h-[70vh] overflow-y-auto">
        <slot />
      </div>
    </div>
  </div>
{/if}
