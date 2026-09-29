<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import { getCompanyProfile, companyReadyForFatturaPA, type CompanyProfile } from '$lib/utils/companyProfile';
  import { logAudit } from '$lib/utils/audit';

  let form: Omit<CompanyProfile, 'id'> = {
    ragione_sociale: 'Spirito Alchemico',
    partita_iva: '',
    codice_fiscale: '',
    regime_fiscale: '',
    indirizzo: '',
    citta: '',
    cap: '',
    provincia: '',
    pec: '',
    codice_sdi: '',
    iban: '',
    telefono: '',
    email: ''
  };
  let recordId = '';
  let loading = true;
  let saving = false;
  let notice = '';

  onMount(async () => {
    try {
      const c = await getCompanyProfile(pb);
      if (c) {
        recordId = c.id;
        form = {
          ragione_sociale: c.ragione_sociale ?? 'Spirito Alchemico',
          partita_iva: c.partita_iva ?? '',
          codice_fiscale: c.codice_fiscale ?? '',
          regime_fiscale: c.regime_fiscale ?? '',
          indirizzo: c.indirizzo ?? '',
          citta: c.citta ?? '',
          cap: c.cap ?? '',
          provincia: c.provincia ?? '',
          pec: c.pec ?? '',
          codice_sdi: c.codice_sdi ?? '',
          iban: c.iban ?? '',
          telefono: c.telefono ?? '',
          email: c.email ?? ''
        };
      }
    } finally {
      loading = false;
    }
  });

  async function save() {
    saving = true;
    notice = '';
    try {
      if (recordId) {
        await pb.collection('company_profile').update(recordId, form);
      } else {
        const row = await pb.collection('company_profile').create(form);
        recordId = row.id;
      }
      await logAudit(pb, {
        azione: 'company_profile_aggiornato',
        collection: 'company_profile',
        recordId,
        messaggio: 'Dati fiscali azienda aggiornati'
      });
      notice = 'Salvato. FatturaPA resta un blocco successivo: qui prepariamo anagrafica e SDI.';
    } catch (e) {
      console.error(e);
      notice = 'Salvataggio non riuscito. Verifica che la collection company_profile esista in PocketBase.';
    } finally {
      saving = false;
    }
  }

  $: ready = companyReadyForFatturaPA({ id: recordId, ...form });
</script>

<svelte:head><title>Dati azienda | ERP Spirito Alchemico</title></svelte:head>

<div class="space-y-5 fade-in max-w-3xl">
  <PageHeader
    titolo="Dati fiscali azienda"
    sottotitolo="Servono per proforma, copie gestionali e, dopo, FatturaPA. Non inventare P.IVA: inserisci quella vera."
  />

  {#if loading}
    <p class="text-sm text-[#6B7280]">Caricamento…</p>
  {:else}
    <Card>
      <p class="text-sm mb-4 {ready ? 'text-emerald-800' : 'text-amber-800'}">
        {#if ready}
          Anagrafica minima per FatturaPA presente (P.IVA, sede, regime). Manca ancora l’invio XML/SDI.
        {:else}
          Completa ragione sociale, P.IVA, indirizzo, città, CAP e regime fiscale. I 14 clienti andranno completati con P.IVA prima dell’SDI.
        {/if}
      </p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          save();
        }}
        class="grid gap-4 sm:grid-cols-2"
      >
        <div class="sm:col-span-2 space-y-1.5">
          <label class="text-sm font-medium" for="rs">Ragione sociale</label>
          <input id="rs" class="field w-full" bind:value={form.ragione_sociale} required />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="piva">Partita IVA</label>
          <input id="piva" class="field w-full" bind:value={form.partita_iva} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="cf">Codice fiscale</label>
          <input id="cf" class="field w-full" bind:value={form.codice_fiscale} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="rf">Regime fiscale (es. RF01)</label>
          <input id="rf" class="field w-full" bind:value={form.regime_fiscale} placeholder="RF01" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="sdi">Codice destinatario SDI</label>
          <input id="sdi" class="field w-full" bind:value={form.codice_sdi} />
        </div>
        <div class="sm:col-span-2 space-y-1.5">
          <label class="text-sm font-medium" for="ind">Indirizzo</label>
          <input id="ind" class="field w-full" bind:value={form.indirizzo} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="cap">CAP</label>
          <input id="cap" class="field w-full" bind:value={form.cap} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="citta">Città</label>
          <input id="citta" class="field w-full" bind:value={form.citta} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="pr">Provincia</label>
          <input id="pr" class="field w-full" bind:value={form.provincia} maxlength="2" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="pec">PEC</label>
          <input id="pec" type="email" class="field w-full" bind:value={form.pec} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="iban">IBAN</label>
          <input id="iban" class="field w-full" bind:value={form.iban} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="tel">Telefono</label>
          <input id="tel" class="field w-full" bind:value={form.telefono} />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="em">Email</label>
          <input id="em" type="email" class="field w-full" bind:value={form.email} />
        </div>
        {#if notice}
          <p class="sm:col-span-2 text-sm text-[#6B7280]">{notice}</p>
        {/if}
        <div class="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva'}</Button>
        </div>
      </form>
    </Card>
  {/if}
</div>
