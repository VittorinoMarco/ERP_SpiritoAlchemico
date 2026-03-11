<script lang="ts">
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import {
    FileText,
    Package,
    ShoppingCart,
    LogIn,
    ArrowRightLeft,
    Filter
  } from 'lucide-svelte';

  type ActivityRecord = {
    id: string;
    created: string;
    utente?: string;
    azione: string;
    collection_rif?: string;
    record_rif?: string;
    dettagli: string;
    expand?: {
      utente?: { nome?: string; cognome?: string; email?: string };
    };
  };

  const AZIONE_LABELS: Record<string, string> = {
    creato: 'Ordine creato',
    ordine_creato: 'Ordine creato',
    confermato: 'Ordine confermato',
    stato_cambiato: 'Stato ordine cambiato',
    fattura_generata: 'Fattura generata',
    webhook_ecommerce: 'Webhook e-commerce',
    movimento_magazzino: 'Movimento magazzino',
    login: 'Login'
  };

  const AZIONE_ICONS: Record<string, typeof FileText> = {
    creato: ShoppingCart,
    ordine_creato: ShoppingCart,
    confermato: ShoppingCart,
    stato_cambiato: ArrowRightLeft,
    fattura_generata: FileText,
    webhook_ecommerce: ShoppingCart,
    movimento_magazzino: Package,
    login: LogIn
  };

  const AZIONE_COLORS: Record<string, string> = {
    creato: 'bg-[#F5D547] text-[#1A1A1A]',
    ordine_creato: 'bg-[#F5D547] text-[#1A1A1A]',
    confermato: 'bg-green-100 text-green-700',
    stato_cambiato: 'bg-blue-100 text-blue-700',
    fattura_generata: 'bg-purple-100 text-purple-700',
    webhook_ecommerce: 'bg-amber-100 text-amber-700',
    movimento_magazzino: 'bg-sky-100 text-sky-700',
    login: 'bg-gray-100 text-gray-700'
  };

  let activities: ActivityRecord[] = [];
  let users: { id: string; name?: string }[] = [];
  let loading = true;
  let filterUtente = '';
  let filterAzione = '';
  let filterDateFrom = '';
  let filterDateTo = '';

  onMount(async () => {
    try {
      const [logList, usersList] = await Promise.all([
        pb.collection('activity_log').getFullList({
          expand: 'utente',
          sort: '-created'
        }),
        pb.collection('users').getFullList({ fields: 'id,nome,cognome,email' })
      ]);
      activities = logList as ActivityRecord[];
      users = usersList.map((u: any) => ({
        id: u.id,
        name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email
      }));
    } catch {
      activities = [];
      users = [];
    } finally {
      loading = false;
    }
  });

  $: filteredActivities = activities.filter((a) => {
    const matchUtente = !filterUtente || a.utente === filterUtente;
    const matchAzione = !filterAzione || a.azione === filterAzione;
    let matchDate = true;
    if (filterDateFrom || filterDateTo) {
      const d = a.created ? new Date(a.created).getTime() : 0;
      if (filterDateFrom && d < new Date(filterDateFrom).getTime()) matchDate = false;
      if (filterDateTo && d > new Date(filterDateTo + 'T23:59:59').getTime()) matchDate = false;
    }
    return matchUtente && matchAzione && matchDate;
  });

  $: azioniUniche = [...new Set(activities.map((a) => a.azione))].filter(Boolean).sort();

  function formatRelative(dateStr: string): string {
    if (!dateStr) return '—';
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
    return d.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function userLabel(a: ActivityRecord): string {
    const u = a.expand?.utente;
    if (!u) return 'Sistema';
    if (u.nome) return [u.nome, u.cognome].filter(Boolean).join(' ');
    return u.email ?? 'Utente';
  }

  function actionText(a: ActivityRecord): string {
    let dettagli: { messaggio?: string; order_id?: string } = {};
    try {
      dettagli = JSON.parse(a.dettagli || '{}');
    } catch {
      // ignore
    }
    const msg = dettagli.messaggio ?? dettagli.order_id ?? '';
    if (msg) return msg;
    const label = AZIONE_LABELS[a.azione] ?? a.azione;
    if (a.collection_rif === 'orders' && a.record_rif) {
      return `${label} #${a.record_rif.slice(0, 8)}`;
    }
    return label;
  }

  function getIcon(azione: string) {
    return AZIONE_ICONS[azione] ?? FileText;
  }

  function getColor(azione: string) {
    return AZIONE_COLORS[azione] ?? 'bg-gray-100 text-gray-700';
  }
</script>

<svelte:head>
  <title>Registro Attività | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Registro Attività</h1>

  <Card>
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <div class="flex items-center gap-2 text-sm text-[#6B7280]">
        <Filter class="h-4 w-4" />
        Filtri
      </div>
      <select
        bind:value={filterUtente}
        class="rounded-2xl border border-black/5 bg-white/80 px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5D547]"
      >
        <option value="">Tutti gli utenti</option>
        {#each users as u}
          <option value={u.id}>{u.name ?? u.id}</option>
        {/each}
      </select>
      <select
        bind:value={filterAzione}
        class="rounded-2xl border border-black/5 bg-white/80 px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5D547]"
      >
        <option value="">Tutti i tipi</option>
        {#each azioniUniche as az}
          <option value={az}>{AZIONE_LABELS[az] ?? az}</option>
        {/each}
      </select>
      <input
        type="date"
        bind:value={filterDateFrom}
        class="rounded-2xl border border-black/5 bg-white/80 px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5D547]"
        placeholder="Da"
      />
      <input
        type="date"
        bind:value={filterDateTo}
        class="rounded-2xl border border-black/5 bg-white/80 px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5D547]"
        placeholder="A"
      />
    </div>

    {#if loading}
      <p class="text-sm text-[#6B7280] py-8">Caricamento...</p>
    {:else if filteredActivities.length === 0}
      <p class="text-sm text-[#6B7280] py-8">Nessuna attività registrata.</p>
    {:else}
      <div class="relative">
        <div class="absolute left-6 top-0 bottom-0 w-px bg-black/5"></div>
        <div class="space-y-4">
          {#each filteredActivities as activity (activity.id)}
            <div class="relative flex gap-4">
              <div
                class="flex-shrink-0 mt-1 w-12 h-12 rounded-full flex items-center justify-center {getColor(activity.azione)} z-10"
              >
                <svelte:component this={getIcon(activity.azione)} class="h-5 w-5" />
              </div>
              <Card class="flex-1 !p-4 !rounded-3xl">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="text-sm font-medium text-[#1A1A1A]">
                      <span class="font-semibold">{userLabel(activity)}</span>
                      <span class="text-[#6B7280]"> {actionText(activity)}</span>
                    </p>
                    <p class="text-xs text-[#6B7280] mt-1">
                      {formatRelative(activity.created)}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </Card>
</div>
