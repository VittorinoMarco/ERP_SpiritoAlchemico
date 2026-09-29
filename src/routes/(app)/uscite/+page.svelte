<script lang="ts">
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import KpiCard from '$lib/components/layout/KpiCard.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { ymdLocal } from '$lib/utils/format';
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

  const today = ymdLocal(new Date());
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
    const lim = ymdLocal(limit);
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

<div class="space-y-5 fade-in">
  <PageHeader
    titolo="Uscite & note spese"
    sottotitolo="Imponibile e IVA separati. Da Magazzino usa «Acquisto fornitore» o «Fattura fornitore» per collegare carichi e uscita senza doppia contabilità."
  >
    {#if !collectionMissing && !loading}
      <Button onclick={openCreate}>
        <Plus class="h-4 w-4" />
        Nuova uscita
      </Button>
    {/if}
  </PageHeader>

  {#if loadError}
    <div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2 items-start">
      <AlertCircle class="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div>
        <p class="font-medium">Attenzione</p>
        <p class="text-amber-800/90">{loadError}</p>
      </div>
    </div>
  {/if}

  {#if loading}
    <Spinner />
  {:else if !collectionMissing}
    <section class="page-grid">
      <KpiCard tone="dark" label={`Totale mese (${currentMonth})`} valore={formatEuro(totaleMeseCorrente)} />
      <KpiCard tone="yellow" label="Da gestire" valore={String(daGestire)} trend="flat" trendLabel="Programmate/future non completate" />
      <KpiCard label="Prossimi 14 giorni" valore={String(prossime14)} trend="flat" trendLabel="Scadenze in arrivo" />
    </section>

    <Card className="!p-0 overflow-hidden">
      <div class="p-4 lg:p-5 flex flex-wrap gap-3 items-end border-b border-black/5">
        <div class="min-w-[9rem] flex-1 sm:flex-none">
          <label class="block text-xs font-medium text-[#6B7280] mb-1" for="f-tipo">Tipo</label>
          <select id="f-tipo" class="field w-full sm:w-auto" bind:value={filterTipo}>
            <option value="tutti">Tutti</option>
            <option value="immediata">Immediata</option>
            <option value="programmata">Programmata</option>
            <option value="futura">Futura</option>
          </select>
        </div>
        <div class="min-w-[9rem] flex-1 sm:flex-none">
          <label class="block text-xs font-medium text-[#6B7280] mb-1" for="f-mese">Mese</label>
          <input id="f-mese" type="month" class="field w-full sm:w-auto" bind:value={filterMese} />
        </div>
        <label class="flex items-center gap-2 text-sm cursor-pointer min-h-[44px]">
          <input type="checkbox" bind:checked={filterSoloDaGestire} class="h-4 w-4 rounded border-black/20" />
          Solo da completare
        </label>
      </div>

      {#if filtered.length === 0}
        <EmptyState icon={Wallet} titolo="Nessuna uscita" testo="Nessuna uscita corrisponde ai filtri selezionati." />
      {:else}
        <!-- Mobile -->
        <ul class="md:hidden divide-y divide-black/5">
          {#each filtered as e (e.id)}
            <li class="p-4 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium truncate">{e.descrizione || '—'}</p>
                  <p class="text-xs text-[#6B7280] mt-0.5 flex items-center gap-1">
                    <Calendar class="h-3 w-3" />{formatDate(e.data_spesa)}
                    {#if e.categoria}· {e.categoria}{/if}
                    {#if e.numero_documento}· Doc. {e.numero_documento}{/if}
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-semibold">{formatEuro(Number(e.importo) || 0)}</p>
                  {#if e.iva_importo != null && Number(e.iva_importo) > 0}
                    <p class="text-xs text-[#6B7280]">IVA {formatEuro(Number(e.iva_importo))}</p>
                  {/if}
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {EXPENSE_TIPO_BADGE[e.tipo as ExpenseTipo] ?? 'bg-gray-100'}">
                  {EXPENSE_TIPO_LABELS[e.tipo as ExpenseTipo] ?? e.tipo}
                </span>
                {#if e.tipo !== 'immediata'}
                  <button
                    type="button"
                    class="chip !min-h-0 !py-1 !px-3 !text-xs {e.completata ? 'chip-active' : ''}"
                    onclick={() => toggleCompletata(e)}
                  >
                    {e.completata ? 'Completata' : 'Da sostenere'}
                  </button>
                {/if}
                {#if allegatoUrl(e)}
                  <a href={allegatoUrl(e)!} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 text-xs font-medium underline">
                    <Paperclip class="h-3.5 w-3.5" />Allegato
                  </a>
                {/if}
                {#if movimentiCollegatiCount(e) > 0}
                  <a href="/magazzino" class="text-xs font-medium text-sky-700 underline">{movimentiCollegatiCount(e)} mov. magazzino</a>
                {/if}
                <span class="ml-auto flex">
                  <button type="button" class="h-10 w-10 grid place-items-center rounded-xl text-[#6B7280] hover:bg-black/5" onclick={() => openEdit(e)} aria-label="Modifica">
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button type="button" class="h-10 w-10 grid place-items-center rounded-xl text-rose-600 hover:bg-rose-50" onclick={() => (deleteId = e.id)} aria-label="Elimina">
                    <Trash2 class="h-4 w-4" />
                  </button>
                </span>
              </div>
            </li>
          {/each}
        </ul>

        <!-- Desktop -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-black/5 text-left text-xs text-[#6B7280]">
                <th class="px-4 py-3">Data</th>
                <th class="px-3 py-3">Tipo</th>
                <th class="px-3 py-3">Descrizione</th>
                <th class="px-3 py-3 text-right">Imponibile</th>
                <th class="px-3 py-3 text-right">IVA</th>
                <th class="px-3 py-3">Stato</th>
                <th class="px-3 py-3 text-center">Mag.</th>
                <th class="px-3 py-3">Allegato</th>
                <th class="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as e (e.id)}
                <tr class="border-b border-black/5 last:border-0 hover:bg-[#FFFDE7]/50">
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1"><Calendar class="h-3.5 w-3.5 text-[#9CA3AF]" />{formatDate(e.data_spesa)}</span>
                  </td>
                  <td class="px-3 py-3">
                    <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {EXPENSE_TIPO_BADGE[e.tipo as ExpenseTipo] ?? 'bg-gray-100'}">
                      {EXPENSE_TIPO_LABELS[e.tipo as ExpenseTipo] ?? e.tipo}
                    </span>
                    <span class="block text-[11px] text-[#9CA3AF] mt-0.5">
                      {EXPENSE_ORIGINE_LABELS[(e.origine as ExpenseOrigine) || 'manuale'] ?? 'Manuale'}
                    </span>
                  </td>
                  <td class="px-3 py-3 max-w-[260px]">
                    <p class="font-medium truncate">{e.descrizione || '—'}</p>
                    {#if e.numero_documento}<p class="text-xs text-[#6B7280]">Doc. {e.numero_documento}</p>{/if}
                    {#if e.categoria}<p class="text-xs text-[#6B7280]">{e.categoria}</p>{/if}
                  </td>
                  <td class="px-3 py-3 text-right font-semibold">{formatEuro(Number(e.importo) || 0)}</td>
                  <td class="px-3 py-3 text-right text-[#6B7280]">
                    {e.iva_importo != null && Number(e.iva_importo) > 0 ? formatEuro(Number(e.iva_importo)) : '—'}
                  </td>
                  <td class="px-3 py-3">
                    {#if e.tipo === 'immediata'}
                      <span class="text-xs text-[#6B7280]">Registrata</span>
                    {:else}
                      <button type="button" class="text-xs underline decoration-dotted" onclick={() => toggleCompletata(e)}>
                        {e.completata ? 'Completata' : 'Da sostenere'}
                      </button>
                    {/if}
                  </td>
                  <td class="px-3 py-3 text-center">
                    {#if movimentiCollegatiCount(e) > 0}
                      <a href="/magazzino" class="text-xs font-medium text-sky-700 underline" title="{movimentiCollegatiCount(e)} movimenti collegati">{movimentiCollegatiCount(e)}</a>
                    {:else}<span class="text-xs text-[#9CA3AF]">—</span>{/if}
                  </td>
                  <td class="px-3 py-3">
                    {#if allegatoUrl(e)}
                      <a href={allegatoUrl(e)!} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 text-xs font-medium hover:underline">
                        <Paperclip class="h-3.5 w-3.5" />Apri<ExternalLink class="h-3 w-3" />
                      </a>
                    {:else}<span class="text-xs text-[#9CA3AF]">—</span>{/if}
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button type="button" class="p-2 rounded-xl text-[#6B7280] hover:bg-black/5" onclick={() => openEdit(e)} aria-label="Modifica"><Pencil class="h-4 w-4" /></button>
                    <button type="button" class="p-2 rounded-xl text-rose-600 hover:bg-rose-50" onclick={() => (deleteId = e.id)} aria-label="Elimina"><Trash2 class="h-4 w-4" /></button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {:else}
    <Card>
      <EmptyState icon={Wallet} titolo="Configura PocketBase" testo="Crea la collection expenses seguendo la guida in docs/POCKETBASE_SCHEMA.md." />
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
        class="field w-full"
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
          class="field w-full"
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
          class="field w-full"
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
        class="field w-full"
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
