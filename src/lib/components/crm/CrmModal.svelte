<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { pb } from '$lib/pocketbase';
  import { currentUser } from '$lib/stores/auth';
  import type { CrmContatto, CrmFonte, CrmStato, CrmTipo } from '$lib/types/crm';
  import {
    FONTI,
    FONTE_LABELS,
    STATI,
    STATO_LABELS,
    TIPI,
    TIPO_LABELS
  } from '$lib/types/crm';
  import { cambiaStato, CRM_COLLECTION, pbMessage } from '$lib/utils/crmApi';
  import {
    clientTipoFor,
    displayCrmName,
    isOrgTipo,
    isPersonTipo,
    normalizeCodiceFiscale,
    normalizePiva,
    normalizeSdi,
    orgIds,
    validateCrmForm,
    type CambiaStatoResult,
    type CrmActor
  } from '$lib/utils/crm';

  export let open = false;
  export let record: CrmContatto | null = null;
  export let organizations: { id: string; label: string }[] = [];
  export let agents: { id: string; name?: string; email?: string }[] = [];
  export let isAdmin = false;

  const dispatch = createEventDispatcher<{
    close: void;
    saved: { record: CrmContatto; handoff: CambiaStatoResult | null };
  }>();

  let nome = '';
  let ragione_sociale = '';
  let tipo: CrmTipo = 'ristorante';
  let stato: CrmStato = 'da_contattare';
  let partita_iva = '';
  let codice_fiscale = '';
  let codice_sdi = '';
  let pec = '';
  let indirizzo = '';
  let citta = '';
  let provincia = '';
  let cap = '';
  let telefono = '';
  let email = '';
  let referente = '';
  let note = '';
  let fonte: CrmFonte | '' = '';
  let fonte_dettaglio = '';
  let agente = '';
  let selectedOrgs: string[] = [];
  let errors: Record<string, string> = {};
  let saving = false;

  $: if (open && record) {
    nome = record.nome ?? '';
    ragione_sociale = record.ragione_sociale ?? '';
    tipo = record.tipo ?? 'ristorante';
    stato = record.stato ?? 'da_contattare';
    partita_iva = record.partita_iva ?? '';
    codice_fiscale = record.codice_fiscale ?? '';
    codice_sdi = record.codice_sdi ?? '';
    pec = record.pec ?? '';
    indirizzo = record.indirizzo ?? '';
    citta = record.citta ?? '';
    provincia = record.provincia ?? '';
    cap = record.cap ?? '';
    telefono = record.telefono ?? '';
    email = record.email ?? '';
    referente = record.referente ?? '';
    note = record.note ?? '';
    fonte = record.fonte || '';
    fonte_dettaglio = record.fonte_dettaglio ?? '';
    agente = record.agente ?? '';
    selectedOrgs = orgIds(record);
    errors = {};
  } else if (open && !record) {
    nome = ragione_sociale = partita_iva = codice_fiscale = codice_sdi = pec = indirizzo = citta = provincia = cap = telefono = email = referente = note = fonte_dettaglio = '';
    tipo = 'ristorante';
    stato = 'da_contattare';
    fonte = '';
    agente = '';
    selectedOrgs = [];
    errors = {};
  }

  $: orgChoices = organizations.filter((org) => org.id !== record?.id);
  $: showOrgs = isPersonTipo(tipo);

  function actor(): CrmActor {
    const user = $currentUser;
    const role = user?.ruolo || user?.role;
    return { id: user?.id, isAgente: role === 'agente' };
  }

  function formSnapshot() {
    return {
      nome,
      ragione_sociale,
      tipo,
      stato,
      partita_iva,
      codice_fiscale,
      codice_sdi,
      pec,
      indirizzo,
      citta,
      provincia,
      cap,
      telefono,
      email,
      referente,
      note,
      fonte,
      fonte_dettaglio,
      organizzazioni: showOrgs ? selectedOrgs : [],
      agente
    };
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (saving) return;
    const input = formSnapshot();
    errors = validateCrmForm(input);
    if (Object.keys(errors).length > 0) return;

    const draft = {
      id: record?.id ?? '',
      tipo: input.tipo,
      ragione_sociale: input.ragione_sociale,
      nome: input.nome,
      cliente: record?.cliente,
      stato: input.stato
    };
    if (input.stato === 'acquisito' && !record?.cliente) {
      const who = displayCrmName(draft);
      const message = clientTipoFor(draft)
        ? `Segnare «${who}» come Acquisito? Verrà creato il cliente con ragione sociale, P.IVA, codice fiscale, indirizzo, contatti, codice SDI e PEC. Se imposti di nuovo Acquisito, il cliente non viene duplicato.`
        : `Segnare «${who}» come Acquisito? È una persona senza ragione sociale: non viene creato un cliente. Per aprire l’anagrafica, acquisisci il ristorante o il distributore collegato.`;
      if (!confirm(message)) return;
    }

    saving = true;
    try {
      const data: Record<string, unknown> = {
        nome: input.nome.trim() || undefined,
        ragione_sociale: input.ragione_sociale.trim() || undefined,
        tipo: input.tipo,
        stato: input.stato,
        partita_iva: normalizePiva(input.partita_iva) || undefined,
        codice_fiscale: normalizeCodiceFiscale(input.codice_fiscale) || undefined,
        codice_sdi: normalizeSdi(input.codice_sdi) || undefined,
        pec: input.pec.trim() || undefined,
        indirizzo: input.indirizzo.trim() || undefined,
        citta: input.citta.trim() || undefined,
        provincia: input.provincia.trim().toUpperCase() || undefined,
        cap: input.cap.trim() || undefined,
        telefono: input.telefono.trim() || undefined,
        email: input.email.trim() || undefined,
        referente: input.referente.trim() || undefined,
        note: input.note.trim() || undefined,
        fonte: input.fonte || null,
        fonte_dettaglio: input.fonte_dettaglio.trim() || undefined,
        organizzazioni: isOrgTipo(input.tipo) ? [] : input.organizzazioni
      };
      if (isAdmin) {
        data.agente = input.agente || undefined;
      } else if (!record?.id && actor().id) {
        data.agente = actor().id;
      }

      let saved: CrmContatto;
      if (record?.id) {
        saved = (await pb.collection(CRM_COLLECTION).update(record.id, data)) as CrmContatto;
      } else {
        saved = (await pb.collection(CRM_COLLECTION).create(data)) as CrmContatto;
      }

      let handoff: CambiaStatoResult | null = null;
      if (saved.stato === 'acquisito') {
        handoff = await cambiaStato(pb, saved, 'acquisito', actor());
        saved = { ...saved, ...handoff.record, stato: 'acquisito', cliente: handoff.clienteId || saved.cliente };
      }

      dispatch('saved', { record: saved, handoff });
      dispatch('close');
    } catch (err) {
      errors.submit = pbMessage(err);
    } finally {
      saving = false;
    }
  }

  function toggleOrg(id: string) {
    selectedOrgs = selectedOrgs.includes(id)
      ? selectedOrgs.filter((item) => item !== id)
      : [...selectedOrgs, id];
  }
</script>

<Modal open={open} title={record ? 'Modifica contatto' : 'Nuovo contatto'} size="xl" on:close={() => dispatch('close')}>
  <form onsubmit={handleSubmit} class="space-y-5">
    <div class="grid gap-5 sm:grid-cols-2">
      <Input
        id="crm_nome"
        label="Nome"
        bind:value={nome}
        placeholder={isOrgTipo(tipo) ? 'Insegna, se diversa' : 'Nome e cognome'}
        required={!isOrgTipo(tipo) && tipo !== 'contatto'}
        error={errors.nome}
      />
      <Input
        id="crm_ragione_sociale"
        label="Ragione sociale"
        bind:value={ragione_sociale}
        placeholder="Es. Osteria del Porto S.r.l."
        required={isOrgTipo(tipo)}
        error={errors.ragione_sociale}
      />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <div class="space-y-1.5">
        <label for="crm_tipo" class="block text-sm font-medium text-[#1A1A1A]">Tipo</label>
        <select id="crm_tipo" bind:value={tipo} class="field w-full">
          {#each TIPI as value}
            <option {value}>{TIPO_LABELS[value]}</option>
          {/each}
        </select>
      </div>
      <div class="space-y-1.5">
        <label for="crm_stato" class="block text-sm font-medium text-[#1A1A1A]">Stato</label>
        <select id="crm_stato" bind:value={stato} class="field w-full">
          {#each STATI as value}
            <option {value}>{STATO_LABELS[value]}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if isAdmin}
      <div class="space-y-1.5">
        <label for="crm_agente" class="block text-sm font-medium text-[#1A1A1A]">Agente assegnato</label>
        <select id="crm_agente" bind:value={agente} class="field w-full">
          <option value="">Nessun agente</option>
          {#each agents as a}
            <option value={a.id}>{a.name || a.email || a.id}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="grid gap-5 sm:grid-cols-2">
      <div class="space-y-1.5">
        <label for="crm_fonte" class="block text-sm font-medium text-[#1A1A1A]">Fonte</label>
        <select id="crm_fonte" bind:value={fonte} class="field w-full">
          <option value="">Non indicata</option>
          {#each FONTI as value}
            <option {value}>{FONTE_LABELS[value]}</option>
          {/each}
        </select>
      </div>
      <Input
        id="crm_fonte_dettaglio"
        label="Dettaglio fonte"
        bind:value={fonte_dettaglio}
        placeholder="Es. Vinitaly, Mario Rossi"
      />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <Input id="crm_partita_iva" label="Partita IVA" bind:value={partita_iva} placeholder="IT12345678901" error={errors.partita_iva} />
      <Input
        id="crm_codice_fiscale"
        label="Codice fiscale"
        bind:value={codice_fiscale}
        placeholder="12345678901"
        error={errors.codice_fiscale}
      />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <Input
        id="crm_codice_sdi"
        label="Codice SDI"
        bind:value={codice_sdi}
        placeholder="XXXXXXX"
        hint="Codice destinatario, 7 caratteri"
        error={errors.codice_sdi}
      />
      <Input id="crm_pec" label="PEC" type="email" bind:value={pec} placeholder="pec@azienda.it" error={errors.pec} />
    </div>

    <div class="space-y-1.5">
      <label for="crm_indirizzo" class="block text-sm font-medium text-[#1A1A1A]">Indirizzo</label>
      <input id="crm_indirizzo" type="text" bind:value={indirizzo} placeholder="Via, numero civico" class="field w-full" />
    </div>

    <div class="grid gap-5 sm:grid-cols-3">
      <Input id="crm_citta" label="Città" bind:value={citta} placeholder="Città" />
      <Input id="crm_provincia" label="Provincia" bind:value={provincia} placeholder="MI" error={errors.provincia} />
      <Input id="crm_cap" label="CAP" bind:value={cap} placeholder="20100" error={errors.cap} />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <Input id="crm_telefono" label="Telefono" bind:value={telefono} placeholder="+39 02 1234567" />
      <Input id="crm_email" label="Email" type="email" bind:value={email} placeholder="contatto@azienda.it" error={errors.email} />
    </div>

    <Input id="crm_referente" label="Referente" bind:value={referente} placeholder="Chi risponde in azienda" />

    {#if showOrgs}
      <fieldset class="space-y-2">
        <legend class="block text-sm font-medium text-[#1A1A1A]">Organizzazioni</legend>
        <p class="text-xs text-[#6B7280]">
          Collega la persona a un ristorante o a un distributore, ad esempio il sommelier di un locale o l’agente di un distributore.
        </p>
        {#if orgChoices.length === 0}
          <p class="text-sm text-[#6B7280]">Nessuna organizzazione in CRM. Crea prima il ristorante o il distributore.</p>
        {:else}
          <div class="max-h-40 space-y-2 overflow-y-auto rounded-2xl border border-black/[0.07] bg-white/80 p-3">
            {#each orgChoices as org}
              <label class="flex items-center gap-2 text-sm text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={selectedOrgs.includes(org.id)}
                  onchange={() => toggleOrg(org.id)}
                  class="rounded border-black/20 text-[#F5D547] focus:ring-[#F5D547]"
                />
                {org.label}
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>
    {/if}

    <div>
      <label for="crm_note" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Note</label>
      <textarea id="crm_note" bind:value={note} rows="3" class="field w-full" placeholder="Note sul contatto"></textarea>
    </div>

    {#if errors.submit}
      <p class="text-xs text-rose-600">{errors.submit}</p>
    {/if}

    <div class="flex justify-end gap-3 pt-2">
      <Button type="button" variant="ghost" onclick={() => dispatch('close')}>Annulla</Button>
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Salvataggio...' : record ? 'Salva modifiche' : 'Crea contatto'}
      </Button>
    </div>
  </form>
</Modal>
