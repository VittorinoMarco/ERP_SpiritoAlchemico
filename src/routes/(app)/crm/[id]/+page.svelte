<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import CrmModal from '$lib/components/crm/CrmModal.svelte';
  import { ArrowLeft, Edit, MapPin, Trash2 } from 'lucide-svelte';
  import type { CrmContatto, CrmStato } from '$lib/types/crm';
  import {
    FONTE_LABELS,
    STATI,
    STATO_BADGE_COLORS,
    STATO_LABELS,
    TIPO_BADGE_COLORS,
    TIPO_LABELS,
    type CrmFonte
  } from '$lib/types/crm';
  import { cambiaStato, CRM_COLLECTION, pbMessage } from '$lib/utils/crmApi';
  import {
    clientTipoFor,
    displayCrmName,
    isOrgTipo,
    orgIds,
    type CambiaStatoResult,
    type CrmActor
  } from '$lib/utils/crm';

  const recordId = $page.params.id;

  export let data: { user?: { id?: string; role?: string; ruolo?: string } | null } = { user: null };

  let record: CrmContatto | null = null;
  let people: CrmContatto[] = [];
  let orgOptions: { id: string; label: string }[] = [];
  let linkedOrgs: { id: string; label: string }[] = [];
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let modalOpen = false;
  let deleting = false;
  let savingStato = false;
  let notice = '';

  $: user = data.user ?? (pb.authStore.model as { id?: string; role?: string; ruolo?: string } | null);
  $: role = user?.ruolo || user?.role;
  $: isAdmin = role === 'admin';
  $: isAgente = role === 'agente';
  $: actor = { id: user?.id, isAgente } satisfies CrmActor;

  onMount(() => {
    loadRecord();
  });

  async function loadRecord() {
    loading = true;
    try {
      try {
        record = await pb.collection(CRM_COLLECTION).getOne<CrmContatto>(recordId, {
          expand: 'agente,cliente,organizzazioni'
        });
      } catch {
        record = await pb.collection(CRM_COLLECTION).getOne<CrmContatto>(recordId);
      }

      let all: CrmContatto[] = [];
      try {
        try {
          all = await pb.collection(CRM_COLLECTION).getFullList<CrmContatto>({ sort: 'ragione_sociale,nome' });
        } catch {
          all = await pb.collection(CRM_COLLECTION).getFullList<CrmContatto>();
        }
      } catch {
        all = [];
      }
      people = all.filter((row) => row.id !== recordId && orgIds(row).includes(recordId));
      orgOptions = all
        .filter((row) => row.id !== recordId && (row.tipo === 'ristorante' || row.tipo === 'distributore'))
        .map((row) => ({ id: row.id, label: displayCrmName(row) }));

      const expanded = record.expand?.organizzazioni;
      if (expanded?.length) {
        linkedOrgs = expanded.map((org) => ({
          id: org.id,
          label: org.ragione_sociale || org.nome || 'Organizzazione'
        }));
      } else {
        const ids = orgIds(record);
        linkedOrgs = ids.map((id) => {
          const found = all.find((row) => row.id === id);
          return { id, label: found ? displayCrmName(found) : 'Organizzazione' };
        });
      }

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
    } catch {
      record = null;
      people = [];
    } finally {
      loading = false;
    }
  }

  function fonteLabel(value?: string): string {
    if (!value) return '—';
    return FONTE_LABELS[value as CrmFonte] ?? value;
  }

  function agentName(): string {
    const ag = record?.expand?.agente;
    if (!ag) return '—';
    if (ag.nome) return [ag.nome, ag.cognome].filter(Boolean).join(' ');
    return ag.name || ag.email || '—';
  }

  function applyHandoff(result: CambiaStatoResult) {
    if (!record) return;
    record = {
      ...record,
      ...result.record,
      stato: result.record.stato,
      cliente: result.clienteId || undefined,
      expand: record.expand
    };
    if (result.created) notice = 'Cliente creato in anagrafica. Il collegamento evita un duplicato se imposti di nuovo Acquisito.';
    else if (result.linkedExisting) notice = 'Cliente già collegato: non è stato creato un duplicato.';
    else if (result.personaOnly) notice = 'Stato aggiornato. Questa persona non ha una ragione sociale, quindi non è stato creato un cliente.';
  }

  async function handleStato(stato: CrmStato) {
    if (!record || savingStato || stato === record.stato) return;
    if (stato === 'acquisito' && !record.cliente) {
      const name = displayCrmName(record);
      const message = clientTipoFor(record)
        ? `Segnare «${name}» come Acquisito? Verrà creato il cliente con i dati aziendali, SDI e PEC. Una seconda volta non crea un duplicato.`
        : `Segnare «${name}» come Acquisito? È una persona senza ragione sociale: non viene creato un cliente.`;
      if (!confirm(message)) return;
    }
    savingStato = true;
    notice = '';
    try {
      const result = await cambiaStato(pb, record, stato, actor);
      applyHandoff(result);
      if (result.clienteId) await loadRecord();
    } catch (err) {
      alert(pbMessage(err, 'Impossibile aggiornare lo stato'));
    } finally {
      savingStato = false;
    }
  }

  function handleSaved(event: CustomEvent<{ record: CrmContatto; handoff: CambiaStatoResult | null }>) {
    modalOpen = false;
    if (event.detail.handoff) applyHandoff(event.detail.handoff);
    loadRecord();
  }

  async function handleDelete() {
    if (!record || !isAdmin || deleting) return;
    const name = displayCrmName(record);
    const extra = record.cliente ? ' Il cliente già creato in anagrafica non viene eliminato.' : '';
    if (!confirm(`Eliminare «${name}» dal CRM?${extra}`)) return;
    deleting = true;
    try {
      await pb.collection(CRM_COLLECTION).delete(record.id);
      goto('/crm');
    } catch (err) {
      alert(pbMessage(err, 'Errore durante l\'eliminazione'));
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head>
  <title>{record ? displayCrmName(record) : 'CRM'} · SpiritoAlchemico ERP</title>
</svelte:head>

<div class="space-y-5 fade-in">
  <div class="flex items-center gap-3">
    <button
      type="button"
      class="h-11 w-11 grid place-items-center rounded-2xl bg-white/80 border border-black/[0.06] hover:bg-white shrink-0"
      onclick={() => goto('/crm')}
      aria-label="Torna al CRM"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <div class="min-w-0 flex-1">
      <p class="text-xs text-[#6B7280]">CRM</p>
      <h1 class="text-xl sm:text-3xl font-bold tracking-tight truncate">{record ? displayCrmName(record) : '…'}</h1>
    </div>
    {#if record && !loading}
      <div class="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="sm" onclick={() => (modalOpen = true)}>
          <Edit class="h-4 w-4" />
          <span class="hidden sm:inline">Modifica</span>
        </Button>
        {#if isAdmin}
          <Button variant="ghost" size="sm" className="!text-rose-600 hover:!bg-rose-50" onclick={handleDelete} disabled={deleting}>
            <Trash2 class="h-4 w-4" />
            <span class="hidden sm:inline">Elimina</span>
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  {#if loading}
    <Spinner />
  {:else if !record}
    <Card>
      <EmptyState titolo="Contatto non trovato" testo="Potrebbe essere stato eliminato o non hai i permessi per vederlo.">
        <Button variant="ghost" onclick={() => goto('/crm')}>Torna al CRM</Button>
      </EmptyState>
    </Card>
  {:else}
    {#if notice}
      <div class="rounded-2xl bg-[#FFF3CD] px-4 py-3 text-sm text-[#1A1A1A] flex flex-wrap items-center justify-between gap-3">
        <span>{notice}</span>
        {#if record.cliente}
          <a href="/clienti/{record.cliente}" class="font-semibold underline">Apri cliente</a>
        {/if}
      </div>
    {/if}

    <div class="page-grid">
      <Card className="lg:col-span-2">
        <div class="mb-4 flex items-start justify-between gap-3">
          <h2 class="text-sm font-medium text-[#1A1A1A]">Dati anagrafici</h2>
          <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {TIPO_BADGE_COLORS[record.tipo] ?? 'bg-gray-100'}">
            {TIPO_LABELS[record.tipo] ?? record.tipo}
          </span>
        </div>
        <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Ragione sociale</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.ragione_sociale || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Nome</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.nome || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Partita IVA</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.partita_iva || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Codice fiscale</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.codice_fiscale || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Codice SDI</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.codice_sdi || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">PEC</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.pec || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block sm:col-span-2">
            <dt class="text-sm text-[#6B7280]">Indirizzo</dt>
            <dd class="text-sm font-medium text-[#1A1A1A] text-right sm:text-left">
              {#if record.indirizzo || record.citta}
                <span class="inline-flex items-center gap-1">
                  <MapPin class="h-3.5 w-3.5 text-[#9CA3AF] flex-shrink-0" />
                  {[record.indirizzo, record.citta, record.cap, record.provincia].filter(Boolean).join(', ')}
                </span>
              {:else}
                —
              {/if}
            </dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Telefono</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.telefono || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Email</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.email || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Referente</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{record.referente || '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Fonte</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">
              {fonteLabel(record.fonte)}{record.fonte_dettaglio ? ` — ${record.fonte_dettaglio}` : ''}
            </dd>
          </div>
          {#if isAdmin || record.expand?.agente}
            <div class="flex justify-between sm:block sm:col-span-2">
              <dt class="text-sm text-[#6B7280]">Agente assegnato</dt>
              <dd class="text-sm font-medium text-[#1A1A1A]">{agentName()}</dd>
            </div>
          {/if}
        </dl>
      </Card>

      <Card>
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-3">Stato</h2>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Cambia stato">
          {#each STATI as stato}
            <button
              type="button"
              class="chip {record.stato === stato ? 'chip-active' : ''}"
              disabled={savingStato}
              aria-pressed={record.stato === stato}
              onclick={() => handleStato(stato)}
            >
              {STATO_LABELS[stato]}
            </button>
          {/each}
        </div>
        <p class="mt-3 text-xs text-[#6B7280]">
          <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[record.stato]}">
            {STATO_LABELS[record.stato]}
          </span>
        </p>
        {#if record.cliente}
          <a href="/clienti/{record.cliente}" class="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#F7F6F3] hover:bg-[#FFFDE7] transition-colors p-3">
            <span>
              <span class="block text-sm font-semibold">Cliente collegato</span>
              <span class="block text-xs text-[#6B7280]">{record.expand?.cliente?.ragione_sociale || 'Apri in anagrafica'}</span>
            </span>
            <span class="text-sm font-medium">Apri</span>
          </a>
        {:else}
          <p class="mt-4 text-sm text-[#6B7280]">
            {clientTipoFor(record)
              ? 'Su Acquisito i dati aziendali vengono copiati in Clienti.'
              : 'Collega questa persona a un’organizzazione e acquisisci quella per creare il cliente.'}
          </p>
        {/if}
      </Card>

      <Card className="lg:col-span-2">
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-3">
          {isOrgTipo(record.tipo) ? 'Persone collegate' : 'Organizzazioni'}
        </h2>
        {#if isOrgTipo(record.tipo)}
          {#if people.length === 0}
            <p class="py-6 text-center text-sm text-[#6B7280]">
              Nessuna persona collegata. Apri un sommelier, un agente o un contatto e associalo a questa organizzazione.
            </p>
          {:else}
            <ul class="divide-y divide-black/5 -mx-2">
              {#each people as person (person.id)}
                <li>
                  <a href="/crm/{person.id}" class="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 hover:bg-[#FFFDE7] transition-colors">
                    <span class="min-w-0">
                      <span class="block text-sm font-medium truncate">{displayCrmName(person)}</span>
                      <span class="block text-xs text-[#6B7280]">{person.email || person.telefono || '—'}</span>
                    </span>
                    <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {TIPO_BADGE_COLORS[person.tipo] ?? 'bg-gray-100'}">
                      {TIPO_LABELS[person.tipo] ?? person.tipo}
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        {:else if linkedOrgs.length === 0}
          <p class="py-6 text-center text-sm text-[#6B7280]">Nessuna organizzazione collegata.</p>
        {:else}
          <ul class="divide-y divide-black/5 -mx-2">
            {#each linkedOrgs as org (org.id)}
              <li>
                <a href="/crm/{org.id}" class="block rounded-2xl px-3 py-3 text-sm font-medium hover:bg-[#FFFDE7] transition-colors">
                  {org.label}
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>

      <Card>
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Note</h2>
        {#if record.note}
          <div class="text-sm text-[#1A1A1A] whitespace-pre-line break-words">{record.note}</div>
        {:else}
          <p class="text-sm text-[#6B7280]">Nessuna nota</p>
        {/if}
      </Card>
    </div>
  {/if}
</div>

{#if record}
  <CrmModal
    open={modalOpen}
    {record}
    organizations={orgOptions}
    {agents}
    {isAdmin}
    on:close={() => (modalOpen = false)}
    on:saved={handleSaved}
  />
{/if}
