<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { Client, ClientTipo } from '$lib/types/client';
  import { pb } from '$lib/pocketbase';

  export let open = false;
  export let client: Client | null = null;
  export let agents: { id: string; name?: string; email?: string }[] = [];
  export let isAdmin = false;

  const dispatch = createEventDispatcher<{ close: void; saved: Client }>();

  let ragione_sociale = '';
  let tipo: ClientTipo = 'horeca';
  let partita_iva = '';
  let codice_sdi = '';
  let pec = '';
  let indirizzo = '';
  let citta = '';
  let provincia = '';
  let cap = '';
  let telefono = '';
  let email = '';
  let agente = '';
  let note = '';
  let errors: Record<string, string> = {};
  let saving = false;

  $: if (open && client) {
    ragione_sociale = client.ragione_sociale ?? '';
    tipo = (client.tipo as ClientTipo) ?? 'horeca';
    partita_iva = client.partita_iva ?? '';
    codice_sdi = client.codice_sdi ?? '';
    pec = client.pec ?? '';
    indirizzo = client.indirizzo ?? '';
    citta = client.citta ?? '';
    provincia = client.provincia ?? '';
    cap = client.cap ?? '';
    telefono = client.telefono ?? '';
    email = client.email ?? '';
    agente = client.agente ?? '';
    note = client.note ?? '';
    errors = {};
  } else if (open && !client) {
    ragione_sociale = tipo = partita_iva = codice_sdi = pec = indirizzo = citta = provincia = cap = telefono = email = note = '';
    tipo = 'horeca';
    agente = '';
    errors = {};
  }

  function validate(): boolean {
    errors = {};
    if (!ragione_sociale.trim()) errors.ragione_sociale = 'Ragione sociale obbligatoria';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email non valida';
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate() || saving) return;
    saving = true;

    try {
      const data: Record<string, unknown> = {
        ragione_sociale: ragione_sociale.trim(),
        tipo,
        partita_iva: partita_iva.trim() || undefined,
        codice_sdi: codice_sdi.trim() || undefined,
        pec: pec.trim() || undefined,
        indirizzo: indirizzo.trim() || undefined,
        citta: citta.trim() || undefined,
        provincia: provincia.trim() || undefined,
        cap: cap.trim() || undefined,
        telefono: telefono.trim() || undefined,
        email: email.trim() || undefined,
        note: note.trim() || undefined
      };
      if (isAdmin) {
        data.agente = agente || undefined;
      }

      let saved: Client;
      if (client?.id) {
        saved = await pb.collection('clients').update(client.id, data) as Client;
      } else {
        saved = await pb.collection('clients').create(data) as Client;
      }
      dispatch('saved', saved);
      dispatch('close');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : 'Errore salvataggio';
      errors.submit = msg;
    } finally {
      saving = false;
    }
  }
</script>

<Modal open={open} title={client ? 'Modifica cliente' : 'Nuovo cliente'} size="xl" on:close={() => dispatch('close')}>
  <form onsubmit={handleSubmit} class="space-y-5">
    <div class="grid gap-5 sm:grid-cols-2">
      <Input
        id="ragione_sociale"
        label="Ragione sociale"
        bind:value={ragione_sociale}
        placeholder="Es. Bar Roma S.r.l."
        required
        error={errors.ragione_sociale}
      />
      <div class="space-y-1.5">
        <label for="tipo" class="block text-sm font-medium text-[#1A1A1A]">Tipo</label>
        <select
          id="tipo"
          bind:value={tipo}
          class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 transition-all duration-200"
        >
          <option value="horeca">HORECA</option>
          <option value="ecommerce">E-commerce</option>
          <option value="distributore">Distributore</option>
        </select>
      </div>
    </div>

    {#if isAdmin}
      <div class="space-y-1.5">
        <label for="agente" class="block text-sm font-medium text-[#1A1A1A]">Agente</label>
        <select
          id="agente"
          bind:value={agente}
          class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 transition-all duration-200"
        >
          <option value="">Nessun agente</option>
          {#each agents as a}
            <option value={a.id}>{a.name || a.email || a.id}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="grid gap-5 sm:grid-cols-2">
      <Input id="partita_iva" label="Partita IVA" bind:value={partita_iva} placeholder="IT12345678901" />
      <Input id="codice_sdi" label="Codice SDI" bind:value={codice_sdi} placeholder="XXXXXXX" />
    </div>

    <Input id="pec" label="PEC" type="email" bind:value={pec} placeholder="pec@azienda.it" />

    <div class="space-y-1.5">
      <label for="indirizzo" class="block text-sm font-medium text-[#1A1A1A]">Indirizzo</label>
      <input
        id="indirizzo"
        type="text"
        bind:value={indirizzo}
        placeholder="Via, numero civico"
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 transition-all duration-200"
      />
    </div>

    <div class="grid gap-5 sm:grid-cols-3">
      <Input id="citta" label="Città" bind:value={citta} placeholder="Città" />
      <Input id="provincia" label="Provincia" bind:value={provincia} placeholder="RM" />
      <Input id="cap" label="CAP" bind:value={cap} placeholder="00100" />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <Input id="telefono" label="Telefono" bind:value={telefono} placeholder="+39 06 1234567" />
      <Input id="email" label="Email" type="email" bind:value={email} placeholder="contatto@azienda.it" error={errors.email} />
    </div>

    <div>
      <label for="note" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Note</label>
      <textarea
        id="note"
        bind:value={note}
        rows="3"
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 transition-all duration-200"
        placeholder="Note aggiuntive"
      ></textarea>
    </div>

    {#if errors.submit}
      <p class="text-xs text-rose-600">{errors.submit}</p>
    {/if}

    <div class="flex justify-end gap-3 pt-2">
      <Button type="button" variant="ghost" onclick={() => dispatch('close')}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Salvataggio...' : client ? 'Salva modifiche' : 'Crea cliente'}
      </Button>
    </div>
  </form>
</Modal>
