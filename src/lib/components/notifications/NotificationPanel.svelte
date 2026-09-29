<script lang="ts">
  import { goto } from '$app/navigation';
  import { notificationsStore, type Notification, type NotificationTipo } from '$lib/stores/notifications';
  import { AlertTriangle, FileWarning, Clock, CheckCheck, BellOff } from 'lucide-svelte';

  export let open = false;
  export let onclose: () => void = () => {};

  const readIds = notificationsStore.readIds;

  function formatRelative(dateStr: string): string {
    const d = new Date(dateStr);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 1) return 'ora';
    if (diffMin < 60) return `${diffMin} min fa`;
    if (diffH < 24) return `${diffH} ${diffH === 1 ? 'ora' : 'ore'} fa`;
    if (diffD < 7) return `${diffD} ${diffD === 1 ? 'giorno' : 'giorni'} fa`;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  }

  function iconFor(tipo: NotificationTipo) {
    if (tipo === 'sotto_scorta') return AlertTriangle;
    if (tipo === 'fattura_scaduta') return FileWarning;
    return Clock;
  }

  function tone(tipo: NotificationTipo): string {
    if (tipo === 'sotto_scorta') return 'bg-orange-100 text-orange-600';
    if (tipo === 'fattura_scaduta') return 'bg-rose-100 text-rose-600';
    return 'bg-[#FFF3CD] text-yellow-700';
  }

  function markReadAndGo(item: Notification) {
    notificationsStore.setRead(item.id);
    onclose();
    goto(item.link);
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && onclose()} />

{#if open}
  <div class="fixed inset-0 z-[55]" role="presentation" onclick={onclose}></div>
  <div
    class="fade-in fixed inset-x-3 top-[calc(var(--topbar-h)+0.25rem)] z-[56] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem] max-h-[70dvh] flex flex-col rounded-[28px] bg-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] border border-black/5 overflow-hidden"
    role="dialog"
    aria-label="Notifiche"
  >
    <div class="flex items-center justify-between px-5 py-4 border-b border-black/5">
      <h3 class="text-sm font-semibold text-[#1A1A1A]">Notifiche</h3>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280] hover:text-[#1A1A1A] transition-colors min-h-[32px]"
        onclick={() => notificationsStore.setAllRead()}
      >
        <CheckCheck class="h-4 w-4" />
        Segna tutte lette
      </button>
    </div>
    <div class="flex-1 overflow-y-auto overscroll-contain">
      {#if $notificationsStore.length === 0}
        <div class="px-4 py-12 text-center">
          <BellOff class="h-8 w-8 mx-auto text-[#D1D5DB] mb-2" />
          <p class="text-sm text-[#6B7280]">Nessuna notifica</p>
        </div>
      {:else}
        {#each $notificationsStore as item (item.id)}
          {@const unread = !$readIds.has(item.id)}
          <button
            type="button"
            class="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-[#FFFDE7] transition-colors border-b border-black/5 last:border-0"
            onclick={() => markReadAndGo(item)}
          >
            <span class="flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center {tone(item.tipo)}">
              <svelte:component this={iconFor(item.tipo)} class="h-4.5 w-4.5" />
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-[#1A1A1A] {unread ? 'font-semibold' : 'font-normal text-[#4B5563]'} line-clamp-2">
                {item.titolo}
              </p>
              <p class="text-xs text-[#9CA3AF] mt-0.5">{formatRelative(item.created)}</p>
            </div>
            {#if unread}
              <span class="mt-1.5 h-2 w-2 rounded-full bg-[#F5D547] flex-shrink-0" aria-label="Non letta"></span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
    <div class="border-t border-black/5 px-4 py-2">
      <a
        href="/attivita"
        class="block text-center text-sm font-medium text-[#1A1A1A] hover:underline py-2"
        onclick={(e) => {
          e.preventDefault();
          onclose();
          goto('/attivita');
        }}
      >
        Vedi tutta l'attività
      </a>
    </div>
  </div>
{/if}
