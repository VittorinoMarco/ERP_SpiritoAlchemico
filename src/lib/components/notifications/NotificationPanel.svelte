<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { notificationsStore, type Notification, type NotificationTipo } from '$lib/stores/notifications';
  import { AlertTriangle, FileWarning, Clock, CheckCheck } from 'lucide-svelte';

  export let open = false;
  export let onclose: () => void = () => {};

  let items: Notification[] = [];
  const unsubItems = notificationsStore.subscribe((v) => (items = v));
  onDestroy(unsubItems);

  function formatRelative(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 1) return 'ora';
    if (diffMin < 60) return `${diffMin} min fa`;
    if (diffH < 24) return `${diffH} ora fa`;
    if (diffD < 7) return `${diffD} giorni fa`;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  }

  function iconFor(tipo: NotificationTipo) {
    if (tipo === 'sotto_scorta') return AlertTriangle;
    if (tipo === 'fattura_scaduta') return FileWarning;
    return Clock;
  }

  function iconColor(tipo: NotificationTipo): string {
    if (tipo === 'sotto_scorta') return 'text-amber-500';
    if (tipo === 'fattura_scaduta') return 'text-red-500';
    return 'text-yellow-600';
  }

  function markReadAndGo(id: string, link: string) {
    notificationsStore.setRead(id);
    onclose();
    goto(link);
  }

  function markAllRead() {
    notificationsStore.setAllRead();
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-40"
    role="presentation"
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
    tabindex="-1"
  ></div>
  <div
    class="absolute right-0 top-full mt-2 z-50 w-96 max-h-[28rem] flex flex-col rounded-3xl shadow-xl bg-white border border-black/5 overflow-hidden"
    role="dialog"
    aria-label="Notifiche"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-black/5">
      <h3 class="text-sm font-semibold text-[#1A1A1A]">Notifiche</h3>
      <button
        type="button"
        class="text-xs font-medium text-[#6B7280] hover:text-[#1A1A1A] transition-colors"
        onclick={markAllRead}
      >
        <CheckCheck class="h-4 w-4 inline mr-1" />
        Segna tutte lette
      </button>
    </div>
    <div class="flex-1 overflow-y-auto max-h-80">
      {#if items.length === 0}
        <p class="px-4 py-8 text-sm text-[#6B7280] text-center">Nessuna notifica</p>
      {:else}
        {#each items as item (item.id)}
          <button
            type="button"
            class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#FFF8E7] transition-colors border-b border-black/5 last:border-0"
            onclick={() => markReadAndGo(item.id, item.link)}
          >
            <span class="flex-shrink-0 mt-0.5 {iconColor(item.tipo)}">
              <svelte:component this={iconFor(item.tipo)} class="h-5 w-5" />
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-[#1A1A1A] truncate">{item.titolo}</p>
              <p class="text-xs text-[#6B7280] mt-0.5">{formatRelative(item.created)}</p>
            </div>
          </button>
        {/each}
      {/if}
    </div>
    <div class="border-t border-black/5 px-4 py-2">
      <a
        href="/attivita"
        class="block text-center text-sm font-medium text-[#1A1A1A] hover:text-[#F5D547] transition-colors py-2"
        onclick={(e) => {
          e.preventDefault();
          onclose();
          goto('/attivita');
        }}
      >
        Vedi tutte
      </a>
    </div>
  </div>
{/if}
