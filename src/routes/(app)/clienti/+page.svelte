<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ClientModal from '$lib/components/clients/ClientModal.svelte';
  import {
    Search,
    Plus,
    Download,
    ChevronLeft,
    ChevronRight,
    MapPin,
    ArrowUp,
    ArrowDown,
    Minus
  } from 'lucide-svelte';
  import type { Client, ClientTipo } from '$lib/types/client';
  import { TIPO_LABELS, TIPO_BADGE_COLORS } from '$lib/types/client';

  const TIPO_FILTERS: { value: ClientTipo | 'tutti'; label: string }[] = [
    { value: 'tutti', label: 'Tutti' },
    { value: 'horeca', label: 'HORECA' },
    { value: 'ecommerce', label: 'E-commerce' },
    { value: 'distributore', label: 'Distributore' }
  ];

  const ITEMS_PER_PAGE = 10;

  type SortKey = 'ragione_sociale' | 'tipo' | 'citta' | 'n_ordini' | 'ultimo_ordine';
  type SortDir = 'asc' | 'desc';

  let clients: (Client & { expand?: { agente?: { name?: string; email?: string } } })[] = [];
  let ordersByClient: Record<string, { count: number; lastDate: string | null }> = {};
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let search = '';
  let tipoFilter: ClientTipo | 'tutti' = 'tutti';
  let agenteFilter = '';
  let cittaFilter = '';
  let selectedIds = new Set<string>();
  let modalOpen = false;
  let editingClient: Client | null = null;
  let page = 1;
  let sortKey: SortKey = 'ragione_sociale';
  let sortDir: SortDir = 'asc';
  export let data: { user?: { id?: string; role?: string } | null } = { user: null };
  $: user = data.user ?? pb.authStore.model as { id?: string; role?: string } | null;
  $: isAdmin = (user?.role || (user as any)?.ruolo) === 'admin';
  $: isAgente = (user?.role || (user as any)?.ruolo) === 'agente';

  $: cities = [...new Set(clients.map((c) => c.citta).filter(Boolean))].sort() as string[];

  $: filteredClients = clients.filter((c) => {
    const matchSearch =
      !search ||
      c.ragione_sociale?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.citta?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = tipoFilter === 'tutti' || c.tipo === tipoFilter;
    const matchAgente = !agenteFilter || c.agente === agenteFilter;
    const matchCitta = !cittaFilter || c.citta === cittaFilter;
    return matchSearch && matchTipo && matchAgente && matchCitta;
  });

  $: sortedClients = [...filteredClients].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'ragione_sociale':
        cmp = (a.ragione_sociale ?? '').localeCompare(b.ragione_sociale ?? '');
        break;
      case 'tipo':
        cmp = (a.tipo ?? '').localeCompare(b.tipo ?? '');
        break;
      case 'citta':
        cmp = (a.citta ?? '').localeCompare(b.citta ?? '');
        break;
      case 'n_ordini':
        cmp = (ordersByClient[a.id]?.count ?? 0) - (ordersByClient[b.id]?.count ?? 0);
        break;
      case 'ultimo_ordine':
        const da = ordersByClient[a.id]?.lastDate ?? '';
        const db = ordersByClient[b.id]?.lastDate ?? '';
        cmp = da.localeCompare(db);
        break;
      default:
        cmp = 0;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  $: totalPages = Math.max(1, Math.ceil(sortedClients.length / ITEMS_PER_PAGE));
  $: paginatedClients = sortedClients.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  onMount(async () => {
    try {
      const filter = isAgente && user?.id ? `agente = "${user.id}"` : '';
      clients = await pb.collection('clients').getFullList({
        filter: filter || undefined,
        expand: 'agente'
      });

      if (isAdmin) {
        const usersList = await pb.collection('users').getFullList({
          filter: 'ruolo = "agente"'
        });
        agents = usersList.map((u: any) => ({
          id: u.id,
          name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email,
          email: u.email
        }));
      }

      const orders = await pb.collection('orders').getFullList();
      const byClient: Record<string, { count: number; lastDate: string | null }> = {};
      for (const o of orders) {
        const cid = o.cliente;
        if (!cid) continue;
        if (!byClient[cid]) byClient[cid] = { count: 0, lastDate: null };
        byClient[cid].count += 1;
        const d = o.data_ordine ?? '';
        if (d && (!byClient[cid].lastDate || d > byClient[cid].lastDate)) {
          byClient[cid].lastDate = d;
        }
      }
      ordersByClient = byClient;
    } catch {
      clients = [];
      ordersByClient = {};
    } finally {
      loading = false;
    }
  });

  $: if (page > totalPages && totalPages > 0) {
    page = totalPages;
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  function getSortIcon(key: SortKey) {
    if (sortKey !== key) return Minus;
    return sortDir === 'asc' ? ArrowUp : ArrowDown;
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    if (selectedIds.size === paginatedClients.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(paginatedClients.map((c) => c.id));
    }
  }

  function openNewModal() {
    editingClient = null;
    modalOpen = true;
  }

  function handleSaved() {
    pb.collection('clients')
      .getFullList({ expand: 'agente' })
      .then((list) => {
        const filter = isAgente && user?.id ? `agente = "${user.id}"` : '';
        if (filter) {
          clients = list.filter((c) => c.agente === user?.id);
        } else {
          clients = list;
        }
      });
  }

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function initials(name?: string | null, email?: string | null): string {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return '?';
  }

  function getStatoLabel(c: Client): string {
    const count = ordersByClient[c.id]?.count ?? 0;
    return count > 0 ? 'Attivo' : 'Nuovo';
  }

  function exportCsv() {
    const headers = [
      'Ragione Sociale',
      'Tipo',
      'Città',
      'Email',
      'Telefono',
      'Agente',
      'N. Ordini',
      'Ultimo Ordine'
    ];
    const rows = sortedClients.map((c) => {
      const ag = c.expand?.agente;
      const agName = ag?.name ?? ag?.email ?? '—';
      return [
        c.ragione_sociale,
        TIPO_LABELS[c.tipo as ClientTipo] ?? c.tipo,
        c.citta ?? '',
        c.email ?? '',
        c.telefono ?? '',
        agName,
        ordersByClient[c.id]?.count ?? 0,
        formatDate(ordersByClient[c.id]?.lastDate ?? null)
      ];
    });
    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clienti_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Clienti</h1>
  </div>

  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      {#each TIPO_FILTERS as f}
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 {f.value === tipoFilter
            ? 'bg-[#F5D547] text-[#1A1A1A]'
            : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
          onclick={() => {
            tipoFilter = f.value as ClientTipo | 'tutti';
            page = 1;
          }}
        >
          {f.label}
        </button>
      {/each}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if isAdmin}
        <select
          bind:value={agenteFilter}
          class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547]"
        >
          <option value="">Tutti gli agenti</option>
          {#each agents as a}
            <option value={a.id}>{a.name ?? a.email ?? a.id}</option>
          {/each}
        </select>
      {/if}
      <select
        bind:value={cittaFilter}
        class="rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547]"
      >
        <option value="">Tutte le città</option>
        {#each cities as city}
          <option value={city}>{city}</option>
        {/each}
      </select>
      <div class="relative flex-1 min-w-[180px] sm:min-w-0 sm:flex-initial">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          type="text"
          bind:value={search}
          placeholder="Cerca ragione sociale, email, città..."
          class="w-full rounded-2xl border border-black/5 bg-white/80 pl-10 pr-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2"
        />
      </div>
      <Button variant="ghost" size="sm" className="rounded-2xl" onclick={exportCsv}>
        <Download class="h-4 w-4" />
        Export CSV
      </Button>
      <Button
        variant="primary"
        size="sm"
        className="rounded-2xl !bg-[#1A1A1A]"
        onclick={openNewModal}
      >
        <Plus class="h-4 w-4" />
        Nuovo Cliente
      </Button>
    </div>
  </div>

  <Card className="overflow-hidden p-0">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    {:else}
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-black/5">
              <th class="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === paginatedClients.length && paginatedClients.length > 0}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < paginatedClients.length}
                  onchange={toggleSelectAll}
                  class="rounded border-black/20 text-[#F5D547] focus:ring-[#F5D547]"
                />
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#1A1A1A]"
                onclick={() => toggleSort('ragione_sociale')}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && toggleSort('ragione_sociale')}
              >
                <span class="inline-flex items-center gap-1">
                  Ragione Sociale
                  <svelte:component this={getSortIcon('ragione_sociale')} class="h-4 w-4" />
                </span>
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#1A1A1A]"
                onclick={() => toggleSort('tipo')}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && toggleSort('tipo')}
              >
                <span class="inline-flex items-center gap-1">
                  Tipo
                  <svelte:component this={getSortIcon('tipo')} class="h-4 w-4" />
                </span>
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#1A1A1A]"
                onclick={() => toggleSort('citta')}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && toggleSort('citta')}
              >
                <span class="inline-flex items-center gap-1">
                  Città
                  <svelte:component this={getSortIcon('citta')} class="h-4 w-4" />
                </span>
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Agente
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#1A1A1A]"
                onclick={() => toggleSort('n_ordini')}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && toggleSort('n_ordini')}
              >
                <span class="inline-flex items-center gap-1">
                  N. Ordini
                  <svelte:component this={getSortIcon('n_ordini')} class="h-4 w-4" />
                </span>
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#1A1A1A]"
                onclick={() => toggleSort('ultimo_ordine')}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && toggleSort('ultimo_ordine')}
              >
                <span class="inline-flex items-center gap-1">
                  Ultimo Ordine
                  <svelte:component this={getSortIcon('ultimo_ordine')} class="h-4 w-4" />
                </span>
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                Stato
              </th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedClients as c (c.id)}
              <tr
                class="transition-colors cursor-pointer {selectedIds.has(c.id)
                  ? 'bg-[#FFF3CD]'
                  : 'hover:bg-[#FFFDE7]'}"
                onclick={() => goto(`/clienti/${c.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/clienti/${c.id}`)}
                role="button"
                tabindex="0"
              >
                <td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onchange={() => toggleSelect(c.id)}
                    onclick={(e) => e.stopPropagation()}
                    class="rounded border-black/20 text-[#F5D547] focus:ring-[#F5D547]"
                  />
                </td>
                <td class="px-4 py-3 text-sm font-bold text-[#1A1A1A]">
                  {c.ragione_sociale}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {TIPO_BADGE_COLORS[
                      c.tipo as ClientTipo
                    ] ?? 'bg-gray-100 text-gray-800'}"
                  >
                    {TIPO_LABELS[c.tipo as ClientTipo] ?? c.tipo}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-[#6B7280]">
                  <span class="inline-flex items-center gap-1">
                    <MapPin class="h-3.5 w-3.5 text-[#9CA3AF]" />
                    {c.citta ?? '—'}
                  </span>
                </td>
                <td class="px-4 py-3">
                  {#if c.expand?.agente}
                    <span class="inline-flex items-center gap-2">
                      <span
                        class="h-7 w-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-[10px] font-medium"
                      >
                        {initials(c.expand.agente.name, c.expand.agente.email)}
                      </span>
                      <span class="text-sm text-[#1A1A1A]">
                        {c.expand.agente.name ?? c.expand.agente.email ?? '—'}
                      </span>
                    </span>
                  {:else}
                    <span class="text-sm text-[#9CA3AF]">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-sm text-[#1A1A1A]">
                  {ordersByClient[c.id]?.count ?? 0}
                </td>
                <td class="px-4 py-3 text-sm text-[#6B7280]">
                  {formatDate(ordersByClient[c.id]?.lastDate ?? null)}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {getStatoLabel(c) === 'Attivo'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'}"
                  >
                    {getStatoLabel(c)}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile card list -->
      <div class="md:hidden divide-y divide-black/5">
        {#each paginatedClients as c (c.id)}
          <div
            role="button"
            tabindex="0"
            class="p-4 hover:bg-[#FFFDE7] {selectedIds.has(c.id) ? 'bg-[#FFF3CD]' : ''} cursor-pointer"
            onclick={() => goto(`/clienti/${c.id}`)}
            onkeydown={(e) => e.key === 'Enter' && goto(`/clienti/${c.id}`)}
          >
            <p class="font-bold text-[#1A1A1A]">{c.ragione_sociale}</p>
            <p class="text-xs text-[#6B7280] flex items-center gap-1 mt-0.5">
              <MapPin class="h-3 w-3" />
              {c.citta ?? '—'}
            </p>
            <div class="flex flex-wrap gap-2 mt-2">
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {TIPO_BADGE_COLORS[
                  c.tipo as ClientTipo
                ] ?? 'bg-gray-100 text-gray-800'}"
              >
                {TIPO_LABELS[c.tipo as ClientTipo] ?? c.tipo}
              </span>
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {getStatoLabel(c) === 'Attivo'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'}"
              >
                {getStatoLabel(c)}
              </span>
            </div>
            <p class="text-sm text-[#1A1A1A] mt-1">
              {ordersByClient[c.id]?.count ?? 0} ordini · Ultimo: {formatDate(ordersByClient[c.id]?.lastDate ?? null)}
            </p>
          </div>
        {/each}
      </div>

      {#if filteredClients.length === 0}
        <div class="py-16 text-center">
          <p class="text-sm text-[#6B7280]">Nessun cliente trovato</p>
        </div>
      {:else}
        <div class="flex items-center justify-between px-4 py-3 border-t border-black/5">
          <p class="text-sm text-[#6B7280]">{filteredClients.length} clienti</p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-2xl p-2 text-[#6B7280] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={page <= 1}
              onclick={() => (page = Math.max(1, page - 1))}
            >
              <ChevronLeft class="h-5 w-5" />
            </button>
            <span class="text-sm text-[#1A1A1A]">Pagina {page} di {totalPages}</span>
            <button
              type="button"
              class="rounded-2xl p-2 text-[#6B7280] hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={page >= totalPages}
              onclick={() => (page = Math.min(totalPages, page + 1))}
            >
              <ChevronRight class="h-5 w-5" />
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </Card>
</div>

<ClientModal
  open={modalOpen}
  client={editingClient}
  agents={agents}
  isAdmin={isAdmin}
  on:close={() => (modalOpen = false)}
  on:saved={handleSaved}
/>
