<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ClientResponseError } from 'pocketbase';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import {
    Plus,
    Pencil,
    Trash2,
    Paperclip,
    ExternalLink,
    AlertCircle,
    Calendar,
    Wallet
  } from 'lucide-svelte';
  import type { Expense, ExpenseTipo, ExpenseOrigine } from '$lib/types/expense';
  import {
    EXPENSE_TIPO_LABELS,
    EXPENSE_TIPO_BADGE,
    EXPENSE_ORIGINE_LABELS
  } from '$lib/types/expense';

  type Role = 'admin' | 'agente' | 'magazziniere';
  let role: Role | null = null;

  let expenses: Expense[] = [];
  let loading = true;
  let loadError: string | null = null;
  let collectionMissing = false;

  let filterTipo: ExpenseTipo | 'tutti' = 'tutti';
  let filterMese = ''; // YYYY-MM, vuoto = tutti
  let filterSoloDaGestire = false;

  let modalOpen = false;
  let editingId: string | null = null;
  let saving = false;
  let formTipo: ExpenseTipo = 'immediata';
  let formDataSpesa = '';
  let formImporto = '';
  let formDescrizione = '';
  let formCategoria = '';
  let formNote = '';
  let formCompletata = false;
  let formFile: FileList | null = null;
  let formIvaImporto = '';
  let formNumeroDocumento = '';
  let formOrigine: ExpenseOrigine = 'manuale';
  let editingOrigineMagazzino = false;
  let deleteId: string | null = null;
  let deleting = false;

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.slice(0, 7);

  $: filtered = expenses.filter((e) => {
    if (filterTipo !== 'tutti' && e.tipo !== filterTipo) return false;
    if (filterMese && e.data_spesa && e.data_spesa.slice(0, 7) !== filterMese) return false;
    if (filterSoloDaGestire) {
      const need =
        (e.tipo === 'programmata' || e.tipo === 'futura') && !e.completata;
      if (!need) return false;
    }
    return true;
  });

  $: totaleMeseCorrente = expenses
    .filter((e) => e.data_spesa?.slice(0, 7) === currentMonth)
    .reduce((s, e) => s + (Number(e.importo) || 0), 0);

  $: daGestire = expenses.filter(
    (e) =>
      (e.tipo === 'programmata' || e.tipo === 'futura') &&
      !e.completata
  ).length;

  $: prossime14 = (() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 14);
    const lim = limit.toISOString().split('T')[0];
    return expenses.filter((e) => {
      if (e.completata) return false;
      if (e.tipo !== 'programmata' && e.tipo !== 'futura') return false;
      const d = e.data_spesa;
      return d && d >= today && d <= lim;
    }).length;
  })();

  function isAdmin(): boolean {
    const u = pb.authStore.model as { ruolo?: string; role?: string } | null;
    const r = u?.ruolo || u?.role;
    return !r || r === 'admin';
  }

  onMount(async () => {
    const u = pb.authStore.model as { ruolo?: string; role?: string } | null;
    role = ((u?.ruolo || u?.role || 'admin') as Role) || 'admin';
    if (!isAdmin()) {
      goto('/');
      return;
    }
    await loadExpenses();
  });

  async function loadExpenses() {
    loading = true;
    loadError = null;
    collectionMissing = false;
    try {
      const list = await pb.collection('expenses').getFullList<Expense>({
        sort: '-data_spesa,-created'
      });
      expenses = list as unknown as Expense[];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const is404 = e instanceof ClientResponseError && e.status === 404;
      if (is404 || /404|not found|wasn't found/i.test(msg)) {
        collectionMissing = true;
        loadError =
          'Collection PocketBase `expenses` non trovata. Crea la collection come da docs/POCKETBASE_SCHEMA.md';
      } else {
        loadError = msg || 'Errore caricamento uscite';
      }
      expenses = [];
    } finally {
      loading = false;
    }
  }

  function movimentiCollegatiCount(e: Expense): number {
    const m = e.movimenti_collegati;
    if (!m) return 0;
    if (Array.isArray(m)) return m.length;
    if (typeof m === 'string') {
      try {
        const a = JSON.parse(m) as unknown;
        return Array.isArray(a) ? a.length : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  function openCreate() {
    editingId = null;
    formTipo = 'immediata';
    formDataSpesa = today;
    formImporto = '';
    formDescrizione = '';
    formCategoria = '';
    formNote = '';
    formCompletata = true;
    formFile = null;
    formIvaImporto = '';
    formNumeroDocumento = '';
    formOrigine = 'manuale';
    editingOrigineMagazzino = false;
    modalOpen = true;
  }

  function openEdit(e: Expense) {
    editingId = e.id;
    formTipo = (e.tipo as ExpenseTipo) || 'immediata';
    formDataSpesa = e.data_spesa?.slice(0, 10) ?? today;
    formImporto = String(e.importo ?? '');
    formDescrizione = e.descrizione ?? '';
    formCategoria = e.categoria ?? '';
    formNote = e.note ?? '';
    formCompletata = !!e.completata || e.tipo === 'immediata';
    formFile = null;
    formIvaImporto =
      e.iva_importo != null && !Number.isNaN(Number(e.iva_importo)) ? String(e.iva_importo) : '';
    formNumeroDocumento = e.numero_documento ?? '';
    const o = (e.origine as ExpenseOrigine) || 'manuale';
    formOrigine = o;
    editingOrigineMagazzino = o === 'acquisto_magazzino' || o === 'fattura_fornitore';
    modalOpen = true;
  }

  $: if (formTipo === 'immediata') formCompletata = true;

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append('tipo', formTipo);
    fd.append('data_spesa', formDataSpesa);
    const imp = parseFloat(String(formImporto).replace(',', '.'));
    fd.append('importo', String(Number.isFinite(imp) ? imp : 0));
    const iva = parseFloat(String(formIvaImporto).replace(',', '.'));
    if (Number.isFinite(iva) && iva >= 0) fd.append('iva_importo', String(iva));
    if (formNumeroDocumento.trim()) fd.append('numero_documento', formNumeroDocumento.trim());
    if (!editingId || !editingOrigineMagazzino) {
      fd.append('origine', formOrigine);
    }
    if (formDescrizione.trim()) fd.append('descrizione', formDescrizione.trim());
    if (formCategoria.trim()) fd.append('categoria', formCategoria.trim());
    if (formNote.trim()) fd.append('note', formNote.trim());
    fd.append('completata', formCompletata ? 'true' : 'false');
    const uid = pb.authStore.model?.id;
    if (uid && !editingId) fd.append('creato_da', uid);
    if (formFile?.[0]) fd.append('allegato', formFile[0]);
    return fd;
  }

  async function saveExpense() {
    const imp = parseFloat(String(formImporto).replace(',', '.'));
    if (!formDataSpesa || !Number.isFinite(imp) || imp <= 0) return;
    saving = true;
    try {
      const fd = buildFormData();
      if (editingId) {
        await pb.collection('expenses').update(editingId, fd);
      } else {
        await pb.collection('expenses').create(fd);
      }
      modalOpen = false;
      await loadExpenses();
    } catch (e) {
      console.error(e);
      loadError = e instanceof Error ? e.message : 'Salvataggio fallito';
    } finally {
      saving = false;
    }
  }

  async function confirmDelete() {
    if (!deleteId || deleting) return;
    const row = expenses.find((x) => x.id === deleteId);
    const nMov = row ? movimentiCollegatiCount(row) : 0;
    if (nMov > 0) {
      const ok = confirm(
        `Questa uscita è collegata a ${nMov} movimento/i di magazzino. Eliminarla non annulla i carichi: solo la registrazione contabile. Continuare?`
      );
      if (!ok) return;
    }
    deleting = true;
    try {
      await pb.collection('expenses').delete(deleteId);
      deleteId = null;
      await loadExpenses();
    } catch (e) {
      console.error(e);
    } finally {
      deleting = false;
    }
  }

  async function toggleCompletata(e: Expense) {
    if (e.tipo === 'immediata') return;
    try {
      await pb.collection('expenses').update(e.id, { completata: !e.completata });
      await loadExpenses();
    } catch (err) {
      console.error(err);
    }
  }

  function allegatoUrl(e: Expense): string | null {
    if (!e.allegato) return null;
    return pb.files.getUrl(e as unknown as { id: string; collectionId: string; collectionName: string }, e.allegato);
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  }
</script>

<svelte:head>
  <title>Uscite / Note spese | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Uscite & note spese</h1>
      <p class="text-sm text-[#6B7280] mt-1">
        Imponibile e IVA separati; da <strong>Magazzino</strong> usa «Acquisto fornitore» o «Fattura fornitore» per
        collegare carichi e uscita senza doppia contabilità.
      </p>
    </div>
    {#if !collectionMissing && !loading}
      <Button variant="primary" onclick={openCreate} className="inline-flex items-center gap-2">
        <Plus class="h-4 w-4" />
        Nuova uscita
      </Button>
    {/if}
  </div>

  {#if loadError}
    <div
      class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2 items-start"
    >
      <AlertCircle class="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div>
        <p class="font-medium">Attenzione</p>
        <p class="text-amber-800/90">{loadError}</p>
      </div>
    </div>
  {/if}

  {#if loading}
    <Card>
      <div class="py-16 text-center text-sm text-[#6B7280]">Caricamento…</div>
    </Card>
  {:else if !collectionMissing}
    <section class="page-grid">
      <div class="rounded-3xl bg-[#1A1A1A] text-white shadow-sm p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-white/70">Totale mese ({currentMonth})</p>
        <p class="text-2xl font-bold mt-1">{formatEuro(totaleMeseCorrente)}</p>
      </div>
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Da gestire</p>
        <p class="text-2xl font-bold text-amber-600 mt-1">{daGestire}</p>
        <p class="text-xs text-[#6B7280] mt-1">Programmate/future non completate</p>
      </div>
      <div class="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 lg:p-6">
        <p class="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Prossimi 14 giorni</p>
        <p class="text-2xl font-bold text-sky-700 mt-1">{prossime14}</p>
        <p class="text-xs text-[#6B7280] mt-1">Scadenze in arrivo</p>
      </div>
    </section>

    <Card>
      <div class="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label class="block text-xs font-medium text-[#6B7280] mb-1" for="f-tipo">Tipo</label>
          <select
            id="f-tipo"
            class="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            bind:value={filterTipo}
          >
            <option value="tutti">Tutti</option>
            <option value="immediata">Immediata</option>
            <option value="programmata">Programmata</option>
            <option value="futura">Futura</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-[#6B7280] mb-1" for="f-mese">Mese</label>
          <input
            id="f-mese"
            type="month"
            class="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            bind:value={filterMese}
          />
        </div>
        <label class="flex items-center gap-2 text-sm text-[#1A1A1A] cursor-pointer">
          <input type="checkbox" bind:checked={filterSoloDaGestire} class="rounded border-black/20" />
          Solo da completare
        </label>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-black/5 text-left text-xs text-[#6B7280]">
              <th class="px-3 py-2">Data</th>
              <th class="px-3 py-2">Tipo</th>
              <th class="px-3 py-2">Origine</th>
              <th class="px-3 py-2">Descrizione</th>
              <th class="px-3 py-2 text-right">Imponibile</th>
              <th class="px-3 py-2 text-right">IVA</th>
              <th class="px-3 py-2">Stato</th>
              <th class="px-3 py-2">Mag.</th>
              <th class="px-3 py-2">Allegato</th>
              <th class="px-3 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as e (e.id)}
              <tr class="border-b border-black/5 hover:bg-[#FFFDE7]/50">
                <td class="px-3 py-2.5 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1 text-[#1A1A1A]">
                    <Calendar class="h-3.5 w-3.5 text-[#9CA3AF]" />
                    {formatDate(e.data_spesa)}
                  </span>
                </td>
                <td class="px-3 py-2.5">
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {EXPENSE_TIPO_BADGE[
                      e.tipo as ExpenseTipo
                    ] ?? 'bg-gray-100'}"
                  >
                    {EXPENSE_TIPO_LABELS[e.tipo as ExpenseTipo] ?? e.tipo}
                  </span>
                </td>
                <td class="px-3 py-2.5">
                  <span class="text-xs text-[#6B7280]">
                    {EXPENSE_ORIGINE_LABELS[(e.origine as ExpenseOrigine) || 'manuale'] ?? 'Manuale'}
                  </span>
                </td>
                <td class="px-3 py-2.5 max-w-[200px]">
                  <p class="font-medium text-[#1A1A1A] truncate">{e.descrizione || '—'}</p>
                  {#if e.numero_documento}
                    <p class="text-xs text-[#6B7280]">Doc. {e.numero_documento}</p>
                  {/if}
                  {#if e.categoria}
                    <p class="text-xs text-[#6B7280]">{e.categoria}</p>
                  {/if}
                </td>
                <td class="px-3 py-2.5 text-right font-semibold">{formatEuro(Number(e.importo) || 0)}</td>
                <td class="px-3 py-2.5 text-right text-sm text-[#6B7280]">
                  {e.iva_importo != null && Number(e.iva_importo) > 0
                    ? formatEuro(Number(e.iva_importo))
                    : '—'}
                </td>
                <td class="px-3 py-2.5">
                  {#if e.tipo === 'immediata'}
                    <span class="text-xs text-[#6B7280]">Registrata</span>
                  {:else}
                    <button
                      type="button"
                      class="text-xs underline decoration-dotted text-[#1A1A1A]"
                      onclick={() => toggleCompletata(e)}
                    >
                      {e.completata ? 'Completata' : 'Da sostenere'}
                    </button>
                  {/if}
                </td>
                <td class="px-3 py-2.5 text-center">
                  {#if movimentiCollegatiCount(e) > 0}
                    <a
                      href="/magazzino"
                      class="text-xs font-medium text-sky-700 underline"
                      title="{movimentiCollegatiCount(e)} movimenti collegati"
                    >
                      {movimentiCollegatiCount(e)}
                    </a>
                  {:else}
                    <span class="text-xs text-[#9CA3AF]">—</span>
                  {/if}
                </td>
                <td class="px-3 py-2.5">
                  {#if allegatoUrl(e)}
                    <a
                      href={allegatoUrl(e)!}
                      target="_blank"
                      rel="noreferrer"
                      class="inline-flex items-center gap-1 text-xs text-[#F5D547] font-medium hover:underline"
                    >
                      <Paperclip class="h-3.5 w-3.5" />
                      Apri
                      <ExternalLink class="h-3 w-3" />
                    </a>
                  {:else}
                    <span class="text-xs text-[#9CA3AF]">—</span>
                  {/if}
                </td>
                <td class="px-3 py-2.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-[#6B7280] hover:bg-black/5"
                    onclick={() => openEdit(e)}
                    aria-label="Modifica"
                  >
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                    onclick={() => (deleteId = e.id)}
                    aria-label="Elimina"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if filtered.length === 0}
          <p class="text-center text-sm text-[#6B7280] py-10">Nessuna uscita con questi filtri.</p>
        {/if}
      </div>
    </Card>
  {:else}
    <Card>
      <div class="py-12 text-center space-y-3">
        <Wallet class="h-12 w-12 mx-auto text-[#E5E7EB]" />
        <p class="text-[#1A1A1A] font-medium">Configura PocketBase</p>
        <p class="text-sm text-[#6B7280] max-w-md mx-auto">
          Crea la collection <code class="bg-black/5 px-1 rounded">expenses</code> seguendo la guida in
          <code class="bg-black/5 px-1 rounded">docs/POCKETBASE_SCHEMA.md</code>.
        </p>
      </div>
    </Card>
  {/if}
</div>

<Modal
  open={modalOpen}
  title={editingId ? 'Modifica uscita' : 'Nuova uscita'}
  size="lg"
  on:close={() => (modalOpen = false)}
>
  <div class="space-y-4">
    {#if editingOrigineMagazzino}
      <p class="text-xs rounded-2xl bg-sky-50 text-sky-900 px-3 py-2 border border-sky-100">
        Origine <strong>magazzino / fattura fornitore</strong>: collegata a movimenti di carico. Modifica imponibile/IVA
        solo per allineare al documento; per nuovi acquisti usa i pulsanti in Magazzino.
      </p>
    {/if}
    <div>
      <label class="block text-sm font-medium text-[#1A1A1A] mb-1" for="form-tipo">Tipo</label>
      <select
        id="form-tipo"
        class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm"
        bind:value={formTipo}
      >
        <option value="immediata">{EXPENSE_TIPO_LABELS.immediata}</option>
        <option value="programmata">{EXPENSE_TIPO_LABELS.programmata}</option>
        <option value="futura">{EXPENSE_TIPO_LABELS.futura}</option>
      </select>
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-[#1A1A1A] mb-1" for="form-data">Data</label>
        <input
          id="form-data"
          type="date"
          class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm"
          bind:value={formDataSpesa}
          required
        />
      </div>
      <Input
        id="form-importo"
        label="Imponibile (€)"
        type="text"
        bind:value={formImporto}
        placeholder="es. 927,63"
        required
      />
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
      <Input
        id="form-iva"
        label="IVA (€) — opzionale"
        type="text"
        bind:value={formIvaImporto}
        placeholder="es. 188,68"
      />
      <Input
        id="form-numdoc"
        label="N. documento (opz.)"
        type="text"
        bind:value={formNumeroDocumento}
        placeholder="es. P043/2026"
      />
    </div>
    {#if !editingOrigineMagazzino}
      <div>
        <label class="block text-sm font-medium text-[#1A1A1A] mb-1" for="form-origine">Origine contabile</label>
        <select
          id="form-origine"
          class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm"
          bind:value={formOrigine}
        >
          <option value="manuale">{EXPENSE_ORIGINE_LABELS.manuale}</option>
          <option value="acquisto_magazzino">{EXPENSE_ORIGINE_LABELS.acquisto_magazzino}</option>
          <option value="fattura_fornitore">{EXPENSE_ORIGINE_LABELS.fattura_fornitore}</option>
        </select>
      </div>
    {/if}
    <Input id="form-desc" label="Descrizione" bind:value={formDescrizione} placeholder="Es. Fornitore energia" />
    <Input id="form-cat" label="Categoria (opz.)" bind:value={formCategoria} placeholder="Es. Utenze, Marketing" />
    <div>
      <label class="block text-sm font-medium text-[#1A1A1A] mb-1" for="form-note">Note</label>
      <textarea
        id="form-note"
        rows="2"
        class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm"
        bind:value={formNote}
        placeholder="Dettagli aggiuntivi"
      ></textarea>
    </div>
    {#if formTipo !== 'immediata'}
      <label class="flex items-center gap-2 text-sm text-[#1A1A1A]">
        <input type="checkbox" bind:checked={formCompletata} class="rounded border-black/20" />
        Segna come già sostenuta / pagata
      </label>
    {/if}
    <div>
      <label class="block text-sm font-medium text-[#1A1A1A] mb-1" for="form-file">Allegato (fattura / scontrino)</label>
      <input
        id="form-file"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
        class="block w-full text-sm text-[#6B7280] file:mr-3 file:rounded-xl file:border-0 file:bg-[#FFF3CD] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#1A1A1A]"
        bind:files={formFile}
      />
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onclick={() => (modalOpen = false)}>Annulla</Button>
      <Button
        variant="primary"
        onclick={saveExpense}
        disabled={saving || !formDataSpesa || !formImporto}
      >
        {saving ? 'Salvataggio…' : 'Salva'}
      </Button>
    </div>
  </div>
</Modal>

{#if deleteId}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-white rounded-3xl shadow-xl p-6 max-w-sm w-full">
      <p class="font-medium text-[#1A1A1A]">Eliminare questa uscita?</p>
      <p class="text-sm text-[#6B7280] mt-2">L’azione non è reversibile.</p>
      <div class="flex gap-2 mt-6 justify-end">
        <Button variant="ghost" onclick={() => (deleteId = null)}>Annulla</Button>
        <Button variant="primary" className="!bg-rose-600" onclick={confirmDelete} disabled={deleting}>
          {deleting ? '…' : 'Elimina'}
        </Button>
      </div>
    </div>
  </div>
{/if}
