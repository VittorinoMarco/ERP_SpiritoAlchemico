<script lang="ts">
  import { currentRole } from '$lib/stores/auth';
  import type { OrderStato } from '$lib/types/order';
  import { STATO_LABELS, STATO_BADGE_COLORS } from '$lib/types/order';
  import Spinner from '$lib/components/ui/Spinner.svelte';
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
  import { ArrowLeft, Edit, MapPin, Receipt, FileText, Trash2, Plus } from 'lucide-svelte';

  const clientId = $page.params.id;

  let client: (Client & { expand?: { agente?: { id: string; name?: string; email?: string; nome?: string; cognome?: string } } }) | null = null;
  let orders: { id: string; numero_ordine?: string; data_ordine?: string; stato?: string; totale?: number }[] = [];
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let modalOpen = false;
  let deleting = false;
  export let data: { user?: { id?: string; role?: string } | null } = { user: null };
  $: user = data.user ?? (pb.authStore.model as { id?: string; role?: string } | null);
  $: isAdmin = (user?.role || (user as any)?.ruolo) === 'admin';
  // Bozze e annullati non sono fatturato
  $: validOrders = orders.filter((o) => o.stato !== 'annullato' && o.stato !== 'bozza');
  $: totaleFatturato = validOrders.reduce((s, o) => s + (Number(o.totale) || 0), 0);
  $: ordiniTotali = validOrders.length;
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
        client = c as any;
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

  async function handleDelete() {
    if (!client || !isAdmin || deleting) return;
    const msg =
      orders.length > 0
        ? `Il cliente "${client.ragione_sociale}" ha ${orders.length} ordini associati. Eliminare comunque?`
        : `Eliminare il cliente "${client.ragione_sociale}"?`;
    if (!confirm(msg)) return;
    deleting = true;
    try {
      await pb.collection('clients').delete(clientId);
      goto('/clienti');
    } catch (e) {
      alert((e as Error)?.message ?? 'Errore durante l\'eliminazione');
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head>
  <title>{client?.ragione_sociale ?? 'Cliente'} | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-5 fade-in">
  <div class="flex items-center gap-3">
    <button
      type="button"
      class="h-11 w-11 grid place-items-center rounded-2xl bg-white/80 border border-black/[0.06] hover:bg-white shrink-0"
      onclick={() => goto('/clienti')}
      aria-label="Torna ai clienti"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <div class="min-w-0 flex-1">
      <p class="text-xs text-[#6B7280]">Cliente</p>
      <h1 class="text-xl sm:text-3xl font-bold tracking-tight truncate">{client?.ragione_sociale ?? '…'}</h1>
    </div>
    {#if client && !loading}
      <div class="flex items-center gap-2 shrink-0">
        {#if $currentRole !== 'magazziniere'}
          <Button size="sm" onclick={() => goto(`/ordini/nuovo?cliente=${clientId}`)}>
            <Plus class="h-4 w-4" /><span class="hidden sm:inline">Nuovo ordine</span>
          </Button>
        {/if}
        {#if isAdmin}
          <Button variant="ghost" size="sm" className="!text-rose-600 hover:!bg-rose-50" onclick={handleDelete} disabled={deleting}>
            <Trash2 class="h-4 w-4" /><span class="hidden sm:inline">Elimina</span>
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  {#if loading}
    <Spinner />
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
                  class="field w-auto"
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
        <h2 class="text-sm font-semibold mb-3">Storico ordini</h2>
        {#if orders.length > 0}
          <ul class="divide-y divide-black/5 -mx-2">
            {#each orders.slice(0, 10) as o (o.id)}
              <li>
                <a href="/ordini/{o.id}" class="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 hover:bg-[#FFFDE7] transition-colors min-h-[52px]">
                  <span class="min-w-0">
                    <span class="block text-sm font-medium truncate">{o.numero_ordine ?? '—'}</span>
                    <span class="block text-xs text-[#6B7280]">{formatDate(o.data_ordine)}</span>
                  </span>
                  <span class="flex items-center gap-3 shrink-0">
                    <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[o.stato as OrderStato] ?? 'bg-gray-100'}">
                      {STATO_LABELS[o.stato as OrderStato] ?? o.stato ?? '—'}
                    </span>
                    <span class="text-sm font-semibold w-24 text-right">{formatEuro(Number(o.totale) || 0)}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
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
          <div class="text-sm text-[#1A1A1A] whitespace-pre-line break-words">
            {client.note}
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
