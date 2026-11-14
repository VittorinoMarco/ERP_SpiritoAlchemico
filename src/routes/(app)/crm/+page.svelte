<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';
  import CrmModal from '$lib/components/crm/CrmModal.svelte';
  import { Contact, MapPin, Plus, Search } from 'lucide-svelte';
  import type { CrmContatto, CrmStato, CrmTipo } from '$lib/types/crm';
  import {
    FONTE_LABELS,
    STATI,
    STATO_LABELS,
    TIPO_BADGE_COLORS,
    TIPO_LABELS,
    type CrmFonte
  } from '$lib/types/crm';
  import { cambiaStato, CRM_COLLECTION, isMissingCollection, pbMessage } from '$lib/utils/crmApi';
  import {
    clientTipoFor,
    displayCrmName,
    orgIds,
    type CambiaStatoResult,
    type CrmActor
  } from '$lib/utils/crm';

  const PER_PAGE = 10;
  const TIPO_FILTERS: { value: CrmTipo | 'tutti'; label: string }[] = [
    { value: 'tutti', label: 'Tutti' },
    { value: 'ristorante', label: 'Ristoranti' },
    { value: 'distributore', label: 'Distributori' },
    { value: 'contatto', label: 'Contatti' },
    { value: 'agente', label: 'Agenti' },
    { value: 'sommelier', label: 'Sommelier' },
    { value: 'persona_di_spicco', label: 'Persone di spicco' }
  ];

  export let data: { user?: { id?: string; role?: string; ruolo?: string } | null } = { user: null };

  let records: CrmContatto[] = [];
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let loadError: string | null = null;
  let collectionMissing = false;
  let search = '';
  let tipoFilter: CrmTipo | 'tutti' = 'tutti';
  let statoFilter: CrmStato | 'tutti' = 'tutti';
  let agenteFilter = '';
  let page = 1;
  let modalOpen = false;
  let editing: CrmContatto | null = null;
  let savingId = '';
  let notice = '';
  let noticeClienteId = '';

  $: user = data.user ?? (pb.authStore.model as { id?: string; role?: string; ruolo?: string } | null);
  $: role = user?.ruolo || user?.role;
  $: isAdmin = role === 'admin';
  $: isAgente = role === 'agente';
  $: actor = { id: user?.id, isAgente } satisfies CrmActor;

  $: statoCounts = STATI.reduce(
    (acc, stato) => {
      acc[stato] = records.filter((row) => row.stato === stato).length;
      return acc;
    },
    {} as Record<CrmStato, number>
  );

  $: filtered = records.filter((row) => {
    const name = displayCrmName(row).toLowerCase();
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      name.includes(q) ||
      row.email?.toLowerCase().includes(q) ||
      row.citta?.toLowerCase().includes(q) ||
      row.referente?.toLowerCase().includes(q) ||
      row.partita_iva?.toLowerCase().includes(q);
    const matchTipo = tipoFilter === 'tutti' || row.tipo === tipoFilter;
    const matchStato = statoFilter === 'tutti' || row.stato === statoFilter;
    const matchAgente = !agenteFilter || row.agente === agenteFilter;
    return matchSearch && matchTipo && matchStato && matchAgente;
  });

  $: pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  $: orgOptions = records
    .filter((row) => row.tipo === 'ristorante' || row.tipo === 'distributore')
    .map((row) => ({ id: row.id, label: displayCrmName(row) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'it'));

  onMount(() => {
    loadRecords();
  });

  async function loadRecords() {
    loading = true;
    loadError = null;
    collectionMissing = false;
    try {
      const filter = isAgente && user?.id ? `agente = "${user.id}"` : '';
      const base = filter ? { filter } : {};
      let list: CrmContatto[] = [];
      try {
        list = await pb.collection(CRM_COLLECTION).getFullList<CrmContatto>({
          ...base,
          sort: '-created',
          expand: 'agente,cliente'
        });
      } catch (err) {
        if (isMissingCollection(err)) throw err;
        try {
          list = await pb.collection(CRM_COLLECTION).getFullList<CrmContatto>({ ...base, sort: '-created' });
        } catch (err2) {
          if (isMissingCollection(err2)) throw err2;
          list = await pb.collection(CRM_COLLECTION).getFullList<CrmContatto>(base);
        }
      }
      records = list;

      if (isAdmin) {
        try {
          const users = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
          agents = users.map((u) => ({
            id: u.id,
            name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email,
            email: u.email
          }));
        } catch {
          agents = [];
        }
      }
    } catch (err) {
      records = [];
      if (isMissingCollection(err)) {
        collectionMissing = true;
        loadError = 'Collection PocketBase `crm_contatti` non trovata. Esegui npm run pb:sync.';
      } else {
        loadError = pbMessage(err, 'Errore caricamento CRM');
      }
    } finally {
      loading = false;
    }
  }

  function resetFilters() {
    search = '';
    tipoFilter = 'tutti';
    statoFilter = 'tutti';
    agenteFilter = '';
    page = 1;
  }

  function openNew() {
    editing = null;
    modalOpen = true;
  }

  function handoffNotice(result: CambiaStatoResult, name: string) {
    noticeClienteId = result.clienteId ?? '';
    if (result.created) {
      notice = `Cliente creato da «${name}».`;
    } else if (result.linkedExisting) {
      notice = `«${name}» è già collegato a un cliente: nessun duplicato.`;
    } else if (result.personaOnly) {
      notice = `«${name}» è acquisito come persona. Per creare il cliente, acquisisci il ristorante o il distributore.`;
    } else {
      notice = '';
    }
  }

  function handleSaved(event: CustomEvent<{ record: CrmContatto; handoff: CambiaStatoResult | null }>) {
    loadError = null;
    collectionMissing = false;
    const { record, handoff } = event.detail;
    const index = records.findIndex((row) => row.id === record.id);
    if (index >= 0) records[index] = { ...records[index], ...record };
    else records = [record, ...records];
    records = records;
    if (handoff) handoffNotice(handoff, displayCrmName(record));
    modalOpen = false;
  }

  async function handleStato(row: CrmContatto, next: string, select: HTMLSelectElement) {
    const stato = next as CrmStato;
    if (stato === row.stato || savingId) {
      select.value = row.stato;
      return;
    }
    if (stato === 'acquisito' && !row.cliente) {
      const name = displayCrmName(row);
      const message = clientTipoFor(row)
        ? `Segnare «${name}» come Acquisito? Verrà creato il cliente con i dati aziendali, SDI e PEC. Una seconda volta non crea un duplicato.`
        : `Segnare «${name}» come Acquisito? È una persona senza ragione sociale: non viene creato un cliente.`;
      if (!confirm(message)) {
        select.value = row.stato;
        return;
      }
    }
    savingId = row.id;
    try {
      const result = await cambiaStato(pb, row, stato, actor);
      records = records.map((item) =>
        item.id === row.id ? { ...item, ...result.record, stato, cliente: result.clienteId || item.cliente } : item
      );
      if (stato === 'acquisito') handoffNotice(result, displayCrmName(row));
    } catch (err) {
      select.value = row.stato;
      alert(pbMessage(err, 'Impossibile aggiornare lo stato'));
    } finally {
      savingId = '';
    }
  }

  function fonteLabel(value?: string): string {
    if (!value) return '—';
    return FONTE_LABELS[value as CrmFonte] ?? value;
  }

  function agentLabel(row: CrmContatto): string {
    const ag = row.expand?.agente;
    if (!ag) return '';
    if (ag.nome) return [ag.nome, ag.cognome].filter(Boolean).join(' ');
    return ag.name || ag.email || '';
  }
</script>

<svelte:head><title>CRM · SpiritoAlchemico ERP</title></svelte:head>

<div class="space-y-5 fade-in">
  <PageHeader
    titolo="CRM"
    sottotitolo="Persone e organizzazioni prima che diventino clienti: ristoranti, distributori, sommelier e contatti."
  >
    <Button size="sm" onclick={openNew} disabled={collectionMissing}>
      <Plus class="h-4 w-4" />
      Nuovo contatto
    </Button>
  </PageHeader>

  {#if notice}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FFF3CD] px-4 py-3 text-sm text-[#1A1A1A]">
      <span>{notice}</span>
      <span class="flex items-center gap-3">
        {#if noticeClienteId}
          <a href="/clienti/{noticeClienteId}" class="font-semibold underline">Apri cliente</a>
        {/if}
        <button type="button" class="text-[#6B7280] hover:text-[#1A1A1A]" onclick={() => (notice = '')}>Chiudi</button>
      </span>
    </div>
  {/if}

  <div class="chip-row" role="tablist" aria-label="Filtra per tipo">
    {#each TIPO_FILTERS as f}
      <button
        type="button"
        role="tab"
        aria-selected={tipoFilter === f.value}
        class="chip {tipoFilter === f.value ? 'chip-active' : ''}"
        onclick={() => {
          tipoFilter = f.value;
          page = 1;
        }}
      >
        {f.label}
      </button>
    {/each}
  </div>

  <div class="chip-row" role="tablist" aria-label="Filtra per stato">
    <button
      type="button"
      class="chip {statoFilter === 'tutti' ? 'chip-active' : ''}"
      onclick={() => {
        statoFilter = 'tutti';
        page = 1;
      }}
    >
      Tutti gli stati
    </button>
    {#each STATI as stato}
      <button
        type="button"
        role="tab"
        aria-selected={statoFilter === stato}
        class="chip {statoFilter === stato ? 'chip-active' : ''}"
        onclick={() => {
          statoFilter = stato;
          page = 1;
        }}
      >
        {STATO_LABELS[stato]}
        {#if statoCounts[stato]}
          <span class="chip-count">{statoCounts[stato]}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="flex flex-wrap items-center gap-2">
    {#if isAdmin}
      <select bind:value={agenteFilter} class="field w-auto" aria-label="Agente" onchange={() => (page = 1)}>
        <option value="">Tutti gli agenti</option>
        {#each agents as a}
          <option value={a.id}>{a.name ?? a.email ?? a.id}</option>
        {/each}
      </select>
    {/if}
    <div class="relative min-w-[180px] flex-1 sm:max-w-sm">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
      <input
        type="search"
        bind:value={search}
        placeholder="Cerca nome, email, città, P.IVA..."
        class="field w-full pl-9"
        oninput={() => (page = 1)}
        aria-label="Cerca contatti"
      />
    </div>
  </div>

  <Card className="!p-0 overflow-hidden">
    {#if loading}
      <Spinner />
    {:else if loadError}
      <EmptyState icon={Contact} titolo={collectionMissing ? 'Schema CRM mancante' : 'Qualcosa è andato storto'} testo={loadError} />
    {:else if filtered.length === 0}
      <EmptyState
        icon={Contact}
        titolo={records.length === 0 ? 'Nessun contatto in CRM' : 'Nessun contatto con questi filtri'}
        testo={records.length === 0
          ? 'Aggiungi un ristorante, un distributore o una persona. Quando lo segni come Acquisito, diventa un cliente.'
          : 'Prova a cambiare tipo, stato o ricerca.'}
      >
        {#if records.length === 0}
          <Button variant="secondary" onclick={openNew}><Plus class="h-4 w-4" /> Nuovo contatto</Button>
        {:else}
          <Button variant="ghost" onclick={resetFilters}>Azzera filtri</Button>
        {/if}
      </EmptyState>
    {:else}
      <div class="table-scroll">
        <table class="w-full">
          <thead>
            <tr class="border-b border-black/5">
              <th class="pin px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Contatto</th>
              <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Tipo</th>
              <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Stato</th>
              <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Città</th>
              <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Fonte</th>
              {#if isAdmin}
                <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Agente</th>
              {/if}
              <th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Cliente</th>
            </tr>
          </thead>
          <tbody>
            {#each pageItems as row (row.id)}
              <tr
                class="cursor-pointer transition-colors hover:bg-[#FFFDE7]"
                onclick={() => goto(`/crm/${row.id}`)}
                onkeydown={(e) => e.key === 'Enter' && goto(`/crm/${row.id}`)}
                role="button"
                tabindex="0"
              >
                <td class="pin px-4 py-3">
                  <p class="text-sm font-bold text-[#1A1A1A]">{displayCrmName(row)}</p>
                  {#if row.referente || row.email}
                    <p class="text-xs text-[#6B7280]">{row.referente || row.email}</p>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {TIPO_BADGE_COLORS[row.tipo] ?? 'bg-gray-100 text-gray-800'}">
                    {TIPO_LABELS[row.tipo] ?? row.tipo}
                  </span>
                </td>
                <td class="px-4 py-3" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
                  <select
                    class="field !w-44"
                    aria-label="Stato di {displayCrmName(row)}"
                    value={row.stato}
                    disabled={savingId === row.id}
                    onchange={(e) => handleStato(row, e.currentTarget.value, e.currentTarget)}
                  >
                    {#each STATI as stato}
                      <option value={stato}>{STATO_LABELS[stato]}</option>
                    {/each}
                  </select>
                </td>
                <td class="px-4 py-3 text-sm text-[#6B7280]">
                  <span class="inline-flex items-center gap-1">
                    <MapPin class="h-3.5 w-3.5 text-[#9CA3AF]" />
                    {row.citta || '—'}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-[#6B7280]">{fonteLabel(row.fonte)}</td>
                {#if isAdmin}
                  <td class="px-4 py-3 text-sm text-[#1A1A1A]">{agentLabel(row) || '—'}</td>
                {/if}
                <td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
                  {#if row.cliente}
                    <a href="/clienti/{row.cliente}" class="text-sm font-medium text-[#1A1A1A] underline">
                      {row.expand?.cliente?.ragione_sociale || 'Apri'}
                    </a>
                  {:else if orgIds(row).length}
                    <span class="text-xs text-[#6B7280]">{orgIds(row).length} org.</span>
                  {:else}
                    <span class="text-sm text-[#9CA3AF]">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pagination bind:page total={filtered.length} perPage={PER_PAGE} label={filtered.length === 1 ? 'contatto' : 'contatti'} />
    {/if}
  </Card>
</div>

<CrmModal
  open={modalOpen}
  record={editing}
  organizations={orgOptions}
  {agents}
  {isAdmin}
  on:close={() => (modalOpen = false)}
  on:saved={handleSaved}
/>
