<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { X } from 'lucide-svelte';

  export let open = false;
  export let title = '';
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'lg';

  const dispatch = createEventDispatcher<{ close: void }>();

  const sizeClasses = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl'
  };

  let panel: HTMLDivElement | null = null;
  let lockedScroll = false;

  function close() {
    dispatch('close');
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }

  // Blocca lo scroll della pagina sotto al modal; su mobile si comporta come bottom sheet.
  $: if (browser) {
    if (open && !lockedScroll) {
      document.body.style.overflow = 'hidden';
      lockedScroll = true;
      tick().then(() => panel?.focus());
    } else if (!open && lockedScroll) {
      document.body.style.overflow = '';
      lockedScroll = false;
    }
  }

  onDestroy(() => {
    if (browser && lockedScroll) document.body.style.overflow = '';
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/30 backdrop-blur-sm fade-in"
    onclick={handleBackdropClick}
    role="presentation"
  >
    <div
      bind:this={panel}
      class="sheet-up w-full {sizeClasses[
        size
      ]} max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-white shadow-2xl overflow-hidden outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
    >
      <div class="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-black/5 flex-shrink-0">
        <h2 id="modal-title" class="text-lg font-semibold text-[#1A1A1A] truncate">
          {title}
        </h2>
        <button
          type="button"
          class="h-10 w-10 inline-flex items-center justify-center rounded-full text-[#6B7280] hover:bg-black/5 hover:text-[#1A1A1A] transition-colors flex-shrink-0"
          onclick={close}
          aria-label="Chiudi"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
      <div class="p-5 sm:p-6 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <slot />
      </div>
    </div>
  </div>
{/if}
