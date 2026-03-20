<script lang="ts">
  import { pb } from '$lib/pocketbase';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { registraAcquistoFornitoreConUscita } from '$lib/utils/supplierExpenseApply';
  import { extractTextFromPdfFile } from '$lib/utils/pdfText';
  import { parseSupplierInvoiceText, type SupplierInvoiceLineParsed } from '$lib/utils/supplierInvoiceAi';
  import {
    firstMatchProductId,
    bestProductCandidates,
    isProductSelectableForInvoice
  } from '$lib/utils/supplierProductMatch';
  import type { Product } from '$lib/types/product';
  import { Truck, FileUp, Loader2 } from 'lucide-svelte';

  export let products: Product[] = [];
  export let onApplied: () => void | Promise<void> = async () => {};

  /** --- Acquisto fornitore (manuale, una uscita) --- */
  let acquistoOpen = false;
  let acquistoData = '';
  let acquistoNumero = '';
  let acquistoImponibile = '';
  let acquistoIva = '';
  let acquistoNote = '';
  let acquistoLines: { prodottoId: string; qty: string }[] = [{ prodottoId: '', qty: '' }];
  let acquistoSaving = false;
  let acquistoErr = '';

  /** --- Fattura PDF + AI --- */
  let fatturaOpen = false;
  let fatturaStep: 'input' | 'review' = 'input';
  let fatturaFile: FileList | null = null;
  let fatturaPaste = '';
  let fatturaExtracting = false;
  let fatturaParsing = false;
  let fatturaErr = '';
  let fatturaParsedNumero = '';
  let fatturaParsedData = '';
  let fatturaRows: (SupplierInvoiceLineParsed & { prodottoId: string })[] = [];
  let fatturaImponibile = '';
  let fatturaIva = '';
  let fatturaSaving = false;
  /** Fallback se il parent non ha ancora `products` (es. fallimento parziale loadData prima del fix). */
  let productsFallback: Product[] = [];

  const today = () => new Date().toISOString().split('T')[0];

  /** Catalogo effettivo per match e select (prop o fetch locale). */
  $: catalogProducts = products.length > 0 ? products : productsFallback;

  /** Restituisce sempre l’elenco da usare per match/select (evita stale state dopo await). */
  async function resolveCatalogForInvoice(): Promise<Product[]> {
    if (products.length > 0) {
      productsFallback = [];
      return products;
    }
    try {
      productsFallback = await pb.collection('products').getFullList<Product>();
      return productsFallback;
    } catch {
      productsFallback = [];
      return [];
    }
  }

  function addAcquistoLine() {
    acquistoLines = [...acquistoLines, { prodottoId: '', qty: '' }];
  }

  function removeAcquistoLine(i: number) {
    acquistoLines = acquistoLines.filter((_, j) => j !== i);
    if (acquistoLines.length === 0) acquistoLines = [{ prodottoId: '', qty: '' }];
  }

  function openAcquisto() {
    acquistoOpen = true;
    acquistoData = today();
    acquistoNumero = '';
    acquistoImponibile = '';
    acquistoIva = '';
    acquistoNote = '';
    acquistoLines = [{ prodottoId: '', qty: '' }];
    acquistoErr = '';
  }

  async function submitAcquisto() {
    acquistoErr = '';
    const imp = parseFloat(String(acquistoImponibile).replace(',', '.'));
    const iva = parseFloat(String(acquistoIva).replace(',', '.'));
    if (!acquistoData || !Number.isFinite(imp) || imp <= 0) {
      acquistoErr = 'Data e imponibile obbligatori.';
      return;
    }
    const ivaOk = Number.isFinite(iva) && iva >= 0 ? iva : Math.round(imp * 0.22 * 100) / 100;
    const linee = acquistoLines
      .map((l) => ({
        prodottoId: l.prodottoId,
        quantita: parseInt(l.qty, 10)
      }))
      .filter((l) => l.prodottoId && l.quantita > 0);
    if (linee.length === 0) {
      acquistoErr = 'Aggiungi almeno un prodotto con quantità.';
      return;
    }
    acquistoSaving = true;
    try {
      await registraAcquistoFornitoreConUscita(pb, {
        dataSpesa: acquistoData,
        imponibile: imp,
        ivaImporto: ivaOk,
        origine: 'acquisto_magazzino',
        numeroDocumento: acquistoNumero.trim() || undefined,
        descrizione: `Acquisto fornitore${acquistoNumero ? ` · ${acquistoNumero}` : ''}`,
        note: acquistoNote.trim() || undefined,
        allegato: null,
        linee
      });
      acquistoOpen = false;
      await onApplied();
    } catch (e) {
      acquistoErr = e instanceof Error ? e.message : 'Errore salvataggio';
    } finally {
      acquistoSaving = false;
    }
  }

  function openFattura() {
    fatturaOpen = true;
    fatturaStep = 'input';
    fatturaFile = null;
    fatturaPaste = '';
    fatturaErr = '';
    fatturaRows = [];
    fatturaImponibile = '';
    fatturaIva = '';
  }

  async function estraiTestoPdf() {
    fatturaErr = '';
    if (!fatturaFile?.[0]) {
      fatturaErr = 'Seleziona un PDF.';
      return;
    }
    fatturaExtracting = true;
    try {
      fatturaPaste = await extractTextFromPdfFile(fatturaFile[0]);
    } catch (e) {
      fatturaErr = e instanceof Error ? e.message : 'Lettura PDF fallita';
    } finally {
      fatturaExtracting = false;
    }
  }

  async function parseConAi() {
    fatturaErr = '';
    const key = $settingsStore.openaiApiKey ?? '';
    if (!key) {
      fatturaErr = 'Configura la chiave OpenAI in Impostazioni.';
      return;
    }
    const text = fatturaPaste.trim();
    if (!text) {
      fatturaErr = 'Estrai testo dal PDF o incolla il testo della fattura.';
      return;
    }
    fatturaParsing = true;
    try {
      const cat = await resolveCatalogForInvoice();
      const p = await parseSupplierInvoiceText(key, text);
      fatturaParsedNumero = p.numero_documento ?? '';
      fatturaParsedData = p.data_documento ?? today();
      fatturaRows = p.righe.map((r) => ({
        ...r,
        prodottoId: firstMatchProductId(r.descrizione, cat)
      }));
      const sumRighe = fatturaRows.reduce((s, r) => s + (Number(r.imponibile_riga) || 0), 0);
      const imp = p.imponibile_totale ?? sumRighe;
      fatturaImponibile = String(Math.round(imp * 100) / 100);
      const iv = p.iva_totale ?? Math.round(imp * ((p.aliquota_iva_percentuale || 22) / 100) * 100) / 100;
      fatturaIva = String(iv);
      fatturaStep = 'review';
    } catch (e) {
      fatturaErr = e instanceof Error ? e.message : 'Parsing fallito';
    } finally {
      fatturaParsing = false;
    }
  }

  async function applicaFattura() {
    fatturaErr = '';
    const key = $settingsStore.openaiApiKey ?? '';
    if (!key) {
      fatturaErr = 'API key mancante.';
      return;
    }
    const imp = parseFloat(String(fatturaImponibile).replace(',', '.'));
    const iva = parseFloat(String(fatturaIva).replace(',', '.'));
    if (!Number.isFinite(imp) || imp <= 0) {
      fatturaErr = 'Imponibile non valido.';
      return;
    }
    const ivaOk = Number.isFinite(iva) && iva >= 0 ? iva : Math.round(imp * 0.22 * 100) / 100;
    const linee = fatturaRows
      .filter((r) => r.prodottoId && r.quantita > 0)
      .map((r) => ({ prodottoId: r.prodottoId, quantita: Math.floor(Number(r.quantita)) }));
    if (linee.length === 0) {
      fatturaErr = 'Associa ogni riga a un prodotto in anagrafica.';
      return;
    }
    fatturaSaving = true;
    try {
      const pdf = fatturaFile?.[0] ?? null;
      await registraAcquistoFornitoreConUscita(pb, {
        dataSpesa: fatturaParsedData || today(),
        imponibile: imp,
        ivaImporto: ivaOk,
        origine: 'fattura_fornitore',
        numeroDocumento: fatturaParsedNumero || undefined,
        descrizione: `Fattura fornitore${fatturaParsedNumero ? ` ${fatturaParsedNumero}` : ''}`,
        note: `Righe: ${fatturaRows.map((r) => r.descrizione).join('; ')}`.slice(0, 1900),
        allegato: pdf,
        linee
      });
      fatturaOpen = false;
      await onApplied();
    } catch (e) {
      fatturaErr = e instanceof Error ? e.message : 'Errore';
    } finally {
      fatturaSaving = false;
    }
  }

  function formatEuro(n: number) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function productsForInvoiceRow(desc: string): Product[] {
    const list = catalogProducts;
    if (list.length === 0) return [];
    const sug = bestProductCandidates(desc, list, 12);
    const sugIds = new Set(sug.map((p) => p.id));
    const rest = list.filter((p) => isProductSelectableForInvoice(p) && !sugIds.has(p.id));
    const merged = [...sug, ...rest];
    if (merged.length === 0) return [...list];
    return merged;
  }
</script>

<div class="flex flex-wrap gap-2">
  <Button variant="secondary" size="sm" className="rounded-2xl" onclick={openAcquisto}>
    <Truck class="h-4 w-4" />
    Acquisto fornitore
  </Button>
  <Button variant="secondary" size="sm" className="rounded-2xl" onclick={openFattura}>
    <FileUp class="h-4 w-4" />
    Fattura fornitore (PDF + AI)
  </Button>
</div>

<Modal open={acquistoOpen} title="Acquisto fornitore → magazzino + uscita" size="xl" on:close={() => (acquistoOpen = false)}>
  <p class="text-sm text-[#6B7280] mb-4">
    Crea i <strong>carichi</strong> e <strong>una sola uscita</strong> (imponibile + IVA) così non duplichi la spesa in
    <a href="/uscite" class="text-[#F5D547] underline">Uscite</a>. Per carichi senza contabilità usa «Nuovo movimento».
  </p>
  {#if acquistoErr}
    <p class="text-sm text-rose-600 mb-3">{acquistoErr}</p>
  {/if}
  <div class="grid sm:grid-cols-2 gap-3 mb-4">
    <div>
      <label class="block text-xs font-medium text-[#6B7280] mb-1" for="acq-data">Data competenza</label>
      <input
        id="acq-data"
        type="date"
        bind:value={acquistoData}
        class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label class="block text-xs font-medium text-[#6B7280] mb-1" for="acq-num">N. documento (opz.)</label>
      <input
        id="acq-num"
        type="text"
        bind:value={acquistoNumero}
        placeholder="es. OC-2026-01"
        class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label class="block text-xs font-medium text-[#6B7280] mb-1" for="acq-imp">Imponibile totale (€)</label>
      <input
        id="acq-imp"
        type="text"
        bind:value={acquistoImponibile}
        placeholder="es. 927,63"
        class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label class="block text-xs font-medium text-[#6B7280] mb-1" for="acq-iva">IVA (€)</label>
      <input
        id="acq-iva"
        type="text"
        bind:value={acquistoIva}
        placeholder="vuoto = 22% su imponibile"
        class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
      />
    </div>
  </div>
  <p class="text-xs font-medium text-[#1A1A1A] mb-2">Righe merce</p>
  <div class="space-y-2 mb-4 max-h-56 overflow-y-auto">
    {#each acquistoLines as line, i}
      <div class="flex flex-wrap gap-2 items-center">
        <select
          class="flex-1 min-w-[160px] rounded-2xl border border-black/10 px-3 py-2 text-sm"
          bind:value={line.prodottoId}
        >
          <option value="">Prodotto…</option>
          {#each products.filter((p) => p.attivo) as p}
            <option value={p.id}>{p.nome} ({p.sku})</option>
          {/each}
        </select>
        <input
          type="number"
          min="1"
          bind:value={line.qty}
          placeholder="Qtà"
          class="w-24 rounded-2xl border border-black/10 px-3 py-2 text-sm"
        />
        <button type="button" class="text-xs text-rose-600 px-2" onclick={() => removeAcquistoLine(i)}>Rimuovi</button>
      </div>
    {/each}
  </div>
  <button type="button" class="text-sm text-[#F5D547] font-medium mb-3" onclick={addAcquistoLine}>+ Aggiungi riga</button>
  <div class="mb-4">
    <label class="block text-xs font-medium text-[#6B7280] mb-1" for="acq-note">Note</label>
    <textarea
      id="acq-note"
      bind:value={acquistoNote}
      rows="2"
      class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
    ></textarea>
  </div>
  <div class="flex justify-end gap-2">
    <Button variant="ghost" onclick={() => (acquistoOpen = false)}>Annulla</Button>
    <Button variant="primary" onclick={submitAcquisto} disabled={acquistoSaving}>
      {acquistoSaving ? 'Salvataggio…' : 'Registra carichi e uscita'}
    </Button>
  </div>
</Modal>

<Modal open={fatturaOpen} title="Import fattura fornitore (PDF)" size="xl" on:close={() => (fatturaOpen = false)}>
  {#if fatturaStep === 'input'}
    <p class="text-sm text-[#6B7280] mb-4">
      L’AI raggruppa <strong>prodotto + accisa + contrassegni</strong> per calcolare il prezzo imponibile unitario e la riga.
      Verifica sempre i totali prima di applicare.
    </p>
    <p class="text-xs text-[#6B7280] mb-4 rounded-xl bg-[#FFFDE7] border border-[#F5D547]/40 px-3 py-2">
      <strong>PDF “diretto” al modello:</strong> servirebbe inviare il file come immagini (vision API) o tramite
      <em>Files</em> + assistente: oggi usiamo il <strong>testo estratto</strong> dal PDF (più leggero e economico). Se il
      PDF ha colonne confuse, incolla il testo dalla fattura o correggi la <strong>Qtà</strong> nella schermata di revisione.
    </p>
    {#if fatturaErr}
      <p class="text-sm text-rose-600 mb-3">{fatturaErr}</p>
    {/if}
    <div class="space-y-3 mb-4">
      <div>
        <label class="block text-xs font-medium text-[#6B7280] mb-1" for="fattura-pdf">PDF fattura</label>
        <input
          id="fattura-pdf"
          type="file"
          accept=".pdf,application/pdf"
          bind:files={fatturaFile}
          class="block w-full text-sm text-[#6B7280] file:mr-3 file:rounded-xl file:border-0 file:bg-[#FFF3CD] file:px-4 file:py-2"
        />
      </div>
      <Button variant="secondary" size="sm" onclick={estraiTestoPdf} disabled={fatturaExtracting}>
        {#if fatturaExtracting}
          <Loader2 class="h-4 w-4 animate-spin" />
          Estrazione…
        {:else}
          Estrai testo dal PDF
        {/if}
      </Button>
      <div>
        <label class="block text-xs font-medium text-[#6B7280] mb-1" for="fattura-paste">Oppure incolla testo fattura</label>
        <textarea
          id="fattura-paste"
          bind:value={fatturaPaste}
          rows="8"
          class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm font-mono text-xs"
          placeholder="Testo grezzo dalla fattura…"
        ></textarea>
      </div>
    </div>
    <div class="flex justify-end gap-2 flex-wrap">
      <Button variant="ghost" onclick={() => (fatturaOpen = false)}>Chiudi</Button>
      <Button variant="primary" onclick={parseConAi} disabled={fatturaParsing}>
        {#if fatturaParsing}
          <Loader2 class="h-4 w-4 animate-spin" />
          Analisi AI…
        {:else}
          Analizza con AI
        {/if}
      </Button>
    </div>
  {:else}
    <p class="text-sm text-[#6B7280] mb-3">
      Documento: <strong>{fatturaParsedNumero || '—'}</strong> · Data: <strong>{fatturaParsedData || '—'}</strong>
    </p>
    {#if fatturaErr}
      <p class="text-sm text-rose-600 mb-3">{fatturaErr}</p>
    {/if}
    {#if catalogProducts.length === 0}
      <p class="text-sm text-amber-800 mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
        Nessun prodotto in anagrafica caricato: controlla la connessione e i permessi PocketBase su <code class="text-xs">products</code>.
        Puoi comunque chiudere e riaprire dopo aver ricaricato la pagina Magazzino.
      </p>
    {/if}
    <div class="grid sm:grid-cols-2 gap-3 mb-4">
      <div>
        <label class="block text-xs font-medium text-[#6B7280] mb-1" for="fattura-imp">Imponibile totale (€)</label>
        <input id="fattura-imp" type="text" bind:value={fatturaImponibile} class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-[#6B7280] mb-1" for="fattura-iva">IVA (€)</label>
        <input id="fattura-iva" type="text" bind:value={fatturaIva} class="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm" />
      </div>
    </div>
    <div class="overflow-x-auto max-h-72 overflow-y-auto border border-black/5 rounded-2xl mb-4">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-black/5 text-left text-xs text-[#6B7280]">
            <th class="px-2 py-2">Descrizione fattura</th>
            <th class="px-2 py-2">Qtà</th>
            <th class="px-2 py-2">€/u impon. (costo acquisto)</th>
            <th class="px-2 py-2">Imp. riga</th>
            <th class="px-2 py-2">Listino / margine</th>
            <th class="px-2 py-2">Prodotto ERP</th>
          </tr>
        </thead>
        <tbody>
          {#each fatturaRows as row}
            {@const pSel = catalogProducts.find((p) => p.id === row.prodottoId)}
            {@const listino = pSel ? Number(pSel.prezzo_listino) || 0 : 0}
            {@const cost = Number(row.prezzo_imponibile_unita) || 0}
            {@const marginePct =
              listino > 0 && cost >= 0 ? Math.round(((listino - cost) / listino) * 1000) / 10 : null}
            <tr class="border-b border-black/5 align-top">
              <td class="px-2 py-2 max-w-[200px]">
                <span class="text-xs">{row.descrizione}</span>
                <p class="text-[10px] text-[#9CA3AF] mt-1">
                  Imponibile unitario = liquido + accisa + contrassegni (per bottiglia)
                </p>
              </td>
              <td class="px-2 py-2 whitespace-nowrap">
                <input
                  type="number"
                  min="1"
                  step="1"
                  class="w-20 rounded-lg border border-black/10 px-1.5 py-1 text-xs font-medium"
                  value={row.quantita}
                  title="Correggi la Qtà se l’AI ha confuso con l’IVA"
                  oninput={(e) => {
                    const v = parseInt(e.currentTarget.value, 10);
                    if (!Number.isFinite(v) || v < 1) return;
                    row.quantita = v;
                    const pu = Number(row.prezzo_imponibile_unita) || 0;
                    if (pu > 0) row.imponibile_riga = Math.round(v * pu * 100) / 100;
                    fatturaRows = [...fatturaRows];
                    const sum = fatturaRows.reduce((s, r) => s + (Number(r.imponibile_riga) || 0), 0);
                    if (sum > 0) {
                      const prevImp = parseFloat(String(fatturaImponibile).replace(',', '.')) || 0;
                      const prevIva = parseFloat(String(fatturaIva).replace(',', '.')) || 0;
                      const rate = prevImp > 0 ? prevIva / prevImp : 0.22;
                      fatturaImponibile = String(Math.round(sum * 100) / 100);
                      fatturaIva = String(Math.round(sum * rate * 100) / 100);
                    }
                  }}
                />
              </td>
              <td class="px-2 py-2 whitespace-nowrap">{formatEuro(row.prezzo_imponibile_unita)}</td>
              <td class="px-2 py-2 whitespace-nowrap">{formatEuro(row.imponibile_riga)}</td>
              <td class="px-2 py-2 text-xs">
                {#if pSel && listino > 0}
                  <span class="text-[#1A1A1A]">{formatEuro(listino)}</span>
                  {#if marginePct !== null}
                    <span class="block mt-0.5 {marginePct >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
                      Margine {marginePct >= 0 ? '+' : ''}{marginePct}% sul listino
                    </span>
                  {/if}
                {:else}
                  <span class="text-[#9CA3AF]">—</span>
                {/if}
              </td>
              <td class="px-2 py-2">
                <select
                  class="w-full min-w-[140px] rounded-xl border border-black/10 px-2 py-1 text-xs"
                  bind:value={row.prodottoId}
                >
                  <option value="">— Scegli —</option>
                  {#each productsForInvoiceRow(row.descrizione) as p}
                    <option value={p.id}>{p.nome} ({p.sku})</option>
                  {/each}
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="flex justify-between gap-2 flex-wrap">
      <Button variant="ghost" onclick={() => (fatturaStep = 'input')}>Indietro</Button>
      <div class="flex gap-2">
        <Button variant="ghost" onclick={() => (fatturaOpen = false)}>Annulla</Button>
        <Button variant="primary" onclick={applicaFattura} disabled={fatturaSaving}>
          {fatturaSaving ? 'Applicazione…' : 'Carica giacenze + uscita'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>
