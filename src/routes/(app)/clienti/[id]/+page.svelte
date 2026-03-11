<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import KpiCard from '$lib/components/layout/KpiCard.svelte';
  import ClientModal from '$lib/components/clients/ClientModal.svelte';
  import type { Client, ClientTipo } from '$lib/types/client';
  import { TIPO_LABELS, TIPO_BADGE_COLORS } from '$lib/types/client';
  import { ArrowLeft, Edit, MapPin, Receipt, FileText } from 'lucide-svelte';

  const clientId = $page.params.id;

  let client: (Client & { expand?: { agente?: { id: string; name?: string; email?: string; nome?: string; cognome?: string } } }) | null = null;
  let orders: { id: string; numero_ordine?: string; data_ordine?: string; stato?: string; totale?: number }[] = [];
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let modalOpen = false;
  export let data: { user?: { id?: string; role?: string } | null } = { user: null };
  $: user = data.user ?? (pb.authStore.model as { id?: string; role?: string } | null);
  $: isAdmin = (user?.role || (user as any)?.ruolo) === 'admin';
  $: totaleFatturato = orders.reduce((s, o) => s + (Number(o.totale) || 0), 0);
  $: ordiniTotali = orders.length;
  $: mediaOrdine = ordiniTotali > 0 ? totaleFatturato / ordiniTotali : 0;

  onMount(async () => {
    try {
      client = await pb.collection('clients').getOne(clientId, { expand: 'agente' });

      const ordersList = await pb.collection('orders').getFullList({
        filter: `cliente = "${clientId}"`,
        sort: '-data_ordine'
      });
      orders = ordersList;

      if (isAdmin) {
        const usersList = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
        agents = usersList.map((u: any) => ({
          id: u.id,
          name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email,
          email: u.email
        }));
      }
    } catch {
      client = null;
      orders = [];
    } finally {
      loading = false;
    }
  });

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function handleSaved() {
    pb.collection('clients')
      .getOne(clientId, { expand: 'agente' })
      .then((c) => {
        client = c;
      });
    modalOpen = false;
  }

  async function changeAgente(newAgenteId: string) {
    if (!client || !isAdmin) return;
    try {
      client = await pb.collection('clients').update(clientId, {
        agente: newAgenteId || undefined
      }) as typeof client;
      client = await pb.collection('clients').getOne(clientId, { expand: 'agente' }) as typeof client;
    } catch {
      // ignore
    }
  }
</script>

<svelte:head>
  <title>{client?.ragione_sociale ?? 'Cliente'} | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="p-2 rounded-2xl text-[#6B7280] hover:bg-black/5 transition-colors"
      onclick={() => goto('/clienti')}
      aria-label="Indietro"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">
      {client?.ragione_sociale ?? 'Cliente'}
    </h1>
  </div>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else if !client}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Cliente non trovato</p>
        <Button variant="ghost" className="mt-4" onclick={() => goto('/clienti')}>
          Torna ai clienti
        </Button>
      </div>
    </Card>
  {:else}
    <div class="page-grid">
      <!-- Card dati anagrafici -->
      <Card className="lg:col-span-2">
        <div class="flex items-start justify-between mb-4">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Dati anagrafici</h2>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-2xl"
            onclick={() => (modalOpen = true)}
          >
            <Edit class="h-4 w-4" />
            Modifica
          </Button>
        </div>
        <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div class="flex justify-between sm:block sm:space-x-2">
            <dt class="text-sm text-[#6B7280]">Tipo</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {TIPO_BADGE_COLORS[
                  client.tipo as ClientTipo
                ] ?? 'bg-gray-100 text-gray-800'}"
              >
                {TIPO_LABELS[client.tipo as ClientTipo] ?? client.tipo}
              </span>
            </dd>
          </div>
          <div class="flex justify-between sm:block sm:space-x-2">
            <dt class="text-sm text-[#6B7280]">Partita IVA</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{client.partita_iva ?? '—'}</dd>
          </div>
          <div class="flex justify-between sm:block sm:space-x-2">
            <dt class="text-sm text-[#6B7280]">Codice SDI</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{client.codice_sdi ?? '—'}</dd>
          </div>
          <div class="flex justify-between sm:block sm:space-x-2">
            <dt class="text-sm text-[#6B7280]">PEC</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{client.pec ?? '—'}</dd>
          </div>
          <div class="flex justify-between sm:block sm:space-x-2 sm:col-span-2">
            <dt class="text-sm text-[#6B7280]">Indirizzo</dt>
            <dd class="text-sm font-medium text-[#1A1A1A] text-right sm:text-left">
              {#if client.indirizzo || client.citta}
                <span class="inline-flex items-center gap-1">
                  <MapPin class="h-3.5 w-3.5 text-[#9CA3AF] flex-shrink-0" />
                  {[client.indirizzo, client.citta, client.cap, client.provincia]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </span>
              {:else}
                —
              {/if}
            </dd>
          </div>
          <div class="flex justify-between sm:block sm:space-x-2">
            <dt class="text-sm text-[#6B7280]">Telefono</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{client.telefono ?? '—'}</dd>
          </div>
          <div class="flex justify-between sm:block sm:space-x-2">
            <dt class="text-sm text-[#6B7280]">Email</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{client.email ?? '—'}</dd>
          </div>
          {#if isAdmin}
            <div class="flex justify-between sm:block sm:space-x-2 sm:col-span-2">
              <dt class="text-sm text-[#6B7280]">Agente</dt>
              <dd class="text-sm font-medium text-[#1A1A1A]">
                <select
                  class="rounded-2xl border border-black/5 bg-white/80 px-3 py-1.5 text-sm focus:visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547]"
                  value={client.agente ?? ''}
                  onchange={(e) => changeAgente((e.target as HTMLSelectElement).value)}
                >
                  <option value="">Nessun agente</option>
                  {#each agents as a}
                    <option value={a.id}>{a.name || a.email || a.id}</option>
                  {/each}
                </select>
              </dd>
            </div>
          {:else if client.expand?.agente}
            <div class="flex justify-between sm:block sm:space-x-2 sm:col-span-2">
              <dt class="text-sm text-[#6B7280]">Agente</dt>
              <dd class="text-sm font-medium text-[#1A1A1A]">
                {client.expand.agente.nome
                  ? [client.expand.agente.nome, client.expand.agente.cognome].filter(Boolean).join(' ')
                  : client.expand.agente.email ?? '—'}
              </dd>
            </div>
          {/if}
        </dl>
      </Card>

      <!-- Card KPI -->
      <div class="space-y-4">
        <KpiCard
          label="Totale fatturato"
          valore={formatEuro(totaleFatturato)}
          icon={Receipt}
        />
        <KpiCard
          label="Ordini totali"
          valore={String(ordiniTotali)}
          icon={FileText}
        />
        <KpiCard label="Media ordine" valore={formatEuro(mediaOrdine)} icon={null} />
      </div>

      <!-- Card storico ordini -->
      <Card className="lg:col-span-2">
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Storico ordini</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-black/5">
                <th class="px-3 py-2 text-left text-xs font-medium text-[#6B7280]">N. Ordine</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-[#6B7280]">Data</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-[#6B7280]">Stato</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-[#6B7280]">Totale</th>
              </tr>
            </thead>
            <tbody>
              {#each orders.slice(0, 10) as o}
                <tr class="border-b border-black/5 last:border-0 hover:bg-[#FFFDE7] transition-colors">
                  <td class="px-3 py-2 font-medium text-[#1A1A1A]">{o.numero_ordine ?? '—'}</td>
                  <td class="px-3 py-2 text-[#6B7280]">{formatDate(o.data_ordine)}</td>
                  <td class="px-3 py-2">
                    <span
                      class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {o.stato === 'consegnato'
                        ? 'bg-green-100 text-green-800'
                        : o.stato === 'annullato'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-amber-100 text-amber-800'}"
                    >
                      {o.stato ?? '—'}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right font-medium text-[#1A1A1A]">
                    {formatEuro(Number(o.totale) || 0)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if orders.length === 0}
          <p class="py-8 text-center text-sm text-[#6B7280]">Nessun ordine</p>
        {:else if orders.length > 10}
          <p class="mt-2 text-xs text-[#6B7280]">Mostrati gli ultimi 10 ordini</p>
        {/if}
      </Card>

      <!-- Card note -->
      <Card>
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Note e comunicazioni</h2>
        {#if client.note}
          <div class="text-sm text-[#1A1A1A] prose prose-sm max-w-none">
            {@html client.note}
          </div>
        {:else}
          <p class="text-sm text-[#6B7280]">Nessuna nota</p>
        {/if}
      </Card>
    </div>
  {/if}
</div>

{#if client}
  <ClientModal
    open={modalOpen}
    client={client}
    agents={agents}
    isAdmin={isAdmin}
    on:close={() => (modalOpen = false)}
    on:saved={handleSaved}
  />
{/if}
